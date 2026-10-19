import { describe, it, expect } from "vitest";

import { execSync } from "node:child_process";

const __dirname = new URL(".", import.meta.url).pathname;

// Helper: run markdown through pandoc with the Kindle emoji filter
function pandocFilter(markdown, kindle = false) {
  const flags = kindle ? "--metadata kindle=true" : "";
  const cmd = `echo ${JSON.stringify(markdown)} | pandoc -f markdown -t plain --lua-filter=filters/strip-emoji-kindle.lua ${flags}`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Helper: run markdown through the Kindle emoji filter and return HTML
function pandocFilterHtml(markdown) {
  const cmd = `echo ${JSON.stringify(markdown)} | pandoc -f markdown -t html --lua-filter=filters/strip-emoji-kindle.lua --metadata kindle=true`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Helper: run markdown through the callout label filter
function pandocCalloutFilter(markdown, kindle = false) {
  const flags = kindle ? "--metadata kindle=true" : "";
  const cmd = `echo ${JSON.stringify(markdown)} | pandoc -f markdown -t plain --lua-filter=filters/add-div-titles.lua ${flags}`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Helper: run markdown through the callout label filter and return HTML
function pandocCalloutFilterHtml(markdown, kindle = false) {
  const flags = kindle ? "--metadata kindle=true" : "";
  const cmd = `echo ${JSON.stringify(markdown)} | pandoc -f markdown -t html --lua-filter=filters/add-div-titles.lua ${flags}`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Helper: run markdown through the callout label filter in PDF mode and return HTML
function pandocCalloutFilterPdfHtml(markdown) {
  const cmd = `echo ${JSON.stringify(markdown)} | pandoc -f markdown -t html --lua-filter=filters/add-div-titles.lua --metadata pdf=true`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// ── strip-emoji-kindle.lua ──────────────────────────────────────────

describe("strip-emoji-kindle: mapped emoji → B&W equivalents", () => {
  // ❌/✅ are now images, not text — their ✗/✓ text fallbacks tofu on Kindle.
  // (-t plain renders an Image as [alt].)
  it("❌ → [cross] image (✗ text tofus on Kindle)", () => {
    expect(pandocFilter("❌")).toBe("[cross]");
  });

  it("✅ → [check] image, heavy-check 2714 (✓ tofus; 2705 is a filled box)", () => {
    expect(pandocFilter("✅")).toBe("[check]");
  });

  it("👆 → ↑", () => {
    expect(pandocFilter("👆")).toBe("↑");
  });

  it("👈 → ←", () => {
    expect(pandocFilter("👈")).toBe("←");
  });
});

describe("strip-emoji-kindle: mapped emoji → inline images (plain text shows [alt])", () => {
  // pandoc -t plain renders Image elements as [alt], so plain text output
  // wraps the alt text in brackets. HTML output produces <img> tags (tested below).
  it("👍 → [thumbs-up]", () => {
    expect(pandocFilter("👍")).toBe("[thumbs-up]");
  });

  it("🎉 → [party]", () => {
    expect(pandocFilter("🎉")).toBe("[party]");
  });

  it("😂 → [laughing]", () => {
    expect(pandocFilter("😂")).toBe("[laughing]");
  });

  it("👀 → [eyes]", () => {
    expect(pandocFilter("👀")).toBe("[eyes]");
  });

  it("😄 → [grin]", () => {
    expect(pandocFilter("😄")).toBe("[grin]");
  });

  it("😊 → [smile]", () => {
    expect(pandocFilter("😊")).toBe("[smile]");
  });

  it("😃 → [smiley]", () => {
    expect(pandocFilter("😃")).toBe("[smiley]");
  });

  it("🤣 → [rofl]", () => {
    expect(pandocFilter("🤣")).toBe("[rofl]");
  });

  it("👏 → [clap]", () => {
    expect(pandocFilter("👏")).toBe("[clap]");
  });

  it("🙏 → [folded-hands]", () => {
    expect(pandocFilter("🙏")).toBe("[folded-hands]");
  });

  it("🙌 → [raised-hands]", () => {
    expect(pandocFilter("🙌")).toBe("[raised-hands]");
  });

  it("🤔 → [thinking]", () => {
    expect(pandocFilter("🤔")).toBe("[thinking]");
  });

  it("😏 → [smirk]", () => {
    expect(pandocFilter("😏")).toBe("[smirk]");
  });

  it("🎂 → [cake]", () => {
    expect(pandocFilter("🎂")).toBe("[cake]");
  });
});

describe("strip-emoji-kindle: image emoji produce <img> tags in HTML", () => {
  it("👍 → <img> with emoji class and correct src", () => {
    const html = pandocFilterHtml("👍");
    expect(html.includes("<img"), "should contain an img tag").toBeTruthy();
    expect(
      html.includes('class="emoji"'),
      "should have emoji class",
    ).toBeTruthy();
    expect(
      html.includes('src="img/emoji-kindle/1f44d.png"'),
      "should reference correct PNG",
    ).toBeTruthy();
    expect(
      html.includes('alt="thumbs-up"'),
      "should have alt text",
    ).toBeTruthy();
  });

  it("🎉 → <img> with correct src", () => {
    const html = pandocFilterHtml("🎉");
    expect(
      html.includes('src="img/emoji-kindle/1f389.png"'),
      "should reference correct PNG",
    ).toBeTruthy();
  });

  it("B&W emoji do not produce images", () => {
    // Arrows still use text equivalents (they render reliably on Kindle);
    // ❌/✅ moved to images because their ✗/✓ text fallbacks tofu.
    const html = pandocFilterHtml("👈");
    expect(
      !html.includes("<img"),
      "B&W equivalents should not use images",
    ).toBeTruthy();
    expect(html.includes("←"), "should contain B&W replacement").toBeTruthy();
  });
});

describe("strip-emoji-kindle: catch-all strips unmapped emoji", () => {
  it("strips unmapped high-plane emoji", () => {
    expect(pandocFilter("A🎮B🌍C")).toBe("ABC");
  });

  it("strips 🔥 🚀 💯 📱", () => {
    expect(pandocFilter("before🔥🚀💯📱after")).toBe("beforeafter");
  });

  it("strips emoji but keeps surrounding text", () => {
    const result = pandocFilter("Hello 🌟 world");
    expect(result).toBe("Hello world");
  });
});

describe("strip-emoji-kindle: preserves safe characters", () => {
  it("preserves ASCII text", () => {
    expect(pandocFilter("Hello world")).toBe("Hello world");
  });

  it("preserves B&W replacement characters (✗ ✓ ↑ ←)", () => {
    const result = pandocFilter("✗ ✓ ↑ ←");
    expect(result).toBe("✗ ✓ ↑ ←");
  });

  it("preserves section break ornament (⁕)", () => {
    expect(pandocFilter("⁕").includes("⁕")).toBeTruthy();
  });

  it("preserves common punctuation and symbols", () => {
    expect(pandocFilter("em dash and hyphens")).toBe("em dash and hyphens");
  });
});

describe("strip-emoji-kindle: mixed content", () => {
  it("handles mapped + unmapped in same string", () => {
    const result = pandocFilter("👍 and 🌟 and ❌");
    expect(result).toBe("[thumbs-up] and and [cross]");
  });

  it("handles emoji adjacent to punctuation", () => {
    const result = pandocFilter("Great👍!");
    expect(result).toBe("Great[thumbs-up]!");
  });

  it("handles multiple emoji in sequence", () => {
    const result = pandocFilter("😂🤣😄");
    expect(result).toBe("[laughing][rofl][grin]");
  });
});

// ── add-div-titles.lua (Kindle mode) ───────────────────────────────

describe("add-div-titles: Kindle callout labels have inline Twemoji images", () => {
  it("pro-tip: has light-bulb image", () => {
    const md = "::: {.pro-tip}\nTip content.\n:::";
    const result = pandocCalloutFilter(md, true);
    expect(
      result.includes("Pro-Tip:"),
      "should contain Pro-Tip label",
    ).toBeTruthy();
    expect(
      result.includes("[light bulb]"),
      "should contain image alt text",
    ).toBeTruthy();
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('src="img/emoji-kindle/1f4a1.png"'),
      "should reference light-bulb PNG",
    ).toBeTruthy();
    expect(
      html.includes("callout-emoji"),
      "should have callout-emoji class",
    ).toBeTruthy();
  });

  it("for-managers: has necktie image", () => {
    const md = "::: {.for-managers}\nManager content.\n:::";
    const result = pandocCalloutFilter(md, true);
    expect(
      result.includes("For managers:"),
      "should contain For managers label",
    ).toBeTruthy();
    expect(
      result.includes("[necktie]"),
      "should contain image alt text",
    ).toBeTruthy();
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('src="img/emoji-kindle/1f454.png"'),
      "should reference necktie PNG",
    ).toBeTruthy();
  });

  it("for-ics: has laptop image", () => {
    const md = "::: {.for-ics}\nIC content.\n:::";
    const result = pandocCalloutFilter(md, true);
    expect(
      result.includes("For individual contributors:"),
      "should contain IC label",
    ).toBeTruthy();
    expect(
      result.includes("[laptop]"),
      "should contain image alt text",
    ).toBeTruthy();
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('src="img/emoji-kindle/1f4bb.png"'),
      "should reference laptop PNG",
    ).toBeTruthy();
  });

  it("common-objection: has thinking image", () => {
    const md = "::: {.common-objection}\nObjection content.\n:::";
    const result = pandocCalloutFilter(md, true);
    expect(
      result.includes("Common objection:"),
      "should contain objection label",
    ).toBeTruthy();
    expect(
      result.includes("[thinking]"),
      "should contain image alt text",
    ).toBeTruthy();
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('src="img/emoji-kindle/1f914.png"'),
      "should reference thinking PNG",
    ).toBeTruthy();
  });

  it("emoji is inline with label text", () => {
    const md = "::: {.pro-tip}\nTip content.\n:::";
    const html = pandocCalloutFilterHtml(md, true);
    // Image should be inline with the label in the same <p>, not on a separate line
    expect(
      html.match(/<p><img[^>]*callout-emoji[^>]*>.*callout-label/s),
      "image should be inline with label",
    ).toBeTruthy();
  });
});

describe("add-div-titles: EPUB callout labels have emoji", () => {
  it("pro-tip has 💡 in EPUB mode", () => {
    const md = "::: {.pro-tip}\nTip content.\n:::";
    const result = pandocCalloutFilter(md, false);
    expect(
      result.includes("Pro-Tip:"),
      "should contain Pro-Tip label",
    ).toBeTruthy();
    expect(result.includes("💡"), "should contain 💡 emoji").toBeTruthy();
  });

  it("for-managers has 👔 in EPUB mode", () => {
    const md = "::: {.for-managers}\nManager content.\n:::";
    const result = pandocCalloutFilter(md, false);
    expect(result.includes("👔"), "should contain 👔 emoji").toBeTruthy();
  });

  it("for-ics has 💻 in EPUB mode", () => {
    const md = "::: {.for-ics}\nIC content.\n:::";
    const result = pandocCalloutFilter(md, false);
    expect(
      result.includes("For individual contributors:"),
      "should contain IC label",
    ).toBeTruthy();
    expect(result.includes("💻"), "should contain 💻 emoji").toBeTruthy();
  });

  it("common-objection has 🤔 in EPUB mode", () => {
    const md = "::: {.common-objection}\nObjection content.\n:::";
    const result = pandocCalloutFilter(md, false);
    expect(
      result.includes("Common objection:"),
      "should contain objection label",
    ).toBeTruthy();
    expect(result.includes("🤔"), "should contain 🤔 emoji").toBeTruthy();
  });

  it("tldr has text-only label in EPUB mode (no emoji)", () => {
    const md = "::: {.tldr}\nSummary content.\n:::";
    const result = pandocCalloutFilter(md, false);
    expect(
      result.includes("TL;DR:"),
      "should contain TL;DR label",
    ).toBeTruthy();
    // TL;DR is the only callout without an emoji in any format
    const html = pandocCalloutFilterHtml(md, false);
    expect(
      html.includes("callout-label"),
      "should have callout-label class",
    ).toBeTruthy();
    expect(
      html.includes("callout-emoji"),
      "TL;DR should not have emoji image",
    ).toBeFalsy();
  });
});

// ── add-div-titles.lua (PDF mode) ──────────────────────────────────
// PDF uses opaque #e8e8e8-flattened Twemoji PNGs from img/emoji-print-callout/
// (not the transparent originals, and not img/emoji-kindle/). Opaque because the
// PDF/X-1a step's -dNOTRANSPARENCY drops alpha, turning transparent Twemoji into
// dark boxes; flattening onto the callout fill removes the alpha and the box.
// WeasyPrint 64+ crashes with emoji in CSS content:, so the Lua filter
// injects <img> elements instead. Regression: if the filter isn't run
// (missing --lua-filter or --metadata pdf=true), the print CSS
// `content: none !important` hides all callout labels.

// Helper: run markdown through the callout label filter in PDF mode
function pandocCalloutFilterPdf(markdown) {
  const cmd = `echo ${JSON.stringify(markdown)} | pandoc -f markdown+fenced_divs -t html --lua-filter=filters/add-div-titles.lua --metadata pdf=true`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

describe("add-div-titles: PDF callout labels have opaque flattened Twemoji images", () => {
  it("tldr: has text-only label (no emoji)", () => {
    const md = "::: {.tldr}\nSummary content.\n:::";
    const html = pandocCalloutFilterPdf(md);
    expect(
      html.includes("callout-label"),
      "should have callout-label class",
    ).toBeTruthy();
    expect(html.includes("TL;DR:"), "should contain TL;DR label").toBeTruthy();
    expect(
      html.includes("callout-emoji"),
      "TL;DR should not have emoji image",
    ).toBeFalsy();
  });

  it("pro-tip: has light-bulb image from img/emoji-print-callout/", () => {
    const md = "::: {.pro-tip}\nTip content.\n:::";
    const html = pandocCalloutFilterPdf(md);
    expect(
      html.includes("Pro-Tip:"),
      "should contain Pro-Tip label",
    ).toBeTruthy();
    expect(
      html.includes("callout-label"),
      "should have callout-label class",
    ).toBeTruthy();
    expect(
      html.includes('src="../img/emoji-print-callout/1f4a1.png"'),
      "should reference opaque #e8e8e8-flattened light-bulb PNG",
    ).toBeTruthy();
    expect(
      html.includes("callout-emoji"),
      "should have callout-emoji class",
    ).toBeTruthy();
  });

  it("for-managers: has necktie image from img/emoji-print-callout/", () => {
    const md = "::: {.for-managers}\nManager content.\n:::";
    const html = pandocCalloutFilterPdf(md);
    expect(
      html.includes("For managers:"),
      "should contain For managers label",
    ).toBeTruthy();
    expect(
      html.includes('src="../img/emoji-print-callout/1f454.png"'),
      "should reference opaque #e8e8e8-flattened necktie PNG",
    ).toBeTruthy();
  });

  it("for-ics: has laptop image from img/emoji-print-callout/", () => {
    const md = "::: {.for-ics}\nIC content.\n:::";
    const html = pandocCalloutFilterPdf(md);
    // pandoc line-wraps the long IC label ("For individual\ncontributors:"),
    // so collapse whitespace before matching the label text.
    expect(
      html.replace(/\s+/g, " ").includes("For individual contributors:"),
      "should contain IC label",
    ).toBeTruthy();
    expect(
      html.includes('src="../img/emoji-print-callout/1f4bb.png"'),
      "should reference opaque #e8e8e8-flattened laptop PNG",
    ).toBeTruthy();
  });

  it("common-objection: has thinking image from img/emoji-print-callout/", () => {
    const md = "::: {.common-objection}\nObjection content.\n:::";
    const html = pandocCalloutFilterPdf(md);
    expect(
      html.includes("Common objection:"),
      "should contain objection label",
    ).toBeTruthy();
    expect(
      html.includes('src="../img/emoji-print-callout/1f914.png"'),
      "should reference opaque #e8e8e8-flattened thinking PNG",
    ).toBeTruthy();
  });

  // Callout labels sit on the #e8e8e8 print callout fill, so they use the
  // opaque #e8e8e8-flattened set (img/emoji-print-callout/) — NOT the Kindle
  // white-under-alpha set, and NOT the transparent originals (which flatten to
  // a dark box under the PDF/X-1a step's -dNOTRANSPARENCY).
  it("PDF callout emoji uses img/emoji-print-callout/, not Kindle or raw sets", () => {
    const md = "::: {.pro-tip}\nTip content.\n:::";
    const html = pandocCalloutFilterPdf(md);
    expect(
      html.includes("img/emoji-print-callout/"),
      "should use print-callout emoji directory",
    ).toBeTruthy();
    expect(
      html.includes("img/emoji-kindle/"),
      "should NOT use Kindle emoji directory",
    ).toBeFalsy();
    expect(
      html.includes('src="../img/emoji/'),
      "should NOT use the transparent originals (dark box under -dNOTRANSPARENCY)",
    ).toBeFalsy();
  });
});

// ── body-emoji-images.lua (PDF body text) ──────────────────────────
// Converts raw body-text emoji to sized <img> for the print PDF, because
// WeasyPrint's fallback emoji font renders them small and baseline-high.
// Wired into the `just pdf` recipe only.

function pandocBodyEmoji(markdown) {
  const cmd = `echo ${JSON.stringify(markdown)} | pandoc -f markdown -t html --lua-filter=filters/body-emoji-images.lua`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}

describe("body-emoji-images: PDF body emoji become sized images", () => {
  it("Supplemental-plane emoji → opaque white-flattened Twemoji img", () => {
    const html = pandocBodyEmoji("A well-placed 😂 lightens the mood.");
    expect(
      html.includes('src="../img/emoji-print-body/1f602.png"'),
      "😂 → ../img/emoji-print-body/1f602.png",
    ).toBeTruthy();
    expect(html.includes('class="emoji"'), "uses emoji class").toBeTruthy();
  });

  it("do/don't markers → white-flattened images (❌→274c, ✅→2714 heavy check)", () => {
    const html = pandocBodyEmoji("❌ no, ✅ yes");
    expect(
      html.includes('src="../img/emoji-print-body/274c.png"'),
      "❌ → 274c",
    ).toBeTruthy();
    expect(
      html.includes('src="../img/emoji-print-body/2714.png"'),
      "✅ → 2714 heavy check (not its own filled 2705 glyph)",
    ).toBeTruthy();
  });

  it("non-emoji text is preserved verbatim", () => {
    const html = pandocBodyEmoji("just plain words here");
    expect(html.includes("just plain words here")).toBeTruthy();
    expect(!html.includes("<img"), "no images for plain text").toBeTruthy();
  });
});

// ── Lua filter: duplicate prevention ────────────────────────────────
// The filter has startsWithText() to avoid double-labeling when content
// already contains the prefix. If broken, every callout gets doubled labels.

describe("add-div-titles: duplicate prevention", () => {
  it("does not double-label tldr that already starts with TL;DR:", () => {
    const md = "::: {.tldr}\nTL;DR: Already has prefix.\n:::";
    const result = pandocCalloutFilter(md, false);
    const count = (result.match(/TL;DR:/g) || []).length;
    expect(count, "TL;DR: should appear exactly once").toBe(1);
  });

  it("does not double-label pro-tip that already starts with 💡", () => {
    const md = "::: {.pro-tip}\n💡 Pro-Tip: Already has prefix.\n:::";
    const result = pandocCalloutFilter(md, false);
    const count = (result.match(/Pro-Tip:/g) || []).length;
    expect(count, "Pro-Tip: should appear exactly once").toBe(1);
  });

  it("does not double-label for-managers that already starts with 👔", () => {
    const md = "::: {.for-managers}\n👔 For managers: Already has prefix.\n:::";
    const result = pandocCalloutFilter(md, false);
    const count = (result.match(/For managers:/g) || []).length;
    expect(count, "For managers: should appear exactly once").toBe(1);
  });

  it("does not double-label for-ics that already starts with 💻", () => {
    const md =
      "::: {.for-ics}\n💻 For individual contributors: Already has prefix.\n:::";
    const result = pandocCalloutFilter(md, false);
    const count = (result.match(/For individual contributors:/g) || []).length;
    expect(
      count,
      "For individual contributors: should appear exactly once",
    ).toBe(1);
  });

  it("does not double-label common-objection that already starts with 🤔", () => {
    const md =
      "::: {.common-objection}\n🤔 Common objection: Already has prefix.\n:::";
    const result = pandocCalloutFilter(md, false);
    const count = (result.match(/Common objection:/g) || []).length;
    expect(count, "Common objection: should appear exactly once").toBe(1);
  });
});

// ── Lua filter: DOCX mode (default/EPUB mode, no metadata flag) ────
// DOCX uses the lua filter without --metadata kindle=true or pdf=true,
// so it runs in default "epub" mode with inline text emoji.

describe("add-div-titles: DOCX mode (default/epub mode)", () => {
  it("all callout types get labels in default mode", () => {
    const callouts = [
      { cls: "tldr", label: "TL;DR:" },
      { cls: "pro-tip", label: "Pro-Tip:" },
      { cls: "for-managers", label: "For managers:" },
      { cls: "for-ics", label: "For individual contributors:" },
      { cls: "common-objection", label: "Common objection:" },
    ];
    for (const { cls, label } of callouts) {
      const md = `::: {.${cls}}\nContent.\n:::`;
      const html = pandocCalloutFilterHtml(md, false);
      // Normalize whitespace (pandoc wraps long labels across lines)
      const normalized = html.replace(/\s+/g, " ");
      expect(
        normalized.includes("callout-label"),
        `${cls} should have callout-label class`,
      ).toBeTruthy();
      expect(
        normalized.includes(label),
        `${cls} should contain "${label}"`,
      ).toBeTruthy();
    }
  });
});

// ── Lua filter: ARIA roles in HTML output ───────────────────────────
// Verify runtime HTML output has correct role and aria-label attributes,
// not just static code inspection of the Lua source.

describe("add-div-titles: ARIA roles appear in HTML output", () => {
  it('callout divs get role="doc-notice"', () => {
    const calloutTypes = [
      "tldr",
      "pro-tip",
      "for-managers",
      "for-ics",
      "common-objection",
    ];
    for (const cls of calloutTypes) {
      const md = `::: {.${cls}}\nContent.\n:::`;
      const html = pandocCalloutFilterHtml(md, false);
      expect(
        html.includes('role="doc-notice"'),
        `${cls} should have role="doc-notice"`,
      ).toBeTruthy();
    }
  });

  it("callout divs get appropriate aria-label", () => {
    const cases = [
      { cls: "tldr", label: "Summary" },
      { cls: "pro-tip", label: "Pro tip" },
      { cls: "for-managers", label: "Guidance for managers" },
      { cls: "for-ics", label: "Guidance for individual contributors" },
      { cls: "common-objection", label: "Common objection" },
    ];
    for (const { cls, label } of cases) {
      const md = `::: {.${cls}}\nContent.\n:::`;
      const html = pandocCalloutFilterHtml(md, false);
      expect(
        html.includes(`aria-label="${label}"`),
        `${cls} should have aria-label="${label}"`,
      ).toBeTruthy();
    }
  });

  it('takeaways div gets role="doc-notice" and aria-label', () => {
    const md = "::: {.takeaways}\n### Key Takeaways\n- Point one\n:::";
    const html = pandocCalloutFilterHtml(md, false);
    expect(
      html.includes('role="doc-notice"'),
      'takeaways should have role="doc-notice"',
    ).toBeTruthy();
    expect(
      html.includes('aria-label="Key takeaways"'),
      "takeaways should have aria-label",
    ).toBeTruthy();
  });

  it('dedication div gets role="doc-dedication"', () => {
    const md = "::: {.dedication}\nFor my family.\n:::";
    const html = pandocCalloutFilterHtml(md, false);
    expect(
      html.includes('role="doc-dedication"'),
      'dedication should have role="doc-dedication"',
    ).toBeTruthy();
  });
});

// ── Lua filter cross-mode coverage ──────────────────────────────────

describe("add-div-titles: takeaways cross-mode coverage", () => {
  it("takeaways gets ARIA role in Kindle mode", () => {
    const md = "::: {.takeaways}\n### Key Takeaways\n- Point one\n:::";
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('role="doc-notice"'),
      'takeaways should have role="doc-notice" in Kindle',
    ).toBeTruthy();
    expect(
      html.includes('aria-label="Key takeaways"'),
      "takeaways should have aria-label in Kindle",
    ).toBeTruthy();
  });

  it("takeaways gets ARIA role in PDF mode", () => {
    const md = "::: {.takeaways}\n### Key Takeaways\n- Point one\n:::";
    const html = pandocCalloutFilterPdfHtml(md);
    expect(
      html.includes('role="doc-notice"'),
      'takeaways should have role="doc-notice" in PDF',
    ).toBeTruthy();
    expect(
      html.includes('aria-label="Key takeaways"'),
      "takeaways should have aria-label in PDF",
    ).toBeTruthy();
  });
});

describe("add-div-titles: dedication cross-mode coverage", () => {
  it('dedication gets role="doc-dedication" in Kindle mode', () => {
    const md = "::: {.dedication}\nFor my family.\n:::";
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('role="doc-dedication"'),
      "dedication should have role in Kindle",
    ).toBeTruthy();
  });

  it('dedication gets role="doc-dedication" in PDF mode', () => {
    const md = "::: {.dedication}\nFor my family.\n:::";
    const html = pandocCalloutFilterPdfHtml(md);
    expect(
      html.includes('role="doc-dedication"'),
      "dedication should have role in PDF",
    ).toBeTruthy();
  });
});

