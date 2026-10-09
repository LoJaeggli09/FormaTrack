import React, { useId } from 'react';
import { CalendarRange } from 'lucide-react';
import { translate } from '../i18n';
import { PERIOD_PRESETS, buildPeriodRange } from '../utils/dateRange';

/**
 * Selettore di periodo riutilizzabile (sezione Dati, registro attività,
 * rapporto periodico): preset rapidi più un intervallo personalizzato.
 *
 * @param {{ value: { preset: string, from: string|null, to: string|null }, onChange: Function, language?: string, compact?: boolean }} props
 */
const PeriodFilter = ({ value, onChange, language = 'it', compact = false }) => {
  const t = (key) => translate(key, language);
  const range = value || buildPeriodRange('all');
  // Il filtro compare anche dentro la finestra del rapporto: senza un id
  // univoco due istanze condividerebbero la stessa label.
  const selectId = useId();

  const handlePresetChange = (preset) => {
    if (preset === 'custom') {
      onChange({ preset, from: range.from, to: range.to });
      return;
    }
    onChange(buildPeriodRange(preset));
  };

  const handleCustomChange = (key, iso) => {
    onChange({ preset: 'custom', from: key === 'from' ? iso || null : range.from, to: key === 'to' ? iso || null : range.to });
  };

  return (
    <div className={`period-filter ${compact ? 'period-filter-compact' : ''}`}>
      <label className="period-filter-label" htmlFor={selectId}>
        <CalendarRange size={15} />
        <span>{t('period.label')}</span>
      </label>
      <select
        id={selectId}
        className="filter-input"
        value={range.preset || 'all'}
        onChange={(event) => handlePresetChange(event.target.value)}
      >
        {PERIOD_PRESETS.map((preset) => (
          <option key={preset} value={preset}>{t(`period.${preset}`)}</option>
        ))}
      </select>

      {range.preset === 'custom' && (
        <>
          <input
            type="date"
            className="filter-input"
            aria-label={t('period.from')}
            value={range.from || ''}
            onChange={(event) => handleCustomChange('from', event.target.value)}
          />
          <input
            type="date"
            className="filter-input"
            aria-label={t('period.to')}
            value={range.to || ''}
            onChange={(event) => handleCustomChange('to', event.target.value)}
          />
        </>
      )}
    </div>
  );
};

export default PeriodFilter;
