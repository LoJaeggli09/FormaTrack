/**
 * Guardia del linguaggio visivo: l'app non deve avere ombre, gradienti, angoli
 * arrotondati, animazioni o colori scritti a mano fuori dai token.
 * Se un test fallisce, la regola violata è nel messaggio: usare i token di
 * src/styles/tokens.css invece di aggirare il test.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');

const read = (relative) => fs.readFileSync(path.join(SRC, relative), 'utf8');
const stripCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJsComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Tutti i .js dell'interfaccia (esclusi test, dati, utilità di esportazione e traduzioni). */
const uiFiles = (dir = SRC) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['__tests__', 'data', 'utils', 'hooks'].includes(entry.name)) return [];
      return uiFiles(full);
    }
    if (!entry.name.endsWith('.js') || entry.name === 'i18n.js' || entry.name === 'appVersion.js') return [];
    return [full];
  });

const cssFiles = {
  'App.css': stripCssComments(read('App.css')),
  'styles/controls.css': stripCssComments(read('styles/controls.css')),
  'styles/tokens.css': stripCssComments(read('styles/tokens.css')),
};

/** Occorrenze testuali di un'espressione regolare. */
const hits = (text, regex) => [...text.matchAll(regex)].map((match) => match[0].trim());

/** Valori dichiarati per le proprietà CSS che corrispondono a `propRegex`, come "proprietà: valore". */
const cssDeclarations = (css, propRegex) =>
  [...css.matchAll(new RegExp(`(${propRegex.source})\\s*:\\s*([^;}]+)`, 'g'))]
    .map((match) => ({ prop: match[1], value: match[match.length - 1].replace(/\s*!important\s*$/, '').trim() }));

const asText = ({ prop, value }) => `${prop}: ${value}`;

describe('CSS', () => {
  Object.entries(cssFiles).forEach(([name, css]) => {
    test(`${name}: nessuna ombra`, () => {
      const shadows = cssDeclarations(css, /(?:box|text)-shadow/).filter((d) => d.value !== 'none');
      expect(shadows.map(asText)).toEqual([]);
      expect(hits(css, /drop-shadow\(/g)).toEqual([]);
    });

    test(`${name}: nessun gradiente, sfocatura o vetro`, () => {
      expect(hits(css, /(?:linear|radial|conic)-gradient\(/g)).toEqual([]);
      expect(hits(css, /blur\(/g)).toEqual([]);
      expect(hits(css, /backdrop-filter/g)).toEqual([]);
    });

    test(`${name}: spigoli sempre vivi`, () => {
      const radii = cssDeclarations(css, /border(?:-[a-z]+){0,2}-radius/)
        .filter((d) => d.value !== '0' && d.value !== 'var(--radius)');
      expect(radii.map(asText)).toEqual([]);
    });

    test(`${name}: nessuna animazione di entrata o continua`, () => {
      expect(hits(css, /@keyframes\s+[\w-]+/g)).toEqual([]);
      const animations = cssDeclarations(css, /animation(?:-name)?/).filter((d) => d.value !== 'none');
      expect(animations.map(asText)).toEqual([]);
    });

    test(`${name}: le transizioni toccano solo colore, sfondo e bordo`, () => {
      const allowed = ['none', 'color 120ms, background-color 120ms, border-color 120ms'];
      const transitions = cssDeclarations(css, /transition/).filter((d) => !allowed.includes(d.value));
      expect(transitions.map(asText)).toEqual([]);
    });
  });

  ['App.css', 'styles/controls.css'].forEach((name) => {
    test(`${name}: i colori passano dai token`, () => {
      expect(hits(cssFiles[name], /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)).toEqual([]);
    });
  });
});

describe('componenti', () => {
  const files = uiFiles();
  const code = (file) => stripJsComments(fs.readFileSync(file, 'utf8'));
  const rel = (file) => path.relative(SRC, file).replace(/\\/g, '/');

  test('c\'è almeno un file da controllare', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test('nessuna ombra, gradiente, raggio o filtro negli stili in linea', () => {
    const found = [];
    files.forEach((file) => {
      const text = code(file);
      hits(text, /\b(?:boxShadow|textShadow)\s*:\s*[^,}\n]+/g)
        .filter((hit) => !/:\s*['"]none['"]$/.test(hit))
        .forEach((hit) => found.push(`${rel(file)}: ${hit}`));
      hits(text, /\bborderRadius\s*:\s*[^,}\n]+/g)
        .filter((hit) => !/:\s*0$/.test(hit))
        .forEach((hit) => found.push(`${rel(file)}: ${hit}`));
      hits(text, /\bbackdropFilter\b|(?:linear|radial|conic)-gradient|drop-shadow/g)
        .forEach((hit) => found.push(`${rel(file)}: ${hit}`));
    });
    expect(found).toEqual([]);
  });

  test('nessun colore scritto a mano: si usano le variabili o i token', () => {
    const found = [];
    files
      .filter((file) => rel(file) !== 'styles/tokens.js')
      .forEach((file) => {
        hits(code(file), /['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\([^)]*\)/g).forEach((hit) => found.push(`${rel(file)}: ${hit}`));
      });
    expect(found).toEqual([]);
  });

  test('nessuna libreria di animazione di entrata', () => {
    const found = files.filter((file) => /from ['"]framer-motion['"]/.test(fs.readFileSync(file, 'utf8')));
    expect(found.map(rel)).toEqual([]);
  });
});
