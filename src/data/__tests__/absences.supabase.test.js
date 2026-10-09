jest.mock('../../supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

// eslint-disable-next-line import/first
import { countAbsenceDays, expandAbsenceDates, PLANNED_ABSENCE_TYPES } from '../absences.supabase';

describe('expandAbsenceDates', () => {
  test('elenca tutti i giorni coperti, weekend compresi', () => {
    // venerdì 6 → lunedì 9 marzo 2026
    expect(expandAbsenceDates({ startDate: '2026-03-06', endDate: '2026-03-09' })).toEqual([
      '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09',
    ]);
  });

  test('un\'assenza di un giorno solo restituisce quel giorno', () => {
    expect(expandAbsenceDates({ startDate: '2026-03-06' })).toEqual(['2026-03-06']);
  });

  test('senza data di inizio non c\'è nulla da espandere', () => {
    expect(expandAbsenceDates({})).toEqual([]);
  });
});

describe('countAbsenceDays', () => {
  test('conta solo i giorni lavorativi', () => {
    // venerdì → lunedì: sabato e domenica non contano
    expect(countAbsenceDays({ startDate: '2026-03-06', endDate: '2026-03-09' })).toBe(2);
  });

  test('una settimana intera vale cinque giorni', () => {
    expect(countAbsenceDays({ startDate: '2026-03-02', endDate: '2026-03-08' })).toBe(5);
  });

  test('la mezza giornata vale 0.5', () => {
    expect(countAbsenceDays({ startDate: '2026-03-03', endDate: '2026-03-03', halfDay: true })).toBe(0.5);
  });

  test('la mezza giornata non si applica a un periodo lungo', () => {
    expect(countAbsenceDays({ startDate: '2026-03-02', endDate: '2026-03-04', halfDay: true })).toBe(3);
  });

  test('un\'assenza solo nel fine settimana non toglie giorni di formazione', () => {
    expect(countAbsenceDays({ startDate: '2026-03-07', endDate: '2026-03-08' })).toBe(0);
  });
});

describe('PLANNED_ABSENCE_TYPES', () => {
  test('scuola e corsi interaziendali non sono assenze subite', () => {
    expect(PLANNED_ABSENCE_TYPES.has('school')).toBe(true);
    expect(PLANNED_ABSENCE_TYPES.has('inter_company')).toBe(true);
    expect(PLANNED_ABSENCE_TYPES.has('sick')).toBe(false);
  });
});
