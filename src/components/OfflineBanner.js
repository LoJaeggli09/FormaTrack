import React from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { translate } from '../i18n';

/**
 * Stato della connessione e della coda di sincronizzazione.
 *
 * - offline: si lavora sull'ultima copia locale; le modifiche restano sul dispositivo;
 * - online con modifiche in attesa: si stanno inviando;
 * - modifiche rifiutate dal server: si può riprovare o scartarle (mai perse in silenzio).
 */
const OfflineBanner = ({
  isOffline = false,
  lastSyncAt = null,
  pending = 0,
  failed = 0,
  flushing = false,
  onRetry = null,
  onDiscard = null,
  language = 'it',
}) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';
  const count = (key, n) => t(key).replace('{count}', String(n));

  const handleDiscard = () => {
    if (window.confirm(t('sync.discardConfirm'))) onDiscard?.();
  };

  return (
    <div className="sync-status">
      {isOffline && (
        <div className="offline-banner" role="status">
          <WifiOff size={18} />
          <div>
            <strong>{t('offline.title')}</strong>
            <span>
              {t('offline.desc')}
              {lastSyncAt ? ` ${t('offline.lastSync')} ${new Date(lastSyncAt).toLocaleString(locale)}.` : ''}
              {pending > 0 ? ` ${count('sync.pendingCount', pending)}.` : ''}
            </span>
          </div>
        </div>
      )}

      {!isOffline && pending > 0 && (
        <div className="offline-banner" role="status">
          <RefreshCw size={18} />
          <div>
            <strong>{flushing ? t('sync.sending') : count('sync.pendingCount', pending)}</strong>
          </div>
        </div>
      )}

      {failed > 0 && (
        <div className="offline-banner is-error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>{t('sync.failedTitle')}</strong>
            <span>{count('sync.failedDesc', failed)}</span>
            <div className="offline-banner-actions">
              <button type="button" className="secondary-action-button" onClick={onRetry} disabled={isOffline || flushing}>
                {t('sync.retry')}
              </button>
              <button type="button" className="secondary-action-button" onClick={handleDiscard}>
                {t('sync.discard')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineBanner;
