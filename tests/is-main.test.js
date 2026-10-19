import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';

// A command run through a symlink (npm link, pnpm, a worktree sharing another
// checkout's node_modules) must still run. Node reports import.meta.url as the
// real path but argv[1] as the path it was given; comparing them directly made
// the command exit silently without doing anything.
describe('commands run when invoked through a symlink', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  for (const via of ['direct', 'symlink']) {
    it(`strip-page-rules writes its output (${via})`, () => {
      dir = mkdtempSync(join(tmpdir(), 'is-main-'));
      const kit = via === 'symlink' ? join(dir, 'kit') : kitPath();
      if (via === 'symlink') symlinkSync(kitPath(), kit, 'dir');
      const input = join(dir, 'in.css');
      const output = join(dir, 'out.css');
      writeFileSync(input, 'body { color: #333; }\n');

      execFileSync('node', [join(kit, 'commands', 'strip-page-rules.js'), input, output], { stdio: 'pipe' });
      expect(existsSync(output)).toBe(true);
    });
  }
});
