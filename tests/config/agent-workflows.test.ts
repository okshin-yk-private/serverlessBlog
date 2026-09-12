import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dir, '../..');

function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'blog-agent-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function put(dir: string, name: string, content: string) {
  const path = join(dir, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function syncFixture(dir: string) {
  put(
    dir,
    'scripts/sync-ai-docs.ts',
    readFileSync(join(repo, 'scripts/sync-ai-docs.ts'), 'utf8')
  );
  put(dir, 'AGENTS.md', 'Codex-specific: docs/ai-shared-rules.md\n');
  put(dir, 'CLAUDE.md', '@docs/ai-shared-rules.md\nClaude-specific\n');
  put(dir, 'docs/ai-shared-rules.md', 'shared rules\n');
  put(
    dir,
    '.ai/agents.md',
    'obsolete content that must not overwrite entrypoints\n'
  );
  put(dir, '.ai/mcp.json', '{"mcpServers":{}}\n');
  put(
    dir,
    '.ai/commands/example.json',
    JSON.stringify({ description: 'example' })
  );
  put(dir, '.ai/commands/example.md', 'example workflow\n');
}

function sync(dir: string, args: string[] = []) {
  return spawnSync(process.execPath, ['scripts/sync-ai-docs.ts', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
}

describe('agent workflow integration', () => {
  test('sync preserves distinct entrypoints and updates MCP and commands in one pass', () => {
    fixture((dir) => {
      syncFixture(dir);
      const before = ['AGENTS.md', 'CLAUDE.md'].map((name) =>
        readFileSync(join(dir, name), 'utf8')
      );
      const result = sync(dir);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(
        ['AGENTS.md', 'CLAUDE.md'].map((name) =>
          readFileSync(join(dir, name), 'utf8')
        )
      ).toEqual(before);
      expect(existsSync(join(dir, '.mcp.json'))).toBe(true);
      expect(
        readFileSync(join(dir, '.claude/commands/example.md'), 'utf8')
      ).toContain('example workflow');
      expect(
        readFileSync(join(dir, '.codex/prompts/example.md'), 'utf8')
      ).toContain('example workflow');
      expect(sync(dir, ['--check']).status).toBe(0);
    });
  });

  test('check mode reports drift without writing outputs or replacing entrypoints', () => {
    fixture((dir) => {
      syncFixture(dir);
      expect(sync(dir, ['--check']).status).toBe(1);
      expect(existsSync(join(dir, '.mcp.json'))).toBe(false);
      expect(existsSync(join(dir, '.claude/commands/example.md'))).toBe(false);
      expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain(
        'Codex-specific'
      );
    });
  });

  test('missing shared rules fail before any generated output is written', () => {
    fixture((dir) => {
      syncFixture(dir);
      rmSync(join(dir, 'docs/ai-shared-rules.md'));
      expect(sync(dir).status).toBe(1);
      expect(existsSync(join(dir, '.mcp.json'))).toBe(false);
    });
  });

  test('launcher selects its own repository root from a parent cwd and preserves arguments', () => {
    fixture((dir) => {
      const project = join(dir, 'project with spaces');
      put(
        project,
        'scripts/run-codex.sh',
        readFileSync(join(repo, 'scripts/run-codex.sh'), 'utf8')
      );
      put(dir, 'bin/codex', '#!/bin/sh\nprintf "%s\\n" "$@"\n');
      chmodSync(join(dir, 'bin/codex'), 0o755);
      const result = spawnSync(
        'bash',
        [
          join(project, 'scripts/run-codex.sh'),
          'a prompt with spaces',
          '--search',
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          },
          encoding: 'utf8',
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim().split('\n')).toEqual([
        '--cd',
        project,
        'a prompt with spaces',
        '--search',
      ]);
    });
  });

  test('Codex routes and shared diagram references resolve without absolute machine paths', () => {
    const skillRoot = join(repo, '.agents/skills');
    const entrypoints = readdirSync(skillRoot).map((name) =>
      join(skillRoot, name, 'SKILL.md')
    );
    const diagrams = join(repo, '.claude/skills/terraform-to-drawio/SKILL.md');
    const pending = [...entrypoints, diagrams];
    const visited = new Set<string>();
    while (pending.length) {
      const file = pending.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const body = readFileSync(file, 'utf8');
      for (const match of body.matchAll(
        /\[[^\]]+\]\(([^\s)]+\.md)(?:#[^)]*)?\)/g
      )) {
        if (/^https?:/.test(match[1])) continue;
        expect(match[1].startsWith('/')).toBe(false);
        const target = resolve(dirname(file), match[1]);
        expect(existsSync(target)).toBe(true);
        pending.push(target);
      }
    }
    for (const name of ['create-pr', 'create-issue', 'review-pr-comments']) {
      expect(
        readFileSync(join(skillRoot, name, 'agents/openai.yaml'), 'utf8')
      ).toContain('allow_implicit_invocation: false');
      expect(
        readFileSync(join(repo, '.claude/skills', name, 'SKILL.md'), 'utf8')
      ).toContain('disable-model-invocation: true');
    }
    expect(existsSync(join(skillRoot, 'team-implement'))).toBe(false);
  });
});
