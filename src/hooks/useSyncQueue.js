/**
 * Collegamento fra la coda di sincronizzazione offline e l'interfaccia.
 *
 * `useSyncQueue` (una volta sola, nella dashboard) tiene aggiornato lo stato della coda e avvia
 * l'invio all'apertura, quando la rete torna e a intervalli finché c'è qualcosa in attesa.
 * `useOnSynced` serve alle sezioni: le fa ricaricare quando delle modifiche sono arrivate al server.
 */

import { useState, useEffect, useRef } from 'react';
import {
  getQueueState, subscribeQueue, flushQueue, retryFailed, discardFailed, SYNC_EVENT,
} from '../data/offlineQueue';

/** Intervallo dei tentativi di invio mentre ci sono modifiche in attesa. */
const RETRY_MS = 30 * 1000;

/**
 * @param {boolean} [enabled]
 * @returns {{ pending: number, failed: number, flushing: boolean, retry: Function, discard: Function }}
 */
export const useSyncQueue = (enabled = true) => {
  const [state, setState] = useState(getQueueState());

  useEffect(() => subscribeQueue(setState), []);

  useEffect(() => {
    if (!enabled) return undefined;

    const attempt = () => { flushQueue(); };
    attempt(); // operazioni rimaste dall'ultima volta che l'app era aperta

    window.addEventListener('online', attempt);
    const timer = setInterval(() => {
      if (getQueueState().pending > 0) attempt();
    }, RETRY_MS);

    return () => {
      window.removeEventListener('online', attempt);
      clearInterval(timer);
    };
  }, [enabled]);

  return { ...state, retry: retryFailed, discard: discardFailed };
};

/** Esegue `callback` ogni volta che la coda ha consegnato delle modifiche al server. */
export const useOnSynced = (callback) => {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    const handler = () => saved.current();
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, []);
};
