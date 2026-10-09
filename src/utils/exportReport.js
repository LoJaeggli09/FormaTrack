/**
 * Esportazione dei dati in Excel e PDF.
 *
 * jspdf e xlsx pesano parecchio: vengono caricati con import() dinamico solo
 * quando l'utente clicca Esporta, così non entrano nel bundle di avvio.
 *
 * Il salvataggio passa da `utils/saveFile.js`: in Electron apre la finestra di
 * salvataggio nativa, nel browser in sviluppo usa il download via Blob.
 */

import { translate } from '../i18n';
import { logError } from './logger';
import { saveBinaryFile as saveExport, safeFileName } from './saveFile';
import { formatRangeLabel } from './dateRange';
import {
  sumDurationMinutes,
  averageDurationMinutes,
  minutesToHours,
  hoursGroupedBy,
} from './activityStats';
import { countAbsenceDays } from '../data/absences.supabase';

const localeFor = (language) =>
  language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

/** Data ISO (YYYY-MM-DD) → data locale leggibile, senza slittamenti di fuso. */
const formatDate = (isoDate, locale) => {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(isoDate);
  return new Date(y, m - 1, d).toLocaleDateString(locale);
};

const formatDateTime = (isoDateTime, locale) => {
  if (!isoDateTime) return '';
  const parsed = new Date(isoDateTime);
  return Number.isNaN(parsed.getTime()) ? String(isoDateTime) : parsed.toLocaleString(locale);
};

/** Colonne del registro attività, condivise da Excel e PDF. */
const activityColumns = (t) => [
  { key: 'date', header: t('activities.date') },
  { key: 'activityType', header: t('activities.type') },
  { key: 'description', header: t('activities.description') },
  { key: 'startTime', header: t('booking.time') },
  { key: 'durationMinutes', header: t('activities.duration') },
  { key: 'trainerTime', header: t('activities.trainerTime') },
  { key: 'apprenticeCount', header: t('activities.apprenticeCount') },
  { key: 'site', header: t('activities.site') },
  { key: 'ticket', header: t('activities.ticket') },
];

const activityRow = (activity, columns, locale) =>
  columns.map(({ key }) => {
    if (key === 'date') return formatDate(activity.date, locale);
    const value = activity[key];
    return value === null || value === undefined || value === '' ? '' : String(value);
  });

/**
 * Esporta le attività di un apprendista in un foglio Excel.
 * @param {{ activities: Array, studentName: string, language: string }} params
 */
