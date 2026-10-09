/**
 * Centralized logger for the renderer process.
 * - Writes to browser console (captured by DevTools)
 * - Forwards to the main process via IPC so electron-log persists messages to file
 */

const sendToMain = (level, tag, message, detail) => {
  try {
    window.electronAPI?.log?.(level, { tag, message, detail });
  } catch (_) {}
};

/** Log an error. Always call this instead of console.error directly. */
export const logError = (tag, message, error) => {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  console.error(`[${tag}] ${message}`, error || '');
  sendToMain('error', tag, message, detail);
};

/** Log a warning (non-critical, graceful fallback). */
export const logWarn = (tag, message, data) => {
  console.warn(`[${tag}] ${message}`, data || '');
  sendToMain('warn', tag, message, data instanceof Error ? data.message : String(data ?? ''));
};

/** Log an informational message. */
export const logInfo = (tag, message) => {
  console.info(`[${tag}] ${message}`);
  sendToMain('info', tag, message, '');
};

/**
 * Dispatch a user-visible toast. Listened by App.js via CustomEvent.
 * @param {'error'|'warning'|'success'|'info'} severity
 */
const dispatchToast = (message, severity) => {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, severity } }));
};

export const notifyError   = (message) => dispatchToast(message, 'error');
export const notifyWarning = (message) => dispatchToast(message, 'warning');
export const notifySuccess = (message) => dispatchToast(message, 'success');
