/**
 * Cache locale in sola lettura.
 *
 * Ogni lettura passa da readThroughCache(): se Supabase risponde, il risultato
 * viene salvato in localStorage; se la rete non c'è, si restituisce l'ultima
 * copia salvata invece di una schermata vuota.
 *
 * La cache è SOLO in lettura: le scritture non vengono messe in coda. Quando
 * l'app sta servendo dati dalla cache passa in modalità sola consultazione, così
 * nessuno crede di aver salvato qualcosa che in realtà non è mai partito.
 */

import { logWarn } from '../utils/logger';

const CACHE_PREFIX = 'formatrack.cache.';
const STATE_KEY = 'formatrack.cache.lastSync';

let isServingFromCache = false;
let lastSyncAt = Number(localStorage.getItem(STATE_KEY)) || null;
const listeners = new Set();

const notify = () => {
  const state = getOfflineState();
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (err) {
      logWarn('OfflineCache', 'Listener in errore', err);
    }
  });
};

/**
 * Stato corrente della connessione ai dati.
 * @returns {{ isOffline: boolean, lastSyncAt: number|null }}
 */
export const getOfflineState = () => ({
  isOffline: isServingFromCache,
  lastSyncAt,
});

/**
 * Registra un listener sullo stato offline.
 * @param {(state: { isOffline: boolean, lastSyncAt: number|null }) => void} listener
 * @returns {() => void} funzione di cleanup
 */
export const subscribeOfflineState = (listener) => {
  listeners.add(listener);
  listener(getOfflineState());
  return () => listeners.delete(listener);
};

const setServingFromCache = (value) => {
  if (isServingFromCache === value) return;
  isServingFromCache = value;
  notify();
};

const readCache = (key) => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logWarn('OfflineCache', `Cache illeggibile per "${key}"`, err);
    return null;
  }
};

const writeCache = (key, data) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch (err) {
    // Quota superata: la cache è un di più, l'app deve continuare a funzionare.
    logWarn('OfflineCache', `Impossibile salvare la cache per "${key}"`, err);
  }
};

/**
 * Esegue una lettura di rete salvandone l'esito in cache; in caso di errore
 * restituisce l'ultima copia disponibile.
 *
 * @template T
 * @param {string} key      - Chiave di cache (deve includere gli id: es. `notes:12`)
 * @param {() => Promise<T>} fetcher - La lettura Supabase da eseguire
 * @returns {Promise<T>}
 * @throws se la rete fallisce e non esiste nessuna copia in cache
 */
export const readThroughCache = async (key, fetcher) => {
  try {
    const data = await fetcher();
    writeCache(key, data);
    lastSyncAt = Date.now();
    localStorage.setItem(STATE_KEY, String(lastSyncAt));
    setServingFromCache(false);
    return data;
  } catch (error) {
    const cached = readCache(key);
    if (!cached) {
      // Nessuna copia locale: l'errore deve arrivare al chiamante.
      setServingFromCache(true);
      throw error;
    }
    logWarn('OfflineCache', `Rete non disponibile, servo la cache per "${key}"`, error);
    setServingFromCache(true);
    return cached.data;
  }
};

/** Svuota tutta la cache locale (usato al logout). */
export const clearOfflineCache = () => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  lastSyncAt = null;
  setServingFromCache(false);
};

// Il browser segnala la perdita di rete prima che una query fallisca: usiamolo
// per mostrare subito il banner, senza aspettare il timeout di Supabase.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => setServingFromCache(true));
  window.addEventListener('online', () => setServingFromCache(false));
}
