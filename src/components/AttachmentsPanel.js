import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Download, Trash2, Upload, Loader2 } from 'lucide-react';
import { translate } from '../i18n';
import {
  getAttachments,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
} from '../data/attachments.supabase';
import { logError, notifyError, notifySuccess } from '../utils/logger';

/**
 * Allegati di una singola attività o nota.
 *
 * Il pannello parte chiuso e mostra solo il numero di file: in una tabella di
 * cento righe non deve rubare spazio finché non serve davvero. Il conteggio
 * arriva dal chiamante, che lo legge una volta sola per tutto l'apprendista:
 * una query per riga metterebbe in ginocchio la tabella.
 *
 * @param {object} props
 * @param {'activity'|'note'} props.entityType
 * @param {number} props.entityId
 * @param {number} props.studentId
 * @param {number} [props.count]      - allegati già noti al chiamante
 * @param {Function} [props.onChange] - invocata dopo un caricamento o una rimozione
 */
const AttachmentsPanel = ({
  entityType,
  entityId,
  studentId,
  count = 0,
  onChange = null,
  currentUser = null,
  language = 'it',
  isReadOnly = false,
}) => {
  const t = (key) => translate(key, language);
  const [attachments, setAttachments] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setAttachments(await getAttachments(entityType, entityId));
    } catch (error) {
      logError('AttachmentsPanel', 'Errore caricamento allegati', error);
      setAttachments([]);
    }
  }, [entityType, entityId]);

  // L'elenco si legge solo alla prima apertura del pannello.
  useEffect(() => {
    if (isOpen && attachments === null) load();
  }, [isOpen, attachments, load]);

  const refreshAll = async () => {
    await load();
    if (typeof onChange === 'function') onChange();
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsBusy(true);
    try {
      await uploadAttachment({
        file,
        studentId,
        entityType,
        entityId,
        uploadedBy: currentUser?.id || null,
        uploadedByName: currentUser?.name || null,
      });
      await refreshAll();
      notifySuccess(t('attachments.uploaded'));
    } catch (error) {
      logError('AttachmentsPanel', 'Errore caricamento allegato', error);
      notifyError(
        error.code === 'FILE_TOO_LARGE'
          ? t('attachments.tooLarge').replace('{size}', formatFileSize(MAX_ATTACHMENT_BYTES))
          : t('attachments.uploadError')
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownload = async (attachment) => {
    setIsBusy(true);
    try {
      const result = await downloadAttachment(attachment);
      if (!result?.success && !result?.canceled) notifyError(result?.error || t('attachments.downloadError'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (attachment) => {
    if (!window.confirm(t('attachments.confirmDelete'))) return;
    setIsBusy(true);
    try {
      await deleteAttachment(attachment);
      await refreshAll();
    } catch (error) {
      logError('AttachmentsPanel', 'Errore eliminazione allegato', error);
      notifyError(t('attachments.deleteError'));
    } finally {
      setIsBusy(false);
    }
  };

  const items = attachments || [];
  const badgeCount = attachments === null ? count : items.length;

  return (
    <div className="attachments-panel">
      <button
        type="button"
        className={`attachments-toggle ${badgeCount > 0 ? 'has-files' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={t('attachments.title')}
        aria-expanded={isOpen}
      >
        <Paperclip size={14} />
        {badgeCount > 0 && <span>{badgeCount}</span>}
      </button>

      {isOpen && (
        <div className="attachments-body">
          {attachments === null ? (
            <p className="attachments-empty"><Loader2 size={14} className="spin" /></p>
          ) : (
            <>
              {items.length === 0 && <p className="attachments-empty">{t('attachments.empty')}</p>}

              <ul className="attachments-list">
                {items.map((attachment) => (
                  <li key={attachment.id}>
                    <span className="attachment-name" title={attachment.fileName}>{attachment.fileName}</span>
                    <span className="attachment-size">{formatFileSize(attachment.sizeBytes)}</span>
                    <button
                      type="button"
                      onClick={() => handleDownload(attachment)}
                      disabled={isBusy}
                      aria-label={t('attachments.download')}
                      title={t('attachments.download')}
                    >
                      <Download size={14} />
                    </button>
                    {!isReadOnly && (
                      <button
                        type="button"
                        className="attachment-delete"
                        onClick={() => handleDelete(attachment)}
                        disabled={isBusy}
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {!isReadOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="attachments-upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                {t('attachments.add')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AttachmentsPanel;
