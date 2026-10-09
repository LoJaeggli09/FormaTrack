/**
 * Archivio delle aree di lavoro: archiviare, ripristinare, eliminare solo dopo 30 giorni.
 * Il client Supabase è finto: si verifica cosa l'app chiede al database e, soprattutto,
 * che l'eliminazione non parta mai prima dei 30 giorni.
 */

// Il nome deve iniziare con "mock": è l'unica eccezione che Jest concede dentro jest.mock().
const mockState = {
  results: {},
  calls: [],
  rpc: jest.fn(),
  remove: jest.fn(),
};

const mockChain = (table) => {
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve) => resolve(mockState.results[table] || { data: null, error: null });
        }
        return (...args) => {
          mockState.calls.push({ table, method: prop, args });
          return proxy;
        };
      },
    }
  );
  return proxy;
};

jest.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table) => mockChain(table),
    rpc: (...args) => mockState.rpc(...args),
    storage: { from: () => ({ remove: (...args) => mockState.remove(...args) }) },
  },
}));

jest.mock('../users.supabase', () => ({ addUser: jest.fn() }));

// eslint-disable-next-line import/first
import { archiveWorkspace, restoreWorkspace, deleteArchivedWorkspace } from '../workspaces.supabase';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

const callsOn = (table, method) => mockState.calls.filter((c) => c.table === table && c.method === method);

beforeEach(() => {
  mockState.results = {};
  mockState.calls = [];
  mockState.rpc = jest.fn().mockResolvedValue({ data: null, error: null });
  mockState.remove = jest.fn().mockResolvedValue({ data: [], error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('archiveWorkspace / restoreWorkspace', () => {
  test('archiviare imposta archived_at e scrive il log di audit', async () => {
    mockState.results.workspaces = { data: { id: 5, name: 'Area Demo' }, error: null };

    await archiveWorkspace(5, 1, 'App Admin');

    const [update] = callsOn('workspaces', 'update');
    expect(update.args[0].archived_at).toEqual(expect.any(String));
    expect(Number.isNaN(new Date(update.args[0].archived_at).getTime())).toBe(false);
    const audit = callsOn('audit_log', 'insert')[0].args[0][0];
    expect(audit).toMatchObject({ event: 'workspace_archived', target_name: 'Area Demo' });
  });

  test('ripristinare azzera archived_at', async () => {
    mockState.results.workspaces = { data: { id: 5, name: 'Area Demo' }, error: null };

    await restoreWorkspace(5, 1, 'App Admin');

    expect(callsOn('workspaces', 'update')[0].args[0]).toEqual({ archived_at: null });
    expect(callsOn('audit_log', 'insert')[0].args[0][0].event).toBe('workspace_restored');
  });

  test('senza la migrazione SQL chiede di eseguirla', async () => {
    mockState.results.workspaces = { data: null, error: { code: '42703', message: 'column "archived_at" does not exist' } };

    await expect(archiveWorkspace(5)).rejects.toMatchObject({ code: 'MIGRATION_REQUIRED' });
  });
});

describe('deleteArchivedWorkspace', () => {
  test("rifiuta un'area non archiviata, senza toccare il database", async () => {
    mockState.results.workspaces = { data: { id: 7, name: 'Attiva', archived_at: null }, error: null };

    await expect(deleteArchivedWorkspace(7)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_DELETABLE' });
    expect(mockState.rpc).not.toHaveBeenCalled();
  });

  test("rifiuta un'area archiviata da 29 giorni e dice quanto manca", async () => {
    mockState.results.workspaces = { data: { id: 7, name: 'Recente', archived_at: daysAgo(29) }, error: null };

    await expect(deleteArchivedWorkspace(7)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_DELETABLE', daysLeft: 1 });
    expect(mockState.rpc).not.toHaveBeenCalled();
    expect(mockState.remove).not.toHaveBeenCalled();
  });

  test("elimina un'area archiviata da 30 giorni e ripulisce i file allegati", async () => {
    mockState.results.workspaces = { data: { id: 7, name: 'Vecchia', archived_at: daysAgo(30) }, error: null };
    mockState.results.users = { data: [{ id: 11 }, { id: 12 }], error: null };
    mockState.results.attachments = { data: [{ file_path: 'a/1.pdf' }, { file_path: 'b/2.png' }], error: null };

    await expect(deleteArchivedWorkspace(7, 1, 'App Admin')).resolves.toBe(true);

    expect(mockState.rpc).toHaveBeenCalledWith('delete_archived_workspace', { p_workspace_id: 7 });
    expect(mockState.remove).toHaveBeenCalledWith(['a/1.pdf', 'b/2.png']);
    expect(callsOn('audit_log', 'insert')[0].args[0][0]).toMatchObject({ event: 'workspace_deleted', target_name: 'Vecchia' });
  });

  test('se il database rifiuta, i file non si toccano', async () => {
    mockState.results.workspaces = { data: { id: 7, name: 'Vecchia', archived_at: daysAgo(40) }, error: null };
    mockState.results.users = { data: [{ id: 11 }], error: null };
    mockState.results.attachments = { data: [{ file_path: 'a/1.pdf' }], error: null };
    mockState.rpc = jest.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'rifiutato dal database' } });

    await expect(deleteArchivedWorkspace(7)).rejects.toMatchObject({ message: 'rifiutato dal database' });
    expect(mockState.remove).not.toHaveBeenCalled();
  });

  test('senza la funzione SQL chiede di eseguire la migrazione', async () => {
    mockState.results.workspaces = { data: { id: 7, name: 'Vecchia', archived_at: daysAgo(40) }, error: null };
    mockState.rpc = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });

    await expect(deleteArchivedWorkspace(7)).rejects.toMatchObject({ code: 'MIGRATION_REQUIRED' });
  });
});
