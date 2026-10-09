import React, { useState, useEffect, useMemo } from 'react';
import { FileText, X, Loader2 } from 'lucide-react';
import { translate } from '../i18n';
import { getActivitiesForStudent } from '../data/activities.supabase';
import { loadGrades } from '../data/grades.supabase';
import { getAbsencesForStudent, countAbsenceDays } from '../data/absences.supabase';
import { buildPeriodRange, filterByRange, isWithinRange, formatRangeLabel } from '../utils/dateRange';
import { sumDurationMinutes, minutesToHours } from '../utils/activityStats';
import { exportPeriodReportToPdf } from '../utils/exportReport';
import PeriodFilter from './PeriodFilter';
import { logError, notifyError, notifySuccess } from '../utils/logger';

/**
 * Rapporto di formazione periodico.
 *
 * Il documento va firmato, quindi prima di generarlo si mostra cosa finirà
 * dentro: chi firma deve poter controllare i numeri, non fidarsi di un pulsante.
 */
const PeriodReportDialog = ({
  isOpen = false,
  onClose = () => {},
  student = null,
  language = 'it',
  currentUser = null,
}) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [range, setRange] = useState(() => buildPeriodRange('thisQuarter'));
  const [comment, setComment] = useState('');
  const [data, setData] = useState({ activities: [], grades: [], absences: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!isOpen || !student?.id) return undefined;

    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      getActivitiesForStudent(student.id).catch(() => []),
      loadGrades(student.id).catch(() => []),
      getAbsencesForStudent(student.id).catch(() => []),
    ])
      .then(([activities, grades, absences]) => {
        if (!cancelled) setData({ activities, grades, absences });
      })
      .catch((error) => {
        logError('PeriodReportDialog', 'Caricamento dati rapporto fallito', error);
        if (!cancelled) setData({ activities: [], grades: [], absences: [] });
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, student?.id]);

  const filtered = useMemo(() => {
    const activities = filterByRange(data.activities, range, 'date');
    const grades = data.grades.filter((grade) => isWithinRange(String(grade.date || '').slice(0, 10), range));
    // Un'assenza rientra nel periodo se lo tocca, anche solo in parte.
    const absences = data.absences.filter((absence) =>
      isWithinRange(absence.startDate, range) || isWithinRange(absence.endDate, range));
    return { activities, grades, absences };
  }, [data, range]);

  const summary = useMemo(() => {
    const gradeValues = filtered.grades
      .map((grade) => parseFloat(grade.grade))
      .filter((value) => !Number.isNaN(value));
    return {
      activities: filtered.activities.length,
      hours: minutesToHours(sumDurationMinutes(filtered.activities)),
      absenceDays: filtered.absences.reduce((total, absence) => total + countAbsenceDays(absence), 0),
      gradeAverage: gradeValues.length
        ? (gradeValues.reduce((acc, value) => acc + value, 0) / gradeValues.length).toFixed(2)
        : '—',
    };
  }, [filtered]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await exportPeriodReportToPdf({
        student,
        range,
        activities: filtered.activities,
        grades: filtered.grades,
        absences: filtered.absences,
        trainerComment: comment,
        trainerName: currentUser?.name || '',
        language,
      });
      if (result?.success) {
        notifySuccess(t('export.success'));
        onClose();
      } else if (result && !result.canceled) {
        notifyError(result.error || t('export.error'));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('report.periodTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>{t('report.periodTitle')}</h3>
            <p className="section-subtitle">{student?.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.cancel')}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <PeriodFilter value={range} onChange={setRange} language={language} />
          <p className="range-label">{formatRangeLabel(range, locale) || t('period.all')}</p>

          {isLoading ? (
            <div className="modal-loading"><Loader2 size={20} className="spin" /></div>
          ) : (
            <div className="stat-tiles stat-tiles-compact">
              <div className="stat-tile">
                <div>
                  <div className="stat-tile-value">{summary.activities}</div>
                  <div className="stat-tile-label">{t('report.totalActivities')}</div>
                </div>
              </div>
              <div className="stat-tile">
                <div>
                  <div className="stat-tile-value">{summary.hours} h</div>
                  <div className="stat-tile-label">{t('report.totalHours')}</div>
                </div>
              </div>
              <div className="stat-tile">
                <div>
                  <div className="stat-tile-value">{summary.absenceDays}</div>
                  <div className="stat-tile-label">{t('report.absenceDays')}</div>
                </div>
              </div>
              <div className="stat-tile">
                <div>
                  <div className="stat-tile-value">{summary.gradeAverage}</div>
                  <div className="stat-tile-label">{t('report.gradeAverage')}</div>
                </div>
              </div>
            </div>
          )}

          <div className="form-field">
            <label htmlFor="report-comment">{t('report.trainerComment')}</label>
            <textarea
              id="report-comment"
              rows={5}
              className="filter-input"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t('report.trainerCommentPlaceholder')}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-action-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="primary-action-button"
            onClick={handleGenerate}
            disabled={isGenerating || isLoading || !student}
          >
            {isGenerating ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}
            {isGenerating ? t('export.inProgress') : t('report.generate')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PeriodReportDialog;
