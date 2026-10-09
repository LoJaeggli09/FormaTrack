import fs from 'fs';
import path from 'path';
import { LIGHT } from '../tokens';

const css = fs.readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8');

const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** Variabili dichiarate nel primo blocco che inizia con `selector`. */
const varsOf = (selector) => {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Selettore non trovato in tokens.css: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const vars = {};
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[match[1]] = normalize(match[2]);
  }
  return vars;
};

describe('token di design', () => {
  test('i valori in tokens.js coincidono con le variabili CSS', () => {
    const cssVars = varsOf(':root {');
    Object.entries(LIGHT).forEach(([key, value]) => {
      expect({ key, value: cssVars[key] }).toEqual({ key, value: normalize(value) });
    });
  });

  test('il raggio dei bordi è sempre zero', () => {
    expect(varsOf(':root {').radius).toBe('0');
  });

  test('non esiste un tema scuro', () => {
    expect(css).not.toMatch(/data-theme|dark-mode/);
  });
});
