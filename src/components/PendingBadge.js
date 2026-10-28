import React from 'react';

/**
 * Etichetta per una riga creata o modificata offline e non ancora arrivata al server
 * (`_pending`), o rifiutata dal server (`_failed`). Non mostra nulla per le righe normali.
 *
 * @param {{ item: object|null, t: (key: string) => string }} props
 */
const PendingBadge = ({ item, t }) => {
  if (!item?._pending) return null;
  return item._failed
    ? <span className="chip chip-danger pending-badge">{t('sync.failedBadge')}</span>
    : <span className="chip chip-warning pending-badge">{t('sync.pendingBadge')}</span>;
};

export default PendingBadge;
