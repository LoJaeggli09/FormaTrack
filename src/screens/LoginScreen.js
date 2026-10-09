import React, { useState } from 'react';
import { Globe, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { translate } from '../i18n';
import { FORMATRACK_URL, FORMATRACK_LABEL, handleExternalClick } from '../utils/externalLink';
import { authenticateUser } from '../data/users.supabase';
import { createWorkspaceWithAdmin } from '../data/workspaces.supabase';
import { writeAuditLog, AUDIT_EVENTS } from '../data/auditLog.supabase';

const LoginScreen = ({ onLogin, language = 'it', onLanguageChange }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('Abc123!');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  const t = (key) => translate(key, language);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const normalizedUsername = username.trim().replace(/\s+/g, ' ');
    const normalizedPassword = String(password ?? '');

    if (!normalizedUsername) {
      setError(t('login.invalid'));
      return;
    }

    if (!normalizedPassword.length) {
      setError(t('login.invalid'));
      return;
    }

    // Autenticazione con database utenti
    const user = await authenticateUser(normalizedUsername, normalizedPassword);

    if (user) {
      onLogin(user);
    } else {
      await writeAuditLog({
        event: AUDIT_EVENTS.LOGIN_FAILED,
        actorName: normalizedUsername,
        details: { reason: 'invalid_credentials' },
      });
      setError(t('login.invalid'));
    }
  };

  const handleCreateWorkspace = async () => {
    setWorkspaceError('');
    if (!workspaceName.trim()) {
      setWorkspaceError(t('login.workspaceNameRequired'));
      return;
    }
    if (!adminName.trim()) {
      setWorkspaceError(t('manage.workspaceAdminName') + ' ' + t('manage.fillRequired'));
      return;
    }

    setWorkspaceLoading(true);
    try {
      await createWorkspaceWithAdmin({
        name: workspaceName.trim(),
        description: workspaceDescription.trim() || null,
        ownerId: null,
        adminName,
        adminRole: 'admin',
        defaultPassword: adminPassword || 'Abc123!'
      });

      alert(
        t('manage.createWorkspaceSuccessWithAdmin')
          .replace('{workspaceName}', workspaceName.trim())
          .replace('{adminName}', adminName.trim())
      );

      setShowCreateWorkspace(false);
      setWorkspaceName('');
      setWorkspaceDescription('');
      setAdminName('');
      setAdminPassword('Abc123!');
    } catch (error) {
      console.error('Errore creazione area di lavoro:', error);
      setWorkspaceError(error?.message || t('login.createWorkspaceError'));
    } finally {
      setWorkspaceLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-card">
          {onLanguageChange && (
            <div className="login-language-selector">
              <Globe size={16} />
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="language-select"
              >
                <option value="it">Italiano</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
              </select>
            </div>
          )}

          <div className="login-logo">
            <img src="/LAD_icona_blu.png" alt="Logo" style={{ width: '150px', height: 'auto' }} />
          </div>

          <div className="login-header">
            <h1 className="login-title">{t('login.title')}</h1>
            <p className="login-profession">{t('login.subtitle')}</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="username">{t('login.username')}</label>
              <input
                type="text"
                id="username"
                placeholder={t('login.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">{t('login.password')}</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="password-input"
                />
                <button
                  type="button"
                  className="password-toggle-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('settings.password.current') : t('login.password')}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="login-button">
              {t('login.button')}
            </button>
          </form>

          <div className="login-secondary-action">
            <button
              type="button"
              className="login-button-secondary"
              onClick={() => setShowCreateWorkspace((prev) => !prev)}
            >
              {showCreateWorkspace ? t('login.hideCreateWorkspace') : t('login.createWorkspace')}
            </button>
          </div>

          {showCreateWorkspace && (
            <div className="workspace-form">
              <h3>{t('login.createWorkspaceTitle')}</h3>
              <div className="form-group">
                <label>{t('login.workspaceName')}</label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder={t('login.workspaceName')}
                />
              </div>
              <div className="form-group">
                <label>{t('login.workspaceDescription')}</label>
                <textarea
                  value={workspaceDescription}
                  onChange={(e) => setWorkspaceDescription(e.target.value)}
                  placeholder={t('login.workspaceDescription')}
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>{t('manage.workspaceAdminName')}</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Nome Cognome"
                />
              </div>

              <div className="form-group">
                <label>{t('manage.defaultPassword')}</label>
                <div className="password-input-wrapper">
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Abc123!"
                    className="password-input"
                  />
                  <button
                    type="button"
                    className="password-toggle-button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    aria-label={t('manage.defaultPassword')}
                  >
                    {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {workspaceError && <div className="login-error" style={{ marginBottom: '12px' }}>{workspaceError}</div>}
              <div className="workspace-form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowCreateWorkspace(false);
                    setWorkspaceError('');
                  }}
                >
                  {t('login.cancel')}
                </button>
                <button
                  type="button"
                  className="login-button"
                  onClick={handleCreateWorkspace}
                  disabled={workspaceLoading}
                >
                  {t('login.createWorkspace')}
                </button>
              </div>
            </div>
          )}

          <div className="login-footer-link">
            <a
              className="external-link"
              href={FORMATRACK_URL}
              onClick={handleExternalClick(FORMATRACK_URL)}
              target="_blank"
              rel="noreferrer"
            >
              {FORMATRACK_LABEL}
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
