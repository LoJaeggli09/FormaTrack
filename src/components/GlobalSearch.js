import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, X, StickyNote, ClipboardList, CalendarClock, CalendarDays, Award, Users, User } from 'lucide-react';
import { translate } from '../i18n';
import { getNotesForStudent, getNotesForStudents } from '../data/notes.supabase';
import { getActivitiesForStudent, getActivitiesForStudents } from '../data/activities.supabase';
import { getEventsForStudent, getEventsForStudents } from '../data/calendar.supabase';
import { loadGrades, getGradesForStudents } from '../data/grades.supabase';
import { logError } from '../utils/logger';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS_PER_GROUP = 8;

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Minuscolo + niente accenti, così "attivita" trova "attività". */
const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Ricerca globale su note, attività, prenotazioni, eventi di calendario e voti.
 *
 * Formatore, admin e ispettore possono allargare la ricerca a tutti gli
 * apprendisti che vedono: selezionando un risultato l'app cambia apprendista
 * attivo e apre la sezione giusta.
 *
 * I dati passano dalle stesse funzioni delle sezioni, quindi sfruttano la cache
 * offline: riaprire la ricerca non ricarica tutto da Supabase.
 */
const GlobalSearch = ({
  isOpen = false,
  onClose = () => {},
  onNavigate = () => {},
  studentId = null,
  studentName = '',
  students = [],
  onSelectStudent = null,
  language = 'it',
}) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const canSearchAll = students.length > 1 && typeof onSelectStudent === 'function';

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('current');
  const [dataset, setDataset] = useState({ notes: [], activities: [], events: [], grades: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const studentNameById = useMemo(() => {
    const map = {};
    students.forEach((student) => { map[student.id] = student.name; });
    if (studentId && studentName) map[studentId] = studentName;
    return map;
  }, [students, studentId, studentName]);

  const studentIdsKey = students.map((student) => student.id).join(',');

  // Carica i dati all'apertura (e quando si cambia raggio d'azione)
  useEffect(() => {
    if (!isOpen) return undefined;

    const searchAll = scope === 'all' && canSearchAll;
    const ids = students.map((student) => student.id);
    if (!searchAll && !studentId) return undefined;

    let cancelled = false;
    setIsLoading(true);

    const loaders = searchAll
      ? [
          getNotesForStudents(ids).catch(() => []),
          getActivitiesForStudents(ids).catch(() => []),
          getEventsForStudents(ids).catch(() => []),
          getGradesForStudents(ids).catch(() => []),
        ]
      : [
          getNotesForStudent(studentId).catch(() => []),
          getActivitiesForStudent(studentId).catch(() => []),
          getEventsForStudent(studentId).catch(() => []),
          loadGrades(studentId).catch(() => []),
        ];

    Promise.all(loaders)
      .then(([notes, activities, events, grades]) => {
        if (!cancelled) setDataset({ notes, activities, events, grades });
      })
      .catch((error) => {
        logError('GlobalSearch', 'Errore caricamento dati ricerca', error);
        if (!cancelled) setDataset({ notes: [], activities: [], events: [], grades: [] });
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, studentId, scope, canSearchAll, studentIdsKey]);

  // Reset e focus a ogni apertura
  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const formatDate = useCallback((isoDate) => {
    if (!isoDate) return '';
    const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  }, [locale]);

  const isAllScope = scope === 'all' && canSearchAll;

  // Risultati piatti: l'indice attivo scorre l'intero elenco, i gruppi sono
  // solo intestazioni visive.
  const results = useMemo(() => {
    const needle = normalize(query).trim();
    if (needle.length < MIN_QUERY_LENGTH) return [];

    const matches = (...fields) => fields.some((field) => normalize(field).includes(needle));
    const today = todayIso();
    const found = [];

    // In ricerca multi-apprendista il nome finisce in coda al sottotitolo:
    // senza, i risultati di persone diverse sono indistinguibili.
    const withOwner = (ownerId, parts) => {
      const list = parts.filter(Boolean);
      if (isAllScope && studentNameById[ownerId]) list.push(studentNameById[ownerId]);
      return list.join(' · ');
    };

    const push = (group, items) => {
      items.slice(0, MAX_RESULTS_PER_GROUP).forEach((item) => found.push({ group, ...item }));
    };

    push('notes', dataset.notes.filter((note) => matches(note.content, note.authorName)).map((note) => ({
      key: `note-${note.id}`,
      view: 'notes',
      studentId: note.studentId,
      title: note.content,
      subtitle: withOwner(note.studentId, [
        note.authorName,
        note.createdAt ? new Date(note.createdAt).toLocaleDateString(locale) : '',
      ]),
    })));

    const matchedActivities = dataset.activities.filter((activity) =>
      matches(activity.description, activity.activityType, activity.site, activity.ticket));

    push('activities', matchedActivities.filter((a) => a.date < today).map((activity) => ({
      key: `activity-${activity.id}`,
      view: 'activities',
      studentId: activity.studentId,
      title: activity.description || activity.activityType,
      subtitle: withOwner(activity.studentId, [formatDate(activity.date), activity.activityType, activity.site]),
    })));

    push('booking', matchedActivities.filter((a) => a.date >= today).map((activity) => ({
      key: `booking-${activity.id}`,
      view: 'booking',
      studentId: activity.studentId,
      title: activity.description || activity.activityType,
      subtitle: withOwner(activity.studentId, [formatDate(activity.date), activity.startTime, activity.site]),
    })));

    push('calendar', dataset.events.filter((event) => matches(event.title, event.description)).map((event) => ({
      key: `event-${event.id}`,
      view: 'calendar',
      studentId: event.studentId,
      title: event.title,
      subtitle: withOwner(event.studentId, [formatDate(event.date), event.startTime]),
    })));

    push('grading', dataset.grades.filter((grade) =>
      matches(grade.subject, grade.studentComment, grade.trainerComment, grade.grade)).map((grade) => ({
      key: `grade-${grade.id}`,
      view: 'grading',
      studentId: grade.utente_id,
      title: `${grade.subject || ''} — ${grade.grade ?? ''}`,
      subtitle: withOwner(grade.utente_id, [grade.date ? new Date(grade.date).toLocaleDateString(locale) : '']),
    })));

    return found;
  }, [query, dataset, locale, formatDate, isAllScope, studentNameById]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const groupLabels = {
    notes: t('notes.title'),
    activities: t('activities.title'),
    booking: t('booking.title'),
    calendar: t('calendar.title'),
    grading: t('grading.title'),
  };

  const groupIcons = {
    notes: <StickyNote size={16} />,
    activities: <ClipboardList size={16} />,
    booking: <CalendarClock size={16} />,
    calendar: <CalendarDays size={16} />,
    grading: <Award size={16} />,
  };

  const selectResult = useCallback((result) => {
    if (!result) return;
    if (result.studentId && result.studentId !== studentId && typeof onSelectStudent === 'function') {
      onSelectStudent(result.studentId);
    }
    onNavigate(result.view);
    onClose();
  }, [onNavigate, onClose, onSelectStudent, studentId]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  };

  // Mantiene la voce selezionata dentro l'area visibile
  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const showHint = normalize(query).trim().length < MIN_QUERY_LENGTH;
  let renderedGroup = null;

  return (
    <div className="search-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="search-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
      >
        <div className="search-input-row">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
          />
          <button type="button" onClick={onClose} aria-label={t('common.cancel')}>
            <X size={18} />
          </button>
        </div>

        <div className="search-scope">
          {canSearchAll ? (
            <div className="search-scope-toggle" role="group" aria-label={t('search.scopeLabel')}>
              <button
                type="button"
                className={scope === 'current' ? 'active' : ''}
                onClick={() => setScope('current')}
              >
                <User size={14} />
                {studentName || t('search.currentStudent')}
              </button>
              <button
                type="button"
                className={scope === 'all' ? 'active' : ''}
                onClick={() => setScope('all')}
              >
                <Users size={14} />
                {t('search.allStudents').replace('{count}', String(students.length))}
              </button>
            </div>
          ) : (
            studentName && <span>{t('search.scope')} <strong>{studentName}</strong></span>
          )}
        </div>

        <div className="search-results" ref={listRef}>
          {isLoading && <div className="search-message">{t('search.loading')}</div>}

          {!isLoading && showHint && (
            <div className="search-message">{t('search.hint')}</div>
          )}

          {!isLoading && !showHint && results.length === 0 && (
            <div className="search-message">{t('search.noResults')}</div>
          )}

          {!isLoading && !showHint && results.map((result, index) => {
            const isNewGroup = result.group !== renderedGroup;
            renderedGroup = result.group;
            return (
              <React.Fragment key={result.key}>
                {isNewGroup && (
                  <div className="search-group-label">
                    {groupIcons[result.group]}
                    <span>{groupLabels[result.group]}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="search-result"
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                >
                  <span className="search-result-title">{result.title}</span>
                  {result.subtitle && <span className="search-result-subtitle">{result.subtitle}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('search.navigate')}</span>
          <span><kbd>Enter</kbd> {t('search.select')}</span>
          <span><kbd>Esc</kbd> {t('search.close')}</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
