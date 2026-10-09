import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { withOptionalColumns } from './schemaFallback';

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

// Leggi tutte le attività di un apprendista
export const getActivitiesForStudent = async (studentId) =>
  readThroughCache(`activities:${studentId}`, async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('student_id', studentId)
      .order('activity_date', { ascending: false });
    if (error) throw error;
    return data.map(normalizeActivity);
  });

// Leggi le attività di più apprendisti insieme (per statistiche aggregate)
export const getActivitiesForStudents = async (studentIds) => {
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

// Aggiungi un'attività (o una prenotazione futura: stessi campi, data futura)
export const addActivity = async (studentId, activityData, createdBy = null) => {
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

  return withOptionalColumns(row, VALIDATION_COLUMNS, async (payload) => {
    const { data, error } = await supabase.from('activities').insert([payload]).select().single();
    if (error) throw error;
    return normalizeActivity(data);
  });
};

// Aggiorna un'attività. Lo stato di validazione si tocca solo se passato
// esplicitamente: una modifica dei dati non deve resettarlo da sola.
export const updateActivity = async (activityId, activityData) => {
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

  return withOptionalColumns(row, VALIDATION_COLUMNS, async (payload) => {
    const { data, error } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', activityId)
      .select().single();
    if (error) throw error;
    return normalizeActivity(data);
  });
};

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

  return withOptionalColumns(row, VALIDATION_COLUMNS, async (payload) => {
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
};

// Elimina un'attività
export const deleteActivity = async (activityId) => {
  const { error } = await supabase.from('activities').delete().eq('id', activityId);
  if (error) throw error;
  return true;
};