export const exportActivitiesToExcel = async ({ activities = [], studentName = '', language = 'it' }) => {
  const t = (key) => translate(key, language);
  const locale = localeFor(language);

  try {
    const XLSX = await import('xlsx');
    const columns = activityColumns(t);

    const rows = activities.map((activity) => {
      const values = activityRow(activity, columns, locale);
      const row = {};
      columns.forEach(({ header }, index) => { row[header] = values[index]; });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns.map((c) => c.header) });
    worksheet['!cols'] = columns.map(({ key }) => ({ wch: key === 'description' ? 40 : 16 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, t('activities.title').slice(0, 31));

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const filename = `${safeFileName(studentName || t('activities.title'))}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return await saveExport(
      filename,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } catch (error) {
    logError('Export', 'Esportazione Excel fallita', error);
    return { success: false, error: error.message };
  }
};

/**
 * Esporta il riepilogo aggregato di tutti gli apprendisti (sezione Dati).
 * @param {{ activities: Array, students: Array, language: string }} params
 */
export const exportAggregateToExcel = async ({ activities = [], students = [], language = 'it' }) => {
  const t = (key) => translate(key, language);
  const locale = localeFor(language);

  try {
    const XLSX = await import('xlsx');
    const nameById = {};
    students.forEach((student) => { nameById[student.id] = student.name; });

    const columns = activityColumns(t);
    const studentHeader = t('trainer.selectStudent');

    const rows = activities.map((activity) => {
      const values = activityRow(activity, columns, locale);
      const row = { [studentHeader]: nameById[activity.studentId] || activity.studentId };
      columns.forEach(({ header }, index) => { row[header] = values[index]; });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [studentHeader, ...columns.map((c) => c.header)],
    });
    worksheet['!cols'] = [{ wch: 24 }, ...columns.map(({ key }) => ({ wch: key === 'description' ? 40 : 16 }))];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, t('data.title').slice(0, 31));

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const filename = `${safeFileName(t('data.title'))}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return await saveExport(
      filename,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } catch (error) {
    logError('Export', 'Esportazione Excel aggregata fallita', error);
    return { success: false, error: error.message };
  }
};

/**
 * Report PDF completo di un apprendista: anagrafica, attività, valutazioni, note.
 * È il documento pensato per il formatore.
 *
 * @param {object} params
 * @param {object} params.student    - Anagrafica (name, studentNumber, formationYear, ...)
 * @param {Array}  params.activities
 * @param {Array}  params.grades
 * @param {Array}  params.notes
 * @param {string} params.language
 */
export const exportStudentReportToPdf = async ({
  student = {},
  activities = [],
  grades = [],
  notes = [],
  language = 'it',
}) => {
  const t = (key) => translate(key, language);
  const locale = localeFor(language);

  try {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const marginX = 40;
    const nextY = (fallback) => (doc.lastAutoTable?.finalY ?? fallback) + 28;

    // ── Intestazione ──────────────────────────────────────────────────────────
    doc.setFontSize(18);
    doc.text('FormaTrack', marginX, 44);
    doc.setFontSize(13);
    doc.text(t('export.reportTitle'), marginX, 64);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`${t('export.generatedOn')} ${new Date().toLocaleString(locale)}`, marginX, 80);
    doc.setTextColor(0);

    // ── Anagrafica ────────────────────────────────────────────────────────────
    const profileRows = [
      [t('trainer.selectStudent'), student.name || '—'],
      [t('profile.number'), student.studentNumber || '—'],
      [t('profile.year'), student.formationYear ? String(student.formationYear) : '—'],
      [t('profile.apprenticeshipStart'), formatDate(student.apprenticeshipStart, locale) || '—'],
      [t('profile.apprenticeshipEnd'), formatDate(student.apprenticeshipEnd, locale) || '—'],
    ];
    autoTable(doc, {
      startY: 96,
      head: [[t('dashboard.profile'), '']],
      body: profileRows,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fontStyle: 'bold', fillColor: [21, 101, 192], textColor: 255 },
      columnStyles: { 0: { cellWidth: 180, fontStyle: 'bold' } },
      margin: { left: marginX, right: marginX },
    });

    // ── Attività ──────────────────────────────────────────────────────────────
    const columns = activityColumns(t);
    autoTable(doc, {
      startY: nextY(96),
      head: [columns.map((c) => c.header)],
      body: activities.length
        ? activities.map((activity) => activityRow(activity, columns, locale))
        : [[{ content: t('activities.noActivities'), colSpan: columns.length, styles: { halign: 'center' } }]],
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [21, 101, 192], textColor: 255, fontSize: 8 },
      columnStyles: { 2: { cellWidth: 180 } },
      margin: { left: marginX, right: marginX },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `${t('export.reportTitle')} — ${student.name || ''}`,
          marginX,
          doc.internal.pageSize.getHeight() - 18
        );
        doc.setTextColor(0);
      },
    });

    // ── Valutazioni ───────────────────────────────────────────────────────────
    const gradeValues = grades
      .map((g) => parseFloat(g.grade))
      .filter((value) => !Number.isNaN(value));
    const average = gradeValues.length
      ? (gradeValues.reduce((acc, value) => acc + value, 0) / gradeValues.length).toFixed(2)
      : null;

    autoTable(doc, {
      startY: nextY(96),
      head: [[t('grading.subject'), t('grading.grade'), t('grading.date')]],
      body: grades.length
        ? grades.map((grade) => [
            grade.subject || '',
            grade.grade !== null && grade.grade !== undefined ? String(grade.grade) : '',
            formatDateTime(grade.date, locale),
          ])
        : [[{ content: t('grading.noGrades'), colSpan: 3, styles: { halign: 'center' } }]],
      foot: average ? [[t('grading.average'), average, '']] : undefined,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [22, 163, 74], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      margin: { left: marginX, right: marginX },
    });

    // ── Note ──────────────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: nextY(96),
      head: [[t('notes.title'), t('manage.auditBy'), t('manage.auditWhen')]],
      body: notes.length
        ? notes.map((note) => [
            note.content || '',
            note.authorName || '',
            formatDateTime(note.createdAt, locale),
          ])
        : [[{ content: t('notes.noNotes'), colSpan: 3, styles: { halign: 'center' } }]],
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [124, 58, 237], textColor: 255 },
      columnStyles: { 0: { cellWidth: 460 } },
      margin: { left: marginX, right: marginX },
    });

    const buffer = doc.output('arraybuffer');
    const filename = `${safeFileName(student.name || 'report')}_report_${new Date().toISOString().slice(0, 10)}.pdf`;

    return await saveExport(filename, buffer, 'application/pdf');
  } catch (error) {
    logError('Export', 'Esportazione PDF fallita', error);
    return { success: false, error: error.message };
  }
};

