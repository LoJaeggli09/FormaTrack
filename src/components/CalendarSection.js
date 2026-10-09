import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Edit2, Trash2, Save, CalendarDays, ClipboardList,
  Repeat, CalendarX, Download, Printer,
} from 'lucide-react';
import { translate } from '../i18n';
import { getEventsForStudent, addEvent, updateEvent, deleteEvent, RECURRENCE_OPTIONS } from '../data/calendar.supabase';
import { getActivitiesForStudent, updateActivity, deleteActivity } from '../data/activities.supabase';
import { getAbsencesForStudent, expandAbsenceDates } from '../data/absences.supabase';
import { supabase } from '../supabaseClient';
import { SectionSkeleton } from './SkeletonLoader';
import { logError, notifyError, notifySuccess } from '../utils/logger';
import { expandEvents } from '../utils/recurrence';
import { exportCalendarToIcs } from '../utils/icsExport';

const toIsoDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Categoria per tipo di "appuntamento" nel calendario: colore e tinta sono definiti
// dalle classi .cat-* in styles/controls.css (stessi token ovunque).
const EVENT_CAT = 'cat-ev';      // verde — appuntamenti creati dal calendario
const ACTIVITY_CAT = 'cat-act';  // giallo — attività già svolte/odierne
const BOOKING_CAT = 'cat-book';  // arancione — prenotazioni future
const ABSENCE_CAT = 'cat-abs';   // rosso — assenze

const emptyEventForm = { title: '', description: '', startTime: '', endTime: '', recurrence: 'none', recurrenceEnd: '' };
const emptyActivityForm = {
  activityType: '', description: '', startTime: '', trainerTime: '', apprenticeCount: '',
  durationMinutes: '', site: '', ticket: ''
};

const ACTIVITY_TYPE_SUGGESTIONS = ['Formazione', 'Manutenzione', 'Supporto cliente', 'Riunione', 'Altro'];

