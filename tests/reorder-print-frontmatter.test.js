import { describe, it, expect } from "vitest";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(
  __dirname,
  "..",
  "commands",
  "reorder-print-frontmatter.js",
);

/**
 * A minimal stand-in for pandoc's standalone HTML output: the template emits
 * <nav id="TOC"> *before* $body$, so the first input-files (copyright,
 * dedication) land after the TOC. The script's job is to splice them back in
 * front of the TOC.
 */
const FIXTURE = `<!DOCTYPE html>
<html lang="en-US">
<body>
<header id="title-block-header"><h1 class="title">Fixture Book</h1></header>
<nav id="TOC" role="doc-toc">
<h2 id="toc-title">Contents</h2>
<ul><li><a href="#intro">Intro</a></li></ul>
</nav>
<div id="copyright-page">
<div class="invisible"><h2>Copyright</h2></div>
<div id="copyright-container">
<p>Copyright © 2026 Example Press.</p>
<p>Version <span class="revision">1.0.0 (abc123)</span></p>
</div>
</div>
<div class="dedication">
<p>For everyone who ever waited for bread to rise.</p>
</div>
<section id="intro" class="level1">
<h1>Intro</h1>
<p>Body text.</p>
</section>
</body>
</html>`;

function makeFile(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reorder-frontmatter-"));
  const file = path.join(dir, "book.print.html");
  fs.writeFileSync(file, html);
  return file;
}

function runScript(file) {
  try {
    const stdout = execSync(
      `node ${scriptPath} ${file ? `"${file}"` : ""}`.trim(),
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      status: error.status ?? 1,
    };
  }
}

/** Count non-overlapping occurrences of a literal substring. */
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe("reorder-print-frontmatter: moves front matter ahead of the TOC", () => {
  it('places the copyright page and dedication before <nav id="TOC">', () => {
    const file = makeFile(FIXTURE);
    const { status } = runScript(file);
    expect(status).toBe(0);

    const out = fs.readFileSync(file, "utf8");
    const idxCopyright = out.indexOf('id="copyright-page"');
    const idxDedication = out.indexOf('class="dedication"');
    const idxTOC = out.indexOf('<nav id="TOC"');
    const idxBody = out.indexOf('id="intro"');

    expect(idxCopyright).toBeGreaterThan(-1);
    expect(idxDedication).toBeGreaterThan(-1);
    expect(idxTOC).toBeGreaterThan(-1);

    // Both front-matter blocks precede the TOC…
    expect(idxCopyright).toBeLessThan(idxTOC);
    expect(idxDedication).toBeLessThan(idxTOC);
    // …in reading order (copyright on the verso, then the dedication)…
    expect(idxCopyright).toBeLessThan(idxDedication);
    // …and the TOC still precedes the body.
    expect(idxTOC).toBeLessThan(idxBody);
  });

  it("does not duplicate the blocks it relocates", () => {
    const file = makeFile(FIXTURE);
    runScript(file);

    const out = fs.readFileSync(file, "utf8");
    expect(count(out, 'id="copyright-page"')).toBe(1);
    expect(count(out, 'class="dedication"')).toBe(1);
    expect(count(out, '<nav id="TOC"')).toBe(1);
  });

  it("keeps nested children of the copyright page together (balanced extraction)", () => {
    const file = makeFile(FIXTURE);
    runScript(file);

    const out = fs.readFileSync(file, "utf8");
    const idxTOC = out.indexOf('<nav id="TOC"');

    // The inner container and the revision span move with the outer block,
    // ahead of the TOC — proof the extractor matched the *outer* </div>, not
    // the first nested one.
    expect(out.indexOf('id="copyright-container"')).toBeLessThan(idxTOC);
    expect(out.indexOf('class="revision"')).toBeLessThan(idxTOC);
    // The trailing body section is untouched and stays after the TOC.
    expect(out.indexOf("Body text.")).toBeGreaterThan(idxTOC);
    expect(count(out, "Body text.")).toBe(1);
  });

  it("normalizes order even when the dedication precedes the copyright page in source", () => {
    // Swap the source order: dedication emitted before the copyright page.
    const swapped = FIXTURE.replace(
      /(<div id="copyright-page">[\s\S]*?<\/div>\n<\/div>)\n(<div class="dedication">[\s\S]*?<\/div>)/,
      "$2\n$1",
    );
    expect(swapped).not.toBe(FIXTURE); // guard: the swap actually happened

    const file = makeFile(swapped);
    runScript(file);

    const out = fs.readFileSync(file, "utf8");
    const idxCopyright = out.indexOf('id="copyright-page"');
    const idxDedication = out.indexOf('class="dedication"');
    const idxTOC = out.indexOf('<nav id="TOC"');

    expect(idxCopyright).toBeLessThan(idxDedication);
    expect(idxDedication).toBeLessThan(idxTOC);
  });

  it("reports what it did on success", () => {
    const file = makeFile(FIXTURE);
    const { stdout } = runScript(file);
    expect(stdout).toMatch(
      /Moved copyright page and dedication ahead of the table of contents/,
    );
  });
});

describe("reorder-print-frontmatter: books without some front matter", () => {
  it("moves just the copyright page when there's no dedication", () => {
    const file = makeFile(FIXTURE.replace(/<div class="dedication">[\s\S]*?<\/div>\n/, ""));
    const { status, stdout } = runScript(file);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Moved copyright page ahead of the table of contents/);
    const out = fs.readFileSync(file, "utf8");
    expect(out.indexOf('id="copyright-page"')).toBeLessThan(out.indexOf('<nav id="TOC"'));
  });

  it("moves just the dedication when there's no copyright page", () => {
    const file = makeFile(FIXTURE.replace(/<div id="copyright-page">[\s\S]*?<\/div>\n<\/div>\n/, ""));
    const { status, stdout } = runScript(file);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Moved dedication ahead of the table of contents/);
  });

  it("leaves the file alone when there's neither", () => {
    const html = FIXTURE
      .replace(/<div id="copyright-page">[\s\S]*?<\/div>\n<\/div>\n/, "")
      .replace(/<div class="dedication">[\s\S]*?<\/div>\n/, "");
    const file = makeFile(html);
    const { status, stdout } = runScript(file);
    expect(status).toBe(0);
    expect(stdout).toMatch(/No copyright page or dedication to move/);
    expect(fs.readFileSync(file, "utf8")).toBe(html);
  });
});

describe("reorder-print-frontmatter: fails loudly on unexpected markup", () => {

  it("exits non-zero when the TOC anchor is missing", () => {
    const html = FIXTURE.replace(
      '<nav id="TOC" role="doc-toc">',
      '<nav role="doc-toc">',
    );
    const file = makeFile(html);
    const { status, stderr } = runScript(file);
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/Anchor not found: <nav id="TOC"/);
  });

  it("shows usage when no file argument is given", () => {
    const { status, stderr } = runScript("");
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/Usage: book-kit reorder-print-frontmatter/);
  });
});

console.log("✓ All reorder-print-frontmatter tests passed");
