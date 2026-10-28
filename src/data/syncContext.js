/**
 * Contesto dell'invio di una modifica fatta offline.
 *
 * Quando la coda di sincronizzazione ripete un'operazione, il log di audit deve sapere che
 * l'azione è stata fatta prima (quando l'utente era offline) e solo ora è arrivata al server.
 * Il contesto vale solo mentre l'operazione è in corso: il resto del codice non lo vede.
 */

let current = null;

/** Esegue `fn` dichiarando che l'operazione è stata accodata a `queuedAt`. */
export const withSyncContext = async (context, fn) => {
  const previous = current;
  current = context;
  try {
    return await fn();
  } finally {
    current = previous;
  }
};

/** @returns {{ queuedAt: number }|null} */
export const getSyncContext = () => current;
