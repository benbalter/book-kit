# book-kit

Build and quality tooling for books written in Markdown. One source, every format a self-published book needs:

- **EPUB 3** for Apple Books, Kobo, Google Play, Draft2Digital, and IngramSpark, with EPUB accessibility metadata, DPUB-ARIA roles, and a clean EPUBCheck run against two rule sets
- **Kindle EPUB** with static fonts, e-ink-safe emoji, and links turned into footnotes
- **Print PDF** (6×9 trade paperback by default), rendered by WeasyPrint, with a lockable page count so a toolchain bump can't silently invalidate a cover spine
- **PDF/X-1a:2001** (CMYK, no transparency) for print-on-demand services
- **HTML** and **DOCX**

It's [pandoc](https://pandoc.org), [WeasyPrint](https://weasyprint.org), and [Tailwind CSS](https://tailwindcss.com) wired together with [just](https://just.systems), plus the fixes that make each retailer happy.

> [!NOTE]
> **Early alpha.** book-kit was extracted from the build for [*Open and Async*](https://open-and-async.com), and it still builds that book's published editions. The extraction isn't finished: some of the book's conventions are still hard-coded in the kit rather than set in config (tracked in [#12](https://github.com/benbalter/book-kit/issues/12)), and config keys and defaults may change between 0.x releases.

## Quick start

A book is a directory with a `book.config.yml`, an `index.yml` listing chapters in order, and Markdown in `src/`. [`example/`](example/) is a complete one.

```sh
npm install --save-dev book-kit
```

`justfile`:

```just
set allow-duplicate-recipes
import 'node_modules/book-kit/just/book-kit.just'
```

`src/style.css`:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@import "book-kit/css/theme.css";
@source "../node_modules/book-kit/templates";
@source "../node_modules/book-kit/filters";
```

`theme.css` imports the theme's sections from `css/theme/` (tokens, fonts, base, callouts, e-reader, dark mode, print, and so on). To leave one out, import the others yourself in the same order instead, for example everything but `09-back-matter.css`.

Then `just all` builds every format into `dist/`. `just --list` shows each recipe; the ones beyond the format builds:

| Recipe | What it does |
| --- | --- |
| `just arc` | Advance reader copy EPUBs (see [below](#advance-reader-copies)) |
| `just check-all` | Validators, Markdown lint, and prose lint: what a pull request should pass |
| `just check` | Checks on built output: the print page-count lock and EPUB size budgets |
| `just epubcheck` | EPUBCheck on the built EPUBs |
| `just reference-docx` | Regenerate `reference.docx`, the heading and body styles for the DOCX build |
| `just key-takeaways` | Regenerate each section's key takeaways chapter from its chapters' TL;DRs |
| `just optimize-images` | Losslessly recompress PNGs under `paths.img` |
| `just revision` | Print the build stamp (`<version> (<sha>)`) |
| `just release-files [tag]` | Copy the built formats to version-named files with checksums (see [below](#release-files)) |
| `just clean` | Remove build output |

### Requirements

The exact versions live in [`toolchain.json`](toolchain.json). pandoc and WeasyPrint versions affect pagination, so they're pinned.

- [pandoc](https://pandoc.org/installing.html), [just](https://just.systems), Node.js
- Python packages from [`requirements.txt`](requirements.txt) (WeasyPrint, Pillow, pikepdf, python-docx, fontTools)
- Network access on the first build: `book-kit fonts` downloads the pinned Source font releases and builds the theme's subsets into `~/.cache/book-kit` (set `BOOK_KIT_CACHE` to move it)
- Ghostscript, for PDF/X
- Java and [EPUBCheck](https://www.w3.org/publishing/epubcheck/), for `just epubcheck`

Or use the Docker image, which has everything except Java and EPUBCheck: see [`docker/Dockerfile`](docker/Dockerfile). Run EPUBCheck outside it, or in CI with the [`epubcheck`](actions/epubcheck/action.yml) action.

## Configuration

Everything is in `book.config.yml`. [`defaults/book.config.yml`](defaults/book.config.yml) documents every key and its default; a book only sets what differs.

### Presets

A preset is a shared house style: a directory with a `preset.yml` whose keys sit between the kit defaults and the book's own. Name one or more in `extends`:

```yaml
extends: business-nonfiction   # or a list; later presets win
```

An entry can be a kit preset (in [`presets/`](presets/)), a path relative to the file naming it (`./style`), or an npm package with a `preset.yml` at its root. Presets can extend other presets. The book's keys always win. Lists replace a preset's lists wholesale, as they do the defaults.

The kit ships [`business-nonfiction`](presets/business-nonfiction/preset.yml): six callouts (`tldr`, `pro-tip`, `for-managers`, `for-ics`, `common-objection`, `takeaways`), a TL;DR that opens every chapter, section takeaways chapters, and the house-style validators (section openers, smallcaps acronyms, dash and quote rules, prose habits).

**Upgrading from 0.3:** through 0.3, that preset *was* the kit default. In 0.4 the defaults are neutral, so a 0.3 book keeps its exact configuration by adding one line, `extends: business-nonfiction`. [`tests/presets.test.js`](tests/presets.test.js) checks that the two resolve identically.

`book-kit config --sources [key]` shows which layer (kit defaults, a preset, or `book.config.yml`) set each key.

### Callouts

Fenced divs become labeled callouts in every format. The defaults have three, `note`, `tip`, and `warning`, styled by the theme (the business-nonfiction preset swaps in its six):

```markdown
::: {.tip custom-style="tip"}
Keep callouts short.
:::
```

The build adds the label ("Tip:"), the ARIA role, and, for callouts with an `emoji`, per-format icons (emoji text in EPUB, Twemoji images on Kindle and in print). Change the set with the `callouts` list. A class you add gets the theme's note styling and its label in every format with no CSS; give it its own look in the book's stylesheet, or set `generic: false` on the entry to start from nothing.

### Validation

`just check-all` runs three checks:
- `book-kit validate` checks structure: cross-references, `index.yml` against the files on disk, footnotes, heading levels, balanced callout divs, duplicate headings, and leftover TODOs. The business-nonfiction preset adds its house-style checks (required TL;DRs, section openers, smallcaps acronyms, dashes and quotes, paragraph length, and more).
- `just lint` runs markdownlint.
- `just prose` runs textlint with mechanical rules (misspellings, doubled spaces, unmatched pairs). The business-nonfiction preset adds the kit's rules for clichés, buzzwords, vague intensifiers, cultural idioms, assumptive phrasing, AI-sounding patterns, and bare acronyms, along with terminology, sentence-length, and comma limits. On GitHub Actions, each finding is reported as an annotation on its file and line.

Both lint configs layer like `book.config.yml`. The kit's base configs in [`configs/`](configs/) are merged with `lint.textlint` and `lint.markdownlint` from presets and the book. `lint.rules` switches the kit's own textlint rules on, off, or to an options object, such as `no-cliches: { allow: [Leverage] }`. A preset can ship its own textlint rules in a `rules/` directory. A book with its own `.textlintrc` or `.markdownlint-cli2.jsonc` uses that file as is.

Tune severity (`error`, `warn`, `on`, or `off`, per validator), thresholds (`validators.options.<name>`, e.g. `tldr-length: { max_words: 60 }`), or intentional exceptions under `validators` in `book.config.yml`; [`defaults/book.config.yml`](defaults/book.config.yml) lists the options.

Every validator is an ES module with the same shape, whether it's one of the kit's built-ins in [`validators/`](validators/), ships in a preset's `validators/` directory (every `*.js` there runs for books that extend the preset), or is a book's own plugin:

```js
// checks/house-style.js, listed under validators.plugins
export default {
  name: 'house-style',
  tags: ['style'],
  defaults: { max_exclamations: 3 },
  run({ config, indexFiles, chapters, options, allow }) {
    return { errors: [], warnings: [] };
  },
};
```

`options` is `defaults` merged with `validators.options.house-style`, and `allow` is the set from `validators.allow.house-style`. A `validators.plugins` entry is a path relative to the book or the name of an npm package installed in the book. Built-ins run first, then preset validators, then plugins.

`book-kit validate --list` prints the built-in validator names; `--list --verbose` shows every validator with its severity, tags, and where it comes from.

### Overriding a step

Define a recipe with the same name in the book's `justfile` and it replaces the kit's.

Book-specific Lua filters go in `build.extra_filters`, which slots them into each format's chain. To change the chain itself, set `build.filters.<format>`. It's an ordered list of kit filter names, book-relative paths (`./filters/mine.lua`), and the literal `extra_filters`. `build.templates.<format>` picks the pandoc template the same way. A preset can ship `filters/` and `templates/` directories, and its files are found by bare name before the kit's.

Text the build adds to the book lives under `strings` (the ARC notice, the EPUB cover's screen-reader label, the table-of-contents entry for the copyright page), so a book in another language can translate it. Translated accessibility summaries live under `accessibility.summary_translations`.

For one-off pandoc options on the `epub`, `kindle`, and `html` builds, set `BOOK_KIT_PANDOC_ARGS` (e.g. `BOOK_KIT_PANDOC_ARGS='--toc-depth=3' just epub`); the recipes take no arguments, so `just epub kindle html` runs all three.

## Continuous integration

```yaml
jobs:
  build:
    uses: benbalter/book-kit/.github/workflows/build.yml@v0.6
    permissions:
      contents: read
```

Builds every format, runs EPUBCheck 4.x and 5.x, validates the PDF/X, and uploads `dist/`.

### Build parity

Some changes must not change the book at all: a book-kit upgrade, a pandoc or WeasyPrint bump, a build refactor. `parity.yml` builds the pull request's base and head on the same runner and fails on any difference in any format. Each side is built with the pandoc and WeasyPrint its own kit version pins in `toolchain.json`, so a toolchain bump that reflows the book shows up as a difference:

```yaml
on:
  pull_request:
    paths: [package.json, package-lock.json, justfile, book.config.yml]
jobs:
  parity:
    uses: benbalter/book-kit/.github/workflows/parity.yml@v0.6
    permissions:
      contents: read
      packages: read
```

Underneath it's `book-kit parity BEFORE_DIST AFTER_DIST`. That compares EPUBs and DOCX member by member, the HTML byte for byte, and PDFs by page count, text, fonts, and every page's rendering. It ignores only build timestamps, PNGs re-encoded with identical pixels, and Ghostscript's random font-subset names. The head build must also leave the working tree clean.

Builds take their timestamps from the book's last commit (`SOURCE_DATE_EPOCH`, unless you set it yourself), so rebuilding a commit gives byte-identical EPUBs, DOCX, PDF, and HTML. The PDF/X is the exception: Ghostscript writes its own IDs and dates, which is why parity compares PDFs by rendering rather than bytes.

### Release files

`just release-files v1.2.0` copies the built formats into `dist/release/` under names that carry the version, `<basename>-v1.2.0.epub`, `<basename>-kindle-v1.2.0.epub`, and so on, with a `sha256sum`-compatible `checksums.txt`. A downloaded file then says which release it came from, and `dist/` keeps its plain names for local builds. The version comes from `paths.version`, the same file the build stamps on the copyright page, and a tag that disagrees with it fails, so a file can't be named for one version and stamped with another. Attach `dist/release/*` to your release.

## Advance reader copies

`just arc` builds `<basename>-arc.epub` and `<basename>-kindle-arc.epub`: the retail EPUBs with a "not for redistribution" notice on the copyright page.

## Claude Code

The repo is also a [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace.md). Its `book-kit` plugin ([`claude-plugin/`](claude-plugin/)) adds:

- **`book-kit:writing`**, an agent that reworks short passages the author wrote, such as a TL;DR, a section lead, or an opening or closing paragraph, for the author to review. It's built to assist an author, not write for them, so it declines to write chapters, sections, or other new prose
- **`book-kit:editor`**, an agent that copy edits, proofreads, and runs the validators
- **A chapter hook**: after Claude edits a chapter, it runs markdownlint and `book-kit validate` and sends errors in that chapter back to Claude to fix. textlint findings come back as advice, since whether they fail depends on the book's phase. It runs the book's installed kit, so checks match the version the book has locked.

The agents are deliberately voice-neutral, and they don't assume a house style.
- They read the book's `CLAUDE.md` for its voice, audience, style guide, and phase (drafting, revising, or content-locked), so put those there.
- They run `book-kit conventions` for its callouts, the structure its validators expect, the checks that run, and each preset's `CONVENTIONS.md`.

A preset that wants the agents to follow its house style ships a `CONVENTIONS.md`.

To enable it for everyone working on a book, add this to the book's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "book-kit": { "source": { "source": "github", "repo": "benbalter/book-kit" }, "autoUpdate": true }
  },
  "enabledPlugins": { "book-kit@book-kit": true }
}
```

Or install it just for yourself:

```text
/plugin install book-kit --marketplace benbalter/book-kit
```

Check changes with `claude plugin validate ./claude-plugin` and `claude plugin validate .`.

## Commands

`book-kit <command>` runs the kit's tools from anywhere inside a book. `book-kit help` lists them; most are build steps the recipes call. The ones worth running directly:

- `book-kit config <key>` prints a resolved setting, e.g. `book-kit config paths.dist`; `--sources` shows which layer set each key.
- `book-kit validate` runs the chapter validators; `--list` prints their names.
- `book-kit prose` and `book-kit markdownlint` run textlint and markdownlint with the book's resolved configs (what `just prose` and `just lint` call).
- `book-kit conventions` prints the book's writing conventions (callouts, structure, checks, preset house style).
- `book-kit audit-chapter-lengths` flags chapters much longer or shorter than the rest.
- `book-kit parity BEFORE_DIST AFTER_DIST` compares two builds (see [Build parity](#build-parity)).

## Upgrading from 0.5

0.6 moved from GitHub Packages (`@benbalter/book-kit`) to npm as `book-kit`. Run `npm uninstall @benbalter/book-kit && npm install --save-dev book-kit`, drop the `@benbalter:registry` lines from `.npmrc`, change `@benbalter/book-kit` to `book-kit` in your `justfile` import, `src/style.css`, and any scripts, and move your workflow refs to `@v0.6`. The reusable workflows no longer need `packages: read`, except `parity.yml` on the pull request that makes this move, since its base still installs the old package.

## Versioning

book-kit follows [semver](https://semver.org). Before 1.0, a minor release (0.4 → 0.5) may break books, which is why books follow a floating `v0.MINOR` tag; patch releases don't. These are the public API:

- The `book.config.yml` keys documented in [`defaults/book.config.yml`](defaults/book.config.yml), and what their defaults do.
- The `book-kit` commands listed above and their options, and the `just` recipe names in [`just/book-kit.just`](just/book-kit.just).
- The interfaces for extending the kit: presets (`preset.yml`, `validators/`, `rules/`, `filters/`, `templates/`, `CONVENTIONS.md`), validator plugins (`{ name, tags, defaults, run(ctx) }`), and textlint rule options.
- The callout classes and the CSS custom properties the theme defines.
- The reusable workflows and composite actions.
- `loadConfig()` from `book-kit/lib/config.js`, for a book's own scripts that read `book.config.yml`.

Everything else can change in any release: other modules under `lib/`, the file layout under `commands/` and `filters/`, the exact CSS rules, and generated files under `dist/.book-kit/`. If a book depends on one of those, open an issue so it can become public API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Third-party assets

See [NOTICE.md](NOTICE.md) for the fonts (built from upstream, not bundled) and the bundled emoji.

## License

[MIT](LICENSE). Bundled third-party assets keep their own licenses; see [NOTICE.md](NOTICE.md).
