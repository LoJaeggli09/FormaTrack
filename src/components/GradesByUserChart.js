import React, { useState, useEffect, useMemo } from 'react';
import { translate } from '../i18n';
import { getGradesForStudents } from '../data/grades.supabase';
import { logError } from '../utils/logger';
import RankedBarChart from './RankedBarChart';
import { PASS_GRADE } from './GradesTrendChart';

const GradesByUserChart = ({ students = [], language = 'it' }) => {
  const t = (key) => translate(key, language);
  const [grades, setGrades] = useState([]);

  const studentIds = useMemo(() => students.map((s) => s.id), [students]);
  const studentNameById = useMemo(() => {
    const map = {};
    students.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [students]);

  useEffect(() => {
    let cancelled = false;
    getGradesForStudents(studentIds)
      .then((data) => { if (!cancelled) setGrades(data); })
      .catch((error) => {
        logError('GradesByUserChart', 'Errore caricamento valutazioni aggregate', error);
        if (!cancelled) setGrades([]);
      });
    return () => { cancelled = true; };
  }, [studentIds]);

  const byStudent = useMemo(() => {
    const bucket = {};
    grades.forEach((g) => {
      const value = Number(g.grade);
      if (isNaN(value)) return;
      if (!bucket[g.utente_id]) bucket[g.utente_id] = [];
      bucket[g.utente_id].push(value);
    });
    return Object.entries(bucket).map(([id, values]) => ({
      name: studentNameById[id] || id,
      value: Number((values.reduce((acc, v) => acc + v, 0) / values.length).toFixed(1))
    }));
  }, [grades, studentNameById]);

  return (
    <RankedBarChart
      title={t('data.gradesByUser')}
      subtitle={t('data.gradesByUserSubtitle')}
      data={byStudent}
      color="var(--ev)"
      domain={[0, 6]}
      threshold={PASS_GRADE}
      thresholdLabel={t('grading.passLine')}
      emptyLabel={t('data.noData')}
      valueFormatter={(v) => v}
    />
  );
};

export default GradesByUserChart;
