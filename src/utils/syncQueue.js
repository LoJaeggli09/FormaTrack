/**
 * Coda di sincronizzazione offline — la parte pura (nessun accesso a rete o a localStorage).
 *
 * Senza rete le modifiche a attività, note, voti, eventi e assenze non si perdono e non
 * bloccano l'app: finiscono in una coda, restano visibili nelle liste ("in attesa di invio")
 * e partono in ordine appena la rete torna. Qui ci sono le regole: come si accoda, come si
 * sovrappongono le modifiche in coda alle liste lette dal server, come si riconosce un errore di rete.
 * La persistenza e l'invio sono in `data/offlineQueue.js`.
 */

/** Tipi di dato che si possono scrivere offline. */
export const SYNC_ENTITY = {
  ACTIVITY: 'activity',
  NOTE: 'note',
  GRADE: 'grade',
  EVENT: 'event',
  ABSENCE: 'absence',
};

const NETWORK_ERROR = /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|err_internet_disconnected|err_network/i;

/**
 * Errore di rete (nessuna risposta dal server), da distinguere da un rifiuto del server
 * (permessi, vincoli, riga mancante): solo il primo si può ritentare più tardi.
 * @param {{ name?: string, message?: string, details?: string }|null} error
 */
export const isNetworkError = (error) => {
  if (!error) return false;
  return NETWORK_ERROR.test(`${error.name || ''} ${error.message || ''} ${error.details || ''}`);
};

const TEMP_PREFIX = 'tmp_';

/** Id provvisorio di una riga creata offline, finché il server non ne assegna uno vero. */
export const newTempId = () => `${TEMP_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const isTempId = (id) => typeof id === 'string' && id.startsWith(TEMP_PREFIX);

const sameId = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

const sameTarget = (a, b) => a.entity === b.entity && sameId(a.targetId, b.targetId);

/**
 * Aggiunge un'operazione alla coda.
 * Eliminare una riga che esiste solo in coda (creata offline e mai inviata) non ha senso da
 * mandare al server: si cancellano la creazione e tutto ciò che la riguardava.
 *
 * @param {Array} queue
 * @param {object} op                    - { entity, action, targetId, ... }
 * @param {Set<string>} [inFlightIds]    - id delle operazioni già in invio (non si possono annullare)
 * @returns {{ queue: Array, cancelled: boolean }}
 */
export const planEnqueue = (queue, op, inFlightIds = new Set()) => {
  if (op.action === 'delete') {
    const pendingCreate = queue.find(
      (item) => item.action === 'create' && sameTarget(item, op) && !inFlightIds.has(item.id)
    );
    if (pendingCreate) {
      return { queue: queue.filter((item) => !sameTarget(item, op)), cancelled: true };
    }
  }
  return { queue: [...queue, op], cancelled: false };
};

/**
 * Dopo che il server ha assegnato un id vero a una riga creata offline, le operazioni ancora
 * in coda che la riguardano passano al nuovo id.
 */
export const remapTarget = (queue, entity, fromId, toId) =>
  queue.map((item) => {
    if (item.entity !== entity || !sameId(item.targetId, fromId)) return item;
    const args = Array.isArray(item.args) ? [...item.args] : item.args;
    if (Array.isArray(args) && sameId(args[0], fromId)) args[0] = toId;
    return { ...item, targetId: toId, args };
  });

/**
 * Sovrappone le operazioni in coda a una lista letta dal server (o dalla cache):
 * creazioni aggiunte, modifiche applicate, eliminazioni tolte. Le righe toccate sono marcate
 * `_pending` (e `_failed` se l'invio è stato rifiutato dal server).
 *
 * @param {Array} list
 * @param {Array} ops
 * @param {{ entity: string, studentIds?: Array<number|string>|null, sort?: (a, b) => number }} options
 */
export const applyPending = (list, ops, { entity, studentIds = null, sort = null }) => {
  const relevant = ops.filter((op) => op.entity === entity);
  if (relevant.length === 0) return list;

  const wanted = studentIds ? new Set(studentIds.map(String)) : null;
  let result = [...list];

  relevant.forEach((op) => {
    const flags = { _pending: true, ...(op.status === 'failed' ? { _failed: true } : {}) };

    if (op.action === 'create') {
      if (wanted && !wanted.has(String(op.studentId))) return;
      if (result.some((row) => sameId(row.id, op.targetId))) return;
      result.push({ ...op.row, id: op.targetId, ...flags });
    } else if (op.action === 'update') {
      result = result.map((row) => (sameId(row.id, op.targetId) ? { ...row, ...op.patch, ...flags } : row));
    } else if (op.action === 'delete') {
      result = result.filter((row) => !sameId(row.id, op.targetId));
    }
  });

  return sort ? result.sort(sort) : result;
};

/** Conteggi per l'interfaccia. */
export const queueCounts = (queue) => ({
  pending: queue.filter((op) => op.status !== 'failed').length,
  failed: queue.filter((op) => op.status === 'failed').length,
});