describe("add-div-titles: tldr in Kindle mode", () => {
  it("tldr gets label in Kindle mode", () => {
    const md = "::: {.tldr}\nSummary of key point.\n:::";
    const result = pandocCalloutFilter(md, true);
    expect(
      result.includes("TL;DR:"),
      "tldr should have TL;DR: label in Kindle mode",
    ).toBeTruthy();
  });

  it("tldr gets ARIA role in Kindle mode", () => {
    const md = "::: {.tldr}\nSummary.\n:::";
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('role="doc-notice"'),
      'tldr should have role="doc-notice" in Kindle',
    ).toBeTruthy();
    expect(
      html.includes('aria-label="Summary"'),
      'tldr should have aria-label="Summary" in Kindle',
    ).toBeTruthy();
  });
});

// ── add-div-titles.lua: copyright-page colophon role (lines 203-204) ─

describe("add-div-titles: copyright-page colophon role", () => {
  it('copyright-page ID gets role="doc-colophon"', () => {
    const md =
      "::: {#copyright-page}\nCopyright © 2024. All rights reserved.\n:::";
    const html = pandocCalloutFilterHtml(md, false);
    expect(
      html.includes('role="doc-colophon"'),
      'copyright-page should have role="doc-colophon"',
    ).toBeTruthy();
  });

  it('copyright-page in Kindle mode gets role="doc-colophon"', () => {
    const md = "::: {#copyright-page}\nCopyright info.\n:::";
    const html = pandocCalloutFilterHtml(md, true);
    expect(
      html.includes('role="doc-colophon"'),
      'copyright-page should have role="doc-colophon" in Kindle mode',
    ).toBeTruthy();
  });
});

