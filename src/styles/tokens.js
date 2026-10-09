/**
 * Design token di FormaTrack — valori usati dal tema MUI (src/theme.js).
 *
 * Le stesse chiavi esistono come variabili CSS in src/styles/tokens.css (`--ink`, `--blue`, …),
 * che è la fonte per tutto il CSS dell'app. Un test (src/styles/__tests__/tokens.test.js)
 * verifica che le due definizioni non divergano: per cambiare un colore si cambiano entrambe
 * e il test segnala se ci si dimentica di una.
 */

export const LIGHT = {
  // Neutri
  bg: '#ffffff',
  ink: '#0f1f3d',
  'ink-2': '#37465e',
  'ink-3': '#586880',
  line: '#d6dde8',
  'line-2': '#b4c0d2',
  fill: '#f5f7fa',
  mute: '#9aa7ba',
  // Blu del prodotto
  blue: '#1565c0',
  'blue-d': '#0d47a1',
  'blue-t': '#e8f1fb',
  'blue-l': '#5b97d6',
  'on-blue': '#ffffff',
  // Stato / categoria
  ev: '#16a34a',
  'ev-t': '#e6f6ec',
  act: '#eab308',
  'act-t': '#fdf6d8',
  book: '#f97316',
  'book-t': '#fee9d9',
  abs: '#dc2626',
  'abs-t': '#fde4e4',
  err: '#d32f2f',
  'st-ok': '#166534',
  'st-sent': '#92600a',
  'st-draft': '#586880',
  // Velo dietro alle finestre modali: chiaro, piatto
  scrim: 'rgba(255, 255, 255, 0.78)',
};

export const FONT_DISPLAY = '"Manrope", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
export const FONT_TEXT = '"Source Sans 3", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
