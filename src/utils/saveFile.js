/**
 * Salvataggio di un file generato dall'app.
 *
 * Nel renderer di Electron i download avviati dalla pagina sono bloccati dalla
 * sandbox: il file passa dal main process, che apre la finestra di salvataggio
 * nativa. Nel browser (sviluppo con react-scripts) si usa il download via Blob.
 */

/** Rende un nome file sicuro su Windows. */
export const safeFileName = (value) =>
  String(value || 'export')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);

/**
 * @param {string} filename
 * @param {ArrayBuffer|Uint8Array} content
 * @param {string} mimeType
 * @returns {Promise<{ success: boolean, canceled?: boolean, filePath?: string, error?: string }>}
 */
export const saveBinaryFile = async (filename, content, mimeType) => {
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);

  if (window.electronAPI?.saveFile) {
    return window.electronAPI.saveFile(filename, bytes);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { success: true };
};

/** Come saveBinaryFile, ma partendo da una stringa di testo (CSV, ICS, ...). */
export const saveTextFile = (filename, text, mimeType) =>
  saveBinaryFile(filename, new TextEncoder().encode(text), mimeType);
