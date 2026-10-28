import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { withOptionalColumns } from './schemaFallback';
import { writeOrQueue, registerExecutor, overlayPending } from './offlineQueue';
import { logDataChange, AUDIT_EVENTS } from './auditLog.supabase';
import { SYNC_ENTITY } from '../utils/syncQueue';

/** Stati del flusso di validazione: bozza → inviata → validata | respinta. */
export const ACTIVITY_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  VALIDATED: 'validated',
  REJECTED: 'rejected',
};

/** Colonne introdotte da supabase-activities-validation.sql. */
const VALIDATION_COLUMNS = [
  'status', 'submitted_at', 'validated_by', 'validated_by_name', 'validated_at', 'rejection_reason',
];

// Normalizza un'attività dal formato Supabase al formato app
const normalizeActivity = (a) => ({
  id: a.id,
  studentId: a.student_id,
  date: a.activity_date,
  description: a.description,
  activityType: a.activity_type || '',
  startTime: a.start_time || '',
  trainerTime: a.trainer_time || '',
  apprenticeCount: a.apprentice_count ?? null,
  durationMinutes: a.duration_minutes ?? null,
  site: a.site || '',
  ticket: a.ticket || '',
  status: a.status || ACTIVITY_STATUS.DRAFT,
  submittedAt: a.submitted_at || null,
  validatedBy: a.validated_by ?? null,
  validatedByName: a.validated_by_name || '',
  validatedAt: a.validated_at || null,
  rejectionReason: a.rejection_reason || '',
  createdBy: a.created_by,
  createdAt: a.created_at,
});

const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));

const fetchActivitiesForStudent = async (studentId) =>
  readThroughCache(`activities:${studentId}`, async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('student_id', studentId)
      .order('activity_date', { ascending: false });
    if (error) throw error;
    return data.map(normalizeActivity);
  });

// Leggi tutte le attività di un apprendista (con le modifiche ancora in coda, se offline)
export const getActivitiesForStudent = async (studentId) => {
  const rows = await fetchActivitiesForStudent(studentId);
  return overlayPending(SYNC_ENTITY.ACTIVITY, rows, { studentIds: [studentId], sort: byDateDesc });
};

const fetchActivitiesForStudents = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return [];
  const cacheKey = `activities:many:${[...studentIds].sort().join(',')}`;
  return readThroughCache(cacheKey, async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .in('student_id', studentIds);
    if (error) throw error;
    return data.map(normalizeActivity);
  });
};

// Leggi le attività di più apprendisti insieme (per statistiche aggregate)
export const getActivitiesForStudents = async (studentIds) => {
  const rows = await fetchActivitiesForStudents(studentIds);
  return overlayPending(SYNC_ENTITY.ACTIVITY, rows, { studentIds });
};

// Aggiungi un'attività (o una prenotazione futura: stessi campi, data futura)
const addActivityOnline = async (studentId, activityData, createdBy = null) => {
  const row = {
    student_id: studentId,
    activity_date: activityData.date,
    description: activityData.description,
    activity_type: activityData.activityType || null,
    start_time: activityData.startTime || null,
    trainer_time: activityData.trainerTime || null,
    apprentice_count: activityData.apprenticeCount || null,
    duration_minutes: activityData.durationMinutes || null,
    site: activityData.site || null,
    ticket: activityData.ticket || null,
    status: activityData.status || ACTIVITY_STATUS.DRAFT,
    validated_by: activityData.validatedBy ?? null,
    validated_by_name: activityData.validatedByName || null,
    validated_at: activityData.status === ACTIVITY_STATUS.VALIDATED ? new Date().toISOString() : null,
    created_by: createdBy,
  };

  const created = await withOptionalColumns(row, VALIDATION_COLUMNS, async (payload) => {
    const { data, error } = await supabase.from('activities').insert([payload]).select().single();
    if (error) throw error;
    return normalizeActivity(data);
  });

  await logDataChange({
    event: AUDIT_EVENTS.ACTIVITY_CREATED,
    entity: 'activity',
    entityId: created.id,
    studentId,
    details: { date: created.date, type: created.activityType || null, status: created.status },
  });
  return created;
};

/** Riga come la vedrebbe la lista dopo il salvataggio, per mostrare subito un'attività creata offline. */
const buildActivityRow = (studentId, d, createdBy) => {
  const now = new Date().toISOString();
  const status = d.status || ACTIVITY_STATUS.DRAFT;
  return {
    studentId,
    date: d.date,
    description: d.description,
    activityType: d.activityType || '',
    startTime: d.startTime || '',
    trainerTime: d.trainerTime || '',
    apprenticeCount: d.apprenticeCount || null,
    durationMinutes: d.durationMinutes || null,
    site: d.site || '',
    ticket: d.ticket || '',
    status,
    submittedAt: null,
    validatedBy: d.validatedBy ?? null,
    validatedByName: d.validatedByName || '',
    validatedAt: status === ACTIVITY_STATUS.VALIDATED ? now : null,
    rejectionReason: '',
    createdBy,
    createdAt: now,
  };
};

