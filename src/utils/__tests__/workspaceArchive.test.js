import {
  ARCHIVE_RETENTION_DAYS,
  getArchiveStatus,
  activeWorkspaces,
  archivedWorkspaces,
  deletableWorkspaces,
} from '../workspaceArchive';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-30T12:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('getArchiveStatus', () => {
  test("un'area non archiviata non è né archiviata né eliminabile", () => {
    expect(getArchiveStatus({ id: 1, archived_at: null }, NOW)).toMatchObject({
      archived: false,
      deletable: false,
      daysLeft: ARCHIVE_RETENTION_DAYS,
    });
    expect(getArchiveStatus({ id: 1 }, NOW).archived).toBe(false);
    expect(getArchiveStatus(null, NOW).archived).toBe(false);
  });

  test('il limite è di 30 giorni', () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(30);
  });

  test('appena archiviata: mancano 30 giorni', () => {
    const status = getArchiveStatus({ archived_at: daysAgo(0) }, NOW);
    expect(status).toMatchObject({ archived: true, deletable: false, daysLeft: 30, daysArchived: 0 });
  });

  test('dopo 29 giorni non si può ancora eliminare', () => {
    const status = getArchiveStatus({ archived_at: daysAgo(29) }, NOW);
    expect(status.deletable).toBe(false);
    expect(status.daysLeft).toBe(1);
  });

  test("un'ora prima dei 30 giorni non si può ancora eliminare", () => {
    const almost = new Date(NOW.getTime() - 30 * DAY + 60 * 60 * 1000).toISOString();
    const status = getArchiveStatus({ archived_at: almost }, NOW);
    expect(status.deletable).toBe(false);
    expect(status.daysLeft).toBe(1);
  });

  test('esattamente 30 giorni: eliminabile', () => {
    const status = getArchiveStatus({ archived_at: daysAgo(30) }, NOW);
    expect(status.deletable).toBe(true);
    expect(status.daysLeft).toBe(0);
  });

  test('oltre 30 giorni: eliminabile', () => {
    expect(getArchiveStatus({ archived_at: daysAgo(90) }, NOW).deletable).toBe(true);
  });

  test('accetta anche il campo in camelCase e ignora date non valide', () => {
    expect(getArchiveStatus({ archivedAt: daysAgo(45) }, NOW).deletable).toBe(true);
    expect(getArchiveStatus({ archived_at: 'non-una-data' }, NOW).archived).toBe(false);
  });

  test('indica da quando si potrà eliminare', () => {
    const archivedAt = new Date('2026-06-01T08:00:00Z');
    const status = getArchiveStatus({ archived_at: archivedAt.toISOString() }, NOW);
    expect(status.deletableFrom.toISOString()).toBe('2026-07-01T08:00:00.000Z');
  });
});

describe('elenchi', () => {
  const workspaces = [
    { id: 1, name: 'Attiva', archived_at: null },
    { id: 2, name: 'Archiviata da poco', archived_at: daysAgo(3) },
    { id: 3, name: 'Archiviata da tempo', archived_at: daysAgo(60) },
    { id: 4, name: 'Archiviata da 31 giorni', archived_at: daysAgo(31) },
  ];

  test('separa le aree attive da quelle in archivio', () => {
    expect(activeWorkspaces(workspaces).map((w) => w.id)).toEqual([1]);
    expect(archivedWorkspaces(workspaces).map((w) => w.id)).toEqual([3, 4, 2]);
  });

  test('le eliminabili sono solo quelle archiviate da almeno 30 giorni', () => {
    expect(deletableWorkspaces(workspaces, NOW).map((w) => w.id)).toEqual([3, 4]);
    expect(deletableWorkspaces([workspaces[0], workspaces[1]], NOW)).toEqual([]);
  });
});