// ── add-div-titles.lua: empty callout divs (line 45) ────────────────

describe("add-div-titles: empty callout divs", () => {
  const calloutTypes = [
    "tldr",
    "pro-tip",
    "for-managers",
    "for-ics",
    "common-objection",
  ];

  it("empty callout divs do not crash in EPUB mode", () => {
    for (const cls of calloutTypes) {
      const md = `::: {.${cls}}\n:::`;
      const html = pandocCalloutFilterHtml(md, false);
      expect(
        html,
        `empty .${cls} should produce some HTML output`,
      ).toBeTruthy();
    }
  });

  it("empty callout divs do not crash in Kindle mode", () => {
    for (const cls of calloutTypes) {
      const md = `::: {.${cls}}\n:::`;
      const html = pandocCalloutFilterHtml(md, true);
      expect(
        html,
        `empty .${cls} should produce some HTML output in Kindle mode`,
      ).toBeTruthy();
    }
  });
});

// ── add-div-titles.lua: non-paragraph first element (lines 79, 97, 122) ─

describe("add-div-titles: non-paragraph first element", () => {
  it("callout starting with blockquote gets label as separate element", () => {
    const md = "::: {.pro-tip}\n> This is a blockquote inside a callout\n:::";
    const html = pandocCalloutFilterHtml(md, false);
    const normalized = html.replace(/\s+/g, " ");
    expect(
      normalized.includes("callout-label"),
      "blockquote callout should have callout-label",
    ).toBeTruthy();
    expect(
      normalized.includes("Pro-Tip:"),
      "blockquote callout should have Pro-Tip: label",
    ).toBeTruthy();
  });

  it("callout starting with code block gets label", () => {
    const md = "::: {.common-objection}\n~~~\nsome code\n~~~\n:::";
    const html = pandocCalloutFilterHtml(md, false);
    const normalized = html.replace(/\s+/g, " ");
    expect(
      normalized.includes("callout-label"),
      "code block callout should have callout-label",
    ).toBeTruthy();
    expect(
      normalized.includes("Common objection:"),
      "code block callout should have label",
    ).toBeTruthy();
  });

  it("callout starting with list gets label", () => {
    const md = "::: {.for-managers}\n- First item\n- Second item\n:::";
    const html = pandocCalloutFilterHtml(md, false);
    const normalized = html.replace(/\s+/g, " ");
    expect(
      normalized.includes("callout-label"),
      "list callout should have callout-label",
    ).toBeTruthy();
    expect(
      normalized.includes("For managers:"),
      "list callout should have label",
    ).toBeTruthy();
  });

  it("tldr starting with blockquote gets label (no-emoji path)", () => {
    const md = "::: {.tldr}\n> Summary quote\n:::";
    const html = pandocCalloutFilterHtml(md, false);
    const normalized = html.replace(/\s+/g, " ");
    expect(
      normalized.includes("TL;DR:"),
      "tldr blockquote should have TL;DR: label",
    ).toBeTruthy();
  });
});
