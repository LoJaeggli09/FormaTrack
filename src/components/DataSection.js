import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Clock, ClipboardList, FileSpreadsheet, CalendarX, UserCheck } from 'lucide-react';
import { translate } from '../i18n';
import { getActivitiesForStudents } from '../data/activities.supabase';
import { getAbsencesForStudents, countAbsenceDays, PLANNED_ABSENCE_TYPES, ABSENCE_TYPES } from '../data/absences.supabase';
import { getAllUsers } from '../data/users.supabase';
import { SectionSkeleton } from './SkeletonLoader';
import { logError, notifyError, notifySuccess } from '../utils/logger';
import { exportAggregateToExcel } from '../utils/exportReport';
import { buildPeriodRange, filterByRange, isWithinRange, fromIsoDate, formatRangeLabel } from '../utils/dateRange';
import {
  sumDurationMinutes, averageDurationMinutes, minutesToHours,
  hoursGroupedBy, countGroupedBy, trainerHours, monthlySeries, formatMonthLabel,
} from '../utils/activityStats';
import RankedBarChart from './RankedBarChart';
import PeriodFilter from './PeriodFilter';

/** Giorni lavorativi (lun–ven) fra due date ISO incluse. */
const countWorkingDays = (fromIso, toIso) => {
  const start = fromIsoDate(fromIso);
  const end = fromIsoDate(toIso);
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 4000) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return count;
};

