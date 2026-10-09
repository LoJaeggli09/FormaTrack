import bcrypt from 'bcryptjs';

/**
 * Mock minimale del client Supabase.
 *
 * Ogni proprietà letta sull'oggetto "query" restituisce una funzione
 * chainable (from().select().eq()...), e l'oggetto stesso è "thenable":
 * risolve a `mockResult` quando viene fatto l'await, come fa il vero
 * query builder di supabase-js (che risolve sempre con { data, error },
 * non rigetta mai la promise).
 */
let mockResult = { data: null, error: null };

const createChainable = () => {
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve) => resolve(mockResult);
        }
        return jest.fn(() => proxy);
      },
    }
  );
  return proxy;
};

// Il nome deve iniziare con "mock" (case-insensitive): è l'unica eccezione
// che Jest concede alle variabili esterne referenziate dentro jest.mock().
const mockFrom = jest.fn(() => createChainable());

jest.mock('../../supabaseClient', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}));

// eslint-disable-next-line import/first
import { authenticateUser, verifyUserPassword } from '../users.supabase';

const PASSWORD = 'Passw0rd!';
// Rounds bassi solo per velocizzare i test: il formato dell'hash (prefisso
// "$2") è lo stesso indipendentemente dal costo scelto.
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

const baseUserRow = {
  id: 1,
  nome: 'Mario',
  cognome: 'Rossi',
  email: 'mario.rossi@example.com',
  ruolo: 'student',
  stato: 'attivo',
  password_hash: passwordHash,
  trainer_id: null,
  workspace_id: null,
  numero_studente: null,
  anno_formazione: null,
  data_inizio_apprendistato: null,
  data_fine_apprendistato: null,
  archiviato: false,
  must_change_password: false,
};

beforeEach(() => {
  // react-scripts imposta resetMocks: true, quindi l'implementazione del mock
  // viene azzerata prima di ogni singolo test: va riassegnata qui, non basta
  // farlo una volta a livello di modulo.
  mockFrom.mockImplementation(() => createChainable());
  mockResult = { data: null, error: null };
});

describe('authenticateUser', () => {
  it('restituisce l\'utente normalizzato con credenziali corrette, senza esporre l\'hash della password', async () => {
    mockResult = { data: [baseUserRow], error: null };

    const result = await authenticateUser('Mario Rossi', PASSWORD);

    expect(result).not.toBeNull();
    expect(result.id).toBe(1);
    expect(result.name).toBe('Mario Rossi');
    expect(result.role).toBe('student');
    expect(result.mustChangePassword).toBe(false);
    // Regressione: l'hash bcrypt non deve mai finire nell'oggetto restituito
    // al client (finiva in localStorage insieme alla sessione).
    expect(result.password).toBeUndefined();
    expect(result.password_hash).toBeUndefined();
  });

  it('restituisce null con la password errata', async () => {
    mockResult = { data: [baseUserRow], error: null };

    const result = await authenticateUser('Mario Rossi', 'password-sbagliata');

    expect(result).toBeNull();
  });

  it('restituisce null se l\'utente non esiste', async () => {
    mockResult = { data: [baseUserRow], error: null };

    const result = await authenticateUser('Utente Inesistente', PASSWORD);

    expect(result).toBeNull();
  });

  it('accetta il login anche tramite email, ignorando maiuscole/spazi ripetuti', async () => {
    mockResult = { data: [baseUserRow], error: null };

    const result = await authenticateUser('  MARIO.ROSSI@example.com  ', PASSWORD);

    expect(result).not.toBeNull();
    expect(result.id).toBe(1);
  });

  it('migra una password legacy in chiaro senza lanciare errori e forza il cambio password', async () => {
    // Regressione: prima della correzione, questo percorso lanciava
    // "ReferenceError: normalizedUser is not defined" perché il flag veniva
    // impostato su normalizedUser prima che la variabile fosse dichiarata.
    const legacyUserRow = { ...baseUserRow, password_hash: 'PlainTextPass1!', must_change_password: false };
    mockResult = { data: [legacyUserRow], error: null };

    const result = await authenticateUser('Mario Rossi', 'PlainTextPass1!');

    expect(result).not.toBeNull();
    expect(result.mustChangePassword).toBe(true);
  });

  it('forza il cambio password se viene usata la password predefinita, anche con hash valido', async () => {
    const defaultHash = bcrypt.hashSync('Abc123!', 4);
    mockResult = { data: [{ ...baseUserRow, password_hash: defaultHash }], error: null };

    const result = await authenticateUser('Mario Rossi', 'Abc123!');

    expect(result).not.toBeNull();
    expect(result.mustChangePassword).toBe(true);
  });
});

describe('verifyUserPassword', () => {
  it('restituisce true con la password corretta', async () => {
    mockResult = { data: { password_hash: passwordHash }, error: null };

    await expect(verifyUserPassword(1, PASSWORD)).resolves.toBe(true);
  });

  it('restituisce false con la password errata', async () => {
    mockResult = { data: { password_hash: passwordHash }, error: null };

    await expect(verifyUserPassword(1, 'password-sbagliata')).resolves.toBe(false);
  });

  it('restituisce false se l\'utente non esiste', async () => {
    mockResult = { data: null, error: null };

    await expect(verifyUserPassword(999, PASSWORD)).resolves.toBe(false);
  });

  it('restituisce false se la query fallisce', async () => {
    mockResult = { data: null, error: new Error('connessione al database non disponibile') };

    await expect(verifyUserPassword(1, PASSWORD)).resolves.toBe(false);
  });
});
