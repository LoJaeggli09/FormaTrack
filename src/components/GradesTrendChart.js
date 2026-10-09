import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { translate } from '../i18n';
import { loadGrades } from '../data/grades.supabase';
import { logError } from '../utils/logger';
import { TOOLTIP_STYLE, TOOLTIP_CURSOR, AXIS_TICK, BASELINE, BAR_TRACK, LABEL_STYLE } from './chartStyle';

/** Soglia di sufficienza svizzera. */
export const PASS_GRADE = 4;

const LINE_COLOR = 'var(--blue)';
const AVERAGE_COLOR = 'var(--blue-l)';
const GOOD_COLOR = 'var(--ev)';
const FAIL_COLOR = 'var(--abs)';

/** Punto della serie: quadrato pieno, senza cerchi. */
const SquareDot = ({ cx, cy, size = 6, fill = LINE_COLOR }) => {
  if (typeof cx !== 'number' || typeof cy !== 'number') return null;
  return <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} fill={fill} />;
};

/**
 * Andamento delle valutazioni di un apprendista: serie temporale, media per
 * materia e confronto con la soglia di sufficienza.
 *
 * @param {{ studentId: number, language?: string, grades?: Array }} props
 *   `grades` permette di passare i voti già caricati (evita una seconda lettura).
 */
const GradesTrendChart = ({ studentId, language = 'it', grades: providedGrades = null }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [grades, setGrades] = useState(providedGrades || []);

  useEffect(() => {
    if (providedGrades) { setGrades(providedGrades); return undefined; }
    if (!studentId) { setGrades([]); return undefined; }

    let cancelled = false;
    loadGrades(studentId)
      .then((data) => { if (!cancelled) setGrades(data); })
      .catch((error) => {
        logError('GradesTrendChart', 'Errore caricamento valutazioni', error);
        if (!cancelled) setGrades([]);
      });
    return () => { cancelled = true; };
  }, [studentId, providedGrades]);

  const series = useMemo(() => {
    const valid = grades
      .map((grade) => ({ ...grade, value: parseFloat(grade.grade) }))
      .filter((grade) => !Number.isNaN(grade.value) && grade.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let runningTotal = 0;
    return valid.map((grade, index) => {
      runningTotal += grade.value;
      return {
        name: new Date(grade.date).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
        subject: grade.subject || '',
        value: grade.value,
        // La media progressiva dice se la situazione sta migliorando, cosa che
        // il singolo voto da solo non racconta.
        average: Math.round((runningTotal / (index + 1)) * 100) / 100,
      };
    });
  }, [grades, locale]);

  const bySubject = useMemo(() => {
    const buckets = {};
    grades.forEach((grade) => {
      const value = parseFloat(grade.grade);
      if (Number.isNaN(value)) return;
      const subject = grade.subject || '—';
      if (!buckets[subject]) buckets[subject] = [];
      buckets[subject].push(value);
    });
    return Object.entries(buckets)
      .map(([subject, values]) => ({
        name: subject,
        value: Math.round((values.reduce((acc, item) => acc + item, 0) / values.length) * 100) / 100,
        count: values.length,
      }))
      .sort((a, b) => b.value - a.value);
  }, [grades]);

  const overallAverage = useMemo(() => {
    const values = grades.map((grade) => parseFloat(grade.grade)).filter((value) => !Number.isNaN(value));
    if (values.length === 0) return null;
    return Math.round((values.reduce((acc, value) => acc + value, 0) / values.length) * 100) / 100;
  }, [grades]);

  /** Confronto fra la media delle ultime tre valutazioni e quella precedente. */
  const trend = useMemo(() => {
    if (series.length < 4) return 0;
    const recent = series.slice(-3).map((point) => point.value);
    const earlier = series.slice(0, -3).map((point) => point.value);
    const mean = (values) => values.reduce((acc, value) => acc + value, 0) / values.length;
    return Math.round((mean(recent) - mean(earlier)) * 100) / 100;
  }, [series]);

  if (series.length === 0) {
    return (
      <div className="chart-card">
        <h4>{t('grading.trendTitle')}</h4>
        <p className="section-subtitle">{t('grading.trendSubtitle')}</p>
        <div className="empty-state"><p>{t('data.noData')}</p></div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <div>
          <h4>{t('grading.trendTitle')}</h4>
          <p className="section-subtitle">{t('grading.trendSubtitle')}</p>
        </div>
        <div className="chart-card-metrics">
          <span className={`chip ${overallAverage >= PASS_GRADE ? 'chip-success' : 'chip-danger'}`}>
            {t('grading.average')}: {overallAverage}
          </span>
          <span className="chip chip-neutral">
            {trend > 0 ? <TrendingUp size={13} /> : trend < 0 ? <TrendingDown size={13} /> : <Minus size={13} />}
            {trend > 0 ? `+${trend}` : trend}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <XAxis dataKey="name" axisLine={BASELINE} tickLine={false} tick={AXIS_TICK} />
          <YAxis domain={[1, 6]} ticks={[1, 2, 3, 4, 5, 6]} axisLine={false} tickLine={false} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <ReferenceLine
            y={PASS_GRADE}
            stroke="var(--ink)"
            strokeWidth={1}
            label={{ value: t('grading.passLine'), position: 'insideTopRight', fill: 'var(--ink-3)', fontSize: 11 }}
          />
          <Line
            type="linear"
            dataKey="value"
            name={t('grading.grade')}
            stroke={LINE_COLOR}
            strokeWidth={2}
            dot={<SquareDot />}
            activeDot={<SquareDot size={9} />}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="average"
            name={t('grading.runningAverage')}
            stroke={AVERAGE_COLOR}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <h5 className="chart-subtitle">{t('grading.bySubject')}</h5>
      <ResponsiveContainer width="100%" height={Math.max(120, bySubject.length * 34)}>
        <BarChart data={bySubject} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
          <XAxis type="number" domain={[0, 6]} ticks={[0, 1, 2, 3, 4, 5, 6]} axisLine={BASELINE} tickLine={false} tick={AXIS_TICK} />
          <YAxis type="category" dataKey="name" width={130} axisLine={BASELINE} tickLine={false} tick={AXIS_TICK} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
          <Bar dataKey="value" barSize={9} background={BAR_TRACK} isAnimationActive={false}>
            {bySubject.map((entry) => (
              <Cell key={entry.name} fill={entry.value >= PASS_GRADE ? GOOD_COLOR : FAIL_COLOR} />
            ))}
            <LabelList dataKey="value" position="right" style={LABEL_STYLE} />
          </Bar>
          <ReferenceLine x={PASS_GRADE} stroke="var(--ink)" strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
      <p className="chart-caption">{t('grading.passLine')}: {PASS_GRADE}</p>
    </div>
  );
};

export default GradesTrendChart;
