import React, { useState, useEffect, useRef } from 'react';
import { Star, Plus, Edit2, Trash2, Save, Award } from 'lucide-react';
import { translate } from '../i18n';
import { CardGridSkeleton } from './SkeletonLoader';
import { PASS_GRADE } from './GradesTrendChart';
import { loadGrades, addGrade, updateGrade, deleteGrade } from '../data/grades.supabase';
import { supabase } from '../supabaseClient';

const emptyForm = { subject: '', grade: '', note: '' };

const GradingSection = ({ studentId, language = 'it', isReadOnly = false }) => {
  const t = (key) => translate(key, language);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  const [isLoading, setIsLoading] = useState(!!studentId);
  const hasLoadedOnce = useRef(false);
  const [grades, setGrades] = useState([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGradeId, setEditingGradeId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const canEdit = !isReadOnly;

  useEffect(() => {
    if (studentId) {
      loadStudentGrades();
    }

    const channel = supabase
      .channel(`grades-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grades' }, () => {
        loadStudentGrades();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId]);

  const loadStudentGrades = async () => {
    try {
      const studentGrades = await loadGrades(studentId);
      setGrades(studentGrades.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (error) {
      setGrades([]);
      console.error('Errore caricamento voti da Supabase:', error);
    } finally {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingGradeId(null);
    setShowAddForm(false);
  };

  const startAdd = () => {
    setFormData(emptyForm);
    setEditingGradeId(null);
    setShowAddForm(true);
  };

  const startEdit = (grade) => {
    setEditingGradeId(grade.id);
    setFormData({
      subject: grade.subject || '',
      grade: grade.grade.toString(),
      note: grade.studentComment || ''
    });
    setShowAddForm(true);
  };

  const handleSave = async () => {
    const gradeValue = formData.grade;
    if (!formData.subject.trim()) return;
    if (gradeValue === '' || gradeValue === null || Number(gradeValue) < 0 || Number(gradeValue) > 6) {
      alert(t('grading.gradeRange') || 'Il voto deve essere tra 0 e 6');
      return;
    }
    try {
      const payload = {
        subject: formData.subject.trim(),
        grade: gradeValue,
        studentComment: formData.note.trim(),
        trainerComment: ''
      };
      if (editingGradeId) {
        await updateGrade({ id: editingGradeId, ...payload });
      } else {
        await addGrade({ ...payload, studentId });
      }
      resetForm();
      await loadStudentGrades();
    } catch (error) {
      alert('Errore durante il salvataggio del voto: ' + error.message);
    }
  };

  const handleDelete = async (gradeId) => {
    if (!window.confirm(t('grading.confirmDelete'))) return;
    try {
      await deleteGrade(gradeId);
      await loadStudentGrades();
    } catch (error) {
      alert('Errore durante l\'eliminazione del voto: ' + error.message);
    }
  };

  const getTotalAverage = () => {
    const validGrades = grades.map((g) => Number(g.grade)).filter((v) => !isNaN(v));
    if (validGrades.length === 0) return null;
    return (validGrades.reduce((acc, v) => acc + v, 0) / validGrades.length).toFixed(1);
  };

  const totalAverage = getTotalAverage();

  const renderStars = (grade) => {
    const stars = [];
    for (let i = 1; i <= 6; i++) {
      stars.push(
        <Star
          key={i}
          size={14}
          className={i <= grade ? 'star-on' : 'star-off'}
        />
      );
    }
    return stars;
  };

  if (isLoading) {
    return (
      <div className="grading-section">
        <CardGridSkeleton cards={4} />
      </div>
    );
  }

  return (
    <div className="grading-section">
      <div className="section-header">
        <div>
          <h2>{t('grading.title')}</h2>
          <p className="section-subtitle">{t('grading.subtitle') || 'Panoramica valutazioni'}</p>
        </div>
        <div className="grading-actions">
          {totalAverage && (
            <div className="average-grade">
              <span className="average-label">{t('grading.average')}</span>
              <span className="average-value">{totalAverage}</span>
              <div className="stars">{renderStars(Math.round(parseFloat(totalAverage)))}</div>
            </div>
          )}
          {canEdit && !showAddForm && (
            <button type="button" className="primary-action-button" onClick={startAdd}>
              <Plus size={16} />
              {t('grading.addGrade')}
            </button>
          )}
        </div>
      </div>

      {showAddForm && canEdit && (
        <div className="add-form">
          <div className="add-form-row">
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label className="field-label">
                {t('grading.subject')}
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder={t('grading.subjectPlaceholder')}
                autoFocus
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ width: '140px' }}>
              <label className="field-label">
                {t('grading.grade')} (0-6)
              </label>
              <input
                type="number"
                min="0"
                max="6"
                step="0.1"
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div className="add-form-row">
            <div style={{ flex: 1 }}>
              <label className="field-label">
                {t('grading.note')}
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder={t('grading.notePlaceholder')}
                rows={2}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-action-button" onClick={resetForm}>
              {t('common.cancel')}
            </button>
            <button type="button" className="primary-action-button" onClick={handleSave}>
              <Save size={14} />
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {grades.length === 0 && !showAddForm ? (
        <div className="empty-state">
          <Award size={36} />
          <p>{t('grading.noGrades')}</p>
        </div>
      ) : (
        <div className="grades-list rows">
          {grades.map((grade) => (
            <div key={grade.id} className={`row-item ${Number(grade.grade) >= PASS_GRADE ? 'cat-ev' : 'cat-abs'}`}>
              <div>
                <div className="grade-head">
                  <strong className="grade-subject">{grade.subject}</strong>
                  <div className="stars">{renderStars(Math.round(grade.grade))}</div>
                  <span className="grade-value">{grade.grade}</span>
                </div>
                <span className="row-meta">
                  {new Date(grade.date).toLocaleDateString(locale)}
                </span>
                {grade.studentComment && (
                  <p className="row-text">
                    {grade.studentComment}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="row-actions">
                  <button onClick={() => startEdit(grade)}>
                    <Edit2 size={15} />
                  </button>
                  <button className="danger" onClick={() => handleDelete(grade.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GradingSection;
