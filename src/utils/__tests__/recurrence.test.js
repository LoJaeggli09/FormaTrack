import { expandEventOccurrences, expandEvents } from '../recurrence';

const baseEvent = {
  id: 7,
  title: 'Giorno di scuola',
  date: '2026-03-02', // lunedì
  recurrence: 'none',
  recurrenceEnd: null,
};

describe('expandEventOccurrences', () => {
  test('un evento singolo compare solo se cade nell\'intervallo', () => {
    expect(expandEventOccurrences(baseEvent, '2026-03-01', '2026-03-31')).toHaveLength(1);
    expect(expandEventOccurrences(baseEvent, '2026-04-01', '2026-04-30')).toHaveLength(0);
  });

  test('la cadenza settimanale genera un\'occorrenza ogni 7 giorni', () => {
    const occurrences = expandEventOccurrences(
      { ...baseEvent, recurrence: 'weekly' },
      '2026-03-01',
      '2026-03-31'
    );
    expect(occurrences.map((o) => o.date)).toEqual([
      '2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30',
    ]);
  });

  test('la data di fine serie interrompe le ripetizioni', () => {
    const occurrences = expandEventOccurrences(
      { ...baseEvent, recurrence: 'weekly', recurrenceEnd: '2026-03-16' },
      '2026-03-01',
      '2026-03-31'
    );
    expect(occurrences.map((o) => o.date)).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
  });

  test('la cadenza quindicinale salta una settimana', () => {
    const occurrences = expandEventOccurrences(
      { ...baseEvent, recurrence: 'biweekly' },
      '2026-03-01',
      '2026-03-31'
    );
    expect(occurrences.map((o) => o.date)).toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);
  });

  test('la cadenza mensile non sfora nei mesi corti', () => {
    const occurrences = expandEventOccurrences(
      { ...baseEvent, date: '2026-01-31', recurrence: 'monthly' },
      '2026-01-01',
      '2026-04-30'
    );
    expect(occurrences.map((o) => o.date)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  test('solo la prima occorrenza è l\'evento originale', () => {
    const occurrences = expandEventOccurrences(
      { ...baseEvent, recurrence: 'weekly' },
      '2026-03-01',
      '2026-03-31'
    );
    expect(occurrences[0].isOccurrence).toBe(false);
    expect(occurrences[1].isOccurrence).toBe(true);
    // Ogni occorrenza resta collegata alla riga di database da cui deriva.
    expect(occurrences.every((o) => o.seriesId === 7)).toBe(true);
    expect(new Set(occurrences.map((o) => o.occurrenceKey)).size).toBe(occurrences.length);
  });

  test('senza data di fine la serie si ferma a 12 mesi', () => {
    const occurrences = expandEventOccurrences(
      { ...baseEvent, recurrence: 'weekly' },
      '2026-03-02',
      '2030-12-31'
    );
    const last = occurrences[occurrences.length - 1].date;
    expect(last <= '2027-03-02').toBe(true);
  });
});

describe('expandEvents', () => {
  test('unisce le occorrenze di più eventi', () => {
    const events = [
      { ...baseEvent, id: 1, recurrence: 'weekly' },
      { ...baseEvent, id: 2, date: '2026-03-05', recurrence: 'none' },
    ];
    const occurrences = expandEvents(events, '2026-03-01', '2026-03-10');
    expect(occurrences.map((o) => o.date).sort()).toEqual(['2026-03-02', '2026-03-05', '2026-03-09']);
  });
});
