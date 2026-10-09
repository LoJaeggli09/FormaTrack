/**
 * Esportazione del calendario in formato iCalendar (.ics).
 *
 * Il file generato si importa in Outlook, Google Calendar o Apple Calendario:
 * appuntamenti, attività svolte, prenotazioni e assenze diventano voci della
 * propria agenda personale.
 */

import { translate } from '../i18n';
import { expandEvents } from './recurrence';
import { expandAbsenceDates } from '../data/absences.supabase';
import { saveTextFile, safeFileName } from './saveFile';
import { logError } from './logger';

const CRLF = '\r\n';

/** Testo libero come valore ICS: si scappano virgole, punti e virgola e a capo. */
const escapeIcsText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/** Le righe ICS non possono superare 75 ottetti: si piegano con uno spazio iniziale. */
const foldLine = (line) => {
  if (line.length <= 73) return line;
  const chunks = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    chunks.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest.length) chunks.push(` ${rest}`);
  return chunks.join(CRLF);
};

const toIcsDate = (iso) => String(iso).slice(0, 10).replace(/-/g, '');

const toIcsDateTime = (iso, time) => `${toIcsDate(iso)}T${String(time).replace(':', '').padEnd(6, '0').slice(0, 6)}`;

const nextDay = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
};

const stamp = () => `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

/** "09:30" + 90 minuti = "11:00" */
const addMinutes = (time, minutes) => {
  const [h, m] = String(time).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const total = h * 60 + m + Number(minutes || 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};

/**
 * Una voce del calendario. Con un orario diventa un evento a ora fissa, senza
 * orario un evento "tutto il giorno".
 */
const buildEvent = ({ uid, dateIso, endDateIso, startTime, endTime, summary, description, categories }) => {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp()}`];

  if (startTime) {
    lines.push(`DTSTART:${toIcsDateTime(dateIso, startTime)}`);
    lines.push(`DTEND:${toIcsDateTime(dateIso, endTime || startTime)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(dateIso)}`);
    // DTEND è esclusivo: per un evento di un giorno punta al giorno dopo.
    lines.push(`DTEND;VALUE=DATE:${nextDay(endDateIso || dateIso)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(summary)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (categories) lines.push(`CATEGORIES:${escapeIcsText(categories)}`);
  lines.push('END:VEVENT');
  return lines;
};

/**
 * Costruisce il testo del file .ics.
 *
 * @param {{ events?: Array, activities?: Array, absences?: Array, studentName?: string, language?: string, rangeStart?: string, rangeEnd?: string }} params
 * @returns {string}
 */
export const buildIcsCalendar = ({
  events = [],
  activities = [],
  absences = [],
  studentName = '',
  language = 'it',
  rangeStart = '1970-01-01',
  rangeEnd = '2099-12-31',
}) => {
  const t = (key) => translate(key, language);
  const todayIso = new Date().toISOString().slice(0, 10);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FormaTrack//Calendario//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`FormaTrack${studentName ? ` - ${studentName}` : ''}`)}`,
  ];

  expandEvents(events, rangeStart, rangeEnd).forEach((event) => {
    lines.push(...buildEvent({
      uid: `event-${event.seriesId}-${event.date}@formatrack`,
      dateIso: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      summary: event.title,
      description: event.description,
      categories: t('calendar.legendEvents'),
    }));
  });

  activities.forEach((activity) => {
    const isBooking = activity.date > todayIso;
    const summaryParts = [activity.activityType || t('activities.title'), activity.description].filter(Boolean);
    const descriptionParts = [
      activity.site ? `${t('activities.site')}: ${activity.site}` : '',
      activity.ticket ? `${t('activities.ticket')}: ${activity.ticket}` : '',
      activity.durationMinutes ? `${t('activities.duration')}: ${activity.durationMinutes} min` : '',
    ].filter(Boolean);

    lines.push(...buildEvent({
      uid: `activity-${activity.id}@formatrack`,
      dateIso: activity.date,
      startTime: activity.startTime,
      endTime: activity.startTime && activity.durationMinutes
        ? addMinutes(activity.startTime, activity.durationMinutes)
        : '',
      summary: summaryParts.join(' - '),
      description: descriptionParts.join('\n'),
      categories: isBooking ? t('calendar.legendBookings') : t('calendar.legendActivities'),
    }));
  });

  absences.forEach((absence) => {
    lines.push(...buildEvent({
      uid: `absence-${absence.id}@formatrack`,
      dateIso: absence.startDate,
      endDateIso: absence.endDate,
      summary: `${t('absences.title')}: ${t(`absences.type.${absence.type}`)}`,
      description: absence.reason,
      categories: t('absences.title'),
    }));
  });

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
};

/**
 * Genera e salva il file .ics.
 * @returns {Promise<{ success: boolean, canceled?: boolean, error?: string }>}
 */
export const exportCalendarToIcs = async (params) => {
  try {
    const content = buildIcsCalendar(params);
    const filename = `${safeFileName(params.studentName || 'calendario')}_${new Date().toISOString().slice(0, 10)}.ics`;
    return await saveTextFile(filename, content, 'text/calendar');
  } catch (error) {
    logError('Export', 'Esportazione ICS fallita', error);
    return { success: false, error: error.message };
  }
};
