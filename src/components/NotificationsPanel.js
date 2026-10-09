import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, AlertTriangle, Info, CheckCheck } from 'lucide-react';
import { translate } from '../i18n';

/**
 * Campanella dei promemoria nella barra in alto.
 *
 * I promemoria arrivano già calcolati da `useReminders`: qui si mostrano, si
 * archiviano per la giornata e si salta alla sezione (e all'apprendista)
 * che li ha generati.
 */
const NotificationsPanel = ({
  reminders = [],
  language = 'it',
  onNavigate = () => {},
  onSelectStudent = null,
  onDismiss = () => {},
  onDismissAll = () => {},
}) => {
  const t = (key) => translate(key, language);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const warnings = reminders.filter((reminder) => reminder.severity === 'warning').length;

  // Click fuori e Esc chiudono il pannello: è un popover, non una sezione.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleOpenReminder = (reminder) => {
    if (reminder.studentId && typeof onSelectStudent === 'function') onSelectStudent(reminder.studentId);
    if (reminder.view) onNavigate(reminder.view);
    setIsOpen(false);
  };

  return (
    <div className="notifications-container" ref={containerRef}>
      <button
        type="button"
        className={`notifications-trigger ${reminders.length > 0 ? 'has-items' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t('reminders.title')}
        aria-expanded={isOpen}
        title={t('reminders.title')}
      >
        <Bell size={17} />
        {reminders.length > 0 && (
          <span className={`notification-badge ${warnings > 0 ? 'notification-badge-warning' : ''}`}>
            {reminders.length > 9 ? '9+' : reminders.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-panel" role="dialog" aria-label={t('reminders.title')}>
          <div className="notifications-header">
            <strong>{t('reminders.title')}</strong>
            <div className="notifications-header-actions">
              {reminders.length > 0 && (
                <button type="button" onClick={onDismissAll} title={t('reminders.dismissAll')}>
                  <CheckCheck size={15} />
                </button>
              )}
              <button type="button" onClick={() => setIsOpen(false)} aria-label={t('common.cancel')}>
                <X size={15} />
              </button>
            </div>
          </div>

          {reminders.length === 0 ? (
            <div className="notifications-empty">
              <Bell size={26} />
              <p>{t('reminders.empty')}</p>
            </div>
          ) : (
            <ul className="notifications-list">
              {reminders.map((reminder) => (
                <li key={reminder.id} className={`notification-item notification-${reminder.severity}`}>
                  <button
                    type="button"
                    className="notification-body"
                    onClick={() => handleOpenReminder(reminder)}
                  >
                    <span className="notification-icon">
                      {reminder.severity === 'warning' ? <AlertTriangle size={15} /> : <Info size={15} />}
                    </span>
                    <span>
                      <span className="notification-title">{reminder.title}</span>
                      <span className="notification-message">{reminder.message}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="notification-dismiss"
                    onClick={() => onDismiss(reminder.id)}
                    aria-label={t('reminders.dismiss')}
                    title={t('reminders.dismiss')}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsPanel;
