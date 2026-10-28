/**
 * Coda di sincronizzazione offline: persistenza, invio e stato.
 *
 * Le regole pure (come si accoda, come si sovrappone alle liste) sono in `utils/syncQueue.js`.
 *
 * Come funziona una scrittura (`writeOrQueue`):
 *  1. online → si esegue subito, come sempre;
 *  2. offline, oppure la rete cade durante la richiesta → l'operazione va in coda (localStorage,
 *     una coda per utente), la lista mostra la riga come "in attesa di invio";
 *  3. al ritorno della rete `flushQueue` ripete le operazioni nell'ordine in cui sono state fatte.
 *     Un errore di rete ferma l'invio e si riprova più tardi; un rifiuto del server (permessi,
 *     riga già eliminata, vincoli) segna l'operazione come non riuscita e la mostra all'utente,
 *     che può ritentare o scartarla — non si perde mai in silenzio.
 *
 * La coda sopravvive al logout (altrimenti un logout per inattività farebbe perdere il lavoro):
 * le operazioni restano nel dispositivo e partono al prossimo accesso con lo stesso account.
 * Passano solo dati che l'utente ha già il diritto di scrivere: la coda non aggira nessun permesso,
 * perché ogni operazione viene ripetuta dal client con i permessi normali.
 */

import { getOfflineState } from './offlineCache';
import { withSyncContext } from './syncContext';
import {
  isNetworkError,
  planEnqueue,
  remapTarget,
  applyPending,
  newTempId,
  isTempId,
  queueCounts,
} from '../utils/syncQueue';
import { logWarn } from '../utils/logger';

const STORAGE_KEY = 'formatrack.syncQueue';

/**
 * Evento sulla finestra: la coda è cambiata in modo visibile nelle liste (operazione arrivata al server,
 * rifiutata, riprovata o scartata). Le sezioni si ricaricano per mostrare le righe con lo stato giusto.
 */
export const SYNC_EVENT = 'formatrack:synced';

const notifyChanged = (detail) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail }));
};

let currentUserId = null;
let queue = [];
let flushing = false;
const inFlight = new Set();
const executors = new Map();
const listeners = new Set();
let snapshot = { pending: 0, failed: 0, flushing: false };

// ── Persistenza ───────────────────────────────────────────────────────────────

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch (error) {
    logWarn('SyncQueue', 'Coda illeggibile: si riparte da una coda vuota', error);
    return {};
  }
};

const persist = () => {
  if (currentUserId === null) return;
  try {
    const all = readAll();
    if (queue.length === 0) delete all[currentUserId];
    else all[currentUserId] = queue;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (error) {
    // Quota piena: la coda resta in memoria finché l'app è aperta.
    logWarn('SyncQueue', 'Impossibile salvare la coda sul dispositivo', error);
  }
};

const updateSnapshot = () => {
  const counts = queueCounts(queue);
  snapshot = { ...counts, flushing };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      logWarn('SyncQueue', 'Listener in errore', error);
    }
  });
};

// ── Stato e utente ────────────────────────────────────────────────────────────

/** Indica per quale utente si accoda e si invia. `null` al logout (la coda resta salvata). */
export const setQueueUser = (userId) => {
  const next = userId === undefined || userId === null ? null : String(userId);
  if (next === currentUserId) return;
  currentUserId = next;
  queue = next === null ? [] : readAll()[next] || [];
  updateSnapshot();
};

/** @returns {{ pending: number, failed: number, flushing: boolean }} */
export const getQueueState = () => snapshot;

export const subscribeQueue = (listener) => {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
};

/** Elenco delle operazioni in coda (copia di sola lettura, per l'interfaccia e i test). */
export const getQueuedOperations = () => queue.map((op) => ({ ...op }));

/** Registra come si esegue un tipo di operazione (`activity:create`, `note:delete`, …). */
export const registerExecutor = (key, executor) => {
  executors.set(key, executor);
};

/** Sovrappone le operazioni in coda a una lista di un tipo di dato. */
export const overlayPending = (entity, list, options = {}) => applyPending(list, queue, { entity, ...options });

// ── Accodare ─────────────────────────────────────────────────────────────────

const isOfflineNow = () =>
  getOfflineState().isOffline || (typeof navigator !== 'undefined' && navigator.onLine === false);

