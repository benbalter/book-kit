// The repo doubles as a Claude Code marketplace (.claude-plugin/) for the
// plugin in claude-plugin/. Books enable it from their .claude/settings.json,
// so a malformed manifest or a hook that blocks unrelated edits breaks every
// book's sessions. `claude plugin validate` covers the manifests in depth;
// this guards the wiring and the hook's pass-through cases without needing
// the Claude CLI in CI.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { kitPath } from '../lib/config.js';

const json = (file) => JSON.parse(readFileSync(kitPath(file), 'utf8'));
const hook = kitPath('claude-plugin/hooks/validate-chapter.js');

function runHook(stdin, projectDir) {
  return spawnSync('node', [hook], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

describe('claude plugin', () => {
  it('lists the plugin in the marketplace under the manifest name', () => {
    const marketplace = json('.claude-plugin/marketplace.json');
    const manifest = json('claude-plugin/.claude-plugin/plugin.json');
    const entry = marketplace.plugins.find((p) => p.name === manifest.name);
    expect(entry?.source).toBe('./claude-plugin');
  });

  it('points the hook at a script that exists', () => {
    const { hooks } = json('claude-plugin/hooks/hooks.json');
    const commands = hooks.PostToolUse.flatMap((m) => m.hooks.map((h) => h.command));
    for (const command of commands) {
      const script = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/)[1];
      expect(existsSync(kitPath('claude-plugin', script))).toBe(true);
    }
  });

  it('gives every agent a name and description', () => {
    const dir = kitPath('claude-plugin/agents');
    for (const file of readdirSync(dir)) {
      const frontmatter = readFileSync(path.join(dir, file), 'utf8').split('---')[1];
      expect(frontmatter).toMatch(/^name: \S+$/m);
      expect(frontmatter).toMatch(/^description: \S.+$/m);
    }
  });

  describe('validate-chapter hook', () => {
    const notABook = mkdtempSync(path.join(tmpdir(), 'not-a-book-'));

    it('passes through outside a book-kit book', () => {
      const result = runHook(JSON.stringify({ tool_input: { file_path: 'src/chapter.md' } }), notABook);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    });

    it('passes through edits that are not chapters', () => {
      const result = runHook(JSON.stringify({ tool_input: { file_path: 'index.yml' } }), kitPath('example'));
      expect(result.status).toBe(0);
    });

    it('passes through malformed input', () => {
      expect(runHook('not json', notABook).status).toBe(0);
    });
  });
});
