import { supabase } from '../supabaseClient';
import { readThroughCache } from './offlineCache';
import { writeOrQueue, registerExecutor, overlayPending } from './offlineQueue';
import { logDataChange, AUDIT_EVENTS } from './auditLog.supabase';
import { SYNC_ENTITY } from '../utils/syncQueue';

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

const fetchGrades = async (studentId) =>
  readThroughCache(`grades:${studentId}`, async () => {
    const { data, error } = await supabase.from('grades').select('*').eq('utente_id', studentId);
    if (error) throw error;
    return data.map(normalizeGrade);
  });

// Leggi i voti di uno studente (con le modifiche ancora in coda, se offline)
export const loadGrades = async (studentId) => {
  const rows = await fetchGrades(studentId);
  return overlayPending(SYNC_ENTITY.GRADE, rows, { studentIds: [studentId] });
};

const fetchGradesForStudents = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return [];
  const cacheKey = `grades:many:${[...studentIds].sort().join(',')}`;
  return readThroughCache(cacheKey, async () => {
    const { data, error } = await supabase.from('grades').select('*').in('utente_id', studentIds);
    if (error) throw error;
    return data.map(normalizeGrade);
  });
};

// Leggi i voti di più studenti insieme (per statistiche aggregate)
export const getGradesForStudents = async (studentIds) => {
  const rows = await fetchGradesForStudents(studentIds);
  return overlayPending(SYNC_ENTITY.GRADE, rows, { studentIds });
};

// Inserimento online: l'id e la data li sceglie il client, così un voto accodato offline
// arriva al server identico a come l'utente l'ha visto.
const insertGrade = async ({ id, studentId, subject, grade, studentComment, trainerComment, date }) => {
  const { data, error } = await supabase.from('grades').insert([{
    id,
    utente_id: studentId,
    subject: subject || 'cultureGeneral',
    voto: parseFloat(grade),
    student_comment: studentComment || '',
    trainer_comment: trainerComment || '',
    data_valutazione: date,
  }]).select().single();
  if (error) throw error;

  const created = normalizeGrade(data);
  await logDataChange({
    event: AUDIT_EVENTS.GRADE_CREATED,
    entity: 'grade',
    entityId: created.id,
    studentId,
    details: { subject: created.subject, grade: created.grade },
  });
  return created;
};

// Aggiungi un voto (forma generica per GradingSection)
export const addGrade = async (grade) => {
  const input = {
    id: Date.now().toString(),
    studentId: grade.studentId,
    subject: grade.subject,
    grade: grade.grade,
    studentComment: grade.studentComment,
    trainerComment: grade.trainerComment,
    date: new Date().toISOString(),
  };

  return writeOrQueue({
    entity: SYNC_ENTITY.GRADE,
    action: 'create',
    clientId: input.id,
    studentId: input.studentId,
    args: [input],
    row: {
      subject: input.subject || 'cultureGeneral',
      grade: parseFloat(input.grade),
      studentComment: input.studentComment || '',
      trainerComment: input.trainerComment || '',
      date: input.date,
      utente_id: input.studentId,
      valutatore_id: null,
    },
    run: () => insertGrade(input),
  });
};
registerExecutor('grade:create', ([input]) => insertGrade(input));

// Aggiungi un voto
export const saveGrade = async (studentId, gradeData) => addGrade({ ...gradeData, studentId });

// Aggiorna un voto
const updateGradeOnline = async (grade) => {
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

  const updated = normalizeGrade(data);
  await logDataChange({
    event: AUDIT_EVENTS.GRADE_UPDATED,
    entity: 'grade',
    entityId: updated.id,
    studentId: updated.utente_id,
    details: { subject: updated.subject, grade: updated.grade },
  });
  return updated;
};

export const updateGrade = async (grade) =>
  writeOrQueue({
    entity: SYNC_ENTITY.GRADE,
    action: 'update',
    targetId: grade.id,
    args: [grade],
    patch: {
      subject: grade.subject || 'cultureGeneral',
      grade: parseFloat(grade.grade),
      studentComment: grade.studentComment || '',
      trainerComment: grade.trainerComment || '',
    },
    run: () => updateGradeOnline(grade),
  });
registerExecutor('grade:update', ([grade]) => updateGradeOnline(grade));

// Elimina un voto
const deleteGradeOnline = async (gradeId) => {
  const { data, error } = await supabase
    .from('grades')
    .delete()
    .eq('id', gradeId)
    .select('utente_id, subject, voto');
  if (error) throw error;

  const removed = Array.isArray(data) ? data[0] : null;
  await logDataChange({
    event: AUDIT_EVENTS.GRADE_DELETED,
    entity: 'grade',
    entityId: gradeId,
    studentId: removed?.utente_id ?? null,
    details: { subject: removed?.subject ?? null, grade: removed?.voto ?? null },
  });
  return true;
};

export const deleteGrade = async (gradeId) =>
  writeOrQueue({
    entity: SYNC_ENTITY.GRADE,
    action: 'delete',
    targetId: gradeId,
    args: [gradeId],
    run: () => deleteGradeOnline(gradeId),
  });
registerExecutor('grade:delete', ([gradeId]) => deleteGradeOnline(gradeId));
