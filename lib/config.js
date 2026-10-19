// Config loader shared by every book-kit command.
//
// Two roots matter, and conflating them is the classic bug when scripts move
// into a package:
//   KIT_ROOT  - this package (filters, templates, theme, fonts, defaults)
//   BOOK_ROOT - the book being built (src/, dist/, index.yml, book.config.yml)
//
// BOOK_ROOT is $BOOK_ROOT when set, otherwise the nearest directory at or
// above the working directory that contains book.config.yml.

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

export const CONFIG_FILENAME = 'book.config.yml';
export const PRESET_FILENAME = 'preset.yml';
export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function kitPath(...parts) {
  return join(KIT_ROOT, ...parts);
}

export function findBookRoot(start = process.cwd()) {
  if (process.env.BOOK_ROOT) return resolve(process.env.BOOK_ROOT);
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILENAME))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `No ${CONFIG_FILENAME} found in ${start} or any parent directory. ` +
          `Run book-kit from inside a book, or set BOOK_ROOT.`,
      );
    }
    dir = parent;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Maps merge recursively; lists and scalars from `override` replace `base`.
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

function readYaml(path) {
  return yaml.load(readFileSync(path, 'utf8')) ?? {};
}

// Derived defaults that point at other keys.
function applyDerivedDefaults(config) {
  config.llm.title ||= config.metadata.title;
  if (config.accessibility.conforms_to) config.accessibility.certified_by ||= config.metadata.publisher;
  config.print.pdfx_title ||= config.metadata.title;
  return config;
}

// A preset is a directory holding a preset.yml: config that sits between the
// kit defaults and the book, so one house style can be shared by many books.
// A book names presets in `extends`; presets can extend other presets.
//
// An `extends` entry is a path (relative to the file that names it), a kit
// preset (presets/<name>/), or an npm package with a preset.yml at its root,
// found in node_modules at or above the book.
export function kitPresets() {
  const dir = kitPath('presets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => existsSync(join(dir, name, PRESET_FILENAME))).sort();
}

export function resolvePreset(spec, fromDir, bookRoot) {
  if (typeof spec !== 'string' || spec === '') {
    throw new Error(`extends entries must be preset names or paths, got ${JSON.stringify(spec)}`);
  }
  if (spec.startsWith('.') || isAbsolute(spec)) {
    const dir = resolve(fromDir, spec);
    if (existsSync(join(dir, PRESET_FILENAME))) return dir;
    throw new Error(`Preset "${spec}" in extends has no ${PRESET_FILENAME} (looked in ${dir})`);
  }
  const kit = kitPath('presets', spec);
  if (existsSync(join(kit, PRESET_FILENAME))) return kit;
  for (let dir = bookRoot; ; dir = dirname(dir)) {
    const pkg = join(dir, 'node_modules', spec);
    if (existsSync(join(pkg, PRESET_FILENAME))) return pkg;
    if (dirname(dir) === dir) break;
  }
  throw new Error(
    `Unknown preset "${spec}" in extends. Kit presets: ${kitPresets().join(', ') || 'none'}. ` +
      `Otherwise use a path (./my-preset) or install an npm package with a ${PRESET_FILENAME}.`,
  );
}

// The presets `specs` names, parents first. Each is applied once, the first
// time it's reached, so a preset shared by two others can't re-override them.
function presetLayers(specs, fromDir, bookRoot, chain = [], applied = new Set()) {
  const layers = [];
  for (const spec of [].concat(specs ?? [])) {
    const dir = resolvePreset(spec, fromDir, bookRoot);
    if (chain.includes(dir)) {
      throw new Error(`Preset cycle in extends: ${[...chain, dir].join(' -> ')}`);
    }
    if (applied.has(dir)) continue;
    const { extends: parents, ...data } = readYaml(join(dir, PRESET_FILENAME));
    layers.push(...presetLayers(parents, dir, bookRoot, [...chain, dir], applied));
    applied.add(dir);
    layers.push({ source: `preset ${spec}`, name: spec, dir, data });
  }
  return layers;
}

// Every layer of a book's config, lowest first: kit defaults, presets, book.
function configLayers(bookRoot) {
  const { extends: specs, ...own } = readYaml(join(bookRoot, CONFIG_FILENAME));
  return [
    { source: 'kit defaults', data: readYaml(kitPath('defaults', CONFIG_FILENAME)) },
    ...presetLayers(specs, bookRoot, bookRoot),
    { source: CONFIG_FILENAME, data: own },
  ];
}

const cache = new Map();

export function loadConfig({ root, fresh = false } = {}) {
  const bookRoot = root ? resolve(root) : findBookRoot();
  if (!fresh && cache.has(bookRoot)) return cache.get(bookRoot);

  const layers = configLayers(bookRoot);
  const config = layers.reduce((merged, layer) => deepMerge(merged, layer.data), {});

  applyDerivedDefaults(config);

  Object.defineProperty(config, 'root', { value: bookRoot, enumerable: false });
  // The presets in effect, in merge order, so commands can find their files.
  const presets = layers.filter((l) => l.dir).map(({ name, dir }) => ({ name, dir }));
  Object.defineProperty(config, 'presets', { value: presets, enumerable: false });
  cache.set(bookRoot, config);
  return config;
}

// Which layer set each key: { 'metadata.title': 'book.config.yml', ... }.
// A list is one value, since a later layer replaces it wholesale. Keys filled
// in by derived defaults (e.g. print.pdfx_title) report the layer that set
// them explicitly.
export function configSources({ root } = {}) {
  const bookRoot = root ? resolve(root) : findBookRoot();
  const sources = {};
  const walk = (node, prefix, source) => {
    for (const [key, value] of Object.entries(node)) {
      const dotted = prefix ? `${prefix}.${key}` : key;
      if (isPlainObject(value) && Object.keys(value).length > 0) walk(value, dotted, source);
      else sources[dotted] = source;
    }
  };
  for (const layer of configLayers(bookRoot)) walk(layer.data, '', layer.source);
  return sources;
}

// loadConfig(), or the kit defaults when there's no book (e.g. unit tests that
// import a command module). Never use this for a build: it hides a missing
// book.config.yml.
export function loadConfigOrDefaults() {
  try {
    return loadConfig();
  } catch (error) {
    if (!String(error.message).includes(CONFIG_FILENAME)) throw error;
    const config = readYaml(kitPath('defaults', CONFIG_FILENAME));
    return applyDerivedDefaults(config);
  }
}

// Absolute path inside the book. bookPath('src', 'intro.md'), or a configured
// path key: bookPath(config.paths.dist).
export function bookPath(...parts) {
  return join(loadConfig().root, ...parts);
}

// Resolve a configured path key (e.g. 'dist', 'src', 'index') to an absolute path.
export function pathFor(key, config = loadConfig()) {
  const rel = config.paths[key];
  if (rel === undefined) throw new Error(`Unknown paths.${key} in ${CONFIG_FILENAME}`);
  return join(config.root, rel);
}

// dist/<basename><suffix>, e.g. outputFile('.epub') or outputFile('-kindle.epub').
export function outputFile(suffix, config = loadConfig()) {
  return join(pathFor('dist', config), `${config.output.basename}${suffix}`);
}

// Dotted lookup for the CLI: get('output.basename').
export function get(config, dotted) {
  return dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), config);
}

// Lua filters can't parse YAML, so the build writes the resolved config as JSON
// and points filters at it with $BOOK_KIT_CONFIG.
export function writeConfigJson(config = loadConfig()) {
  const out = join(pathFor('dist', config), '.book-kit', 'config.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
  return out;
}
