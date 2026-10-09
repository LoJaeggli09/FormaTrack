/**
 * Periodi di riferimento condivisi da sezione Dati, registro attività e
 * rapporto periodico: un solo posto in cui si decide cosa vuol dire
 * "questo trimestre".
 */

export const PERIOD_PRESETS = [
  'all', 'thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'last12Months', 'custom',
];

export const toIsoDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Data ISO (YYYY-MM-DD) in Date locale, senza slittamenti di fuso. */
export const fromIsoDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

/**
 * Intervallo [from, to] in ISO per un preset. `null` = estremo aperto.
 * @param {string} preset
 * @param {{ from?: string, to?: string }} [custom] - usato solo con preset "custom"
 * @param {Date} [today]
 * @returns {{ preset: string, from: string|null, to: string|null }}
 */
export const buildPeriodRange = (preset, custom = {}, today = new Date()) => {
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (preset) {
    case 'thisMonth':
      return { preset, from: toIsoDate(new Date(year, month, 1)), to: toIsoDate(new Date(year, month + 1, 0)) };
    case 'lastMonth':
      return { preset, from: toIsoDate(new Date(year, month - 1, 1)), to: toIsoDate(new Date(year, month, 0)) };
    case 'thisQuarter': {
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        preset,
        from: toIsoDate(new Date(year, quarterStart, 1)),
        to: toIsoDate(new Date(year, quarterStart + 3, 0)),
      };
    }
    case 'thisYear':
      return { preset, from: toIsoDate(new Date(year, 0, 1)), to: toIsoDate(new Date(year, 11, 31)) };
    case 'last12Months':
      return { preset, from: toIsoDate(new Date(year, month - 11, 1)), to: toIsoDate(today) };
    case 'custom':
      return { preset, from: custom.from || null, to: custom.to || null };
    case 'all':
    default:
      return { preset: 'all', from: null, to: null };
  }
};

/** true se la data ISO cade nell'intervallo (estremi inclusi). */
export const isWithinRange = (iso, range) => {
  if (!range || (!range.from && !range.to)) return true;
  if (!iso) return false;
  const value = String(iso).slice(0, 10);
  if (range.from && value < range.from) return false;
  if (range.to && value > range.to) return false;
  return true;
};

/** Filtra una lista sul campo data indicato. */
export const filterByRange = (items = [], range, key = 'date') =>
  items.filter((item) => isWithinRange(item?.[key], range));

/** Etichetta leggibile dell'intervallo, per intestazioni e nomi file. */
export const formatRangeLabel = (range, locale = 'it-IT') => {
  if (!range || (!range.from && !range.to)) return '';
  const fmt = (iso) => {
    const date = fromIsoDate(iso);
    return date ? date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  };
  if (range.from && range.to) return `${fmt(range.from)} - ${fmt(range.to)}`;
  return range.from ? `${fmt(range.from)} ...` : `... ${fmt(range.to)}`;
};
