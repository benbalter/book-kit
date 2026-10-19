# Contributing to book-kit

Thanks for helping. book-kit builds real books, so the bar is that a change either leaves every book's output exactly as it was, or says plainly what it changes and why.

## Setup

You need Node (the version in [`.tool-versions`](.tool-versions)), Python 3, and the tools pinned in [`toolchain.json`](toolchain.json): pandoc, WeasyPrint, and Ghostscript for the print builds, plus Java and EPUBCheck to validate EPUBs. The [Dockerfile](docker/Dockerfile) has everything except Java and EPUBCheck.

```sh
npm ci
npm run setup:python   # Pillow, WeasyPrint, fontTools, ... (a venv is fine)
```

## Before you open a pull request

- `npm test` and `npm run lint` pass.
- `just check-all` passes in [`example/`](example/) (a book on the business-nonfiction preset) and in [`tests/fixtures/neutral-book/`](tests/fixtures/neutral-book/) (a book on the kit defaults alone).
- If the change touches the build, both books still build: `just all docx arc`.
- If the change shouldn't alter output, prove it. Build the example book before and after, and compare with `node bin/book-kit.js parity BEFORE_DIST AFTER_DIST`. Set `BOOK_KIT_REVISION` and `SOURCE_DATE_EPOCH` to fixed values on both sides so the build stamp matches.
- If it does alter output, say what changed in the pull request, and why.
- New behavior gets a test. New settings go in [`defaults/book.config.yml`](defaults/book.config.yml), documented where they're defined.

## Things that will trip you up

- **Keep book-specific data out.** [`tests/privacy.test.js`](tests/privacy.test.js) fails on known titles, ISBN prefixes, imprint names, and credentials. Use generic examples ("Example Press", `978-0-00-000000-0`).
- **Output must be deterministic.** CI builds every format twice and diffs the results.
- **House style belongs in a preset.** The kit's defaults suit any Markdown book. Conventions for one kind of book go in a preset ([`presets/business-nonfiction/`](presets/business-nonfiction/) is the model), not in the defaults or in code.
- **Tool versions live in one place.** [`toolchain.json`](toolchain.json) is the source of truth. A pandoc or WeasyPrint bump can reflow a book's locked page count, so make it its own pull request.

## Commit messages

Say why the change was made, not only what changed. The diff shows what.

## Releases

The maintainer cuts releases (see [CLAUDE.md](CLAUDE.md#releasing)). Pushing a version tag publishes the package and moves the floating tag books follow, so contributors never push tags.
