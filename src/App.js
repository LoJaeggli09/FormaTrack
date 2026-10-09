import React, { useState, useEffect } from 'react';
import './App.css';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import ThemeProvider from './components/ThemeProvider';
import ForceChangePasswordModal from './components/ForceChangePasswordModal';
import ErrorBoundary from './components/ErrorBoundary';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { getUserById } from './data/users.supabase';
import { writeAuditLog, AUDIT_EVENTS } from './data/auditLog.supabase';
import { clearOfflineCache } from './data/offlineCache';
import { saveSession, loadSession, clearSession } from './utils/session';
import { useInactivityTimeout } from './hooks/inactivityTimeout';
import { logError } from './utils/logger';

function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [language, setLanguage] = useState('it');

  const [toast, setToast] = useState({ open: false, message: '', severity: 'error' });

  useEffect(() => {
    const handleAppToast = (e) => {
      setToast({ open: true, message: e.detail.message, severity: e.detail.severity || 'error' });
    };
    window.addEventListener('app-toast', handleAppToast);
    return () => window.removeEventListener('app-toast', handleAppToast);
  }, []);

  const handleToastClose = (_, reason) => {
    if (reason === 'clickaway') return;
    setToast((prev) => ({ ...prev, open: false }));
  };

  // Ripristina la sessione all'avvio.
  // Dal localStorage arriva solo l'id: ruolo, permessi e flag mustChangePassword
  // vengono sempre riletti dal database, mai ripresi da quanto salvato in locale.
  useEffect(() => {
    // Pulizia della vecchia sessione in chiaro delle versioni <= 2.0.10
    localStorage.removeItem('currentUser');

    let cancelled = false;

    const restore = async () => {
      const session = await loadSession();
      if (!session || cancelled) return;

      try {
        const freshUser = await getUserById(session.userId);
        if (cancelled) return;
        if (!freshUser) {
          clearSession();
          return;
        }
        setCurrentUser(freshUser);
        if (freshUser.mustChangePassword) {
          setCurrentScreen('forceChangePassword');
        } else {
          setIsLoggedIn(true);
          setCurrentScreen('dashboard');
        }
      } catch (error) {
        // Né rete né copia locale: si torna al login invece di fidarsi di dati
        // di sessione non verificabili.
        logError('App', 'Ripristino sessione fallito', error);
        clearSession();
      }
    };

    restore();
    return () => { cancelled = true; };
  }, []);

  // Monitoraggio inattività — durata configurabile dall'utente in Impostazioni
  // (propagata da DashboardScreen, che ne è la fonte di verità in localStorage).
  const [inactivityMinutes, setInactivityMinutes] = useState(5);

  const handleInactivityTimeout = () => {
    handleLogout();
  };

  const { showWarning, dismissWarning } = useInactivityTimeout(
    inactivityMinutes,
    handleInactivityTimeout,
    isLoggedIn // Monitora solo quando loggato
  );

  // Carica impostazioni utente quando cambia currentUser
  useEffect(() => {
    if (currentUser) {
      const saved = JSON.parse(localStorage.getItem(`userSettings_${currentUser.id}`) || 'null');
      if (saved?.language) setLanguage(saved.language);
      else setLanguage(currentUser.settings?.language || 'it');
    }
  }, [currentUser]);

  const handleLogin = async (user) => {
    if (user.mustChangePassword) {
      // Salva l'utente in modo che il modal possa usare user.id,
      // ma NON salvare la sessione e NON andare alla dashboard finché non cambia la password
      setCurrentUser(user);
      setCurrentScreen('forceChangePassword');
      return;
    }
    setCurrentUser(user);
    setIsLoggedIn(true);
    setCurrentScreen('dashboard');
    await saveSession(user);
  };

  const handlePasswordChanged = async () => {
    const userWithoutFlag = { ...currentUser, mustChangePassword: false };
    setCurrentUser(userWithoutFlag);
    setIsLoggedIn(true);
    setCurrentScreen('dashboard');
    await saveSession(userWithoutFlag);
  };

  const handleLogout = () => {
    if (currentUser) {
      writeAuditLog({
        event: AUDIT_EVENTS.LOGOUT,
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setCurrentScreen('login');
    setInactivityMinutes(5);
    clearSession();
    // La cache contiene i dati dell'utente che esce: non deve restare
    // consultabile da chi accede dopo sulla stessa macchina.
    clearOfflineCache();
  };

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    if (currentUser) {
      const saved = JSON.parse(localStorage.getItem(`userSettings_${currentUser.id}`) || '{}');
      localStorage.setItem(`userSettings_${currentUser.id}`, JSON.stringify({ ...saved, language: newLanguage }));
    }
  };

  return (
    <ThemeProvider>
      <div className="App">
        {/* Dialog di avviso inattività */}
        {showWarning && (
          <div className="modal-backdrop modal-backdrop--top">
            <div className="modal-card modal-card--sm">
              <div className="modal-header">
                <h2>Sessione in scadenza</h2>
              </div>
              <div className="modal-body">
                <p>
                  Non hai interagito con la pagina per {inactivityMinutes} minuti. La tua sessione sta per scadere.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn-primary" onClick={dismissWarning}>
                  Continua sessione
                </button>
                <button className="btn-secondary" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        <ErrorBoundary
          message="Errore nella schermata di accesso. Riprova o riavvia l'applicazione."
          resetLabel="Riprova"
          onReset={() => window.location.reload()}
        >
          {(currentScreen === 'login' || currentScreen === 'forceChangePassword') && (
            <LoginScreen
              onLogin={handleLogin}
              language={language}
              onLanguageChange={handleLanguageChange}
            />
          )}
          {currentScreen === 'forceChangePassword' && currentUser && (
            <ForceChangePasswordModal
              user={currentUser}
              language={language}
              onPasswordChanged={handlePasswordChanged}
            />
          )}
        </ErrorBoundary>
        <ErrorBoundary
          message="Errore nella dashboard. Verrai reindirizzato al login."
          resetLabel="Torna al login"
          onReset={handleLogout}
        >
          {currentScreen === 'dashboard' && currentUser && (
            <DashboardScreen
              currentUser={currentUser}
              onLogout={handleLogout}
              language={language}
              onLanguageChange={handleLanguageChange}
              onInactivityMinutesChange={setInactivityMinutes}
            />
          )}
        </ErrorBoundary>


      </div>
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleToastClose} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}

export default App;
