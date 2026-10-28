import { supabase } from '../supabaseClient';
import bcrypt from 'bcryptjs';
import { writeAuditLog, AUDIT_EVENTS } from './auditLog.supabase';
import { readThroughCache } from './offlineCache';
import { withOptionalColumns } from './schemaFallback';
import { localLockedUntil, recordLocalFailure, clearLocalFailures } from './loginAttempts';
import { registerFailure, isLocked, lockMinutesLeft, isPasswordExpired, LOCK_MINUTES } from '../utils/loginPolicy';
import { logWarn } from '../utils/logger';

/** Colonne introdotte per il blocco del login e la scadenza della password. */
const LOGIN_POLICY_COLUMNS = ['failed_login_attempts', 'locked_until', 'password_changed_at'];

const SALT_ROUNDS = 10;

// Restituisce true se la stringa è già un hash bcrypt
const isBcryptHash = (s) => typeof s === 'string' && s.startsWith('$2');

const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return role;
  const cleaned = role.trim().toLowerCase();
  // Normalizza ruoli con possibili varianti / traduzioni nel DB
  if (cleaned === 'app admin' || cleaned === 'app-admin' || cleaned === 'app_admin') {
    return 'app_admin';
  }
  return cleaned;
};


// Hash della password (solo se non già hashata)
const hashPassword = async (plain) => {
  if (isBcryptHash(plain)) return plain;
  return bcrypt.hash(plain, SALT_ROUNDS);
};

// Confronto password: gestisce sia hash bcrypt sia migrazione plain-text
const verifyPassword = async (plain, stored) => {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  // Password vecchia in chiaro — confronto diretto per la migrazione
  return plain.trim() === stored.trim();
};

// Normalizza un utente Supabase nel formato atteso dall'app
const normalizeUser = (u) => ({
  id: u.id,
  username: `${u.nome} ${u.cognome}`,
  name: `${u.nome} ${u.cognome}`,
  nome: u.nome,
  cognome: u.cognome,
  email: u.email,
  role: normalizeRole(u.ruolo),
  ruolo: normalizeRole(u.ruolo),
  stato: u.stato,
  // NB: l'hash della password non viene mai esposto all'app. Finiva nello stato
  // React e quindi in localStorage insieme alla sessione. Per verificare la
  // password corrente usare verifyUserPassword(), che rilegge l'hash dal DB.
  trainerId: u.trainer_id || null,

  workspaceId: u.workspace_id || null,
  studentNumber: u.numero_studente || null,
  formationYear: u.anno_formazione || null,
  apprenticeshipStart: u.data_inizio_apprendistato || null,
  apprenticeshipEnd: u.data_fine_apprendistato || null,
  archiviato: u.archiviato || false,
  mustChangePassword: u.must_change_password || false,
  // Blocco dopo troppi tentativi e scadenza della password (colonne facoltative: vedi LOGIN_POLICY_COLUMNS)
  failedLoginAttempts: u.failed_login_attempts || 0,
  lockedUntil: u.locked_until || null,
  isLocked: isLocked(u.locked_until),
  passwordChangedAt: u.password_changed_at || null,
  passwordExpired: isPasswordExpired(u.password_changed_at),
  settings: { language: 'it' },
});

// Converte dal formato app al formato colonne DB
const denormalizeUser = (user) => {
  const parts = (user.name || user.username || '').trim().split(' ');
  const nome = parts[0] || '';
  const cognome = parts.slice(1).join(' ') || '';
  const row = {
    ruolo: normalizeRole(user.role),
    trainer_id: user.trainerId ? parseInt(user.trainerId, 10) : null,
    inspector_id: user.inspectorId ? parseInt(user.inspectorId, 10) : null,
    workspace_id: user.workspaceId ? parseInt(user.workspaceId, 10) : null,
    numero_studente: user.studentNumber || null,
    anno_formazione: user.formationYear ? parseInt(user.formationYear, 10) : null,
    data_inizio_apprendistato: user.apprenticeshipStart || null,
    data_fine_apprendistato: user.apprenticeshipEnd || null,
  };
  if (user.nome || nome) row.nome = user.nome || nome;
  if (user.cognome || cognome) row.cognome = user.cognome || cognome;
  if (user.email) row.email = user.email;
  // La password si tocca solo se passata esplicitamente: un update parziale
  // non deve mai sovrascrivere l'hash esistente.
  const explicitPassword = user.password || user.password_hash;
  if (explicitPassword) row.password_hash = explicitPassword;
  return row;
};

