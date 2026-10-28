/**
 * Blocco dell'accesso dopo troppi tentativi falliti e scadenza della password.
 */
import bcrypt from 'bcryptjs';

// Il nome deve iniziare con "mock": è l'unica eccezione che Jest concede dentro jest.mock().
const mockState = { users: [], calls: [], updateError: null };

const mockChain = (table) => {
  const ops = [];
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve) => {
            if (ops.some((op) => op.method === 'update' || op.method === 'insert')) {
              return resolve({ data: null, error: mockState.updateError });
            }
            return resolve({ data: table === 'users' ? mockState.users : [], error: null });
          };
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

// eslint-disable-next-line import/first
import { authenticateUser, unlockUser, updateUserPassword } from '../users.supabase';

const PASSWORD = 'Passw0rd!';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const userRow = (extra = {}) => ({
  id: 1, nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@example.com', ruolo: 'student', stato: 'attivo',
  password_hash: HASH, trainer_id: null, workspace_id: null, archiviato: false, must_change_password: false,
  failed_login_attempts: 0, locked_until: null, password_changed_at: new Date().toISOString(),
  ...extra,
});

const usersUpdates = () => mockState.calls
  .filter((call) => call.table === 'users' && call.method === 'update')
  .map((call) => call.args[0]);
const auditEvents = () => mockState.calls
  .filter((call) => call.table === 'audit_log' && call.method === 'insert')
  .map((call) => call.args[0][0].event);

beforeEach(() => {
  localStorage.clear();
  mockState.users = [userRow()];
  mockState.calls = [];
  mockState.updateError = null;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('blocco dopo i tentativi falliti (contatori sull\'account)', () => {
  test('una password sbagliata aggiorna il contatore e risponde come sempre', async () => {
    await expect(authenticateUser('Mario Rossi', 'sbagliata')).resolves.toBeNull();

    expect(usersUpdates()).toEqual([{ failed_login_attempts: 1, locked_until: null }]);
  });

  test('al quinto tentativo l\'account si blocca, con l\'errore giusto e il log', async () => {
    mockState.users = [userRow({ failed_login_attempts: 4 })];

    await expect(authenticateUser('Mario Rossi', 'sbagliata')).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      minutesLeft: 15,
    });

    const [update] = usersUpdates();
    expect(update.failed_login_attempts).toBe(0);
    expect(new Date(update.locked_until).getTime()).toBeGreaterThan(Date.now() + 14 * MINUTE);
    expect(auditEvents()).toContain('account_locked');
  });

  test('un account bloccato non entra nemmeno con la password giusta, e senza toccare il database', async () => {
    mockState.users = [userRow({ locked_until: new Date(Date.now() + 10 * MINUTE).toISOString() })];

    await expect(authenticateUser('Mario Rossi', PASSWORD)).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(usersUpdates()).toEqual([]);
  });

  test('passato il tempo del blocco si entra di nuovo e i contatori si azzerano', async () => {
    mockState.users = [userRow({ failed_login_attempts: 0, locked_until: new Date(Date.now() - MINUTE).toISOString() })];

    const user = await authenticateUser('Mario Rossi', PASSWORD);

    expect(user).not.toBeNull();
    expect(usersUpdates()).toEqual([{ locked_until: null }]);
  });

  test('un accesso riuscito azzera i tentativi precedenti', async () => {
    mockState.users = [userRow({ failed_login_attempts: 3 })];

    await authenticateUser('Mario Rossi', PASSWORD);

    expect(usersUpdates()).toEqual([{ failed_login_attempts: 0 }]);
  });

  test('un errore nello scrivere il contatore non blocca il login', async () => {
    mockState.updateError = { message: 'permission denied' };

    await expect(authenticateUser('Mario Rossi', 'sbagliata')).resolves.toBeNull();
  });

  test('l\'admin può sbloccare subito un account', async () => {
    await expect(unlockUser(1, 9, 'Admin', 'Mario Rossi')).resolves.toBe(true);

    expect(usersUpdates()).toEqual([{ failed_login_attempts: 0, locked_until: null }]);
    expect(auditEvents()).toContain('user_unlocked');
  });

  test('l\'utente bloccato è segnalato come tale', async () => {
    mockState.users = [userRow({ locked_until: new Date(Date.now() + 5 * MINUTE).toISOString() })];

    await expect(authenticateUser('Mario Rossi', PASSWORD)).rejects.toMatchObject({ minutesLeft: expect.any(Number) });
  });
});

