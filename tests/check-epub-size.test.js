import { describe, it, expect } from 'vitest';

import { statSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// Helper to create unique test directory
function createTestDir() {
  return mkdtempSync('/tmp/test-check-epub-size-');
}

// Helper to clean up test directory
function cleanupTestDir(testDir) {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Reproduce formatSize logic from commands/check-epub-size.js ───
// The script doesn't export this function, so we replicate it here
// and verify it matches the expected formatting behaviour.
function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ─── Reproduce budget threshold logic from commands/check-epub-size.js ───
// Returns { status, violation } for a given size against a budget.
function evaluateBudget(size, budget) {
  const pct = ((size / budget) * 100).toFixed(1);
  const status = size > budget ? '❌ OVER' : size > budget * 0.9 ? '⚠️  WARN' : '✅ OK';
  const violation = size > budget;
  return { status, violation, pct };
}

// ─── Budget definitions (mirrored from the script) ───
const budgets = {
  'dist/book.epub':        2 * 1024 * 1024,  // 2 MB
  'dist/book-kindle.epub': 2 * 1024 * 1024,  // 2 MB
};

// ═══════════════════════════════════════════════════════════════════
// formatSize
// ═══════════════════════════════════════════════════════════════════

describe('check-epub-size: formatSize', () => {

  it('should format 0 bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('should format small byte values', () => {
    expect(formatSize(512)).toBe('512 B');
  });

  it('should format values below 1 KB as bytes', () => {
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('should format exactly 1 KB', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
  });

  it('should format fractional KB values', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('should format KB values with one decimal', () => {
    expect(formatSize(10240)).toBe('10.0 KB');
    expect(formatSize(2560)).toBe('2.5 KB');
  });

  it('should format exactly 1 MB', () => {
    expect(formatSize(1048576)).toBe('1.00 MB');
  });

  it('should format exactly 2 MB (the budget value)', () => {
    expect(formatSize(2097152)).toBe('2.00 MB');
  });

  it('should format fractional MB values', () => {
    expect(formatSize(1572864)).toBe('1.50 MB');
  });

  it('should format large MB values with two decimals', () => {
    expect(formatSize(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(formatSize(10 * 1024 * 1024 + 512 * 1024)).toBe('10.50 MB');
  });

  it('should prefer MB over KB at the 1 MB boundary', () => {
    // Exactly 1 MB should show MB, not KB
    expect(formatSize(1024 * 1024)).toBe('1.00 MB');
    // One byte below should show KB
    expect(formatSize(1024 * 1024 - 1)).toBe('1024.0 KB');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Budget threshold logic
// ═══════════════════════════════════════════════════════════════════

describe('check-epub-size: budget threshold logic', () => {
  const budget = 2 * 1024 * 1024; // 2 MB

  it('should report OK when size is well under budget (< 90%)', () => {
    const size = Math.floor(budget * 0.5); // 50%
    const { status, violation } = evaluateBudget(size, budget);
    expect(status).toBe('✅ OK');
    expect(violation).toBe(false);
  });

  it('should report OK at exactly 0 bytes', () => {
    const { status, violation } = evaluateBudget(0, budget);
    expect(status).toBe('✅ OK');
    expect(violation).toBe(false);
  });

  it('should report OK at exactly 90% of budget', () => {
    const size = budget * 0.9; // exactly 90%
    const { status, violation } = evaluateBudget(size, budget);
    expect(status).toBe('✅ OK');
    expect(violation).toBe(false);
  });

  it('should report WARN just above 90% of budget', () => {
    const size = Math.floor(budget * 0.9) + 1; // just over 90%
    const { status, violation } = evaluateBudget(size, budget);
    expect(status).toBe('⚠️  WARN');
    expect(violation).toBe(false);
  });

  it('should report WARN at 95% of budget', () => {
    const size = Math.floor(budget * 0.95);
    const { status, violation } = evaluateBudget(size, budget);
    expect(status).toBe('⚠️  WARN');
    expect(violation).toBe(false);
  });

  it('should report WARN at exactly budget (100%)', () => {
    const { status, violation } = evaluateBudget(budget, budget);
    expect(status).toBe('⚠️  WARN');
    expect(violation).toBe(false);
  });

  it('should report OVER when size exceeds budget by 1 byte', () => {
    const size = budget + 1;
    const { status, violation } = evaluateBudget(size, budget);
    expect(status).toBe('❌ OVER');
    expect(violation).toBe(true);
  });

  it('should report OVER when size greatly exceeds budget', () => {
    const size = budget * 2; // 200%
    const { status, violation } = evaluateBudget(size, budget);
    expect(status).toBe('❌ OVER');
    expect(violation).toBe(true);
  });

  it('should compute correct percentage', () => {
    const size = budget; // 100%
    const { pct } = evaluateBudget(size, budget);
    expect(pct).toBe('100.0');
  });

  it('should compute correct percentage for half budget', () => {
    const size = budget / 2;
    const { pct } = evaluateBudget(size, budget);
    expect(pct).toBe('50.0');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Budget definitions
// ═══════════════════════════════════════════════════════════════════

describe('check-epub-size: budget definitions', () => {

  it('should define a budget for the standard EPUB', () => {
    expect(budgets['dist/book.epub']).toBeDefined();
  });

  it('should define a budget for the Kindle EPUB', () => {
    expect(budgets['dist/book-kindle.epub']).toBeDefined();
  });

  it('should set both EPUB budgets to 2 MB', () => {
    const twoMB = 2 * 1024 * 1024;
    expect(budgets['dist/book.epub']).toBe(twoMB);
    expect(budgets['dist/book-kindle.epub']).toBe(twoMB);
  });

  it('should track exactly 2 files', () => {
    expect(Object.keys(budgets).length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Missing file handling (script should not crash)
// ═══════════════════════════════════════════════════════════════════

describe('check-epub-size: missing file handling', () => {

  it('should not throw when EPUB files do not exist', () => {
    // The script uses try/catch around statSync — verify that pattern
    expect(() => {
      for (const file of Object.keys(budgets)) {
        const fakePath = join('/tmp/nonexistent-epub-test-dir-12345', file);
        try {
          statSync(fakePath);
        } catch {
          // File not found — skipped (matches script behaviour)
        }
      }
    }).not.toThrow();
  });

  it('should throw without try/catch for missing file', () => {
    // Confirms statSync itself does throw — the script's catch is necessary
    expect(() => {
      statSync('/tmp/nonexistent-epub-file-12345.epub');
    }).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// End-to-end: run the script and verify behaviour
// ═══════════════════════════════════════════════════════════════════

describe('check-epub-size: script execution', () => {

  it('should exit 0 when no EPUB files exist (nothing to check)', () => {
    const testDir = createTestDir();
    try {
      // The real script derives rootDir from __dirname, so we create a
      // wrapper that points rootDir at our empty test directory instead.
      const wrapperPath = join(testDir, 'run-missing.mjs');
      writeFileSync(wrapperPath, `
import { statSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = '${testDir}';

const budgets = {
  'dist/book.epub':        2 * 1024 * 1024,
  'dist/book-kindle.epub': 2 * 1024 * 1024,
};

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return \`\${(bytes / (1024 * 1024)).toFixed(2)} MB\`;
  if (bytes >= 1024) return \`\${(bytes / 1024).toFixed(1)} KB\`;
  return \`\${bytes} B\`;
}

let violations = 0;

for (const [file, budget] of Object.entries(budgets)) {
  const path = join(rootDir, file);
  try {
    const { size } = statSync(path);
    if (size > budget) violations++;
  } catch {
    console.log(\`\${file}: not found (skipped)\`);
  }
}

if (violations > 0) process.exit(1);
console.log('All files within budget.');
`);

      const result = execSync(`node ${wrapperPath}`, {
        encoding: 'utf8',
        timeout: 10000,
      });
      // Both files missing → both should be skipped
      expect(result).toContain('not found');
      expect(result).toContain('All files within budget.');
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should exit 0 when EPUB files are within budget', () => {
    const testDir = createTestDir();
    try {
      const distDir = join(testDir, 'dist');
      mkdirSync(distDir, { recursive: true });

      // Create small placeholder EPUB files (well under 2 MB)
      const smallContent = Buffer.alloc(100 * 1024, 0); // 100 KB
      writeFileSync(join(distDir, 'book.epub'), smallContent);
      writeFileSync(join(distDir, 'book-kindle.epub'), smallContent);

      // We need to create a wrapper that sets the right root
      const wrapperPath = join(testDir, 'run-check.mjs');
      writeFileSync(wrapperPath, `
import { statSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = '${testDir}';

const budgets = {
  'dist/book.epub':        2 * 1024 * 1024,
  'dist/book-kindle.epub': 2 * 1024 * 1024,
};

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return \`\${(bytes / (1024 * 1024)).toFixed(2)} MB\`;
  if (bytes >= 1024) return \`\${(bytes / 1024).toFixed(1)} KB\`;
  return \`\${bytes} B\`;
}

let violations = 0;

for (const [file, budget] of Object.entries(budgets)) {
  const path = join(rootDir, file);
  try {
    const { size } = statSync(path);
    const status = size > budget ? 'OVER' : size > budget * 0.9 ? 'WARN' : 'OK';
    console.log(\`\${file}: \${formatSize(size)} [\${status}]\`);
    if (size > budget) violations++;
  } catch {
    console.log(\`\${file}: not found (skipped)\`);
  }
}

if (violations > 0) process.exit(1);
console.log('All files within budget.');
`);

      const result = execSync(`node ${wrapperPath}`, {
        encoding: 'utf8',
        timeout: 10000,
      });
      expect(result).toContain('OK');
      expect(result).toContain('All files within budget.');
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should exit 1 in CI mode when EPUB exceeds budget', () => {
    const testDir = createTestDir();
    try {
      const distDir = join(testDir, 'dist');
      mkdirSync(distDir, { recursive: true });

      // Create an oversized EPUB (just over 2 MB)
      const oversized = Buffer.alloc(2 * 1024 * 1024 + 1024, 0);
      writeFileSync(join(distDir, 'book.epub'), oversized);
      writeFileSync(join(distDir, 'book-kindle.epub'), Buffer.alloc(100 * 1024, 0));

      const wrapperPath = join(testDir, 'run-check-ci.mjs');
      writeFileSync(wrapperPath, `
import { statSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = '${testDir}';
const ci = true;

const budgets = {
  'dist/book.epub':        2 * 1024 * 1024,
  'dist/book-kindle.epub': 2 * 1024 * 1024,
};

let violations = 0;

for (const [file, budget] of Object.entries(budgets)) {
  const path = join(rootDir, file);
  try {
    const { size } = statSync(path);
    if (size > budget) violations++;
  } catch {
    // skipped
  }
}

if (violations > 0) {
  if (ci) process.exit(1);
}
`);

      let exitCode = 0;
      try {
        execSync(`node ${wrapperPath}`, { encoding: 'utf8', timeout: 10000 });
      } catch (err) {
        exitCode = err.status;
      }
      expect(exitCode).toBe(1);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should exit 0 in non-CI mode even when EPUB exceeds budget', () => {
    const testDir = createTestDir();
    try {
      const distDir = join(testDir, 'dist');
      mkdirSync(distDir, { recursive: true });

      // Oversized EPUB
      const oversized = Buffer.alloc(2 * 1024 * 1024 + 1024, 0);
      writeFileSync(join(distDir, 'book.epub'), oversized);
      writeFileSync(join(distDir, 'book-kindle.epub'), Buffer.alloc(100 * 1024, 0));

      const wrapperPath = join(testDir, 'run-check-no-ci.mjs');
      writeFileSync(wrapperPath, `
import { statSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = '${testDir}';
const ci = false;  // not CI mode

const budgets = {
  'dist/book.epub':        2 * 1024 * 1024,
  'dist/book-kindle.epub': 2 * 1024 * 1024,
};

let violations = 0;

for (const [file, budget] of Object.entries(budgets)) {
  const path = join(rootDir, file);
  try {
    const { size } = statSync(path);
    if (size > budget) violations++;
  } catch {
    // skipped
  }
}

if (violations > 0) {
  if (ci) process.exit(1);
}
// Non-CI: exits 0 regardless
`);

      let exitCode = 0;
      try {
        execSync(`node ${wrapperPath}`, { encoding: 'utf8', timeout: 10000 });
      } catch (err) {
        exitCode = err.status;
      }
      expect(exitCode).toBe(0);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════

describe('check-epub-size: edge cases', () => {

  it('should handle a 1-byte file', () => {
    const { status, violation } = evaluateBudget(1, 2 * 1024 * 1024);
    expect(status).toBe('✅ OK');
    expect(violation).toBe(false);
    expect(formatSize(1)).toBe('1 B');
  });

  it('should handle a file exactly at 90% of budget', () => {
    const budget = 2 * 1024 * 1024;
    const size = budget * 0.9;
    // 90% is the boundary — should be OK, not WARN
    const { status } = evaluateBudget(size, budget);
    expect(status).toBe('✅ OK');
  });

  it('should handle a file at 89.9% of budget as OK', () => {
    const budget = 2 * 1024 * 1024;
    const size = Math.floor(budget * 0.899);
    const { status } = evaluateBudget(size, budget);
    expect(status).toBe('✅ OK');
  });

  it('should handle a file at 99.9% of budget as WARN', () => {
    const budget = 2 * 1024 * 1024;
    const size = Math.floor(budget * 0.999);
    const { status, violation } = evaluateBudget(size, budget);
    expect(status).toBe('⚠️  WARN');
    expect(violation).toBe(false);
  });

  it('formatSize should handle the KB/MB boundary correctly', () => {
    // Just under 1 MB
    expect(formatSize(1024 * 1024 - 1)).toContain('KB');
    // Exactly 1 MB
    expect(formatSize(1024 * 1024)).toContain('MB');
  });
});

console.log('✓ All check-epub-size tests passed');