const enqueueOperation = (partial) => {
  const op = {
    id: `op_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    status: 'pending',
    error: null,
    ...partial,
  };
  const { queue: next, cancelled } = planEnqueue(queue, op, inFlight);
  queue = next;
  persist();
  updateSnapshot();
  return { op, cancelled };
};

/**
 * Esegue una scrittura online oppure, se non c'è rete, la mette in coda.
 *
 * @param {object} spec
 * @param {string} spec.entity          - SYNC_ENTITY.*
 * @param {'create'|'update'|'delete'} spec.action
 * @param {*} [spec.targetId]           - id della riga (update/delete)
 * @param {*} [spec.clientId]           - id scelto dal client per una creazione (altrimenti provvisorio)
 * @param {number|string|null} [spec.studentId] - apprendista a cui appartiene la riga
 * @param {Array} spec.args             - argomenti con cui ripetere l'operazione online
 * @param {object} [spec.row]           - riga completa, per una creazione
 * @param {object} [spec.patch]         - campi modificati, per un aggiornamento
 * @param {() => Promise<*>} spec.run   - l'operazione online
 */
export const writeOrQueue = async (spec) => {
  const { entity, action, studentId = null, args, row = null, patch = null, run } = spec;
  const canQueue = currentUserId !== null;
  // Una riga creata offline ha ancora un id provvisorio: il server non la conosce, si accoda sempre.
  const onlyInQueue = action !== 'create' && isTempId(spec.targetId);

  if (!canQueue || (!onlyInQueue && !isOfflineNow())) {
    try {
      return await run();
    } catch (error) {
      if (!canQueue || !isNetworkError(error)) throw error;
      logWarn('SyncQueue', 'Rete non raggiungibile: la modifica va in coda', error);
    }
  }

  const targetId = action === 'create' ? (spec.clientId ?? newTempId()) : spec.targetId;
  const { cancelled } = enqueueOperation({ entity, action, targetId, studentId, args, row, patch });

  if (cancelled || action === 'delete') return true;
  if (action === 'create') return { ...row, id: targetId, _pending: true };
  return { id: targetId, ...patch, _pending: true };
};

// ── Inviare ──────────────────────────────────────────────────────────────────

const markFailed = (opId, message) => {
  const failed = queue.find((op) => op.id === opId);
  if (!failed) return;
  queue = queue.map((op) => {
    if (op.id === opId) return { ...op, status: 'failed', error: message };
    // Le operazioni successive sulla stessa riga dipendono da questa: non avrebbero senso da sole.
    if (op.entity === failed.entity && String(op.targetId) === String(failed.targetId) && op.status !== 'failed') {
      return { ...op, status: 'failed', error: 'Dipende da una modifica non riuscita' };
    }
    return op;
  });
};

/**
 * Invia in ordine le operazioni in coda. Si ferma al primo errore di rete.
 * @returns {Promise<{ sent: number, failed: number, offline: boolean }>}
 */
export const flushQueue = async () => {
  if (flushing || currentUserId === null) return { sent: 0, failed: queueCounts(queue).failed, offline: false };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, failed: queueCounts(queue).failed, offline: true };
  }

  const owner = currentUserId;
  let sent = 0;
  let rejected = 0;
  let offline = false;
  flushing = true;
  updateSnapshot();

  try {
    for (;;) {
      const next = queue.find((op) => op.status !== 'failed');
      if (!next) break;

      const executor = executors.get(`${next.entity}:${next.action}`);
      if (!executor) {
        markFailed(next.id, 'Operazione non supportata');
        rejected += 1;
        persist();
        continue;
      }

      inFlight.add(next.id);
      try {
        const result = await withSyncContext({ queuedAt: next.createdAt }, () => executor(next.args));
        queue = queue.filter((op) => op.id !== next.id);
        sent += 1;
        if (next.action === 'create' && result?.id !== undefined && String(result.id) !== String(next.targetId)) {
          queue = remapTarget(queue, next.entity, next.targetId, result.id);
        }
      } catch (error) {
        if (isNetworkError(error)) {
          offline = true;
          break;
        }
        markFailed(next.id, error?.message || String(error));
        rejected += 1;
      } finally {
        inFlight.delete(next.id);
        persist();
        updateSnapshot();
      }

      if (currentUserId !== owner) break;
    }
  } finally {
    flushing = false;
    persist();
    updateSnapshot();
  }

  if (sent > 0 || rejected > 0) notifyChanged({ sent, rejected });
  return { sent, failed: queueCounts(queue).failed, offline };
};

/** Rimette in coda le operazioni rifiutate e riprova subito. */
export const retryFailed = async () => {
  queue = queue.map((op) => (op.status === 'failed' ? { ...op, status: 'pending', error: null } : op));
  persist();
  updateSnapshot();
  notifyChanged({ retried: true });
  return flushQueue();
};

/** Scarta le operazioni rifiutate dal server: le modifiche relative non arriveranno mai. */
export const discardFailed = () => {
  const before = queue.length;
  queue = queue.filter((op) => op.status !== 'failed');
  persist();
  updateSnapshot();
  if (queue.length !== before) notifyChanged({ discarded: before - queue.length });
};

/** Solo per i test: azzera lo stato in memoria (gli esecutori restano: sono il collegamento fisso con i moduli dei dati). */
export const __resetQueueForTests = () => {
  currentUserId = null;
  queue = [];
  flushing = false;
  inFlight.clear();
  listeners.clear();
  snapshot = { pending: 0, failed: 0, flushing: false };
};
