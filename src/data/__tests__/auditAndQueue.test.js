/**
 * Audit log sui CRUD di attività, note e voti, e scrittura offline di quegli stessi dati.
 * Il client Supabase è finto e registra ogni chiamata.
 */

// Il nome deve iniziare con "mock": è l'unica eccezione che Jest concede dentro jest.mock().
const mockState = { respond: null, calls: [] };

const mockChain = (table) => {
  const ops = [];
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve) => resolve(mockState.respond(table, ops));
        }
        return (...args) => {
          ops.push({ method: prop, args });
          mockState.calls.push({ table, method: prop, args });
          return proxy;
        };
      },
    }
  );
  return proxy;
};

jest.mock('../../supabaseClient', () => ({
  supabase: { from: (table) => mockChain(table) },
}));

/* eslint-disable import/first */
import { setAuditActor } from '../auditLog.supabase';
import { setQueueUser, flushQueue, getQueueState, __resetQueueForTests } from '../offlineQueue';
import { addActivity, updateActivity, deleteActivity, setActivityStatus, getActivitiesForStudent } from '../activities.supabase';
import { addNote, updateNote, deleteNote, getNotesForStudent } from '../notes.supabase';
import { addGrade, updateGrade, deleteGrade } from '../grades.supabase';
/* eslint-enable import/first */

const OK = (data) => ({ data, error: null });
const NETWORK_DOWN = { data: null, error: { message: 'TypeError: Failed to fetch' } };

const auditRows = () => mockState.calls
  .filter((call) => call.table === 'audit_log' && call.method === 'insert')
  .map((call) => call.args[0][0]);

const setOnline = (online) => {
  jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
};

const ACTIVITY_ROW = {
  id: 9, student_id: 1, activity_date: '2026-05-01', description: 'Installazione client',
  activity_type: 'Formazione', status: 'draft', created_by: 3,
};

beforeEach(() => {
  localStorage.clear();
  __resetQueueForTests();
  mockState.calls = [];
  mockState.respond = () => OK([]);
  jest.restoreAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  setOnline(true);
  setQueueUser(3);
  setAuditActor({ id: 3, name: 'Marco Bianchi' });
});

afterAll(() => {
  setAuditActor(null);
  window.dispatchEvent(new Event('online'));
});

describe('audit sulle attività', () => {
  test('creazione: chi, su quale apprendista e quale attività', async () => {
    mockState.respond = (table) => (table === 'activities' ? OK(ACTIVITY_ROW) : OK(null));

    await addActivity(1, { date: '2026-05-01', description: 'Installazione client', activityType: 'Formazione' }, 3);

    expect(auditRows()).toEqual([
      expect.objectContaining({
        event: 'activity_created',
        actor_id: 3,
        actor_name: 'Marco Bianchi',
        target_id: 1,
        details: expect.objectContaining({ entity: 'activity', entityId: 9, date: '2026-05-01', type: 'Formazione', status: 'draft' }),
      }),
    ]);
  });

  test('modifica', async () => {
    mockState.respond = (table) => (table === 'activities' ? OK({ ...ACTIVITY_ROW, status: 'draft' }) : OK(null));

    await updateActivity(9, { date: '2026-05-01', description: 'Installazione client', activityType: 'Formazione' });

    expect(auditRows()[0]).toMatchObject({ event: 'activity_updated', target_id: 1 });
  });

  test('eliminazione: si legge la riga eliminata per sapere a chi apparteneva', async () => {
    mockState.respond = (table, ops) => {
      if (table !== 'activities') return OK(null);
      return ops.some((op) => op.method === 'delete')
        ? OK([{ student_id: 1, activity_date: '2026-05-01', activity_type: 'Formazione' }])
        : OK([]);
    };

    await expect(deleteActivity(9)).resolves.toBe(true);

    const [row] = auditRows();
    expect(row).toMatchObject({ event: 'activity_deleted', target_id: 1 });
    expect(row.details).toMatchObject({ entity: 'activity', entityId: 9, date: '2026-05-01', type: 'Formazione' });
  });

  test('cambio di stato (validazione)', async () => {
    mockState.respond = (table) => (table === 'activities' ? OK({ ...ACTIVITY_ROW, status: 'validated' }) : OK(null));

    await setActivityStatus(9, 'validated', { actorId: 3, actorName: 'Marco Bianchi' });

    expect(auditRows()[0]).toMatchObject({ event: 'activity_status_changed', target_id: 1 });
    expect(auditRows()[0].details).toMatchObject({ status: 'validated' });
  });

  test('se il log non si può scrivere, l\'operazione riesce lo stesso', async () => {
    mockState.respond = (table) => (table === 'audit_log'
      ? { data: null, error: { message: 'permission denied' } }
      : OK(ACTIVITY_ROW));

    await expect(addActivity(1, { date: '2026-05-01', description: 'x' }, 3)).resolves.toMatchObject({ id: 9 });
  });
});

