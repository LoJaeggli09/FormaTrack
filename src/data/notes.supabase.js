import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { withOptionalColumns } from './schemaFallback';

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

// Leggi tutte le note di un apprendista
export const getNotesForStudent = async (studentId) =>
  readThroughCache(`notes:${studentId}`, async () => {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(normalizeNote);
  });

/** Note di più apprendisti insieme (ricerca globale multi-apprendista). */
export const getNotesForStudents = async (studentIds) => {
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

// Aggiungi una nota
export const addNote = async (studentId, content, authorId = null, authorName = null, options = {}) => {
  const row = {
    student_id: studentId,
    content,
    author_id: authorId,
    author_name: authorName,
    category: options.category || 'general',
    visibility: options.visibility || NOTE_VISIBILITY.SHARED,
  };

  return withOptionalColumns(row, STRUCTURED_COLUMNS, async (payload) => {
    const { data, error } = await supabase.from('notes').insert([payload]).select().single();
    if (error) throw error;
    return normalizeNote(data);
  });
};

// Aggiorna una nota (contenuto e, se passati, categoria/visibilità)
export const updateNote = async (noteId, content, options = {}) => {
  const row = { content, updated_at: new Date().toISOString() };
  if (options.category !== undefined) row.category = options.category;
  if (options.visibility !== undefined) row.visibility = options.visibility;

  return withOptionalColumns(row, STRUCTURED_COLUMNS, async (payload) => {
    const { data, error } = await supabase
      .from('notes')
      .update(payload)
      .eq('id', noteId)
      .select().single();
    if (error) throw error;
    return normalizeNote(data);
  });
};

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
export const deleteNote = async (noteId) => {
  const { error } = await supabase.from('notes').delete().eq('id', noteId);
  if (error) throw error;
  return true;
};
