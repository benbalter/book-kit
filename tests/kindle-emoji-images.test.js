import { describe, it, expect } from 'vitest';

/**
 * Smoke test: validates that the Kindle emoji Lua filter produces
 * correct HTML <img> tags that would be resolved by pandoc EPUB.
 *
 * This doesn't require a full EPUB build — it runs pandoc with the
 * filter in HTML mode and checks:
 *   1. Image tags are emitted with correct src paths
 *   2. All 19 mapped emoji have corresponding image entries
 *   3. Alt text is present for accessibility
 *   4. The emoji CSS class is applied
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Every image-mapped emoji in the kit defaults and its expected codepoint
const emojiExpected = [
  { char: '👍', cp: '1f44d', alt: 'thumbs-up' },
  { char: '🎉', cp: '1f389', alt: 'party' },
  { char: '😂', cp: '1f602', alt: 'laughing' },
  { char: '👀', cp: '1f440', alt: 'eyes' },
  { char: '😄', cp: '1f604', alt: 'grin' },
  { char: '😊', cp: '1f60a', alt: 'smile' },
  { char: '😃', cp: '1f603', alt: 'smiley' },
  { char: '🤣', cp: '1f923', alt: 'rofl' },
  { char: '👏', cp: '1f44f', alt: 'clap' },
  { char: '🙏', cp: '1f64f', alt: 'folded-hands' },
  { char: '🙌', cp: '1f64c', alt: 'raised-hands' },
  { char: '🤔', cp: '1f914', alt: 'thinking' },
  { char: '😏', cp: '1f60f', alt: 'smirk' },
  { char: '🎂', cp: '1f382', alt: 'cake' },
  // Callout emoji (also used by add-div-titles.lua)
  { char: '💡', cp: '1f4a1', alt: 'light-bulb' },
  { char: '👔', cp: '1f454', alt: 'necktie' },
  { char: '💻', cp: '1f4bb', alt: 'laptop' },
];

function pandocHtml(markdown) {
  return execSync(
    'pandoc -f markdown -t html --lua-filter=filters/strip-emoji-kindle.lua --metadata kindle=true',
    { encoding: 'utf8', cwd: rootDir, input: markdown }
  ).trim();
}

describe('kindle emoji images: all 19 emoji produce correct <img> tags', () => {
  for (const { char, cp, alt } of emojiExpected) {
    it(`${char} → img/emoji-kindle/${cp}.png`, () => {
      const html = pandocHtml(char);
      expect(html.includes(`src="img/emoji-kindle/${cp}.png"`), `Missing src for ${alt}: ${html}`).toBeTruthy();
      expect(html.includes(`alt="${alt}"`), `Missing alt text for ${alt}: ${html}`).toBeTruthy();
      expect(html.includes('class="emoji"'), `Missing emoji class for ${alt}: ${html}`).toBeTruthy();
    });
  }
});

describe('kindle emoji images: inline context preserved', () => {
  it('text before and after emoji preserved', () => {
    const html = pandocHtml('Send a 👍 reaction');
    expect(html.includes('Send a'), 'text before emoji lost').toBeTruthy();
    expect(html.includes('reaction'), 'text after emoji lost').toBeTruthy();
    expect(html.includes('src="img/emoji-kindle/1f44d.png"'), 'emoji image missing').toBeTruthy();
  });

  it('multiple emoji in one paragraph', () => {
    const html = pandocHtml('Use 👍 or 🎉 reactions');
    const imgCount = (html.match(/<img[\s\n]/g) || []).length;
    expect(imgCount).toBe(2);
  });

  it('arrow emoji use text equivalents, not images', () => {
    // Arrows (↑ ←) render reliably on Kindle, so they stay as text.
    const html = pandocHtml('look 👈 here');
    expect(!html.includes('<img'), 'arrows should not produce images').toBeTruthy();
    expect(html.includes('←'), '👈 should become ←').toBeTruthy();
  });

  it('❌/✅ markers produce images (their ✗/✓ text fallbacks tofu on Kindle)', () => {
    const html = pandocHtml('❌ means no, ✅ means yes');
    expect(html.includes('src="img/emoji-kindle/274c.png"'), '❌ → 274c image').toBeTruthy();
    expect(
      html.includes('src="img/emoji-kindle/2714.png"'),
      '✅ → 2714 heavy-check image (not its own filled 2705 glyph)',
    ).toBeTruthy();
    expect(!html.includes('✗'), '❌ should not fall back to ✗ text').toBeTruthy();
  });
});

describe('kindle emoji images: transparent RGBA, white under alpha (no box on iOS, no dark box on e-ink)', () => {
  // Generate the Kindle variants from the kit's source PNGs.
  const emojiDir = fs.mkdtempSync(join(tmpdir(), 'kindle-emoji-'));
  execSync(`python3 ${join(rootDir, 'commands', 'composite-kindle-emoji.py')} ${join(rootDir, 'emoji')} ${emojiDir}`);

  if (!fs.existsSync(emojiDir)) {
    it.skip('img/emoji-kindle/ not found', () => {});
    return;
  }

  // PNG color type byte is at offset 25 in the file header.
  // Color type 2 = RGB (no alpha), 3 = palette, 6 = RGBA.
  // The earlier opaque bake (type 2, callout-tint background) hid the box on a
  // light-mode e-ink Paperwhite but showed a COLORED rectangle on Kindle iOS.
  // We now ship transparent RGBA (type 6): renderers that honor alpha get no box
  // at all; the RGB of transparent pixels is forced to white (see
  // composite-kindle-emoji.py) so a renderer that flattens alpha shows white, not
  // Twemoji's dark slate.
  for (const { cp, alt } of emojiExpected) {
    it(`${alt} (${cp}.png) is transparent RGBA`, () => {
      const pngPath = join(emojiDir, `${cp}.png`);
      const buf = fs.readFileSync(pngPath);

      const pngSig = buf.slice(0, 8);
      expect(
        pngSig.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        `${cp}.png is not a valid PNG`
      ).toBeTruthy();

      const colorType = buf[25];
      expect(colorType, `${cp}.png is color type ${colorType}; expected RGBA (6)`).toBe(6);
    });
  }
});

describe('kindle emoji images: transparent corners flatten to white (never the callout tint, never dark slate)', () => {
  const emojiDir = join(rootDir, 'img', 'emoji-kindle');

  if (!fs.existsSync(emojiDir)) {
    it.skip('img/emoji-kindle/ not found', () => {});
    return;
  }

  it('composite-kindle-emoji.py exists', () => {
    const scriptPath = join(rootDir, 'commands', 'composite-kindle-emoji.py');
    expect(fs.existsSync(scriptPath)).toBeTruthy();
  });

  it('composite script keeps alpha and whitens transparent pixels (no baked callout tint)', () => {
    const script = fs.readFileSync(join(rootDir, 'commands', 'composite-kindle-emoji.py'), 'utf8');
    // The colored-box culprit must be gone: no per-callout background bake.
    expect(
      script.includes('CALLOUT_BACKGROUNDS'),
      'should NOT bake per-callout background colors (that caused the iOS colored box)',
    ).toBe(false);
    // RGBA output (alpha preserved), transparent pixels substituted with white.
    expect(
      script.includes('Image.merge("RGBA"'),
      'should save transparent RGBA (alpha preserved)',
    ).toBeTruthy();
    expect(
      script.includes('Image.composite'),
      'should substitute white only where fully transparent',
    ).toBeTruthy();
  });

  // The four callout emoji — their corners must be transparent AND white, and
  // their centers must still carry the real (opaque) emoji color.
  const calloutEmoji = {
    '1f4a1': 'pro-tip',
    '1f454': 'for-managers',
    '1f4bb': 'for-ics',
    '1f914': 'common-objection',
  };

  it('generated callout PNGs have transparent white corners and an opaque center', async () => {
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch {
      // sharp ships as a build dependency; skip cleanly if unavailable.
      return;
    }
    for (const [cp, name] of Object.entries(calloutEmoji)) {
      const pngPath = join(emojiDir, `${cp}.png`);
      const img = sharp(pngPath).ensureAlpha();
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      const { width, height, channels } = info;

      // Top-left corner: fully transparent, white underneath.
      const [cr, cg, cb, ca] = [data[0], data[1], data[2], data[3]];
      expect([cr, cg, cb], `${name} (${cp}.png) transparent corner RGB should be white`).toEqual([255, 255, 255]);
      expect(ca, `${name} (${cp}.png) corner should be fully transparent`).toBe(0);

      // Center pixel: opaque (the emoji itself survived compositing).
      const ci = (Math.floor(height / 2) * width + Math.floor(width / 2)) * channels;
      expect(data[ci + 3], `${name} (${cp}.png) center should be opaque emoji`).toBe(255);
    }
  });
});
