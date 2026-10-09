const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const { ipcMain, Notification, dialog, shell, Menu } = electron;
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ─── Sito ufficiale / supporto ───────────────────────────────────────────────
const SUPPORT_URL = 'https://formatrack.ch';
// Solo questi host possono essere aperti nel browser esterno: qualsiasi altro
// URL (link malevolo iniettato nella UI, redirect inatteso) viene bloccato.
const ALLOWED_EXTERNAL_HOSTS = ['formatrack.ch', 'www.formatrack.ch'];

// In produzione (exe) app.isPackaged è true; in dev è false
const isDev = !app.isPackaged && !process.argv.includes('--production');

// Necessario su Windows per far apparire l'app in primo piano (non come processo in background)
app.setAppUserModelId('com.monitorformazione.app');

// ─── Configurazione Logging ──────────────────────────────────────────────────
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'info';
log.info('Applicazione avviata — versione:', app.getVersion());

let mainWindow;

// ─── Utility: invia stato update al renderer ─────────────────────────────────
function sendUpdateStatus(event, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { event, ...data });
  }
}

// ─── Utility: invia un comando del menu nativo al renderer ───────────────────
function sendMenuCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-command', command);
  }
}

// ─── Apertura link esterni nel browser di sistema ────────────────────────────
/**
 * Apre un URL https nel browser predefinito, previa validazione dell'allowlist.
 * @param {string} rawUrl
 * @returns {boolean} true se l'URL è stato aperto
 */
function openExternalUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? ''));
  } catch (err) {
    log.warn('[External] URL non valido, apertura annullata:', rawUrl);
    return false;
  }

  if (parsed.protocol !== 'https:') {
    log.warn('[External] Protocollo non consentito, apertura annullata:', parsed.protocol);
    return false;
  }
  if (!ALLOWED_EXTERNAL_HOSTS.includes(parsed.hostname)) {
    log.warn('[External] Host non consentito, apertura annullata:', parsed.hostname);
    return false;
  }

  log.info('[External] Apertura nel browser di sistema:', parsed.toString());
  shell.openExternal(parsed.toString());
  return true;
}

// ─── Menu nativo dell'applicazione (con la voce “Supporto”) ──────────────────
function showAboutDialog() {
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: 'Informazioni su FormaTrack',
      message: 'FormaTrack',
      detail: [
        `Versione ${app.getVersion()}`,
        `Electron ${process.versions.electron} — Chromium ${process.versions.chrome}`,
        '',
        `Sito web: ${SUPPORT_URL}`,
      ].join('\n'),
      buttons: ['Apri il sito', 'Chiudi'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 0) openExternalUrl(SUPPORT_URL);
    })
    .catch((err) => log.error('[Menu] Errore dialog informazioni:', err));
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Supporto',
      role: 'help',
      submenu: [
        {
          label: 'Sito web FormaTrack (formatrack.ch)',
          click: () => openExternalUrl(SUPPORT_URL),
        },
        { type: 'separator' },
        {
          label: 'Controlla aggiornamenti…',
          click: () => {
            sendMenuCommand('open-settings');
            if (isDev) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Aggiornamenti',
                message: 'Auto-update non disponibile in modalità sviluppo.',
                buttons: ['OK'],
              });
              return;
            }
            autoUpdater.checkForUpdates().catch((err) => {
              log.warn('[AutoUpdater] Controllo dal menu fallito:', err.message);
            });
          },
        },
        {
          label: 'Apri la cartella dei log',
          click: () => {
            const logPath = log.transports.file.getFile().path;
            shell.showItemInFolder(logPath);
          },
        },
        { type: 'separator' },
        {
          label: 'Informazioni su FormaTrack',
          click: showAboutDialog,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC: apri un link esterno su richiesta del renderer ─────────────────────
ipcMain.handle('open-external', (_event, url) => openExternalUrl(url));

// ─── IPC: URL del sito/supporto, così il renderer non lo duplica ─────────────
ipcMain.handle('get-support-url', () => SUPPORT_URL);

// ─── IPC: salvataggio di un file esportato (PDF / Excel) ─────────────────────
const SAVE_FILTERS = {
  '.pdf': { name: 'Documento PDF', extensions: ['pdf'] },
  '.xlsx': { name: 'Cartella di lavoro Excel', extensions: ['xlsx'] },
};

/**
 * Mostra la finestra di salvataggio nativa e scrive il file su disco.
 * Nel renderer il download via <a download> è bloccato dalla sandbox di
 * Electron, quindi l'esportazione passa sempre da qui.
 */
ipcMain.handle('save-file', async (_event, { defaultName, data }) => {
  try {
    const extension = path.extname(defaultName || '').toLowerCase();
    const filter = SAVE_FILTERS[extension];

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva esportazione',
      defaultPath: path.join(app.getPath('documents'), defaultName || 'export'),
      filters: filter ? [filter, { name: 'Tutti i file', extensions: ['*'] }] : undefined,
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    await fs.promises.writeFile(filePath, Buffer.from(data));
    log.info('[Export] File salvato:', filePath);
    return { success: true, filePath };
  } catch (err) {
    log.error('[Export] Salvataggio fallito:', err);
    return { success: false, error: err.message || 'Impossibile salvare il file.' };
  }
});

// ─── IPC: apri un file già salvato (es. dopo un'esportazione) ────────────────
ipcMain.handle('open-path', async (_event, filePath) => {
  const error = await shell.openPath(filePath);
  if (error) {
    log.warn('[Export] Apertura file fallita:', error);
    return { success: false, error };
  }
  return { success: true };
});

// ─── Configurazione AutoUpdater ──────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  // Checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('[AutoUpdater] Controllo aggiornamenti in corso...');
    sendUpdateStatus('checking-for-update', {});
  });

  // Update disponibile — il download parte automaticamente
  autoUpdater.on('update-available', (info) => {
    log.info('[AutoUpdater] Aggiornamento disponibile:', info.version);
    sendUpdateStatus('update-available', { version: info.version, releaseNotes: info.releaseNotes || null });

    // Notifica desktop nativa
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'Aggiornamento disponibile',
        body: `Versione ${info.version} in download automatico...`,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
      });
      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
      notif.show();
    }
  });

  // Nessun aggiornamento disponibile
  autoUpdater.on('update-not-available', (info) => {
    log.info('[AutoUpdater] Applicazione aggiornata — versione corrente:', info.version);
    sendUpdateStatus('update-not-available', { version: info.version });
  });

  // Progresso download
  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    const speedKB = Math.round(progressObj.bytesPerSecond / 1024);
    log.info(`[AutoUpdater] Download: ${percent}% — ${speedKB} KB/s`);
    sendUpdateStatus('download-progress', {
      percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond,
    });
  });

  // Update scaricato e pronto per l'installazione
  autoUpdater.on('update-downloaded', (info) => {
    log.info('[AutoUpdater] Aggiornamento scaricato — versione:', info.version);
    sendUpdateStatus('update-downloaded', { version: info.version });

    // Notifica desktop nativa
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'Aggiornamento pronto',
        body: `Versione ${info.version} pronta. Vai in Impostazioni per installare e riavviare.`,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
      });
      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
      notif.show();
    }
  });

  // Errore durante il controllo o il download
  autoUpdater.on('error', (err) => {
    const message = err.message || 'Errore sconosciuto durante l\'aggiornamento';
    log.error('[AutoUpdater] Errore:', err);
    sendUpdateStatus('error', { message });
  });
}

