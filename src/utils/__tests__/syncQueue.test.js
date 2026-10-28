import {
  SYNC_ENTITY,
  isNetworkError,
  newTempId,
  isTempId,
  planEnqueue,
  remapTarget,
  applyPending,
  queueCounts,
} from '../syncQueue';

const create = (targetId, extra = {}) => ({
  id: `op-${targetId}`, entity: SYNC_ENTITY.ACTIVITY, action: 'create', targetId, studentId: 1,
  args: [1, { description: 'x' }], row: { studentId: 1, description: 'x', date: '2026-05-01' }, status: 'pending', ...extra,
});
const update = (targetId, patch, extra = {}) => ({
  id: `op-u-${targetId}`, entity: SYNC_ENTITY.ACTIVITY, action: 'update', targetId, args: [targetId, patch], patch, status: 'pending', ...extra,
});
const remove = (targetId) => ({ id: `op-d-${targetId}`, entity: SYNC_ENTITY.ACTIVITY, action: 'delete', targetId, args: [targetId], status: 'pending' });

describe('isNetworkError', () => {
  test.each([
    'TypeError: Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Network request failed',
    'Load failed',
    'net::ERR_INTERNET_DISCONNECTED',
  ])('riconosce "%s"', (message) => {
    expect(isNetworkError({ message })).toBe(true);
  });

  test('non scambia un rifiuto del server per un errore di rete', () => {
    expect(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false);
    expect(isNetworkError({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('id provvisori', () => {
  test('si riconoscono e sono diversi a ogni chiamata', () => {
    const a = newTempId();
    const b = newTempId();
    expect(isTempId(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isTempId(42)).toBe(false);
    expect(isTempId('1718000000000')).toBe(false);
  });
});

describe('planEnqueue', () => {
  test('aggiunge in coda nell\'ordine', () => {
    const { queue, cancelled } = planEnqueue([create('tmp_a')], update('tmp_a', { description: 'y' }));
    expect(cancelled).toBe(false);
    expect(queue.map((op) => op.action)).toEqual(['create', 'update']);
  });

  test('eliminare una riga creata offline e mai inviata annulla tutto ciò che la riguardava', () => {
    const queue = [create('tmp_a'), update('tmp_a', { description: 'y' }), create('tmp_b')];
    const result = planEnqueue(queue, remove('tmp_a'));
    expect(result.cancelled).toBe(true);
    expect(result.queue.map((op) => op.targetId)).toEqual(['tmp_b']);
  });

  test('eliminare una riga del server si accoda normalmente', () => {
    const result = planEnqueue([], remove(42));
    expect(result.cancelled).toBe(false);
    expect(result.queue).toHaveLength(1);
  });

  test('non annulla una creazione già in invio', () => {
    const queue = [create('tmp_a')];
    const result = planEnqueue(queue, remove('tmp_a'), new Set(['op-tmp_a']));
    expect(result.cancelled).toBe(false);
    expect(result.queue).toHaveLength(2);
  });

  test('l\'eliminazione di un\'altra entità con lo stesso id non annulla nulla', () => {
    const other = { ...create('7'), entity: SYNC_ENTITY.NOTE, id: 'op-note' };
    const result = planEnqueue([other], remove('7'));
    expect(result.cancelled).toBe(false);
  });
});

describe('remapTarget', () => {
  test('dopo la creazione le operazioni successive passano all\'id vero', () => {
    const queue = [update('tmp_a', { description: 'y' }), remove('tmp_a'), update('99', { description: 'z' })];
    const next = remapTarget(queue, SYNC_ENTITY.ACTIVITY, 'tmp_a', 501);
    expect(next[0]).toMatchObject({ targetId: 501, args: [501, { description: 'y' }] });
    expect(next[1]).toMatchObject({ targetId: 501, args: [501] });
    expect(next[2].targetId).toBe('99');
  });
});

describe('applyPending', () => {
  const server = [
    { id: 1, studentId: 1, description: 'uno', date: '2026-04-01' },
    { id: 2, studentId: 1, description: 'due', date: '2026-04-02' },
  ];

  test('senza operazioni restituisce la stessa lista', () => {
    expect(applyPending(server, [], { entity: SYNC_ENTITY.ACTIVITY })).toBe(server);
  });

  test('aggiunge le creazioni, marcate come in attesa', () => {
    const result = applyPending(server, [create('tmp_a')], { entity: SYNC_ENTITY.ACTIVITY, studentIds: [1] });
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({ id: 'tmp_a', description: 'x', _pending: true });
  });

  test('applica le modifiche e toglie le eliminazioni', () => {
    const ops = [update(1, { description: 'UNO' }), remove(2)];
    const result = applyPending(server, ops, { entity: SYNC_ENTITY.ACTIVITY });
    expect(result).toEqual([{ id: 1, studentId: 1, description: 'UNO', date: '2026-04-01', _pending: true }]);
  });

  test('ignora le creazioni di altri apprendisti e di altri tipi di dato', () => {
    const otherStudent = create('tmp_b', { studentId: 9 });
    const otherEntity = { ...create('tmp_c'), entity: SYNC_ENTITY.NOTE };
    const result = applyPending(server, [otherStudent, otherEntity], { entity: SYNC_ENTITY.ACTIVITY, studentIds: [1] });
    expect(result).toEqual(server);
  });

  test('non duplica una riga che il server ha già (voti con id scelto dal client)', () => {
    const grade = { ...create('77'), entity: SYNC_ENTITY.GRADE, row: { subject: 'Mat' } };
    const result = applyPending([{ id: '77', subject: 'Mat' }], [grade], { entity: SYNC_ENTITY.GRADE });
    expect(result).toHaveLength(1);
  });

  test('segnala le operazioni rifiutate dal server', () => {
    const result = applyPending(server, [update(1, { description: 'X' }, { status: 'failed' })], { entity: SYNC_ENTITY.ACTIVITY });
    expect(result[0]).toMatchObject({ _pending: true, _failed: true });
  });

  test('rispetta l\'ordinamento richiesto', () => {
    const newer = create('tmp_a', { row: { studentId: 1, description: 'nuova', date: '2026-06-01' } });
    const result = applyPending(server, [newer], {
      entity: SYNC_ENTITY.ACTIVITY,
      sort: (a, b) => String(b.date).localeCompare(String(a.date)),
    });
    expect(result.map((row) => row.id)).toEqual(['tmp_a', 2, 1]);
  });

  test('applica le operazioni nell\'ordine in cui sono state fatte', () => {
    const ops = [create('tmp_a'), update('tmp_a', { description: 'cambiata' })];
    const result = applyPending([], ops, { entity: SYNC_ENTITY.ACTIVITY, studentIds: [1] });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('cambiata');
  });
});

describe('queueCounts', () => {
  test('separa le operazioni in attesa da quelle rifiutate', () => {
    expect(queueCounts([create('a'), update('a', {}, { status: 'failed' }), create('b')])).toEqual({ pending: 2, failed: 1 });
    expect(queueCounts([])).toEqual({ pending: 0, failed: 0 });
  });
});
