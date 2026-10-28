import { supabase } from '../supabaseClient';
import { getSyncContext } from './syncContext';

/**
 * Tipi di evento tracciati nella tabella audit_log.
 * Usare sempre queste costanti per evitare typo.
 */
export const AUDIT_EVENTS = {
  LOGIN_SUCCESS:      'login_success',
  LOGIN_FAILED:       'login_failed',
  LOGOUT:             'logout',
  USER_CREATED:       'user_created',
  USER_DELETED:       'user_deleted',
  PASSWORD_RESET:     'password_reset',
  PASSWORD_CHANGED:   'password_changed',
  BULK_ASSIGN:        'bulk_assign',
  WORKSPACE_ARCHIVED: 'workspace_archived',
  WORKSPACE_RESTORED: 'workspace_restored',
  WORKSPACE_DELETED:  'workspace_deleted',
  ACCOUNT_LOCKED:     'account_locked',
  PASSWORD_EXPIRED:   'password_expired',
  USER_UNLOCKED:      'user_unlocked',
  ACTIVITY_CREATED:   'activity_created',
  ACTIVITY_UPDATED:   'activity_updated',
  ACTIVITY_DELETED:   'activity_deleted',
  ACTIVITY_STATUS:    'activity_status_changed',
  NOTE_CREATED:       'note_created',
  NOTE_UPDATED:       'note_updated',
  NOTE_DELETED:       'note_deleted',
  GRADE_CREATED:      'grade_created',
  GRADE_UPDATED:      'grade_updated',
  GRADE_DELETED:      'grade_deleted',
};

/** Famiglie di eventi, per il filtro del log nella schermata Gestione. */
export const AUDIT_GROUPS = {
  access: [
    AUDIT_EVENTS.LOGIN_SUCCESS, AUDIT_EVENTS.LOGIN_FAILED, AUDIT_EVENTS.LOGOUT,
    AUDIT_EVENTS.ACCOUNT_LOCKED, AUDIT_EVENTS.PASSWORD_EXPIRED,
    AUDIT_EVENTS.PASSWORD_CHANGED, AUDIT_EVENTS.PASSWORD_RESET,
  ],
  data: [
    AUDIT_EVENTS.ACTIVITY_CREATED, AUDIT_EVENTS.ACTIVITY_UPDATED, AUDIT_EVENTS.ACTIVITY_DELETED,
    AUDIT_EVENTS.ACTIVITY_STATUS,
    AUDIT_EVENTS.NOTE_CREATED, AUDIT_EVENTS.NOTE_UPDATED, AUDIT_EVENTS.NOTE_DELETED,
    AUDIT_EVENTS.GRADE_CREATED, AUDIT_EVENTS.GRADE_UPDATED, AUDIT_EVENTS.GRADE_DELETED,
  ],
  management: [
    AUDIT_EVENTS.USER_CREATED, AUDIT_EVENTS.USER_DELETED, AUDIT_EVENTS.BULK_ASSIGN,
    'user_archived', 'user_restored', AUDIT_EVENTS.USER_UNLOCKED,
    AUDIT_EVENTS.WORKSPACE_ARCHIVED, AUDIT_EVENTS.WORKSPACE_RESTORED, AUDIT_EVENTS.WORKSPACE_DELETED,
  ],
};

/**
 * Inserisce una riga nella tabella audit_log.
 *
 * Schema atteso su Supabase:
 *   CREATE TABLE audit_log (
 *     id            bigserial PRIMARY KEY,
 *     event         text      NOT NULL,
 *     actor_id      integer,
 *     actor_name    text,
 *     target_id     integer,
 *     target_name   text,
 *     details       jsonb,
 *     created_at    timestamptz NOT NULL DEFAULT now()
 *   );
 *
 * @param {object} params
 * @param {string} params.event       - Tipo evento (usa AUDIT_EVENTS)
 * @param {number|null} params.actorId   - ID utente che ha eseguito l'azione
 * @param {string|null} params.actorName - Nome utente che ha eseguito l'azione
 * @param {number|null} params.targetId  - ID utente su cui è stata eseguita l'azione
 * @param {string|null} params.targetName - Nome utente target
 * @param {object|null} params.details   - Dati aggiuntivi (JSON)
 */
export const writeAuditLog = async ({
  event,
  actorId = null,
  actorName = null,
  targetId = null,
  targetName = null,
  details = null,
}) => {
  try {
    const { error } = await supabase.from('audit_log').insert([{
      event,
      actor_id: actorId ? parseInt(actorId, 10) : null,
      actor_name: actorName || null,
      target_id: targetId ? parseInt(targetId, 10) : null,
      target_name: targetName || null,
      details: details || null,
    }]);
    if (error) {
      console.warn('[AuditLog] Scrittura fallita:', error.message);
    }
  } catch (err) {
    // Non bloccare mai l'operazione principale per un errore di audit
    console.warn('[AuditLog] Errore inatteso:', err.message);
  }
};

// ── Chi sta agendo ───────────────────────────────────────────────────────────
// Le funzioni dei dati (attività, note, voti) non ricevono l'utente come parametro:
// l'app lo dichiara una volta al login e il log lo legge da qui.

let currentActor = { id: null, name: null };

/** Dichiara l'utente collegato (`null` al logout). */
export const setAuditActor = (user) => {
  currentActor = { id: user?.id ?? null, name: user?.name ?? null };
};

export const getAuditActor = () => currentActor;

/**
 * Registra una modifica ai dati di un apprendista (creazione, modifica, eliminazione).
 *
 * Nei dettagli si tengono solo riferimenti brevi (id, data, categoria, materia…), mai il testo
 * di note o descrizioni: il log si legge da chi amministra e non deve diventare una copia dei dati.
 * Se la modifica è stata fatta offline e inviata dopo, i dettagli dicono quando è stata fatta.
 *
 * @param {object} params
 * @param {string} params.event             - AUDIT_EVENTS.*
 * @param {'activity'|'note'|'grade'} params.entity
 * @param {number|string|null} params.entityId
 * @param {number|string|null} params.studentId - apprendista a cui appartiene il dato
 * @param {object} [params.details]
 */
export const logDataChange = async ({ event, entity, entityId, studentId, details = {} }) => {
  const sync = getSyncContext();
  return writeAuditLog({
    event,
    actorId: currentActor.id,
    actorName: currentActor.name,
    targetId: studentId,
    details: {
      entity,
      entityId: entityId ?? null,
      ...details,
      ...(sync ? { queuedAt: new Date(sync.queuedAt).toISOString() } : {}),
    },
  });
};

/**
 * Legge le ultime N righe di audit_log, ordinate per data decrescente.
 * @param {number} limit - Numero di righe da leggere (default 200)
 * @returns {Promise<Array>}
 */
export const getAuditLog = async (limit = 200) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[AuditLog] Lettura fallita:', error.message);
    return [];
  }
  return data || [];
};
