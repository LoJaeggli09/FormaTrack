import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ClipboardList, Plus, Edit2, Trash2, Save, X, FileSpreadsheet, FileText, Copy,
  Search, ArrowUpDown, Send, CheckCircle2, XCircle, RotateCcw, BookmarkPlus, ChevronDown,
} from 'lucide-react';
import { translate } from '../i18n';
import {
  getActivitiesForStudent, addActivity, updateActivity, deleteActivity,
  setActivityStatus, ACTIVITY_STATUS,
} from '../data/activities.supabase';
import { getNotesForStudent } from '../data/notes.supabase';
import { getAttachmentsForStudent } from '../data/attachments.supabase';
import { loadGrades } from '../data/grades.supabase';
import { supabase } from '../supabaseClient';
import { SectionSkeleton } from './SkeletonLoader';
import { logError, notifyError, notifySuccess } from '../utils/logger';
import { exportActivitiesToExcel, exportStudentReportToPdf } from '../utils/exportReport';
import { buildPeriodRange, filterByRange } from '../utils/dateRange';
import { sumDurationMinutes, minutesToHours } from '../utils/activityStats';
import { getTemplates, saveTemplate, deleteTemplate, applyTemplate } from '../utils/activityTemplates';
import PeriodFilter from './PeriodFilter';
import PeriodReportDialog from './PeriodReportDialog';
import AttachmentsPanel from './AttachmentsPanel';
import ActivityFormFields from './ActivityFormFields';

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  date: todayIso(), startTime: '', trainerTime: '', apprenticeCount: '',
  activityType: '', description: '', durationMinutes: '', site: '', ticket: ''
};

const ACTIVITY_TYPE_SUGGESTIONS = ['Formazione', 'Manutenzione', 'Supporto cliente', 'Riunione', 'Altro'];

/** Quante righe si mostrano per volta: oltre, la tabella diventa illeggibile prima che lenta. */
const PAGE_SIZE = 50;

const STATUS_CHIP_CLASS = {
  [ACTIVITY_STATUS.DRAFT]: 'chip-neutral',
  [ACTIVITY_STATUS.SUBMITTED]: 'chip-warning',
  [ACTIVITY_STATUS.VALIDATED]: 'chip-success',
  [ACTIVITY_STATUS.REJECTED]: 'chip-danger',
};

