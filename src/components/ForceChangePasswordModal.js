import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { updateUserPassword } from '../data/users.supabase';
import { translate } from '../i18n';

const DEFAULT_PASSWORD = 'Abc123!';
const MIN_LENGTH = 8;

const ForceChangePasswordModal = ({ user, language = 'it', onPasswordChanged }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const t = (key) => translate(key, language);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(t('changePassword.errorLength'));
      return;
    }
    if (newPassword === DEFAULT_PASSWORD) {
      setError(t('changePassword.errorSame'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('changePassword.errorMatch'));
      return;
    }

    setLoading(true);
    try {
      await updateUserPassword(user.id, newPassword);
      onPasswordChanged();
    } catch (err) {
      setError(err.message || 'Errore durante il salvataggio della password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop modal-backdrop--top">
      <div className="modal-card modal-card--sm">
        <div className="modal-header">
          <h2>{t('changePassword.title')}</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p>{t('changePassword.message')}</p>

            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label>{t('changePassword.newPassword')}</label>
              <div className="password-input-wrapper">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="password-input"
                  autoFocus
                />
                <button type="button" className="password-toggle-button" onClick={() => setShowNew(!showNew)}>
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>{t('changePassword.confirmPassword')}</label>
              <div className="password-input-wrapper">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="password-input"
                />
                <button type="button" className="password-toggle-button" onClick={() => setShowConfirm(!showConfirm)}>
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="submit" className="btn-primary modal-footer-full" disabled={loading}>
              {loading ? '...' : t('changePassword.button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForceChangePasswordModal;
