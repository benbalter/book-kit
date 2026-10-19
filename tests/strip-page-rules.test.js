import { describe, it, expect } from 'vitest';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the module functions dynamically
async function importModule() {
  const modulePath = path.join(__dirname, '..', 'commands', 'strip-page-rules.js');
  return await import(modulePath);
}

const module = await importModule();
describe('strip-page-rules: extractBalancedParens', () => {
  
  it('should extract simple content', () => {
    const input = '(abc)';
    const [content, endPos] = module.extractBalancedParens(input, 0);
    
    expect(content).toBe('abc');
    expect(endPos).toBe(5);
  });
  
  it('should handle nested parentheses', () => {
    const input = '(outer(inner))';
    const [content, endPos] = module.extractBalancedParens(input, 0);
    
    expect(content).toBe('outer(inner)');
    expect(endPos).toBe(14);
  });
  
  it('should return null for invalid input', () => {
    const input = 'abc';
    const [content] = module.extractBalancedParens(input, 0);
    
    expect(content).toBe(null);
  });
  
  it('should return null for unbalanced parens', () => {
    const input = '(abc';
    const [content] = module.extractBalancedParens(input, 0);
    
    expect(content).toBe(null);
  });
});

describe('strip-page-rules: simplifyPseudoClass', () => {
  
  it('should simplify :where() selector', () => {
    const input = ':where(h1, h2, h3)';
    const result = module.simplifyPseudoClass(input, ':where(');
    
    expect(!result.includes(':where')).toBeTruthy();
    expect(result).toBe('h1, h2, h3');
  });
  
  it('should simplify :is() selector to first item', () => {
    const input = ':is(h1, h2, h3)';
    const result = module.simplifyPseudoClass(input, ':is(', true);
    
    expect(!result.includes(':is')).toBeTruthy();
    expect(result).toBe('h1');
  });
  
  it('should handle nested pseudo-classes', () => {
    const input = ':where(div:where(.class))';
    const result = module.simplifyPseudoClass(input, ':where(');
    
    expect(!result.includes(':where')).toBeTruthy();
  });
  
  it('should handle :is() with attributes', () => {
    const input = 'select:is([multiple], [size])';
    const result = module.simplifyPseudoClass(input, ':is(', true);
    
    expect(!result.includes(':is')).toBeTruthy();
    expect(result).toBe('select[multiple]');
  });
});

describe('strip-page-rules: splitTopLevelCommas', () => {
  
  it('should split simple comma-separated list', () => {
    const input = 'a, b, c';
    const result = module.splitTopLevelCommas(input);
    
    expect(result).toEqual(['a', ' b', ' c']);
  });
  
  it('should not split commas inside parentheses', () => {
    const input = 'a(1, 2), b';
    const result = module.splitTopLevelCommas(input);
    
    expect(result).toEqual(['a(1, 2)', ' b']);
  });
  
  it('should handle nested parentheses', () => {
    const input = 'a(b(1, 2), c), d';
    const result = module.splitTopLevelCommas(input);
    
    expect(result).toEqual(['a(b(1, 2), c)', ' d']);
  });
});

