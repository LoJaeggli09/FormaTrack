import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CalendarX, Plus, Edit2, Trash2, Save, X, ShieldCheck, ShieldAlert } from 'lucide-react';
import { translate } from '../i18n';
import {
  getAbsencesForStudent,
  addAbsence,
  updateAbsence,
  deleteAbsence,
  countAbsenceDays,
  ABSENCE_TYPES,
} from '../data/absences.supabase';
import { supabase } from '../supabaseClient';
import { SectionSkeleton } from './SkeletonLoader';
import { logError, notifyError } from '../utils/logger';

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  startDate: todayIso(),
  endDate: todayIso(),
  type: 'sick',
  halfDay: false,
  justified: false,
  reason: '',
};

const AbsencesSection = ({ studentId, language = 'it', isReadOnly = false, currentUser = null }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [absences, setAbsences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const canEdit = !isReadOnly;

  const loadAbsences = async () => {
    if (!studentId) { setAbsences([]); return; }
    try {
      setAbsences(await getAbsencesForStudent(studentId));
    } catch (error) {
      logError('AbsencesSection', 'Errore caricamento assenze', error);
      setAbsences([]);
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
    loadAbsences();

    if (!studentId) return undefined;
    const channel = supabase
      .channel(`absences-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences', filter: `student_id=eq.${studentId}` }, () => {
        loadAbsences();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId]);

  const totals = useMemo(() => {
    const summary = { total: 0, justified: 0, unjustified: 0, byType: {} };
    absences.forEach((absence) => {
      const days = countAbsenceDays(absence);
      summary.total += days;
      if (absence.justified) summary.justified += days;
      else summary.unjustified += days;
      summary.byType[absence.type] = (summary.byType[absence.type] || 0) + days;
    });
    return summary;
  }, [absences]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setFormError('');
  };

  const startAdd = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setFormError('');
  };

  const startEdit = (absence) => {
    setFormData({
      startDate: absence.startDate,
      endDate: absence.endDate,
      type: absence.type,
      halfDay: absence.halfDay,
      justified: absence.justified,
      reason: absence.reason || '',
    });
    setEditingId(absence.id);
    setShowForm(true);
    setFormError('');
  };

  const handleSave = async () => {
    if (!formData.startDate) return;
    if (formData.endDate && formData.endDate < formData.startDate) {
      setFormError(t('absences.invalidRange'));
      return;
    }

    try {
      if (editingId) {
        await updateAbsence(editingId, { ...formData, studentId });
      } else {
        await addAbsence(studentId, formData, currentUser?.id || null, currentUser?.name || null);
      }
      resetForm();
      await loadAbsences();
    } catch (error) {
      logError('AbsencesSection', 'Errore salvataggio assenza', error);
      notifyError(t('absences.saveError'));
    }
  };

  const handleDelete = async (absenceId) => {
    if (!window.confirm(t('absences.confirmDelete'))) return;
    try {
      await deleteAbsence(absenceId);
      await loadAbsences();
    } catch (error) {
      logError('AbsencesSection', 'Errore eliminazione assenza', error);
      notifyError(t('absences.deleteError'));
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale);
  };

  if (isLoading) {
    return (
      <div className="absences-section">
        <SectionSkeleton />
      </div>
    );
  }

  return (
    <div className="absences-section">
      <div className="section-header">
        <div>
          <h2>{t('absences.title')}</h2>
          <p className="section-subtitle">{t('absences.subtitle')}</p>
        </div>
        {canEdit && !showForm && (
          <button type="button" className="primary-action-button" onClick={startAdd}>
            <Plus size={16} />
            {t('absences.add')}
          </button>
        )}
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <CalendarX size={26} />
          <div>
            <div className="stat-tile-value">{totals.total}</div>
            <div className="stat-tile-label">{t('absences.totalDays')}</div>
          </div>
        </div>
        <div className="stat-tile">
          <ShieldCheck size={26} />
          <div>
            <div className="stat-tile-value">{totals.justified}</div>
            <div className="stat-tile-label">{t('absences.justifiedDays')}</div>
          </div>
        </div>
        <div className="stat-tile">
          <ShieldAlert size={26} />
          <div>
            <div className="stat-tile-value">{totals.unjustified}</div>
            <div className="stat-tile-label">{t('absences.unjustifiedDays')}</div>
          </div>
        </div>
      </div>

      {showForm && canEdit && (
        <div className="absence-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="absence-start">{t('absences.startDate')}</label>
              <input
                id="absence-start"
                type="date"
                className="filter-input"
                value={formData.startDate}
                onChange={(event) => setFormData({
                  ...formData,
                  startDate: event.target.value,
                  // Un'assenza di un giorno solo è il caso normale: la data di
                  // fine segue quella di inizio finché non la si cambia a mano.
                  endDate: !formData.endDate || formData.endDate < event.target.value ? event.target.value : formData.endDate,
                })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="absence-end">{t('absences.endDate')}</label>
              <input
                id="absence-end"
                type="date"
                className="filter-input"
                value={formData.endDate}
                min={formData.startDate}
                onChange={(event) => setFormData({ ...formData, endDate: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="absence-type">{t('absences.type')}</label>
              <select
                id="absence-type"
                className="filter-input"
                value={formData.type}
                onChange={(event) => setFormData({ ...formData, type: event.target.value })}
              >
                {ABSENCE_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`absences.type.${type}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field form-field-grow">
              <label htmlFor="absence-reason">{t('absences.reason')}</label>
              <input
                id="absence-reason"
                type="text"
                className="filter-input"
                value={formData.reason}
                onChange={(event) => setFormData({ ...formData, reason: event.target.value })}
                placeholder={t('absences.reasonPlaceholder')}
              />
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={formData.halfDay}
                disabled={formData.startDate !== formData.endDate}
                onChange={(event) => setFormData({ ...formData, halfDay: event.target.checked })}
              />
              {t('absences.halfDay')}
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={formData.justified}
                onChange={(event) => setFormData({ ...formData, justified: event.target.checked })}
              />
              {t('absences.justified')}
            </label>
          </div>

          {formError && <p className="form-error">{formError}</p>}

          <div className="form-actions">
            <button type="button" className="secondary-action-button" onClick={resetForm}>
              <X size={14} />
              {t('common.cancel')}
            </button>
            <button type="button" className="primary-action-button" onClick={handleSave}>
              <Save size={14} />
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {absences.length === 0 ? (
        <div className="empty-state">
          <CalendarX size={36} />
          <p>{t('absences.noAbsences')}</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('absences.period')}</th>
                <th>{t('absences.type')}</th>
                <th>{t('absences.days')}</th>
                <th>{t('absences.reason')}</th>
                <th>{t('absences.justified')}</th>
                {canEdit && <th aria-label={t('common.actions')} />}
              </tr>
            </thead>
            <tbody>
              {absences.map((absence) => (
                <tr key={absence.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {absence.startDate === absence.endDate
                      ? formatDate(absence.startDate)
                      : `${formatDate(absence.startDate)} – ${formatDate(absence.endDate)}`}
                  </td>
                  <td>
                    <span className="chip chip-cat cat-abs">
                      {t(`absences.type.${absence.type}`)}
                    </span>
                  </td>
                  <td>{countAbsenceDays(absence)}</td>
                  <td>{absence.reason}</td>
                  <td>
                    {absence.justified
                      ? <span className="chip chip-success">{t('common.yes')}</span>
                      : <span className="chip chip-warning">{t('common.no')}</span>}
                  </td>
                  {canEdit && (
                    <td className="table-actions">
                      <button type="button" onClick={() => startEdit(absence)} aria-label={t('common.edit')}>
                        <Edit2 size={15} />
                      </button>
                      <button type="button" className="danger" onClick={() => handleDelete(absence.id)} aria-label={t('common.delete')}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AbsencesSection;
