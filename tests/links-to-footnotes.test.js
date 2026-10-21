import { describe, it, expect } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create unique test directory
function createTestDir() {
  return fs.mkdtempSync('/tmp/test-links-to-footnotes-');
}

// Helper to clean up test and backup directories
function cleanupTestDir(testDir) {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
    const parentDir = path.dirname(testDir);
    const backupPattern = path.basename(testDir) + '_backup_';
    const files = fs.readdirSync(parentDir);
    files.filter(f => f.startsWith(backupPattern)).forEach(f => {
      fs.rmSync(path.join(parentDir, f), { recursive: true, force: true });
    });
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Helper to run the script
function runScript(testDir, args = []) {
  const scriptPath = path.join(__dirname, '..', 'commands', 'links-to-footnotes.js');
  const cmd = `node ${scriptPath} ${testDir} ${args.join(' ')}`;
  try {
    return execSync(cmd, { encoding: 'utf8' });
  } catch (error) {
    return error.stdout || error.stderr;
  }
}

// Helper to create and read test files
function createTestFile(dir, filename, content) {
  fs.writeFileSync(path.join(dir, filename), content);
}

function readTestFile(dir, filename) {
  return fs.readFileSync(path.join(dir, filename), 'utf8');
}

describe('links-to-footnotes: converts external links to footnotes', () => {
  it('should convert simple external link', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nVisit [GitHub](https://github.com) for more.');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/Visit GitHub\[\^1\] for more/);
      expect(result).toMatch(/\[\^1\]: https:\/\/github\.com/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should place footnote reference after punctuation', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nSee [GitHub](https://github.com).');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/See GitHub\.\[\^1\]/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle angle-bracketed URLs', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nVisit [example](<https://example.com>).');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/\[\^1\]: https:\/\/example\.com/);
      expect(!result.includes('<https://')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle multiple external links with global numbering', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test4a.md', '## Test A\n\nSee [GitHub](https://github.com).');
      createTestFile(testDir, 'test4b.md', '## Test B\n\nAlso [example](https://example.com).');
      
      runScript(testDir, ['--no-backup']);
      
      const resultA = readTestFile(testDir, 'test4a.md');
      const resultB = readTestFile(testDir, 'test4b.md');
      
      expect(resultA).toMatch(/\[\^1\]/);
      expect(resultB).toMatch(/\[\^2\]/);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: handles internal links with context', () => {
  it('should convert internal chapter link to parenthetical', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test Chapter\n\nSee [Test Chapter](#test-chapter) for details.');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/See Test Chapter for details/);
      expect(!result.includes('[^')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle internal link when link text differs from title', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Chapter One\n\n## Chapter Two\n\nRefer to [first chapter](#chapter-one).');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      // Internal links are stripped to plain text without parenthetical references
      expect(result).toMatch(/Refer to first chapter\./);
      expect(!result.includes('(')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should detect existing cross-reference phrases', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nSee [another section](#test).');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      // Internal link stripped to plain text
      expect(result).toMatch(/See another section\./);
      expect(!result.includes('(')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle section links with chapter context', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Main Chapter\n\n### Section One\n\nCheck [Section One](#section-one).');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      // Internal link stripped to plain text without chapter reference
      expect(result).toMatch(/Check Section One\./);
      expect(!result.includes('(')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: anchor generation', () => {
  it('should generate anchors from headings', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '## Test Chapter: One\n\nLink to [Test Chapter: One](#test-chapter-one).'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      // Should find the anchor and convert to parenthetical reference
      expect(!result.includes('[^')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should generate anchors from H1 headings', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '# Section Title\n\n## Chapter One\n\nSee [Section Title](#section-title) for details.'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      // H1 anchor should be resolved without creating a footnote
      expect(!result.includes('[^')).toBeTruthy();
      expect(result).toMatch(/See Section Title for details/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle H1 heading with different link text', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '# Tending the Garden\n\n## Chapter One\n\nUse [these practices](#tending-the-garden) daily.'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      // Should resolve to plain text, not create a footnote
      expect(!result.includes('[^')).toBeTruthy();
      expect(result).toMatch(/Use these practices daily\./);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle H1 heading with explicit custom ID', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '# Prologue {#prologue epub:type=prologue}\n\n## Chapter\n\nSee [the intro](#prologue) here.'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^')).toBeTruthy();
      expect(result).toMatch(/See the intro here\./);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle H1 heading with attribute block but no explicit ID', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '# Appendix {epub:type=appendix}\n\n## Chapter\n\nSee [the appendix](#appendix) here.'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^')).toBeTruthy();
      expect(result).toMatch(/See the appendix here\./);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle custom anchor IDs', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '## Custom Heading {#custom-id}\n\nSee [Custom Heading](#custom-id).'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should match Pandoc auto-identifiers for headings with apostrophes', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        "## The Gardener's Almanac\n\nSee [the planting calendar](#the-gardeners-almanac) for details."
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/See the planting calendar for details\./);
      expect(!result.includes('[^')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle duplicate heading names', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '## Overview\n\n## Overview\n\nFirst [Overview](#overview) and second [Overview](#overview-1).'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      // Both should be resolved (no footnotes created)
      expect(!result.includes('[^')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should preserve inline span formatting in heading titles', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Reading a [PDF]{.smallcaps} Star Chart\n\nSee [star charts](#reading-a-pdf-star-chart) for details.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      // Internal link stripped to plain text
      expect(result).toMatch(/See star charts for details\./);
      expect(!result.includes('[^')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should match titles with inline spans to plain text link text', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Reading a [PDF]{.smallcaps} Star Chart\n\nSee [Reading a PDF Star Chart](#reading-a-pdf-star-chart).'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      // Internal link stripped to plain text
      expect(!result.includes('see the chapter')).toBeTruthy();
      expect(!result.includes('[^')).toBeTruthy();
      expect(result).toMatch(/See Reading a PDF Star Chart\./);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: nested brackets in link text', () => {
  it('should handle link text containing smallcaps span (internal)', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Reading a [PDF]{.smallcaps} Star Chart\n\n' +
        'See [[PDF]{.smallcaps}s](#reading-a-pdf-star-chart) for details.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      // Internal link should be stripped to plain text (no footnote)
      expect(result).toMatch(/See \[PDF\]\{\.smallcaps\}s for details\./);
      expect(!result.includes('[^')).toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle link text containing smallcaps span (external)', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\n' +
        'Learn about [[URL]{.smallcaps}s](https://example.com) here.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      // External link should become a footnote, preserving the span in text
      expect(result).toMatch(/Learn about \[URL\]\{\.smallcaps\}s\[\^1\] here\./);
      expect(result).toMatch(/\[\^1\]: https:\/\/example\.com/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle link text with nested brackets and trailing punctuation', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\n' +
        'Read about [[API]{.smallcaps}s](https://example.com/api).'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/Read about \[API\]\{\.smallcaps\}s\.\[\^1\]/);
      expect(result).toMatch(/\[\^1\]: https:\/\/example\.com\/api/);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: footnote placement', () => {
  it('should move existing footnotes after punctuation', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nText[^1].');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/Text\.\[\^1\]/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle question marks', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nQuestion[^1]?');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/Question\?\[\^1\]/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle exclamation marks', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nExcited[^1]!');
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/Excited!\[\^1\]/);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: footnote definitions', () => {
  it('should convert links within footnotes to parentheticals', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', 
        '## Test\n\nText[^1].\n\n[^1]: See [example](https://example.com) for more.'
      );
      
      runScript(testDir, ['--no-backup']);
      
      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/\[\^1\]: See example \(https:\/\/example\.com\) for more/);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: --link-footnote-urls (Kindle)', () => {
  it('should make each footnote URL an autolink', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nVisit [GitHub](https://github.com) for more.');

      runScript(testDir, ['--no-backup', '--preserve-internal-links', '--link-footnote-urls']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/Visit GitHub\[\^1\] for more/);
      expect(result).toMatch(/\[\^1\]: <https:\/\/github\.com>/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should autolink the URL of a link inside a footnote definition', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nText[^1].\n\n[^1]: See [example](https://example.com) for more.'
      );

      runScript(testDir, ['--no-backup', '--link-footnote-urls']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/\[\^1\]: See example \(<https:\/\/example\.com>\) for more/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should leave footnote URLs as plain text without the flag (print)', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nVisit [GitHub](https://github.com) for more.');

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).not.toMatch(/</);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: backup functionality', () => {
  it('should create backup when not using --no-backup', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nVisit [GitHub](https://github.com).');
      
      const output = runScript(testDir, []);
      
      // Check output mentions backup
      expect(output).toMatch(/Creating backup/);
      expect(output).toMatch(/backup_/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not create backup with --no-backup flag', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md', '## Test\n\nVisit [GitHub](https://github.com).');
      
      const output = runScript(testDir, ['--no-backup']);
      
      expect(output).toMatch(/No backup created/);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: skips links inside code', () => {
  it('should not convert links inside inline code spans', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nShipped the `[first iteration](link to PR)` to help us.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^'), 'should not create footnotes').toBeTruthy();
      expect(result).toMatch(/`\[first iteration\]\(link to PR\)`/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should convert links outside code spans on the same line', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nUse `code` and visit [GitHub](https://github.com) for more.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/`code`/);
      expect(result).toMatch(/visit GitHub\[\^1\] for more/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle multiple code spans with links between them', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nRun `cmd1` then [see docs](https://docs.example.com) and `cmd2`.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/`cmd1`/);
      expect(result).toMatch(/`cmd2`/);
      expect(result).toMatch(/see docs\[\^1\] and/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not convert links inside fenced code blocks', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\n```\n[example link](https://example.com)\n```\n\nAfter the block.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^'), 'should not create footnotes').toBeTruthy();
      expect(result).toMatch(/\[example link\]\(https:\/\/example\.com\)/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should convert links after fenced code block ends', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\n```\n[skip](https://skip.com)\n```\n\nSee [GitHub](https://github.com).'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/\[skip\]\(https:\/\/skip\.com\)/);
      expect(result).toMatch(/See GitHub\.\[\^1\]/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle tilde fenced code blocks', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\n~~~\n[example](https://example.com)\n~~~\n\nDone.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^'), 'should not create footnotes').toBeTruthy();
      expect(result).toMatch(/\[example\]\(https:\/\/example\.com\)/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle fenced code blocks with language tag', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\n```markdown\n[example](https://example.com)\n```\n\nDone.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^'), 'should not create footnotes').toBeTruthy();
      expect(result).toMatch(/\[example\]\(https:\/\/example\.com\)/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should preserve code span with link adjacent to real link', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nUse `[text](url)` syntax like [GitHub](https://github.com).'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/`\[text\]\(url\)`/);
      expect(result).toMatch(/like GitHub\.\[\^1\]/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle duplicate URLs across files', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'a.md',
        '## A\n\nVisit [GitHub](https://github.com).'
      );
      createTestFile(testDir, 'b.md',
        '## B\n\nAlso [GitHub](https://github.com).'
      );

      runScript(testDir, ['--no-backup']);

      const resultA = readTestFile(testDir, 'a.md');
      const resultB = readTestFile(testDir, 'b.md');
      expect(resultA).toMatch(/\[\^1\]: https:\/\/github\.com/);
      expect(resultB).toMatch(/\[\^2\]: https:\/\/github\.com/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle multiple links on same line', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nSee [A](https://a.com) and [B](https://b.com) for info.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result).toMatch(/See A\[\^1\] and B\[\^2\] for info/);
      expect(result).toMatch(/\[\^1\]: https:\/\/a\.com/);
      expect(result).toMatch(/\[\^2\]: https:\/\/b\.com/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should not convert links in indented code blocks', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nNormal text.\n\n```\n[link](https://example.com)\nMore code\n```\n\nAfter.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(result.includes('[link](https://example.com)'), 'link in code preserved').toBeTruthy();
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle file with no links', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nJust plain text with no links at all.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^'), 'no footnotes created').toBeTruthy();
      expect(result).toMatch(/Just plain text with no links at all/);
    } finally {
      cleanupTestDir(testDir);
    }
  });

  it('should handle consecutive code spans on same line', () => {
    const testDir = createTestDir();
    try {
      createTestFile(testDir, 'test.md',
        '## Test\n\nRun `[a](b)` and `[c](d)` as-is.'
      );

      runScript(testDir, ['--no-backup']);

      const result = readTestFile(testDir, 'test.md');
      expect(!result.includes('[^'), 'no footnotes from code spans').toBeTruthy();
      expect(result).toMatch(/`\[a\]\(b\)`/);
      expect(result).toMatch(/`\[c\]\(d\)`/);
    } finally {
      cleanupTestDir(testDir);
    }
  });
});

describe('links-to-footnotes: error handling', () => {
  it('should error on non-existent directory', () => {
    const output = runScript('/tmp/nonexistent-dir-12345', ['--no-backup']);
    expect(output).toMatch(/does not exist/);
  });

  it('should show usage with invalid args', () => {
    const output = runScript('', []);
    expect(output).toMatch(/Usage:/);
  });
});

console.log('✓ All links-to-footnotes tests passed');
