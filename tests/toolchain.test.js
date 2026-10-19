// toolchain.json is the single source of truth for tool versions. Everything
// that restates a version must agree with it.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { kitPath } from '../lib/config.js';

const toolchain = JSON.parse(readFileSync(kitPath('toolchain.json'), 'utf8'));
const read = (...p) => readFileSync(kitPath(...p), 'utf8');

describe('toolchain.json', () => {
  it('pins every Python package in requirements.txt', () => {
    const pins = Object.fromEntries(
      read('requirements.txt')
        .split('\n')
        .filter((l) => /^[A-Za-z]/.test(l))
        .map((l) => l.split('=='))
    );
    expect(pins).toEqual(toolchain.python);
  });

  it('matches .tool-versions for Node', () => {
    expect(read('.tool-versions').trim()).toBe(`nodejs ${toolchain.node}`);
  });

  it('matches the Java version in the EPUBCheck action', () => {
    expect(read('actions', 'epubcheck', 'action.yml')).toContain(`java-version: '${toolchain.java}'`);
  });

  it('pins WeasyPrint and pandoc in the Docker image', () => {
    const dockerfile = read('docker', 'Dockerfile');
    expect(dockerfile).toContain(`ARG PANDOC_VERSION=${toolchain.pandoc}`);
    expect(dockerfile).toContain(`ARG NODE_MAJOR=${toolchain.node.split('.')[0]}`);
    expect(dockerfile).toContain(`ARG JUST_VERSION=${toolchain.just}`);
    expect(dockerfile).toContain('pip3 install --no-cache-dir -r /tmp/requirements.txt');
  });

  it('pins every font source the recipe uses, with a sha256', () => {
    const recipe = JSON.parse(read('fonts', 'recipe.json'));
    for (const job of recipe.subsets) {
      const source = toolchain.fonts[job.source];
      expect(source, job.source).toBeDefined();
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.url).toMatch(/^https:\/\/(github\.com\/adobe-fonts|raw\.githubusercontent\.com\/google\/fonts\/[0-9a-f]{40})\//);
      expect(recipe.unicodes[job.unicodes], job.out).toBeDefined();
      expect(recipe.features[job.features], job.out).toBeDefined();
    }
    expect(new Set(recipe.subsets.map((j) => j.source))).toEqual(new Set(Object.keys(toolchain.fonts)));
    const subsets = new Set(recipe.subsets.map((j) => j.out));
    for (const job of recipe.instances) expect(subsets.has(job.from), job.out).toBe(true);
  });

  it('installs fontTools wherever the kit builds', () => {
    expect(read('actions', 'setup-book-kit', 'action.yml')).toContain('want+=(fonttools brotli)');
  });

  // The fonts are OFL with a Reserved Font Name: the kit may ship the recipe,
  // never subsets or instances (see NOTICE.md).
  it('tracks no font binaries', () => {
    const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'fonts'], {
      cwd: kitPath(),
      encoding: 'utf8',
    });
    expect(tracked.split('\n').filter((f) => /\.(woff2?|ttf|otf)$/.test(f))).toEqual([]);
  });

  it('pins each EPUBCheck version with a sha256', () => {
    for (const sha of Object.values(toolchain.epubcheck)) expect(sha).toMatch(/^[0-9a-f]{64}$/);
  });
});
