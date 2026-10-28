/**
 * Regole di accesso: blocco dopo troppi tentativi falliti e scadenza della password.
 *
 * Qui c'è solo la regola (pura, testata). Dove si salvano i contatori è in `data/users.supabase.js`:
 * sull'account (colonne `failed_login_attempts`, `locked_until`, `password_changed_at`) quando il
 * database le ha, altrimenti sul dispositivo.
 *
 * LIMITE NOTO: l'app è un client che parla direttamente con Supabase con la chiave anonima, quindi
 * il blocco è applicato dal client e chi sa scrivere una query può aggirarlo (vedi README, sezione
 * Sicurezza). Alza l'asticella contro i tentativi a mano e gli errori, non è un confine di sicurezza:
 * quello richiede Supabase Auth o una funzione lato server.
 */

/** Tentativi falliti consecutivi dopo i quali l'account si blocca. */
export const MAX_FAILED_ATTEMPTS = 5;
/** Durata del blocco, in minuti. */
export const LOCK_MINUTES = 15;
/** Età massima di una password, in giorni. Oltre, al prossimo accesso va cambiata. */
export const PASSWORD_MAX_AGE_DAYS = 90;
/** Quanti giorni prima della scadenza compare il promemoria. */
export const PASSWORD_WARNING_DAYS = 7;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** True se il blocco è ancora in corso. */
export const isLocked = (lockedUntil, now = new Date()) => {
  const until = toDate(lockedUntil);
  return Boolean(until) && until.getTime() > now.getTime();
};

/** Minuti che mancano alla fine del blocco (arrotondati per eccesso, minimo 1 finché dura). */
export const lockMinutesLeft = (lockedUntil, now = new Date()) => {
  const until = toDate(lockedUntil);
  if (!until || until.getTime() <= now.getTime()) return 0;
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / MINUTE_MS));
};

/**
 * Registra un tentativo fallito.
 * Un blocco già scaduto riparte da zero; al raggiungimento del limite si blocca e il contatore si azzera.
 *
 * @param {{ failedAttempts?: number, lockedUntil?: string|Date|null }} state
 * @param {Date} [now]
 * @returns {{ failedAttempts: number, lockedUntil: string|null, locked: boolean, justLocked: boolean }}
 */
export const registerFailure = (state = {}, now = new Date()) => {
  if (isLocked(state.lockedUntil, now)) {
    return {
      failedAttempts: state.failedAttempts || 0,
      lockedUntil: toDate(state.lockedUntil).toISOString(),
      locked: true,
      justLocked: false,
    };
  }

  const attempts = (state.failedAttempts || 0) + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts: 0,
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * MINUTE_MS).toISOString(),
      locked: true,
      justLocked: true,
    };
  }
  return { failedAttempts: attempts, lockedUntil: null, locked: false, justLocked: false };
};

/** Giorni che mancano alla scadenza della password; `null` se non si conosce la data dell'ultimo cambio. */
export const passwordDaysLeft = (passwordChangedAt, now = new Date()) => {
  const changed = toDate(passwordChangedAt);
  if (!changed) return null;
  const expiresAt = changed.getTime() + PASSWORD_MAX_AGE_DAYS * DAY_MS;
  return Math.ceil((expiresAt - now.getTime()) / DAY_MS);
};

/** Scadenza della password come data, `null` se non si conosce l'ultimo cambio. */
export const passwordExpiryDate = (passwordChangedAt) => {
  const changed = toDate(passwordChangedAt);
  return changed ? new Date(changed.getTime() + PASSWORD_MAX_AGE_DAYS * DAY_MS) : null;
};

/** True se la password ha più di PASSWORD_MAX_AGE_DAYS giorni. Senza data nota non scade (la data parte al primo accesso). */
export const isPasswordExpired = (passwordChangedAt, now = new Date()) => {
  const left = passwordDaysLeft(passwordChangedAt, now);
  return left !== null && left <= 0;
};
