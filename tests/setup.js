// Point every config-reading module at the fixture book, and write the
// resolved config as JSON for the Lua filters (as `book-kit prepare` does).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/book', import.meta.url));
process.env.BOOK_ROOT = fixture;

const { loadConfig } = await import('../lib/config.js');
const out = join(mkdtempSync(join(tmpdir(), 'book-kit-config-')), 'config.json');
writeFileSync(out, JSON.stringify(loadConfig({ root: fixture })));
process.env.BOOK_KIT_CONFIG = out;