const DataSection = ({ students = [], language = 'it', currentUser = null }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [activities, setActivities] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [trainerNameById, setTrainerNameById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [range, setRange] = useState(() => buildPeriodRange('thisYear'));

  const studentIds = useMemo(() => students.map((s) => s.id), [students]);
  const studentNameById = useMemo(() => {
    const map = {};
    students.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [students]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      getActivitiesForStudents(studentIds).catch((error) => {
        logError('DataSection', 'Errore caricamento attività aggregate', error);
        return [];
      }),
      getAbsencesForStudents(studentIds).catch((error) => {
        logError('DataSection', 'Errore caricamento assenze aggregate', error);
        return [];
      }),
    ])
      .then(([activityRows, absenceRows]) => {
        if (cancelled) return;
        setActivities(activityRows);
        setAbsences(absenceRows);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [studentIds]);

  // I nomi dei formatori servono solo al grafico delle ore di affiancamento:
  // se la lista non arriva, il grafico ripiega sugli id.
  useEffect(() => {
    let cancelled = false;
    const workspaceId = currentUser?.role === 'app_admin' ? null : currentUser?.workspaceId ?? null;
    getAllUsers(workspaceId)
      .then((users) => {
        if (cancelled) return;
        const map = {};
        users
          .filter((user) => ['trainer', 'admin', 'app_admin'].includes(user.role))
          .forEach((user) => { map[user.id] = user.name; });
        setTrainerNameById(map);
      })
      .catch(() => { if (!cancelled) setTrainerNameById({}); });
    return () => { cancelled = true; };
  }, [currentUser?.role, currentUser?.workspaceId]);

  const periodActivities = useMemo(() => filterByRange(activities, range, 'date'), [activities, range]);
  const periodAbsences = useMemo(
    () => absences.filter((absence) => isWithinRange(absence.startDate, range) || isWithinRange(absence.endDate, range)),
    [absences, range]
  );

  const totalMinutes = useMemo(() => sumDurationMinutes(periodActivities), [periodActivities]);
  const avgDurationMinutes = useMemo(() => averageDurationMinutes(periodActivities), [periodActivities]);

  const bySite = useMemo(
    () => countGroupedBy(periodActivities, (activity) => activity.site || null),
    [periodActivities]
  );
  const hoursByStudent = useMemo(
    () => hoursGroupedBy(periodActivities, (activity) => String(activity.studentId), (id) => studentNameById[id] || id),
    [periodActivities, studentNameById]
  );
  const hoursByType = useMemo(
    () => hoursGroupedBy(periodActivities, (activity) => activity.activityType || null),
    [periodActivities]
  );
  const hoursByTrainer = useMemo(
    () => trainerHours(periodActivities, students, trainerNameById),
    [periodActivities, students, trainerNameById]
  );
  const monthlyHours = useMemo(
    () => monthlySeries(periodActivities).map((entry) => ({
      name: formatMonthLabel(entry.key, locale),
      value: minutesToHours(entry.minutes),
    })),
    [periodActivities, locale]
  );

  const absenceStats = useMemo(() => {
    const byType = {};
    let total = 0;
    let unplanned = 0;
    periodAbsences.forEach((absence) => {
      const days = countAbsenceDays(absence);
      total += days;
      if (!PLANNED_ABSENCE_TYPES.has(absence.type)) unplanned += days;
      byType[absence.type] = (byType[absence.type] || 0) + days;
    });
    return {
      total,
      unplanned,
      byType: ABSENCE_TYPES
        .filter((type) => byType[type])
        .map((type) => ({ name: t(`absences.type.${type}`), value: byType[type] })),
    };
  }, [periodAbsences, language]);

  /**
   * Tasso di presenza sul periodo: si può calcolare solo quando il periodo ha
   * due estremi, altrimenti non esiste un monte giorni di riferimento.
   */
  const presenceRate = useMemo(() => {
    if (!range.from || !range.to || students.length === 0) return null;
    const expectedDays = countWorkingDays(range.from, range.to) * students.length;
    if (expectedDays === 0) return null;
    return Math.max(0, Math.round((1 - absenceStats.unplanned / expectedDays) * 1000) / 10);
  }, [range, students.length, absenceStats.unplanned]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportAggregateToExcel({ activities: periodActivities, students, language });
      if (result?.success) notifySuccess(t('export.success'));
      else if (result && !result.canceled) notifyError(result.error || t('export.error'));
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="data-section">
        <SectionSkeleton />
      </div>
    );
  }

  return (
    <div className="data-section">
      <div className="section-header">
        <div>
          <h2>{t('data.title')}</h2>
          <p className="section-subtitle">{t('data.subtitle')}</p>
        </div>
        <div className="export-actions">
          <button
            type="button"
            className="export-button"
            onClick={handleExport}
            disabled={isExporting || periodActivities.length === 0}
          >
            <FileSpreadsheet size={15} />
            {isExporting ? t('export.inProgress') : t('export.excel')}
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <PeriodFilter value={range} onChange={setRange} language={language} />
        <span className="range-label">{formatRangeLabel(range, locale) || t('period.all')}</span>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <ClipboardList size={28} />
          <div>
            <div className="stat-tile-value">{periodActivities.length}</div>
            <div className="stat-tile-label">{t('data.totalActivities')}</div>
          </div>
        </div>
        <div className="stat-tile">
          <Clock size={28} />
          <div>
            <div className="stat-tile-value">{minutesToHours(totalMinutes)} h</div>
            <div className="stat-tile-label">{t('data.totalHours')}</div>
          </div>
        </div>
        <div className="stat-tile">
          <Clock size={28} />
          <div>
            <div className="stat-tile-value">{avgDurationMinutes !== null ? `${avgDurationMinutes} min` : '—'}</div>
            <div className="stat-tile-label">{t('data.avgDuration')}</div>
          </div>
        </div>
        <div className="stat-tile">
          <BarChart3 size={28} />
          <div>
            <div className="stat-tile-value">{students.length}</div>
            <div className="stat-tile-label">{t('data.totalStudents')}</div>
          </div>
        </div>
        <div className="stat-tile">
          <CalendarX size={28} />
          <div>
            <div className="stat-tile-value">{absenceStats.total}</div>
            <div className="stat-tile-label">{t('data.absenceDays')}</div>
          </div>
        </div>
        <div className="stat-tile">
          <UserCheck size={28} />
          <div>
            <div className="stat-tile-value">{presenceRate !== null ? `${presenceRate}%` : '—'}</div>
            <div className="stat-tile-label">{t('data.presenceRate')}</div>
          </div>
        </div>
      </div>

      <RankedBarChart
        title={t('data.hoursByStudent')}
        subtitle={t('data.hoursByStudentSubtitle')}
        data={hoursByStudent}
        emptyLabel={t('data.noData')}
        valueFormatter={(value) => `${value} h`}
      />

      <RankedBarChart
        title={t('data.hoursByType')}
        subtitle={t('data.hoursByTypeSubtitle')}
        data={hoursByType}
        emptyLabel={t('data.noData')}
        valueFormatter={(value) => `${value} h`}
      />

      <RankedBarChart
        title={t('data.trainerHours')}
        subtitle={t('data.trainerHoursSubtitle')}
        data={hoursByTrainer}
        emptyLabel={t('data.noData')}
        valueFormatter={(value) => `${value} h`}
      />

      <RankedBarChart
        title={t('data.bySite')}
        subtitle={t('data.bySiteSubtitle')}
        data={bySite}
        emptyLabel={t('data.noData')}
      />

      <RankedBarChart
        title={t('data.absencesByType')}
        subtitle={t('data.absencesByTypeSubtitle')}
        data={absenceStats.byType}
        color="var(--abs)"
        emptyLabel={t('data.noData')}
        valueFormatter={(value) => `${value} g`}
      />

      <RankedBarChart
        title={t('data.hoursByMonth')}
        subtitle={t('data.hoursByMonthSubtitle')}
        data={monthlyHours}
        orientation="vertical"
        emptyLabel={t('data.noData')}
        valueFormatter={(value) => `${value} h`}
      />
    </div>
  );
};

export default DataSection;
