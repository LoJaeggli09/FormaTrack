import { supabase } from '../supabaseClient';
import { addUser } from './users.supabase';
import { writeAuditLog, AUDIT_EVENTS } from './auditLog.supabase';
import { ATTACHMENTS_BUCKET } from './attachments.supabase';
import { isMissingColumnError } from './schemaFallback';
import { getArchiveStatus } from '../utils/workspaceArchive';
import { logWarn } from '../utils/logger';

export const createWorkspace = async ({ name, description, ownerId = null }) => {
  const row = {
    name,
    description: description || null,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('workspaces')
    .insert([row])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const createWorkspaceWithAdmin = async ({ name, description, ownerId = null, adminName = null, adminRole = 'admin', defaultPassword = 'Abc123!' }) => {
  const workspace = await createWorkspace({ name, description, ownerId });

  if (adminName && adminName.trim()) {
    const createdUser = await addUser({
      name: adminName.trim(),
      password: defaultPassword,
      role: adminRole,
      workspaceId: workspace.id,
    }, ownerId, adminName.trim());

    return { workspace, admin: createdUser };
  }

  return { workspace };
};

export const getWorkspaces = async () => {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
};

export const getWorkspaceById = async (workspaceId) => {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();

  if (error) throw error;
  return data;
};

// ── Archivio ─────────────────────────────────────────────────────────────────
// Un'area archiviata continua a funzionare: archived_at è solo un'etichetta che la
// sposta dall'elenco attivo all'archivio. Nessun accesso, utente o dato la distingue.

const migrationRequired = () => {
  const error = new Error("Esegui lo script supabase-workspaces-archive.sql per abilitare l'archivio delle aree di lavoro.");
  error.code = 'MIGRATION_REQUIRED';
  return error;
};

const isMissingFunctionError = (error) =>
  error?.code === '42883' || error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '');

const setArchivedAt = async (workspaceId, archivedAt) => {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ archived_at: archivedAt })
    .eq('id', workspaceId)
    .select()
    .single();

  if (error) {
    if (isMissingColumnError(error)) throw migrationRequired();
    throw error;
  }
  return data;
};

/** Sposta un'area nell'archivio. Riservata all'app admin (vincolo applicato dall'interfaccia). */
export const archiveWorkspace = async (workspaceId, actorId = null, actorName = null) => {
  const workspace = await setArchivedAt(workspaceId, new Date().toISOString());
  await writeAuditLog({
    event: AUDIT_EVENTS.WORKSPACE_ARCHIVED,
    actorId,
    actorName,
    targetId: workspaceId,
    targetName: workspace?.name ?? null,
  });
  return workspace;
};

/** Riporta un'area dall'archivio all'elenco attivo; il conteggio dei 30 giorni riparte da zero. */
export const restoreWorkspace = async (workspaceId, actorId = null, actorName = null) => {
  const workspace = await setArchivedAt(workspaceId, null);
  await writeAuditLog({
    event: AUDIT_EVENTS.WORKSPACE_RESTORED,
    actorId,
    actorName,
    targetId: workspaceId,
    targetName: workspace?.name ?? null,
  });
  return workspace;
};

/** Percorsi dei file allegati degli apprendisti dell'area, per rimuoverli da Storage dopo l'eliminazione. */
const listAttachmentPaths = async (workspaceId) => {
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('workspace_id', workspaceId);
    if (usersError || !users?.length) return [];

    const { data: files, error: filesError } = await supabase
      .from('attachments')
      .select('file_path')
      .in('student_id', users.map((user) => user.id));
    if (filesError || !files) return [];
    return files.map((file) => file.file_path).filter(Boolean);
  } catch (error) {
    logWarn('Workspaces', 'Elenco allegati non disponibile', error);
    return [];
  }
};

/**
 * Elimina definitivamente un'area archiviata da almeno ARCHIVE_RETENTION_DAYS giorni,
 * insieme ai suoi utenti e ai loro dati.
 *
 * Il controllo dei giorni è fatto qui (per dare un messaggio chiaro) e ripetuto dal
 * database nella funzione delete_archived_workspace: se qui qualcosa non torna, il
 * database rifiuta comunque. Si chiama solo da un'azione esplicita dell'app admin
 * con conferma: mai da un promemoria.
 *
 * @throws {Error} code = 'WORKSPACE_NOT_DELETABLE' | 'MIGRATION_REQUIRED' | errore del database
 */
export const deleteArchivedWorkspace = async (workspaceId, actorId = null, actorName = null) => {
  const workspace = await getWorkspaceById(workspaceId);
  const status = getArchiveStatus(workspace);

  if (!status.deletable) {
    const error = new Error(
      status.archived
        ? `Eliminabile tra ${status.daysLeft} giorni`
        : "Solo un'area archiviata si può eliminare"
    );
    error.code = 'WORKSPACE_NOT_DELETABLE';
    error.daysLeft = status.daysLeft;
    throw error;
  }

  const filePaths = await listAttachmentPaths(workspaceId);

  const { error } = await supabase.rpc('delete_archived_workspace', { p_workspace_id: workspaceId });
  if (error) {
    if (isMissingFunctionError(error)) throw migrationRequired();
    throw error;
  }

  if (filePaths.length > 0) {
    try {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove(filePaths);
    } catch (storageError) {
      // L'area è già eliminata: i file rimasti in Storage sono orfani ma innocui.
      logWarn('Workspaces', 'Rimozione dei file allegati non riuscita', storageError);
    }
  }

  await writeAuditLog({
    event: AUDIT_EVENTS.WORKSPACE_DELETED,
    actorId,
    actorName,
    targetId: workspaceId,
    targetName: workspace?.name ?? null,
  });
  return true;
};
