/**
 * Aggregazioni sulle attività: conteggi, ore e tempo del formatore.
 *
 * Stanno qui e non dentro i componenti perché le usano sia la sezione Dati sia
 * il rapporto periodico in PDF, che devono per forza dare gli stessi numeri.
 */

/** Minuti in ore con un decimale: 95 -> 1.6 */
export const minutesToHours = (minutes) => Math.round((Number(minutes || 0) / 60) * 10) / 10;

/** Somma delle durate registrate (minuti). Le attività senza durata valgono 0. */
export const sumDurationMinutes = (activities = []) =>
  activities.reduce((total, activity) => {
    const value = Number(activity.durationMinutes);
    return Number.isFinite(value) ? total + value : total;
  }, 0);

/** Durata media in minuti delle sole attività che hanno una durata. */
export const averageDurationMinutes = (activities = []) => {
  const durations = activities
    .map((activity) => Number(activity.durationMinutes))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((total, value) => total + value, 0) / durations.length);
};

/**
 * Raggruppa le attività e ne somma le ore.
 * @param {Array} activities
 * @param {(activity: object) => string|null} keyFn - chiave di raggruppamento (null = riga ignorata)
 * @param {(key: string) => string} [labelFn]
 * @returns {Array<{ name: string, value: number }>}
 */
export const hoursGroupedBy = (activities = [], keyFn, labelFn = (key) => key) => {
  const buckets = {};
  activities.forEach((activity) => {
    const key = keyFn(activity);
    if (key === null || key === undefined || key === '') return;
    buckets[key] = (buckets[key] || 0) + Number(activity.durationMinutes || 0);
  });
  return Object.entries(buckets).map(([key, minutes]) => ({
    name: labelFn(key),
    value: minutesToHours(minutes),
  }));
};

/** Come hoursGroupedBy ma conta le righe invece di sommarne la durata. */
export const countGroupedBy = (activities = [], keyFn, labelFn = (key) => key) => {
  const buckets = {};
  activities.forEach((activity) => {
    const key = keyFn(activity);
    if (key === null || key === undefined || key === '') return;
    buckets[key] = (buckets[key] || 0) + 1;
  });
  return Object.entries(buckets).map(([key, value]) => ({ name: labelFn(key), value }));
};

/**
 * Attività seguite di persona dal formatore: sono quelle in cui è stato
 * registrato un orario formatore. Le ore sono quelle dell'attività, perché è il
 * tempo che formatore e apprendista hanno passato insieme.
 */
export const withTrainerPresence = (activities = []) =>
  activities.filter((activity) => Boolean(activity.trainerTime));

/**
 * Ore di affiancamento per formatore.
 *
 * @param {Array} activities
 * @param {Array} students  - apprendisti con `trainerId`
 * @param {Object} trainerNameById - mappa id formatore -> nome
 * @returns {Array<{ name: string, value: number }>}
 */
export const trainerHours = (activities = [], students = [], trainerNameById = {}) => {
  const trainerIdByStudent = {};
  students.forEach((student) => { trainerIdByStudent[student.id] = student.trainerId || null; });

  return hoursGroupedBy(
    withTrainerPresence(activities),
    (activity) => {
      const trainerId = trainerIdByStudent[activity.studentId];
      return trainerId ? String(trainerId) : null;
    },
    (trainerId) => trainerNameById[trainerId] || `#${trainerId}`
  );
};

/** Serie mensile ordinata: [{ key: '2026-03', minutes, count }] */
export const monthlySeries = (activities = []) => {
  const buckets = {};
  activities.forEach((activity) => {
    if (!activity.date) return;
    const key = String(activity.date).slice(0, 7);
    if (!buckets[key]) buckets[key] = { key, minutes: 0, count: 0 };
    buckets[key].minutes += Number(activity.durationMinutes || 0);
    buckets[key].count += 1;
  });
  return Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
};

/** Etichetta breve di un mese "2026-03" nella lingua corrente. */
export const formatMonthLabel = (monthKey, locale = 'it-IT') => {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' });
};