export const addActivity = async (studentId, activityData, createdBy = null) =>
  writeOrQueue({
    entity: SYNC_ENTITY.ACTIVITY,
    action: 'create',
    studentId,
    args: [studentId, activityData, createdBy],
    row: buildActivityRow(studentId, activityData, createdBy),
    run: () => addActivityOnline(studentId, activityData, createdBy),
  });
registerExecutor('activity:create', (args) => addActivityOnline(...args));

// Aggiorna un'attività. Lo stato di validazione si tocca solo se passato
// esplicitamente: una modifica dei dati non deve resettarlo da sola.
const updateActivityOnline = async (activityId, activityData) => {
  const row = {
    activity_date: activityData.date,
    description: activityData.description,
    activity_type: activityData.activityType || null,
    start_time: activityData.startTime || null,
    trainer_time: activityData.trainerTime || null,
    apprentice_count: activityData.apprenticeCount || null,
    duration_minutes: activityData.durationMinutes || null,
    site: activityData.site || null,
    ticket: activityData.ticket || null,
  };
  if (activityData.status !== undefined) row.status = activityData.status;

  const updated = await withOptionalColumns(row, VALIDATION_COLUMNS, async (payload) => {
    const { data, error } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', activityId)
      .select().single();
    if (error) throw error;
    return normalizeActivity(data);
  });

  await logDataChange({
    event: AUDIT_EVENTS.ACTIVITY_UPDATED,
    entity: 'activity',
    entityId: updated.id,
    studentId: updated.studentId,
    details: { date: updated.date, type: updated.activityType || null, status: updated.status },
  });
  return updated;
};

export const updateActivity = async (activityId, activityData) =>
  writeOrQueue({
    entity: SYNC_ENTITY.ACTIVITY,
    action: 'update',
    targetId: activityId,
    args: [activityId, activityData],
    patch: {
      date: activityData.date,
      description: activityData.description,
      activityType: activityData.activityType || '',
      startTime: activityData.startTime || '',
      trainerTime: activityData.trainerTime || '',
      apprenticeCount: activityData.apprenticeCount || null,
      durationMinutes: activityData.durationMinutes || null,
      site: activityData.site || '',
      ticket: activityData.ticket || '',
      ...(activityData.status !== undefined ? { status: activityData.status } : {}),
    },
    run: () => updateActivityOnline(activityId, activityData),
  });
registerExecutor('activity:update', (args) => updateActivityOnline(...args));

/**
 * Cambia lo stato di validazione di un'attività.
 *
 * @param {number} activityId
 * @param {'draft'|'submitted'|'validated'|'rejected'} status
 * @param {{ actorId?: number|null, actorName?: string|null, reason?: string }} [actor]
 */
export const setActivityStatus = async (activityId, status, actor = {}) => {
  const now = new Date().toISOString();
  const row = { status };

  if (status === ACTIVITY_STATUS.SUBMITTED) {
    row.submitted_at = now;
    row.validated_by = null;
    row.validated_by_name = null;
    row.validated_at = null;
    row.rejection_reason = null;
  } else if (status === ACTIVITY_STATUS.VALIDATED) {
    row.validated_by = actor.actorId ?? null;
    row.validated_by_name = actor.actorName || null;
    row.validated_at = now;
    row.rejection_reason = null;
  } else if (status === ACTIVITY_STATUS.REJECTED) {
    row.validated_by = actor.actorId ?? null;
    row.validated_by_name = actor.actorName || null;
    row.validated_at = now;
    row.rejection_reason = actor.reason || null;
  } else {
    row.submitted_at = null;
    row.validated_by = null;
    row.validated_by_name = null;
    row.validated_at = null;
    row.rejection_reason = null;
  }

  const updated = await withOptionalColumns(row, VALIDATION_COLUMNS, async (payload) => {
    if (Object.keys(payload).length === 0) {
      const error = new Error('MIGRATION_REQUIRED');
      error.code = 'MIGRATION_REQUIRED';
      throw error;
    }
    const { data, error } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', activityId)
      .select().single();
    if (error) throw error;
    return normalizeActivity(data);
  });

  await logDataChange({
    event: AUDIT_EVENTS.ACTIVITY_STATUS,
    entity: 'activity',
    entityId: updated.id,
    studentId: updated.studentId,
    details: { date: updated.date, status },
  });
  return updated;
};

// Elimina un'attività
const deleteActivityOnline = async (activityId) => {
  const { data, error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)
    .select('student_id, activity_date, activity_type');
  if (error) throw error;

  const removed = Array.isArray(data) ? data[0] : null;
  await logDataChange({
    event: AUDIT_EVENTS.ACTIVITY_DELETED,
    entity: 'activity',
    entityId: activityId,
    studentId: removed?.student_id ?? null,
    details: { date: removed?.activity_date ?? null, type: removed?.activity_type ?? null },
  });
  return true;
};

export const deleteActivity = async (activityId) =>
  writeOrQueue({
    entity: SYNC_ENTITY.ACTIVITY,
    action: 'delete',
    targetId: activityId,
    args: [activityId],
    run: () => deleteActivityOnline(activityId),
  });
registerExecutor('activity:delete', (args) => deleteActivityOnline(...args));
