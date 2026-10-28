import { describeAuditDetails, matchesAuditGroup } from '../auditDescribe';
import { AUDIT_EVENTS, AUDIT_GROUPS } from '../../data/auditLog.supabase';

jest.mock('../../supabaseClient', () => ({ supabase: { from: jest.fn() } }));

// Traduttore finto: restituisce la chiave, così il test non dipende dai testi.
const t = (key) => `«${key}»`;

describe('describeAuditDetails', () => {
  test('attività: data, tipo e stato', () => {
    const text = describeAuditDetails({ details: { entity: 'activity', date: '2026-05-01', type: 'Formazione', status: 'validated' } }, t);
    expect(text).toBe('2026-05-01 · Formazione · «activities.status.validated»');
  });

  test('nota: solo categoria e visibilità', () => {
    const text = describeAuditDetails({ details: { entity: 'note', category: 'warning', visibility: 'private' } }, t);
    expect(text).toBe('«notes.category.warning» · «notes.visibility.private»');
  });

  test('voto: materia e voto', () => {
    expect(describeAuditDetails({ details: { entity: 'grade', subject: 'Informatica', grade: 5.5 } }, t)).toBe('Informatica · 5.5');
  });

  test('una modifica fatta offline dice quando è stata fatta', () => {
    const text = describeAuditDetails({ details: { entity: 'grade', subject: 'Inglese', grade: 4, queuedAt: '2026-05-01T10:00:00.000Z' } }, t);
    expect(text).toContain('«manage.auditQueuedAt»');
  });

  test('blocco account: i minuti', () => {
    expect(describeAuditDetails({ details: { minutes: 15 } }, t)).toBe('15 min');
  });

  test('senza dettagli, o con dettagli strani, non mostra nulla', () => {
    expect(describeAuditDetails({ details: null }, t)).toBe('');
    expect(describeAuditDetails({}, t)).toBe('');
    expect(describeAuditDetails({ details: 'testo' }, t)).toBe('');
    expect(describeAuditDetails({ details: { entity: 'activity' } }, t)).toBe('');
  });
});

describe('famiglie di eventi', () => {
  test('ogni evento dei CRUD sui dati sta nella famiglia "data"', () => {
    [
      AUDIT_EVENTS.ACTIVITY_CREATED, AUDIT_EVENTS.ACTIVITY_UPDATED, AUDIT_EVENTS.ACTIVITY_DELETED, AUDIT_EVENTS.ACTIVITY_STATUS,
      AUDIT_EVENTS.NOTE_CREATED, AUDIT_EVENTS.NOTE_UPDATED, AUDIT_EVENTS.NOTE_DELETED,
      AUDIT_EVENTS.GRADE_CREATED, AUDIT_EVENTS.GRADE_UPDATED, AUDIT_EVENTS.GRADE_DELETED,
    ].forEach((event) => expect(matchesAuditGroup(event, 'data', AUDIT_GROUPS)).toBe(true));
  });

  test('accessi, gestione e "tutti"', () => {
    expect(matchesAuditGroup(AUDIT_EVENTS.LOGIN_FAILED, 'access', AUDIT_GROUPS)).toBe(true);
    expect(matchesAuditGroup(AUDIT_EVENTS.ACCOUNT_LOCKED, 'access', AUDIT_GROUPS)).toBe(true);
    expect(matchesAuditGroup(AUDIT_EVENTS.USER_UNLOCKED, 'management', AUDIT_GROUPS)).toBe(true);
    expect(matchesAuditGroup(AUDIT_EVENTS.NOTE_CREATED, 'access', AUDIT_GROUPS)).toBe(false);
    expect(matchesAuditGroup('qualunque', 'all', AUDIT_GROUPS)).toBe(true);
    expect(matchesAuditGroup('qualunque', undefined, AUDIT_GROUPS)).toBe(true);
  });

  test('nessun evento sta in due famiglie', () => {
    const seen = new Map();
    Object.entries(AUDIT_GROUPS).forEach(([group, events]) => {
      events.forEach((event) => {
        expect(seen.has(event)).toBe(false);
        seen.set(event, group);
      });
    });
  });
});
