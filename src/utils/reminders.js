/**
 * Promemoria operativi.
 *
 * Qui si decide *cosa* va segnalato; il quando e il come (notifica di sistema,
 * pallino nel menu, pannello) sono in `hooks/useReminders.js` e nei componenti.
 * Tenere la regola separata dall'effetto rende i promemoria testabili senza
 * finestre né timer.
 */

import { translate } from '../i18n';
import { ACTIVITY_STATUS } from '../data/activities.supabase';
import { ARCHIVE_RETENTION_DAYS, deletableWorkspaces } from './workspaceArchive';

export const REMINDER_KIND = {
  BOOKING_TODAY: 'bookingToday',
  BOOKING_TOMORROW: 'bookingTomorrow',
  PENDING_VALIDATION: 'pendingValidation',
  REJECTED_ACTIVITY: 'rejectedActivity',
  DRAFT_ACTIVITY: 'draftActivity',
  INACTIVE_STUDENT: 'inactiveStudent',
  MISSING_GRADE: 'missingGrade',
  UNREAD_NOTE: 'unreadNote',
  UNJUSTIFIED_ABSENCE: 'unjustifiedAbsence',
  WORKSPACE_DELETABLE: 'workspaceDeletable',
};

/** Giorni senza attività registrate oltre i quali si segnala l'apprendista. */
export const INACTIVITY_DAYS = 10;
/** Giorni senza valutazioni oltre i quali si segnala l'apprendista. */
export const GRADE_GAP_DAYS = 90;

const SEVERITY_ORDER = { warning: 0, info: 1 };

const fill = (text, vars = {}) =>
  Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    text
  );

const isoOf = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const daysBetween = (fromIso, toIso) => {
  if (!fromIso || !toIso) return null;
  const [fy, fm, fd] = String(fromIso).slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = String(toIso).slice(0, 10).split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
};

/**
 * Costruisce i promemoria per l'utente corrente.
 *
 * @param {object} params
 * @param {string} params.role            - ruolo dell'utente collegato
 * @param {Array}  params.students        - apprendisti visibili (vuoto per il ruolo student)
 * @param {object} params.currentUser
 * @param {Array}  params.activities
 * @param {Array}  params.grades
 * @param {Array}  params.notes
 * @param {Array}  params.absences
 * @param {Array}  [params.workspaces]    - aree di lavoro (solo per l'app admin)
 * @param {string} params.language
 * @param {Date}   [params.today]
 * @returns {Array<{id:string, kind:string, severity:string, title:string, message:string, view:string, studentId:number|null}>}
 */