describe('ruoli e blocco', () => {
  test('l\'admin di un\'area di lavoro bloccato viene mandato al supporto FormaTrack', async () => {
    mockState.users = [userRow({ ruolo: 'admin', failed_login_attempts: 4 })];

    await expect(authenticateUser('Mario Rossi', 'sbagliata')).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      contactSupport: true,
    });
    // vale anche per un tentativo successivo, con la password giusta, mentre il blocco dura
    mockState.users = [userRow({ ruolo: 'admin', locked_until: new Date(Date.now() + 5 * MINUTE).toISOString() })];
    await expect(authenticateUser('Mario Rossi', PASSWORD)).rejects.toMatchObject({ contactSupport: true });
  });

  test('per formatori e apprendisti il blocco non rimanda al supporto', async () => {
    for (const ruolo of ['trainer', 'student']) {
      mockState.users = [userRow({ ruolo, failed_login_attempts: 4 })];
      await expect(authenticateUser('Mario Rossi', 'sbagliata')).rejects.toMatchObject({ contactSupport: false });
    }
  });

  test('l\'app admin non si blocca mai: nessun contatore, nessun blocco, entra con la password giusta', async () => {
    mockState.users = [userRow({ ruolo: 'app_admin', failed_login_attempts: 4 })];

    for (let i = 0; i < 10; i += 1) {
      await expect(authenticateUser('Mario Rossi', 'sbagliata')).resolves.toBeNull();
    }
    expect(usersUpdates()).toEqual([]);
    expect(auditEvents()).not.toContain('account_locked');

    // anche con un blocco rimasto sull'account (ad esempio da prima che cambiasse ruolo)
    mockState.users = [userRow({ ruolo: 'app_admin', locked_until: new Date(Date.now() + 10 * MINUTE).toISOString() })];
    await expect(authenticateUser('Mario Rossi', PASSWORD)).resolves.not.toBeNull();
  });

  test('l\'app admin è riconosciuto anche con le varianti del ruolo nel database', async () => {
    mockState.users = [userRow({ ruolo: 'App Admin' })];

    for (let i = 0; i < 6; i += 1) {
      await expect(authenticateUser('Mario Rossi', 'sbagliata')).resolves.toBeNull();
    }
  });
});

describe('blocco senza le colonne nel database (contatore sul dispositivo)', () => {
  const legacyRow = () => {
    const row = userRow();
    delete row.failed_login_attempts;
    delete row.locked_until;
    delete row.password_changed_at;
    return row;
  };

  test('si blocca comunque dopo 5 tentativi e non scrive sul database', async () => {
    mockState.users = [legacyRow()];

    for (let i = 0; i < 4; i += 1) {
      await expect(authenticateUser('Mario Rossi', 'sbagliata')).resolves.toBeNull();
    }
    await expect(authenticateUser('Mario Rossi', 'sbagliata')).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
    await expect(authenticateUser('Mario Rossi', PASSWORD)).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });

    expect(usersUpdates()).toEqual([]);
  });

  test('un accesso riuscito azzera il contatore del dispositivo', async () => {
    mockState.users = [legacyRow()];

    for (let i = 0; i < 4; i += 1) await authenticateUser('Mario Rossi', 'sbagliata');
    await expect(authenticateUser('Mario Rossi', PASSWORD)).resolves.not.toBeNull();
    for (let i = 0; i < 4; i += 1) {
      await expect(authenticateUser('Mario Rossi', 'sbagliata')).resolves.toBeNull();
    }
  });
});

describe('nome utente inesistente', () => {
  test('stessa risposta di una password sbagliata, poi anche lo stesso blocco: non si rivela chi esiste', async () => {
    for (let i = 0; i < 4; i += 1) {
      await expect(authenticateUser('Utente Fantasma', 'qualsiasi')).resolves.toBeNull();
    }
    await expect(authenticateUser('Utente Fantasma', 'qualsiasi')).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });
});

describe('scadenza della password', () => {
  test('una password di meno di 90 giorni non scade', async () => {
    mockState.users = [userRow({ password_changed_at: new Date(Date.now() - 30 * DAY).toISOString() })];

    const user = await authenticateUser('Mario Rossi', PASSWORD);

    expect(user.passwordExpired).toBe(false);
  });

  test('una password di 90 giorni o più è scaduta: va cambiata al prossimo accesso e il log lo registra', async () => {
    mockState.users = [userRow({ password_changed_at: new Date(Date.now() - 91 * DAY).toISOString() })];

    const user = await authenticateUser('Mario Rossi', PASSWORD);

    expect(user).not.toBeNull();
    expect(user.passwordExpired).toBe(true);
    expect(auditEvents()).toEqual(expect.arrayContaining(['password_expired', 'login_success']));
  });

  test('senza una data nota la password non scade e la data parte da questo accesso', async () => {
    mockState.users = [userRow({ password_changed_at: null })];

    const user = await authenticateUser('Mario Rossi', PASSWORD);

    expect(user.passwordExpired).toBe(false);
    expect(user.passwordChangedAt).toEqual(expect.any(String));
    expect(usersUpdates()[0]).toEqual({ password_changed_at: expect.any(String) });
  });

  test('cambiare la password aggiorna la data e toglie un eventuale blocco', async () => {
    await updateUserPassword(1, 'NuovaPassw0rd!');

    const [update] = usersUpdates();
    expect(update).toMatchObject({ must_change_password: false, failed_login_attempts: 0, locked_until: null });
    expect(update.password_hash).toMatch(/^\$2/);
    expect(new Date(update.password_changed_at).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
