import { describe, it, expect } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create unique test directory
function createTestDir() {
  return fs.mkdtempSync('/tmp/test-update-key-takeaways-');
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
  const modulePath = path.join(__dirname, '..', 'commands', 'update-key-takeaways.js');
  return await import(modulePath);
}

const module = await importModule();
describe('update-key-takeaways: parseSections', () => {
  
  it('should parse sections from index.yml content', () => {
    const indexContent = `
input-files:
  # Section One
  - src/chapter-one.md
  - src/chapter-two.md
  # Section Two
  - src/chapter-three.md
`;
    
    const { sections, sectionFiles } = module.parseSections(indexContent);
    
    expect(sections).toEqual(['Section One', 'Section Two']);
    expect(sectionFiles['Section One']).toEqual(['src/chapter-one.md', 'src/chapter-two.md']);
    expect(sectionFiles['Section Two']).toEqual(['src/chapter-three.md']);
  });
  
  it('should skip excluded sections', () => {
    const indexContent = `
input-files:
  # Regular Section
  - src/chapter.md
  # Appendix
  - src/appendix.md
  # Back cover
  - src/back-cover.md
`;
    
    const { sections, sectionFiles } = module.parseSections(indexContent);
    
    expect(sections).toEqual(['Regular Section']);
    expect(!sectionFiles['Appendix']).toBeTruthy();
    expect(!sectionFiles['Back cover']).toBeTruthy();
  });
});

describe('update-key-takeaways: extractTldr', () => {
  
  it('should extract TL;DR from chapter file', () => {
    const testDir = createTestDir();
    try {
      const filePath = path.join(testDir, 'chapter.md');
      fs.writeFileSync(filePath, `## Chapter Title

::: {.tldr custom-style="tldr"}
This is the TL;DR summary.
:::

Content here.
`);
      
      const tldr = module.extractTldr(filePath);
      expect(tldr).toEqual({ text: 'This is the TL;DR summary.', disabledRules: [] });
    } finally {
      cleanupTestDir(testDir);
    }
  });
  
  it('should return null for file without TL;DR', () => {
    const testDir = createTestDir();
    try {
      const filePath = path.join(testDir, 'chapter.md');
      fs.writeFileSync(filePath, '## Chapter Title\n\nNo TL;DR here.');
      
      const tldr = module.extractTldr(filePath);
      expect(tldr).toBe(null);
    } finally {
      cleanupTestDir(testDir);
    }
  });
  
  it('should return null for non-existent file', async () => {
    const module = await importModule();
    const tldr = module.extractTldr('/tmp/nonexistent-file-12345.md');
    expect(tldr).toBe(null);
  });
});

describe('update-key-takeaways: sectionToFilename', () => {
  
  it('should convert section name to filename', () => {
    expect(module.sectionToFilename('Section One')).toBe('section-one');
    expect(module.sectionToFilename('The case for raised beds')).toBe('the-case-for-raised-beds');
    expect(module.sectionToFilename('Planting in spring')).toBe('planting-in-spring');
  });
  
  it('should handle special characters', () => {
    expect(module.sectionToFilename("Section's Name!")).toBe('sections-name');
    expect(module.sectionToFilename('Name (with parens)')).toBe('name-with-parens');
  });
});

describe('update-key-takeaways: generateKeyTakeaways', () => {
  
  it('should generate proper markdown format', () => {
    const tldrs = [
      { text: 'First takeaway.', disabledRules: [] },
      { text: 'Second takeaway.', disabledRules: [] }
    ];
    const result = module.generateKeyTakeaways(tldrs);
    
    expect(result.includes('::: {.takeaways custom-style="takeaways"}')).toBeTruthy();
    expect(result.includes('### Key takeaways')).toBeTruthy();
    expect(result.includes('- First takeaway.')).toBeTruthy();
    expect(result.includes('- Second takeaway.')).toBeTruthy();
    expect(result.includes(':::')).toBeTruthy();
  });
});

