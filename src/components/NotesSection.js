import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StickyNote, Plus, Edit2, Trash2, Save, X, Lock, Eye, Check } from 'lucide-react';
import { translate } from '../i18n';
import {
  getNotesForStudent, addNote, updateNote, deleteNote, markNoteRead,
  NOTE_CATEGORIES, NOTE_VISIBILITY,
} from '../data/notes.supabase';
import { getAttachmentsForStudent } from '../data/attachments.supabase';
import { supabase } from '../supabaseClient';
import { CardGridSkeleton } from './SkeletonLoader';
import { logError, notifyError } from '../utils/logger';
import AttachmentsPanel from './AttachmentsPanel';

/** Classe di categoria: il colore del segnalino è definito da .cat-* in styles/controls.css. */
const categoryClass = (category) => `cat-${category || 'general'}`;

const NotesSection = ({ studentId, language = 'it', isReadOnly = false, currentUser = null }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnce = useRef(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newVisibility, setNewVisibility] = useState(NOTE_VISIBILITY.SHARED);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingCategory, setEditingCategory] = useState('general');
  const [editingVisibility, setEditingVisibility] = useState(NOTE_VISIBILITY.SHARED);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [attachmentCounts, setAttachmentCounts] = useState({});

  const role = currentUser?.role || 'student';
  const isStaff = ['trainer', 'admin', 'app_admin', 'inspector'].includes(role);
  const canEdit = !isReadOnly;
  // L'apprendista vede solo le note condivise: quelle private sono appunti del
  // formatore su di lui, non comunicazioni per lui.
  const isRecipient = !isStaff && currentUser?.id === studentId;

  const loadNotes = async () => {
    if (!studentId) { setNotes([]); return; }
    try {
      const data = await getNotesForStudent(studentId);
      setNotes(data);
    } catch (error) {
      logError('NotesSection', 'Errore caricamento note', error);
      setNotes([]);
    } finally {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    }
  };

  // Come nel registro attività: un solo giro per i conteggi degli allegati.
  const loadAttachmentCounts = async () => {
    if (!studentId) { setAttachmentCounts({}); return; }
    try {
      const rows = await getAttachmentsForStudent(studentId);
      const counts = {};
      rows.forEach((row) => {
        if (row.entityType !== 'note') return;
        counts[row.entityId] = (counts[row.entityId] || 0) + 1;
      });
      setAttachmentCounts(counts);
    } catch (error) {
      logError('NotesSection', 'Errore caricamento allegati', error);
      setAttachmentCounts({});
    }
  };

  useEffect(() => {
    hasLoadedOnce.current = false;
    setIsLoading(true);
    loadNotes();
    loadAttachmentCounts();

    if (!studentId) return undefined;
    const channel = supabase
      .channel(`notes-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `student_id=eq.${studentId}` }, () => {
        loadNotes();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId]);

  const visibleNotes = useMemo(() => {
    const allowed = isStaff ? notes : notes.filter((note) => note.visibility !== NOTE_VISIBILITY.PRIVATE);
    return categoryFilter ? allowed.filter((note) => note.category === categoryFilter) : allowed;
  }, [notes, isStaff, categoryFilter]);

  // Quando è l'apprendista a leggere, le note condivise risultano lette: è
  // l'informazione che il formatore cerca quando scrive un richiamo.
  useEffect(() => {
    if (!isRecipient || isLoading) return;
    const unread = notes.filter((note) => !note.readAt && note.visibility !== NOTE_VISIBILITY.PRIVATE);
    if (unread.length === 0) return;

    Promise.all(unread.map((note) => markNoteRead(note.id, currentUser?.id || null).catch(() => null)))
      .then(() => loadNotes())
      .catch((error) => logError('NotesSection', 'Marcatura note lette fallita', error));
  }, [isRecipient, isLoading, notes.length]);

  const handleAdd = async () => {
    if (!newContent.trim() || !studentId) return;
    try {
      await addNote(
        studentId,
        newContent.trim(),
        currentUser?.id || null,
        currentUser?.name || null,
        { category: newCategory, visibility: isStaff ? newVisibility : NOTE_VISIBILITY.SHARED }
      );
      setNewContent('');
      setNewCategory('general');
      setNewVisibility(NOTE_VISIBILITY.SHARED);
      setShowAddForm(false);
      await loadNotes();
    } catch (error) {
      logError('NotesSection', 'Errore salvataggio nota', error);
      notifyError(t('notes.saveError'));
    }
  };

  const startEdit = (note) => {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
    setEditingCategory(note.category || 'general');
    setEditingVisibility(note.visibility || NOTE_VISIBILITY.SHARED);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditingContent('');
  };

  const handleUpdate = async (noteId) => {
    if (!editingContent.trim()) return;
    try {
      await updateNote(noteId, editingContent.trim(), {
        category: editingCategory,
        ...(isStaff ? { visibility: editingVisibility } : {}),
      });
      cancelEdit();
      await loadNotes();
    } catch (error) {
      logError('NotesSection', 'Errore modifica nota', error);
      notifyError(t('notes.saveError'));
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm(t('notes.confirmDelete'))) return;
    try {
      await deleteNote(noteId);
      await loadNotes();
    } catch (error) {
      logError('NotesSection', 'Errore eliminazione nota', error);
      notifyError(t('notes.deleteError'));
    }
  };

  const textareaStyle = { width: '100%' };

  if (isLoading) {
    return (
      <div className="notes-section">
        <CardGridSkeleton cards={3} />
      </div>
    );
  }

  return (
    <div className="notes-section">
      <div className="section-header">
        <div>
          <h2>{t('notes.title')}</h2>
          <p className="section-subtitle">{t('notes.subtitle')}</p>
        </div>
        {canEdit && !showAddForm && (
          <button type="button" className="primary-action-button" onClick={() => setShowAddForm(true)}>
            <Plus size={16} />
            {t('notes.addNote')}
          </button>
        )}
      </div>

      <div className="category-filter">
        <button
          type="button"
          className={`chip chip-filter ${categoryFilter === '' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('')}
        >
          {t('notes.allCategories')}
        </button>
        {NOTE_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={`chip chip-filter ${categoryFilter === category ? 'active' : ''}`}
            onClick={() => setCategoryFilter(categoryFilter === category ? '' : category)}
          >
            {t(`notes.category.${category}`)}
          </button>
        ))}
      </div>

      {showAddForm && canEdit && (
        <div className="note-card note-form-card">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="note-category">{t('notes.category')}</label>
              <select
                id="note-category"
                className="filter-input"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
              >
                {NOTE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{t(`notes.category.${category}`)}</option>
                ))}
              </select>
            </div>
            {isStaff && (
              <div className="form-field">
                <label htmlFor="note-visibility">{t('notes.visibility')}</label>
                <select
                  id="note-visibility"
                  className="filter-input"
                  value={newVisibility}
                  onChange={(event) => setNewVisibility(event.target.value)}
                >
                  <option value={NOTE_VISIBILITY.SHARED}>{t('notes.visibility.shared')}</option>
                  <option value={NOTE_VISIBILITY.PRIVATE}>{t('notes.visibility.private')}</option>
                </select>
              </div>
            )}
          </div>

          <textarea
            autoFocus
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t('notes.placeholder')}
            rows={4}
            style={textareaStyle}
          />
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action-button"
              onClick={() => { setShowAddForm(false); setNewContent(''); }}
            >
              {t('common.cancel')}
            </button>
            <button type="button" className="primary-action-button" onClick={handleAdd}>
              <Save size={14} />
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {visibleNotes.length === 0 ? (
        <div className="empty-state">
          <StickyNote size={36} />
          <p>{notes.length === 0 ? t('notes.noNotes') : t('notes.noMatches')}</p>
        </div>
      ) : (
        <div className="notes-list">
          {visibleNotes.map((note) => {
            const isUnread = !note.readAt && note.visibility !== NOTE_VISIBILITY.PRIVATE;
            return (
              <div
                key={note.id}
                className={`note-card ${categoryClass(note.category)} ${isUnread && isStaff ? 'note-unread' : ''}`}
              >
                {editingNoteId === note.id ? (
                  <>
                    <div className="form-row">
                      <div className="form-field">
                        <label htmlFor={`note-category-${note.id}`}>{t('notes.category')}</label>
                        <select
                          id={`note-category-${note.id}`}
                          className="filter-input"
                          value={editingCategory}
                          onChange={(event) => setEditingCategory(event.target.value)}
                        >
                          {NOTE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>{t(`notes.category.${category}`)}</option>
                          ))}
                        </select>
                      </div>
                      {isStaff && (
                        <div className="form-field">
                          <label htmlFor={`note-visibility-${note.id}`}>{t('notes.visibility')}</label>
                          <select
                            id={`note-visibility-${note.id}`}
                            className="filter-input"
                            value={editingVisibility}
                            onChange={(event) => setEditingVisibility(event.target.value)}
                          >
                            <option value={NOTE_VISIBILITY.SHARED}>{t('notes.visibility.shared')}</option>
                            <option value={NOTE_VISIBILITY.PRIVATE}>{t('notes.visibility.private')}</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <textarea
                      autoFocus
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={4}
                      style={textareaStyle}
                    />
                    <div className="form-actions">
                      <button type="button" className="secondary-action-button" onClick={cancelEdit}>
                        <X size={14} />
                      </button>
                      <button type="button" className="primary-action-button" onClick={() => handleUpdate(note.id)}>
                        <Save size={14} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="note-chips">
                      <span className={`chip chip-cat ${categoryClass(note.category)}`}>
                        {t(`notes.category.${note.category || 'general'}`)}
                      </span>
                      {note.visibility === NOTE_VISIBILITY.PRIVATE && (
                        <span className="chip chip-neutral" title={t('notes.visibility.private')}>
                          <Lock size={11} /> {t('notes.visibility.private')}
                        </span>
                      )}
                      {isStaff && note.visibility !== NOTE_VISIBILITY.PRIVATE && (
                        note.readAt ? (
                          <span className="chip chip-success" title={`${t('notes.readOn')} ${new Date(note.readAt).toLocaleString(locale)}`}>
                            <Check size={11} /> {t('notes.read')}
                          </span>
                        ) : (
                          <span className="chip chip-warning">
                            <Eye size={11} /> {t('notes.unread')}
                          </span>
                        )
                      )}
                    </div>

                    <p className="note-text">{note.content}</p>

                    <div className="note-footer">
                      <span className="note-meta">
                        {note.authorName ? `${note.authorName} · ` : ''}
                        {new Date(note.createdAt).toLocaleString(locale)}
                      </span>
                      <div className="note-actions">
                        <AttachmentsPanel
                          entityType="note"
                          entityId={note.id}
                          studentId={studentId}
                          count={attachmentCounts[note.id] || 0}
                          onChange={loadAttachmentCounts}
                          currentUser={currentUser}
                          language={language}
                          isReadOnly={isReadOnly}
                        />
                        {canEdit && (
                          <>
                            <button type="button" onClick={() => startEdit(note)} aria-label={t('common.edit')}>
                              <Edit2 size={15} />
                            </button>
                            <button type="button" className="danger" onClick={() => handleDelete(note.id)} aria-label={t('common.delete')}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NotesSection;