const CalendarSection = ({ studentId, student = null, language = 'it', isReadOnly = false, currentUser = null }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [events, setEvents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const hasLoadedOnce = useRef(false);

  const [viewMode, setViewMode] = useState('month');
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return monday;
  });
  const [selectedDate, setSelectedDate] = useState(toIsoDate(new Date()));

  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formData, setFormData] = useState(emptyEventForm);

  const [editingActivityId, setEditingActivityId] = useState(null);
  const [activityFormData, setActivityFormData] = useState(emptyActivityForm);

  const canEdit = !isReadOnly;

  const loadEvents = async () => {
    if (!studentId) { setEvents([]); return; }
    try {
      setEvents(await getEventsForStudent(studentId));
    } catch (error) {
      logError('CalendarSection', 'Errore caricamento eventi', error);
      setEvents([]);
    } finally {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    }
  };

  const loadActivities = async () => {
    if (!studentId) { setActivities([]); return; }
    try {
      setActivities(await getActivitiesForStudent(studentId));
    } catch (error) {
      logError('CalendarSection', 'Errore caricamento attività', error);
      setActivities([]);
    }
  };

  const loadAbsences = async () => {
    if (!studentId) { setAbsences([]); return; }
    try {
      setAbsences(await getAbsencesForStudent(studentId));
    } catch (error) {
      logError('CalendarSection', 'Errore caricamento assenze', error);
      setAbsences([]);
    }
  };

  useEffect(() => {
    hasLoadedOnce.current = false;
    setIsLoading(true);
    loadEvents();
    loadActivities();
    loadAbsences();

    if (!studentId) return undefined;
    const eventsChannel = supabase
      .channel(`calendar-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `student_id=eq.${studentId}` }, () => {
        loadEvents();
      })
      .subscribe();
    const activitiesChannel = supabase
      .channel(`calendar-activities-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `student_id=eq.${studentId}` }, () => {
        loadActivities();
      })
      .subscribe();
    const absencesChannel = supabase
      .channel(`calendar-absences-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences', filter: `student_id=eq.${studentId}` }, () => {
        loadAbsences();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(activitiesChannel);
      supabase.removeChannel(absencesChannel);
    };
  }, [studentId]);

  // ── Griglia (mese o settimana) ──────────────────────────────────────────────
  const calendarCells = useMemo(() => {
    if (viewMode === 'week') {
      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + index);
        return toIsoDate(day);
      });
    }

    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // lunedì = 0

    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(toIsoDate(new Date(year, month, day)));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMode, viewMonth, weekStart]);

  const visibleRange = useMemo(() => {
    const dates = calendarCells.filter(Boolean);
    return { start: dates[0] || '1970-01-01', end: dates[dates.length - 1] || '2099-12-31' };
  }, [calendarCells]);

  // Le ricorrenze vivono solo qui: nel database resta la riga della prima occorrenza.
  const expandedEvents = useMemo(
    () => expandEvents(events, visibleRange.start, visibleRange.end),
    [events, visibleRange]
  );

  const eventsByDate = useMemo(() => {
    const map = {};
    expandedEvents.forEach((event) => {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    });
    return map;
  }, [expandedEvents]);

  const activitiesByDate = useMemo(() => {
    const map = {};
    activities.forEach((activity) => {
      if (!map[activity.date]) map[activity.date] = [];
      map[activity.date].push(activity);
    });
    return map;
  }, [activities]);

  const absencesByDate = useMemo(() => {
    const map = {};
    absences.forEach((absence) => {
      expandAbsenceDates(absence).forEach((iso) => {
        if (!map[iso]) map[iso] = [];
        map[iso].push(absence);
      });
    });
    return map;
  }, [absences]);

  const weekDayLabels = useMemo(() => {
    const base = new Date(2023, 0, 2); // un lunedì
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: 'short' });
    });
  }, [locale]);

  const periodLabel = viewMode === 'week'
    ? (() => {
        const end = new Date(weekStart);
        end.setDate(weekStart.getDate() + 6);
        const fmt = (date) => date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
        return `${fmt(weekStart)} – ${fmt(end)} ${end.getFullYear()}`;
      })()
    : viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const goToPrev = () => {
    if (viewMode === 'week') {
      setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
    } else {
      setViewMonth((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
    }
  };

  const goToNext = () => {
    if (viewMode === 'week') {
      setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
    } else {
      setViewMonth((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });
    }
  };

  const goToToday = () => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    setWeekStart(monday);
    const firstOfMonth = new Date(today);
    firstOfMonth.setDate(1);
    setViewMonth(firstOfMonth);
    setSelectedDate(toIsoDate(today));
  };

  const todayIso = toIsoDate(new Date());
  const isBooking = (activity) => activity.date > todayIso;
  const activityCat = (activity) => (isBooking(activity) ? BOOKING_CAT : ACTIVITY_CAT);

  const selectedEvents = (eventsByDate[selectedDate] || [])
    .slice()
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const selectedActivities = (activitiesByDate[selectedDate] || [])
    .slice()
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const selectedAbsences = absencesByDate[selectedDate] || [];

  // ── Eventi ──────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormData(emptyEventForm);
    setEditingEvent(null);
    setShowForm(false);
  };

  const startAdd = () => {
    setEditingEvent(null);
    setFormData(emptyEventForm);
    setShowForm(true);
    setEditingActivityId(null);
  };

  const startEdit = (occurrence) => {
    // Le occorrenze non esistono nel database: si modifica sempre la serie.
    const original = events.find((event) => event.id === occurrence.seriesId) || occurrence;
    setEditingEvent(original);
    setFormData({
      title: original.title,
      description: original.description || '',
      startTime: original.startTime || '',
      endTime: original.endTime || '',
      recurrence: original.recurrence || 'none',
      recurrenceEnd: original.recurrenceEnd || '',
    });
    setShowForm(true);
    setEditingActivityId(null);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) return;
    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, { ...formData, date: editingEvent.date });
      } else {
        await addEvent(studentId, { ...formData, date: selectedDate }, currentUser?.id || null);
      }
      resetForm();
      await loadEvents();
    } catch (error) {
      logError('CalendarSection', 'Errore salvataggio evento', error);
      notifyError(t('calendar.saveError'));
    }
  };

  const handleDelete = async (occurrence) => {
    const isSeries = (occurrence.recurrence || 'none') !== 'none';
    if (!window.confirm(isSeries ? t('calendar.confirmDeleteSeries') : t('calendar.confirmDelete'))) return;
    try {
      await deleteEvent(occurrence.seriesId || occurrence.id);
      await loadEvents();
    } catch (error) {
      logError('CalendarSection', 'Errore eliminazione evento', error);
      notifyError(t('calendar.deleteError'));
    }
  };

  // ── Attività dal pannello del giorno ────────────────────────────────────────
  const startEditActivity = (activity) => {
    setEditingActivityId(activity.id);
    setActivityFormData({
      activityType: activity.activityType || '',
      description: activity.description || '',
      startTime: activity.startTime || '',
      trainerTime: activity.trainerTime || '',
      apprenticeCount: activity.apprenticeCount ?? '',
      durationMinutes: activity.durationMinutes ?? '',
      site: activity.site || '',
      ticket: activity.ticket || '',
    });
    setShowForm(false);
  };

  const cancelActivityEdit = () => {
    setEditingActivityId(null);
    setActivityFormData(emptyActivityForm);
  };

  const handleSaveActivity = async (activityId) => {
    if (!activityFormData.description.trim()) return;
    try {
      await updateActivity(activityId, {
        date: selectedDate,
        description: activityFormData.description.trim(),
        activityType: activityFormData.activityType.trim(),
        startTime: activityFormData.startTime,
        trainerTime: activityFormData.trainerTime,
        apprenticeCount: activityFormData.apprenticeCount ? parseInt(activityFormData.apprenticeCount, 10) : null,
        durationMinutes: activityFormData.durationMinutes ? parseInt(activityFormData.durationMinutes, 10) : null,
        site: activityFormData.site.trim(),
        ticket: activityFormData.ticket.trim(),
      });
      cancelActivityEdit();
      await loadActivities();
    } catch (error) {
      logError('CalendarSection', 'Errore modifica attività', error);
      notifyError(`${t('activities.saveError')}: ${error.message || error}`);
    }
  };

  const handleDeleteActivity = async (activityId) => {
    if (!window.confirm(t('activities.confirmDelete'))) return;
    try {
      await deleteActivity(activityId);
      await loadActivities();
    } catch (error) {
      logError('CalendarSection', 'Errore eliminazione attività', error);
      notifyError(t('activities.deleteError'));
    }
  };

  // ── Esportazione ────────────────────────────────────────────────────────────
  const handleExportIcs = async () => {
    setIsExporting(true);
    try {
      const result = await exportCalendarToIcs({
        events,
        activities,
        absences,
        studentName: student?.name || '',
        language,
        rangeStart: '2000-01-01',
        rangeEnd: '2099-12-31',
      });
      if (result?.success) notifySuccess(t('calendar.icsExported'));
      else if (result && !result.canceled) notifyError(result.error || t('export.error'));
    } finally {
      setIsExporting(false);
    }
  };

  const inputStyle = { width: '100%' };

  if (isLoading) {
    return (
      <div className="calendar-section">
        <SectionSkeleton />
      </div>
    );
  }

  return (
    <div className="calendar-section">
      <div className="section-header no-print">
        <div>
          <h2>{t('calendar.title')}</h2>
          <p className="section-subtitle">{t('calendar.subtitle')}</p>
        </div>
        <div className="export-actions">
          <button type="button" className="export-button" onClick={handleExportIcs} disabled={isExporting}>
            <Download size={15} />
            {isExporting ? t('export.inProgress') : t('calendar.exportIcs')}
          </button>
          <button type="button" className="export-button" onClick={() => window.print()}>
            <Printer size={15} />
            {t('calendar.print')}
          </button>
        </div>
      </div>

      <div className="calendar-legend">
        <span className={EVENT_CAT}><span className="legend-dot" />{t('calendar.legendEvents')}</span>
        <span className={ACTIVITY_CAT}><span className="legend-dot" />{t('calendar.legendActivities')}</span>
        <span className={BOOKING_CAT}><span className="legend-dot" />{t('calendar.legendBookings')}</span>
        <span className={ABSENCE_CAT}><span className="legend-dot" />{t('calendar.legendAbsences')}</span>
      </div>

      <div className="calendar-toolbar">
        <button type="button" className="icon-button" onClick={goToPrev} aria-label={t('calendar.previous')}>
          <ChevronLeft size={18} />
        </button>
        <h3 className="calendar-period-label">{periodLabel}</h3>
        <button type="button" className="icon-button" onClick={goToNext} aria-label={t('calendar.next')}>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="secondary-action-button" onClick={goToToday}>
          {t('calendar.today')}
        </button>

        <div className="view-toggle no-print" role="group" aria-label={t('calendar.viewMode')}>
          <button
            type="button"
            className={viewMode === 'month' ? 'active' : ''}
            onClick={() => setViewMode('month')}
          >
            {t('calendar.monthView')}
          </button>
          <button
            type="button"
            className={viewMode === 'week' ? 'active' : ''}
            onClick={() => setViewMode('week')}
          >
            {t('calendar.weekView')}
          </button>
        </div>
      </div>

      <div className={`calendar-grid ${viewMode === 'week' ? 'calendar-grid-week' : ''}`}>
        {weekDayLabels.map((label) => (
          <div key={label} className="calendar-weekday">{label}</div>
        ))}
        {calendarCells.map((dateIso, index) => {
          if (!dateIso) return <div key={`empty-${index}`} />;
          const dayEvents = eventsByDate[dateIso] || [];
          const dayActivities = activitiesByDate[dateIso] || [];
          const dayAbsences = absencesByDate[dateIso] || [];
          const isToday = dateIso === todayIso;
          const isSelected = dateIso === selectedDate;
          const dayNumber = Number(dateIso.split('-')[2]);

          const badges = [
            ...dayAbsences.map((absence) => ({
              id: `ab-${absence.id}`,
              label: t(`absences.type.${absence.type}`),
              cat: ABSENCE_CAT,
            })),
            ...dayEvents.map((event) => ({
              id: `ev-${event.occurrenceKey}`,
              label: event.title,
              cat: EVENT_CAT,
              recurring: (event.recurrence || 'none') !== 'none',
            })),
            ...dayActivities.map((activity) => ({
              id: `ac-${activity.id}`,
              label: activity.activityType || activity.description,
              cat: activityCat(activity),
            })),
          ];
          const shown = badges.slice(0, viewMode === 'week' ? 8 : 3);
          const extraCount = badges.length - shown.length;

          return (
            <button
              key={dateIso}
              type="button"
              className={`calendar-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
              onClick={() => setSelectedDate(dateIso)}
            >
              <span className="calendar-cell-day">{dayNumber}</span>
              <div className="calendar-cell-badges">
                {shown.map((badge) => (
                  <span key={badge.id} className={`calendar-badge ${badge.cat}`}>
                    {badge.recurring && <Repeat size={10} />}
                    {badge.label}
                  </span>
                ))}
                {extraCount > 0 && (
                  <span className="calendar-more">+{extraCount} {t('calendar.more')}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="calendar-day-panel">
        <div className="calendar-day-header">
          <h4>
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h4>
          {canEdit && !showForm && (
            <button type="button" className="primary-action-button" onClick={startAdd}>
              <Plus size={15} />
              {t('calendar.addEvent')}
            </button>
          )}
        </div>

        {selectedAbsences.length > 0 && (
          <div className="calendar-absence-banner">
            <CalendarX size={15} />
            {selectedAbsences.map((absence) => (
              <span key={absence.id} className="chip chip-cat cat-abs">
                {t(`absences.type.${absence.type}`)}
              </span>
            ))}
          </div>
        )}

        {showForm && canEdit && (
          <div className="calendar-event-form">
            <div style={{ marginBottom: '10px' }}>
              <label className="field-label">{t('calendar.eventTitle')}</label>
              <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} style={inputStyle} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label className="field-label">{t('calendar.startTime')}</label>
                <input type="time" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label className="field-label">{t('calendar.endTime')}</label>
                <input type="time" value={formData.endTime} onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label className="field-label">{t('calendar.recurrence')}</label>
                <select
                  value={formData.recurrence}
                  onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                  style={inputStyle}
                >
                  {RECURRENCE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{t(`calendar.recurrence.${option}`)}</option>
                  ))}
                </select>
              </div>
              {formData.recurrence !== 'none' && (
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label className="field-label">{t('calendar.recurrenceEnd')}</label>
                  <input
                    type="date"
                    value={formData.recurrenceEnd}
                    min={selectedDate}
                    onChange={(e) => setFormData({ ...formData, recurrenceEnd: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label className="field-label">{t('calendar.eventDescription')}</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} style={inputStyle} />
            </div>
            {editingEvent && (editingEvent.recurrence || 'none') !== 'none' && (
              <p className="form-hint"><Repeat size={13} /> {t('calendar.seriesEditHint')}</p>
            )}
            <div className="form-actions">
              <button type="button" className="secondary-action-button" onClick={resetForm}>
                {t('common.cancel')}
              </button>
              <button type="button" className="primary-action-button" onClick={handleSave}>
                <Save size={14} />
                {t('common.save')}
              </button>
            </div>
          </div>
        )}

        {selectedEvents.length === 0 && !showForm ? (
          <div className="empty-state">
            <CalendarDays size={28} />
            <p>{t('calendar.noEvents')}</p>
          </div>
        ) : (
          <div className="calendar-events-list">
            {selectedEvents.map((event) => (
              <div key={event.occurrenceKey} className={`calendar-event-row ${EVENT_CAT}`}>
                <div>
                  <div className="calendar-event-title">
                    {event.title}
                    {(event.recurrence || 'none') !== 'none' && (
                      <span className="chip chip-neutral" title={t(`calendar.recurrence.${event.recurrence}`)}>
                        <Repeat size={11} /> {t(`calendar.recurrence.${event.recurrence}`)}
                      </span>
                    )}
                    {(event.startTime || event.endTime) && (
                      <span className="calendar-event-time">
                        {event.startTime || ''}{event.startTime && event.endTime ? ' – ' : ''}{event.endTime || ''}
                      </span>
                    )}
                  </div>
                  {event.description && <p className="calendar-event-description">{event.description}</p>}
                </div>
                {canEdit && (
                  <div className="note-actions">
                    <button type="button" onClick={() => startEdit(event)} aria-label={t('common.edit')}>
                      <Edit2 size={15} />
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete(event)} aria-label={t('common.delete')}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {selectedActivities.length > 0 && (
          <div className="calendar-activities-list">
            <h5 className="calendar-subheading">{t('activities.title')}</h5>
            <datalist id="activity-type-suggestions">
              {ACTIVITY_TYPE_SUGGESTIONS.map((suggestion) => <option key={suggestion} value={suggestion} />)}
            </datalist>
            {selectedActivities.map((activity) => (
              editingActivityId === activity.id ? (
                <div key={activity.id} className="calendar-event-form">
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <div style={{ width: '160px' }}>
                      <label className="field-label">{t('activities.type')}</label>
                      <input type="text" list="activity-type-suggestions" value={activityFormData.activityType} onChange={(e) => setActivityFormData({ ...activityFormData, activityType: e.target.value })} style={inputStyle} />
                    </div>
                    <div style={{ width: '110px' }}>
                      <label className="field-label">{t('activities.apprenticeTime')}</label>
                      <input type="time" value={activityFormData.startTime} onChange={(e) => setActivityFormData({ ...activityFormData, startTime: e.target.value })} style={inputStyle} />
                    </div>
                    <div style={{ width: '110px' }}>
                      <label className="field-label">{t('activities.duration')}</label>
                      <input type="number" min="0" step="5" value={activityFormData.durationMinutes} onChange={(e) => setActivityFormData({ ...activityFormData, durationMinutes: e.target.value })} style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <label className="field-label">{t('activities.description')}</label>
                    <input type="text" value={activityFormData.description} onChange={(e) => setActivityFormData({ ...activityFormData, description: e.target.value })} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <div style={{ width: '110px' }}>
                      <label className="field-label">{t('activities.trainerTime')}</label>
                      <input type="time" value={activityFormData.trainerTime} onChange={(e) => setActivityFormData({ ...activityFormData, trainerTime: e.target.value })} style={inputStyle} />
                    </div>
                    <div style={{ width: '130px' }}>
                      <label className="field-label">{t('activities.apprenticeCount')}</label>
                      <input type="number" min="1" step="1" value={activityFormData.apprenticeCount} onChange={(e) => setActivityFormData({ ...activityFormData, apprenticeCount: e.target.value })} style={inputStyle} />
                    </div>
                    <div style={{ width: '130px' }}>
                      <label className="field-label">{t('activities.site')}</label>
                      <input type="text" value={activityFormData.site} onChange={(e) => setActivityFormData({ ...activityFormData, site: e.target.value })} style={inputStyle} />
                    </div>
                    <div style={{ width: '110px' }}>
                      <label className="field-label">{t('activities.ticket')}</label>
                      <input type="text" value={activityFormData.ticket} onChange={(e) => setActivityFormData({ ...activityFormData, ticket: e.target.value })} style={inputStyle} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="secondary-action-button" onClick={cancelActivityEdit}>
                      {t('common.cancel')}
                    </button>
                    <button type="button" className="primary-action-button" onClick={() => handleSaveActivity(activity.id)}>
                      <Save size={14} />
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={activity.id} className={`calendar-event-row ${activityCat(activity)}`}>
                  <div className="calendar-activity-body">
                    <ClipboardList size={15} />
                    <div>
                      <div className="calendar-event-title">
                        {activity.activityType || t('activities.title')}
                        {activity.startTime && <span className="calendar-event-time">{activity.startTime}</span>}
                      </div>
                      {activity.description && <p className="calendar-event-description">{activity.description}</p>}
                      {(activity.trainerTime || activity.apprenticeCount) && (
                        <p className="calendar-event-meta">
                          {activity.trainerTime && <span>{t('activities.trainerTime')}: {activity.trainerTime}</span>}
                          {activity.trainerTime && activity.apprenticeCount ? ' · ' : ''}
                          {activity.apprenticeCount && <span>{t('activities.apprenticeCount')}: {activity.apprenticeCount}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="note-actions">
                      <button type="button" onClick={() => startEditActivity(activity)} aria-label={t('common.edit')}>
                        <Edit2 size={15} />
                      </button>
                      <button type="button" className="danger" onClick={() => handleDeleteActivity(activity.id)} aria-label={t('common.delete')}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarSection;
