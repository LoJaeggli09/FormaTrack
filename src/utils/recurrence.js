/**
 * Espansione degli eventi ricorrenti del calendario.
 *
 * Nel database resta una sola riga (la prima occorrenza) con cadenza e data di
 * fine serie; le ripetizioni vengono generate qui al volo, così modificare o
 * cancellare la serie resta un'operazione su una riga sola.
 */

import { toIsoDate, fromIsoDate } from './dateRange';

/** Quanto lontano si generano le ripetizioni quando non c'è una data di fine. */
const DEFAULT_HORIZON_MONTHS = 12;
const MAX_OCCURRENCES = 400;

const addMonthsClamped = (date, months) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
  return target;
};

/**
 * Tutte le occorrenze di un evento comprese nell'intervallo richiesto.
 *
 * Ogni occorrenza è una copia dell'evento con la data spostata; `isOccurrence`
 * distingue le ripetizioni dall'evento originale, `seriesId` le riporta alla
 * riga di database da cui derivano.
 *
 * @param {object} event
 * @param {string} rangeStartIso
 * @param {string} rangeEndIso
 * @returns {Array<object>}
 */
export const expandEventOccurrences = (event, rangeStartIso, rangeEndIso) => {
  if (!event?.date) return [];

  const recurrence = event.recurrence || 'none';
  const start = fromIsoDate(event.date);
  if (!start) return [];

  if (recurrence === 'none') {
    return event.date >= rangeStartIso && event.date <= rangeEndIso
      ? [{ ...event, isOccurrence: false, seriesId: event.id, occurrenceKey: String(event.id) }]
      : [];
  }

  const seriesEnd = event.recurrenceEnd
    ? fromIsoDate(event.recurrenceEnd)
    : addMonthsClamped(start, DEFAULT_HORIZON_MONTHS);
  const rangeEnd = fromIsoDate(rangeEndIso);
  const hardEnd = seriesEnd && rangeEnd
    ? (seriesEnd < rangeEnd ? seriesEnd : rangeEnd)
    : (seriesEnd || rangeEnd);
  if (!hardEnd) return [];

  const occurrences = [];
  let cursor = new Date(start);
  let index = 0;

  while (cursor <= hardEnd && index < MAX_OCCURRENCES) {
    const iso = toIsoDate(cursor);
    if (iso >= rangeStartIso && iso <= rangeEndIso) {
      occurrences.push({
        ...event,
        date: iso,
        isOccurrence: index > 0,
        seriesId: event.id,
        occurrenceKey: `${event.id}-${iso}`,
      });
    }
    index += 1;
    if (recurrence === 'weekly') {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    } else if (recurrence === 'biweekly') {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 14);
    } else if (recurrence === 'monthly') {
      cursor = addMonthsClamped(start, index);
    } else {
      break;
    }
  }

  return occurrences;
};

/** Espande una lista di eventi su un intervallo. */
export const expandEvents = (events = [], rangeStartIso, rangeEndIso) =>
  events.flatMap((event) => expandEventOccurrences(event, rangeStartIso, rangeEndIso));
