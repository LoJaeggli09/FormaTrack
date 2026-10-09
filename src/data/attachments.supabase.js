/**
 * Allegati su attività e note.
 *
 * I file stanno nel bucket privato "attachments" di Supabase Storage; la tabella
 * `attachments` tiene i metadati e il collegamento all'entità. Il download passa
 * da una signed URL e, in Electron, dalla finestra di salvataggio nativa.
 */

import { supabase } from '../supabaseClient';
import { readOptionalTable } from './schemaFallback';
import { logError } from '../utils/logger';

const BUCKET = 'attachments';

/** Nome del bucket, per chi deve ripulire i file (es. eliminazione di un'area di lavoro). */
export const ATTACHMENTS_BUCKET = BUCKET;

/** Oltre questa soglia il file non si carica: il bucket è pensato per documenti, non per video. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const normalizeAttachment = (a) => ({
  id: a.id,
  studentId: a.student_id,
  entityType: a.entity_type,
  entityId: a.entity_id,
  filePath: a.file_path,
  fileName: a.file_name,
  mimeType: a.mime_type || '',
  sizeBytes: a.size_bytes ?? null,
  uploadedBy: a.uploaded_by,
  uploadedByName: a.uploaded_by_name || '',
  createdAt: a.created_at,
});

const safeSegment = (value) =>
  String(value || 'file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);

/** Allegati di una singola entità (attività o nota). */
export const getAttachments = async (entityType, entityId) => {
  if (!entityType || !entityId) return [];
  return readOptionalTable(async () => {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(normalizeAttachment);
  }, [], 'attachments');
};

/** Allegati di tutte le entità di un apprendista — usato per mostrare i contatori. */
export const getAttachmentsForStudent = async (studentId) => {
  if (!studentId) return [];
  return readOptionalTable(async () => {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('student_id', studentId);
    if (error) throw error;
    return data.map(normalizeAttachment);
  }, [], 'attachments');
};

/**
 * Carica un file e ne registra i metadati.
 * @param {{ file: File, studentId: number, entityType: string, entityId: number, uploadedBy?: number, uploadedByName?: string }} params
 */
export const uploadAttachment = async ({
  file,
  studentId,
  entityType,
  entityId,
  uploadedBy = null,
  uploadedByName = null,
}) => {
  if (!file) throw new Error('Nessun file selezionato');
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const error = new Error('FILE_TOO_LARGE');
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  const filePath = `${studentId}/${entityType}/${entityId}/${Date.now()}-${safeSegment(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from('attachments').insert([{
    student_id: studentId,
    entity_type: entityType,
    entity_id: entityId,
    file_path: filePath,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: uploadedBy,
    uploaded_by_name: uploadedByName,
  }]).select().single();

  if (error) {
    // Metadati non salvati: il file orfano nel bucket va rimosso, altrimenti
    // resta invisibile e occupa spazio per sempre.
    await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {});
    throw error;
  }
  return normalizeAttachment(data);
};

/** URL temporaneo (1 ora) per aprire o scaricare il file. */
export const getAttachmentUrl = async (attachment) => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
};

/**
 * Scarica l'allegato: finestra di salvataggio nativa in Electron, download del
 * browser in sviluppo.
 * @returns {Promise<{ success: boolean, canceled?: boolean, error?: string }>}
 */
export const downloadAttachment = async (attachment) => {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(attachment.filePath);
    if (error) throw error;
    const bytes = new Uint8Array(await data.arrayBuffer());

    if (window.electronAPI?.saveFile) {
      return window.electronAPI.saveFile(attachment.fileName, bytes);
    }

    const url = URL.createObjectURL(new Blob([bytes], { type: attachment.mimeType || 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true };
  } catch (error) {
    logError('Attachments', 'Download allegato fallito', error);
    return { success: false, error: error.message };
  }
};

export const deleteAttachment = async (attachment) => {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([attachment.filePath]);
  // Se il file era già sparito dal bucket si prosegue comunque a cancellare la riga.
  if (storageError) logError('Attachments', 'Rimozione file dal bucket fallita', storageError);

  const { error } = await supabase.from('attachments').delete().eq('id', attachment.id);
  if (error) throw error;
  return true;
};

/** "1.2 MB" — per l'elenco allegati. */
export const formatFileSize = (bytes) => {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
