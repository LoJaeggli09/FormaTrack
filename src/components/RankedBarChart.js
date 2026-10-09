import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts';
import { TOOLTIP_STYLE, TOOLTIP_CURSOR, AXIS_TICK, BASELINE, BAR_TRACK, LABEL_STYLE } from './chartStyle';

// Grafico a barre riutilizzabile.
// orientation="horizontal" (default): barre orizzontali ordinate per valore decrescente — per classifiche (sedi, apprendisti, tipi).
// orientation="vertical": colonne verticali che preservano l'ordine dei dati passati — per serie temporali (es. mese).
// domain + threshold: scala fissa (es. voti 0–6) con un tratto alla soglia; thresholdLabel è la didascalia.
const RankedBarChart = ({
  title,
  subtitle,
  data = [],
  color = 'var(--blue)',
  orientation = 'horizontal',
  valueFormatter = (v) => v,
  emptyLabel = 'Nessun dato disponibile',
  maxItems = 8,
  domain = null,
  threshold = null,
  thresholdLabel = ''
}) => {
  const sorted = orientation === 'horizontal'
    ? [...data].sort((a, b) => b.value - a.value).slice(0, maxItems)
    : data;

  const isEmpty = sorted.length === 0 || sorted.every((d) => !d.value);

  return (
    <div className="chart-card">
      <h4>{title}</h4>
      {subtitle && <p className="section-subtitle">{subtitle}</p>}

      {isEmpty ? (
        <div className="chart-empty">
          {emptyLabel}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={orientation === 'horizontal' ? Math.max(120, sorted.length * 34) : 220}>
          {orientation === 'horizontal' ? (
            <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
              <XAxis
                type="number"
                hide={!domain}
                domain={domain || [0, 'auto']}
                ticks={domain ? [0, 1, 2, 3, 4, 5, 6] : undefined}
                allowDecimals={false}
                axisLine={BASELINE}
                tickLine={false}
                tick={AXIS_TICK}
              />
              <YAxis type="category" dataKey="name" width={120} axisLine={BASELINE} tickLine={false} tick={AXIS_TICK} />
              <Tooltip
                formatter={(value) => valueFormatter(value)}
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <Bar dataKey="value" barSize={9} fill={color} background={BAR_TRACK} isAnimationActive={false}>
                <LabelList dataKey="value" position="right" formatter={(value) => valueFormatter(value)} style={LABEL_STYLE} />
              </Bar>
              {threshold !== null && <ReferenceLine x={threshold} stroke="var(--ink)" strokeWidth={1} />}
            </BarChart>
          ) : (
            <BarChart data={sorted} margin={{ top: 20, right: 8, bottom: 4, left: 8 }}>
              <XAxis dataKey="name" axisLine={BASELINE} tickLine={false} tick={AXIS_TICK} />
              <YAxis hide allowDecimals={false} />
              <Tooltip
                formatter={(value) => valueFormatter(value)}
                contentStyle={TOOLTIP_STYLE}
                cursor={TOOLTIP_CURSOR}
              />
              <Bar dataKey="value" maxBarSize={36} isAnimationActive={false}>
                {sorted.map((entry, index) => (
                  <Cell key={index} fill={index % 2 === 0 ? 'var(--blue)' : 'var(--blue-l)'} />
                ))}
                <LabelList dataKey="value" position="top" formatter={(value) => valueFormatter(value)} style={LABEL_STYLE} />
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      )}

      {!isEmpty && threshold !== null && thresholdLabel && (
        <p className="chart-caption">{thresholdLabel}: {threshold}</p>
      )}
    </div>
  );
};

export default RankedBarChart;
