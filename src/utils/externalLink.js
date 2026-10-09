/**
 * Gestione dei link esterni.
 *
 * In Electron l'apertura passa dal main process (shell.openExternal), così la
 * pagina si apre nel browser di sistema invece che dentro una finestra dell'app.
 * Nel browser (dev con react-scripts) si usa il normale window.open.
 */

/** URL del sito ufficiale, usato anche dal menu nativo “Supporto” in main.js. */
export const FORMATRACK_URL = 'https://formatrack.ch';

/** Etichetta leggibile del sito, senza schema (es. "formatrack.ch"). */
export const FORMATRACK_LABEL = FORMATRACK_URL.replace(/^https?:\/\//, '');

/**
 * Apre un URL esterno nel browser di sistema.
 * @param {string} url
 */
export const openExternalLink = (url = FORMATRACK_URL) => {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Handler per gli <a>: evita che Electron navighi via dall'app e delega
 * l'apertura a openExternalLink. L'href resta valorizzato per accessibilità
 * e per il menu contestuale "copia indirizzo".
 * @param {string} url
 * @returns {(event: React.MouseEvent) => void}
 */
export const handleExternalClick = (url = FORMATRACK_URL) => (event) => {
  event.preventDefault();
  openExternalLink(url);
};