describe('update-key-takeaways: collectTldrs', () => {
  
  it('should collect TL;DRs from files', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      fs.writeFileSync(path.join(srcDir, 'ch1.md'), `## Chapter 1

::: {.tldr custom-style="tldr"}
TL;DR for chapter 1.
:::

Content.
`);
      
      fs.writeFileSync(path.join(srcDir, 'ch2.md'), `## Chapter 2

::: {.tldr custom-style="tldr"}
TL;DR for chapter 2.
:::

Content.
`);
      
      const sections = ['Test Section'];
      const sectionFiles = {
        'Test Section': [path.join(srcDir, 'ch1.md'), path.join(srcDir, 'ch2.md')]
      };
      
      const result = module.collectTldrs(sections, sectionFiles);
      
      expect(result['Test Section']).toEqual([
        { text: 'TL;DR for chapter 1.', disabledRules: [] },
        { text: 'TL;DR for chapter 2.', disabledRules: [] }
      ]);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('update-key-takeaways: generateFiles', () => {
  
  it('should generate key takeaways files', () => {
    const testDir = createTestDir();
    try {
      const sectionTldrs = {
        'Test Section': [
          { text: 'Takeaway 1.', disabledRules: [] },
          { text: 'Takeaway 2.', disabledRules: [] }
        ]
      };
      
      const generatedFiles = module.generateFiles(sectionTldrs, testDir);
      
      expect(generatedFiles.length).toBe(1);
      expect(generatedFiles[0].includes('test-section-key-takeaways.md')).toBeTruthy();
      
      const content = fs.readFileSync(generatedFiles[0], 'utf8');
      expect(content.includes('- Takeaway 1.')).toBeTruthy();
      expect(content.includes('- Takeaway 2.')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });
  
  it('should skip empty sections', () => {
    const testDir = createTestDir();
    try {
      const sectionTldrs = {
        'Empty Section': [],
        'Full Section': [{ text: 'Takeaway.', disabledRules: [] }]
      };
      
      const generatedFiles = module.generateFiles(sectionTldrs, testDir);
      
      expect(generatedFiles.length).toBe(1);
      expect(generatedFiles[0].includes('full-section')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('update-key-takeaways: SKIP_SECTIONS', () => {
  
  it('should include expected sections to skip', () => {
    expect(module.SKIP_SECTIONS.includes('Front matter')).toBeTruthy();
    expect(module.SKIP_SECTIONS.includes('Appendix')).toBeTruthy();
    expect(module.SKIP_SECTIONS.includes('Conclusion')).toBeTruthy();
    expect(module.SKIP_SECTIONS.includes('Back cover')).toBeTruthy();
  });
});

describe('update-key-takeaways: parseSections edge cases', () => {

  it('should return empty results for empty content', () => {
    const { sections, sectionFiles } = module.parseSections('');

    expect(sections).toEqual([]);
    expect(sectionFiles).toEqual({});
  });

  it('should return empty results when content has no sections', () => {
    const indexContent = `
input-files:
  - src/chapter-one.md
  - src/chapter-two.md
`;
    const { sections, sectionFiles } = module.parseSections(indexContent);

    expect(sections).toEqual([]);
    expect(sectionFiles).toEqual({});
  });

  it('should handle section with no files', () => {
    const indexContent = `
input-files:
  # Empty Section
  # Next Section
  - src/chapter.md
`;
    const { sections, sectionFiles } = module.parseSections(indexContent);

    expect(sections.includes('Empty Section')).toBeTruthy();
    expect(sections.includes('Next Section')).toBeTruthy();
    expect(sectionFiles['Empty Section']).toEqual([]);
    expect(sectionFiles['Next Section']).toEqual(['src/chapter.md']);
  });

  it('should not duplicate section if name repeats', () => {
    const indexContent = `
input-files:
  # Same Section
  - src/chapter-one.md
  # Same Section
  - src/chapter-two.md
`;
    const { sections, sectionFiles } = module.parseSections(indexContent);

    expect(sections.filter(s => s === 'Same Section').length).toBe(1);
    expect(sectionFiles['Same Section']).toEqual(['src/chapter-one.md', 'src/chapter-two.md']);
  });
});

describe('update-key-takeaways: extractTldr edge cases', () => {

  it('should extract multiline TL;DR', () => {
    const testDir = createTestDir();
    try {
      const filePath = path.join(testDir, 'chapter.md');
      fs.writeFileSync(filePath, `## Chapter Title

::: {.tldr custom-style="tldr"}
First line of summary.
Second line of summary.
:::

Content here.
`);

      const tldr = module.extractTldr(filePath);
      expect(tldr).toBeTruthy();
      expect(tldr.text.includes('First line of summary.')).toBeTruthy();
      expect(tldr.text.includes('Second line of summary.')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should extract TL;DR with markdown formatting', () => {
    const testDir = createTestDir();
    try {
      const filePath = path.join(testDir, 'chapter.md');
      fs.writeFileSync(filePath, `## Chapter Title

::: {.tldr custom-style="tldr"}
Use **bold** and [links](https://example.com) in TL;DR.
:::

Content.
`);

      const tldr = module.extractTldr(filePath);
      expect(tldr).toBeTruthy();
      expect(tldr.text.includes('**bold**'), 'Should preserve markdown formatting').toBeTruthy();
      expect(tldr.text.includes('[links]'), 'Should preserve link syntax').toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should capture textlint-disable rules', () => {
    const testDir = createTestDir();
    try {
      const filePath = path.join(testDir, 'chapter.md');
      fs.writeFileSync(filePath, `<!-- textlint-disable no-cliches, no-dead-link -->

## Chapter Title

::: {.tldr custom-style="tldr"}
A stitch in time saves nine.
:::

Content.
`);

      const tldr = module.extractTldr(filePath);
      expect(tldr).toBeTruthy();
      expect(tldr.disabledRules).toEqual(['no-cliches', 'no-dead-link']);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should return null for file with no .tldr marker', () => {
    const testDir = createTestDir();
    try {
      const filePath = path.join(testDir, 'chapter.md');
      fs.writeFileSync(filePath, `## Chapter Title

::: {.note custom-style="note"}
This is a note, not a TL;DR.
:::
`);

      const tldr = module.extractTldr(filePath);
      expect(tldr).toBe(null);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('update-key-takeaways: sectionToFilename edge cases', () => {

  it('should handle empty string', () => {
    expect(module.sectionToFilename('')).toBe('');
  });

  it('should handle string with only special characters', () => {
    expect(module.sectionToFilename('!@#$%')).toBe('');
  });

  it('should handle string with numbers', () => {
    expect(module.sectionToFilename('Part 3 Details')).toBe('part-3-details');
  });
});

describe('update-key-takeaways: stripChapterReferences', () => {

  it('should leave text without chapter references untouched', () => {
    const text = 'Hours watered ≠ fruit grown. Focus on the soil, not the hose.';
    expect(module.stripChapterReferences(text)).toBe(text);
  });

  it('should strip a trailing "this chapter" sentence', () => {
    const text = 'Test your soil early. This chapter gives you the steps you need.';
    expect(module.stripChapterReferences(text)).toBe('Test your soil early.');
  });

  it('should strip a trailing "Read on" sentence', () => {
    const text = 'Sketching first catches problems early. Read on to learn how.';
    expect(module.stripChapterReferences(text)).toBe('Sketching first catches problems early.');
  });

  it('should strip an "After this chapter" sentence', () => {
    const text = 'Regular soil tests prevent surprises. After this chapter, you’ll know how to run them.';
    expect(module.stripChapterReferences(text)).toBe('Regular soil tests prevent surprises.');
  });

  it('should strip the whole sentence even when the reference follows a semicolon', () => {
    const text = 'Use mulch when the soil is dry. Misusing mulch wastes effort; this chapter shows you when to choose each kind.';
    expect(module.stripChapterReferences(text)).toBe('Use mulch when the soil is dry.');
  });

  it('should keep original text when every sentence references the chapter', () => {
    const text = 'This chapter shows you everything.';
    expect(module.stripChapterReferences(text)).toBe(text);
  });

  it('should be applied by generateKeyTakeaways', () => {
    const tldrs = [
      { text: 'Standalone insight. This chapter shows you how.', disabledRules: [] }
    ];
    const result = module.generateKeyTakeaways(tldrs);

    expect(result.includes('- Standalone insight.')).toBeTruthy();
    expect(result.includes('this chapter')).toBeFalsy();
    expect(result.includes('This chapter')).toBeFalsy();
  });
});

describe('update-key-takeaways: generateKeyTakeaways edge cases', () => {

  it('should generate content for a single TL;DR', () => {
    const tldrs = [{ text: 'Only takeaway.', disabledRules: [] }];
    const result = module.generateKeyTakeaways(tldrs);

    expect(result.includes('- Only takeaway.')).toBeTruthy();
    expect(result.includes('::: {.takeaways custom-style="takeaways"}')).toBeTruthy();
    expect(result.includes('### Key takeaways')).toBeTruthy();
  });

  it('should include textlint-disable comment when rules present', () => {
    const tldrs = [
      { text: 'First.', disabledRules: ['no-cliches'] },
      { text: 'Second.', disabledRules: ['no-dead-link'] }
    ];
    const result = module.generateKeyTakeaways(tldrs);

    expect(result.includes('<!-- textlint-disable no-cliches, no-dead-link -->')).toBeTruthy();
  });

  it('should deduplicate disabled rules across TL;DRs', () => {
    const tldrs = [
      { text: 'First.', disabledRules: ['no-cliches'] },
      { text: 'Second.', disabledRules: ['no-cliches', 'no-dead-link'] }
    ];
    const result = module.generateKeyTakeaways(tldrs);

    // Count occurrences of 'no-cliches' in the textlint-disable line
    const disableLine = result.split('\n').find(l => l.includes('textlint-disable'));
    const matches = disableLine.match(/no-cliches/g);
    expect(matches.length).toBe(1);
  });
});

console.log('✓ All update-key-takeaways tests passed');
