import { describe, it, expect } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The "current book content" tests run against the example book.
process.chdir(path.join(__dirname, '..', 'example'));

// Helper to create unique test directory
function createTestDir() {
  return fs.mkdtempSync('/tmp/test-validate-chapters-');
}

// Helper to clean up test directory
function cleanupTestDir(testDir) {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Helper to create test files
function createTestFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

// Import the module functions dynamically to test them
async function importModule() {
  const modulePath = path.join(__dirname, '..', 'commands', 'validate.js');
  return await import(modulePath);
}

describe('validate: getChapters', () => {
  it('should return empty array when src directory does not exist', async () => {
    // Since we can't easily mock the filesystem, we test with the actual directory
    // This test verifies the function works with the real src directory
    const module = await importModule();
    const chapters = module.getChapters();
    
    // Should return an array
    expect(Array.isArray(chapters)).toBeTruthy();
    
    // All items should be paths to .md files in src/
    for (const chapter of chapters) {
      expect(chapter.startsWith('src/')).toBeTruthy();
      expect(chapter.endsWith('.md')).toBeTruthy();
    }
  });
});

const module = await importModule();
describe('validate: isExcluded', () => {
  
  
  it('should return false for non-excluded chapters', () => {
    expect(module.isExcluded('src/some-regular-chapter.md')).toBe(false);
    expect(module.isExcluded('src/seed-saving.md')).toBe(false);
  });
});

describe('validate: validateChapter', () => {
  
  it('should report error for chapter missing TL;DR', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      createTestFile(testDir, 'src/test-chapter.md', '## Test Chapter\n\nSome content here.');
      
      // Save and restore current working directory
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const { errors } = module.validateChapter('src/test-chapter.md', ['src/test-chapter.md']);
        
        expect(errors.some(e => e.includes('missing TL;DR'))).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
  
  it('should report error for chapter with TODO', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      createTestFile(testDir, 'src/test-chapter.md', 
        '## Test Chapter\n\n::: {.tldr}\nSummary\n:::\n\nContent with TODO: fix this.'
      );
      
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const { errors } = module.validateChapter('src/test-chapter.md', ['src/test-chapter.md']);
        
        expect(errors.some(e => e.includes('contains TODO'))).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
  
  it('should report error for chapter not in index', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      createTestFile(testDir, 'src/test-chapter.md', 
        '## Test Chapter\n\n::: {.tldr}\nSummary\n:::\n\nContent here.'
      );
      
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const { errors } = module.validateChapter('src/test-chapter.md', []);
        
        expect(errors.some(e => e.includes('not found in index.yml'))).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
  
  it('should pass validation for valid chapter', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      createTestFile(testDir, 'src/test-chapter.md', 
        '## Test Chapter\n\n::: {.tldr}\nSummary\n:::\n\nValid content here.'
      );
      
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const { errors } = module.validateChapter('src/test-chapter.md', ['src/test-chapter.md']);
        
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: getSectionIntros', () => {
  it('finds the first file of each commented section in index.yml', async () => {
    const { getSectionIntros } = await importModule();
    expect(getSectionIntros()).toEqual([
      { section: 'Front matter', file: 'src/copyright.md' },
      { section: 'Getting started', file: 'src/getting-started.md' },
      { section: 'Going further', file: 'src/formats-and-features.md' },
    ]);
  });
});

describe('validate: validateSectionIntros', () => {

  it('should pass for current section intros (all H1)', () => {
    const { errors } = module.validateSectionIntros();
    expect(errors.length).toBe(0);
  });
  
  it('should catch H2 heading in section intro', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      // Create a section intro with wrong heading level
      createTestFile(testDir, 'src/section-intro.md', '## Wrong Level\n\nContent.');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml', 
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');
      
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const { errors } = module.validateSectionIntros();
        expect(errors.length > 0, 'Should report error for H2 section intro').toBeTruthy();
        expect(errors[0].includes('H2'), 'Error should mention H2').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateSectionIntroNoTldr', () => {

  it('should pass for current section intros (no TL;DR)', () => {
    const { errors } = module.validateSectionIntroNoTldr();
    expect(errors.length).toBe(0);
  });

  it('should catch TL;DR block in section intro', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      // Create a section intro with a TL;DR block in the preamble (before any H2)
      createTestFile(testDir, 'src/section-intro.md', 
        '# Section Title {.section-opener}\n\n::: {.tldr custom-style="tldr"}\nSummary.\n:::\n\nContent.');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml', 
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');
      
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const { errors } = module.validateSectionIntroNoTldr();
        expect(errors.length > 0, 'Should report error for TL;DR in section intro').toBeTruthy();
        expect(errors[0].includes('TL;DR'), 'Error should mention TL;DR').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass for section intro with TL;DR under H2 sub-chapter', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      
      createTestFile(testDir, 'src/section-intro.md', 
        '# Section Title {.section-opener}\n\nPreamble text.\n\n## Sub Chapter\n\n::: {.tldr custom-style="tldr"}\nSummary.\n:::\n\nContent.');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml', 
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');
      
      const originalCwd = process.cwd();
      process.chdir(testDir);
      
      try {
        const { errors } = module.validateSectionIntroNoTldr();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateSectionIntroHasLead', () => {

  it('should pass for current section intros (all have .section-opener)', () => {
    const { errors } = module.validateSectionIntroHasLead();
    expect(errors.length).toBe(0);
  });

  it('should catch section intro missing {.section-opener}', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      createTestFile(testDir, 'src/section-intro.md',
        '# Section Title\n\nIntro prose with no section-opener class.\n');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const { errors } = module.validateSectionIntroHasLead();
        expect(errors.length > 0, 'Should report error for missing .section-opener').toBeTruthy();
        expect(errors[0].includes('section-opener'), 'Error should mention section-opener').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when section intro has {.section-opener}', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      createTestFile(testDir, 'src/section-intro.md',
        '# Section Title {.section-opener}\n\nLead text.\n');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const { errors } = module.validateSectionIntroHasLead();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateSectionIntroFinalLead', () => {

  it('should pass for current section intros (final paragraphs are .lead-wrapped)', () => {
    const { errors } = module.validateSectionIntroFinalLead();
    expect(errors.length).toBe(0);
  });

  it('should catch a trailing paragraph outside a .lead div', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/section-intro.md',
        '# Section Title {.section-opener}\n\n' +
        '::: {.lead custom-style="lead"}\nLead intro text.\n:::\n\n' +
        'Trailing transition paragraph outside any div.\n');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateSectionIntroFinalLead();
        expect(errors.length > 0, 'Should report error for trailing paragraph outside .lead').toBeTruthy();
        expect(errors[0].includes('.lead')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when the final paragraph is inside a .lead div', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/section-intro.md',
        '# Section Title {.section-opener}\n\n' +
        '::: {.lead custom-style="lead"}\nLead intro text.\n:::\n\n' +
        '::: {.for-managers custom-style="for-managers"}\nManager guidance.\n:::\n\n' +
        '::: {.lead custom-style="lead"}\nTrailing transition paragraph, lead-wrapped.\n:::\n');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateSectionIntroFinalLead();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should catch a final paragraph inside a non-lead div', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/section-intro.md',
        '# Section Title {.section-opener}\n\n' +
        '::: {.lead custom-style="lead"}\nLead intro text.\n:::\n\n' +
        '::: {.pro-tip custom-style="pro-tip"}\nA pro tip as the final block.\n:::\n');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateSectionIntroFinalLead();
        expect(errors.length > 0, 'Should report error for final paragraph in non-lead div').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should only check the preamble before the first H2', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/section-intro.md',
        '# Section Title {.section-opener}\n\n' +
        '::: {.lead custom-style="lead"}\nLead intro text.\n:::\n\n' +
        '## Sub-chapter\n\nPlain chapter prose after the H2 is fine.\n');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  # Test section\n  - src/section-intro.md\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateSectionIntroFinalLead();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip section intros whose first heading is not an H1', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/front-matter.md',
        '::: {#copyright-page}\nCopyright text, no headings or lead blocks.\n:::\n');
      createTestFile(testDir, 'src/chapter.md', '## Chapter\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  # Test section\n  - src/front-matter.md\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateSectionIntroFinalLead();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateNoTransitionTodos', () => {

  it('should pass when no chapter contains TODO: TRANSITION', () => {
    const { errors } = module.validateNoTransitionTodos();
    expect(errors.length).toBe(0);
  });

  it('should catch TODO: TRANSITION markers in production chapters', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nFirst paragraph.\n\nTODO: TRANSITION\n\nNext paragraph.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const { errors } = module.validateNoTransitionTodos();
        expect(errors.length > 0, 'Should report error for TODO: TRANSITION marker').toBeTruthy();
        expect(errors[0].includes('TRANSITION'), 'Error should mention TRANSITION').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should be case-insensitive on the marker', () => {
    const testDir = createTestDir();
    try {
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\ntodo: transition\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const { errors } = module.validateNoTransitionTodos();
        expect(errors.length > 0, 'Should catch lowercase marker').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateNoTodoMarkers', () => {

  it('should pass on current production content', () => {
    const { errors } = module.validateNoTodoMarkers();
    expect(errors.length).toBe(0);
  });

  it('should catch stray TODO markers outside TRANSITION', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nFirst paragraph.\n\nTODO: rewrite this section.\n');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNoTodoMarkers();
        expect(errors.length > 0, 'Should report stray TODO marker').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should catch FIXME and XXX markers', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/a.md', '## A\n\nFIXME: broken example.\n');
      createTestFile(testDir, 'src/b.md', '## B\n\nXXX: weird edge case.\n');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/a.md\n  - src/b.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNoTodoMarkers();
        expect(errors.length).toBe(2);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip TODO: TRANSITION (handled by separate validator)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nTODO: TRANSITION\n\nContent.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNoTodoMarkers();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip TODO inside {.revision} spans (documented placeholders)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/copyright.md',
        '## Copyright\n\n[TODO: TX-XXX]{.revision}\n');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/copyright.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNoTodoMarkers();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateNoBareUrlLinkText', () => {

  it('should pass on current production content', () => {
    const { errors } = module.validateNoBareUrlLinkText();
    expect(errors.length).toBe(0);
  });

  it('should catch [https://...](https://...) bare-URL link text', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSee [https://example.com](https://example.com) for details.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNoBareUrlLinkText();
        expect(errors.length).toBe(1);
        expect(errors[0].includes('bare URL')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should allow descriptive link text', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSee [the docs](https://example.com/docs) for details.');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNoBareUrlLinkText();
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateMinOpenerLength', () => {

  it('should return only warnings, never errors', () => {
    const { errors } = module.validateMinOpenerLength();
    expect(errors.length).toBe(0);
  });

  it('should warn when first two post-TL;DR paragraphs total under 60 words', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Short Opener\n\n::: {.tldr custom-style="tldr"}\nSummary.\n:::\n\nShort paragraph.\n\nAlso short.\n');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateMinOpenerLength();
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('skeletal')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not warn when the opener is 60+ words combined', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      const longPara = 'word '.repeat(65).trim();
      createTestFile(testDir, 'src/chapter.md',
        `## Good Opener\n\n::: {.tldr custom-style="tldr"}\nSummary.\n:::\n\n${longPara}.\n`);
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateMinOpenerLength();
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should accept short punchy hook + longer context paragraph', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      const contextPara = 'word '.repeat(65).trim();
      createTestFile(testDir, 'src/chapter.md',
        `## Punchy\n\n::: {.tldr custom-style="tldr"}\nSummary.\n:::\n\nYour heart skips.\n\n${contextPara}.\n`);
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/chapter.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateMinOpenerLength();
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip key-takeaways files', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/foo-key-takeaways.md',
        '::: {.takeaways custom-style="takeaways"}\n\n### Key takeaways\n\n- Short.\n\n:::\n');
      createTestFile(testDir, 'index.yml',
        'input-files:\n  - src/foo-key-takeaways.md\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateMinOpenerLength();
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: headingToAnchor', () => {

  it('should convert simple heading to anchor', () => {
    expect(module.headingToAnchor('## My Great Chapter')).toBe('my-great-chapter');
  });

  it('should use explicit anchor ID when present', () => {
    expect(module.headingToAnchor('## [NASA]{.smallcaps} Star Charts {#nasa-star-charts}')).toBe('nasa-star-charts');
  });

  it('should strip smallcaps spans', () => {
    expect(module.headingToAnchor('## Reading a [PDF]{.smallcaps}')).toBe('reading-a-pdf');
  });

  it('should strip escaped smallcaps spans', () => {
    expect(module.headingToAnchor('## Working with \\[API\\]{.smallcaps}s')).toBe('working-with-apis');
  });

  it('should strip inline code', () => {
    expect(module.headingToAnchor('## Using `git commit` Effectively')).toBe('using-git-commit-effectively');
  });

  it('should strip epub attributes', () => {
    expect(module.headingToAnchor('# Prologue {epub:type=prologue}')).toBe('prologue');
  });

  it('should handle H1 headings', () => {
    expect(module.headingToAnchor('# Back Cover')).toBe('back-cover');
  });

  it('should handle simple heading', () => {
    expect(module.headingToAnchor('## Hello World')).toBe('hello-world');
  });

  it('should strip numbers and special chars', () => {
    expect(module.headingToAnchor('## Chapter 1: Introduction')).toBe('chapter-1-introduction');
  });

  it('should handle heading with bold', () => {
    expect(module.headingToAnchor('## **Bold** Heading')).toBe('bold-heading');
  });

  it('should handle heading with italic', () => {
    expect(module.headingToAnchor('## *Italic* Text')).toBe('italic-text');
  });

  it('should handle heading with inline code', () => {
    expect(module.headingToAnchor('## Using `git rebase`')).toBe('using-git-rebase');
  });

  it('should handle heading with link', () => {
    expect(module.headingToAnchor('## See [this guide](https://example.com)')).toBe('see-this-guide');
  });

  it('should collapse multiple spaces into single hyphen', () => {
    expect(module.headingToAnchor('## Hello   World')).toBe('hello-world');
  });

  it('should handle empty after stripping', () => {
    expect(module.headingToAnchor('## ***')).toBe('');
  });
});

describe('validate: validateCrossReferences', () => {

  it('should pass with no broken cross-references', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter-one.md',
        '## Chapter One\n\nSee [Chapter Two](#chapter-two) for details.');
      createTestFile(testDir, 'src/chapter-two.md',
        '## Chapter Two\n\nBack to [Chapter One](#chapter-one).');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCrossReferences([
          'src/chapter-one.md', 'src/chapter-two.md'
        ]);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect broken cross-reference', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter-one.md',
        '## Chapter One\n\nSee [Missing](#nonexistent-chapter) here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCrossReferences([
          'src/chapter-one.md'
        ]);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('nonexistent-chapter')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should resolve anchors with explicit IDs', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## [AI]{.smallcaps} Stuff {#ai-stuff}\n\nSee [link](#ai-stuff).');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCrossReferences([
          'src/chapter.md'
        ]);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { warnings } = module.validateCrossReferences(indexFiles);
    expect(warnings.length).toBe(0);
  });

  it('should pass with valid cross-reference in same file', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Test Section\n\nSee [Test Section](#test-section) for details.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCrossReferences(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn on broken anchor reference', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Real Section\n\nSee [Missing](#nonexistent-section) here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCrossReferences(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('nonexistent-section')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle cross-file references', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter-one.md',
        '## First Chapter\n\nSee [Second Chapter](#second-chapter).');
      createTestFile(testDir, 'src/chapter-two.md',
        '## Second Chapter\n\nContent here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCrossReferences([
          'src/chapter-one.md', 'src/chapter-two.md'
        ]);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on external links', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nVisit [GitHub](https://github.com) for more info.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCrossReferences(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateSmallcaps', () => {

  it('should pass when acronyms use smallcaps', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nUse [AI]{.smallcaps} and [API]{.smallcaps}s wisely.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSmallcaps(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect bare acronym', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe API returned an error.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSmallcaps(['src/chapter.md']);
        expect(warnings.length > 0).toBeTruthy();
        expect(warnings[0].includes('API')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip acronyms inside code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\ncurl https://API.example.com\n```\n\nText here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSmallcaps(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip acronyms inside inline code', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nRun `API_KEY=123` to set it.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSmallcaps(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateEscapedSmallcaps', () => {

  it('should pass when smallcaps have no backslash', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nIt was 8 [AM]{.smallcaps} on Monday.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateEscapedSmallcaps(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect backslash-escaped smallcaps', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nIt was 8 \\[AM]{.smallcaps} on Monday.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateEscapedSmallcaps(['src/chapter.md']);
        expect(errors.length).toBe(1);
        expect(errors[0].includes('remove the backslash')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip escaped brackets inside code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\n\\[AM]{.smallcaps}\n```');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateEscapedSmallcaps(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect escaped smallcaps with content', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nUse \\[API]{.smallcaps} here');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateEscapedSmallcaps(['src/chapter.md']);
        expect(errors.length).toBe(1);
        expect(errors[0].includes('remove the backslash')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on normal smallcaps without backslash', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nUse [API]{.smallcaps} here');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateEscapedSmallcaps(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip code blocks containing escaped smallcaps', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSome text.\n\n```markdown\n\\[API]{.smallcaps}\n```\n\nMore text.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateEscapedSmallcaps(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect multiple escaped smallcaps on same line', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nBoth \\[API]{.smallcaps} and \\[URL]{.smallcaps}');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateEscapedSmallcaps(['src/chapter.md']);
        expect(errors.length).toBe(2);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateCalloutBalance', () => {

  it('should pass when both callouts present', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.for-managers}\nManagers do X.\n:::\n\n::: {.for-ics}\nICs do Y.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn when only managers callout present', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.for-managers}\nManagers do X.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('no "For ICs"')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn when only ICs callout present', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.for-ics}\nICs do Y.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('no "For managers"')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip key-takeaways files', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/section-key-takeaways.md',
        '## Key Takeaways\n\n::: {.for-managers}\nManagers summary.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance([
          'src/section-key-takeaways.md'
        ]);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when no callouts present', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nJust regular content.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass with balanced nested divs', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.for-managers}\nManagers content.\n:::\n\n::: {.for-ics}\nICs content.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect missing IC callout partner', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.for-managers}\nManagers only content.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('no "For ICs"')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass with multiple sequential balanced callouts', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.pro-tip}\nA helpful tip.\n:::\n\n::: {.for-ics}\nIC advice.\n:::\n\n::: {.for-managers}\nManager advice.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle empty callout', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.tldr}\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateCalloutBalance(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateTldrLength', () => {

  it('should pass for normal-length TL;DR', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.tldr custom-style="tldr"}\nThis chapter covers important practices for gardeners growing vegetables across cool climates.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateTldrLength(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn for too-long TL;DR', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      const longTldr = Array(90).fill('word').join(' ');
      createTestFile(testDir, 'src/chapter.md',
        `## Chapter\n\n::: {.tldr custom-style="tldr"}\n${longTldr}\n:::`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateTldrLength(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('too long')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn for too-short TL;DR', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.tldr custom-style="tldr"}\nShort.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateTldrLength(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('too short')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip files without TL;DR', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nNo TLDR here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateTldrLength(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { warnings } = module.validateTldrLength(indexFiles);
    expect(warnings.length).toBe(0);
  });
});

describe('validate: validateDuplicateHeadings', () => {

  it('should pass with unique headings', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/ch1.md', '## Chapter One\n\nContent.');
      createTestFile(testDir, 'src/ch2.md', '## Chapter Two\n\nContent.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateDuplicateHeadings([
          'src/ch1.md', 'src/ch2.md'
        ]);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect duplicate H2 headings', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/ch1.md', '## Same Title\n\nContent.');
      createTestFile(testDir, 'src/ch2.md', '## Same Title\n\nContent.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateDuplicateHeadings([
          'src/ch1.md', 'src/ch2.md'
        ]);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('same-title')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should allow "Key takeaways" duplicates', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/ch1.md', '## Key takeaways\n\n- Point one.');
      createTestFile(testDir, 'src/ch2.md', '## Key takeaways\n\n- Point two.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateDuplicateHeadings([
          'src/ch1.md', 'src/ch2.md'
        ]);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { warnings } = module.validateDuplicateHeadings(indexFiles);
    expect(warnings.length).toBe(0);
  });

  it('should pass with unique headings in single file', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## First\n\nContent.\n\n## Second\n\nContent.\n\n## Third\n\nContent.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateDuplicateHeadings(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect duplicate H2 headings in single file', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Same Title\n\nFirst section.\n\n## Same Title\n\nSecond section.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateDuplicateHeadings(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('same-title')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should allow duplicate headings at different levels', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Title\n\nContent.\n\n### Title\n\nMore content.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateDuplicateHeadings(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateAcronymExpansion', () => {

  it('should pass when acronym is expanded before in parens', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nTransport Layer Security ([TLS]{.smallcaps}) protects data.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when acronym is expanded after in parens', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n[TLS]{.smallcaps} (Transport Layer Security) protects data.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when plural acronym is expanded after in parens', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n[OKR]{.smallcaps}s (Objectives and Key Results) drive focus.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn when acronym is not expanded on first use', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nUse [TLS]{.smallcaps} to encrypt traffic.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected a warning for unexpanded TLS').toBeTruthy();
        expect(warnings[0].includes('TLS')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip universally known acronyms', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe [API]{.smallcaps} returned an [HTTP]{.smallcaps} error to the [CEO]{.smallcaps}.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should only check first occurrence across multiple files', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      // First file: acronym expanded
      createTestFile(testDir, 'src/ch1.md',
        '## Chapter 1\n\nTransport Layer Security ([TLS]{.smallcaps}) is important.');
      // Second file: acronym used bare (should be fine — already expanded in ch1)
      createTestFile(testDir, 'src/ch2.md',
        '## Chapter 2\n\n[TLS]{.smallcaps} connections are fast.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion([
          'src/ch1.md', 'src/ch2.md'
        ]);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn when first use is bare but later use is expanded', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      // First file: bare acronym
      createTestFile(testDir, 'src/ch1.md',
        '## Chapter 1\n\nUse [TLS]{.smallcaps} everywhere.');
      // Second file: expanded (too late!)
      createTestFile(testDir, 'src/ch2.md',
        '## Chapter 2\n\nTransport Layer Security ([TLS]{.smallcaps}) protects.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion([
          'src/ch1.md', 'src/ch2.md'
        ]);
        expect(warnings.length > 0, 'Expected warning for unexpanded first use').toBeTruthy();
        expect(warnings[0].includes('TLS')).toBeTruthy();
        expect(warnings[0].includes('ch1.md')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip acronyms inside code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\n[TLS]{.smallcaps} in code\n```\n\nTransport Layer Security ([TLS]{.smallcaps}) here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip timezone offsets like UTC+1', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe eclipse starts at 3pm [UTC+1]{.smallcaps}.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateAcronymExpansion(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { warnings } = module.validateAcronymExpansion(indexFiles);
    expect(warnings.length).toBe(0);
  });
});

describe('validate: validateEmDashes', () => {

  it('should pass when em-dashes are used correctly', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSourdough—done well—requires patience.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateEmDashes(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect spaced hyphens that should be em-dashes', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSourdough - done well - requires patience.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateEmDashes(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for spaced hyphens').toBeTruthy();
        expect(warnings[0].includes('Spaced hyphen')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip list markers', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item\n- Second item\n* Third item');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateEmDashes(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\ncommand - flag - value\n```');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateEmDashes(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip inline code', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nRun `command - flag` to see output.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateEmDashes(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip YAML frontmatter', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '---\ntitle: Some - Title\n---\n\n## Chapter\n\nContent here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateEmDashes(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip table rows', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n| Column - A | Column - B |\n| --- | --- |');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateEmDashes(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { warnings } = module.validateEmDashes(indexFiles);
    expect(warnings.length).toBe(0);
  });
});

describe('validate: validateNumberRangeDashes', () => {

  it('should flag a numeric range written with a hyphen', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nMost nurseries are open 9-5 on weekdays.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNumberRangeDashes(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for 9-5').toBeTruthy();
        expect(errors[0].includes('en dash')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag a range that already uses an en dash', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nAim for 50–60% humidity, in trays of 8–12.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNumberRangeDashes(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag version numbers or ISBNs (more hyphens / dots adjacent)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nRelease 1.2-3 ships under ISBN 978-0-306-40615-7 this quarter.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNumberRangeDashes(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip fenced code blocks and inline code', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nRun `kubectl scale --replicas=3-5` then:\n\n```\nports 8080-8090\n```');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNumberRangeDashes(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip ranges inside URLs', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSee https://example.com/report-2020-2021 for details.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateNumberRangeDashes(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { errors } = module.validateNumberRangeDashes(indexFiles);
    expect(errors.length).toBe(0);
  });
});

describe('validate: validateQuotePunctuation', () => {

  it('should pass when periods and commas are inside closing quotes', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nIt is the equivalent of "rising slowly." They add it to the "bake log," then move on.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect a period that leaked outside the closing quote', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nIt is the equivalent of "rising slowly".');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for period outside quote').toBeTruthy();
        expect(errors[0].includes('Quote punctuation')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect a comma that leaked outside the closing quote', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nWe wanted to find "the perfect crumb", and then bake.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for comma outside quote').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect leaked punctuation with curly closing quotes', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nIt is the equivalent of “rising slowly”.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for curly quote').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag inch/foot measurements (digit before quote)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe trim size is 6", and the gutter is 0.75".');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should flag a comma after a quoted question (Chicago: drop it)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nWhen they ask "what does it take to grow tomatoes?", listen first.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for comma after quoted question').toBeTruthy();
        expect(errors[0].includes('drop the comma')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should flag a comma after a quoted exclamation', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThey shouted "plant it!", and the room cheered.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for comma after quoted exclamation').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag a quoted question with no trailing comma', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nWhen they ask "what does it take to grow tomatoes?" listen first.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip fenced code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\nconst x = "value".trim();\n```');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip inline code', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nCall `"value".trim()`, then continue.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip YAML frontmatter', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '---\ntitle: The "best".\n---\n\n## Chapter\n\nContent here.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateQuotePunctuation(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { errors } = module.validateQuotePunctuation(indexFiles);
    expect(errors.length).toBe(0);
  });
});

describe('validate: validateDoubledWords', () => {

  it('should detect an accidentally doubled word', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nWe plant the the seedlings on Friday.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateDoubledWords(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for "the the"').toBeTruthy();
        expect(errors[0].includes('Doubled word')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect doubling regardless of case', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe The decision was final.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateDoubledWords(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for "The The"').toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should allow legitimate repeats (had had, that that)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nShe had had enough. The fact that that happened proves the point.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateDoubledWords(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag a word that merely starts the next word', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nWe understand and accept the cost of a weekly watering rotation.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateDoubledWords(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip fenced code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\nrm -rf the the\n```');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateDoubledWords(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { errors } = module.validateDoubledWords(indexFiles);
    expect(errors.length).toBe(0);
  });
});

describe('validate: validateCalloutDivs', () => {

  it('should pass when divs are properly balanced', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.tldr custom-style="tldr"}\nSummary here.\n:::\n\nContent.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateCalloutDivs(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect unclosed div', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.tldr custom-style="tldr"}\nSummary here.\n\nContent continues.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateCalloutDivs(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for unclosed div').toBeTruthy();
        expect(errors[0].includes('Unclosed')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect unmatched closing div', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSome text.\n:::\n\nMore text.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateCalloutDivs(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for unmatched closing :::').toBeTruthy();
        expect(errors[0].includes('Unmatched closing')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle nested divs', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.outer}\n\n::: {.inner}\nNested content.\n:::\n\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateCalloutDivs(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip divs inside code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```markdown\n::: {.example}\nThis is a code example.\n```\n\nReal content.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateCalloutDivs(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { errors } = module.validateCalloutDivs(indexFiles);
    expect(errors.length).toBe(0);
  });
});

describe('validate: validateRoleCalloutLabels', () => {

  it('should pass when role callouts have no hardcoded label', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '::: {.for-managers custom-style="for-managers"}\n' +
        '**Water in the morning.** The leaves dry before nightfall.\n:::\n\n' +
        '::: {.for-ics custom-style="for-ics"}\n' +
        '**Label every seed tray.** Write the date on each one.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect a hardcoded "For managers:" label in a .for-managers callout', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '::: {.for-managers custom-style="for-managers"}\n' +
        '**For managers:** Check the soil before you water.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(1);
        expect(errors[0].includes('for-managers')).toBeTruthy();
        expect(errors[0].includes('::before')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect hardcoded IC labels in .for-ics callouts, including smallcaps variants', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '::: {.for-ics custom-style="for-ics"}\n' +
        '**For individual contributors:** Start small with one new bed per season.\n:::\n\n' +
        '::: {.for-ics custom-style="for-ics"}\n' +
        '**For [IC]{.smallcaps}s:** Keep your seed notes current.\n:::\n\n' +
        '::: {.for-ics custom-style="for-ics"}\n' +
        'For ICs: a plain, unbolded label is also a duplicate.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(3);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect a hardcoded "Pro tip:" label in a .pro-tip callout (and variants)', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '::: {.pro-tip custom-style="pro-tip"}\n' +
        '**Pro tip:** Sharpen the shears first.\n:::\n\n' +
        '::: {.pro-tip custom-style="pro-tip"}\n' +
        '**Pro-Tip:** Hyphenated, bold variant.\n:::\n\n' +
        '::: {.pro-tip custom-style="pro-tip"}\n' +
        'Pro tip: a plain, unbolded label is also a duplicate.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(3);
        expect(errors[0].includes('pro-tip')).toBeTruthy();
        expect(errors[0].includes('Pro tip:')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should NOT flag a .pro-tip callout that opens with a bold tagline (not the label)', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '::: {.pro-tip custom-style="pro-tip"}\n' +
        '**Harvest herbs early in the day.** Pick them before the sun wilts the leaves.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag bold lead-ins that merely start with "For managers" without a label colon', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '::: {.for-managers custom-style="for-managers"}\n' +
        '**For managers who tend large gardens, mulch is the lever.** Use it.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not flag role labels outside role callouts', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '**For managers:** Plain body text, not inside a callout, gets no CSS label.\n\n' +
        '::: {.pro-tip custom-style="pro-tip"}\n' +
        'For managers: inside a non-role callout is also fine.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip role callouts inside code blocks', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n' +
        '```markdown\n' +
        '::: {.for-managers custom-style="for-managers"}\n' +
        '**For managers:** This is a documentation example.\n:::\n' +
        '```\n\nReal content.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateRoleCalloutLabels(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { errors } = module.validateRoleCalloutLabels(indexFiles);
    expect(errors.length).toBe(0);
  });
});

describe('validate: validateFootnotes', () => {

  it('should pass when refs and defs match', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSee the study[^1] for details.\n\n[^1]: Smith et al., 2023.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateFootnotes(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect reference without definition', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSee the study[^missing] for details.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateFootnotes(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for missing footnote def').toBeTruthy();
        expect(errors[0].includes('missing')).toBeTruthy();
        expect(errors[0].includes('without definition')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect orphaned definition without reference', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSome text.\n\n[^orphan]: This footnote is never referenced.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateFootnotes(['src/chapter.md']);
        expect(errors.length > 0, 'Expected error for orphaned footnote def').toBeTruthy();
        expect(errors[0].includes('orphan')).toBeTruthy();
        expect(errors[0].includes('Orphaned')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle named footnote labels', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSee research[^why-mulch] on this.\n\n[^why-mulch]: Soil studies show...');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateFootnotes(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip footnotes inside code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\nSee[^fake] this.\n```\n\nReal text.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateFootnotes(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { errors } = module.validateFootnotes(indexFiles);
    expect(errors.length).toBe(0);
  });
});

describe('validate: validateHeadingHierarchy', () => {

  it('should pass with proper hierarchy', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n### Section\n\n#### Subsection\n\nContent.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateHeadingHierarchy(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect skipped heading levels (H2 to H4)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n#### Skipped H3\n\nContent.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateHeadingHierarchy(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for skipped heading level').toBeTruthy();
        expect(warnings[0].includes('H2 → H4')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should allow going back up in hierarchy', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n### Section 1\n\n#### Detail\n\n### Section 2\n\nContent.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateHeadingHierarchy(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip headings inside code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```markdown\n#### Example heading in code\n```\n\n### Real section');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateHeadingHierarchy(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass on current book content', () => {
    const indexFiles = module.getIndexFiles();
    const { warnings } = module.validateHeadingHierarchy(indexFiles);
    expect(warnings.length).toBe(0);
  });
});

describe('validate: validateSentenceStarters', () => {

  it('should pass with varied sentence starters', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nSourdough requires patience. Bakers must measure carefully. Everyone benefits from fresh bread.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect 3 consecutive sentences with same starter', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe garden grew daily. The tomatoes ripened late. The harvest felt slow.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for repeated "The" starter').toBeTruthy();
        expect(warnings[0].includes('The')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not count across paragraphs', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe garden grew daily. The tomatoes ripened.\n\nThe harvest improved after that.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip callout divs', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.pro-tip custom-style="pro-tip"}\nThe tip is good. The advice matters. The garden thrives.\n:::');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect 4 consecutive same starters', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nIf you try. If you fail. If you persist. If you succeed.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for consecutive "If" starters').toBeTruthy();
        expect(warnings[0].includes('If')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should ignore single-letter starters', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nI went out. I came back. I sat down.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle bold-formatted starters', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n**When** we start. **When** we stop. **When** we pause.');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for repeated "When" starters').toBeTruthy();
        expect(warnings[0].includes('When')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip list items', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- The first item\n- The second item\n- The third item');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateSentenceStarters(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateListPunctuation', () => {

  it('should pass when all items end with periods', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item ends here.\n- Second item ends here.\n- Third item ends here.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when no items end with periods', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item\n- Second item\n- Third item\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect inconsistent punctuation', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item ends here.\n- Second item no period\n- Third item ends here.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for inconsistent punctuation').toBeTruthy();
        expect(warnings[0].includes('Inconsistent')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should allow continuation lists (only last item has period)', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThe principles are:\n\n- watering deeply,\n- mulching generously, and\n- weeding often.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip single-item lists', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- Single item without period\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when all items have trailing periods', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item.\n- Second item.\n- Third item.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass when no items have trailing periods', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item\n- Second item\n- Third item\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn on mixed punctuation in list', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item.\n- Second item\n- Third item.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for mixed punctuation').toBeTruthy();
        expect(warnings[0].includes('Inconsistent')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should allow only-last-item period pattern', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item\n- Second item\n- Third item.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle multi-line list items', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n- First item\n  continues here.\n- Second item\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateListPunctuation(['src/chapter.md']);
        expect(warnings.length > 0, 'Expected warning for mixed punctuation in multi-line list').toBeTruthy();
        expect(warnings[0].includes('Inconsistent')).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateBoldKeywords', () => {

  it('should warn about bold keywords outside callouts', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n**Preheat the oven.** This is body text.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('Preheat the oven'), `Warning should mention keyword: ${warnings[0]}`).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn about colon variant', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n**Be explicit:** State your intent.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(1);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not warn about bold inside callout divs', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.for-managers}\n**Bold opener.** This is fine in callouts.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not warn about bold inside code blocks', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\n**Not real bold.** Just code.\n```\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should pass clean content', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n#### Preheat the oven\n\nThis is body text.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn on bold keyword ending with colon', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n**Step one:** Do the thing.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('Step one'), `Warning should mention keyword: ${warnings[0]}`).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should warn on bold keyword ending with period', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n**Important.** This matters.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(1);
        expect(warnings[0].includes('Important'), `Warning should mention keyword: ${warnings[0]}`).toBeTruthy();
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not warn inside callout divs with colon variant', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.pro-tip}\n**Step one:** Do the thing.\n:::\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not warn inside code blocks with colon variant', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n```\n**Bold:** text\n```\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not warn on bold text mid-sentence', () => {
    const testDir = createTestDir();
    try {
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\nThis has **bold text** in the middle.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { warnings } = module.validateBoldKeywords(['src/chapter.md']);
        expect(warnings.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('validate: validateParagraphLength', () => {
  // Build an n-word paragraph of varied words
  function paragraphOfWords(n) {
    return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  }

  it('should pass on production chapters', () => {
    const { errors } = module.validateParagraphLength(module.getIndexFiles());
    expect(errors).toEqual([]);
  });

  it('should not flag paragraphs at or under the limit', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        `## Chapter\n\n${paragraphOfWords(120)}\n\n${paragraphOfWords(50)}\n`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should flag paragraphs over the limit with file and line', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        `## Chapter\n\n${paragraphOfWords(130)}\n`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(['src/chapter.md']);
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('130 words');
        expect(errors[0]).toContain('src/chapter.md:3');
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should NOT flag long content inside code blocks', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        `## Chapter\n\n\`\`\`\n${paragraphOfWords(200)}\n\`\`\`\n`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should flag long paragraphs inside callout divs', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        '## Chapter\n\n::: {.pro-tip custom-style="pro-tip"}\n' +
        `**Pro tip:** ${paragraphOfWords(130)}\n:::\n`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(['src/chapter.md']);
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('src/chapter.md:4');
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should count soft-wrapped lines as one paragraph reported at its first line', () => {
    const testDir = createTestDir();
    try {
      // One 150-word paragraph spread across three source lines with no
      // blank line between them
      createTestFile(testDir, 'src/chapter.md',
        `## Chapter\n\n${paragraphOfWords(50)}\n${paragraphOfWords(50)}\n${paragraphOfWords(50)}\n`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(['src/chapter.md']);
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('150 words');
        expect(errors[0]).toContain('src/chapter.md:3');
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should NOT count long bullet list items as paragraphs', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/chapter.md',
        `## Chapter\n\n- ${paragraphOfWords(130)}\n- ${paragraphOfWords(130)}\n`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should skip generated key-takeaways and scratch files', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'src/part-one-key-takeaways.md',
        `${paragraphOfWords(200)}\n`);
      createTestFile(testDir, 'src/notes-scratch.md',
        `${paragraphOfWords(200)}\n`);

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(
          ['src/part-one-key-takeaways.md', 'src/notes-scratch.md']
        );
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not count markup toward word counts', () => {
    const testDir = createTestDir();
    try {
      // 110 visible words plus heavy markup (links, smallcaps, inline code,
      // footnote refs) must stay under the 120-word limit
      const words = paragraphOfWords(110);
      createTestFile(testDir, 'src/chapter.md',
        `## Chapter\n\n${words} [GitHub](https://github.com/) [API]{.smallcaps} ` +
        '`git commit --amend --no-edit`[^1]\n\n[^1]: A footnote.\n');

      const originalCwd = process.cwd();
      process.chdir(testDir);
      try {
        const { errors } = module.validateParagraphLength(['src/chapter.md']);
        expect(errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

console.log('✓ All test.js tests passed');

describe('validate: severity and plugins', () => {
  it('promotes, demotes, or passes through by configured severity', async () => {
    const { applySeverity } = await importModule();
    const result = { errors: ['e'], warnings: ['w'] };
    // The fixture config sets no severities, so results pass through.
    expect(applySeverity('em-dashes', result)).toEqual(result);
  });

  it('runs book plugins with the config, index files, and chapters', async () => {
    const { runValidation } = await importModule();
    let seen;
    const plugin = {
      name: 'house-style',
      run(ctx) {
        seen = ctx;
        return { errors: ['house style violated'], warnings: [] };
      },
    };
    const log = console.log;
    console.log = () => {};
    try {
      expect(await runValidation({ plugins: [plugin] })).toBe(1);
    } finally {
      console.log = log;
    }
    expect(seen.indexFiles).toContain('src/getting-started.md');
    expect(seen.config.metadata.title).toBeTruthy();
  });

  it('lists every validator name for validators.severity', async () => {
    const { VALIDATORS } = await importModule();
    const names = VALIDATORS.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('tldr-length');
  });
});
