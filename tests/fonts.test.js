// `book-kit fonts` (commands/fonts.py): builds the theme's fonts from pinned
// upstream files and links them into a book. These tests point it at a tiny
// variable font generated on the spot and served as a file:// source, so they
// run offline against a throwaway kit and cache.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { kitPath } from '../lib/config.js';

const SCRIPT = kitPath('commands', 'fonts.py');

const hasFontTools =
  spawnSync('python3', ['-c', 'import fontTools, brotli'], { stdio: 'ignore' }).status === 0;

// A three-glyph variable font with a wght axis (200-900, default 400).
const MAKE_FONT = `
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
fb = FontBuilder(1000, isTTF=True)
glyphs = [".notdef", "A", "B"]
fb.setupGlyphOrder(glyphs)
fb.setupCharacterMap({0x41: "A", 0x42: "B"})
def box():
    pen = TTGlyphPen(None)
    pen.moveTo((0, 0)); pen.lineTo((0, 700)); pen.lineTo((400, 700)); pen.lineTo((400, 0)); pen.closePath()
    return pen.glyph()
fb.setupGlyf({g: box() for g in glyphs})
fb.setupHorizontalMetrics({g: (500, 0) for g in glyphs})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({"familyName": "Fixture", "styleName": "Regular"})
fb.setupOS2(usWeightClass=400)
fb.setupPost()
fb.setupFvar([("wght", 200, 400, 900, "Weight")], [])
fb.setupGvar({})
fb.save(sys.argv[1])
`;

// What a built font contains, as JSON.
const INSPECT = `
import json, sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
print(json.dumps({
    "flavor": f.flavor,
    "cmap": sorted(f.getBestCmap()),
    "family": f["name"].getDebugName(1),
    "variable": "fvar" in f,
    "weight": f["OS/2"].usWeightClass,
}))
`;

let work;
let source; // { url, sha256 } for the fixture font

// A throwaway kit: toolchain.json pinning the fixture, and a recipe that
// subsets it (renaming the family) and instances it at wght 700.
function makeKit(dir, pin = source) {
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  writeFileSync(join(dir, 'toolchain.json'), JSON.stringify({ fonts: { fixture: pin } }));
  writeFileSync(
    join(dir, 'fonts', 'recipe.json'),
    JSON.stringify({
      unicodes: { a: 'U+0041' },
      features: { a: ['kern'] },
      subsets: [{ out: 'Fixture-Variable.woff2', source: 'fixture', unicodes: 'a', features: 'a', names: { 1: 'Fixture Renamed' } }],
      instances: [{ out: 'kindle/Fixture-Bold.woff2', from: 'Fixture-Variable.woff2', axes: { wght: 700 } }],
    })
  );
  return dir;
}

function fonts(args, { kit, cache, cwd = work }) {
  return spawnSync('python3', [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, BOOK_KIT_ROOT: kit, BOOK_KIT_CACHE: cache },
  });
}

const inspect = (path) => JSON.parse(execFileSync('python3', ['-c', INSPECT, path], { encoding: 'utf8' }));

beforeAll(() => {
  if (!hasFontTools) return;
  work = mkdtempSync(join(tmpdir(), 'bk-fonts-'));
  const font = join(work, 'Fixture[wght].ttf');
  execFileSync('python3', ['-c', MAKE_FONT, font]);
  source = { url: pathToFileURL(font).href, sha256: createHash('sha256').update(readFileSync(font)).digest('hex') };
});

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

