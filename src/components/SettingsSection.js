import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Download, RefreshCw, CheckCircle, AlertCircle, Loader, ExternalLink } from 'lucide-react';
import { translate } from '../i18n';
import { updateUserPassword, verifyUserPassword } from '../data/users.supabase';
import APP_VERSION from '../appVersion';
import { FORMATRACK_URL, FORMATRACK_LABEL, handleExternalClick } from '../utils/externalLink';

const DEFAULT_SETTINGS = {
  startView: 'dashboard',
  compactMode: false,
  reducedMotion: false,
  rememberSelectedStudent: true,
  lastSelectedStudentId: null,
  inactivityMinutes: 5,
  remindersEnabled: true
};

/** Opzioni proposte per il logout automatico per inattività. */
const INACTIVITY_OPTIONS = [3, 5, 10, 15, 30, 60];

/** Interruttore a due stati: un campo di spunta con ruolo "switch", disegnato dal CSS. */
const Toggle = ({ id, checked, onChange, disabled = false }) => (
  <label className="toggle">
    <input id={id} type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} />
    <span className="toggle-track" aria-hidden="true" />
  </label>
);

/** Riga di impostazione: titolo e spiegazione a sinistra, controllo a destra. */
const SettingRow = ({ id, title, description, children, extra = null }) => (
  <>
    <div className="setting-row">
      <div className="setting-text">
        {id
          ? <label htmlFor={id} className="setting-title">{title}</label>
          : <span className="setting-title">{title}</span>}
        {description && <p className="setting-desc">{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
    {extra}
  </>
);

const SettingsSection = ({
  language,
  onLanguageChange,
  userRole = 'student',
  isReadOnly = false,
  currentUser = null,
  onPasswordChange = null,
  selectedStudent = null,
  students = [],
  onStudentSelect = null,
  userSettings = {},
  onUserSettingsChange = null,
  availableStartViews = []
}) => {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Stato Auto-Update ────────────────────────────────────────────────────────
  const [updateState, setUpdateState] = useState({
    status: 'idle', // idle | checking | available | not-available | downloading | downloaded | error
    version: null,
    progress: 0,
    errorMessage: null,
  });

  // Registra listener aggiornamenti status dal main process
  useEffect(() => {
    if (!window.electronAPI?.updater?.onUpdateStatus) return;
    const cleanup = window.electronAPI.updater.onUpdateStatus((data) => {
      switch (data.event) {
        case 'checking-for-update':
          setUpdateState({ status: 'checking', version: null, progress: 0, errorMessage: null });
          break;
        case 'update-available':
          setUpdateState({ status: 'available', version: data.version, progress: 0, errorMessage: null });
          break;
        case 'update-not-available':
          setUpdateState({ status: 'not-available', version: data.version, progress: 0, errorMessage: null });
          setTimeout(() => setUpdateState((prev) => ({ ...prev, status: 'idle' })), 6000);
          break;
        case 'download-progress':
          setUpdateState((prev) => ({ ...prev, status: 'downloading', progress: data.percent }));
          break;
        case 'update-downloaded':
          setUpdateState({ status: 'downloaded', version: data.version, progress: 100, errorMessage: null });
          break;
        case 'error':
          setUpdateState({ status: 'error', version: null, progress: 0, errorMessage: data.message });
          setTimeout(() => setUpdateState((prev) => ({ ...prev, status: 'idle' })), 10000);
          break;
        default:
          break;
      }
    });
    return cleanup;
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.updater?.checkForUpdates) {
      setUpdateState({ status: 'error', version: null, progress: 0, errorMessage: 'Funzione disponibile solo nell\'app desktop Electron.' });
      setTimeout(() => setUpdateState((prev) => ({ ...prev, status: 'idle' })), 6000);
      return;
    }
    setUpdateState({ status: 'checking', version: null, progress: 0, errorMessage: null });
    const result = await window.electronAPI.updater.checkForUpdates();
    if (!result.success) {
      setUpdateState({ status: 'error', version: null, progress: 0, errorMessage: result.error });
      setTimeout(() => setUpdateState((prev) => ({ ...prev, status: 'idle' })), 10000);
    }
  };

  const handleInstallUpdate = () => {
    if (!window.electronAPI?.updater?.installUpdate) {
      alert('Funzione disponibile solo nell\'app desktop Electron.');
      return;
    }
    window.electronAPI.updater.installUpdate();
  };

  const settings = {
    ...DEFAULT_SETTINGS,
    ...userSettings
  };
  const canChooseStudent = userRole === 'trainer' || userRole === 'admin' || userRole === 'inspector';
  const t = (key) => translate(key, language);

  const updateSettings = (updates) => {
    if (isReadOnly) return;
    if (typeof onUserSettingsChange === 'function') {
      onUserSettingsChange(updates);
    }
  };

  const handleToggleSetting = (key) => {
    updateSettings({ [key]: !settings[key] });
  };

  const handleLanguageChange = (e) => {
    if (isReadOnly) return;
    onLanguageChange(e.target.value);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const currentValue = String(currentPassword ?? '');
    const newValue = String(newPassword ?? '');
    const confirmValue = String(confirmPassword ?? '');
    const requirementChecks = {
      lengthRange: newValue.length >= 10 && newValue.length <= 20,
      hasUpper: /[A-Z]/.test(newValue),
      hasLower: /[a-z]/.test(newValue),
      hasNumber: /\d/.test(newValue),
      hasAllowedSpecial: /[!$#_]/.test(newValue),
      hasOnlyAllowedChars: !/[^A-Za-z0-9!$#_]/.test(newValue),
      passwordsEqual: newValue.length > 0 && newValue === confirmValue
    };

    if (!currentUser?.id) {
      setPasswordError(t('login.invalid'));
      return;
    }

    if (!currentValue) {
      setPasswordError(t('settings.password.currentRequired'));
      return;
    }
    if (!newValue) {
      setPasswordError(t('settings.password.newRequired'));
      return;
    }
    if (newValue === currentValue) {
      setPasswordError(t('settings.password.sameAsCurrent'));
      return;
    }

    if (!requirementChecks.lengthRange) {
      setPasswordError(t('settings.password.req.lengthRange'));
      return;
    }
    if (!requirementChecks.hasUpper) {
      setPasswordError(t('settings.password.req.upper'));
      return;
    }
    if (!requirementChecks.hasLower) {
      setPasswordError(t('settings.password.req.lower'));
      return;
    }
    if (!requirementChecks.hasNumber) {
      setPasswordError(t('settings.password.req.number'));
      return;
    }
    if (!requirementChecks.hasAllowedSpecial) {
      setPasswordError(t('settings.password.req.specialAllowed'));
      return;
    }
    if (!requirementChecks.hasOnlyAllowedChars) {
      setPasswordError(t('settings.password.req.noOtherSpecial'));
      return;
    }
    if (!requirementChecks.passwordsEqual) {
      setPasswordError(t('settings.password.req.match'));
      return;
    }

    // Verifica la password corrente contro l'hash bcrypt letto dal database
    const isCurrentValid = await verifyUserPassword(currentUser.id, currentValue);
    if (!isCurrentValid) {
      setPasswordError(t('settings.password.incorrect'));
      return;
    }

    // Salva la nuova password su Supabase
    try {
      await updateUserPassword(currentUser.id, newValue);
    } catch (err) {
      setPasswordError(t('login.invalid'));
      return;
    }

    if (onPasswordChange) {
      onPasswordChange(newValue);
    }

    setPasswordSuccess(t('settings.password.success'));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);

    setTimeout(() => {
      setShowPasswordChange(false);
      setPasswordSuccess('');
    }, 2000);
  };

  const livePasswordChecks = {
    lengthRange: newPassword.length >= 10 && newPassword.length <= 20,
    hasUpper: /[A-Z]/.test(newPassword),
    hasLower: /[a-z]/.test(newPassword),
    hasNumber: /\d/.test(newPassword),
    hasAllowedSpecial: /[!$#_]/.test(newPassword),
    hasOnlyAllowedChars: !/[^A-Za-z0-9!$#_]/.test(newPassword),
    passwordsEqual: newPassword.length > 0 && newPassword === confirmPassword
  };

  const passwordRequirements = [
    { key: 'lengthRange', label: t('settings.password.req.lengthRange') },
    { key: 'hasUpper', label: t('settings.password.req.upper') },
    { key: 'hasLower', label: t('settings.password.req.lower') },
    { key: 'hasNumber', label: t('settings.password.req.number') },
    { key: 'hasAllowedSpecial', label: t('settings.password.req.specialAllowed') },
    { key: 'hasOnlyAllowedChars', label: t('settings.password.req.noOtherSpecial') },
    { key: 'passwordsEqual', label: t('settings.password.req.match') }
  ];

  const updateBusy = updateState.status === 'checking' || updateState.status === 'downloading';
  const minutesLabel = (minutes) => t('settings.inactivityTimeout.minutes').replace('{count}', minutes);

  const updateStatusLines = updateState.status !== 'idle' && (
    <div className="setting-extra">
      <div className="update-status">
        {updateState.status === 'checking' && (
          <div className="update-line is-loading">
            <Loader size={16} />
            <span>{t('settings.updates.checking') || 'Controllo aggiornamenti in corso...'}</span>
          </div>
        )}
        {updateState.status === 'not-available' && (
          <div className="update-line is-ok">
            <CheckCircle size={16} />
            <span>{t('settings.updates.upToDate') || 'L\'applicazione è aggiornata all\'ultima versione.'}</span>
          </div>
        )}
        {updateState.status === 'available' && (
          <div className="update-line is-info">
            <Download size={16} />
            <span>
              {t('settings.updates.available') || 'Nuova versione disponibile:'} <strong>{updateState.version}</strong>
              {' — '}{t('settings.updates.downloading') || 'Download in corso automaticamente...'}
            </span>
          </div>
        )}
        {updateState.status === 'downloading' && (
          <div className="update-download">
            <div className="update-line is-info">
              <Download size={16} />
              <span>{t('settings.updates.downloadProgress') || 'Download aggiornamento:'} <strong>{updateState.progress}%</strong></span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${updateState.progress}%` }} />
            </div>
          </div>
        )}
        {updateState.status === 'downloaded' && (
          <div className="update-line is-ok">
            <CheckCircle size={16} />
            <span>
              {t('settings.updates.ready') || 'Versione'} <strong>{updateState.version}</strong> {t('settings.updates.readyInstall') || 'pronta — clicca su Installa e Riavvia.'}
            </span>
          </div>
        )}
        {updateState.status === 'error' && (
          <div className="update-line is-error">
            <AlertCircle size={16} />
            <span>{updateState.errorMessage || t('settings.updates.error') || 'Errore durante il controllo degli aggiornamenti.'}</span>
          </div>
        )}
      </div>
    </div>
  );

  const passwordForm = showPasswordChange && !isReadOnly && (
    <form onSubmit={handleChangePassword} className="setting-extra password-change-form">
      <div className="password-change-layout">
        <div className="password-form-panel">
          {passwordError && (
            <div className="notice notice-error">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="notice notice-success">
              {passwordSuccess}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="pw-current">{t('settings.password.current') || 'Password Attuale'}</label>
            <div className="password-input-wrapper">
              <input
                id="pw-current"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('settings.password.currentPlaceholder')}
                className="password-input"
              />
              <button
                type="button"
                className="password-toggle-button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pw-new">{t('settings.password.new') || 'Nuova Password'}</label>
            <div className="password-input-wrapper">
              <input
                id="pw-new"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('settings.password.newPlaceholder')}
                className="password-input"
              />
              <button
                type="button"
                className="password-toggle-button"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pw-confirm">{t('settings.password.confirm') || 'Conferma Password'}</label>
            <div className="password-input-wrapper">
              <input
                id="pw-confirm"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('settings.password.confirmPlaceholder')}
                className="password-input"
              />
              <button
                type="button"
                className="password-toggle-button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn-primary">
            {t('settings.savePassword') || 'Salva Nuova Password'}
          </button>
        </div>

        <aside className="password-requirements-card" aria-label={t('settings.password.requirementsTitle')}>
          <h4>{t('settings.password.requirementsTitle')}</h4>
          <ul>
            {passwordRequirements.map((requirement) => {
              const isPassed = livePasswordChecks[requirement.key];
              return (
                <li key={requirement.key} className={isPassed ? 'is-valid' : 'is-invalid'}>
                  <span className="req-dot" aria-hidden="true" />
                  <span>{requirement.label}</span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </form>
  );

  return (
    <section className="settings-section">
      <div className="section-title">{t('settings.title')}</div>
      {isReadOnly && (
        <p className="settings-readonly">
          {t('settings.readOnlyNotice')}
        </p>
      )}

      <div className="settings-groups">
        {/* Interfaccia */}
        <section className="settings-group" aria-labelledby="settings-group-interface">
          <h2 className="settings-group-title" id="settings-group-interface">{t('settings.group.interface')}</h2>

          <SettingRow id="setting-language" title={t('settings.language')} description={t('settings.language.desc')}>
            <select
              id="setting-language"
              className="setting-select"
              value={language}
              onChange={handleLanguageChange}
              disabled={isReadOnly}
            >
              <option value="it">Italiano</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="fr">Français</option>
            </select>
          </SettingRow>

          <SettingRow id="setting-compact" title={t('settings.compactMode')} description={t('settings.compactMode.desc')}>
            <Toggle
              id="setting-compact"
              checked={Boolean(settings.compactMode)}
              onChange={() => handleToggleSetting('compactMode')}
              disabled={isReadOnly}
            />
          </SettingRow>

          <SettingRow id="setting-motion" title={t('settings.reducedMotion')} description={t('settings.reducedMotion.desc')}>
            <Toggle
              id="setting-motion"
              checked={Boolean(settings.reducedMotion)}
              onChange={() => handleToggleSetting('reducedMotion')}
              disabled={isReadOnly}
            />
          </SettingRow>
        </section>

        {/* Avvio e navigazione */}
        <section className="settings-group" aria-labelledby="settings-group-navigation">
          <h2 className="settings-group-title" id="settings-group-navigation">{t('settings.group.navigation')}</h2>

          <SettingRow id="setting-start-view" title={t('settings.startView')} description={t('settings.startView.desc')}>
            <select
              id="setting-start-view"
              className="setting-select"
              value={settings.startView}
              onChange={(e) => updateSettings({ startView: e.target.value })}
              disabled={isReadOnly}
            >
              {availableStartViews.map((view) => (
                <option key={view.value} value={view.value}>{view.label}</option>
              ))}
            </select>
          </SettingRow>

          {canChooseStudent && (
            <SettingRow
              id="setting-remember-student"
              title={t('settings.rememberSelectedStudent')}
              description={t('settings.rememberSelectedStudent.desc')}
            >
              <Toggle
                id="setting-remember-student"
                checked={Boolean(settings.rememberSelectedStudent)}
                onChange={() => updateSettings({
                  rememberSelectedStudent: !settings.rememberSelectedStudent,
                  lastSelectedStudentId: settings.rememberSelectedStudent ? null : selectedStudent?.id || settings.lastSelectedStudentId || null
                })}
                disabled={isReadOnly}
              />
            </SettingRow>
          )}

          {canChooseStudent && students.length > 0 && (
            <SettingRow id="setting-student" title={t('trainer.selectStudent')} description={t('settings.studentSelection.desc')}>
              <select
                id="setting-student"
                className="setting-select"
                value={selectedStudent?.id ?? ''}
                onChange={(e) => {
                  const nextStudent = students.find((student) => String(student.id) === e.target.value) || null;
                  if (typeof onStudentSelect === 'function') {
                    onStudentSelect(nextStudent);
                  }
                }}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </SettingRow>
          )}
        </section>

        {/* Promemoria e sicurezza */}
        <section className="settings-group" aria-labelledby="settings-group-security">
          <h2 className="settings-group-title" id="settings-group-security">{t('settings.group.security')}</h2>

          <SettingRow id="setting-reminders" title={t('settings.reminders')} description={t('settings.reminders.desc')}>
            <Toggle
              id="setting-reminders"
              checked={settings.remindersEnabled !== false}
              onChange={() => handleToggleSetting('remindersEnabled')}
              disabled={isReadOnly}
            />
          </SettingRow>

          <SettingRow id="setting-inactivity" title={t('settings.inactivityTimeout')} description={t('settings.inactivityTimeout.desc')}>
            <select
              id="setting-inactivity"
              className="setting-select"
              value={settings.inactivityMinutes}
              onChange={(e) => updateSettings({ inactivityMinutes: Number(e.target.value) })}
              disabled={isReadOnly}
            >
              {INACTIVITY_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>{minutesLabel(minutes)}</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            title={t('settings.changePassword') || 'Cambia Password'}
            description={t('settings.changePassword.desc') || 'Modifica la tua password'}
            extra={passwordForm}
          >
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowPasswordChange(!showPasswordChange)}
              disabled={isReadOnly}
              aria-expanded={showPasswordChange}
            >
              <Lock size={16} />
              {showPasswordChange ? t('settings.cancel') : t('settings.changePasswordButton')}
            </button>
          </SettingRow>
        </section>

        {/* Applicazione */}
        <section className="settings-group" aria-labelledby="settings-group-app">
          <h2 className="settings-group-title" id="settings-group-app">{t('settings.group.app')}</h2>

          <SettingRow title={t('settings.version')} description={t('settings.info')}>
            <strong className="setting-value">Version {APP_VERSION}</strong>
          </SettingRow>

          <SettingRow
            title={t('settings.updates') || 'Aggiornamenti'}
            description={t('settings.updates.desc') || 'Controlla e installa gli aggiornamenti dell\'applicazione'}
            extra={updateStatusLines}
          >
            <div className="update-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCheckForUpdates}
                disabled={updateBusy}
              >
                <RefreshCw size={15} />
                {t('settings.updates.checkButton') || 'Controlla aggiornamenti'}
              </button>

              {updateState.status === 'downloaded' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleInstallUpdate}
                >
                  <CheckCircle size={15} />
                  {t('settings.updates.installButton') || 'Installa e Riavvia'}
                </button>
              )}
            </div>
          </SettingRow>

          <SettingRow title={t('settings.support')} description={t('settings.support.desc')}>
            <a
              className="btn-secondary"
              href={FORMATRACK_URL}
              onClick={handleExternalClick(FORMATRACK_URL)}
              target="_blank"
              rel="noreferrer"
              title={FORMATRACK_LABEL}
            >
              <ExternalLink size={16} />
              {t('settings.support.visitSite')}
            </a>
          </SettingRow>
        </section>
      </div>
    </section>
  );
};

export default SettingsSection;
