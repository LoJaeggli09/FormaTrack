import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';

// Normalizza un voto dal formato Supabase al formato app
const normalizeGrade = (g) => ({
  id: g.id,
  subject: g.subject || 'cultureGeneral',
  grade: g.voto,
  studentComment: g.student_comment || '',
  trainerComment: g.trainer_comment || '',
  date: g.data_valutazione,
  utente_id: g.utente_id,
  valutatore_id: g.valutatore_id,
});

// Leggi tutti i voti
export const getAllGrades = async () => {
  const { data, error } = await supabase.from('grades').select('*');
  if (error) throw error;
  return data.map(normalizeGrade);
};

// Leggi i voti di uno studente
export const loadGrades = async (studentId) =>
  readThroughCache(`grades:${studentId}`, async () => {
    const { data, error } = await supabase.from('grades').select('*').eq('utente_id', studentId);
    if (error) throw error;
    return data.map(normalizeGrade);
  });

// Leggi i voti di più studenti insieme (per statistiche aggregate)
export const getGradesForStudents = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return [];
  const cacheKey = `grades:many:${[...studentIds].sort().join(',')}`;
  return readThroughCache(cacheKey, async () => {
    const { data, error } = await supabase.from('grades').select('*').in('utente_id', studentIds);
    if (error) throw error;
    return data.map(normalizeGrade);
  });
};

// Aggiungi un voto
export const saveGrade = async (studentId, gradeData) => {
  const { data, error } = await supabase.from('grades').insert([{
    id: Date.now().toString(),
    utente_id: studentId,
    subject: gradeData.subject || 'cultureGeneral',
    voto: parseFloat(gradeData.grade),
    student_comment: gradeData.studentComment || '',
    trainer_comment: gradeData.trainerComment || '',
    data_valutazione: new Date().toISOString(),
  }]).select().single();
  if (error) throw error;
  return normalizeGrade(data);
};

// Aggiungi un voto (forma generica per GradingSection)
export const addGrade = async (grade) => {
  const { data, error } = await supabase.from('grades').insert([{
    id: Date.now().toString(),
    utente_id: grade.studentId,
    subject: grade.subject || 'cultureGeneral',
    voto: parseFloat(grade.grade),
    student_comment: grade.studentComment || '',
    trainer_comment: grade.trainerComment || '',
    data_valutazione: new Date().toISOString(),
  }]).select().single();
  if (error) throw error;
  return normalizeGrade(data);
};

// Aggiorna un voto
export const updateGrade = async (grade) => {
  const { data, error } = await supabase
    .from('grades')
    .update({
      subject: grade.subject || 'cultureGeneral',
      voto: parseFloat(grade.grade),
      student_comment: grade.studentComment || '',
      trainer_comment: grade.trainerComment || '',
    })
    .eq('id', grade.id)
    .select().single();
  if (error) throw error;
  return normalizeGrade(data);
};

// Elimina un voto
export const deleteGrade = async (gradeId) => {
  const { error } = await supabase.from('grades').delete().eq('id', gradeId);
  if (error) throw error;
  return true;
};

