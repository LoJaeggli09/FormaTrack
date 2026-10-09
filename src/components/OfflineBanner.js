import React from 'react';
import { WifiOff } from 'lucide-react';
import { translate } from '../i18n';

/**
 * Banner mostrato quando l'app sta servendo dati dall'ultima copia locale.
 * Dichiara esplicitamente che si è in sola lettura, così nessuno prova a
 * salvare credendo che i dati arrivino al server.
 */
const OfflineBanner = ({ lastSyncAt = null, language = 'it' }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  return (
    <div className="offline-banner" role="status">
      <WifiOff size={18} />
      <div>
        <strong>{t('offline.title')}</strong>
        <span>
          {t('offline.desc')}
          {lastSyncAt ? ` ${t('offline.lastSync')} ${new Date(lastSyncAt).toLocaleString(locale)}.` : ''}
        </span>
      </div>
    </div>
  );
};

export default OfflineBanner;
