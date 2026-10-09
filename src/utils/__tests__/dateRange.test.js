import { buildPeriodRange, isWithinRange, filterByRange, toIsoDate } from '../dateRange';

// Riferimento fisso: 15 maggio 2026, così i preset non dipendono da quando girano i test.
const TODAY = new Date(2026, 4, 15);

describe('buildPeriodRange', () => {
  test('"all" non pone limiti', () => {
    expect(buildPeriodRange('all', {}, TODAY)).toEqual({ preset: 'all', from: null, to: null });
  });

  test('"thisMonth" copre il mese corrente per intero', () => {
    expect(buildPeriodRange('thisMonth', {}, TODAY)).toEqual({
      preset: 'thisMonth', from: '2026-05-01', to: '2026-05-31',
    });
  });

  test('"lastMonth" copre il mese precedente per intero', () => {
    expect(buildPeriodRange('lastMonth', {}, TODAY)).toEqual({
      preset: 'lastMonth', from: '2026-04-01', to: '2026-04-30',
    });
  });

  test('"thisQuarter" parte da aprile per una data di maggio', () => {
    expect(buildPeriodRange('thisQuarter', {}, TODAY)).toEqual({
      preset: 'thisQuarter', from: '2026-04-01', to: '2026-06-30',
    });
  });

  test('"thisYear" copre l\'anno solare', () => {
    expect(buildPeriodRange('thisYear', {}, TODAY)).toEqual({
      preset: 'thisYear', from: '2026-01-01', to: '2026-12-31',
    });
  });

  test('"last12Months" arriva fino a oggi', () => {
    expect(buildPeriodRange('last12Months', {}, TODAY)).toEqual({
      preset: 'last12Months', from: '2025-06-01', to: '2026-05-15',
    });
  });

  test('"custom" usa gli estremi passati', () => {
    expect(buildPeriodRange('custom', { from: '2026-02-01', to: '2026-02-10' }, TODAY)).toEqual({
      preset: 'custom', from: '2026-02-01', to: '2026-02-10',
    });
  });
});

describe('isWithinRange', () => {
  const range = { from: '2026-05-01', to: '2026-05-31' };

  test('include gli estremi', () => {
    expect(isWithinRange('2026-05-01', range)).toBe(true);
    expect(isWithinRange('2026-05-31', range)).toBe(true);
  });

  test('esclude quello che sta fuori', () => {
    expect(isWithinRange('2026-04-30', range)).toBe(false);
    expect(isWithinRange('2026-06-01', range)).toBe(false);
  });

  test('un intervallo aperto accetta tutto', () => {
    expect(isWithinRange('1999-01-01', { from: null, to: null })).toBe(true);
  });

  test('una data mancante non rientra in un intervallo delimitato', () => {
    expect(isWithinRange('', range)).toBe(false);
  });

  test('gestisce timestamp completi tagliando la parte oraria', () => {
    expect(isWithinRange('2026-05-20T14:33:00.000Z', range)).toBe(true);
  });
});

describe('filterByRange', () => {
  test('filtra sul campo data indicato', () => {
    const rows = [
      { date: '2026-04-30' },
      { date: '2026-05-02' },
      { date: '2026-05-31' },
      { date: '2026-06-01' },
    ];
    expect(filterByRange(rows, { from: '2026-05-01', to: '2026-05-31' })).toEqual([
      { date: '2026-05-02' },
      { date: '2026-05-31' },
    ]);
  });
});

describe('toIsoDate', () => {
  test('non slitta di un giorno per via del fuso orario', () => {
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toIsoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
