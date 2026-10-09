import React, { useState, useEffect } from 'react';
import { Users, Search } from 'lucide-react';
import { translate } from '../i18n';
import { getStudentsByTrainer, getAllUsers } from '../data/users.supabase';
import SideMenu from '../components/SideMenu';
import ProfileSection from '../components/ProfileSection';
import GradingSection from '../components/GradingSection';
import CalendarSection from '../components/CalendarSection';
import NotesSection from '../components/NotesSection';
import ActivitiesSection from '../components/ActivitiesSection';
import BookingSection from '../components/BookingSection';
import AbsencesSection from '../components/AbsencesSection';
import DataSection from '../components/DataSection';
import GradesByUserChart from '../components/GradesByUserChart';
import GradesTrendChart from '../components/GradesTrendChart';
import NotificationsPanel from '../components/NotificationsPanel';
import SettingsSection from '../components/SettingsSection';
import ManageSection from '../components/ManageSection';
import OfflineBanner from '../components/OfflineBanner';
import GlobalSearch from '../components/GlobalSearch';
import { useOfflineState } from '../hooks/useOfflineState';
import { useReminders } from '../hooks/useReminders';
import { logError } from '../utils/logger';

// Impostazioni utente (localStorage — preferenze per dispositivo)
const loadUserSettings = (userId) => {
  try { return JSON.parse(localStorage.getItem('userSettings') || '{}')[userId] || null; } catch { return null; }
};
const saveUserSettings = (userId, settings) => {
  try {
    const all = JSON.parse(localStorage.getItem('userSettings') || '{}');
    localStorage.setItem('userSettings', JSON.stringify({ ...all, [userId]: settings }));
  } catch { }
};

const getDefaultStartView = (role) => role === 'admin' || role === 'app_admin' ? 'manage' : 'dashboard';

const buildDefaultUserSettings = (role) => ({
  startView: getDefaultStartView(role),
  compactMode: false,
  reducedMotion: false,
  rememberSelectedStudent: true,
  lastSelectedStudentId: null,
  inactivityMinutes: 5,
  remindersEnabled: true
});