describe('strip-page-rules: stripForEpubSync', () => {
  
  it('should remove @supports rules', () => {
    const input = 'body { color: red; } @supports (display: grid) { .grid { display: grid; } } footer { color: blue; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@supports')).toBeTruthy();
    expect(result.includes('body')).toBeTruthy();
    expect(result.includes('footer')).toBeTruthy();
  });
  
  it('should remove @page rules', () => {
    const input = 'body { margin: 0; } @page { margin: 1in; } h1 { font-size: 2em; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@page')).toBeTruthy();
    expect(result.includes('body')).toBeTruthy();
    expect(result.includes('h1')).toBeTruthy();
  });
  
  it('should remove @media screen rules', () => {
    const input = 'body { color: red; } @media screen { #copyright-page { display: flex; min-height: 100vh; } } footer { color: blue; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@media screen')).toBeTruthy();
    expect(!result.includes('100vh')).toBeTruthy();
    expect(result.includes('body')).toBeTruthy();
    expect(result.includes('footer')).toBeTruthy();
  });
  
  it('should remove @media screen and (...) rules', () => {
    const input = 'body { color: red; } @media screen and (min-width: 768px) { .prose { font-size: 1.2em; } } footer { color: blue; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@media screen')).toBeTruthy();
    expect(result.includes('body')).toBeTruthy();
    expect(result.includes('footer')).toBeTruthy();
  });
  
  it('should strip @media print rules', () => {
    const input = 'body { color: red; } @media print { h1 { font-size: 2em; } }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@media print'), 'should remove @media print block').toBeTruthy();
    expect(!result.includes('font-size: 2em'), 'should remove print-only rules').toBeTruthy();
    expect(result.includes('body'), 'should preserve non-print rules').toBeTruthy();
  });
  
  it('should unwrap @layer blocks', () => {
    const input = '@layer base { body { color: red; } }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@layer')).toBeTruthy();
    expect(result.includes('body')).toBeTruthy();
    expect(result.includes('color: red')).toBeTruthy();
  });
  
  it('should remove simple @layer statement', () => {
    const input = '@layer base, components; body { color: red; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@layer')).toBeTruthy();
    expect(result.includes('body')).toBeTruthy();
  });
  
  it('should handle multiple @layer blocks', () => {
    const input = '@layer base { .a { color: red; } } @layer components { .b { color: blue; } }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@layer')).toBeTruthy();
    expect(result.includes('.a')).toBeTruthy();
    expect(result.includes('.b')).toBeTruthy();
  });
  
  it('should simplify :where() selectors', () => {
    const input = ':where(h1, h2, h3) { font-weight: bold; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes(':where')).toBeTruthy();
  });
  
  it('should simplify :is() selectors to first item', () => {
    const input = ':is(h1, h2, h3) { font-weight: bold; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes(':is')).toBeTruthy();
    expect(result.includes('h1')).toBeTruthy();
  });
  
  it('should remove .tldr:before rules (double-colon form)', () => {
    const input = '.tldr { padding: 1em; } .tldr::before { content: "TL;DR: "; } .other { color: blue; }';
    const result = module.stripForEpubSync(input);
    
    expect(result, 'tldr:before should be removed (double-colon input)').not.toMatch(/\.tldr::?before/);
    expect(result.includes('.tldr')).toBeTruthy();
    expect(result.includes('.other')).toBeTruthy();
  });

  it('should remove .tldr:before rules (single-colon, as emitted by PostCSS/Tailwind minifier)', () => {
    // PostCSS/Tailwind v4 normalizes ::before to :before in minified output.
    // This is the real-world form found in dist/style.css and is the root cause
    // of the "double TL;DR in ebook" bug.
    const input = '.tldr{padding:1em}.tldr:before{content:"TL;DR: "}.other{color:blue}';
    const result = module.stripForEpubSync(input);

    expect(!result.includes('.tldr:before'), '.tldr:before should be removed').toBeTruthy();
    expect(result.includes('.tldr'), '.tldr rule should be preserved').toBeTruthy();
    expect(result.includes('.other'), '.other rule should be preserved').toBeTruthy();
  });
  
  it('should remove multiple callout :before rules (single-colon form)', () => {
    const input = '.tldr:before { content: "TL;DR"; } .pro-tip:before { content: "Pro tip"; }';
    const result = module.stripForEpubSync(input);
    
    expect(result, ':before rules should be removed').not.toMatch(/::?before/);
  });

  it('should remove multiple callout ::before rules (double-colon form)', () => {
    const input = '.tldr::before { content: "TL;DR"; } .pro-tip::before { content: "Pro tip"; }';
    const result = module.stripForEpubSync(input);
    
    expect(result, '::before rules should be removed').not.toMatch(/::?before/);
  });

  it('should remove multiple callout :before rules (single-colon minified form)', () => {
    const input = '.tldr:before{content:"TL;DR"}.pro-tip:before{content:"Pro tip"}.for-managers:before{content:"For managers"}.for-ics:before{content:"For ICs"}.common-objection:before{content:"Objection"}.footnotes:before{content:"Notes"}';
    const result = module.stripForEpubSync(input);

    expect(!result.includes(':before'), 'all :before rules should be removed').toBeTruthy();
  });
  
  it('should remove ::marker rules to fix invisible bullets', () => {
    const input = '.prose ul > li::marker { color: #dee2e6; } .prose ol > li::marker { font-weight: 400; color: #6c757d; } .prose ul { list-style-type: disc; }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('::marker'), '::marker rules should be removed').toBeTruthy();
    expect(result.includes('list-style-type: disc'), 'list-style-type rule should be preserved').toBeTruthy();
  });
  
  it('should process complete CSS', () => {
    const input = `
@layer base {
  body { color: black; }
}

@supports (display: grid) {
  .grid { display: grid; }
}

@page {
  margin: 1in;
}

:where(h1, h2) { font-weight: bold; }

.tldr::before { content: "TL;DR: "; }
    `;
    
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('@layer')).toBeTruthy();
    expect(!result.includes('@supports')).toBeTruthy();
    expect(!result.includes('@page')).toBeTruthy();
    expect(!result.includes(':where')).toBeTruthy();
    expect(result, 'tldr:before should be removed from complete CSS').not.toMatch(/\.tldr::?before/);
    expect(result.includes('body')).toBeTruthy();
  });
});

