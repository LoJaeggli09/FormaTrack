import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { readOptionalTable } from './schemaFallback';
import { writeOrQueue, registerExecutor, overlayPending } from './offlineQueue';
import { SYNC_ENTITY } from '../utils/syncQueue';

/** Tipi di assenza gestiti (chiave stabile → chiave i18n `absences.type.<id>`). */
export const ABSENCE_TYPES = ['sick', 'vacation', 'school', 'inter_company', 'military', 'other'];

/** Un'assenza "scolastica" o di corso interaziendale non è un'assenza subita: serve a distinguerle nelle statistiche. */
export const PLANNED_ABSENCE_TYPES = new Set(['school', 'inter_company', 'vacation', 'military']);

const normalizeAbsence = (a) => ({
  id: a.id,
  studentId: a.student_id,
  startDate: a.start_date,
  endDate: a.end_date || a.start_date,
  type: a.absence_type || 'other',
  halfDay: Boolean(a.half_day),
  justified: Boolean(a.justified),
  reason: a.reason || '',
  createdBy: a.created_by,
  createdByName: a.created_by_name || '',
  createdAt: a.created_at,
});

const toRow = (studentId, data, createdBy = null, createdByName = null) => ({
  student_id: studentId,
  start_date: data.startDate,
  end_date: data.endDate || data.startDate,
  absence_type: data.type || 'other',
  half_day: Boolean(data.halfDay),
  justified: Boolean(data.justified),
  reason: data.reason ? String(data.reason).trim() : null,
  created_by: createdBy,
  created_by_name: createdByName,
});

const byStartDesc = (a, b) => String(b.startDate).localeCompare(String(a.startDate));

const fetchAbsencesForStudent = async (studentId) =>
  readThroughCache(`absences:${studentId}`, () =>
    readOptionalTable(async () => {
      const { data, error } = await supabase
        .from('absences')
        .select('*')
        .eq('student_id', studentId)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data.map(normalizeAbsence);
    }, [], 'absences'));

/** Assenze di un apprendista, dalla più recente (con le modifiche ancora in coda, se offline). */
export const getAbsencesForStudent = async (studentId) => {
  const rows = await fetchAbsencesForStudent(studentId);
  return overlayPending(SYNC_ENTITY.ABSENCE, rows, { studentIds: [studentId], sort: byStartDesc });
};

const fetchAbsencesForStudents = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return [];
  const cacheKey = `absences:many:${[...studentIds].sort().join(',')}`;
  return readThroughCache(cacheKey, () =>
    readOptionalTable(async () => {
      const { data, error } = await supabase
        .from('absences')
        .select('*')
        .in('student_id', studentIds);
      if (error) throw error;
      return data.map(normalizeAbsence);
    }, [], 'absences'));
};

/** Assenze di più apprendisti insieme (statistiche aggregate). */
export const getAbsencesForStudents = async (studentIds) => {
  const rows = await fetchAbsencesForStudents(studentIds);
  return overlayPending(SYNC_ENTITY.ABSENCE, rows, { studentIds });
};

const addAbsenceOnline = async (studentId, absenceData, createdBy = null, createdByName = null) => {
  const { data, error } = await supabase
    .from('absences')
    .insert([toRow(studentId, absenceData, createdBy, createdByName)])
    .select().single();
  if (error) throw error;
  return normalizeAbsence(data);
};

/** Campi dell'assenza come li vede la lista, per mostrarla subito anche se ancora in coda. */
const absenceFields = (data) => ({
  startDate: data.startDate,
  endDate: data.endDate || data.startDate,
  type: data.type || 'other',
  halfDay: Boolean(data.halfDay),
  justified: Boolean(data.justified),
  reason: data.reason ? String(data.reason).trim() : '',
});

export const addAbsence = async (studentId, absenceData, createdBy = null, createdByName = null) =>
  writeOrQueue({
    entity: SYNC_ENTITY.ABSENCE,
    action: 'create',
    studentId,
    args: [studentId, absenceData, createdBy, createdByName],
    row: {
      studentId,
      ...absenceFields(absenceData),
      createdBy,
      createdByName: createdByName || '',
      createdAt: new Date().toISOString(),
    },
    run: () => addAbsenceOnline(studentId, absenceData, createdBy, createdByName),
  });
registerExecutor('absence:create', (args) => addAbsenceOnline(...args));

const updateAbsenceOnline = async (absenceId, absenceData) => {
  const row = toRow(absenceData.studentId, absenceData);
  delete row.student_id;
  delete row.created_by;
  delete row.created_by_name;
  const { data, error } = await supabase
    .from('absences')
    .update(row)
    .eq('id', absenceId)
    .select().single();
  if (error) throw error;
  return normalizeAbsence(data);
};

export const updateAbsence = async (absenceId, absenceData) =>
  writeOrQueue({
    entity: SYNC_ENTITY.ABSENCE,
    action: 'update',
    targetId: absenceId,
    args: [absenceId, absenceData],
    patch: absenceFields(absenceData),
    run: () => updateAbsenceOnline(absenceId, absenceData),
  });
registerExecutor('absence:update', (args) => updateAbsenceOnline(...args));

const deleteAbsenceOnline = async (absenceId) => {
  const { error } = await supabase.from('absences').delete().eq('id', absenceId);
  if (error) throw error;
  return true;
};

export const deleteAbsence = async (absenceId) =>
  writeOrQueue({
    entity: SYNC_ENTITY.ABSENCE,
    action: 'delete',
    targetId: absenceId,
    args: [absenceId],
    run: () => deleteAbsenceOnline(absenceId),
  });
registerExecutor('absence:delete', (args) => deleteAbsenceOnline(...args));

// ── Utility di calcolo ───────────────────────────────────────────────────────

const toIso = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Tutte le date ISO coperte dall'assenza, weekend inclusi (serve al calendario). */
export const expandAbsenceDates = (absence) => {
  if (!absence?.startDate) return [];
  const [sy, sm, sd] = absence.startDate.split('-').map(Number);
  const [ey, em, ed] = (absence.endDate || absence.startDate).split('-').map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const dates = [];
  // Limite di sicurezza: un'assenza non può coprire più di due anni.
  let guard = 0;
  while (cursor <= end && guard < 800) {
    dates.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
};

/**
 * Giorni di assenza contati solo sui giorni lavorativi (lun–ven).
 * Una mezza giornata vale 0.5 e si applica solo alle assenze di un giorno solo.
 */
export const countAbsenceDays = (absence) => {
  const workingDays = expandAbsenceDates(absence).filter((iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    return weekday !== 0 && weekday !== 6;
  }).length;
  if (workingDays === 1 && absence.halfDay) return 0.5;
  return workingDays;
};
