import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { withOptionalColumns } from './schemaFallback';

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

// Leggi tutti gli eventi di un apprendista
export const getEventsForStudent = async (studentId) =>
  readThroughCache(`events:${studentId}`, async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('student_id', studentId)
      .order('event_date', { ascending: true });
    if (error) throw error;
    return data.map(normalizeEvent);
  });

/** Eventi di più apprendisti insieme (ricerca globale multi-apprendista). */
export const getEventsForStudents = async (studentIds) => {
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

// Aggiungi un evento
export const addEvent = async (studentId, eventData, createdBy = null) => {
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

// Aggiorna un evento
export const updateEvent = async (eventId, eventData) => {
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

// Elimina un evento
export const deleteEvent = async (eventId) => {
  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
  if (error) throw error;
  return true;
};