export const buildReminders = ({
  role = 'student',
  students = [],
  currentUser = null,
  activities = [],
  grades = [],
  notes = [],
  absences = [],
  workspaces = [],
  language = 'it',
  today = new Date(),
}) => {
  const t = (key) => translate(key, language);
  const todayIso = isoOf(today);
  const tomorrowIso = isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

  const isStudent = role === 'student';
  const canValidate = role === 'trainer' || role === 'admin' || role === 'app_admin';
  const isInspector = role === 'inspector';

  const nameById = {};
  students.forEach((student) => { nameById[student.id] = student.name; });
  const labelFor = (studentId) => nameById[studentId] || currentUser?.name || '';

  const reminders = [];
  const push = (reminder) => { if (reminder) reminders.push(reminder); };

  // ── Prenotazioni in arrivo ────────────────────────────────────────────────
  const bookingsToday = activities.filter((a) => a.date === todayIso);
  const bookingsTomorrow = activities.filter((a) => a.date === tomorrowIso);

  if (bookingsToday.length > 0) {
    push({
      id: `${REMINDER_KIND.BOOKING_TODAY}:${todayIso}`,
      kind: REMINDER_KIND.BOOKING_TODAY,
      severity: 'info',
      title: t('reminders.bookingToday.title'),
      message: fill(t('reminders.bookingToday.message'), { count: bookingsToday.length }),
      view: 'calendar',
      studentId: bookingsToday[0].studentId ?? null,
    });
  }

  if (bookingsTomorrow.length > 0) {
    push({
      id: `${REMINDER_KIND.BOOKING_TOMORROW}:${tomorrowIso}`,
      kind: REMINDER_KIND.BOOKING_TOMORROW,
      severity: 'info',
      title: t('reminders.bookingTomorrow.title'),
      message: fill(t('reminders.bookingTomorrow.message'), { count: bookingsTomorrow.length }),
      view: 'booking',
      studentId: bookingsTomorrow[0].studentId ?? null,
    });
  }

  // ── Validazione delle attività ────────────────────────────────────────────
  const pastActivities = activities.filter((a) => a.date <= todayIso);

  if (canValidate) {
    const pending = pastActivities.filter((a) => a.status === ACTIVITY_STATUS.SUBMITTED);
    if (pending.length > 0) {
      push({
        id: `${REMINDER_KIND.PENDING_VALIDATION}:${todayIso}`,
        kind: REMINDER_KIND.PENDING_VALIDATION,
        severity: 'warning',
        title: t('reminders.pendingValidation.title'),
        message: fill(t('reminders.pendingValidation.message'), { count: pending.length }),
        view: 'activities',
        studentId: pending[0].studentId ?? null,
      });
    }
  }

  if (isStudent) {
    const rejected = pastActivities.filter((a) => a.status === ACTIVITY_STATUS.REJECTED);
    if (rejected.length > 0) {
      push({
        id: `${REMINDER_KIND.REJECTED_ACTIVITY}:${todayIso}`,
        kind: REMINDER_KIND.REJECTED_ACTIVITY,
        severity: 'warning',
        title: t('reminders.rejectedActivity.title'),
        message: fill(t('reminders.rejectedActivity.message'), { count: rejected.length }),
        view: 'activities',
        studentId: currentUser?.id ?? null,
      });
    }

    const drafts = pastActivities.filter((a) => a.status === ACTIVITY_STATUS.DRAFT);
    if (drafts.length > 0) {
      push({
        id: `${REMINDER_KIND.DRAFT_ACTIVITY}:${todayIso}`,
        kind: REMINDER_KIND.DRAFT_ACTIVITY,
        severity: 'info',
        title: t('reminders.draftActivity.title'),
        message: fill(t('reminders.draftActivity.message'), { count: drafts.length }),
        view: 'activities',
        studentId: currentUser?.id ?? null,
      });
    }

    const unreadNotes = notes.filter((note) => !note.readAt && note.visibility !== 'private');
    if (unreadNotes.length > 0) {
      push({
        id: `${REMINDER_KIND.UNREAD_NOTE}:${todayIso}`,
        kind: REMINDER_KIND.UNREAD_NOTE,
        severity: 'info',
        title: t('reminders.unreadNote.title'),
        message: fill(t('reminders.unreadNote.message'), { count: unreadNotes.length }),
        view: 'notes',
        studentId: currentUser?.id ?? null,
      });
    }
  }

  // ── Apprendisti fermi e valutazioni mancanti ──────────────────────────────
  if (canValidate || isInspector) {
    const lastActivityByStudent = {};
    activities.forEach((activity) => {
      if (activity.date > todayIso) return;
      const current = lastActivityByStudent[activity.studentId];
      if (!current || activity.date > current) lastActivityByStudent[activity.studentId] = activity.date;
    });

    const lastGradeByStudent = {};
    grades.forEach((grade) => {
      const iso = String(grade.date || '').slice(0, 10);
      if (!iso) return;
      const current = lastGradeByStudent[grade.utente_id];
      if (!current || iso > current) lastGradeByStudent[grade.utente_id] = iso;
    });

    students.forEach((student) => {
      const lastActivity = lastActivityByStudent[student.id];
      const gapDays = lastActivity ? daysBetween(lastActivity, todayIso) : null;
      if (!lastActivity || gapDays >= INACTIVITY_DAYS) {
        push({
          id: `${REMINDER_KIND.INACTIVE_STUDENT}:${student.id}:${todayIso}`,
          kind: REMINDER_KIND.INACTIVE_STUDENT,
          severity: 'warning',
          title: t('reminders.inactiveStudent.title'),
          message: fill(t('reminders.inactiveStudent.message'), {
            name: student.name,
            days: lastActivity ? gapDays : '—',
          }),
          view: 'activities',
          studentId: student.id,
        });
      }

      const lastGrade = lastGradeByStudent[student.id];
      const gradeGap = lastGrade ? daysBetween(lastGrade, todayIso) : null;
      if (!lastGrade || gradeGap >= GRADE_GAP_DAYS) {
        push({
          id: `${REMINDER_KIND.MISSING_GRADE}:${student.id}:${todayIso}`,
          kind: REMINDER_KIND.MISSING_GRADE,
          severity: 'info',
          title: t('reminders.missingGrade.title'),
          message: fill(t('reminders.missingGrade.message'), { name: student.name }),
          view: 'grading',
          studentId: student.id,
        });
      }
    });
  }

  // ── Assenze senza giustificativo ──────────────────────────────────────────
  const unjustified = absences.filter((absence) => !absence.justified && absence.endDate <= todayIso);
  if (unjustified.length > 0 && !isInspector) {
    push({
      id: `${REMINDER_KIND.UNJUSTIFIED_ABSENCE}:${todayIso}`,
      kind: REMINDER_KIND.UNJUSTIFIED_ABSENCE,
      severity: 'warning',
      title: t('reminders.unjustifiedAbsence.title'),
      message: fill(t('reminders.unjustifiedAbsence.message'), {
        count: unjustified.length,
        name: labelFor(unjustified[0].studentId),
      }),
      view: 'absences',
      studentId: unjustified[0].studentId ?? null,
    });
  }

  // ── Aree di lavoro archiviate da abbastanza tempo per essere eliminate ───
  // Il promemoria avvisa soltanto: l'eliminazione si fa dall'archivio, con conferma,
  // mai da qui, così non si elimina un'area per sbaglio.
  if (role === 'app_admin') {
    const deletable = deletableWorkspaces(workspaces, today);
    if (deletable.length > 0) {
      push({
        id: `${REMINDER_KIND.WORKSPACE_DELETABLE}:${todayIso}`,
        kind: REMINDER_KIND.WORKSPACE_DELETABLE,
        severity: 'info',
        title: t('reminders.workspaceDeletable.title'),
        message: fill(t('reminders.workspaceDeletable.message'), {
          count: deletable.length,
          days: ARCHIVE_RETENTION_DAYS,
        }),
        view: 'manage',
        studentId: null,
      });
    }
  }

  return reminders.sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
};