// Leggi tutti gli utenti attivi (non archiviati)
export const getAllUsers = async (workspaceId = null) =>
  readThroughCache(`users:all:${workspaceId ?? 'any'}`, async () => {
    let query = supabase.from('users').select('*').eq('archiviato', false);
    if (workspaceId !== null) {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data.map(normalizeUser);
  });

// Leggi tutti gli utenti archiviati
export const getArchivedUsers = async (workspaceId = null) => {
  let query = supabase.from('users').select('*').eq('archiviato', true);
  if (workspaceId !== null) {
    query = query.eq('workspace_id', workspaceId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data.map(normalizeUser);
};

// Aggiungi un utente
export const addUser = async (user, actorId = null, actorName = null) => {
  const row = denormalizeUser(user);
  // I nuovi utenti ricevono sempre una password: quella indicata o quella predefinita
  row.password_hash = await hashPassword(row.password_hash || 'Abc123!');
  // I nuovi utenti partono con la password predefinita → devono cambiarla al primo accesso
  row.must_change_password = true;
  const { data, error } = await supabase.from('users').insert([row]).select().single();
  if (error) throw error;
  const created = normalizeUser(data);
  await writeAuditLog({
    event: AUDIT_EVENTS.USER_CREATED,
    actorId,
    actorName,
    targetId: created.id,
    targetName: created.name,
    details: { role: created.role },
  });
  return created;
};

// Aggiorna un utente
export const updateUser = async (user) => {
  const row = denormalizeUser(user);
  const { data, error } = await supabase
    .from('users')
    .update(row)
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw error;
  return normalizeUser(data);
};

// Archivia un utente (soft delete)
export const archiveUser = async (userId, actorId = null, actorName = null, targetName = null) => {
  const { error } = await supabase.from('users').update({ archiviato: true }).eq('id', userId);
  if (error) throw error;
  await writeAuditLog({
    event: 'user_archived',
    actorId,
    actorName,
    targetId: userId,
    targetName,
  });
  return true;
};

// Ripristina un utente archiviato
export const restoreUser = async (userId, actorId = null, actorName = null, targetName = null) => {
  const { error } = await supabase.from('users').update({ archiviato: false }).eq('id', userId);
  if (error) throw error;
  await writeAuditLog({
    event: 'user_restored',
    actorId,
    actorName,
    targetId: userId,
    targetName,
  });
  return true;
};

// Elimina un utente
export const deleteUser = async (userId, actorId = null, actorName = null, targetName = null) => {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) {
    // Vincolo di chiave esterna: l'utente è ancora referenziato altrove
    // (es. admin proprietario di un'area di lavoro, o formatore/ispettore
    // ancora assegnato ad apprendisti). Messaggio chiaro invece dell'errore Postgres grezzo.
    if (error.code === '23503') {
      throw new Error('Impossibile eliminare: questo utente è ancora collegato ad altri dati (es. area di lavoro, apprendisti assegnati). Riassegna o rimuovi prima questi collegamenti.');
    }
    throw error;
  }
  await writeAuditLog({
    event: AUDIT_EVENTS.USER_DELETED,
    actorId,
    actorName,
    targetId: userId,
    targetName,
  });
  return true;
};

// Restituisce tutti gli studenti (ruolo = 'student')
export const getAllStudents = async (workspaceId = null) => {
  let query = supabase.from('users').select('*').eq('ruolo', 'student');
  if (workspaceId !== null) {
    query = query.eq('workspace_id', workspaceId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data.map(normalizeUser);
};

// Restituisce tutti gli studenti di un formatore
export const getStudentsByTrainer = async (trainerId, workspaceId = null) =>
  readThroughCache(`users:trainer:${trainerId}:${workspaceId ?? 'any'}`, async () => {
    let query = supabase.from('users').select('*').eq('ruolo', 'student').eq('trainer_id', trainerId);
    if (workspaceId !== null) {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data.map(normalizeUser);
  });



// Aggiorna la password di un utente
export const updateUserPassword = async (userId, newPassword, actorId = null, actorName = null) => {
  const hashed = await hashPassword(newPassword);
  await withOptionalColumns(
    {
      password_hash: hashed,
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
      failed_login_attempts: 0,
      locked_until: null,
    },
    LOGIN_POLICY_COLUMNS,
    async (row) => {
      const { error } = await supabase.from('users').update(row).eq('id', userId);
      if (error) throw error;
    }
  );
  await writeAuditLog({
    event: AUDIT_EVENTS.PASSWORD_CHANGED,
    actorId: actorId || userId,
    actorName,
    targetId: userId,
    targetName: actorName,
  });
  return true;
};

// Reimposta la password di un utente alla password predefinita
export const resetUserPasswordToDefault = async (userId, actorId = null, actorName = null, targetName = null) => {
  const hashed = await hashPassword('Abc123!');
  await withOptionalColumns(
    {
      password_hash: hashed,
      must_change_password: true,
      password_changed_at: new Date().toISOString(),
      failed_login_attempts: 0,
      locked_until: null,
    },
    LOGIN_POLICY_COLUMNS,
    async (row) => {
      const { error } = await supabase.from('users').update(row).eq('id', userId);
      if (error) throw error;
    }
  );
  await writeAuditLog({
    event: AUDIT_EVENTS.PASSWORD_RESET,
    actorId,
    actorName,
    targetId: userId,
    targetName,
  });
  return true;
};

/**
 * Verifica la password attuale di un utente rileggendo l'hash dal database.
 * Va usata al posto di confronti con dati tenuti nello stato dell'app: l'hash
 * bcrypt non è più esposto dal client.
 * @param {number|string} userId
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
export const verifyUserPassword = async (userId, plainPassword) => {
  const { data, error } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return verifyPassword(String(plainPassword ?? ''), data.password_hash || '');
};

// Recupera un singolo utente per id (usato per ricostruire la sessione all'avvio).
// Passa dalla cache così, senza rete, l'app riparte in sola lettura invece di
// buttare fuori l'utente.
export const getUserById = async (userId) =>
  readThroughCache(`users:byId:${userId}`, async () => {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return normalizeUser(data);
  });

// Restituisce il formatore di uno studente
export const getTrainerForStudent = async (studentId) => {
  const { data: student, error: sErr } = await supabase
    .from('users')
    .select('trainer_id')
    .eq('id', parseInt(studentId, 10))
    .maybeSingle();
  if (sErr || !student?.trainer_id) return null;
  const { data: trainer, error: tErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', student.trainer_id)
    .maybeSingle();
  if (tErr || !trainer) return null;
  return normalizeUser(trainer);
};

/**
 * Errore per un account bloccato: porta il momento in cui si sblocca e i minuti che mancano.
 * `contactSupport` è vero per l'admin di un'area di lavoro: sopra di lui c'è solo il supporto FormaTrack.
 */
const accountLockedError = (lockedUntil, now, role = null) => {
  const error = new Error('ACCOUNT_LOCKED');
  error.code = 'ACCOUNT_LOCKED';
  error.lockedUntil = lockedUntil;
  error.minutesLeft = lockMinutesLeft(lockedUntil, now) || LOCK_MINUTES;
  error.contactSupport = role === 'admin';
  return error;
};

/**
 * Registra una password sbagliata. Il contatore sta sull'account (vale su ogni dispositivo) se il
 * database ha le colonne, altrimenti sul dispositivo. Un errore nel registrarlo non blocca il login.
 */
const recordLoginFailure = async (u, key, now) => {
  const hasColumns = Object.prototype.hasOwnProperty.call(u, 'failed_login_attempts')
    && Object.prototype.hasOwnProperty.call(u, 'locked_until');
  if (!hasColumns) return recordLocalFailure(key, now);

  const next = registerFailure({ failedAttempts: u.failed_login_attempts, lockedUntil: u.locked_until }, now);
  const { error } = await supabase
    .from('users')
    .update({ failed_login_attempts: next.failedAttempts, locked_until: next.lockedUntil })
    .eq('id', u.id);
  if (error) {
    logWarn('Auth', 'Contatore dei tentativi non aggiornato', error);
    return { ...next, locked: false, justLocked: false };
  }

  if (next.justLocked) {
    await writeAuditLog({
      event: AUDIT_EVENTS.ACCOUNT_LOCKED,
      actorName: `${u.nome} ${u.cognome}`,
      targetId: u.id,
      targetName: `${u.nome} ${u.cognome}`,
      details: { minutes: LOCK_MINUTES },
    });
  }
  return next;
};

/** Dopo un accesso riuscito: contatori a zero e, se manca, parte la data dell'ultimo cambio password. */
const clearLoginFailures = async (u, key, now) => {
  clearLocalFailures(key);

  const update = {};
  if ((u.failed_login_attempts || 0) > 0) update.failed_login_attempts = 0;
  if (u.locked_until) update.locked_until = null;
  if (Object.prototype.hasOwnProperty.call(u, 'password_changed_at') && !u.password_changed_at) {
    update.password_changed_at = now.toISOString();
  }
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase.from('users').update(update).eq('id', u.id);
  if (error) logWarn('Auth', 'Contatori di accesso non azzerati', error);
};

/** Toglie subito il blocco di un account (azione di un admin). */
export const unlockUser = async (userId, actorId = null, actorName = null, targetName = null) => {
  await withOptionalColumns(
    { failed_login_attempts: 0, locked_until: null },
    LOGIN_POLICY_COLUMNS,
    async (row) => {
      const { error } = await supabase.from('users').update(row).eq('id', userId);
      if (error) throw error;
    }
  );
  await writeAuditLog({
    event: AUDIT_EVENTS.USER_UNLOCKED,
    actorId,
    actorName,
    targetId: userId,
    targetName,
  });
  return true;
};

// Autentica un utente (username = nome + cognome oppure email)
export const authenticateUser = async (username, password) => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;

  const normalized = username.trim().replace(/\s+/g, ' ').toLowerCase();

  const u = data.find((user) => {
    const fullName = `${user.nome} ${user.cognome}`.trim().replace(/\s+/g, ' ').toLowerCase();
    const email = (user.email || '').toLowerCase();
    return fullName === normalized || email === normalized;
  });

  const now = new Date();

  // Nome sconosciuto: stessa risposta di una password sbagliata (non si rivela chi esiste),
  // contando i tentativi sul dispositivo.
  if (!u) {
    const state = recordLocalFailure(normalized, now);
    if (state.locked) throw accountLockedError(state.lockedUntil, now);
    return null;
  }

  // L'app admin non si blocca mai: se perdesse l'accesso non ci sarebbe nessuno a poterlo ripristinare.
  const role = normalizeRole(u.ruolo);
  const canBeLocked = role !== 'app_admin';

  const lockedUntil = !canBeLocked ? null
    : isLocked(u.locked_until, now) ? u.locked_until : localLockedUntil(normalized, now);
  if (lockedUntil) throw accountLockedError(lockedUntil, now, role);

  const match = await verifyPassword(password, u.password_hash || '');
  if (!match) {
    if (!canBeLocked) return null;
    const state = await recordLoginFailure(u, normalized, now);
    if (state.locked) throw accountLockedError(state.lockedUntil, now, role);
    return null;
  }

  await clearLoginFailures(u, normalized, now);
  const normalizedUser = normalizeUser(u);
  // La scadenza parte dal primo accesso dopo l'introduzione della regola: chi non ha una data la riceve ora.
  if (Object.prototype.hasOwnProperty.call(u, 'password_changed_at') && !u.password_changed_at) {
    normalizedUser.passwordChangedAt = now.toISOString();
  }

  // Migrazione trasparente: se la password era in chiaro, la hashiamo e forziamo cambio password
  if (!isBcryptHash(u.password_hash)) {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    await supabase.from('users').update({ password_hash: hashed, must_change_password: true }).eq('id', u.id);
    normalizedUser.mustChangePassword = true;
  }

  // Forza cambio password se il flag DB è attivo OPPURE (fallback) la password è quella predefinita
  if (normalizedUser.mustChangePassword || password === 'Abc123!') {
    normalizedUser.mustChangePassword = true;
  }
  if (normalizedUser.passwordExpired) {
    await writeAuditLog({
      event: AUDIT_EVENTS.PASSWORD_EXPIRED,
      actorId: normalizedUser.id,
      actorName: normalizedUser.name,
      targetId: normalizedUser.id,
      targetName: normalizedUser.name,
    });
  }
  await writeAuditLog({
    event: AUDIT_EVENTS.LOGIN_SUCCESS,
    actorId: normalizedUser.id,
    actorName: normalizedUser.name,
    details: { role: normalizedUser.role },
  });
  return normalizedUser;
};

// Migra tutti gli utenti con password in chiaro: imposta password predefinita hashata e forza cambio
// Da chiamare una sola volta da un admin (es. dalla sezione Impostazioni > Utenti)
export const migrateAllPlaintextPasswords = async (actorId = null, actorName = null) => {
  const { data, error } = await supabase.from('users').select('id, nome, cognome, password_hash');
  if (error) throw error;

  const toMigrate = data.filter((u) => !isBcryptHash(u.password_hash || ''));
  if (toMigrate.length === 0) return { migrated: 0 };

  const defaultHashed = await bcrypt.hash('Abc123!', SALT_ROUNDS);

  for (const u of toMigrate) {
    await supabase
      .from('users')
      .update({ password_hash: defaultHashed, must_change_password: true })
      .eq('id', u.id);

    await writeAuditLog({
      event: AUDIT_EVENTS.PASSWORD_RESET,
      actorId,
      actorName,
      targetId: u.id,
      targetName: `${u.nome} ${u.cognome}`,
      details: { reason: 'plain-text password migration' },
    });
  }

  return { migrated: toMigrate.length };
};
