// The kit is built to be open-sourced: it must never carry a specific book's
// data (titles, ISBNs, imprint, private URLs) or credentials. Books keep that
// in their own book.config.yml.
//
// The book-specific phrases are stored as SHA-256 hashes, so this public file
// doesn't name what it guards. Short phrases can be brute-forced from their
// hashes; the point is to keep them out of plain sight, not to keep a secret.
// Terms short enough to guess from a hash come from the
// BOOK_KIT_PRIVACY_TERMS environment variable instead (comma-separated, same
// normalization; "digits:NNNNNN" for a number prefix), set as a CI secret and
// in the maintainer's shell.
//
// To forbid a phrase, hash its normalized form and add it below:
//   node -e 'const n = process.argv[1].toLowerCase().replace(/&amp;|&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); console.log(require("crypto").createHash("sha256").update(n).digest("hex"))' "Phrase Here"
// Phrases are matched as one to three whole words. For a number prefix (like
// an ISBN prefix), hash "digits:" plus its first six digits, hyphens removed.
import { createHash } from 'node:crypto';

const FORBIDDEN_HASHES = new Set([
  '5366b093723fdbf2a46465dc3aa68b88598bad4b4f53317c44b6188cee83e5f6',
  'fb66f33ca6a27dbcef195f6de87fcffe86d163da64afc265b36ebebf7711f704',
  '5571bf8f246a293117a1064d66430c2c3ce96872775d3dbd84d174404d73d497',
]);

// Not private, just never to be committed.
const CREDENTIALS = [
  /ghp_[A-Za-z0-9]{20,}/, // GitHub token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const normalize = (s) => s.toLowerCase().replace(/&amp;|&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

for (const term of (process.env.BOOK_KIT_PRIVACY_TERMS ?? '').split(',').map((t) => t.trim()).filter(Boolean)) {
  FORBIDDEN_HASHES.add(sha256(term.startsWith('digits:') ? term : normalize(term)));
}

// Does a line contain a forbidden phrase (1–3 words) or number prefix?
export function forbidden(line) {
  const words = normalize(line).split(' ').filter(Boolean);
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      if (FORBIDDEN_HASHES.has(sha256(words.slice(i, i + n).join(' ')))) return true;
    }
  }
  for (const [run] of line.matchAll(/\d+(?:-\d+)*/g)) {
    const digits = run.replace(/-/g, '');
    if (digits.length >= 6 && FORBIDDEN_HASHES.has(sha256(`digits:${digits.slice(0, 6)}`))) return true;
  }
  return CREDENTIALS.some((re) => re.test(line));
}