const ActivitiesSection = ({
  studentId,
  student = null,
  language = 'it',
  isReadOnly = false,
  currentUser = null,
}) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingFormat, setExportingFormat] = useState(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [attachmentCounts, setAttachmentCounts] = useState({});
  const hasLoadedOnce = useRef(false);

  const [newActivity, setNewActivity] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editingActivity, setEditingActivity] = useState(emptyForm);

  // Filtri, ordinamento e paginazione
  const [query, setQuery] = useState('');
  const [range, setRange] = useState(() => buildPeriodRange('all'));
  const [typeFilter, setTypeFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Modelli di attività
  const [templates, setTemplates] = useState(() => getTemplates(currentUser?.id));
  const [templateName, setTemplateName] = useState('');
  const [isNamingTemplate, setIsNamingTemplate] = useState(false);

  const role = currentUser?.role || 'student';
  const canEdit = !isReadOnly;
  const canValidate = !isReadOnly && ['trainer', 'admin', 'app_admin'].includes(role);

  const loadActivities = async () => {
    if (!studentId) { setActivities([]); return; }
    try {
      const data = await getActivitiesForStudent(studentId);
      setActivities(data);
    } catch (error) {
      logError('ActivitiesSection', 'Errore caricamento attività', error);
      setActivities([]);
    } finally {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    }
  };

  // Un'unica lettura per tutto l'apprendista: il pannello allegati di ogni riga
  // riceve solo il numero e carica l'elenco quando lo si apre.
  const loadAttachmentCounts = async () => {
    if (!studentId) { setAttachmentCounts({}); return; }
    try {
      const rows = await getAttachmentsForStudent(studentId);
      const counts = {};
      rows.forEach((row) => {
        if (row.entityType !== 'activity') return;
        counts[row.entityId] = (counts[row.entityId] || 0) + 1;
      });
      setAttachmentCounts(counts);
    } catch (error) {
      logError('ActivitiesSection', 'Errore caricamento allegati', error);
      setAttachmentCounts({});
    }
  };

  useEffect(() => {
    hasLoadedOnce.current = false;
    setIsLoading(true);
    setVisibleCount(PAGE_SIZE);
    loadActivities();
    loadAttachmentCounts();

    if (!studentId) return undefined;
    const channel = supabase
      .channel(`activities-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `student_id=eq.${studentId}` }, () => {
        loadActivities();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId]);

  useEffect(() => { setTemplates(getTemplates(currentUser?.id)); }, [currentUser?.id]);

  // ── Filtri ──────────────────────────────────────────────────────────────────
  const availableTypes = useMemo(
    () => Array.from(new Set(activities.map((a) => a.activityType).filter(Boolean))).sort(),
    [activities]
  );
  const availableSites = useMemo(
    () => Array.from(new Set(activities.map((a) => a.site).filter(Boolean))).sort(),
    [activities]
  );

  const filteredActivities = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inRange = filterByRange(activities, range, 'date');

    const filtered = inRange.filter((activity) => {
      if (typeFilter && activity.activityType !== typeFilter) return false;
      if (siteFilter && activity.site !== siteFilter) return false;
      if (statusFilter && (activity.status || ACTIVITY_STATUS.DRAFT) !== statusFilter) return false;
      if (!needle) return true;
      return [activity.description, activity.activityType, activity.site, activity.ticket]
        .some((field) => String(field || '').toLowerCase().includes(needle));
    });

    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === 'number' || typeof right === 'number') {
        return ((left ?? 0) - (right ?? 0)) * direction;
      }
      return String(left ?? '').localeCompare(String(right ?? '')) * direction;
    });
  }, [activities, query, range, typeFilter, siteFilter, statusFilter, sort]);

  const visibleActivities = filteredActivities.slice(0, visibleCount);
  const totalHours = minutesToHours(sumDurationMinutes(filteredActivities));
  const hasActiveFilters = Boolean(query || typeFilter || siteFilter || statusFilter || range.preset !== 'all');

  const resetFilters = () => {
    setQuery('');
    setTypeFilter('');
    setSiteFilter('');
    setStatusFilter('');
    setRange(buildPeriodRange('all'));
    setVisibleCount(PAGE_SIZE);
  };

  const toggleSort = (key) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const buildPayload = (form) => ({
    date: form.date,
    description: form.description.trim(),
    activityType: form.activityType.trim(),
    startTime: form.startTime,
    trainerTime: form.trainerTime,
    apprenticeCount: form.apprenticeCount ? parseInt(form.apprenticeCount, 10) : null,
    durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes, 10) : null,
    site: form.site.trim(),
    ticket: form.ticket.trim(),
  });

  const handleAdd = async () => {
    if (!newActivity.description.trim() || !newActivity.date || !studentId) return;
    try {
      // Quando è il formatore a registrare l'attività, la validazione è implicita:
      // sta scrivendo il proprio resoconto, non una dichiarazione da controllare.
      const payload = {
        ...buildPayload(newActivity),
        status: canValidate ? ACTIVITY_STATUS.VALIDATED : ACTIVITY_STATUS.DRAFT,
        validatedBy: canValidate ? currentUser?.id ?? null : null,
        validatedByName: canValidate ? currentUser?.name || null : null,
      };
      await addActivity(studentId, payload, currentUser?.id || null);
      setNewActivity({ ...emptyForm, date: newActivity.date });
      await loadActivities();
    } catch (error) {
      logError('ActivitiesSection', 'Errore salvataggio attività', error);
      notifyError(`${t('activities.saveError')}: ${error.message || error}`);
    }
  };

  const startEdit = (activity) => {
    setEditingId(activity.id);
    setEditingActivity({
      date: activity.date,
      startTime: activity.startTime || '',
      trainerTime: activity.trainerTime || '',
      apprenticeCount: activity.apprenticeCount ?? '',
      activityType: activity.activityType || '',
      description: activity.description,
      durationMinutes: activity.durationMinutes ?? '',
      site: activity.site || '',
      ticket: activity.ticket || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingActivity(emptyForm);
  };

  const handleUpdate = async (activity) => {
    if (!editingActivity.description.trim() || !editingActivity.date) return;
    try {
      // Se a modificare è l'apprendista, un'attività già validata torna in bozza:
      // la firma del formatore vale per il testo che aveva letto.
      const shouldReopen = !canValidate && activity.status === ACTIVITY_STATUS.VALIDATED;
      await updateActivity(activity.id, {
        ...buildPayload(editingActivity),
        ...(shouldReopen ? { status: ACTIVITY_STATUS.DRAFT } : {}),
      });
      cancelEdit();
      await loadActivities();
    } catch (error) {
      logError('ActivitiesSection', 'Errore modifica attività', error);
      notifyError(`${t('activities.saveError')}: ${error.message || error}`);
    }
  };

  const handleDelete = async (activityId) => {
    if (!window.confirm(t('activities.confirmDelete'))) return;
    try {
      await deleteActivity(activityId);
      await loadActivities();
    } catch (error) {
      logError('ActivitiesSection', 'Errore eliminazione attività', error);
      notifyError(t('activities.deleteError'));
    }
  };

  /** Duplica: stessi dati, data di oggi, pronti da ritoccare nel form in alto. */
  const handleDuplicate = (activity) => {
    setNewActivity({
      date: todayIso(),
      startTime: activity.startTime || '',
      trainerTime: activity.trainerTime || '',
      apprenticeCount: activity.apprenticeCount ?? '',
      activityType: activity.activityType || '',
      description: activity.description || '',
      durationMinutes: activity.durationMinutes ?? '',
      site: activity.site || '',
      ticket: activity.ticket || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    notifySuccess(t('activities.duplicated'));
  };

  // ── Validazione ─────────────────────────────────────────────────────────────
  const changeStatus = async (activity, status, reason = '') => {
    try {
      await setActivityStatus(activity.id, status, {
        actorId: currentUser?.id || null,
        actorName: currentUser?.name || null,
        reason,
      });
      await loadActivities();
    } catch (error) {
      logError('ActivitiesSection', 'Errore cambio stato attività', error);
      notifyError(error.code === 'MIGRATION_REQUIRED'
        ? t('activities.migrationRequired')
        : t('activities.statusError'));
    }
  };

  const handleReject = (activity) => {
    const reason = window.confirm(t('activities.confirmReject')) ? t('activities.rejectedByTrainer') : null;
    if (reason === null) return;
    changeStatus(activity, ACTIVITY_STATUS.REJECTED, reason);
  };

  // ── Modelli ─────────────────────────────────────────────────────────────────
  const handleApplyTemplate = (name) => {
    const template = templates.find((item) => item.name === name);
    if (!template) return;
    setNewActivity((prev) => applyTemplate(prev, template));
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) { setIsNamingTemplate(false); return; }
    setTemplates(saveTemplate(currentUser?.id, templateName, newActivity));
    setTemplateName('');
    setIsNamingTemplate(false);
    notifySuccess(t('activities.templateSaved'));
  };

  const handleDeleteTemplate = (name) => {
    if (!window.confirm(t('activities.confirmDeleteTemplate'))) return;
    setTemplates(deleteTemplate(currentUser?.id, name));
  };

  // ── Esportazioni ────────────────────────────────────────────────────────────
  const reportStudent = student || { id: studentId, name: '' };

  const announceExportResult = (result) => {
    if (result?.success) notifySuccess(t('export.success'));
    else if (result && !result.canceled) notifyError(result.error || t('export.error'));
  };

  const handleExportExcel = async () => {
    setExportingFormat('excel');
    try {
      // Si esporta quello che l'utente sta guardando: filtri compresi.
      const result = await exportActivitiesToExcel({
        activities: filteredActivities,
        studentName: reportStudent.name,
        language,
      });
      announceExportResult(result);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportPdf = async () => {
    setExportingFormat('pdf');
    try {
      const [grades, notes] = await Promise.all([
        loadGrades(studentId).catch(() => []),
        getNotesForStudent(studentId).catch(() => []),
      ]);
      const result = await exportStudentReportToPdf({
        student: reportStudent,
        activities: filteredActivities,
        grades,
        notes,
        language,
      });
      announceExportResult(result);
    } catch (error) {
      logError('ActivitiesSection', 'Errore esportazione report PDF', error);
      notifyError(t('export.error'));
    } finally {
      setExportingFormat(null);
    }
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale);
  };

  const renderStatus = (activity) => {
    if (activity.date > todayIso()) {
      return <span className="chip chip-booking">{t('activities.status.booking')}</span>;
    }
    const status = activity.status || ACTIVITY_STATUS.DRAFT;
    const title = activity.validatedByName && status === ACTIVITY_STATUS.VALIDATED
      ? `${t('activities.validatedBy')} ${activity.validatedByName}${activity.validatedAt ? ` · ${new Date(activity.validatedAt).toLocaleDateString(locale)}` : ''}`
      : activity.rejectionReason || '';
    return (
      <span className={`chip ${STATUS_CHIP_CLASS[status] || 'chip-neutral'}`} title={title}>
        {t(`activities.status.${status}`)}
      </span>
    );
  };

  const renderStatusActions = (activity) => {
    if (activity.date > todayIso()) return null;
    const status = activity.status || ACTIVITY_STATUS.DRAFT;

    if (canValidate) {
      if (status === ACTIVITY_STATUS.VALIDATED) {
        return (
          <button type="button" onClick={() => changeStatus(activity, ACTIVITY_STATUS.DRAFT)} title={t('activities.reopen')}>
            <RotateCcw size={15} />
          </button>
        );
      }
      return (
        <>
          <button type="button" className="success" onClick={() => changeStatus(activity, ACTIVITY_STATUS.VALIDATED)} title={t('activities.validate')}>
            <CheckCircle2 size={15} />
          </button>
          <button type="button" className="danger" onClick={() => handleReject(activity)} title={t('activities.reject')}>
            <XCircle size={15} />
          </button>
        </>
      );
    }

    if (canEdit && (status === ACTIVITY_STATUS.DRAFT || status === ACTIVITY_STATUS.REJECTED)) {
      return (
        <button type="button" onClick={() => changeStatus(activity, ACTIVITY_STATUS.SUBMITTED)} title={t('activities.submit')}>
          <Send size={15} />
        </button>
      );
    }
    return null;
  };

  const sortableHeader = (key, label, extraProps = {}) => (
    <th {...extraProps}>
      <button type="button" className="sort-header" onClick={() => toggleSort(key)}>
        {label}
        <ArrowUpDown size={12} className={sort.key === key ? 'sort-active' : ''} />
      </button>
    </th>
  );

  if (isLoading) {
    return (
      <div className="activities-section">
        <SectionSkeleton />
      </div>
    );
  }

  return (
    <div className="activities-section">
      <div className="section-header">
        <div>
          <h2>{t('activities.title')}</h2>
          <p className="section-subtitle">{t('activities.subtitle')}</p>
        </div>
        <div className="export-actions">
          <button
            type="button"
            className="export-button"
            onClick={handleExportExcel}
            disabled={exportingFormat !== null || filteredActivities.length === 0}
          >
            <FileSpreadsheet size={15} />
            {exportingFormat === 'excel' ? t('export.inProgress') : t('export.excel')}
          </button>
          <button
            type="button"
            className="export-button"
            onClick={handleExportPdf}
            disabled={exportingFormat !== null || !studentId}
          >
            <FileText size={15} />
            {exportingFormat === 'pdf' ? t('export.inProgress') : t('export.pdf')}
          </button>
          <button
            type="button"
            className="export-button export-button-primary"
            onClick={() => setIsReportOpen(true)}
            disabled={!studentId}
          >
            <FileText size={15} />
            {t('report.periodShort')}
          </button>
        </div>
      </div>

      <datalist id="activity-type-suggestions">
        {ACTIVITY_TYPE_SUGGESTIONS.map((suggestion) => <option key={suggestion} value={suggestion} />)}
      </datalist>

      {canEdit && (
        <div className="activity-add-form add-form entry-panel">
          <div className="entry-head">
            <h3 className="entry-title">{t('activities.newActivity')}</h3>
            {templates.length > 0 && (
              <div className="entry-templates">
                <span className="entry-templates-label">{t('activities.templates')}</span>
                {templates.map((template) => (
                  <span key={template.name} className="template-chip">
                    <button type="button" onClick={() => handleApplyTemplate(template.name)}>
                      {template.name}
                    </button>
                    <button
                      type="button"
                      className="template-chip-delete"
                      onClick={() => handleDeleteTemplate(template.name)}
                      aria-label={t('common.delete')}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <ActivityFormFields
            idPrefix="new-activity"
            value={newActivity}
            onChange={setNewActivity}
            onSubmit={handleAdd}
            t={t}
            labels={{
              date: t('activities.date'),
              type: t('activities.type'),
              duration: t('activities.duration'),
              startTime: t('activities.apprenticeTime'),
              description: t('activities.description'),
            }}
          />

          <div className="entry-actions">
            {isNamingTemplate ? (
              <span className="template-chip template-chip-input">
                <input
                  autoFocus
                  type="text"
                  value={templateName}
                  placeholder={t('activities.templateName')}
                  aria-label={t('activities.templateName')}
                  onChange={(event) => setTemplateName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSaveTemplate();
                    if (event.key === 'Escape') { setIsNamingTemplate(false); setTemplateName(''); }
                  }}
                />
                <button type="button" onClick={handleSaveTemplate} aria-label={t('common.save')}>
                  <Save size={12} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="template-save-button"
                onClick={() => setIsNamingTemplate(true)}
                title={t('activities.saveAsTemplate')}
              >
                <BookmarkPlus size={15} />
                {t('activities.saveAsTemplate')}
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={handleAdd}
              disabled={!newActivity.description.trim() || !newActivity.date}
            >
              <Plus size={16} />
              {t('activities.addActivity')}
            </button>
          </div>
        </div>
      )}

      <div className="filters-bar">
        <div className="filter-search">
          <Search size={15} />
          <input
            type="search"
            className="filter-input"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }}
            placeholder={t('activities.filterPlaceholder')}
            aria-label={t('activities.filterPlaceholder')}
          />
        </div>

        <PeriodFilter
          value={range}
          onChange={(next) => { setRange(next); setVisibleCount(PAGE_SIZE); }}
          language={language}
          compact
        />

        <select
          className="filter-input"
          value={typeFilter}
          onChange={(event) => { setTypeFilter(event.target.value); setVisibleCount(PAGE_SIZE); }}
          aria-label={t('activities.type')}
        >
          <option value="">{t('activities.allTypes')}</option>
          {availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>

        <select
          className="filter-input"
          value={siteFilter}
          onChange={(event) => { setSiteFilter(event.target.value); setVisibleCount(PAGE_SIZE); }}
          aria-label={t('activities.site')}
        >
          <option value="">{t('activities.allSites')}</option>
          {availableSites.map((site) => <option key={site} value={site}>{site}</option>)}
        </select>

        <select
          className="filter-input"
          value={statusFilter}
          onChange={(event) => { setStatusFilter(event.target.value); setVisibleCount(PAGE_SIZE); }}
          aria-label={t('activities.status')}
        >
          <option value="">{t('activities.allStatuses')}</option>
          {Object.values(ACTIVITY_STATUS).map((status) => (
            <option key={status} value={status}>{t(`activities.status.${status}`)}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button type="button" className="filter-reset" onClick={resetFilters}>
            <X size={14} />
            {t('activities.clearFilters')}
          </button>
        )}
      </div>

      <div className="filters-summary">
        {t('activities.resultsCount')
          .replace('{shown}', String(filteredActivities.length))
          .replace('{total}', String(activities.length))}
        {' · '}
        {t('report.totalHours')}: <strong>{totalHours} h</strong>
      </div>

      {filteredActivities.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={36} />
          <p>{activities.length === 0 ? t('activities.noActivities') : t('activities.noMatches')}</p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table activities-table">
              <thead>
                <tr>
                  {sortableHeader('date', `${t('activities.date')} / ${t('activities.apprenticeTime')}`, { style: { width: '170px' } })}
                  <th style={{ width: '105px' }}>{t('activities.trainerTime')}</th>
                  <th style={{ width: '80px' }}>{t('activities.apprenticeCount')}</th>
                  {sortableHeader('activityType', t('activities.type'), { style: { width: '140px' } })}
                  <th>{t('activities.description')}</th>
                  {sortableHeader('durationMinutes', t('activities.duration'), { style: { width: '105px' } })}
                  {sortableHeader('site', t('activities.site'), { style: { width: '120px' } })}
                  <th style={{ width: '105px' }}>{t('activities.ticket')}</th>
                  {sortableHeader('status', t('activities.status'), { style: { width: '120px' } })}
                  <th style={{ width: '150px' }} aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {visibleActivities.map((activity) => (
                  <tr key={activity.id} className={activity.status === ACTIVITY_STATUS.REJECTED ? 'row-rejected' : ''}>
                    {editingId === activity.id ? (
                      <>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <input type="date" value={editingActivity.date} onChange={(e) => setEditingActivity({ ...editingActivity, date: e.target.value })} className="input-sm" />
                            <input type="time" value={editingActivity.startTime} onChange={(e) => setEditingActivity({ ...editingActivity, startTime: e.target.value })} className="input-sm" />
                          </div>
                        </td>
                        <td><input type="time" value={editingActivity.trainerTime} onChange={(e) => setEditingActivity({ ...editingActivity, trainerTime: e.target.value })} className="input-sm" /></td>
                        <td><input type="number" min="1" step="1" value={editingActivity.apprenticeCount} onChange={(e) => setEditingActivity({ ...editingActivity, apprenticeCount: e.target.value })} className="input-sm" /></td>
                        <td><input type="text" list="activity-type-suggestions" value={editingActivity.activityType} onChange={(e) => setEditingActivity({ ...editingActivity, activityType: e.target.value })} className="input-sm" /></td>
                        <td>
                          <input
                            type="text"
                            value={editingActivity.description}
                            onChange={(e) => setEditingActivity({ ...editingActivity, description: e.target.value })}
                            className="input-sm"
                            onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(activity); }}
                          />
                        </td>
                        <td><input type="number" min="0" step="5" value={editingActivity.durationMinutes} onChange={(e) => setEditingActivity({ ...editingActivity, durationMinutes: e.target.value })} className="input-sm" /></td>
                        <td><input type="text" value={editingActivity.site} onChange={(e) => setEditingActivity({ ...editingActivity, site: e.target.value })} className="input-sm" /></td>
                        <td><input type="text" value={editingActivity.ticket} onChange={(e) => setEditingActivity({ ...editingActivity, ticket: e.target.value })} className="input-sm" /></td>
                        <td>{renderStatus(activity)}</td>
                        <td className="table-actions">
                          <button type="button" className="success" onClick={() => handleUpdate(activity)} aria-label={t('common.save')}>
                            <Save size={16} />
                          </button>
                          <button type="button" onClick={cancelEdit} aria-label={t('common.cancel')}>
                            <X size={16} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {formatDate(activity.date)}{activity.startTime ? ` · ${activity.startTime}` : ''}
                        </td>
                        <td>{activity.trainerTime}</td>
                        <td>{activity.apprenticeCount || ''}</td>
                        <td>{activity.activityType}</td>
                        <td>
                          {activity.description}
                          {activity.rejectionReason && (
                            <span className="rejection-reason">{activity.rejectionReason}</span>
                          )}
                        </td>
                        <td>{activity.durationMinutes ? `${activity.durationMinutes} min` : ''}</td>
                        <td>{activity.site}</td>
                        <td>{activity.ticket}</td>
                        <td>{renderStatus(activity)}</td>
                        <td className="table-actions">
                          <AttachmentsPanel
                            entityType="activity"
                            entityId={activity.id}
                            studentId={studentId}
                            count={attachmentCounts[activity.id] || 0}
                            onChange={loadAttachmentCounts}
                            currentUser={currentUser}
                            language={language}
                            isReadOnly={isReadOnly}
                          />
                          {renderStatusActions(activity)}
                          {canEdit && (
                            <>
                              <button type="button" onClick={() => handleDuplicate(activity)} aria-label={t('activities.duplicate')} title={t('activities.duplicate')}>
                                <Copy size={15} />
                              </button>
                              <button type="button" onClick={() => startEdit(activity)} aria-label={t('common.edit')}>
                                <Edit2 size={15} />
                              </button>
                              <button type="button" className="danger" onClick={() => handleDelete(activity.id)} aria-label={t('common.delete')}>
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCount < filteredActivities.length && (
            <button
              type="button"
              className="load-more-button"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            >
              <ChevronDown size={16} />
              {t('activities.loadMore').replace('{count}', String(Math.min(PAGE_SIZE, filteredActivities.length - visibleCount)))}
            </button>
          )}
        </>
      )}

      <PeriodReportDialog
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        student={reportStudent}
        language={language}
        currentUser={currentUser}
      />
    </div>
  );
};

export default ActivitiesSection;