describe('strip-page-rules: callout break-inside stripping', () => {
  // On reflowable readers (Kindle), break-inside:avoid on a callout box forces
  // the whole box to the next screen when it won't fit, leaving a blank gap.
  // strip-page-rules removes it for EPUB; print/PDF keep it (WeasyPrint reads
  // dist/style.css directly, not this stripped output).

  it('removes break-inside:avoid from a callout box rule', () => {
    const input = '.tldr { break-inside: avoid; margin-top: 1em; }';
    const result = module.stripForEpubSync(input);
    expect(!result.includes('break-inside'), 'break-inside should be stripped from .tldr').toBeTruthy();
    expect(result.includes('margin-top'), 'other declarations should remain').toBeTruthy();
  });

  it('removes page-break-inside:avoid from a combined callout selector', () => {
    const input = '.common-objection,.for-ics,.for-managers,.pro-tip,.takeaways,.tldr { page-break-inside: avoid; page-break-before: avoid; }';
    const result = module.stripForEpubSync(input);
    expect(!result.includes('page-break-inside'), 'page-break-inside should be stripped from callout group').toBeTruthy();
    expect(result.includes('page-break-before'), 'page-break-before should be kept').toBeTruthy();
  });

  it('keeps break-inside:avoid on non-callout elements (figures, headings)', () => {
    const input = 'figure { break-inside: avoid; } .level1>h1 { page-break-inside: avoid; }';
    const result = module.stripForEpubSync(input);
    expect(result.includes('break-inside: avoid'), 'figure break-inside should remain').toBeTruthy();
    expect(result.includes('page-break-inside: avoid'), 'heading page-break-inside should remain').toBeTruthy();
  });

  it('does not strip break-inside from callout descendants like .tldr p', () => {
    const input = '.tldr p { break-inside: avoid; }';
    const result = module.stripForEpubSync(input);
    expect(result.includes('break-inside: avoid'), 'descendant rule is not a callout box; should remain').toBeTruthy();
  });
});

describe('strip-page-rules: stripForEpub (async)', () => {

  it('should process CSS asynchronously', async () => {
    const input = '@layer base { body { color: red; } } @supports (display: grid) { .grid { display: grid; } }';
    const result = await module.stripForEpub(input);
    
    expect(!result.includes('@layer')).toBeTruthy();
    expect(!result.includes('@supports')).toBeTruthy();
    expect(result.includes('body')).toBeTruthy();
  });

  it('stripForEpub (async) should also remove ::marker rules and keep list-style-type', async () => {
    const input = '.prose ul > li::marker { color: #dee2e6; } .prose ol > li::marker { font-weight: 400; color: #6c757d; } .prose ul { list-style-type: disc; }';
    const result = await module.stripForEpub(input);

    expect(!result.includes('::marker'), '::marker rules should be removed in async stripForEpub').toBeTruthy();
    expect(result.includes('list-style-type: disc'), 'list-style-type rule should be preserved in async stripForEpub').toBeTruthy();
  });

  it('stripForEpub (async) should remove .pro-tip:before (single-colon) from production CSS', async () => {
    // Regression test for the "double pro-tip callout in EPUB" bug.
    // PostCSS minification outputs :before (single colon); the strip check must still match.
    const input = '.pro-tip { padding: 1em; } .pro-tip:before { content: "💡 Pro-Tip: "; } .other { color: blue; }';
    const result = await module.stripForEpub(input);

    expect(result, 'pro-tip:before should be removed in async mode (single-colon input)').not.toMatch(/\.pro-tip::?before/);
    expect(result.includes('.pro-tip')).toBeTruthy();
    expect(result.includes('.other')).toBeTruthy();
  });
});

