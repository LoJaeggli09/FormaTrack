import {
  minutesToHours,
  sumDurationMinutes,
  averageDurationMinutes,
  hoursGroupedBy,
  countGroupedBy,
  withTrainerPresence,
  trainerHours,
  monthlySeries,
} from '../activityStats';

const activities = [
  { studentId: 1, date: '2026-03-02', activityType: 'Formazione', durationMinutes: 120, trainerTime: '08:00' },
  { studentId: 1, date: '2026-03-10', activityType: 'Manutenzione', durationMinutes: 60, trainerTime: '' },
  { studentId: 2, date: '2026-04-01', activityType: 'Formazione', durationMinutes: 90, trainerTime: '14:00' },
  { studentId: 2, date: '2026-04-02', activityType: '', durationMinutes: null, trainerTime: '' },
];

describe('minutesToHours', () => {
  test('arrotonda a un decimale', () => {
    expect(minutesToHours(95)).toBe(1.6);
    expect(minutesToHours(120)).toBe(2);
    expect(minutesToHours(0)).toBe(0);
  });
});

describe('sumDurationMinutes', () => {
  test('ignora le attività senza durata invece di romper i conti', () => {
    expect(sumDurationMinutes(activities)).toBe(270);
  });

  test('una lista vuota vale zero', () => {
    expect(sumDurationMinutes([])).toBe(0);
  });
});

describe('averageDurationMinutes', () => {
  test('media solo sulle attività che hanno una durata', () => {
    expect(averageDurationMinutes(activities)).toBe(90);
  });

  test('senza durate restituisce null, non NaN', () => {
    expect(averageDurationMinutes([{ durationMinutes: null }])).toBeNull();
  });
});

describe('hoursGroupedBy', () => {
  test('somma le ore per chiave e salta le chiavi vuote', () => {
    const result = hoursGroupedBy(activities, (activity) => activity.activityType || null);
    expect(result).toEqual([
      { name: 'Formazione', value: 3.5 },
      { name: 'Manutenzione', value: 1 },
    ]);
  });

  test('l\'etichetta può essere rimappata', () => {
    const result = hoursGroupedBy(
      activities,
      (activity) => String(activity.studentId),
      (id) => (id === '1' ? 'Anna' : 'Marco')
    );
    expect(result).toEqual([
      { name: 'Anna', value: 3 },
      { name: 'Marco', value: 1.5 },
    ]);
  });
});

describe('countGroupedBy', () => {
  test('conta le righe invece di sommarne la durata', () => {
    expect(countGroupedBy(activities, (activity) => activity.activityType || null)).toEqual([
      { name: 'Formazione', value: 2 },
      { name: 'Manutenzione', value: 1 },
    ]);
  });
});

describe('tempo del formatore', () => {
  test('conta solo le attività con orario formatore', () => {
    expect(withTrainerPresence(activities)).toHaveLength(2);
  });

  test('attribuisce le ore al formatore dell\'apprendista', () => {
    const students = [
      { id: 1, trainerId: 10 },
      { id: 2, trainerId: 11 },
    ];
    const result = trainerHours(activities, students, { 10: 'Luca', 11: 'Sara' });
    expect(result).toEqual([
      { name: 'Luca', value: 2 },
      { name: 'Sara', value: 1.5 },
    ]);
  });

  test('senza formatore assegnato l\'attività non finisce in classifica', () => {
    const result = trainerHours(activities, [{ id: 1, trainerId: null }, { id: 2, trainerId: null }], {});
    expect(result).toEqual([]);
  });
});

describe('monthlySeries', () => {
  test('raggruppa per mese in ordine cronologico', () => {
    expect(monthlySeries(activities)).toEqual([
      { key: '2026-03', minutes: 180, count: 2 },
      { key: '2026-04', minutes: 90, count: 2 },
    ]);
  });
});
