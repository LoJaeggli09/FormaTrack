import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CalendarClock, Plus, Edit2, Trash2, Save } from 'lucide-react';
import { translate } from '../i18n';
import { getActivitiesForStudent, addActivity, updateActivity, deleteActivity } from '../data/activities.supabase';
import { supabase } from '../supabaseClient';
import { SectionSkeleton } from './SkeletonLoader';
import ActivityFormFields from './ActivityFormFields';
import { logError, notifyError } from '../utils/logger';

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = { date: '', startTime: '', trainerTime: '', apprenticeCount: '', durationMinutes: '', activityType: '', description: '', site: '', ticket: '' };

const ACTIVITY_TYPE_SUGGESTIONS = ['Formazione', 'Manutenzione', 'Supporto cliente', 'Riunione', 'Altro'];

// La "Prenotazione" usa la stessa tabella activities: è semplicemente
// la creazione di un'attività con data futura, con campi strutturati
// (orario, durata stimata, tipo). Compare quindi sia nel registro
// Attività sia nel Calendario, senza duplicare i dati.
const BookingSection = ({ studentId, language = 'it', canManage = false, currentUser = null }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [dateError, setDateError] = useState('');

  const loadActivities = async () => {
    if (!studentId) { setActivities([]); return; }
    try {
      const data = await getActivitiesForStudent(studentId);
      setActivities(data);
    } catch (error) {
      logError('BookingSection', 'Errore caricamento prenotazioni', error);
      setActivities([]);
    } finally {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    hasLoadedOnce.current = false;
    setIsLoading(true);
    loadActivities();

    if (!studentId) return;
    const channel = supabase
      .channel(`booking-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `student_id=eq.${studentId}` }, () => {
        loadActivities();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId]);

  const upcoming = useMemo(() => {
    const today = todayIso();
    return activities
      .filter((a) => a.date >= today)
      .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  }, [activities]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setDateError('');
  };

  const startAdd = () => {
    setEditingId(null);
    setFormData({ ...emptyForm, date: todayIso() });
    setShowForm(true);
    setDateError('');
  };

  const startEdit = (activity) => {
    setEditingId(activity.id);
    setFormData({
      date: activity.date,
      startTime: activity.startTime || '',
      trainerTime: activity.trainerTime || '',
      apprenticeCount: activity.apprenticeCount ?? '',
      durationMinutes: activity.durationMinutes ?? '',
      activityType: activity.activityType || '',
      description: activity.description || '',
      site: activity.site || '',
      ticket: activity.ticket || '',
    });
    setShowForm(true);
    setDateError('');
  };

  const handleSave = async () => {
    if (!formData.date || !formData.activityType.trim()) return;
    if (formData.date < todayIso()) {
      setDateError(t('booking.dateMustBeFuture'));
      return;
    }
    try {
      const payload = {
        date: formData.date,
        startTime: formData.startTime,
        trainerTime: formData.trainerTime,
        apprenticeCount: formData.apprenticeCount ? parseInt(formData.apprenticeCount, 10) : null,
        durationMinutes: formData.durationMinutes ? parseInt(formData.durationMinutes, 10) : null,
        activityType: formData.activityType.trim(),
        description: formData.description.trim() || formData.activityType.trim(),
        site: formData.site.trim(),
        ticket: formData.ticket.trim(),
      };
      if (editingId) {
        await updateActivity(editingId, payload);
      } else {
        await addActivity(studentId, payload, currentUser?.id || null);
      }
      resetForm();
      await loadActivities();
    } catch (error) {
      logError('BookingSection', 'Errore salvataggio prenotazione', error);
      notifyError('Errore durante il salvataggio della prenotazione: ' + (error.message || error));
    }
  };

  const handleDelete = async (activityId) => {
    if (!window.confirm(t('booking.confirmDelete'))) return;
    try {
      await deleteActivity(activityId);
      await loadActivities();
    } catch (error) {
      logError('BookingSection', 'Errore eliminazione prenotazione', error);
      notifyError('Errore durante l\'eliminazione della prenotazione.');
    }
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (isLoading) {
    return (
      <div className="booking-section">
        <SectionSkeleton />
      </div>
    );
  }

  return (
    <div className="booking-section">
      <div className="section-header">
        <div>
          <h2>{t('booking.title')}</h2>
          <p className="section-subtitle">{t('booking.subtitle')}</p>
        </div>
        {canManage && !showForm && (
          <button type="button" className="primary-action-button" onClick={startAdd}>
            <Plus size={16} />
            {t('booking.addBooking')}
          </button>
        )}
      </div>

      <datalist id="activity-type-suggestions">
        {ACTIVITY_TYPE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>

      {showForm && canManage && (
        <div className="add-form entry-panel">
          <div className="entry-head">
            <h3 className="entry-title">{t('booking.addBooking')}</h3>
          </div>

          <ActivityFormFields
            idPrefix="booking"
            value={formData}
            onChange={(next) => {
              if (next.date !== formData.date) setDateError('');
              setFormData(next);
            }}
            t={t}
            multiline
            required={['activityType', 'date']}
            dateMin={todayIso()}
            error={dateError}
            labels={{
              date: t('booking.date'),
              type: t('booking.type'),
              duration: t('booking.duration'),
              startTime: t('booking.time'),
              description: t('activities.description'),
            }}
          />

          <div className="entry-actions entry-actions--end">
            <button type="button" className="btn-secondary" onClick={resetForm}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={handleSave}>
              <Save size={16} />
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div className="empty-state">
          <CalendarClock size={36} />
          <p>{t('booking.noBookings')}</p>
        </div>
      ) : (
        <div className="booking-list rows">
          {upcoming.map((activity) => (
            <div key={activity.id} className="row-item cat-book">
              <div>
                <div className="row-title capitalize">
                  {formatDate(activity.date)}
                  {activity.startTime && <span> · {activity.startTime}</span>}
                  {activity.durationMinutes ? <span> · {activity.durationMinutes} min</span> : null}
                </div>
                <div className="row-text">
                  {activity.activityType && <strong>{activity.activityType}</strong>}
                  {activity.activityType && activity.description ? ' — ' : ''}
                  {activity.description}
                </div>
                {(activity.trainerTime || activity.apprenticeCount) && (
                  <div className="row-meta">
                    {activity.trainerTime && <span>{t('activities.trainerTime')}: {activity.trainerTime}</span>}
                    {activity.trainerTime && activity.apprenticeCount ? ' · ' : ''}
                    {activity.apprenticeCount && <span>{t('activities.apprenticeCount')}: {activity.apprenticeCount}</span>}
                  </div>
                )}
                {(activity.site || activity.ticket) && (
                  <div className="row-meta">
                    {activity.site && <span>{t('activities.site')}: {activity.site}</span>}
                    {activity.site && activity.ticket ? ' · ' : ''}
                    {activity.ticket && <span>{t('activities.ticket')}: {activity.ticket}</span>}
                  </div>
                )}
              </div>
              {canManage && (
                <div className="row-actions">
                  <button onClick={() => startEdit(activity)}>
                    <Edit2 size={15} />
                  </button>
                  <button className="danger" onClick={() => handleDelete(activity.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BookingSection;
