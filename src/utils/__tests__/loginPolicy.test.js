import {
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
  PASSWORD_MAX_AGE_DAYS,
  isLocked,
  lockMinutesLeft,
  registerFailure,
  passwordDaysLeft,
  passwordExpiryDate,
  isPasswordExpired,
} from '../loginPolicy';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const NOW = new Date('2026-06-30T12:00:00Z');
const minutesFromNow = (n) => new Date(NOW.getTime() + n * MINUTE).toISOString();
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();

describe('blocco dopo i tentativi falliti', () => {
  test('i limiti sono 5 tentativi e 15 minuti', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
    expect(LOCK_MINUTES).toBe(15);
  });

  test('i primi tentativi sbagliati solo si contano', () => {
    let state = {};
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      state = registerFailure(state, NOW);
      expect(state).toMatchObject({ failedAttempts: i, locked: false, justLocked: false, lockedUntil: null });
    }
  });

  test('al quinto tentativo l\'account si blocca per 15 minuti e il contatore si azzera', () => {
    const state = registerFailure({ failedAttempts: MAX_FAILED_ATTEMPTS - 1 }, NOW);
    expect(state.locked).toBe(true);
    expect(state.justLocked).toBe(true);
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedUntil).toBe(minutesFromNow(LOCK_MINUTES));
  });

  test('durante il blocco un altro tentativo non lo allunga', () => {
    const lockedUntil = minutesFromNow(10);
    const state = registerFailure({ failedAttempts: 0, lockedUntil }, NOW);
    expect(state).toMatchObject({ locked: true, justLocked: false, lockedUntil });
  });

  test('un blocco scaduto riparte da zero', () => {
    const state = registerFailure({ failedAttempts: 3, lockedUntil: minutesFromNow(-1) }, NOW);
    expect(state).toMatchObject({ failedAttempts: 4, locked: false });
  });

  test('isLocked e minuti rimasti', () => {
    expect(isLocked(minutesFromNow(5), NOW)).toBe(true);
    expect(isLocked(minutesFromNow(-5), NOW)).toBe(false);
    expect(isLocked(null, NOW)).toBe(false);
    expect(isLocked('non-una-data', NOW)).toBe(false);
    expect(lockMinutesLeft(minutesFromNow(5), NOW)).toBe(5);
    expect(lockMinutesLeft(new Date(NOW.getTime() + 30 * 1000).toISOString(), NOW)).toBe(1);
    expect(lockMinutesLeft(minutesFromNow(-1), NOW)).toBe(0);
  });
});

describe('scadenza della password', () => {
  test('dura 90 giorni', () => {
    expect(PASSWORD_MAX_AGE_DAYS).toBe(90);
  });

  test('senza data dell\'ultimo cambio non scade (la data parte al primo accesso)', () => {
    expect(passwordDaysLeft(null, NOW)).toBeNull();
    expect(isPasswordExpired(null, NOW)).toBe(false);
    expect(passwordExpiryDate(undefined)).toBeNull();
  });

  test('una password di 89 giorni non è ancora scaduta', () => {
    expect(isPasswordExpired(daysAgo(89), NOW)).toBe(false);
    expect(passwordDaysLeft(daysAgo(89), NOW)).toBe(1);
  });

  test('una password di 90 giorni o più è scaduta', () => {
    expect(isPasswordExpired(daysAgo(90), NOW)).toBe(true);
    expect(isPasswordExpired(daysAgo(200), NOW)).toBe(true);
  });

  test('calcola la data di scadenza', () => {
    const changed = '2026-01-01T00:00:00.000Z';
    expect(passwordExpiryDate(changed).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});
