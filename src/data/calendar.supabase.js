import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { withOptionalColumns } from './schemaFallback';
import { writeOrQueue, registerExecutor, overlayPending } from './offlineQueue';
import { SYNC_ENTITY } from '../utils/syncQueue';

/** Cadenze supportate dagli eventi ricorrenti. */
export const RECURRENCE_OPTIONS = ['none', 'weekly', 'biweekly', 'monthly'];

/** Colonne introdotte da supabase-calendar-recurrence.sql. */
const RECURRENCE_COLUMNS = ['recurrence', 'recurrence_end'];

// Normalizza un evento dal formato Supabase al formato app
const normalizeEvent = (e) => ({
  id: e.id,
  studentId: e.student_id,
  title: e.title,
  description: e.description || '',
  date: e.event_date,
  startTime: e.start_time,
  endTime: e.end_time,
  recurrence: e.recurrence || 'none',
  recurrenceEnd: e.recurrence_end || null,
  createdBy: e.created_by,
  createdAt: e.created_at,
});

const byDateAsc = (a, b) => String(a.date).localeCompare(String(b.date));

const fetchEventsForStudent = async (studentId) =>
  readThroughCache(`events:${studentId}`, async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('student_id', studentId)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return data.map(normalizeEvent);
  });

// Leggi tutti gli eventi di un apprendista (con le modifiche ancora in coda, se offline)
export const getEventsForStudent = async (studentId) => {
  const rows = await fetchEventsForStudent(studentId);
  return overlayPending(SYNC_ENTITY.EVENT, rows, { studentIds: [studentId], sort: byDateAsc });
};

const fetchEventsForStudents = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return [];
  const cacheKey = `events:many:${[...studentIds].sort().join(',')}`;
  return readThroughCache(cacheKey, async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .in('student_id', studentIds)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return data.map(normalizeEvent);
  });
};

/** Eventi di più apprendisti insieme (ricerca globale multi-apprendista). */
export const getEventsForStudents = async (studentIds) => {
  const rows = await fetchEventsForStudents(studentIds);
  return overlayPending(SYNC_ENTITY.EVENT, rows, { studentIds, sort: byDateAsc });
};

// Aggiungi un evento
const addEventOnline = async (studentId, eventData, createdBy = null) => {
  const row = {
    student_id: studentId,
    title: eventData.title,
    description: eventData.description || null,
    event_date: eventData.date,
    start_time: eventData.startTime || null,
    end_time: eventData.endTime || null,
    recurrence: eventData.recurrence || 'none',
    recurrence_end: eventData.recurrenceEnd || null,
    created_by: createdBy,
  };

  return withOptionalColumns(row, RECURRENCE_COLUMNS, async (payload) => {
    const { data, error } = await supabase.from('calendar_events').insert([payload]).select().single();
    if (error) throw error;
    return normalizeEvent(data);
  });
};

export const addEvent = async (studentId, eventData, createdBy = null) =>
  writeOrQueue({
    entity: SYNC_ENTITY.EVENT,
    action: 'create',
    studentId,
    args: [studentId, eventData, createdBy],
    row: {
      studentId,
      title: eventData.title,
      description: eventData.description || '',
      date: eventData.date,
      startTime: eventData.startTime || null,
      endTime: eventData.endTime || null,
      recurrence: eventData.recurrence || 'none',
      recurrenceEnd: eventData.recurrenceEnd || null,
      createdBy,
      createdAt: new Date().toISOString(),
    },
    run: () => addEventOnline(studentId, eventData, createdBy),
  });
registerExecutor('event:create', (args) => addEventOnline(...args));

// Aggiorna un evento
const updateEventOnline = async (eventId, eventData) => {
  const row = {
    title: eventData.title,
    description: eventData.description || null,
    event_date: eventData.date,
    start_time: eventData.startTime || null,
    end_time: eventData.endTime || null,
    recurrence: eventData.recurrence || 'none',
    recurrence_end: eventData.recurrenceEnd || null,
  };

  return withOptionalColumns(row, RECURRENCE_COLUMNS, async (payload) => {
    const { data, error } = await supabase
      .from('calendar_events')
      .update(payload)
      .eq('id', eventId)
      .select().single();
    if (error) throw error;
    return normalizeEvent(data);
  });
};

export const updateEvent = async (eventId, eventData) =>
  writeOrQueue({
    entity: SYNC_ENTITY.EVENT,
    action: 'update',
    targetId: eventId,
    args: [eventId, eventData],
    patch: {
      title: eventData.title,
      description: eventData.description || '',
      date: eventData.date,
      startTime: eventData.startTime || null,
      endTime: eventData.endTime || null,
      recurrence: eventData.recurrence || 'none',
      recurrenceEnd: eventData.recurrenceEnd || null,
    },
    run: () => updateEventOnline(eventId, eventData),
  });
registerExecutor('event:update', (args) => updateEventOnline(...args));

// Elimina un evento
const deleteEventOnline = async (eventId) => {
  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
  if (error) throw error;
  return true;
};

export const deleteEvent = async (eventId) =>
  writeOrQueue({
    entity: SYNC_ENTITY.EVENT,
    action: 'delete',
    targetId: eventId,
    args: [eventId],
    run: () => deleteEventOnline(eventId),
  });
registerExecutor('event:delete', (args) => deleteEventOnline(...args));
