import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { withOptionalColumns } from './schemaFallback';
import { writeOrQueue, registerExecutor, overlayPending } from './offlineQueue';
import { logDataChange, AUDIT_EVENTS } from './auditLog.supabase';
import { SYNC_ENTITY } from '../utils/syncQueue';

/** Categorie di nota (chiave i18n: `notes.category.<id>`). */
export const NOTE_CATEGORIES = ['general', 'positive', 'warning', 'meeting', 'goal'];

/** Una nota privata resta visibile solo a formatore/admin/ispettore. */
export const NOTE_VISIBILITY = { SHARED: 'shared', PRIVATE: 'private' };

/** Colonne introdotte da supabase-notes-structured.sql. */
const STRUCTURED_COLUMNS = ['category', 'visibility', 'read_at', 'read_by'];

// Normalizza una nota dal formato Supabase al formato app
const normalizeNote = (n) => ({
  id: n.id,
  studentId: n.student_id,
  content: n.content,
  category: n.category || 'general',
  visibility: n.visibility || NOTE_VISIBILITY.SHARED,
  readAt: n.read_at || null,
  readBy: n.read_by ?? null,
  authorId: n.author_id,
  authorName: n.author_name || '',
  createdAt: n.created_at,
  updatedAt: n.updated_at,
});

const byCreatedDesc = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

const fetchNotesForStudent = async (studentId) =>
  readThroughCache(`notes:${studentId}`, async () => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(normalizeNote);
  });

// Leggi tutte le note di un apprendista (con le modifiche ancora in coda, se offline)
export const getNotesForStudent = async (studentId) => {
  const rows = await fetchNotesForStudent(studentId);
  return overlayPending(SYNC_ENTITY.NOTE, rows, { studentIds: [studentId], sort: byCreatedDesc });
};

const fetchNotesForStudents = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return [];
  const cacheKey = `notes:many:${[...studentIds].sort().join(',')}`;
  return readThroughCache(cacheKey, async () => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(normalizeNote);
  });
};

/** Note di più apprendisti insieme (ricerca globale multi-apprendista). */
export const getNotesForStudents = async (studentIds) => {
  const rows = await fetchNotesForStudents(studentIds);
  return overlayPending(SYNC_ENTITY.NOTE, rows, { studentIds, sort: byCreatedDesc });
};

// Aggiungi una nota
const addNoteOnline = async (studentId, content, authorId = null, authorName = null, options = {}) => {
  const row = {
    student_id: studentId,
    content,
    author_id: authorId,
    author_name: authorName,
    category: options.category || 'general',
    visibility: options.visibility || NOTE_VISIBILITY.SHARED,
  };

  const created = await withOptionalColumns(row, STRUCTURED_COLUMNS, async (payload) => {
    const { data, error } = await supabase.from('notes').insert([payload]).select().single();
    if (error) throw error;
    return normalizeNote(data);
  });

  // Nel log solo categoria e visibilità: il testo della nota può essere privato.
  await logDataChange({
    event: AUDIT_EVENTS.NOTE_CREATED,
    entity: 'note',
    entityId: created.id,
    studentId,
    details: { category: created.category, visibility: created.visibility },
  });
  return created;
};

export const addNote = async (studentId, content, authorId = null, authorName = null, options = {}) => {
  const now = new Date().toISOString();
  return writeOrQueue({
    entity: SYNC_ENTITY.NOTE,
    action: 'create',
    studentId,
    args: [studentId, content, authorId, authorName, options],
    row: {
      studentId,
      content,
      category: options.category || 'general',
      visibility: options.visibility || NOTE_VISIBILITY.SHARED,
      readAt: null,
      readBy: null,
      authorId,
      authorName: authorName || '',
      createdAt: now,
      updatedAt: now,
    },
    run: () => addNoteOnline(studentId, content, authorId, authorName, options),
  });
};
registerExecutor('note:create', (args) => addNoteOnline(...args));

// Aggiorna una nota (contenuto e, se passati, categoria/visibilità)
const updateNoteOnline = async (noteId, content, options = {}) => {
  const row = { content, updated_at: new Date().toISOString() };
  if (options.category !== undefined) row.category = options.category;
  if (options.visibility !== undefined) row.visibility = options.visibility;

  const updated = await withOptionalColumns(row, STRUCTURED_COLUMNS, async (payload) => {
    const { data, error } = await supabase
      .from('notes')
      .update(payload)
      .eq('id', noteId)
      .select().single();
    if (error) throw error;
    return normalizeNote(data);
  });

  await logDataChange({
    event: AUDIT_EVENTS.NOTE_UPDATED,
    entity: 'note',
    entityId: updated.id,
    studentId: updated.studentId,
    details: { category: updated.category, visibility: updated.visibility },
  });
  return updated;
};

export const updateNote = async (noteId, content, options = {}) =>
  writeOrQueue({
    entity: SYNC_ENTITY.NOTE,
    action: 'update',
    targetId: noteId,
    args: [noteId, content, options],
    patch: {
      content,
      updatedAt: new Date().toISOString(),
      ...(options.category !== undefined ? { category: options.category } : {}),
      ...(options.visibility !== undefined ? { visibility: options.visibility } : {}),
    },
    run: () => updateNoteOnline(noteId, content, options),
  });
registerExecutor('note:update', (args) => updateNoteOnline(...args));

/**
 * Segna una nota come letta dal destinatario.
 * Chiamata dall'apprendista quando apre la sezione Note: se la nota è già
 * marcata non si riscrive nulla.
 */
export const markNoteRead = async (noteId, readerId = null) => {
  const row = { read_at: new Date().toISOString(), read_by: readerId };

  return withOptionalColumns(row, STRUCTURED_COLUMNS, async (payload) => {
    if (Object.keys(payload).length === 0) return null;
    const { data, error } = await supabase
      .from('notes')
      .update(payload)
      .eq('id', noteId)
      .select().single();
    if (error) throw error;
    return normalizeNote(data);
  });
};

// Elimina una nota
const deleteNoteOnline = async (noteId) => {
  const { data, error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .select('student_id, category, visibility');
  if (error) throw error;

  const removed = Array.isArray(data) ? data[0] : null;
  await logDataChange({
    event: AUDIT_EVENTS.NOTE_DELETED,
    entity: 'note',
    entityId: noteId,
    studentId: removed?.student_id ?? null,
    details: { category: removed?.category ?? null, visibility: removed?.visibility ?? null },
  });
  return true;
};

export const deleteNote = async (noteId) =>
  writeOrQueue({
    entity: SYNC_ENTITY.NOTE,
    action: 'delete',
    targetId: noteId,
    args: [noteId],
    run: () => deleteNoteOnline(noteId),
  });
registerExecutor('note:delete', (args) => deleteNoteOnline(...args));
