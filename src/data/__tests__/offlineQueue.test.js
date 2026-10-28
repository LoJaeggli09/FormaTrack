/**
 * Coda di sincronizzazione offline: accodare, ripetere in ordine, sopravvivere al riavvio,
 * non perdere mai una modifica in silenzio.
 */
import {
  setQueueUser,
  getQueueState,
  getQueuedOperations,
  registerExecutor,
  writeOrQueue,
  flushQueue,
  retryFailed,
  discardFailed,
  overlayPending,
  subscribeQueue,
  SYNC_EVENT,
  __resetQueueForTests,
} from '../offlineQueue';

const NETWORK_DOWN = Object.assign(new Error('TypeError: Failed to fetch'), { name: 'TypeError' });
const SERVER_REJECTS = Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' });

const setOnline = (online) => {
  jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
};

/** Scrittura di prova: crea un'attività. */
const createActivity = (run, extra = {}) =>
  writeOrQueue({
    entity: 'activity',
    action: 'create',
    studentId: 1,
    args: [1, { description: 'prova' }],
    row: { studentId: 1, description: 'prova', date: '2026-05-01' },
    run,
    ...extra,
  });

const updateActivity = (id, run) =>
  writeOrQueue({ entity: 'activity', action: 'update', targetId: id, args: [id, { description: 'nuova' }], patch: { description: 'nuova' }, run });

const deleteActivity = (id, run) =>
  writeOrQueue({ entity: 'activity', action: 'delete', targetId: id, args: [id], run });

beforeEach(() => {
  localStorage.clear();
  __resetQueueForTests();
  jest.restoreAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  setOnline(true);
  setQueueUser(7);
});

afterAll(() => {
  jest.restoreAllMocks();
  window.dispatchEvent(new Event('online'));
});

describe('writeOrQueue', () => {
  test('online: esegue subito e non accoda nulla', async () => {
    const run = jest.fn().mockResolvedValue({ id: 5, description: 'prova' });

    const result = await createActivity(run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 5, description: 'prova' });
    expect(getQueueState().pending).toBe(0);
  });

  test('offline: non chiama il server, accoda e restituisce la riga come la vedrà la lista', async () => {
    setOnline(false);
    const run = jest.fn();

    const result = await createActivity(run);

    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ description: 'prova', _pending: true });
    expect(String(result.id)).toMatch(/^tmp_/);
    expect(getQueueState()).toMatchObject({ pending: 1, failed: 0 });
  });

  test('la rete cade durante la richiesta: la modifica va in coda invece di perdersi', async () => {
    const run = jest.fn().mockRejectedValue(NETWORK_DOWN);

    const result = await createActivity(run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(result._pending).toBe(true);
    expect(getQueueState().pending).toBe(1);
  });

  test('un rifiuto del server non si accoda: l\'errore arriva a chi ha chiamato', async () => {
    const run = jest.fn().mockRejectedValue(SERVER_REJECTS);

    await expect(createActivity(run)).rejects.toBe(SERVER_REJECTS);
    expect(getQueueState().pending).toBe(0);
  });

  test('senza un utente collegato non si accoda (e l\'errore di rete resta un errore)', async () => {
    setQueueUser(null);
    const run = jest.fn().mockRejectedValue(NETWORK_DOWN);

    await expect(createActivity(run)).rejects.toBe(NETWORK_DOWN);
    expect(getQueueState().pending).toBe(0);
  });

  test('una riga creata offline ha un id provvisorio: anche da online le sue modifiche vanno in coda', async () => {
    setOnline(false);
    const created = await createActivity(jest.fn());
    setOnline(true);
    const run = jest.fn();

    const result = await updateActivity(created.id, run);

    expect(run).not.toHaveBeenCalled();
    expect(result._pending).toBe(true);
    expect(getQueuedOperations().map((op) => op.action)).toEqual(['create', 'update']);
  });

  test('eliminare una riga creata offline e mai inviata cancella tutto, senza toccare il server', async () => {
    setOnline(false);
    const created = await createActivity(jest.fn());
    await updateActivity(created.id, jest.fn());

    const run = jest.fn();
    await expect(deleteActivity(created.id, run)).resolves.toBe(true);

    expect(run).not.toHaveBeenCalled();
    expect(getQueueState().pending).toBe(0);
  });

  test('eliminare una riga del server offline si accoda', async () => {
    setOnline(false);
    await deleteActivity(42, jest.fn());
    expect(getQueuedOperations()).toMatchObject([{ action: 'delete', targetId: 42 }]);
  });

  test('si può scegliere l\'id della riga (voti): resta quello, senza id provvisorio', async () => {
    setOnline(false);
    const result = await createActivity(jest.fn(), { clientId: '1718000000000' });
    expect(result.id).toBe('1718000000000');
  });
});

