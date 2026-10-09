import React, { useState, useEffect, useRef } from 'react';
import { UserPlus, Edit2, Trash2, Save, X, KeyRound, Download, AlertTriangle, Archive, RotateCcw } from 'lucide-react';
import { translate } from '../i18n';
import { getAllUsers, addUser, updateUser, deleteUser, resetUserPasswordToDefault, archiveUser, restoreUser, getArchivedUsers } from '../data/users.supabase';
import {
  createWorkspaceWithAdmin, getWorkspaces, archiveWorkspace, restoreWorkspace, deleteArchivedWorkspace,
} from '../data/workspaces.supabase';
import { ARCHIVE_RETENTION_DAYS, activeWorkspaces, archivedWorkspaces, getArchiveStatus } from '../utils/workspaceArchive';
import { supabase } from '../supabaseClient';
import { writeAuditLog, getAuditLog, AUDIT_EVENTS } from '../data/auditLog.supabase';
import { SectionSkeleton } from './SkeletonLoader';
import { logError, notifyError, notifySuccess } from '../utils/logger';

const ManageSection = ({ language = 'it', currentUser }) => {
  const t = (key) => translate(key, language);
  const isStudentRole = (role) => role === 'student';
  const isApprenticeRole = (role) => role === 'apprentice';
  const getRoleLabel = (role) => {
    if (role === 'admin' || role === 'app_admin') return t('manage.admin');
    if (role === 'trainer') return t('manage.trainer');
    return t('manage.student');
  };

  const [activeTab, setActiveTab] = useState('users');
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnce = useRef(false);
  const [usersList, setUsersList] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bulkTrainerId, setBulkTrainerId] = useState('');
  const [auditLogEntries, setAuditLogEntries] = useState([]);
  const [archivedList, setArchivedList] = useState([]);
  const [newUser, setNewUser] = useState({
    name: '',
    role: 'student',
    trainerId: null,
    workspaceId: null,
    formationYear: 1,
    studentNumber: '',
    apprenticeshipStart: '',
    apprenticeshipEnd: ''
  });
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
  const [newWorkspaceAdminName, setNewWorkspaceAdminName] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const locale = language === 'it' ? 'it-IT' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : 'fr-FR';

  useEffect(() => {
    loadWorkspaces();
    loadUsersList();
    loadAuditLogEntries();
    loadArchivedUsers();
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'app_admin') {
      loadUsersList();
      loadArchivedUsers();
    }
  }, [selectedWorkspaceId]);

  const activeWorkspace = selectedWorkspaceId
    ? workspaces.find((workspace) => workspace.id === Number(selectedWorkspaceId))
    : null;

  const loadWorkspaces = async () => {
    if (currentUser?.role !== 'app_admin') return;
    try {
      const workspaces = await getWorkspaces();
      setWorkspaces(workspaces);
    } catch (error) {
      console.warn('Errore caricamento aree di lavoro:', error);
      setWorkspaces([]);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel('users-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        loadUsersList();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadUsersList = async () => {
    try {
      const workspaceId = currentUser?.role === 'app_admin'
        ? (selectedWorkspaceId ? Number(selectedWorkspaceId) : null)
        : currentUser?.workspaceId ?? null;
      const users = await getAllUsers(workspaceId);
      setUsersList(users);
    } catch (error) {
      console.error('Errore caricamento utenti da Supabase:', error);
      setUsersList([]);
    } finally {
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    }
  };

  const loadAuditLogEntries = async () => {
    try {
      const entries = await getAuditLog(300);
      setAuditLogEntries(entries);
    } catch (err) {
      console.warn('Errore caricamento audit log:', err);
    }
  };

  const loadArchivedUsers = async () => {
    try {
      const workspaceId = currentUser?.role === 'app_admin'
        ? (selectedWorkspaceId ? Number(selectedWorkspaceId) : null)
        : currentUser?.workspaceId ?? null;
      const archived = await getArchivedUsers(workspaceId);
      setArchivedList(archived);
    } catch (err) {
      console.warn('Errore caricamento archivio:', err);
    }
  };

  const trainerOptions = usersList.filter((u) => u.role === 'trainer');
  const inspectorOptions = usersList.filter((u) => u.role === 'inspector');
  const studentUsers = usersList.filter((u) => u.role === 'student');

  // Debug: utile per capire perché un utente creato come admin non compare / non compare tra gli ispettori
  // (lasciato commentato per non disturbare la UI)
  // console.debug('ManageSection usersList roles:', usersList.map(u => ({ id: u.id, role: u.role, workspaceId: u.workspaceId })));
  // console.debug('inspectorOptions:', inspectorOptions);
  // console.debug('trainerOptions:', trainerOptions);
  const filteredUsers = usersList.filter((u) => {
    const matchesQuery = !searchQuery.trim() ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.studentNumber || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesQuery && matchesRole;
  });
  const visibleUsers = currentUser?.role === 'app_admin'
    ? filteredUsers.filter((u) => u.role !== 'inspector')
    : filteredUsers;
  const allStudentsSelected = studentUsers.length > 0 && studentUsers.every((u) => selectedStudentIds.includes(u.id));
  const filteredCount = visibleUsers.length;
  const selectedCount = selectedStudentIds.length;



  const handleAddUser = async () => {
    if (!newUser.name) {
      alert(t('manage.fillRequired'));
      return;
    }

    const fallbackTrainerId = trainerOptions[0]?.id || null;
    const resolvedTrainerId = isStudentRole(newUser.role) ? (newUser.trainerId || fallbackTrainerId) : null;


    const workspaceIdForNewUser = currentUser?.role === 'app_admin'
      ? (newUser.workspaceId || (selectedWorkspaceId ? Number(selectedWorkspaceId) : null))
      : currentUser?.workspaceId || null;

    if (currentUser?.role === 'app_admin' && !workspaceIdForNewUser) {
      alert(t('manage.selectWorkspaceRequired'));
      return;
    }

    const userToAdd = {
      name: newUser.name,
      password: 'Abc123!',
      role: newUser.role,
      workspaceId: workspaceIdForNewUser,
      studentNumber: isStudentRole(newUser.role) ? newUser.studentNumber : null,
      trainerId: resolvedTrainerId,
      formationYear: isStudentRole(newUser.role) ? parseInt(newUser.formationYear) : null,

      apprenticeshipStart: isStudentRole(newUser.role) ? (newUser.apprenticeshipStart || null) : null,
      apprenticeshipEnd: isStudentRole(newUser.role) ? (newUser.apprenticeshipEnd || null) : null,
    };

    try {
      await addUser(userToAdd, currentUser?.id, currentUser?.name);
      await loadUsersList();
      await loadAuditLogEntries();
      setShowAddForm(false);
      setNewUser({
        name: '',
        role: 'student',
        trainerId: null,
        workspaceId: null,
        formationYear: 1,
        studentNumber: '',
        apprenticeshipStart: '',
        apprenticeshipEnd: ''
      });
    } catch (error) {
      logError('ManageSection', 'Errore aggiunta utente', error);
      notifyError('Errore durante l\'aggiunta utente: ' + (error.message || error));
    }
  };

  const handleEditUser = (user) => {
    setEditingUser({ ...user });
  };

  const handleSaveEdit = async () => {
    const userToSave = { ...editingUser };
    if (!isStudentRole(userToSave.role)) {
      userToSave.studentNumber = null;
      userToSave.trainerId = null;
      userToSave.formationYear = null;
      userToSave.apprenticeshipStart = null;
      userToSave.apprenticeshipEnd = null;
    }

    try {
      await updateUser(userToSave);
      await loadUsersList();
      setEditingUser(null);
    } catch (error) {
      logError('ManageSection', 'Errore salvataggio utente', error);
      notifyError('Errore durante il salvataggio: ' + (error.message || error));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (userId === currentUser.id) {
      alert(t('manage.cannotDeleteSelf'));
      return;
    }

    if (window.confirm(t('manage.confirmDelete'))) {
      try {
        const target = usersList.find((u) => u.id === userId);
        await deleteUser(userId, currentUser?.id, currentUser?.name, target?.name);
        await loadUsersList();
        await loadAuditLogEntries();
      } catch (error) {
        logError('ManageSection', 'Errore eliminazione utente', error);
        notifyError('Errore durante l\'eliminazione: ' + (error.message || error));
      }
    }
  };

  const handleArchiveUser = async (userId) => {
    if (userId === currentUser.id) {
      alert(t('manage.cannotDeleteSelf'));
      return;
    }
    if (window.confirm(t('manage.confirmArchive'))) {
      try {
        const target = usersList.find((u) => u.id === userId);
        await archiveUser(userId, currentUser?.id, currentUser?.name, target?.name);
        await loadUsersList();
        await loadArchivedUsers();
        await loadAuditLogEntries();
      } catch (error) {
        logError('ManageSection', 'Errore archiviazione utente', error);
        notifyError('Errore durante l\'archiviazione: ' + (error.message || error));
      }
    }
  };

  const handleRestoreUser = async (userId) => {
    try {
      const target = archivedList.find((u) => u.id === userId);
      await restoreUser(userId, currentUser?.id, currentUser?.name, target?.name);
      await loadUsersList();
      await loadArchivedUsers();
      await loadAuditLogEntries();
    } catch (error) {
      logError('ManageSection', 'Errore ripristino utente', error);
      notifyError('Errore durante il ripristino: ' + (error.message || error));
    }
  };

  const handleToggleStudentSelection = (userId) => {
    setSelectedStudentIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleSelectAllStudents = () => {
    if (allStudentsSelected) {
      setSelectedStudentIds([]);
      return;
    }
    setSelectedStudentIds(studentUsers.map((u) => u.id));
  };

  const handlePromoteSelectedStudents = () => {
    if (selectedStudentIds.length === 0) {
      alert(t('manage.promote.noneSelected'));
      return;
    }

    const confirmed = window.confirm(
      t('manage.promote.confirm').replace('{count}', String(selectedStudentIds.length))
    );
    if (!confirmed) return;

    Promise.all(selectedStudentIds.map(async (studentId) => {
      const student = usersList.find((u) => u.id === studentId && u.role === 'student');
      if (!student) return;

      const currentYear = Number(student.formationYear) || 1;
      const nextYear = Math.min(4, currentYear + 1);

      await updateUser({
        ...student,
        formationYear: nextYear
      });
    })).then(() => {
      setSelectedStudentIds([]);
      loadUsersList();
      alert(t('manage.promote.success').replace('{count}', String(selectedStudentIds.length)));
    });
  };

  const handleApplyBulkAssignment = () => {
    if (selectedStudentIds.length === 0) {
      alert(t('manage.promote.noneSelected'));
      return;
    }

    if (!bulkTrainerId) {
      alert(t('manage.bulkAssign.selectAtLeastOne'));
      return;
    }

    const confirmed = window.confirm(
      t('manage.bulkAssign.confirm').replace('{count}', String(selectedStudentIds.length))
    );
    if (!confirmed) return;

    Promise.all(selectedStudentIds.map(async (studentId) => {
      const student = usersList.find((u) => u.id === studentId && u.role === 'student');
      if (!student) return;

      const updatedStudent = {
        ...student,
        trainerId: bulkTrainerId ? Number(bulkTrainerId) : student.trainerId,
      };

      await updateUser(updatedStudent);
    })).then(async () => {
      await writeAuditLog({
        event: AUDIT_EVENTS.BULK_ASSIGN,
        actorId: currentUser?.id,
        actorName: currentUser?.name,
        details: {
          studentIds: selectedStudentIds,
          trainerId: bulkTrainerId || null,
        },
      });
      setSelectedStudentIds([]);
      setBulkTrainerId('');
      loadUsersList();
      loadAuditLogEntries();
      alert(t('manage.bulkAssign.success').replace('{count}', String(selectedStudentIds.length)));
    });
  };

  const handleResetPassword = async (userId, userName) => {
    if (window.confirm(t('manage.resetPasswordConfirm').replace('{name}', userName))) {
      const didReset = await resetUserPasswordToDefault(userId, currentUser?.id, currentUser?.name, userName);
      if (didReset) {
        await loadAuditLogEntries();
        alert(t('manage.resetPasswordSuccess'));
      } else {
        alert(t('manage.resetPasswordError'));
      }
    }
  };

  const handleExportUsersCsv = () => {
    const headers = ['id', 'name', 'role', 'studentNumber', 'formationYear', 'trainerId', 'inspectorId'];
    const rows = visibleUsers.map(user => [
      user.id,
      user.name || '',
      user.role || '',
      user.studentNumber || '',
      user.formationYear || '',
      user.trainerId || '',
      user.inspectorId || ''
    ]);

    const escapeValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csvContent = [headers, ...rows].map((row) => row.map(escapeValue).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `users_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
      setNewUser({
      name: '',
      role: 'student',
      trainerId: null,
      workspaceId: null,
      formationYear: 1,
      studentNumber: '',
      apprenticeshipStart: '',
      apprenticeshipEnd: ''
    });
  };

  // ── Archivio delle aree di lavoro (solo app admin) ───────────────────────────
  const isAppAdmin = currentUser?.role === 'app_admin';
  const formatDate = (date) => (date ? date.toLocaleDateString(locale) : '');

  const workspaceErrorMessage = (error, fallbackKey) => {
    if (error?.code === 'MIGRATION_REQUIRED') return t('manage.workspaceMigrationRequired');
    if (error?.code === 'WORKSPACE_NOT_DELETABLE') {
      return t('manage.deleteWorkspaceNotYet').replace('{days}', String(error.daysLeft ?? ARCHIVE_RETENTION_DAYS));
    }
    return error?.message || t(fallbackKey);
  };

  const handleArchiveWorkspace = async (workspace) => {
    if (!isAppAdmin) return;
    const message = t('manage.archiveWorkspaceConfirm')
      .replace('{name}', workspace.name)
      .replace('{days}', String(ARCHIVE_RETENTION_DAYS));
    if (!window.confirm(message)) return;
    try {
      await archiveWorkspace(workspace.id, currentUser?.id, currentUser?.name);
      await loadWorkspaces();
      loadAuditLogEntries();
    } catch (error) {
      logError('ManageSection', 'Archiviazione area di lavoro fallita', error);
      notifyError(workspaceErrorMessage(error, 'manage.workspaceArchiveError'));
    }
  };

  const handleRestoreWorkspace = async (workspace) => {
    if (!isAppAdmin) return;
    try {
      await restoreWorkspace(workspace.id, currentUser?.id, currentUser?.name);
      await loadWorkspaces();
      loadAuditLogEntries();
    } catch (error) {
      logError('ManageSection', 'Ripristino area di lavoro fallito', error);
      notifyError(workspaceErrorMessage(error, 'manage.workspaceRestoreError'));
    }
  };

  const openDeleteWorkspace = (workspace) => {
    if (!isAppAdmin || !getArchiveStatus(workspace).deletable) return;
    setDeleteConfirmName('');
    setWorkspaceToDelete(workspace);
  };

  const closeDeleteWorkspace = () => {
    if (deleteBusy) return;
    setWorkspaceToDelete(null);
    setDeleteConfirmName('');
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (!workspaceToDelete || deleteConfirmName.trim() !== workspaceToDelete.name) return;
    setDeleteBusy(true);
    try {
      await deleteArchivedWorkspace(workspaceToDelete.id, currentUser?.id, currentUser?.name);
      notifySuccess(t('manage.workspaceDeleted').replace('{name}', workspaceToDelete.name));
      if (selectedWorkspaceId && Number(selectedWorkspaceId) === workspaceToDelete.id) setSelectedWorkspaceId(null);
      setWorkspaceToDelete(null);
      setDeleteConfirmName('');
      await loadWorkspaces();
      loadAuditLogEntries();
    } catch (error) {
      logError('ManageSection', 'Eliminazione area di lavoro fallita', error);
      notifyError(workspaceErrorMessage(error, 'manage.workspaceDeleteError'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) {
      setWorkspaceError(t('manage.workspaceName') + ' ' + t('manage.fillRequired'));
      return;
    }
    if (!newWorkspaceAdminName.trim()) {
      setWorkspaceError(t('manage.workspaceAdminName') + ' ' + t('manage.fillRequired'));
      return;
    }
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const creationResult = await createWorkspaceWithAdmin({
        name: newWorkspaceName.trim(),
        description: newWorkspaceDescription.trim() || null,
        ownerId: currentUser?.id || null,
        adminName: newWorkspaceAdminName.trim() || null,
        adminRole: 'admin',
        defaultPassword: 'Abc123!'
      });

      if (creationResult.admin) {
        alert(t('manage.createWorkspaceSuccessWithAdmin')
          .replace('{workspaceName}', newWorkspaceName.trim())
          .replace('{adminName}', newWorkspaceAdminName.trim())
        );
      } else {
        alert(t('manage.createWorkspaceSuccess').replace('{name}', newWorkspaceName.trim()));
      }

      setShowCreateWorkspace(false);
      setNewWorkspaceName('');
      setNewWorkspaceDescription('');
      setNewWorkspaceAdminName('');
      await loadWorkspaces();
      await loadUsersList();
    } catch (error) {
      console.error('Errore creazione area di lavoro:', error);
      setWorkspaceError(error?.message || t('manage.createWorkspaceError'));
    } finally {
      setWorkspaceLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="manage-section">
        <SectionSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="manage-section">
      <div className="section-header">
        <div>
          <h2>{t('manage.title')}</h2>
          {currentUser?.role === 'app_admin' && activeWorkspace ? (
            <p className="manage-subtitle">
              {t('manage.currentWorkspace')}: {activeWorkspace.name}
              {getArchiveStatus(activeWorkspace).archived && (
                <span className="chip chip-neutral manage-archived-chip">{t('manage.workspaceArchivedBadge')}</span>
              )}
            </p>
          ) : (
            <p className="manage-subtitle">
              {filteredCount} utenti visibili · {selectedCount} apprendisti selezionati
            </p>
          )}
        </div>
        <div className="manage-header-actions">
          {currentUser?.role === 'app_admin' && activeWorkspace && (
            <button
              className="btn-secondary"
              onClick={() => setSelectedWorkspaceId(null)}
            >
              {t('manage.backToWorkspaces')}
            </button>
          )}
          {!(currentUser?.role === 'app_admin' && !selectedWorkspaceId) && (
            <>
              <button
                className="btn-secondary"
                onClick={handleExportUsersCsv}
              >
                <Download size={18} />
                {t('manage.exportCsvUsers')}
              </button>
              <button 
                className="btn-primary"
                onClick={() => setShowAddForm(true)}
                disabled={showAddForm}
              >
                <UserPlus size={20} />
                {t('manage.addUser')}
              </button>
            </>
          )}
          {currentUser?.role === 'app_admin' && (
            <button
              className="btn-secondary"
              onClick={() => setShowCreateWorkspace((prev) => !prev)}
            >
              <UserPlus size={18} />
              {t('manage.createWorkspace')}
            </button>
          )}
        </div>
      </div>

      {currentUser?.role === 'app_admin' && !selectedWorkspaceId ? (
        <>
        <div className="card manage-workspace-list-card">
          <h3>{t('manage.workspaceListTitle')}</h3>
          {activeWorkspaces(workspaces).length === 0 ? (
            <p>{t('manage.noWorkspaces')}</p>
          ) : (
            <div className="workspace-card-grid">
              {activeWorkspaces(workspaces).map((workspace) => (
                <div key={workspace.id} className="workspace-card card">
                  <div>
                    <strong>{workspace.name}</strong>
                    {workspace.description && <p>{workspace.description}</p>}
                  </div>
                  <div className="workspace-card-actions">
                    <button
                      className="btn-primary"
                      onClick={() => setSelectedWorkspaceId(String(workspace.id))}
                    >
                      {t('manage.openWorkspace')}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => handleArchiveWorkspace(workspace)}
                    >
                      <Archive size={16} />
                      {t('manage.archive')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {archivedWorkspaces(workspaces).length > 0 && (
          <div className="card manage-workspace-list-card manage-workspace-archive-card">
            <h3>{t('manage.workspaceArchiveTitle')} ({archivedWorkspaces(workspaces).length})</h3>
            <p className="manage-subtitle">
              {t('manage.workspaceArchiveHint').replace('{days}', String(ARCHIVE_RETENTION_DAYS))}
            </p>
            <div className="manage-audit-list">
              {archivedWorkspaces(workspaces).map((workspace) => {
                const status = getArchiveStatus(workspace);
                return (
                  <div key={workspace.id} className="manage-audit-item manage-archive-row">
                    <div>
                      <div className="manage-audit-title">
                        {workspace.name}
                        {status.deletable ? (
                          <span className="chip chip-warning manage-archived-chip">{t('manage.workspaceDeletable')}</span>
                        ) : (
                          <span className="chip chip-neutral manage-archived-chip">
                            {t('manage.workspaceDeletableIn').replace('{days}', String(status.daysLeft))}
                          </span>
                        )}
                      </div>
                      <div className="manage-audit-sub">
                        {t('manage.workspaceArchivedOn').replace('{date}', formatDate(status.archivedAt))}
                        {' · '}
                        {t('manage.workspaceDeletableFrom').replace('{date}', formatDate(status.deletableFrom))}
                      </div>
                    </div>
                    <div className="workspace-archive-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => setSelectedWorkspaceId(String(workspace.id))}
                      >
                        {t('manage.openWorkspace')}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => handleRestoreWorkspace(workspace)}
                      >
                        <RotateCcw size={16} />
                        {t('manage.restoreWorkspace')}
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => openDeleteWorkspace(workspace)}
                        disabled={!status.deletable}
                        title={status.deletable
                          ? t('manage.deleteWorkspace')
                          : t('manage.deleteWorkspaceNotYet').replace('{days}', String(status.daysLeft))}
                      >
                        <Trash2 size={16} />
                        {t('manage.deleteWorkspace')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>
      ) : (
        <>
        <div className="manage-tabs">
          <button type="button" className={`manage-tab-button ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            {t('manage.tabUsers')} ({filteredCount})
          </button>
          <button type="button" className={`manage-tab-button ${activeTab === 'bulk' ? 'active' : ''}`} onClick={() => setActiveTab('bulk')}>
            {t('manage.tabBulk')}
          </button>
          <button type="button" className={`manage-tab-button ${activeTab === 'archive' ? 'active' : ''}`} onClick={() => setActiveTab('archive')}>
            {t('manage.tabArchive')} ({archivedList.length})
          </button>
          <button type="button" className={`manage-tab-button ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
            {t('manage.tabAudit')}
          </button>
        </div>

        {activeTab === 'users' && (
        <div className="card manage-controls-card">
          <div className="manage-controls-grid">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('manage.searchPlaceholder')}
            className="manage-search-input"
          />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="manage-inline-select"
            >
              <option value="all">{t('manage.roleAll')}</option>
              <option value="student">{t('manage.student')}</option>
              <option value="trainer">{t('manage.trainer')}</option>
              <option value="admin">{t('manage.admin')}</option>
            </select>
          <button
            className="btn-secondary"
            onClick={handleToggleSelectAllStudents}
            disabled={studentUsers.length === 0}
          >
            {allStudentsSelected ? t('manage.selectNoneStudents') : t('manage.selectAllStudents')}
          </button>
          <button
            className="btn-primary"
            onClick={handlePromoteSelectedStudents}
            disabled={selectedCount === 0}
          >
            {t('manage.promoteSelected')}
          </button>
        </div>
      </div>
        )}
        </>
      )}

      {showCreateWorkspace && (
        <div className="card manage-workspace-card">
          <h3>{t('manage.createWorkspaceTitle')}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>{t('manage.workspaceName')} *</label>
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder={t('manage.workspaceName')}
              />
            </div>
            <div className="form-group">
              <label>{t('manage.workspaceAdminName')} *</label>
              <input
                type="text"
                value={newWorkspaceAdminName}
                onChange={(e) => setNewWorkspaceAdminName(e.target.value)}
                placeholder={t('manage.workspaceAdminName')}
              />
            </div>
            <div className="form-group span-all">
              <label>{t('manage.workspaceDescription')}</label>
              <textarea
                value={newWorkspaceDescription}
                onChange={(e) => setNewWorkspaceDescription(e.target.value)}
                placeholder={t('manage.workspaceDescription')}
                rows={3}
              />
            </div>
            {workspaceError && <div className="form-error span-all">{workspaceError}</div>}
            <div className="form-actions span-all">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setShowCreateWorkspace(false);
                  setWorkspaceError('');
                }}
              >
                {t('manage.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={handleCreateWorkspace}
                disabled={workspaceLoading}
              >
                {t('manage.createWorkspace')}
              </button>
            </div>
          </div>
        </div>
      )}

      {!(currentUser?.role === 'app_admin' && !selectedWorkspaceId) && activeTab === 'bulk' && (
          <div className="card manage-bulk-card">
            <h3>{t('manage.bulkTitle')}</h3>
          <div className="manage-controls-grid">
            <select
              value={bulkTrainerId}
              onChange={(e) => setBulkTrainerId(e.target.value)}
              className="manage-inline-select"
            >
              <option value="">{t('manage.bulkAssignTrainer')}</option>
              {trainerOptions.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
              ))}
            </select>

            <button
              className="btn-secondary"
              onClick={handleApplyBulkAssignment}
              disabled={selectedCount === 0}
            >
              {t('manage.applyBulkAssign')}
            </button>
          </div>
          </div>
      )}

      {!(currentUser?.role === 'app_admin' && !selectedWorkspaceId) && activeTab === 'users' && (
        <>
          {showAddForm && (
            <div className="user-form card">
              <h3>{t('manage.newUser')}</h3>
              <div className="form-grid">
        <div className="form-group">
              <label>{t('manage.name')} *</label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                onKeyDown={(e) => { if (e.key === ' ') { e.stopPropagation(); } }}
                placeholder="Nome Cognome"
              />
            </div>
            <div className="form-group">
              <label>{t('manage.role')}</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
              >
              <option value="student">{t('manage.student')}</option>
              <option value="trainer">{t('manage.trainer')}</option>
              <option value="admin">{t('manage.admin')}</option>
              </select>
            </div>
            {currentUser?.role === 'app_admin' && (
              <div className="form-group">
                <label>{t('manage.workspace')}</label>
                <select
                  value={newUser.workspaceId || ''}
                  onChange={(e) => setNewUser({...newUser, workspaceId: e.target.value ? Number(e.target.value) : null})}
                >
                  <option value="">{t('manage.selectWorkspace')}</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                  ))}
                </select>
              </div>
            )}
            {isStudentRole(newUser.role) && (
              <>
                <div className="form-group">
                  <label>{t('manage.trainer')}</label>
                  <select
                    value={newUser.trainerId || ''}
                    onChange={(e) => setNewUser({...newUser, trainerId: Number(e.target.value) || null})}
                  >
                    {trainerOptions.map((trainer) => (
                      <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>{t('manage.studentNumber')}</label>
                  <input
                    type="text"
                    value={newUser.studentNumber}
                    onChange={(e) => setNewUser({...newUser, studentNumber: e.target.value})}
                    placeholder="APP001"
                  />
                </div>
                <div className="form-group">
                  <label>{t('manage.formationYear')}</label>
                  <select
                    value={newUser.formationYear}
                    onChange={(e) => setNewUser({...newUser, formationYear: e.target.value})}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('manage.apprenticeshipStart')}</label>
                  <input
                    type="text"
                    value={newUser.apprenticeshipStart}
                    onChange={(e) => setNewUser({...newUser, apprenticeshipStart: e.target.value})}
                    placeholder="01.08.2024"
                  />
                </div>
                <div className="form-group">
                  <label>{t('manage.apprenticeshipEnd')}</label>
                  <input
                    type="text"
                    value={newUser.apprenticeshipEnd}
                    onChange={(e) => setNewUser({...newUser, apprenticeshipEnd: e.target.value})}
                    placeholder="31.07.2027"
                  />
                </div>
              </>
            )}
          </div>
          <div className="form-actions">
            <button className="btn-secondary" onClick={handleCancelAdd}>
              <X size={18} />
              {t('manage.cancel')}
            </button>
            <button className="btn-primary" onClick={handleAddUser}>
              <Save size={18} />
              {t('manage.save')}
            </button>
          </div>
          <p className="info-text">{t('manage.defaultPassword')}: Abc123!</p>
        </div>
      )}

      <div className="users-list">
        {visibleUsers.map(user => (
          <div key={user.id} className={`user-card card role-card-${user.role}`}>
            {editingUser && editingUser.id === user.id ? (
              <div className="user-edit-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label>{t('manage.name')}</label>
                    <input
                      type="text"
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('manage.role')}</label>
                    <select
                      value={editingUser.role}
                      onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                    >
                      <option value="student">{t('manage.student')}</option>
                      <option value="inspector">{t('manage.inspector')}</option>
                      <option value="trainer">{t('manage.trainer')}</option>
                      <option value="admin">{t('manage.admin')}</option>
                    </select>
                  </div>
                  {currentUser?.role === 'app_admin' && (
                    <div className="form-group">
                      <label>{t('manage.workspace')}</label>
                      <select
                        value={editingUser.workspaceId || ''}
                        onChange={(e) => setEditingUser({...editingUser, workspaceId: e.target.value ? Number(e.target.value) : null})}
                      >
                        <option value="">{t('manage.selectWorkspace')}</option>
                        {workspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {isStudentRole(editingUser.role) && (
                    <>
                      <div className="form-group">
                        <label>{t('manage.trainer')}</label>
                        <select
                          value={editingUser.trainerId || ''}
                          onChange={(e) => setEditingUser({...editingUser, trainerId: Number(e.target.value) || null})}
                        >
                          {trainerOptions.map((trainer) => (
                            <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('manage.inspectorReference')}</label>
                        <select
                          value={editingUser.inspectorId || ''}
                          onChange={(e) => setEditingUser({...editingUser, inspectorId: Number(e.target.value) || null})}
                        >
                          <option value="">{t('manage.selectInspector')}</option>
                          {inspectorOptions.map((inspector) => (
                            <option key={inspector.id} value={inspector.id}>{inspector.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('manage.studentNumber')}</label>
                        <input
                          type="text"
                          value={editingUser.studentNumber || ''}
                          onChange={(e) => setEditingUser({...editingUser, studentNumber: e.target.value})}
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('manage.formationYear')}</label>
                        <select
                          value={editingUser.formationYear || 1}
                          onChange={(e) => setEditingUser({...editingUser, formationYear: parseInt(e.target.value)})}
                        >
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('manage.apprenticeshipStart')}</label>
                        <input
                          type="text"
                          value={editingUser.apprenticeshipStart || ''}
                          onChange={(e) => setEditingUser({...editingUser, apprenticeshipStart: e.target.value})}
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('manage.apprenticeshipEnd')}</label>
                        <input
                          type="text"
                          value={editingUser.apprenticeshipEnd || ''}
                          onChange={(e) => setEditingUser({...editingUser, apprenticeshipEnd: e.target.value})}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="form-actions">
                  <button className="btn-secondary" onClick={handleCancelEdit}>
                    <X size={18} />
                    {t('manage.cancel')}
                  </button>
                  <button className="btn-primary" onClick={handleSaveEdit}>
                    <Save size={18} />
                    {t('manage.save')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="user-card-body">
                <div className="user-card-header">
                  {user.role === 'student' && (
                    <input
                      type="checkbox"
                      className="user-card-checkbox"
                      checked={selectedStudentIds.includes(user.id)}
                      onChange={() => handleToggleStudentSelection(user.id)}
                      title={t('manage.selectStudentForPromotion')}
                    />
                  )}
                  <div className="user-card-identity">
                    <h3 className="user-card-name">
                      {user.name}
                      {user.mustChangePassword && (
                        <span
                          className="manage-warning-icon is-warn"
                          title={t('manage.mustChangePasswordWarning') || 'Usa ancora la password predefinita'}
                        >
                          <AlertTriangle size={15} />
                        </span>
                      )}
                      {user.role === 'student' && user.apprenticeshipEnd && new Date(user.apprenticeshipEnd) < new Date() && (
                        <span
                          className="manage-warning-icon is-danger"
                          title={t('manage.apprenticeshipExpiredWarning')}
                        >
                          <AlertTriangle size={15} />
                        </span>
                      )}
                    </h3>
                    <span className="user-card-username">@{user.username}</span>
                  </div>
                  <div className="user-card-aside">
                    <span className={`manage-role-badge role-${user.role}`}>{getRoleLabel(user.role)}</span>
                    <div className="user-actions">
                      <button
                        className="btn-icon btn-edit"
                        onClick={() => handleEditUser(user)}
                        title={t('manage.edit')}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="btn-icon btn-delete"
                        onClick={() => handleArchiveUser(user.id)}
                        title={t('manage.archive')}
                        disabled={user.id === currentUser.id}
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        className="btn-icon btn-reset"
                        onClick={() => handleResetPassword(user.id, user.name)}
                        title={t('manage.resetPassword')}
                      >
                        <KeyRound size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="manage-user-tags">
                  {user.studentNumber && <span className="manage-user-tag">{t('manage.studentNumber')}: {user.studentNumber}</span>}
                  {user.formationYear && <span className="manage-user-tag">{t('manage.formationYear')}: {user.formationYear}</span>}
                  {user.workspaceId && (
                    <span className="manage-user-tag">{t('manage.userWorkspace')}: {(workspaces.find((workspace) => workspace.id === user.workspaceId) || {}).name || user.workspaceId}</span>
                  )}
                  {user.apprenticeshipStart && <span className="manage-user-tag">{t('manage.apprenticeshipStart')}: {user.apprenticeshipStart}</span>}
                  {user.apprenticeshipEnd && <span className="manage-user-tag">{t('manage.apprenticeshipEnd')}: {user.apprenticeshipEnd}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
        </>
      )}

      {!(currentUser?.role === 'app_admin' && !selectedWorkspaceId) && activeTab === 'archive' && (
      <div className="card manage-audit-card">
        <div className="manage-audit-header">
          <h3>{t('manage.archiveTitle')} ({archivedList.length})</h3>
        </div>
        {archivedList.length === 0 && (
          <p className="manage-empty">{t('manage.archiveEmpty')}</p>
        )}
        {archivedList.length > 0 && (
          <div className="manage-audit-list">
            {archivedList.map((user) => (
              <div key={user.id} className="manage-audit-item manage-audit-row">
                <div>
                  <div className="manage-audit-title">{user.name}</div>
                  <div className="manage-audit-sub">
                    {getRoleLabel(user.role)}
                    {user.apprenticeshipEnd && ` · ${t('manage.apprenticeshipEnd')}: ${user.apprenticeshipEnd}`}
                  </div>
                </div>
                <div className="user-actions">
                  <button
                    className="btn-icon btn-edit"
                    onClick={() => handleRestoreUser(user.id)}
                    title={t('manage.restore')}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="btn-icon btn-delete"
                    onClick={() => { if (window.confirm(t('manage.confirmDelete'))) deleteUser(user.id, currentUser?.id, currentUser?.name, user.name).then(loadArchivedUsers); }}
                    title={t('manage.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {!(currentUser?.role === 'app_admin' && !selectedWorkspaceId) && activeTab === 'audit' && (
      <div className="card manage-audit-card">
        <div className="manage-audit-header">
          <h3>{t('manage.auditTitle')}</h3>
          <button className="btn-secondary" onClick={() => { loadAuditLogEntries(); }} title={t('manage.auditRefresh')}>↻</button>
        </div>
        {auditLogEntries.length === 0 ? (
          <p className="manage-empty">{t('manage.auditEmpty')}</p>
        ) : (
          <div className="manage-audit-list">
            {auditLogEntries.map((entry) => {
              const when = new Date(entry.created_at).toLocaleString();
              const eventLabels = {
                login_success:    t('manage.auditLoginSuccess'),
                login_failed:     t('manage.auditLoginFailed'),
                logout:           t('manage.auditLogout'),
                user_created:     t('manage.auditUserCreated'),
                user_deleted:     t('manage.auditUserDeleted'),
                user_archived:    t('manage.auditUserArchived'),
                user_restored:    t('manage.auditUserRestored'),
                password_reset:   t('manage.auditPasswordReset'),
                password_changed: t('manage.auditPasswordChanged'),
                bulk_assign:      t('manage.auditBulkAssign'),
                workspace_archived: t('manage.auditWorkspaceArchived'),
                workspace_restored: t('manage.auditWorkspaceRestored'),
                workspace_deleted:  t('manage.auditWorkspaceDeleted'),
              };
              const eventLabel = eventLabels[entry.event] || entry.event;
              const target = entry.target_name ? `→ ${entry.target_name}` : '';

              return (
                <div
                  key={entry.id}
                  className="manage-audit-item"
                >
                  <div className="manage-audit-title">{eventLabel} {target}</div>
                  <div className="manage-audit-sub">
                    {t('manage.auditBy')}: {entry.actor_name || '-'} | {t('manage.auditWhen')}: {when}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {workspaceToDelete && (
        <div className="modal-backdrop modal-backdrop--top" role="dialog" aria-modal="true">
          <div className="modal-card modal-card--sm">
            <div className="modal-header">
              <h2>{t('manage.deleteWorkspaceTitle')}</h2>
            </div>
            <div className="modal-body">
              <div className="notice notice-error">
                {t('manage.deleteWorkspaceWarning').replace('{name}', workspaceToDelete.name)}
              </div>
              <div className="form-group">
                <label htmlFor="delete-workspace-name">{t('manage.deleteWorkspaceTypeName')}</label>
                <input
                  id="delete-workspace-name"
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={workspaceToDelete.name}
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeDeleteWorkspace} disabled={deleteBusy}>
                {t('common.cancel')}
              </button>
              <button
                className={`btn-danger is-solid ${deleteBusy ? 'is-loading' : ''}`}
                onClick={handleConfirmDeleteWorkspace}
                disabled={deleteBusy || deleteConfirmName.trim() !== workspaceToDelete.name}
              >
                <Trash2 size={16} />
                {t('manage.deleteWorkspace')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageSection;