// ─── IPC: Controlla aggiornamenti manualmente ────────────────────────────────
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { success: false, error: 'Auto-update non disponibile in modalità sviluppo.' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result ? result.updateInfo : null };
  } catch (err) {
    log.error('[AutoUpdater] Errore controllo manuale:', err);
    return { success: false, error: err.message || 'Impossibile contattare il server di aggiornamento.' };
  }
});

// ─── IPC: Scarica aggiornamento manualmente (nel caso autoDownload = false) ──
ipcMain.handle('download-update', async () => {
  if (isDev) {
    return { success: false, error: 'Auto-update non disponibile in modalità sviluppo.' };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    log.error('[AutoUpdater] Errore download manuale:', err);
    return { success: false, error: err.message || 'Errore durante il download dell\'aggiornamento.' };
  }
});

// ─── IPC: Installa aggiornamento e riavvia l'app ─────────────────────────────
ipcMain.on('install-update', () => {
  log.info('[AutoUpdater] Installazione aggiornamento e riavvio...');
  // isSilent=false mostra UI installer, isForceRunAfter=true forza riavvio dopo install
  autoUpdater.quitAndInstall(false, true);
});

// ─── IPC: Bridge log dal renderer verso electron-log ────────────────────────
ipcMain.on('renderer-log', (event, { level, tag, message, detail }) => {
  const text = `[Renderer][${tag}] ${message}${detail ? ' — ' + detail : ''}`;
  if (level === 'error') log.error(text);
  else if (level === 'warn') log.warn(text);
  else log.info(text);
});

// ─── IPC: Versione corrente dell'app ─────────────────────────────────────────
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3003'
    : path.join(app.getAppPath(), 'build/index.html');

  if (isDev) {
    mainWindow.loadURL(startUrl);
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'build/index.html'));
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // I link con target="_blank" non devono aprire una finestra Electron:
  // vengono deviati al browser di sistema (se l'host è consentito).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  // Blocca la navigazione fuori dall'app: l'URL esterno viene aperto nel browser
  // e la finestra resta sulla schermata corrente.
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const isInternal = targetUrl.startsWith('file://') || targetUrl.startsWith('http://localhost:3003');
    if (isInternal) return;
    event.preventDefault();
    openExternalUrl(targetUrl);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const { protocol } = require('electron');

// Registra protocollo personalizzato per le risorse locali (rimosso per problemi di sicurezza)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

app.on('ready', () => {
  buildAppMenu();
  createWindow();
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }

  // Avvia autoUpdater solo in produzione (app pacchettizzata)
  if (!isDev) {
    setupAutoUpdater();
    // Controlla aggiornamenti 8 secondi dopo l'avvio per dare tempo alla finestra di caricarsi
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.warn('[AutoUpdater] Controllo automatico all\'avvio fallito:', err.message);
      });
    }, 8000);
  } else {
    log.info('[AutoUpdater] Modalità sviluppo — auto-update disabilitato.');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ─── IPC: Notifiche push desktop ─────────────────────────────────────────────
ipcMain.on('show-notification', (_event, { title, body }) => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: title || 'FormaTrack',
    body: body || '',
    ...(process.platform === 'win32' && { icon: path.join(__dirname, 'assets', 'icon.ico') }),
  });
  notif.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  notif.show();
});
