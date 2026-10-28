/**
 * Descrizione leggibile di una riga del log di audit (schermata Gestione → Log Audit).
 * Pura e testata: dai `details` salvati dal log ricava una riga breve, senza mai
 * mostrare testo libero (i dettagli non lo contengono: vedi `logDataChange`).
 */

const clean = (parts) => parts.filter((part) => part !== null && part !== undefined && part !== '');

/**
 * @param {{ details?: object|null }} entry
 * @param {(key: string) => string} t
 * @param {string} [locale]
 * @returns {string}
 */
export const describeAuditDetails = (entry, t, locale = 'it-IT') => {
  const details = entry?.details;
  if (!details || typeof details !== 'object') return '';

  const parts = [];

  if (details.entity === 'activity') {
    parts.push(details.date, details.type);
    if (details.status) parts.push(t(`activities.status.${details.status}`));
  } else if (details.entity === 'note') {
    if (details.category) parts.push(t(`notes.category.${details.category}`));
    if (details.visibility) parts.push(t(`notes.visibility.${details.visibility}`));
  } else if (details.entity === 'grade') {
    parts.push(details.subject, details.grade);
  } else if (details.minutes) {
    parts.push(`${details.minutes} min`);
  }

  if (details.queuedAt) {
    const when = new Date(details.queuedAt);
    if (!Number.isNaN(when.getTime())) {
      parts.push(`${t('manage.auditQueuedAt')} ${when.toLocaleString(locale)}`);
    }
  }

  return clean(parts).join(' · ');
};

/** True se l'evento appartiene alla famiglia indicata ("all" li include tutti). */
export const matchesAuditGroup = (event, group, groups) => {
  if (!group || group === 'all') return true;
  return Boolean(groups[group]?.includes(event));
};
