/**
 * Tolleranza alle migrazioni non ancora eseguite.
 *
 * Le colonne e le tabelle introdotte con la v2.1 (validazione attività, note
 * strutturate, ricorrenze, assenze, allegati) vivono in script SQL che l'utente
 * deve lanciare a mano su Supabase. Finché non lo fa, l'app deve continuare a
 * funzionare come prima invece di rompersi su ogni salvataggio: qui si
 * riconoscono gli errori "colonna/tabella mancante" e si degrada con grazia.
 */

import { logWarn } from '../utils/logger';

const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

const messageOf = (error) =>
  `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

/** Errore Postgres/PostgREST per una colonna che non esiste ancora. */
export const isMissingColumnError = (error) => {
  if (!error) return false;
  if (MISSING_COLUMN_CODES.has(error.code)) return true;
  const message = messageOf(error);
  return /column .* does not exist/.test(message)
    || /could not find the .* column/.test(message)
    || message.includes('schema cache');
};

/** Errore Postgres/PostgREST per una tabella che non esiste ancora. */
export const isMissingTableError = (error) => {
  if (!error) return false;
  if (MISSING_TABLE_CODES.has(error.code)) return true;
  const message = messageOf(error);
  return /relation .* does not exist/.test(message)
    || /could not find the table/.test(message);
};

/**
 * Esegue una scrittura; se Supabase rifiuta perché mancano le colonne nuove,
 * riprova una sola volta senza di esse.
 *
 * @template T
 * @param {object} row                - Payload completo
 * @param {string[]} optionalKeys     - Chiavi introdotte da una migrazione
 * @param {(row: object) => Promise<T>} run - Esegue la query (deve lanciare in caso di errore)
 * @returns {Promise<T>}
 */
export const withOptionalColumns = async (row, optionalKeys, run) => {
  try {
    return await run(row);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const reduced = { ...row };
    optionalKeys.forEach((key) => { delete reduced[key]; });
    logWarn(
      'SchemaFallback',
      `Colonne non ancora presenti (${optionalKeys.join(', ')}): salvataggio senza di esse. Esegui gli script supabase-*.sql.`,
      error
    );
    return run(reduced);
  }
};

/**
 * Esegue una lettura su una tabella introdotta da una migrazione: se la tabella
 * non esiste ancora restituisce il valore di ripiego invece di propagare l'errore.
 *
 * @template T
 * @param {() => Promise<T>} run
 * @param {T} fallback
 * @param {string} tableName
 * @returns {Promise<T>}
 */
export const readOptionalTable = async (run, fallback, tableName) => {
  try {
    return await run();
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    logWarn('SchemaFallback', `Tabella "${tableName}" non presente: esegui supabase-${tableName}.sql.`, error);
    return fallback;
  }
};
