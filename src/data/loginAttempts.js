/**
 * Contatore dei tentativi di accesso falliti tenuto sul dispositivo.
 *
 * Serve in due casi: l'account non esiste (non c'è una riga su cui scrivere, e la risposta deve
 * restare identica a quella per una password sbagliata) e il database non ha ancora le colonne
 * `failed_login_attempts` / `locked_until` (script SQL non ancora eseguito). In tutti gli altri
 * casi il contatore sta sull'account, quindi vale su ogni dispositivo.
 */

import { registerFailure, isLocked } from '../utils/loginPolicy';
import { logWarn } from '../utils/logger';

const STORAGE_KEY = 'formatrack.loginAttempts';

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch (error) {
    logWarn('LoginAttempts', 'Contatore illeggibile: si riparte da zero', error);
    return {};
  }
};

const writeAll = (all) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (error) {
    logWarn('LoginAttempts', 'Impossibile salvare il contatore dei tentativi', error);
  }
};

/** Fine del blocco per questo nome utente, o `null` se non è bloccato. */
export const localLockedUntil = (key, now = new Date()) => {
  const state = readAll()[key];
  return state && isLocked(state.lockedUntil, now) ? state.lockedUntil : null;
};

/** Registra un tentativo fallito e restituisce lo stato aggiornato (vedi `registerFailure`). */
export const recordLocalFailure = (key, now = new Date()) => {
  const all = readAll();
  const next = registerFailure(all[key] || {}, now);
  all[key] = { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil };
  writeAll(all);
  return next;
};

/** Azzera il contatore (accesso riuscito o blocco tolto da un admin). */
export const clearLocalFailures = (key) => {
  const all = readAll();
  if (!(key in all)) return;
  delete all[key];
  writeAll(all);
};
