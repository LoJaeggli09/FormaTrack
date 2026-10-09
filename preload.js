const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Mostra una notifica push desktop nativa via Electron.
   * @param {string} title  - Titolo della notifica
   * @param {string} body   - Testo del corpo
   */
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body });
  },

  /**
   * Invia un messaggio di log al main process (electron-log).
   * Usato da src/utils/logger.js per persistere i log su file.
   * @param {'error'|'warn'|'info'} level
   * @param {{ tag: string, message: string, detail: string }} payload
   */
  log: (level, payload) => {
    ipcRenderer.send('renderer-log', { level, ...payload });
  },

  /**
   * Apre un URL esterno nel browser di sistema (non in una finestra Electron).
   * Il main process valida protocollo e host prima di aprire.
   * @param {string} url
   * @returns {Promise<boolean>} true se l'URL è stato aperto
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /**
   * Restituisce l'URL del sito ufficiale / supporto configurato nel main process.
   * @returns {Promise<string>}
   */
  getSupportUrl: () => ipcRenderer.invoke('get-support-url'),

  /**
   * Salva un file generato dall'app (PDF / Excel) mostrando la finestra di
   * salvataggio nativa di Windows.
   * @param {string} defaultName - Nome proposto, estensione inclusa
   * @param {Uint8Array} data    - Contenuto binario del file
   * @returns {Promise<{ success: boolean, filePath?: string, canceled?: boolean, error?: string }>}
   */
  saveFile: (defaultName, data) => ipcRenderer.invoke('save-file', { defaultName, data }),

  /**
   * Apre un file salvato con l'applicazione predefinita di sistema.
   * @param {string} filePath
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),

  /**
   * Registra un callback per i comandi provenienti dal menu nativo
   * (es. 'open-settings' dalla voce “Supporto → Controlla aggiornamenti”).
   * @param {function} callback - Riceve la stringa del comando
   * @returns {function} cleanup
   */
  onMenuCommand: (callback) => {
    const handler = (_event, command) => callback(command);
    ipcRenderer.on('menu-command', handler);
    return () => ipcRenderer.removeListener('menu-command', handler);
  },

  /**
   * API Auto-Update — comunicazione con il main process per la gestione degli aggiornamenti.
   */
  updater: {
    /**
     * Controlla manualmente se sono disponibili aggiornamenti su GitHub Releases.
     * @returns {Promise<{ success: boolean, updateInfo: object|null, error: string|undefined }>}
     */
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

    /**
     * Avvia il download manuale dell'aggiornamento (usato solo se autoDownload = false).
     * @returns {Promise<{ success: boolean, error: string|undefined }>}
     */
    downloadUpdate: () => ipcRenderer.invoke('download-update'),

    /**
     * Installa l'aggiornamento scaricato e riavvia l'applicazione.
     */
    installUpdate: () => ipcRenderer.send('install-update'),

    /**
     * Restituisce la versione corrente dell'applicazione.
     * @returns {Promise<string>}
     */
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    /**
     * Registra un callback che riceve gli aggiornamenti di stato del processo di update.
     * Restituisce una funzione di cleanup per rimuovere il listener.
     * @param {function} callback - Riceve { event, version?, percent?, message?, ... }
     * @returns {function} cleanup
     */
    onUpdateStatus: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('update-status', handler);
      return () => ipcRenderer.removeListener('update-status', handler);
    },
  },
});

