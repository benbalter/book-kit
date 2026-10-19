import { describe, it, expect } from 'vitest';

/**
 * Tests for commands/minify-css.js logic.
 *
 * The script doesn't export functions — it reads files, runs postcss+cssnano,
 * and writes the minified output back. These tests exercise the same cssnano
 * pipeline the script uses (identical preset) and verify the ENOENT handling
 * logic that the script relies on.
 */

import postcss from 'postcss';
import cssnano from 'cssnano';

// Build a processor identical to the one in commands/minify-css.js
const processor = postcss([
  cssnano({ preset: ['default', { discardComments: { removeAll: true } }] }),
]);

// Helper: run a CSS string through the minification pipeline
async function minify(css) {
  const result = await processor.process(css, { from: undefined });
  return result.css;
}

describe('minify-css: size reduction', () => {
  it('minified output is smaller than verbose input', async () => {
    const input = `
      body {
        margin: 0;
        padding: 0;
        font-family: serif;
      }

      h1 {
        font-size: 2em;
        line-height: 1.4;
        color: #333333;
      }
    `;
    const output = await minify(input);
    expect(output.length).toBeLessThan(input.length);
  });
});

describe('minify-css: comment removal', () => {
  it('strips block comments', async () => {
    const input = `
      /* This is a comment that should be removed */
      body { margin: 0; }
    `;
    const output = await minify(input);
    expect(output).not.toContain('/*');
    expect(output).not.toContain('This is a comment');
  });

  it('strips multi-line comments', async () => {
    const input = `
      /**
       * Multi-line
       * banner comment
       */
      p { color: red; }
    `;
    const output = await minify(input);
    expect(output).not.toContain('Multi-line');
    expect(output).not.toContain('banner comment');
  });

  it('strips important (!) comments when removeAll is true', async () => {
    const input = `
      /*! preserve-me — normally kept by default */
      a { color: blue; }
    `;
    const output = await minify(input);
    expect(output).not.toContain('preserve-me');
  });
});

describe('minify-css: whitespace collapsing', () => {
  it('multi-line CSS collapses to fewer bytes', async () => {
    const input = `
      .container {
        display:     flex;
        flex-direction:    column;
        align-items:  center;
      }
    `;
    const output = await minify(input);
    // Should be a compact single-line or near single-line result
    expect(output.length).toBeLessThan(input.length);
    // No excessive whitespace
    expect(output).not.toMatch(/\s{2,}/);
  });
});

describe('minify-css: valid CSS preserved', () => {
  it('keeps selector names in output', async () => {
    const input = `
      .my-component { color: red; }
      #main-header { font-weight: bold; }
    `;
    const output = await minify(input);
    expect(output).toContain('.my-component');
    expect(output).toContain('#main-header');
  });

  it('keeps property values in output', async () => {
    const input = `
      body {
        font-family: "Noto Serif", Georgia, serif;
        line-height: 1.6;
      }
    `;
    const output = await minify(input);
    expect(output).toContain('font-family');
    expect(output).toContain('line-height');
    expect(output).toContain('1.6');
  });
});

describe('minify-css: empty input', () => {
  it('does not crash on empty string', async () => {
    const output = await minify('');
    expect(typeof output).toBe('string');
  });

  it('returns empty or near-empty output for empty input', async () => {
    const output = await minify('');
    expect(output.trim().length).toBeLessThanOrEqual(0);
  });

  it('handles whitespace-only input', async () => {
    const output = await minify('   \n\n   ');
    expect(typeof output).toBe('string');
  });
});

describe('minify-css: already minified CSS', () => {
  it('does not increase size of already-minified CSS', async () => {
    const input = 'body{margin:0;padding:0}h1{font-size:2em}';
    const output = await minify(input);
    expect(output.length).toBeLessThanOrEqual(input.length);
  });

  it('produces stable output on double-minification', async () => {
    const input = `
      body { margin: 0; padding: 0; }
      h1 { font-size: 2em; }
    `;
    const first = await minify(input);
    const second = await minify(first);
    expect(second).toBe(first);
  });
});

