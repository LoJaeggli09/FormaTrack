import {
  readThroughCache,
  getOfflineState,
  subscribeOfflineState,
  clearOfflineCache,
} from '../offlineCache';

beforeEach(() => {
  // clearOfflineCache azzera sia localStorage (chiavi con prefisso cache)
  // sia lo stato in memoria del modulo (isOffline, lastSyncAt).
  clearOfflineCache();
});

describe('readThroughCache', () => {
  it('quando la rete risponde, salva il risultato e segna lo stato come online', async () => {
    const fetcher = jest.fn().mockResolvedValue({ items: [1, 2, 3] });

    const result = await readThroughCache('notes:1', fetcher);

    expect(result).toEqual({ items: [1, 2, 3] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getOfflineState().isOffline).toBe(false);
    expect(getOfflineState().lastSyncAt).not.toBeNull();
  });

  it('se la rete fallisce ma esiste una copia in cache, la restituisce e passa in modalità offline', async () => {
    // Prima lettura: rete disponibile, popola la cache
    await readThroughCache('notes:2', jest.fn().mockResolvedValue({ items: ['a'] }));
    expect(getOfflineState().isOffline).toBe(false);

    // Seconda lettura sulla STESSA chiave: la rete cade
    const failingFetcher = jest.fn().mockRejectedValue(new Error('rete non disponibile'));
    const result = await readThroughCache('notes:2', failingFetcher);

    expect(result).toEqual({ items: ['a'] });
    expect(getOfflineState().isOffline).toBe(true);
  });

  it('se la rete fallisce e non esiste nessuna copia in cache, propaga l\'errore', async () => {
    const error = new Error('rete non disponibile');
    const failingFetcher = jest.fn().mockRejectedValue(error);

    await expect(readThroughCache('notes:mai-letta-prima', failingFetcher)).rejects.toThrow(
      'rete non disponibile'
    );
    expect(getOfflineState().isOffline).toBe(true);
  });

  it('una lettura online successiva su un\'altra chiave riporta lo stato online', async () => {
    // Va offline su una chiave...
    await readThroughCache('notes:3', jest.fn().mockResolvedValue({ v: 1 }));
    await readThroughCache('notes:3', jest.fn().mockRejectedValue(new Error('offline')));
    expect(getOfflineState().isOffline).toBe(true);

    // ...poi una lettura riuscita (anche su un'altra chiave) torna online
    await readThroughCache('notes:4', jest.fn().mockResolvedValue({ v: 2 }));
    expect(getOfflineState().isOffline).toBe(false);
  });
});

describe('clearOfflineCache', () => {
  it('svuota la cache: una lettura successiva senza rete non trova più nulla da servire', async () => {
    await readThroughCache('notes:5', jest.fn().mockResolvedValue({ v: 'presente' }));

    clearOfflineCache();

    expect(getOfflineState()).toEqual({ isOffline: false, lastSyncAt: null });
    await expect(
      readThroughCache('notes:5', jest.fn().mockRejectedValue(new Error('offline')))
    ).rejects.toThrow('offline');
  });
});

describe('subscribeOfflineState', () => {
  it('notifica i listener ad ogni cambiamento di stato e smette dopo il cleanup', async () => {
    // Popola prima la cache per 'notes:6': senza una copia locale la
    // richiesta successiva fallita propagherebbe l'errore invece di
    // limitarsi a segnalare lo stato offline.
    await readThroughCache('notes:6', jest.fn().mockResolvedValue({ v: 0 }));

    const listener = jest.fn();
    const unsubscribe = subscribeOfflineState(listener);

    // Chiamata immediata con lo stato corrente alla sottoscrizione
    expect(listener).toHaveBeenCalledTimes(1);

    await readThroughCache('notes:6', jest.fn().mockRejectedValue(new Error('offline')));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ isOffline: true }));

    unsubscribe();
    await readThroughCache('notes:7', jest.fn().mockResolvedValue({ v: 1 }));
    // Nessuna nuova chiamata dopo il cleanup
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