describe.skipIf(!hasFontTools)('book-kit fonts (needs fontTools: pip install -r requirements.txt)', () => {
  it('builds the recipe: subset, renamed, and a static instance', () => {
    const kit = makeKit(join(work, 'kit-build'));
    const r = fonts([], { kit, cache: join(work, 'cache-build') });
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.trim();
    expect(existsSync(join(out, '.complete'))).toBe(true);

    expect(inspect(join(out, 'Fixture-Variable.woff2'))).toEqual({
      flavor: 'woff2',
      cmap: [0x41], // B is outside the subset
      family: 'Fixture Renamed',
      variable: true,
      weight: 400,
    });
    expect(inspect(join(out, 'kindle', 'Fixture-Bold.woff2'))).toMatchObject({ variable: false, weight: 700 });
  });

  it('reuses the cache on the next run', () => {
    const kit = makeKit(join(work, 'kit-cache'));
    const cache = join(work, 'cache-reuse');
    const first = fonts([], { kit, cache });
    const built = statSync(join(first.stdout.trim(), '.complete')).mtimeMs;
    const second = fonts([], { kit, cache });
    expect(second.status).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(second.stderr).not.toMatch(/built|downloading/);
    expect(statSync(join(second.stdout.trim(), '.complete')).mtimeMs).toBe(built);
  });

  it('builds byte-identical fonts from the same inputs', () => {
    const kit = makeKit(join(work, 'kit-repro'));
    const a = fonts([], { kit, cache: join(work, 'cache-a') }).stdout.trim();
    const b = fonts([], { kit, cache: join(work, 'cache-b') }).stdout.trim();
    for (const f of ['Fixture-Variable.woff2', join('kindle', 'Fixture-Bold.woff2')]) {
      expect(readFileSync(join(a, f)).equals(readFileSync(join(b, f))), f).toBe(true);
    }
  });

  it('refuses a download whose SHA-256 does not match its pin', () => {
    const kit = makeKit(join(work, 'kit-badsum'), { ...source, sha256: '0'.repeat(64) });
    const cache = join(work, 'cache-badsum');
    const r = fonts([], { kit, cache });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/SHA-256/);
    const built = existsSync(join(cache, 'fonts')) ? readdirSync(join(cache, 'fonts')) : [];
    expect(built).toEqual([]); // no partial or "complete" font set left behind
  });

  it('rejects unknown arguments', () => {
    const r = fonts(['--nope'], { kit: makeKit(join(work, 'kit-usage')), cache: join(work, 'cache-usage') });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/usage: book-kit fonts/);
  });

  describe('--link', () => {
    let kit;
    let cache;
    let built;
    beforeAll(() => {
      kit = makeKit(join(work, 'kit-link'));
      cache = join(work, 'cache-link');
      built = fonts([], { kit, cache }).stdout.trim();
    });

    function book(name) {
      const dir = join(work, 'books', name);
      mkdirSync(dir, { recursive: true });
      return dir;
    }

    it('links a book with no fonts directory', () => {
      const dir = book('fresh');
      const r = fonts(['--link', 'fonts'], { kit, cache, cwd: dir });
      expect(r.status, r.stderr).toBe(0);
      expect(readlinkSync(join(dir, 'fonts'))).toBe(built);
      expect(r.stderr).toMatch(/linked fonts/);
    });

    it('stays quiet when the link is already current', () => {
      const dir = book('current');
      symlinkSync(built, join(dir, 'fonts'));
      const r = fonts(['--link', 'fonts'], { kit, cache, cwd: dir });
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
    });

    it('re-points a link into an older cache entry', () => {
      const dir = book('stale-cache');
      const old = join(cache, 'fonts', 'oldkey');
      mkdirSync(old, { recursive: true });
      symlinkSync(old, join(dir, 'fonts'));
      fonts(['--link', 'fonts'], { kit, cache, cwd: dir });
      expect(readlinkSync(join(dir, 'fonts'))).toBe(built);
    });

    it("re-points a link to the kit's own fonts/ (where fonts used to be bundled)", () => {
      const dir = book('old-kit');
      symlinkSync(join(kit, 'fonts'), join(dir, 'fonts'));
      fonts(['--link', 'fonts'], { kit, cache, cwd: dir });
      expect(readlinkSync(join(dir, 'fonts'))).toBe(built);
    });

    it("leaves the book's own fonts directory alone, without building", () => {
      const dir = book('own-dir');
      mkdirSync(join(dir, 'fonts'));
      writeFileSync(join(dir, 'fonts', 'Mine.woff2'), 'mine');
      const fresh = join(work, 'cache-untouched');
      const r = fonts(['--link', 'fonts'], { kit, cache: fresh, cwd: dir });
      expect(r.status).toBe(0);
      expect(lstatSync(join(dir, 'fonts')).isDirectory()).toBe(true);
      expect(readFileSync(join(dir, 'fonts', 'Mine.woff2'), 'utf8')).toBe('mine');
      expect(existsSync(fresh)).toBe(false);
    });

    it("leaves a symlink the book made itself alone", () => {
      const dir = book('own-link');
      const mine = join(work, 'my-fonts');
      mkdirSync(mine, { recursive: true });
      symlinkSync(mine, join(dir, 'fonts'));
      fonts(['--link', 'fonts'], { kit, cache, cwd: dir });
      expect(readlinkSync(join(dir, 'fonts'))).toBe(mine);
    });
  });
});