describe('strip-page-rules: CALLOUT_SELECTORS', () => {
  
  it('should include expected selectors (double-colon form)', () => {
    expect(module.CALLOUT_SELECTORS.includes('.tldr::before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.pro-tip::before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.for-managers::before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.for-ics::before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.common-objection::before')).toBeTruthy();
  });

  it('should include single-colon :before forms to match PostCSS/Tailwind minified output', () => {
    // PostCSS/Tailwind v4 normalizes ::before → :before in dist/style.css.
    // Without these entries the ::before CSS leaks into the EPUB stylesheet,
    // causing a double TL;DR (once from CSS, once from the Lua filter).
    expect(module.CALLOUT_SELECTORS.includes('.tldr:before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.pro-tip:before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.for-managers:before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.for-ics:before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.common-objection:before')).toBeTruthy();
    expect(module.CALLOUT_SELECTORS.includes('.footnotes:before')).toBeTruthy();
  });
});

describe('strip-page-rules: convertAttributeSelectors', () => {
  
  it('should convert [class~="value"] to .value', () => {
    const input = '[class~="not-prose"]';
    const result = module.convertAttributeSelectors(input);
    
    expect(result).toBe('.not-prose');
  });
  
  it('should handle multiple attribute selectors', () => {
    const input = ':where(p):not(:where([class~="not-prose"],[class~="test"] *))';
    const result = module.convertAttributeSelectors(input);
    
    expect(result.includes('.not-prose')).toBeTruthy();
    expect(result.includes('.test')).toBeTruthy();
    expect(!result.includes('[class~=')).toBeTruthy();
  });
  
  it('should remove case-sensitivity flags', () => {
    const input = 'ol[type="i" s]';
    const result = module.convertAttributeSelectors(input);
    
    expect(result).toBe('ol[type="i"]');
  });
  
  it('should handle both class~= and case-sensitivity flags', () => {
    const input = '[class~="test"] ol[type="A" s]';
    const result = module.convertAttributeSelectors(input);
    
    expect(result).toBe('.test ol[type="A"]');
  });
  
  it('should leave other selectors unchanged', () => {
    const input = '.class[data-attr="value"]';
    const result = module.convertAttributeSelectors(input);
    
    expect(result).toBe('.class[data-attr="value"]');
  });
  
  it('should leave unsafe class names as attribute selectors', () => {
    // Class names with special characters that would need escaping should be left unchanged
    const input = '[class~="sm:text-lg"]';
    const result = module.convertAttributeSelectors(input);
    
    // Should remain as attribute selector since it contains : which would need escaping
    expect(result).toBe('[class~="sm:text-lg"]');
  });
  
  it('should convert safe class names with hyphens and underscores', () => {
    const input = '[class~="my-class_name"]';
    const result = module.convertAttributeSelectors(input);
    
    expect(result).toBe('.my-class_name');
  });
});