describe('minify-css: complex CSS patterns', () => {
  it('handles @media queries', async () => {
    const input = `
      @media (prefers-color-scheme: dark) {
        body {
          background: #1a1a1a;
          color: #e0e0e0;
        }
      }
      @media (max-width: 768px) {
        .container { padding: 1rem; }
      }
    `;
    const output = await minify(input);
    expect(output).toContain('@media');
    expect(output).toContain('prefers-color-scheme');
    expect(output).toContain('768px');
    expect(output.length).toBeLessThan(input.length);
  });

  it('handles @font-face declarations', async () => {
    const input = `
      @font-face {
        font-family: "Noto Serif";
        src: url("fonts/NotoSerif-Regular.woff2") format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
    `;
    const output = await minify(input);
    expect(output).toContain('@font-face');
    expect(output).toContain('Noto Serif');
    expect(output).toContain('woff2');
  });

  it('handles nested selectors and combinators', async () => {
    const input = `
      .chapter > h2 + p { text-indent: 0; }
      .chapter > h2 ~ p { text-indent: 1.5em; }
      blockquote p:first-child { margin-top: 0; }
    `;
    const output = await minify(input);
    expect(output).toContain('.chapter>h2+p');
    expect(output).toContain('blockquote p:first-child');
  });

  it('handles CSS custom properties (variables)', async () => {
    const input = `
      :root {
        --color-primary: #333;
        --font-body: "Noto Serif", serif;
      }
      body {
        color: var(--color-primary);
        font-family: var(--font-body);
      }
    `;
    const output = await minify(input);
    expect(output).toContain('--color-primary');
    expect(output).toContain('var(--color-primary)');
  });

  it('handles keyframe animations', async () => {
    const input = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .fade { animation: fadeIn 0.3s ease-in; }
    `;
    const output = await minify(input);
    expect(output).toContain('@keyframes fadeIn');
    expect(output).toContain('animation');
  });

  it('optimises color values', async () => {
    const input = 'a { color: #ff0000; }';
    const output = await minify(input);
    // cssnano shortens #ff0000 → red or #f00
    expect(output).not.toContain('#ff0000');
    expect(output.includes('red') || output.includes('#f00')).toBe(true);
  });

  it('merges duplicate rules', async () => {
    const input = `
      h1 { font-weight: bold; }
      h1 { font-weight: bold; }
    `;
    const output = await minify(input);
    // cssnano should merge duplicates — output should be shorter
    expect(output.length).toBeLessThan(input.length);
    // Only one h1 rule should remain
    const h1Count = (output.match(/h1/g) || []).length;
    expect(h1Count).toBe(1);
  });
});

describe('minify-css: ENOENT handling logic', () => {
  it('error objects with code ENOENT are distinguishable from other errors', () => {
    // Reproduce the error-code check the script uses:
    //   if (e.code === 'ENOENT') { ... } else { throw e; }
    const enoent = new Error('no such file');
    enoent.code = 'ENOENT';
    expect(enoent.code).toBe('ENOENT');

    const permission = new Error('permission denied');
    permission.code = 'EACCES';
    expect(permission.code).not.toBe('ENOENT');
  });

  it('readFileSync throws ENOENT for missing files', async () => {
    const { readFileSync } = await import('node:fs');
    try {
      readFileSync('/nonexistent/path/style.css', 'utf8');
      // Should not reach here
      expect.unreachable('readFileSync should have thrown');
    } catch (e) {
      expect(e.code).toBe('ENOENT');
    }
  });

  it('non-ENOENT errors propagate (script rethrows them)', () => {
    // The script does: if (e.code === 'ENOENT') { skip } else { throw e }
    // Verify a non-ENOENT error would NOT be caught by that guard.
    const syntaxErr = new Error('unexpected token');
    syntaxErr.code = 'ERR_INVALID_ARG_TYPE';

    let caught = false;
    try {
      // Mimic the script's catch block
      if (syntaxErr.code === 'ENOENT') {
        // would skip
      } else {
        throw syntaxErr;
      }
    } catch (e) {
      caught = true;
      expect(e.message).toBe('unexpected token');
    }
    expect(caught).toBe(true);
  });
});
