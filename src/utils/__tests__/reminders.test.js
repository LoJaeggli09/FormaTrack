jest.mock('../../supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

// eslint-disable-next-line import/first
import { buildReminders, REMINDER_KIND, INACTIVITY_DAYS } from '../reminders';

const TODAY = new Date(2026, 4, 15); // venerdì 15 maggio 2026
const TODAY_ISO = '2026-05-15';
const TOMORROW_ISO = '2026-05-16';

const kinds = (reminders) => reminders.map((reminder) => reminder.kind);

describe('buildReminders — formatore', () => {
  const students = [{ id: 1, name: 'Anna Rossi' }, { id: 2, name: 'Marco Bianchi' }];

  test('segnala le attività in attesa di validazione', () => {
    const reminders = buildReminders({
      role: 'trainer',
      students,
      currentUser: { id: 10, name: 'Luca' },
      activities: [
        { id: 1, studentId: 1, date: '2026-05-14', status: 'submitted' },
        { id: 2, studentId: 1, date: '2026-05-13', status: 'validated' },
      ],
      grades: [{ utente_id: 1, date: '2026-05-01', grade: 5 }, { utente_id: 2, date: '2026-05-02', grade: 4 }],
      today: TODAY,
    });

    const pending = reminders.find((reminder) => reminder.kind === REMINDER_KIND.PENDING_VALIDATION);
    expect(pending).toBeDefined();
    expect(pending.message).toContain('1');
    expect(pending.view).toBe('activities');
    expect(pending.severity).toBe('warning');
  });

  test('segnala l\'apprendista fermo da troppo tempo', () => {
    const staleDate = '2026-04-01'; // ben oltre la soglia
    const reminders = buildReminders({
      role: 'trainer',
      students,
      currentUser: { id: 10, name: 'Luca' },
      activities: [
        { id: 1, studentId: 1, date: TODAY_ISO, status: 'validated' },
        { id: 2, studentId: 2, date: staleDate, status: 'validated' },
      ],
      grades: [{ utente_id: 1, date: '2026-05-01', grade: 5 }, { utente_id: 2, date: '2026-05-02', grade: 4 }],
      today: TODAY,
    });

    const inactive = reminders.filter((reminder) => reminder.kind === REMINDER_KIND.INACTIVE_STUDENT);
    expect(inactive).toHaveLength(1);
    expect(inactive[0].studentId).toBe(2);
    expect(inactive[0].message).toContain('Marco Bianchi');
  });

  test('un apprendista attivo oggi non genera segnalazioni di inattività', () => {
    const reminders = buildReminders({
      role: 'trainer',
      students: [students[0]],
      currentUser: { id: 10, name: 'Luca' },
      activities: [{ id: 1, studentId: 1, date: TODAY_ISO, status: 'validated' }],
      grades: [{ utente_id: 1, date: '2026-05-01', grade: 5 }],
      today: TODAY,
    });
    expect(kinds(reminders)).not.toContain(REMINDER_KIND.INACTIVE_STUDENT);
  });

  test('senza valutazioni recenti lo segnala', () => {
    const reminders = buildReminders({
      role: 'trainer',
      students: [students[0]],
      currentUser: { id: 10, name: 'Luca' },
      activities: [{ id: 1, studentId: 1, date: TODAY_ISO, status: 'validated' }],
      grades: [],
      today: TODAY,
    });
    expect(kinds(reminders)).toContain(REMINDER_KIND.MISSING_GRADE);
  });

  test('le prenotazioni di domani finiscono fra i promemoria', () => {
    const reminders = buildReminders({
      role: 'trainer',
      students: [students[0]],
      currentUser: { id: 10, name: 'Luca' },
      activities: [
        { id: 1, studentId: 1, date: TODAY_ISO, status: 'validated' },
        { id: 2, studentId: 1, date: TOMORROW_ISO, status: 'draft' },
      ],
      grades: [{ utente_id: 1, date: '2026-05-01', grade: 5 }],
      today: TODAY,
    });
    expect(kinds(reminders)).toContain(REMINDER_KIND.BOOKING_TOMORROW);
  });
});

describe('buildReminders — apprendista', () => {
  const currentUser = { id: 1, name: 'Anna Rossi', role: 'student' };

  test('vede le proprie attività respinte e le bozze da inviare', () => {
    const reminders = buildReminders({
      role: 'student',
      students: [],
      currentUser,
      activities: [
        { id: 1, studentId: 1, date: '2026-05-10', status: 'rejected' },
        { id: 2, studentId: 1, date: '2026-05-11', status: 'draft' },
      ],
      grades: [],
      notes: [],
      today: TODAY,
    });

    expect(kinds(reminders)).toContain(REMINDER_KIND.REJECTED_ACTIVITY);
    expect(kinds(reminders)).toContain(REMINDER_KIND.DRAFT_ACTIVITY);
  });

  test('le note condivise non lette vengono segnalate, quelle private no', () => {
    const reminders = buildReminders({
      role: 'student',
      students: [],
      currentUser,
      activities: [],
      grades: [],
      notes: [
        { id: 1, readAt: null, visibility: 'shared' },
        { id: 2, readAt: null, visibility: 'private' },
        { id: 3, readAt: '2026-05-01T10:00:00Z', visibility: 'shared' },
      ],
      today: TODAY,
    });

    const unread = reminders.find((reminder) => reminder.kind === REMINDER_KIND.UNREAD_NOTE);
    expect(unread).toBeDefined();
    expect(unread.message).toContain('1');
  });

  test('non riceve i promemoria di validazione, che sono del formatore', () => {
    const reminders = buildReminders({
      role: 'student',
      students: [],
      currentUser,
      activities: [{ id: 1, studentId: 1, date: '2026-05-10', status: 'submitted' }],
      grades: [],
      notes: [],
      today: TODAY,
    });
    expect(kinds(reminders)).not.toContain(REMINDER_KIND.PENDING_VALIDATION);
  });
});

describe('buildReminders — assenze', () => {
  test('segnala solo le assenze concluse e senza giustificativo', () => {
    const reminders = buildReminders({
      role: 'trainer',
      students: [{ id: 1, name: 'Anna Rossi' }],
      currentUser: { id: 10, name: 'Luca' },
      activities: [{ id: 1, studentId: 1, date: TODAY_ISO, status: 'validated' }],
      grades: [{ utente_id: 1, date: '2026-05-01', grade: 5 }],
      absences: [
        { id: 1, studentId: 1, startDate: '2026-05-04', endDate: '2026-05-05', justified: false },
        { id: 2, studentId: 1, startDate: '2026-05-06', endDate: '2026-05-07', justified: true },
        { id: 3, studentId: 1, startDate: '2026-05-20', endDate: '2026-05-21', justified: false },
      ],
      today: TODAY,
    });

    const unjustified = reminders.find((reminder) => reminder.kind === REMINDER_KIND.UNJUSTIFIED_ABSENCE);
    expect(unjustified).toBeDefined();
    expect(unjustified.message).toContain('1');
  });
});

describe('ordinamento', () => {
  test('gli avvisi precedono le informazioni', () => {
    const reminders = buildReminders({
      role: 'trainer',
      students: [{ id: 1, name: 'Anna Rossi' }],
      currentUser: { id: 10, name: 'Luca' },
      activities: [
        { id: 1, studentId: 1, date: TODAY_ISO, status: 'submitted' },
        { id: 2, studentId: 1, date: TOMORROW_ISO, status: 'draft' },
      ],
      grades: [],
      today: TODAY,
    });

    const severities = reminders.map((reminder) => reminder.severity);
    expect(severities.indexOf('warning')).toBeLessThan(severities.lastIndexOf('info'));
  });
});

describe('soglie', () => {
  test('la soglia di inattività è dichiarata e ragionevole', () => {
    expect(INACTIVITY_DAYS).toBeGreaterThan(0);
    expect(INACTIVITY_DAYS).toBeLessThanOrEqual(30);
  });
});

describe('buildReminders — app admin e aree di lavoro archiviate', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = (days) => new Date(TODAY.getTime() - days * DAY).toISOString();
  const base = { role: 'app_admin', students: [], currentUser: { id: 1, name: 'Admin' }, today: TODAY };

  test('segnala le aree archiviate da almeno 30 giorni e rimanda al menu Gestione', () => {
    const reminders = buildReminders({
      ...base,
      workspaces: [
        { id: 1, name: 'Attiva', archived_at: null },
        { id: 2, name: 'Vecchia', archived_at: daysAgo(30) },
        { id: 3, name: 'Più vecchia', archived_at: daysAgo(80) },
        { id: 4, name: 'Recente', archived_at: daysAgo(10) },
      ],
    });

    const reminder = reminders.find((item) => item.kind === REMINDER_KIND.WORKSPACE_DELETABLE);
    expect(reminder).toBeDefined();
    expect(reminder.message).toContain('2');
    expect(reminder.view).toBe('manage');
    expect(reminder.studentId).toBeNull();
  });

  test('non segnala nulla finché nessuna area ha 30 giorni di archivio', () => {
    const reminders = buildReminders({
      ...base,
      workspaces: [
        { id: 1, name: 'Attiva', archived_at: null },
        { id: 4, name: 'Recente', archived_at: daysAgo(29) },
      ],
    });
    expect(kinds(reminders)).not.toContain(REMINDER_KIND.WORKSPACE_DELETABLE);
  });

  test('il promemoria non porta nessuna azione di eliminazione', () => {
    const [reminder] = buildReminders({ ...base, workspaces: [{ id: 2, name: 'Vecchia', archived_at: daysAgo(45) }] });
    expect(Object.keys(reminder).sort()).toEqual(['id', 'kind', 'message', 'severity', 'studentId', 'title', 'view']);
  });

  test('gli altri ruoli non lo ricevono', () => {
    const workspaces = [{ id: 2, name: 'Vecchia', archived_at: daysAgo(45) }];
    ['admin', 'trainer', 'inspector', 'student'].forEach((role) => {
      const reminders = buildReminders({ ...base, role, workspaces });
      expect(kinds(reminders)).not.toContain(REMINDER_KIND.WORKSPACE_DELETABLE);
    });
  });
});
