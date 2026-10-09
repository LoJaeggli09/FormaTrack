/**
 * Caricamento e ciclo di vita dei promemoria.
 *
 * Le regole stanno in `utils/reminders.js`: qui si leggono i dati (passando
 * sempre dalla cache offline, quindi senza traffico aggiuntivo quando le sezioni
 * sono già state aperte), si ricontrolla a intervalli e si manda la notifica di
 * sistema una sola volta al giorno per promemoria.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getActivitiesForStudent, getActivitiesForStudents } from '../data/activities.supabase';
import { loadGrades, getGradesForStudents } from '../data/grades.supabase';
import { getNotesForStudent } from '../data/notes.supabase';
import { getAbsencesForStudent, getAbsencesForStudents } from '../data/absences.supabase';
import { getWorkspaces } from '../data/workspaces.supabase';
import { buildReminders } from '../utils/reminders';
import { logError } from '../utils/logger';

/** Ogni mezz'ora: abbastanza per accorgersi del cambio di giorno, poco per pesare. */
const REFRESH_MS = 30 * 60 * 1000;
/** Oltre questa soglia si manda una notifica riassuntiva invece di una per voce. */
const MAX_NATIVE_NOTIFICATIONS = 3;

const NOTIFIED_KEY = 'formatrack.reminders.notified';
const DISMISSED_KEY = 'formatrack.reminders.dismissed';

const todayIso = () => new Date().toISOString().slice(0, 10);

const readMap = (key, userId) => {
  try {
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    return all[userId] || {};
  } catch {
    return {};
  }
};

const writeMap = (key, userId, map) => {
  try {
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    // Si tengono solo le voci di oggi: la memoria non deve crescere all'infinito.
    const today = todayIso();
    const pruned = Object.fromEntries(Object.entries(map).filter(([, day]) => day === today));
    localStorage.setItem(key, JSON.stringify({ ...all, [userId]: pruned }));
  } catch {
    /* quota piena: i promemoria verranno semplicemente rinotificati */
  }
};

/**
 * @param {object} params
 * @param {object|null} params.currentUser
 * @param {Array}  params.students          - apprendisti visibili (vuoto per il ruolo student)
 * @param {boolean} params.canSelectStudents
 * @param {string} params.language
 * @param {boolean} [params.enabled]        - preferenza utente "promemoria attivi"
 */
export const useReminders = ({
  currentUser,
  students = [],
  canSelectStudents = false,
  language = 'it',
  enabled = true,
}) => {
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(() => readMap(DISMISSED_KEY, currentUser?.id));
  const notifiedRef = useRef(readMap(NOTIFIED_KEY, currentUser?.id));

  const userId = currentUser?.id ?? null;
  const role = currentUser?.role || 'student';
  const studentIdsKey = students.map((student) => student.id).join(',');

  const notifyNew = useCallback((list) => {
    if (!window.electronAPI?.showNotification || !userId) return;

    const today = todayIso();
    const fresh = list.filter((reminder) => notifiedRef.current[reminder.id] !== today);
    if (fresh.length === 0) return;

    if (fresh.length > MAX_NATIVE_NOTIFICATIONS) {
      window.electronAPI.showNotification(
        'FormaTrack',
        fresh.slice(0, MAX_NATIVE_NOTIFICATIONS).map((reminder) => reminder.message).join(' · ')
      );
    } else {
      fresh.forEach((reminder) => {
        window.electronAPI.showNotification(reminder.title, reminder.message);
      });
    }

    fresh.forEach((reminder) => { notifiedRef.current[reminder.id] = today; });
    writeMap(NOTIFIED_KEY, userId, notifiedRef.current);
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId || !enabled) {
      setReminders([]);
      return;
    }

    const studentIds = canSelectStudents ? students.map((student) => student.id) : [userId];
    const hasStudents = studentIds.length > 0;
    // L'app admin può non vedere apprendisti ma ha comunque le aree di lavoro da seguire.
    if (!hasStudents && role !== 'app_admin') {
      setReminders([]);
      return;
    }

    setIsLoading(true);
    try {
      const [activities, grades, absences, notes, workspaces] = await Promise.all([
        !hasStudents ? [] : (canSelectStudents ? getActivitiesForStudents(studentIds) : getActivitiesForStudent(userId)).catch(() => []),
        !hasStudents ? [] : (canSelectStudents ? getGradesForStudents(studentIds) : loadGrades(userId)).catch(() => []),
        !hasStudents ? [] : (canSelectStudents ? getAbsencesForStudents(studentIds) : getAbsencesForStudent(userId)).catch(() => []),
        canSelectStudents ? Promise.resolve([]) : getNotesForStudent(userId).catch(() => []),
        role === 'app_admin' ? getWorkspaces().catch(() => []) : Promise.resolve([]),
      ]);

      const next = buildReminders({
        role,
        students: canSelectStudents ? students : [],
        currentUser,
        activities,
        grades,
        absences,
        notes,
        workspaces,
        language,
      });

      setReminders(next);
      notifyNew(next);
    } catch (error) {
      logError('useReminders', 'Calcolo promemoria fallito', error);
      setReminders([]);
    } finally {
      setIsLoading(false);
    }
    // students è ricostruito a ogni render dal chiamante: si dipende dagli id.
  }, [userId, role, canSelectStudents, studentIdsKey, language, enabled, notifyNew]);

  useEffect(() => {
    refresh();
    if (!enabled) return undefined;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, enabled]);

  useEffect(() => {
    setDismissed(readMap(DISMISSED_KEY, userId));
    notifiedRef.current = readMap(NOTIFIED_KEY, userId);
  }, [userId]);

  const dismiss = useCallback((reminderId) => {
    setDismissed((prev) => {
      const next = { ...prev, [reminderId]: todayIso() };
      writeMap(DISMISSED_KEY, userId, next);
      return next;
    });
  }, [userId]);

  const dismissAll = useCallback(() => {
    setDismissed((prev) => {
      const today = todayIso();
      const next = { ...prev };
      reminders.forEach((reminder) => { next[reminder.id] = today; });
      writeMap(DISMISSED_KEY, userId, next);
      return next;
    });
  }, [reminders, userId]);

  const visibleReminders = reminders.filter((reminder) => dismissed[reminder.id] !== todayIso());

  return {
    reminders: visibleReminders,
    allReminders: reminders,
    isLoading,
    refresh,
    dismiss,
    dismissAll,
  };
};

export default useReminders;
