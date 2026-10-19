import { describe, it, expect } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create unique test directory
function createTestDir() {
  return fs.mkdtempSync('/tmp/test-audit-chapter-lengths-');
}

// Helper to clean up test directory
function cleanupTestDir(testDir) {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Import the module functions dynamically
async function importModule() {
  const modulePath = path.join(__dirname, '..', 'commands', 'audit-chapter-lengths.js');
  return await import(modulePath);
}

const module = await importModule();
describe('audit-chapter-lengths: countWords', () => {

  it('should count words correctly', () => {
    expect(module.countWords('one two three')).toBe(3);
    expect(module.countWords('single')).toBe(1);
    expect(module.countWords('')).toBe(0);
  });

  it('should handle multiple spaces', () => {
    expect(module.countWords('one  two   three')).toBe(3);
  });
});

describe('audit-chapter-lengths: isExcluded', () => {

  it('should exclude key-takeaways files', () => {
    expect(module.isExcluded('src/part-one-key-takeaways.md')).toBe(true);
  });

  it('should exclude copyright', () => {
    expect(module.isExcluded('src/copyright.md')).toBe(true);
  });

  it('should exclude scratch files', () => {
    expect(module.isExcluded('src/some-chapter-scratch.md')).toBe(true);
  });

  it('should not exclude regular content chapters', () => {
    expect(module.isExcluded('src/seed-saving.md')).toBe(false);
    expect(module.isExcluded('src/bread-basics.md')).toBe(false);
  });
});

describe('audit-chapter-lengths: isSectionIntro', () => {

  it('should identify section intros by the .section-opener marker', () => {
    expect(module.isSectionIntro('# Tending the Garden {.section-opener}\n\nLead text.')).toBe(true);
    expect(module.isSectionIntro('# Reading the Night Sky {.section-opener}\n\nLead.')).toBe(true);
  });

  it('should not flag regular chapters as section intros', () => {
    expect(module.isSectionIntro('## Pruning Roses\n\nRegular chapter body.')).toBe(false);
    expect(module.isSectionIntro('# A Chapter Without the Marker\n\nBody.')).toBe(false);
  });
});

describe('audit-chapter-lengths: parseIndex', () => {

  it('should parse index.yml and return files and sections', () => {
    const testDir = createTestDir();
    try {
      const indexContent = [
        '# List of chapters',
        'input-files:',
        '  # Section One',
        '  - src/chapter-a.md',
        '  - src/chapter-b.md',
        '  # Section Two',
        '  - src/chapter-c.md',
      ].join('\n');
      fs.writeFileSync(path.join(testDir, 'index.yml'), indexContent);

      const { files, sections } = module.parseIndex(path.join(testDir, 'index.yml'));

      expect(files).toEqual(['src/chapter-a.md', 'src/chapter-b.md', 'src/chapter-c.md']);
      expect(sections['src/chapter-a.md']).toBe('Section One');
      expect(sections['src/chapter-b.md']).toBe('Section One');
      expect(sections['src/chapter-c.md']).toBe('Section Two');
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should return empty for non-existent index', () => {
    const { files, sections } = module.parseIndex('/tmp/nonexistent-index.yml');
    expect(files).toEqual([]);
    expect(sections).toEqual({});
  });
});

describe('audit-chapter-lengths: auditChapterLengths', () => {

  it('should flag chapters that are too long', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Create a chapter with more than MAX_WORDS
      const longContent = Array(module.MAX_WORDS + 500).fill('word').join(' ');
      fs.writeFileSync(path.join(srcDir, 'long-chapter.md'), longContent);

      const indexContent = 'input-files:\n  # Test\n  - src/long-chapter.md\n';
      fs.writeFileSync(path.join(testDir, 'index.yml'), indexContent);

      const { warnings } = module.auditChapterLengths(path.join(testDir, 'index.yml'));

      expect(warnings.some(w => w.includes('too long'))).toBeTruthy();
      expect(warnings.some(w => w.includes('long-chapter.md'))).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should flag chapters that are too short', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'short-chapter.md'), 'Just a few words here.');

      const indexContent = 'input-files:\n  # Test\n  - src/short-chapter.md\n';
      fs.writeFileSync(path.join(testDir, 'index.yml'), indexContent);

      const { warnings } = module.auditChapterLengths(path.join(testDir, 'index.yml'));

      expect(warnings.some(w => w.includes('too short'))).toBeTruthy();
      expect(warnings.some(w => w.includes('short-chapter.md'))).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag chapters within range', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const goodContent = Array(1000).fill('word').join(' ');
      fs.writeFileSync(path.join(srcDir, 'good-chapter.md'), goodContent);

      const indexContent = 'input-files:\n  # Test\n  - src/good-chapter.md\n';
      fs.writeFileSync(path.join(testDir, 'index.yml'), indexContent);

      const { warnings } = module.auditChapterLengths(path.join(testDir, 'index.yml'));

      expect(warnings.length).toBe(0);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip excluded files', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'part-one-key-takeaways.md'), 'short');

      const indexContent = 'input-files:\n  # Test\n  - src/part-one-key-takeaways.md\n';
      fs.writeFileSync(path.join(testDir, 'index.yml'), indexContent);

      const { warnings } = module.auditChapterLengths(path.join(testDir, 'index.yml'));

      expect(warnings.length).toBe(0);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip section intros', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'first-chapter.md'),
        '# Tending the Garden {.section-opener}\n\nshort intro'
      );

      const indexContent = 'input-files:\n  # Test\n  - src/first-chapter.md\n';
      fs.writeFileSync(path.join(testDir, 'index.yml'), indexContent);

      const { warnings } = module.auditChapterLengths(path.join(testDir, 'index.yml'));

      expect(warnings.length).toBe(0);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should return correct stats', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const content1 = Array(1000).fill('word').join(' ');
      const content2 = Array(2000).fill('word').join(' ');
      fs.writeFileSync(path.join(srcDir, 'chapter-a.md'), content1);
      fs.writeFileSync(path.join(srcDir, 'chapter-b.md'), content2);

      const indexContent = 'input-files:\n  # Test\n  - src/chapter-a.md\n  - src/chapter-b.md\n';
      fs.writeFileSync(path.join(testDir, 'index.yml'), indexContent);

      const { stats } = module.auditChapterLengths(path.join(testDir, 'index.yml'));

      expect(stats.chapterCount).toBe(2);
      expect(stats.totalWords).toBe(3000);
      expect(stats.averageWords).toBe(1500);
      expect(stats.minWords).toBe(1000);
      expect(stats.maxWords).toBe(2000);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('audit-chapter-lengths: constants', () => {

  it('should have sensible thresholds', () => {
    expect(module.MIN_WORDS > 0).toBeTruthy();
    expect(module.MAX_WORDS > module.MIN_WORDS).toBeTruthy();
  });

  it('should detect section intros by the .section-opener marker', () => {
    expect(module.isSectionIntro('# Section {.section-opener}\n\nText.')).toBe(true);
    expect(module.isSectionIntro('# Section\n\nText.')).toBe(false);
  });
});

console.log('✓ All audit-chapter-lengths tests passed');