describe('persistenza', () => {
  test('la coda sopravvive al riavvio dell\'app', async () => {
    setOnline(false);
    await createActivity(jest.fn());
    expect(JSON.parse(localStorage.getItem('formatrack.syncQueue'))['7']).toHaveLength(1);

    // riavvio: stato in memoria perso, localStorage no
    __resetQueueForTests();
    setQueueUser(7);

    expect(getQueueState().pending).toBe(1);
    expect(getQueuedOperations()[0]).toMatchObject({ entity: 'activity', action: 'create' });
  });

  test('ogni utente ha la sua coda e il logout non la cancella', async () => {
    setOnline(false);
    await createActivity(jest.fn());

    setQueueUser(null);
    expect(getQueueState().pending).toBe(0);

    setQueueUser(8);
    expect(getQueueState().pending).toBe(0);

    setQueueUser(7);
    expect(getQueueState().pending).toBe(1);
  });

  test('una coda svuotata non lascia tracce', async () => {
    setOnline(false);
    const created = await createActivity(jest.fn());
    await deleteActivity(created.id, jest.fn());
    expect(JSON.parse(localStorage.getItem('formatrack.syncQueue') || '{}')['7']).toBeUndefined();
  });
});

describe('flushQueue', () => {
  test('ripete le operazioni nell\'ordine in cui sono state fatte e avvisa chi ascolta', async () => {
    const calls = [];
    registerExecutor('activity:create', async (args) => { calls.push(['create', args]); return { id: 501 }; });
    registerExecutor('activity:update', async (args) => { calls.push(['update', args]); return { id: args[0] }; });
    registerExecutor('activity:delete', async (args) => { calls.push(['delete', args]); return true; });

    setOnline(false);
    const created = await createActivity(jest.fn());
    await updateActivity(created.id, jest.fn());
    await deleteActivity(900, jest.fn());
    setOnline(true);

    const synced = jest.fn();
    window.addEventListener(SYNC_EVENT, synced);
    const summary = await flushQueue();
    window.removeEventListener(SYNC_EVENT, synced);

    expect(summary).toMatchObject({ sent: 3, failed: 0, offline: false });
    expect(calls.map((call) => call[0])).toEqual(['create', 'update', 'delete']);
    // la modifica fatta sulla riga provvisoria arriva con l'id vero assegnato dal server
    expect(calls[1][1][0]).toBe(501);
    expect(getQueueState().pending).toBe(0);
    expect(synced).toHaveBeenCalledTimes(1);
  });

  test('si ferma al primo errore di rete e conserva il resto', async () => {
    const executor = jest.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(NETWORK_DOWN);
    registerExecutor('activity:create', executor);

    setOnline(false);
    await createActivity(jest.fn());
    await createActivity(jest.fn());
    await createActivity(jest.fn());
    setOnline(true);

    const summary = await flushQueue();

    expect(summary).toMatchObject({ sent: 1, offline: true });
    expect(executor).toHaveBeenCalledTimes(2);
    expect(getQueueState()).toMatchObject({ pending: 2, failed: 0 });
  });

  test('un rifiuto del server segna la modifica come non riuscita e va avanti con le altre', async () => {
    registerExecutor('activity:update', jest.fn().mockRejectedValueOnce(SERVER_REJECTS));
    registerExecutor('activity:delete', jest.fn().mockResolvedValue(true));

    setOnline(false);
    await updateActivity(10, jest.fn());
    await deleteActivity(11, jest.fn());
    setOnline(true);

    const summary = await flushQueue();

    expect(summary).toMatchObject({ sent: 1, failed: 1 });
    const [failed] = getQueuedOperations();
    expect(failed).toMatchObject({ action: 'update', targetId: 10, status: 'failed' });
    expect(failed.error).toContain('multiple (or no) rows');
  });

  test('se una creazione è rifiutata, le modifiche successive sulla stessa riga non partono', async () => {
    const update = jest.fn().mockResolvedValue({ id: 1 });
    registerExecutor('activity:create', jest.fn().mockRejectedValue(SERVER_REJECTS));
    registerExecutor('activity:update', update);

    setOnline(false);
    const created = await createActivity(jest.fn());
    await updateActivity(created.id, jest.fn());
    setOnline(true);

    await flushQueue();

    expect(update).not.toHaveBeenCalled();
    expect(getQueueState()).toMatchObject({ pending: 0, failed: 2 });
  });

  test('retryFailed rimette in coda le rifiutate e riprova; discardFailed le scarta', async () => {
    const executor = jest.fn()
      .mockRejectedValueOnce(SERVER_REJECTS)
      .mockResolvedValueOnce(true);
    registerExecutor('activity:delete', executor);

    setOnline(false);
    await deleteActivity(20, jest.fn());
    setOnline(true);

    await flushQueue();
    expect(getQueueState().failed).toBe(1);

    await retryFailed();
    expect(executor).toHaveBeenCalledTimes(2);
    expect(getQueueState()).toMatchObject({ pending: 0, failed: 0 });

    // scartare
    registerExecutor('activity:delete', jest.fn().mockRejectedValue(SERVER_REJECTS));
    setOnline(false);
    await deleteActivity(21, jest.fn());
    setOnline(true);
    await flushQueue();
    expect(getQueueState().failed).toBe(1);

    discardFailed();
    expect(getQueueState()).toMatchObject({ pending: 0, failed: 0 });
  });

  test('anche un rifiuto, un nuovo tentativo e lo scarto avvisano chi ascolta, così le liste cambiano etichetta', async () => {
    registerExecutor('activity:delete', jest.fn().mockRejectedValue(SERVER_REJECTS));
    const synced = jest.fn();
    window.addEventListener(SYNC_EVENT, synced);

    setOnline(false);
    await deleteActivity(30, jest.fn());
    setOnline(true);

    await flushQueue();
    expect(synced).toHaveBeenCalledTimes(1);
    expect(synced.mock.calls[0][0].detail).toMatchObject({ sent: 0, rejected: 1 });

    synced.mockClear();
    discardFailed();
    expect(synced).toHaveBeenCalledTimes(1);
    expect(synced.mock.calls[0][0].detail).toMatchObject({ discarded: 1 });

    // senza niente da scartare non c'è nulla da aggiornare
    synced.mockClear();
    discardFailed();
    expect(synced).not.toHaveBeenCalled();

    window.removeEventListener(SYNC_EVENT, synced);
  });

  test('offline non prova nemmeno', async () => {
    const executor = jest.fn();
    registerExecutor('activity:delete', executor);
    setOnline(false);
    await deleteActivity(30, jest.fn());

    const summary = await flushQueue();

    expect(summary.offline).toBe(true);
    expect(executor).not.toHaveBeenCalled();
    expect(getQueueState().pending).toBe(1);
  });

  test('senza esecutore registrato non si perde: finisce tra le non riuscite', async () => {
    setOnline(false);
    await writeOrQueue({ entity: 'sconosciuta', action: 'create', args: [], row: {}, run: jest.fn() });
    setOnline(true);

    await flushQueue();

    expect(getQueueState().failed).toBe(1);
  });

  test('due invii contemporanei non ripetono due volte la stessa operazione', async () => {
    const executor = jest.fn().mockResolvedValue(true);
    registerExecutor('activity:delete', executor);
    setOnline(false);
    await deleteActivity(40, jest.fn());
    setOnline(true);

    await Promise.all([flushQueue(), flushQueue()]);

    expect(executor).toHaveBeenCalledTimes(1);
  });
});

describe('overlayPending e stato', () => {
  test('sovrappone alle liste le modifiche in coda', async () => {
    setOnline(false);
    await createActivity(jest.fn());
    await deleteActivity(2, jest.fn());

    const list = overlayPending('activity', [{ id: 1, studentId: 1 }, { id: 2, studentId: 1 }], { studentIds: [1] });

    expect(list.map((row) => row.id)).toEqual([1, expect.stringMatching(/^tmp_/)]);
    expect(list[1]._pending).toBe(true);
  });

  test('chi si iscrive riceve lo stato subito e a ogni cambiamento', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeQueue(listener);
    expect(listener).toHaveBeenLastCalledWith({ pending: 0, failed: 0, flushing: false });

    setOnline(false);
    await deleteActivity(50, jest.fn());
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ pending: 1 }));

    unsubscribe();
    listener.mockClear();
    await deleteActivity(51, jest.fn());
    expect(listener).not.toHaveBeenCalled();
  });
});