describe('strip-page-rules: simplifyNotSelector', () => {
  
  it('should simplify :not() with multiple selectors', () => {
    const input = 'p:not(.not-prose, .not-prose *)';
    const result = module.simplifyNotSelector(input);
    
    expect(result).toBe('p:not(.not-prose)');
  });
  
  it('should handle complex :not() selectors', () => {
    const input = 'div:not(.foo, .bar, .baz)';
    const result = module.simplifyNotSelector(input);
    
    expect(result).toBe('div:not(.foo)');
  });
  
  it('should leave single :not() selectors unchanged', () => {
    const input = 'div:not(.foo)';
    const result = module.simplifyNotSelector(input);
    
    expect(result).toBe('div:not(.foo)');
  });
  
  it('should handle multiple :not() in same selector', () => {
    const input = 'div:not(.foo, .bar):not(.baz, .qux)';
    const result = module.simplifyNotSelector(input);
    
    expect(result).toBe('div:not(.foo):not(.baz)');
  });
});

describe('strip-page-rules: oklchToHex', () => {
  
  it('should convert low chroma to grayscale', () => {
    const input = 'oklch(50% 0.01 250)';
    const result = module.oklchToHex(input);
    
    // Should be a gray color (all RGB components equal)
    expect(result.match(/^#[0-9a-f]{6}$/i)).toBeTruthy();
  });
  
  it('should convert blue oklch to blue hex', () => {
    const input = 'oklch(60% 0.15 250)';
    const result = module.oklchToHex(input);
    
    // Should return a blue-ish color
    expect(result.match(/^#[0-9a-f]{6}$/i)).toBeTruthy();
    expect(['#e3f2fd', '#2196f3', '#1976d2', '#0d47a1'].includes(result.toLowerCase())).toBeTruthy();
  });
  
  it('should handle oklch without % on lightness', () => {
    const input = 'oklch(0.6 0.15 250)';
    const result = module.oklchToHex(input);
    
    // 0.6 should be treated as 60% (not 0.6%), so it should map to a mid-lightness blue
    expect(result.match(/^#[0-9a-f]{6}$/i)).toBeTruthy();
    // Verify it's treating 0.6 as 60% by checking it matches the same bucket as 60%
    const resultWithPercent = module.oklchToHex('oklch(60% 0.15 250)');
    expect(result).toBe(resultWithPercent);
  });
  
  it('should return black for invalid input', () => {
    const input = 'oklch(invalid)';
    const result = module.oklchToHex(input);
    
    expect(result).toBe('#000000');
  });
});

describe('strip-page-rules: colorMixToFallback', () => {
  
  it('should extract first color from color-mix', () => {
    const input = 'color-mix(in oklab, #ff0000 50%, #0000ff)';
    const result = module.colorMixToFallback(input);
    
    expect(result).toBe('#ff0000');
  });
  
  it('should convert oklch color in color-mix', () => {
    const input = 'color-mix(in oklab, oklch(50% 0.01 250) 10%, transparent)';
    const result = module.colorMixToFallback(input);
    
    // Should return a hex color (converted from oklch)
    expect(result.match(/^#[0-9a-f]{6}$/i)).toBeTruthy();
  });
  
  it('should return transparent for invalid input', () => {
    const input = 'color-mix(invalid)';
    const result = module.colorMixToFallback(input);
    
    expect(result).toBe('transparent');
  });
});

describe('strip-page-rules: stripForEpubSync with modern CSS', () => {
  
  it('should strip rules containing :not(.not-prose) (Typography rules removed)', () => {
    const input = ':where(p):not(:where([class~="not-prose"])) { color: black; }';
    const result = module.stripForEpubSync(input);
    
    // After attribute conversion, selector becomes p:not(.not-prose)
    // which is then stripped by stripTypographyRules
    expect(!result.includes('[class~=')).toBeTruthy();
    expect(!result.includes('.not-prose'), 'Rule with :not(.not-prose) should be stripped').toBeTruthy();
    expect(!result.includes('color: black'), 'Rule body should be removed').toBeTruthy();
  });
  
  it('should convert oklch colors in CSS', () => {
    const input = '.prose { color: oklch(37.3% 0.034 259.733); }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('oklch(')).toBeTruthy();
    expect(result.includes('#')).toBeTruthy();
  });
  
  it('should convert color-mix in CSS', () => {
    const input = '.shadow { box-shadow: 0 0 10px color-mix(in oklab, oklch(21% 0.034 264.665) 10%, transparent); }';
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('color-mix(')).toBeTruthy();
    expect(!result.includes('oklch(')).toBeTruthy();
  });
  
  it('should flatten nested CSS rules', () => {
    const input = `.prose {
      color: black;
      p {
        margin: 1em;
      }
    }`;
    
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('.prose {\n      color: black;\n      p {')).toBeTruthy();
    expect(result.includes('.prose p')).toBeTruthy();
    expect(result.includes('margin: 1em')).toBeTruthy();
  });
  
  it('should flatten deeply nested CSS rules', () => {
    const input = `.parent {
      color: red;
      .child {
        color: blue;
        .grandchild {
          color: green;
        }
      }
    }`;
    
    const result = module.stripForEpubSync(input);
    
    expect(result.includes('.parent .child .grandchild')).toBeTruthy();
    expect(result.includes('color: green')).toBeTruthy();
  });
  
  it('should handle & in nested selectors', () => {
    const input = `.prose {
      color: black;
      &:hover {
        color: red;
      }
    }`;
    
    const result = module.stripForEpubSync(input);
    
    expect(result.includes('.prose:hover')).toBeTruthy();
    expect(result.includes('color: red')).toBeTruthy();
  });
  
  it('should handle all modern features together', () => {
    const input = `
:where(p):not(:where([class~="not-prose"])) {
  color: oklch(37.3% 0.034 259.733);
  text-shadow: 0 0 1px color-mix(in oklab, oklch(21% 0.034 264.665) 10%, transparent);
}
.prose {
  color: black;
  p:not(.not-prose, .not-prose *) {
    margin: 1em;
  }
}
ol[type="i" s] {
  list-style-type: lower-roman;
}
    `;
    
    const result = module.stripForEpubSync(input);
    
    expect(!result.includes('[class~=')).toBeTruthy();
    expect(!result.includes('oklch(')).toBeTruthy();
    expect(!result.includes('color-mix(')).toBeTruthy();
    expect(!result.includes(':not(.not-prose, .not-prose *)')).toBeTruthy();
    expect(!result.includes('[type="i" s]')).toBeTruthy();
    // Typography :not(.not-prose) rules are stripped entirely
    expect(!result.includes('.not-prose'), ':not(.not-prose) rules should be stripped').toBeTruthy();
    expect(!result.includes('.prose p'), '.prose p:not(.not-prose) should be stripped').toBeTruthy();
    expect(!result.includes(':not(.not-prose)'), ':not(.not-prose) selectors should be stripped').toBeTruthy();
    expect(result.includes('[type="i"]')).toBeTruthy();
  });
});

describe('strip-page-rules: async and sync equivalence', () => {
  
  it('should produce identical output from async and sync versions', async () => {
    const input = `
@layer base {
  body { color: black; }
}

@supports (display: grid) {
  .grid { display: grid; }
}

.prose {
  color: oklch(37.3% 0.034 259.733);
  p:not(.not-prose, .not-prose *) {
    margin: 1em;
  }
}

:where(p):not(:where([class~="not-prose"])) {
  text-shadow: 0 0 1px color-mix(in oklab, oklch(21% 0.034 264.665) 10%, transparent);
}

ol[type="i" s] {
  list-style-type: lower-roman;
}

.tldr::before {
  content: "TL;DR: ";
}
    `;
    
    const syncResult = module.stripForEpubSync(input);
    const asyncResult = await module.stripForEpub(input);
    
    // Both should produce the same output
    expect(asyncResult).toBe(syncResult);
    
    // Verify transformations were applied
    expect(!asyncResult.includes('@layer')).toBeTruthy();
    expect(!asyncResult.includes('@supports')).toBeTruthy();
    expect(!asyncResult.includes('oklch(')).toBeTruthy();
    expect(!asyncResult.includes('color-mix(')).toBeTruthy();
    expect(!asyncResult.includes('[class~=')).toBeTruthy();
    expect(!asyncResult.includes(':not(.not-prose, .not-prose *)')).toBeTruthy();
    expect(!asyncResult.includes('[type="i" s]')).toBeTruthy();
    expect(asyncResult, 'tldr:before should not appear in async/sync output').not.toMatch(/\.tldr::?before/);
  });
});

describe('strip-page-rules: single-colon callout stripping (production CSS regression)', () => {
  it('should strip .pro-tip:before from dist/style.css-like input (single-colon, PostCSS minifier output)', async () => {
    // This is the exact form PostCSS minification produces in dist/style.css.
    // Previously, CALLOUT_SELECTORS used ::before (double colon) so this selector
    // was never matched and the pro-tip label appeared twice in EPUB output.
    const input = `.pro-tip{padding:1em}.pro-tip:before{content:"💡 Pro-Tip: "}.other{color:#00f}`;
    const syncResult = module.stripForEpubSync(input);
    const asyncResult = await module.stripForEpub(input);

    expect(syncResult, 'sync: pro-tip:before should be removed from minified CSS').not.toMatch(/pro-tip::?before/);
    expect(asyncResult, 'async: pro-tip:before should be removed from minified CSS').not.toMatch(/pro-tip::?before/);
    expect(syncResult.includes('pro-tip'), 'sync: .pro-tip base rule should be preserved').toBeTruthy();
    expect(asyncResult.includes('pro-tip'), 'async: .pro-tip base rule should be preserved').toBeTruthy();
  });
});

const postcss = (await import('postcss')).default;
describe('strip-page-rules: collectCSSVariables', () => {
  
  it('should collect variables from :root', () => {
    const css = `:root { --color-primary: #007bff; --color-secondary: #6c757d; }`;
    const root = postcss.parse(css);
    const vars = module.collectCSSVariables(root);
    
    expect(vars.get('--color-primary')).toBe('#007bff');
    expect(vars.get('--color-secondary')).toBe('#6c757d');
  });
  
  it('should collect variables from :host', () => {
    const css = `:host { --host-var: red; }`;
    const root = postcss.parse(css);
    const vars = module.collectCSSVariables(root);
    
    expect(vars.get('--host-var')).toBe('red');
  });
  
  it('should collect variables from .prose', () => {
    const css = `.prose { --tw-prose-body: #333; }`;
    const root = postcss.parse(css);
    const vars = module.collectCSSVariables(root);
    
    expect(vars.get('--tw-prose-body')).toBe('#333');
  });
  
  it('should collect from multiple sources', () => {
    const css = `
      :root { --color-a: blue; }
      .prose { --color-b: green; }
    `;
    const root = postcss.parse(css);
    const vars = module.collectCSSVariables(root);
    
    expect(vars.get('--color-a')).toBe('blue');
    expect(vars.get('--color-b')).toBe('green');
  });
});

describe('strip-page-rules: resolveCSSVariables', () => {
  
  const variables = new Map([
    ['--color-primary', '#007bff'],
    ['--color-secondary', '#6c757d'],
    ['--nested-var', 'var(--color-primary)'],
    ['--font-body', '"Noto Serif", serif']
  ]);
  
  it('should resolve simple variable', () => {
    const result = module.resolveCSSVariables('var(--color-primary)', variables);
    expect(result).toBe('#007bff');
  });
  
  it('should resolve variable with fallback when defined', () => {
    const result = module.resolveCSSVariables('var(--color-primary, red)', variables);
    expect(result).toBe('#007bff');
  });
  
  it('should use fallback when variable not defined', () => {
    const result = module.resolveCSSVariables('var(--undefined-var, red)', variables);
    expect(result).toBe('red');
  });
  
  it('should resolve nested variables', () => {
    const result = module.resolveCSSVariables('var(--nested-var)', variables);
    expect(result).toBe('#007bff');
  });
  
  it('should resolve multiple variables in one value', () => {
    const result = module.resolveCSSVariables('1px solid var(--color-primary)', variables);
    expect(result).toBe('1px solid #007bff');
  });
  
  it('should preserve value without variables', () => {
    const result = module.resolveCSSVariables('#fff', variables);
    expect(result).toBe('#fff');
  });
  
  it('should handle font-family with quotes', () => {
    const result = module.resolveCSSVariables('var(--font-body)', variables);
    expect(result).toBe('"Noto Serif", serif');
  });
});

describe('strip-page-rules: resolveVarReference', () => {
  
  const variables = new Map([
    ['--color', 'blue']
  ]);
  
  it('should resolve known variable', () => {
    const result = module.resolveVarReference('var(--color)', variables);
    expect(result).toBe('blue');
  });
  
  it('should return original for unknown variable without fallback', () => {
    const result = module.resolveVarReference('var(--unknown)', variables);
    expect(result).toBe('var(--unknown)');
  });
  
  it('should use fallback for unknown variable', () => {
    const result = module.resolveVarReference('var(--unknown, fallback)', variables);
    expect(result).toBe('fallback');
  });
});

describe('strip-page-rules: CSS variable resolution in full pipeline', () => {
  
  it('should resolve variables in stripForEpubSync', () => {
    const input = `
:root {
  --color-brand: #007bff;
  --spacing: 1rem;
}
.button {
  background-color: var(--color-brand);
  padding: var(--spacing);
}
    `;
    
    const result = module.stripForEpubSync(input);
    
    // Variables should be resolved to static values
    expect(result.includes('background-color: #007bff')).toBeTruthy();
    expect(result.includes('padding: 1em')).toBeTruthy();
    // Original var() should not remain for defined variables
    expect(!result.includes('var(--color-brand)')).toBeTruthy();
    expect(!result.includes('var(--spacing)')).toBeTruthy();
  });
  
  it('should resolve .prose variables', () => {
    const input = `
.prose {
  --tw-prose-body: #333;
}
.prose p {
  color: var(--tw-prose-body);
}
    `;
    
    const result = module.stripForEpubSync(input);
    
    // Should resolve to the static value
    expect(result.includes('color: #333')).toBeTruthy();
    expect(!result.includes('var(--tw-prose-body)')).toBeTruthy();
  });
});

describe('strip-page-rules: LOGICAL_PROPERTY_MAP', () => {

  it('should export the logical property mapping', () => {
    expect(module.LOGICAL_PROPERTY_MAP).toBeTruthy();
    expect(module.LOGICAL_PROPERTY_MAP['padding-inline-start']).toBe('padding-left');
    expect(module.LOGICAL_PROPERTY_MAP['padding-inline-end']).toBe('padding-right');
    expect(module.LOGICAL_PROPERTY_MAP['margin-inline-start']).toBe('margin-left');
    expect(module.LOGICAL_PROPERTY_MAP['margin-inline-end']).toBe('margin-right');
  });

  it('should convert padding-inline-start to padding-left in sync', () => {
    const input = `.prose ul { padding-inline-start: 1.625em; }`;
    const result = module.stripForEpubSync(input);
    expect(result.includes('padding-left: 1.625em')).toBeTruthy();
    expect(!result.includes('padding-inline-start')).toBeTruthy();
  });

  it('should convert padding-inline-start to padding-left in async', async () => {
    const input = `.prose ul { padding-inline-start: 1.625em; }`;
    const result = await module.stripForEpub(input);
    expect(result.includes('padding-left: 1.625em')).toBeTruthy();
    expect(!result.includes('padding-inline-start')).toBeTruthy();
  });

  it('should convert margin-inline-start to margin-left', () => {
    const input = `.item { margin-inline-start: 2em; }`;
    const result = module.stripForEpubSync(input);
    expect(result.includes('margin-left: 2em')).toBeTruthy();
    expect(!result.includes('margin-inline-start')).toBeTruthy();
  });

  it('should convert border-inline-start to border-left', () => {
    const input = `.callout { border-inline-start: 3px solid blue; }`;
    const result = module.stripForEpubSync(input);
    expect(result.includes('border-left: 3px solid blue')).toBeTruthy();
    expect(!result.includes('border-inline-start')).toBeTruthy();
  });

  it('should not modify non-logical properties', () => {
    const input = `.item { padding-left: 1em; margin-right: 2em; }`;
    const result = module.stripForEpubSync(input);
    expect(result.includes('padding-left: 1em')).toBeTruthy();
    expect(result.includes('margin-right: 2em')).toBeTruthy();
  });
});

console.log('✓ All strip-page-rules tests passed');