/**
 * Rapporto di formazione periodico (semestrale/trimestrale).
 *
 * A differenza del report completo non è un elenco di righe ma un documento da
 * firmare: riepilogo del periodo, ore, medie, assenze, commento del formatore e
 * riquadro firme.
 *
 * @param {object} params
 * @param {object} params.student
 * @param {{ from: string|null, to: string|null }} params.range
 * @param {Array}  params.activities - già filtrate sul periodo
 * @param {Array}  params.grades     - già filtrate sul periodo
 * @param {Array}  params.absences   - già filtrate sul periodo
 * @param {string} params.trainerComment
 * @param {string} params.trainerName
 * @param {string} params.language
 */
export const exportPeriodReportToPdf = async ({
  student = {},
  range = { from: null, to: null },
  activities = [],
  grades = [],
  absences = [],
  trainerComment = '',
  trainerName = '',
  language = 'it',
}) => {
  const t = (key) => translate(key, language);
  const locale = localeFor(language);

  try {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const marginX = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - marginX * 2;
    const nextY = (fallback) => (doc.lastAutoTable?.finalY ?? fallback) + 24;

    const periodLabel = formatRangeLabel(range, locale) || t('period.all');

    // ── Intestazione ──────────────────────────────────────────────────────────
    doc.setFontSize(18);
    doc.text('FormaTrack', marginX, 48);
    doc.setFontSize(14);
    doc.text(t('report.periodTitle'), marginX, 70);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`${t('report.period')}: ${periodLabel}`, marginX, 88);
    doc.text(`${t('export.generatedOn')} ${new Date().toLocaleString(locale)}`, marginX, 102);
    doc.setTextColor(0);

    // ── Anagrafica ────────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: 118,
      head: [[t('dashboard.profile'), '']],
      body: [
        [t('trainer.selectStudent'), student.name || '—'],
        [t('profile.number'), student.studentNumber || '—'],
        [t('profile.year'), student.formationYear ? String(student.formationYear) : '—'],
        [t('profile.apprenticeshipStart'), formatDate(student.apprenticeshipStart, locale) || '—'],
        [t('profile.apprenticeshipEnd'), formatDate(student.apprenticeshipEnd, locale) || '—'],
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fontStyle: 'bold', fillColor: [21, 101, 192], textColor: 255 },
      columnStyles: { 0: { cellWidth: 170, fontStyle: 'bold' } },
      margin: { left: marginX, right: marginX },
    });

    // ── Riepilogo del periodo ─────────────────────────────────────────────────
    const totalMinutes = sumDurationMinutes(activities);
    const avgMinutes = averageDurationMinutes(activities);
    const gradeValues = grades
      .map((grade) => parseFloat(grade.grade))
      .filter((value) => !Number.isNaN(value));
    const gradeAverage = gradeValues.length
      ? (gradeValues.reduce((acc, value) => acc + value, 0) / gradeValues.length).toFixed(2)
      : '—';
    const absenceDays = absences.reduce((total, absence) => total + countAbsenceDays(absence), 0);

    autoTable(doc, {
      startY: nextY(118),
      head: [[t('report.summary'), '']],
      body: [
        [t('report.totalActivities'), String(activities.length)],
        [t('report.totalHours'), `${minutesToHours(totalMinutes)} h`],
        [t('report.avgDuration'), avgMinutes !== null ? `${avgMinutes} min` : '—'],
        [t('report.absenceDays'), String(absenceDays)],
        [t('report.gradeAverage'), gradeAverage],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 5 },
      headStyles: { fillColor: [22, 163, 74], textColor: 255 },
      columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold' } },
      margin: { left: marginX, right: marginX },
    });

    // ── Ore per tipo di attività ──────────────────────────────────────────────
    const hoursByType = hoursGroupedBy(activities, (activity) => activity.activityType || null)
      .sort((a, b) => b.value - a.value);

    autoTable(doc, {
      startY: nextY(118),
      head: [[t('activities.type'), `${t('report.totalHours')}`]],
      body: hoursByType.length
        ? hoursByType.map((row) => [row.name, `${row.value} h`])
        : [[{ content: t('data.noData'), colSpan: 2, styles: { halign: 'center' } }]],
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [249, 115, 22], textColor: 255 },
      columnStyles: { 1: { cellWidth: 110, halign: 'right' } },
      margin: { left: marginX, right: marginX },
    });

    // ── Medie per materia ─────────────────────────────────────────────────────
    const bySubject = {};
    grades.forEach((grade) => {
      const value = parseFloat(grade.grade);
      if (Number.isNaN(value)) return;
      const subject = grade.subject || '—';
      if (!bySubject[subject]) bySubject[subject] = [];
      bySubject[subject].push(value);
    });

    autoTable(doc, {
      startY: nextY(118),
      head: [[t('grading.subject'), t('grading.average'), t('grading.grade')]],
      body: Object.keys(bySubject).length
        ? Object.entries(bySubject).map(([subject, values]) => [
            subject,
            (values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(2),
            String(values.length),
          ])
        : [[{ content: t('grading.noGrades'), colSpan: 3, styles: { halign: 'center' } }]],
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [217, 119, 6], textColor: 255 },
      columnStyles: { 1: { cellWidth: 90, halign: 'right' }, 2: { cellWidth: 90, halign: 'right' } },
      margin: { left: marginX, right: marginX },
    });

    // ── Assenze ───────────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: nextY(118),
      head: [[t('absences.period'), t('absences.type'), t('absences.days'), t('absences.justified')]],
      body: absences.length
        ? absences.map((absence) => [
            absence.startDate === absence.endDate
              ? formatDate(absence.startDate, locale)
              : `${formatDate(absence.startDate, locale)} – ${formatDate(absence.endDate, locale)}`,
            t(`absences.type.${absence.type}`),
            String(countAbsenceDays(absence)),
            absence.justified ? t('common.yes') : t('common.no'),
          ])
        : [[{ content: t('absences.noAbsences'), colSpan: 4, styles: { halign: 'center' } }]],
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [124, 58, 237], textColor: 255 },
      margin: { left: marginX, right: marginX },
    });

    // ── Commento del formatore ────────────────────────────────────────────────
    autoTable(doc, {
      startY: nextY(118),
      head: [[t('report.trainerComment')]],
      body: [[trainerComment?.trim() || ' ']],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 8, minCellHeight: 90, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [21, 101, 192], textColor: 255 },
      margin: { left: marginX, right: marginX },
    });

    // ── Firme ─────────────────────────────────────────────────────────────────
    let signatureY = nextY(118) + 30;
    // Se non c'è più spazio le firme vanno sulla pagina successiva, mai a metà.
    if (signatureY > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      signatureY = 120;
    }

    const columnWidth = (contentWidth - 24) / 2;
    doc.setDrawColor(150);
    doc.line(marginX, signatureY, marginX + columnWidth, signatureY);
    doc.line(marginX + columnWidth + 24, signatureY, marginX + contentWidth, signatureY);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(t('report.signatureApprentice'), marginX, signatureY + 14);
    doc.text(`${t('report.signatureTrainer')}${trainerName ? ` (${trainerName})` : ''}`, marginX + columnWidth + 24, signatureY + 14);
    doc.text(`${t('report.signatureDate')}: ${new Date().toLocaleDateString(locale)}`, marginX, signatureY + 34);
    doc.setTextColor(0);

    const buffer = doc.output('arraybuffer');
    const rangeSuffix = range.from ? `_${range.from}_${range.to || ''}` : '';
    const filename = `${safeFileName(student.name || 'rapporto')}_rapporto${rangeSuffix}.pdf`;

    return await saveExport(filename, buffer, 'application/pdf');
  } catch (error) {
    logError('Export', 'Esportazione rapporto periodico fallita', error);
    return { success: false, error: error.message };
  }
};
