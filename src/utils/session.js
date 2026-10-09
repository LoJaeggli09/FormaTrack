/**
 * Gestione della sessione locale.
 *
 * Cosa risolve rispetto al salvataggio diretto di `currentUser` in localStorage:
 *  - non salva più NESSUN dato sensibile (niente hash password, niente ruolo):
 *    viene persistito solo l'id utente;
 *  - la sessione scade (scadenza assoluta), quindi non resta valida per sempre;
 *  - il contenuto è firmato (HMAC-SHA256), quindi una modifica a mano del
 *    localStorage invalida la sessione invece di essere accettata in silenzio.
 *
 * LIMITE NOTO — da tenere presente: in un'app puramente client la chiave di
 * firma deve stare sulla macchina dell'utente, quindi chi ha accesso al
 * dispositivo e sa cosa sta facendo può comunque ricostruire una sessione
 * valida per un altro id. La firma alza l'asticella, non è un confine di
 * sicurezza. L'unica difesa reale è spostare l'autorizzazione lato server
 * (Supabase Auth + Row Level Security), così anche una sessione falsificata
 * non otterrebbe dati a cui non ha diritto.
 * Per questo il ruolo viene SEMPRE riletto dal database a ogni avvio e non
 * viene mai preso da localStorage.
 */

import { logWarn } from './logger';

const SESSION_KEY = 'formatrack.session';
const DEVICE_KEY = 'formatrack.deviceKey';

/** Durata massima di una sessione salvata: dopo va rifatto il login. */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 ore

const subtle = () => (typeof window !== 'undefined' && window.crypto?.subtle) || null;

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** Chiave di firma generata una volta per installazione. */
const getDeviceKey = () => {
  let key = localStorage.getItem(DEVICE_KEY);
  if (!key) {
    const random = new Uint8Array(32);
    window.crypto.getRandomValues(random);
    key = toHex(random);
    localStorage.setItem(DEVICE_KEY, key);
  }
  return key;
};

/** Calcola la firma HMAC del payload. Restituisce null se WebCrypto non c'è. */
const sign = async (payloadJson) => {
  const crypto = subtle();
  if (!crypto) return null;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.importKey(
      'raw',
      encoder.encode(getDeviceKey()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.sign('HMAC', key, encoder.encode(payloadJson));
    return toHex(signature);
  } catch (err) {
    logWarn('Session', 'Firma della sessione non disponibile', err);
    return null;
  }
};

/**
 * Salva la sessione dopo un login riuscito.
 * @param {{ id: number|string }} user
 */
export const saveSession = async (user) => {
  if (!user?.id) return;
  const now = Date.now();
  const payload = {
    userId: user.id,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_MS,
  };
  const payloadJson = JSON.stringify(payload);
  const signature = await sign(payloadJson);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ payload, signature }));
};

/**
 * Legge la sessione salvata, verificandone firma e scadenza.
 * @returns {Promise<{ userId: number|string, expiresAt: number }|null>}
 *          null se assente, manomessa o scaduta (in questi casi viene ripulita)
 */
export const loadSession = async () => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (err) {
    clearSession();
    return null;
  }

  const { payload, signature } = stored || {};
  if (!payload?.userId || !payload?.expiresAt) {
    clearSession();
    return null;
  }

  // Verifica della firma — se WebCrypto è disponibile, una firma assente o
  // diversa significa localStorage modificato a mano: si scarta la sessione.
  if (subtle()) {
    const expected = await sign(JSON.stringify(payload));
    if (!signature || signature !== expected) {
      logWarn('Session', 'Sessione scartata: firma non valida');
      clearSession();
      return null;
    }
  }

  if (Date.now() > payload.expiresAt) {
    logWarn('Session', 'Sessione scaduta');
    clearSession();
    return null;
  }

  return payload;
};

/** Cancella la sessione salvata (logout, scadenza, manomissione). */
export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};
