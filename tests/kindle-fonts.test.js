import { describe, it, expect } from 'vitest';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function importModule() {
  return await import(path.join(__dirname, '..', 'commands', 'kindle-fonts.js'));
}

const { generateKindleCss, FONT_FACE_RE, staticFonts, emojiCss, calloutFlowCss } = await importModule();
describe('kindle-fonts: font-face stripping', () => {

  it('should remove variable @font-face blocks', () => {
    const input = `@font-face {
  font-family: "Source Serif 4";
  font-weight: 200 900;
  src: url("../fonts/variable.woff2") format("woff2");
}
body { color: #333; }`;

    const result = generateKindleCss(input);
    expect(!result.includes('font-weight: 200 900'), 'variable font-weight range should be removed').toBeTruthy();
    expect(result.includes('body { color: #333; }'), 'non-font rules should be preserved').toBeTruthy();
  });

  it('should remove multiple @font-face blocks', () => {
    const input = `@font-face {
  font-family: "Source Serif 4";
  font-weight: 200 900;
  src: url("serif-var.woff2") format("woff2");
}
@font-face {
  font-family: "Source Sans 3";
  font-weight: 200 900;
  src: url("sans-var.woff2") format("woff2");
}
p { margin: 1em; }`;

    const result = generateKindleCss(input);
    // Count @font-face blocks in output — should only have the 11 static ones
    const fontFaceCount = (result.match(/@font-face\s*\{/g) || []).length;
    expect(fontFaceCount).toBe(11);
    expect(result.includes('p { margin: 1em; }'), 'body rules preserved').toBeTruthy();
  });

  it('should handle input with no @font-face blocks', () => {
    const input = 'body { color: #333; }\np { margin: 1em; }';
    const result = generateKindleCss(input);
    expect(result.includes('body { color: #333; }')).toBeTruthy();
    expect(result.includes('p { margin: 1em; }')).toBeTruthy();
    const fontFaceCount = (result.match(/@font-face\s*\{/g) || []).length;
    expect(fontFaceCount).toBe(11);
  });
});

describe('kindle-fonts: static font declarations', () => {

  it('should include all three font families', () => {
    expect(staticFonts.includes('"Source Serif 4"'), 'should include Source Serif 4').toBeTruthy();
    expect(staticFonts.includes('"Source Sans 3"'), 'should include Source Sans 3').toBeTruthy();
    expect(staticFonts.includes('"Source Code Pro"'), 'should include Source Code Pro').toBeTruthy();
  });

  it('should declare exactly 11 static font instances', () => {
    const fontFaceCount = (staticFonts.match(/@font-face\s*\{/g) || []).length;
    expect(fontFaceCount).toBe(11);
  });

  it('should only use Kindle-safe font weights (400, 600, 700)', () => {
    const weights = [...staticFonts.matchAll(/font-weight:\s*(\S+);/g)].map(m => m[1]);
    const allowed = new Set(['400', '600', '700']);
    for (const w of weights) {
      expect(allowed.has(w), `font-weight ${w} is not Kindle-safe (expected 400, 600, or 700)`).toBeTruthy();
      expect(!w.includes(' '), `font-weight "${w}" looks like a variable range — Kindle needs static weights`).toBeTruthy();
    }
  });

  it('should reference static woff2 files (not variable)', () => {
    const srcs = [...staticFonts.matchAll(/src:\s*url\("([^"]+)"\)/g)].map(m => m[1]);
    expect(srcs.length).toBe(11);
    for (const src of srcs) {
      expect(src.endsWith('.woff2'), `font src should be woff2: ${src}`).toBeTruthy();
      expect(!src.includes('Variable') && !src.includes('variable'), `font src should not reference variable font: ${src}`).toBeTruthy();
    }
  });

  it('should include italic variants for all families', () => {
    const italicBlocks = staticFonts.split('@font-face').filter(b => b.includes('font-style: italic'));
    expect(italicBlocks.length >= 3, `should have italic variants for all 3 families (found ${italicBlocks.length})`).toBeTruthy();
  });

  it('should include bold for body font (Source Serif 4)', () => {
    const serifBlocks = staticFonts.split('@font-face').filter(b => b.includes('"Source Serif 4"'));
    const serifBold = serifBlocks.filter(b => b.includes('font-weight: 700'));
    expect(serifBold.length >= 1, 'should have bold Source Serif 4').toBeTruthy();
    const serifBoldItalic = serifBlocks.filter(b =>
      b.includes('font-weight: 700') && b.includes('font-style: italic')
    );
    expect(serifBoldItalic.length >= 1, 'should have bold italic Source Serif 4').toBeTruthy();
  });
});

describe('kindle-fonts: FONT_FACE_RE regex', () => {

  it('should match standard @font-face blocks', () => {
    const css = '@font-face { font-family: "Test"; font-weight: 400; }';
    expect(css.match(FONT_FACE_RE), 'should match a simple @font-face block').toBeTruthy();
  });

  it('should match @font-face with whitespace variations', () => {
    const css = '@font-face   {\n  font-family: "Test";\n  font-weight: 200 900;\n}\n';
    expect(css.match(FONT_FACE_RE), 'should match multiline @font-face').toBeTruthy();
  });

  it('should not match @font-feature-values or other at-rules', () => {
    const css = '@media screen { body { color: red; } }';
    expect(css.match(FONT_FACE_RE)).toBe(null);
  });
});

describe('kindle-fonts: emoji CSS', () => {

  it('emojiCss should style img.emoji for inline display', () => {
    expect(emojiCss.includes('img.emoji'), 'should target img.emoji').toBeTruthy();
    expect(emojiCss.includes('height: 1em'), 'should size emoji to match text').toBeTruthy();
    expect(emojiCss.includes('vertical-align: middle'), 'should align with text').toBeTruthy();
    expect(emojiCss.includes('display: inline'), 'should be inline').toBeTruthy();
  });

  it('emojiCss should style img.callout-emoji as inline', () => {
    expect(emojiCss.includes('img.callout-emoji'), 'should target img.callout-emoji').toBeTruthy();
    expect(emojiCss.match(/img\.callout-emoji\s*\{[^}]*display:\s*inline/), 'callout-emoji should use display: inline').toBeTruthy();
    expect(emojiCss.match(/img\.callout-emoji\s*\{[^}]*vertical-align:\s*middle/), 'callout-emoji should align middle').toBeTruthy();
  });

  it('generateKindleCss should include emoji CSS at the end', () => {
    const result = generateKindleCss('body { color: #333; }');
    expect(result.includes('img.emoji'), 'output should contain emoji CSS').toBeTruthy();
  });

  it('emojiCss should not paint colored callout-emoji backgrounds (callouts are unfilled on Kindle)', () => {
    // Once callout fills are dropped, matching emoji backgrounds to the old
    // fill colors would leave colored rectangles on a white callout.
    for (const color of ['#fafaf7', '#f5f8fc', '#f5fbf6', '#fdf5f7', '#2a2218', '#1a2233', '#1a2a1c', '#2a1a22']) {
      expect(!emojiCss.includes(color), `emojiCss should not reintroduce callout fill color ${color}`).toBeTruthy();
    }
  });
});

describe('kindle-fonts: flowing callouts', () => {

  it('calloutFlowCss should drop the fill and box-decoration cloning for every callout', () => {
    for (const cls of ['.tldr', '.pro-tip', '.for-managers', '.for-ics', '.common-objection', '.takeaways']) {
      expect(calloutFlowCss.includes(cls), `calloutFlowCss should target ${cls}`).toBeTruthy();
    }
    expect(calloutFlowCss.includes('background-color: transparent'), 'callouts should be unfilled').toBeTruthy();
    expect(calloutFlowCss.includes('box-decoration-break: slice'), 'box decoration should not clone per fragment').toBeTruthy();
  });

  it('calloutFlowCss should let callouts break across screens (no avoid hints)', () => {
    expect(calloutFlowCss.includes('page-break-before: auto'), 'should not avoid a break before the callout').toBeTruthy();
    expect(calloutFlowCss.includes('page-break-inside: auto'), 'should allow breaking inside the callout').toBeTruthy();
    expect(!/break-inside:\s*avoid/.test(calloutFlowCss), 'callout flow CSS must not avoid inside breaks').toBeTruthy();
  });

  it('calloutFlowCss should not strip the left border (the visual cue)', () => {
    expect(!calloutFlowCss.includes('border-left'), 'flow override must leave the per-callout left border intact').toBeTruthy();
  });

  it('generateKindleCss should append calloutFlowCss after the base CSS so it wins the cascade', () => {
    const result = generateKindleCss('.pro-tip { background-color: #f8f6f0; box-decoration-break: clone; }');
    expect(result.indexOf('box-decoration-break: slice') > result.indexOf('box-decoration-break: clone'), 'flow override must come after the base rule').toBeTruthy();
  });
});
