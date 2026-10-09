/**
 * Archivio delle aree di lavoro.
 *
 * Un'area archiviata continua a funzionare in tutto e per tutto (accessi, utenti,
 * dati): archiviare serve solo a toglierla dall'elenco attivo. Si può eliminare
 * soltanto dopo ARCHIVE_RETENTION_DAYS giorni passati in archivio, e mai da un
 * promemoria: il promemoria avvisa e basta, l'eliminazione si fa dall'archivio.
 *
 * Qui c'è solo la regola (pura, testata). Lo stesso limite è ripetuto nel
 * database (supabase-workspaces-archive.sql), così non si aggira dal client.
 */

/** Giorni minimi di permanenza in archivio prima che un'area si possa eliminare. */
export const ARCHIVE_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{ archived_at?: string|null, archivedAt?: string|null }|null} workspace
 * @param {Date} [now]
 * @returns {{
 *   archived: boolean,
 *   archivedAt: Date|null,
 *   deletableFrom: Date|null,
 *   daysArchived: number,
 *   daysLeft: number,
 *   deletable: boolean,
 * }}
 */
export const getArchiveStatus = (workspace, now = new Date()) => {
  const raw = workspace?.archived_at ?? workspace?.archivedAt ?? null;
  const archivedAt = raw ? new Date(raw) : null;

  if (!archivedAt || Number.isNaN(archivedAt.getTime())) {
    return {
      archived: false,
      archivedAt: null,
      deletableFrom: null,
      daysArchived: 0,
      daysLeft: ARCHIVE_RETENTION_DAYS,
      deletable: false,
    };
  }

  const deletableFrom = new Date(archivedAt.getTime() + ARCHIVE_RETENTION_DAYS * DAY_MS);
  const msLeft = deletableFrom.getTime() - now.getTime();

  return {
    archived: true,
    archivedAt,
    deletableFrom,
    daysArchived: Math.max(0, Math.floor((now.getTime() - archivedAt.getTime()) / DAY_MS)),
    daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)),
    deletable: msLeft <= 0,
  };
};

/** Aree attive (non archiviate). */
export const activeWorkspaces = (workspaces = []) =>
  workspaces.filter((workspace) => !getArchiveStatus(workspace).archived);

/** Aree in archivio, dalla più vecchia alla più recente (le prime a diventare eliminabili). */
export const archivedWorkspaces = (workspaces = []) =>
  workspaces
    .filter((workspace) => getArchiveStatus(workspace).archived)
    .sort((a, b) => getArchiveStatus(a).archivedAt - getArchiveStatus(b).archivedAt);

/** Aree archiviate da abbastanza tempo per essere eliminate. */
export const deletableWorkspaces = (workspaces = [], now = new Date()) =>
  workspaces.filter((workspace) => getArchiveStatus(workspace, now).deletable);