describe('audit sulle note', () => {
  test('nel log restano categoria e visibilità, mai il testo della nota', async () => {
    const secret = 'testo riservato della nota';
    mockState.respond = (table) => (table === 'notes'
      ? OK({ id: 4, student_id: 1, content: secret, category: 'warning', visibility: 'private' })
      : OK(null));

    await addNote(1, secret, 3, 'Marco Bianchi', { category: 'warning', visibility: 'private' });
    await updateNote(4, secret, { category: 'warning' });

    const rows = auditRows();
    expect(rows.map((row) => row.event)).toEqual(['note_created', 'note_updated']);
    expect(rows[0].details).toMatchObject({ entity: 'note', category: 'warning', visibility: 'private' });
    expect(JSON.stringify(rows)).not.toContain(secret);
  });

  test('eliminazione', async () => {
    mockState.respond = (table, ops) => (table === 'notes' && ops.some((op) => op.method === 'delete')
      ? OK([{ student_id: 1, category: 'general', visibility: 'shared' }])
      : OK(null));

    await deleteNote(4);

    expect(auditRows()[0]).toMatchObject({ event: 'note_deleted', target_id: 1 });
  });
});

describe('audit sui voti', () => {
  test('creazione, modifica, eliminazione', async () => {
    mockState.respond = (table, ops) => {
      if (table !== 'grades') return OK(null);
      if (ops.some((op) => op.method === 'delete')) return OK([{ utente_id: 1, subject: 'Informatica', voto: 5 }]);
      return OK({ id: '77', utente_id: 1, subject: 'Informatica', voto: 5 });
    };

    await addGrade({ studentId: 1, subject: 'Informatica', grade: '5' });
    await updateGrade({ id: '77', subject: 'Informatica', grade: '5.5' });
    await deleteGrade('77');

    const rows = auditRows();
    expect(rows.map((row) => row.event)).toEqual(['grade_created', 'grade_updated', 'grade_deleted']);
    expect(rows.every((row) => row.target_id === 1)).toBe(true);
    expect(rows[0].details).toMatchObject({ entity: 'grade', subject: 'Informatica', grade: 5 });
  });
});

describe('scrittura offline', () => {
  test('una nota scritta offline resta visibile in lista, parte al ritorno della rete e il log dice quando è stata fatta', async () => {
    // lettura online: riempie la cache
    mockState.respond = () => OK([]);
    await expect(getNotesForStudent(1)).resolves.toEqual([]);

    // la rete cade
    setOnline(false);
    mockState.respond = () => NETWORK_DOWN;
    mockState.calls = [];

    const created = await addNote(1, 'scritta senza rete', 3, 'Marco Bianchi', { category: 'meeting' });
    expect(created).toMatchObject({ content: 'scritta senza rete', _pending: true });
    expect(mockState.calls.filter((call) => call.method === 'insert')).toHaveLength(0);
    expect(auditRows()).toHaveLength(0);

    const offlineList = await getNotesForStudent(1);
    expect(offlineList).toHaveLength(1);
    expect(offlineList[0]).toMatchObject({ content: 'scritta senza rete', category: 'meeting', _pending: true });
    expect(getQueueState().pending).toBe(1);

    // la rete torna
    setOnline(true);
    mockState.respond = (table) => (table === 'notes'
      ? OK({ id: 12, student_id: 1, content: 'scritta senza rete', category: 'meeting', visibility: 'shared' })
      : OK(null));

    const summary = await flushQueue();

    expect(summary).toMatchObject({ sent: 1, failed: 0 });
    expect(getQueueState().pending).toBe(0);
    const inserted = mockState.calls.find((call) => call.table === 'notes' && call.method === 'insert');
    expect(inserted.args[0][0]).toMatchObject({ student_id: 1, content: 'scritta senza rete', category: 'meeting' });
    const [audit] = auditRows();
    expect(audit).toMatchObject({ event: 'note_created', target_id: 1, actor_id: 3 });
    expect(audit.details.queuedAt).toEqual(expect.any(String));
  });

  test('un\'attività creata e poi eliminata offline non arriva mai al server', async () => {
    mockState.respond = () => OK([]);
    await getActivitiesForStudent(1);

    setOnline(false);
    mockState.respond = () => NETWORK_DOWN;
    const created = await addActivity(1, { date: '2026-05-02', description: 'ripensamento' }, 3);
    await deleteActivity(created.id);

    expect(getQueueState().pending).toBe(0);
    const list = await getActivitiesForStudent(1);
    expect(list).toEqual([]);
  });

  test('un voto creato offline mantiene lo stesso id quando arriva al server', async () => {
    setOnline(false);
    mockState.respond = () => NETWORK_DOWN;
    const created = await addGrade({ studentId: 1, subject: 'Inglese', grade: '4.5' });

    setOnline(true);
    mockState.respond = () => OK({ id: created.id, utente_id: 1, subject: 'Inglese', voto: 4.5 });
    await flushQueue();

    const inserted = mockState.calls.find((call) => call.table === 'grades' && call.method === 'insert');
    expect(inserted.args[0][0]).toMatchObject({ id: created.id, utente_id: 1, subject: 'Inglese', voto: 4.5 });
  });
});
