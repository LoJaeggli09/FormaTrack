// Stile condiviso dei grafici: spigoli vivi, nessuna ombra, nessuna griglia di fondo.
// I colori sono variabili CSS, quindi seguono automaticamente il tema chiaro/scuro.

export const TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg)',
  border: '1px solid var(--line-2)',
  borderRadius: 0,
  boxShadow: 'none',
  color: 'var(--ink)',
  fontSize: 13,
};

export const TOOLTIP_CURSOR = { fill: 'var(--fill)' };

export const AXIS_TICK = { fill: 'var(--ink-3)', fontSize: 12 };

/** Linea di base degli assi: un filetto da 1 px. */
export const BASELINE = { stroke: 'var(--line-2)', strokeWidth: 1 };

/** Traccia dietro alle barre orizzontali. */
export const BAR_TRACK = { fill: 'var(--fill)', stroke: 'var(--line)' };

export const LABEL_STYLE = { fill: 'var(--ink)', fontSize: 12, fontWeight: 700 };