const DashboardScreen = ({
  currentUser,
  onLogout,
  language,
  onLanguageChange,
  onInactivityMinutesChange = null
}) => {
  const userRole = currentUser.role;
  const isTrainer = userRole === 'trainer';
  const isAdmin = userRole === 'admin' || userRole === 'app_admin';
  const isInspector = userRole === 'inspector';
  // Senza rete si lavora sull'ultima copia locale: qualsiasi salvataggio
  // fallirebbe in silenzio, quindi l'app passa in sola lettura.
  const { isOffline, lastSyncAt } = useOfflineState();
  const isReadOnly = isInspector || isOffline;
  const canSelectStudents = isTrainer || isAdmin || isInspector;
  const t = (key) => translate(key, language);
  const availableStartViews = [
    { value: 'dashboard', label: t('menu.dashboard') },
    { value: 'calendar', label: t('calendar.title') },
    { value: 'notes', label: t('notes.title') },
    { value: 'activities', label: t('activities.title') },
    { value: 'booking', label: t('booking.title') },
    { value: 'absences', label: t('absences.title') },
    { value: 'grading', label: t('grading.title') },
    ...(canSelectStudents ? [{ value: 'data', label: t('data.title') }] : []),
    ...(isAdmin ? [{ value: 'manage', label: t('manage.title') }] : []),
    { value: 'settings', label: t('menu.settings') }
  ];
  const allowedStartViewIds = availableStartViews.map((view) => view.value);
  const isAllowedStartView = (view) => allowedStartViewIds.includes(view);

  // Per il formatore/admin/ispettore: gestione selezione apprendista
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [liveCurrentUser, setLiveCurrentUser] = useState(currentUser);
  const [userSettings, setUserSettings] = useState(() => buildDefaultUserSettings(userRole));
  const [currentView, setCurrentView] = useState(getDefaultStartView(userRole));
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Promemoria: calcolati sui dati che le sezioni leggono comunque, quindi
  // senza traffico aggiuntivo quando si passa da una vista all'altra.
  const { reminders, dismiss: dismissReminder, dismissAll: dismissAllReminders } = useReminders({
    currentUser,
    students,
    canSelectStudents,
    language,
    enabled: userSettings.remindersEnabled !== false,
  });

  // Pallino sulle voci di menu che hanno qualcosa in sospeso.
  const menuBadges = React.useMemo(() => {
    const badges = {};
    reminders.forEach((reminder) => {
      if (!reminder.view) return;
      badges[reminder.view] = (badges[reminder.view] || 0) + 1;
    });
    return badges;
  }, [reminders]);

  useEffect(() => {
    if (!currentUser) {
      setUserSettings(buildDefaultUserSettings(userRole));
      setCurrentView(getDefaultStartView(userRole));
      return;
    }

    const savedSettings = loadUserSettings(currentUser.id) || {};
    const mergedSettings = {
      ...buildDefaultUserSettings(userRole),
      ...savedSettings
    };
    const normalizedStartView = isAllowedStartView(mergedSettings.startView)
      ? mergedSettings.startView
      : getDefaultStartView(userRole);

    setUserSettings({
      ...mergedSettings,
      startView: normalizedStartView
    });
    setCurrentView(normalizedStartView);
  }, [currentUser, isAdmin, userRole]);

  useEffect(() => {
    document.body.classList.toggle('compact-mode', Boolean(userSettings.compactMode));
    document.body.classList.toggle('reduced-motion', Boolean(userSettings.reducedMotion));

    return () => {
      document.body.classList.remove('compact-mode');
      document.body.classList.remove('reduced-motion');
    };
  }, [userSettings.compactMode, userSettings.reducedMotion]);

  // Il timeout di inattività è gestito da App.js (avvolge anche il login),
  // quindi la preferenza salvata qui va propagata verso l'alto.
  useEffect(() => {
    if (typeof onInactivityMinutesChange === 'function') {
      onInactivityMinutesChange(userSettings.inactivityMinutes ?? 5);
    }
  }, [userSettings.inactivityMinutes, onInactivityMinutesChange]);

  const handleUserSettingsChange = (updates) => {
    if (!currentUser?.id) return;

    setUserSettings((prev) => {
      const nextSettings = {
        ...prev,
        ...updates
      };
      const normalizedStartView = isAllowedStartView(nextSettings.startView)
        ? nextSettings.startView
        : getDefaultStartView(userRole);
      const normalizedSettings = {
        ...nextSettings,
        startView: normalizedStartView
      };

      saveUserSettings(currentUser.id, normalizedSettings);
      return normalizedSettings;
    });
  };

  useEffect(() => {
    if (!currentUser) {
      setLiveCurrentUser(null);
      return;
    }

    if (canSelectStudents) {
      setLiveCurrentUser(currentUser);
      return;
    }

    const refreshUser = async () => {
      try {
        const allUsers = await getAllUsers(currentUser.role === 'app_admin' ? null : currentUser.workspaceId);
        const latestUser = allUsers.find((user) => user.id === currentUser.id) || currentUser;
        setLiveCurrentUser(latestUser);
      } catch (error) {
        // Né rete né cache: si resta sui dati del login invece di svuotare la vista
        logError('DashboardScreen', 'Aggiornamento profilo utente fallito', error);
        setLiveCurrentUser(currentUser);
      }
    };
    refreshUser();
  }, [canSelectStudents, currentUser]);

  // Per l'apprendista: usa dati aggiornati da storage
  const activeUser = canSelectStudents ? selectedStudent : liveCurrentUser;
  const studentName = activeUser?.name || '';
  const studentNumber = activeUser?.studentNumber || '';
  const formationYear = activeUser?.formationYear || null;
  const apprenticeshipStart = activeUser?.apprenticeshipStart || '';
  const apprenticeshipEnd = activeUser?.apprenticeshipEnd || '';

  // Ref per leggere userSettings dentro useEffect senza aggiungerli alle dipendenze
  const userSettingsRef = React.useRef(userSettings);
  useEffect(() => { userSettingsRef.current = userSettings; }, [userSettings]);

  // Carica la lista degli apprendisti per il formatore/admin/ispettore
  useEffect(() => {
    if (!canSelectStudents) {
      setStudents([]);
      setSelectedStudent(null);
      return;
    }
    const workspaceId = currentUser?.workspaceId ?? null;
    const loadStudents = async () => {
      let studentsList;
      try {
        studentsList = isTrainer
          ? await getStudentsByTrainer(currentUser.id, currentUser.role === 'app_admin' ? null : workspaceId)
          : (await getAllUsers(currentUser.role === 'app_admin' ? null : workspaceId)).filter((user) => user.role === 'student');
      } catch (error) {
        logError('DashboardScreen', 'Caricamento apprendisti fallito', error);
        setStudents([]);
        setSelectedStudent(null);
        return;
      }
      setStudents(studentsList);
      if (studentsList.length === 0) {
        setSelectedStudent(null);
        return;
      }
      // Leggo i settings dal ref per evitare loop: le preferenze non devono
      // ritriggerare il caricamento degli studenti
      const { rememberSelectedStudent, lastSelectedStudentId } = userSettingsRef.current;
      const preferredStudentId = rememberSelectedStudent ? lastSelectedStudentId : null;
      const preferredStudent = studentsList.find((student) => student.id === preferredStudentId);
      setSelectedStudent(preferredStudent || studentsList[0]);
    };
    loadStudents();
  }, [canSelectStudents, currentUser, isTrainer]);

  useEffect(() => {
    if (!canSelectStudents || !currentUser?.id || !selectedStudent || !userSettings.rememberSelectedStudent) {
      return;
    }

    if (userSettings.lastSelectedStudentId === selectedStudent.id) {
      return;
    }

    handleUserSettingsChange({ lastSelectedStudentId: selectedStudent.id });
  }, [selectedStudent]);

  const handleStudentSelect = (student) => {
    setSelectedStudent(student);
  };

  /** Selezione per id: serve a ricerca globale e promemoria, che conoscono solo l'id. */
  const handleSelectStudentById = (studentIdToSelect) => {
    const target = students.find((student) => student.id === studentIdToSelect);
    if (target) setSelectedStudent(target);
  };

  // La password non è più tenuta nello stato dell'app: dopo il cambio non c'è
  // nulla da aggiornare lato client, la verifica passa sempre dal database.
  const handlePasswordChange = () => {};

  const handleNavigation = (view) => {
    setCurrentView(view);
  };

  // Comandi dal menu nativo Electron (es. “Supporto → Controlla aggiornamenti”)
  useEffect(() => {
    if (!window.electronAPI?.onMenuCommand) return;
    return window.electronAPI.onMenuCommand((command) => {
      if (command === 'open-settings') setCurrentView('settings');
    });
  }, []);

  // Ricerca globale: Ctrl+K (Cmd+K su Mac)
  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className="dashboard-screen">
      <SideMenu
        isOpen={true}
        onLogout={onLogout}
        onNavigate={handleNavigation}
        currentView={currentView}
        language={language}
        isTrainer={isTrainer}
        isAdmin={isAdmin}
        canSelectStudents={canSelectStudents}
        badges={menuBadges}
      />

      <div className="dashboard-main">
        <div className="dashboard-content">
          <div className="dashboard-topbar">
            <button
              type="button"
              className="search-trigger"
              onClick={() => setIsSearchOpen(true)}
              disabled={!activeUser}
              title={t('search.title')}
            >
              <Search size={16} />
              <span>{t('search.placeholder')}</span>
              <kbd>Ctrl</kbd><kbd>K</kbd>
            </button>
            <NotificationsPanel
              reminders={reminders}
              language={language}
              onNavigate={handleNavigation}
              onSelectStudent={canSelectStudents ? handleSelectStudentById : null}
              onDismiss={dismissReminder}
              onDismissAll={dismissAllReminders}
            />
            <div className="dashboard-logo-fixed">
              <img src="/logo-formatrack.png" alt="FormaTrack Logo" style={{ height: '60px', width: 'auto' }} />
            </div>
          </div>

          {isOffline && <OfflineBanner lastSyncAt={lastSyncAt} language={language} />}

        {canSelectStudents && students.length > 0 && currentView !== 'settings' && currentView !== 'manage' && (
          <div className="student-selector-section">
            <div className="section-title">{t('trainer.selectStudent')}</div>
            <div className="student-selector">
              {students.map((student) => (
                <button
                  key={student.id}
                  className={`student-button ${selectedStudent?.id === student.id ? 'active' : ''}`}
                  onClick={() => handleStudentSelect(student)}
                >
                  <Users size={18} />
                  <span>{student.name}</span>
                  {selectedStudent?.id === student.id && <span className="active-indicator">●</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div key={currentView}>
          {currentView === 'dashboard' && activeUser && (
            <>
              <ProfileSection
                studentName={studentName}
                studentNumber={studentNumber}
                formationYear={formationYear}
                apprenticeshipStart={apprenticeshipStart}
                apprenticeshipEnd={apprenticeshipEnd}
                language={language}
              />
              <GradesTrendChart studentId={activeUser.id} language={language} />
              {canSelectStudents && students.length > 0 && (
                <GradesByUserChart students={students} language={language} />
              )}
            </>
          )}

          {currentView === 'data' && canSelectStudents && (
            <DataSection students={students} language={language} currentUser={currentUser} />
          )}

          {currentView === 'calendar' && activeUser && (
            <CalendarSection
              studentId={activeUser.id}
              student={activeUser}
              language={language}
              isReadOnly={isReadOnly}
              currentUser={currentUser}
            />
          )}

          {currentView === 'notes' && activeUser && (
            <NotesSection
              studentId={activeUser.id}
              language={language}
              isReadOnly={isReadOnly}
              currentUser={currentUser}
            />
          )}

          {currentView === 'activities' && activeUser && (
            <ActivitiesSection
              studentId={activeUser.id}
              student={activeUser}
              language={language}
              isReadOnly={isReadOnly}
              currentUser={currentUser}
            />
          )}

          {currentView === 'booking' && activeUser && (
            <BookingSection
              studentId={activeUser.id}
              language={language}
              canManage={!isReadOnly && (isTrainer || isAdmin)}
              currentUser={currentUser}
            />
          )}

          {currentView === 'absences' && activeUser && (
            <AbsencesSection
              studentId={activeUser.id}
              language={language}
              isReadOnly={isReadOnly}
              currentUser={currentUser}
            />
          )}

          {currentView === 'grading' && activeUser && (
            <GradingSection
              studentId={activeUser.id}
              language={language}
              isReadOnly={isReadOnly}
            />
          )}

          {['calendar', 'notes', 'activities', 'booking', 'absences', 'grading'].includes(currentView) && !activeUser && (
            <div className="empty-state">
              <p>
                {language === 'it' ? 'Seleziona un apprendista per continuare' :
                 language === 'en' ? 'Select an apprentice to continue' :
                 language === 'de' ? 'Wählen Sie einen Auszubildenden aus, um fortzufahren' :
                 'Sélectionnez un apprenti pour continuer'}
              </p>
            </div>
          )}

          {currentView === 'settings' && (
            <SettingsSection
              language={language}
              onLanguageChange={onLanguageChange}
              userRole={userRole}
              isReadOnly={isReadOnly}
              currentUser={currentUser}
              onPasswordChange={handlePasswordChange}
              selectedStudent={selectedStudent}
              students={students}
              onStudentSelect={setSelectedStudent}
              userSettings={userSettings}
              onUserSettingsChange={handleUserSettingsChange}
              availableStartViews={availableStartViews}
            />
          )}

          {currentView === 'manage' && isAdmin && (
            <ManageSection
              language={language}
              currentUser={currentUser}
            />
          )}
        </div>

      </div>
      </div>

      <GlobalSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={handleNavigation}
        studentId={activeUser?.id || null}
        studentName={activeUser?.name || ''}
        students={canSelectStudents ? students : []}
        onSelectStudent={canSelectStudents ? handleSelectStudentById : null}
        language={language}
      />
    </div>
  );
};

export default DashboardScreen;
