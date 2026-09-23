import { describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Issue #692: harness guards against reviewing a stale checkout and against
// switching branches in a main checkout that other sessions share.

const repo = resolve(import.meta.dir, '../..');
const sessionHook = join(repo, '.claude/hooks/session-context.sh');
const guardHook = join(repo, '.claude/hooks/guard-main-checkout.sh');

// Isolate from the developer's git config (signing, hooks, default branch).
function gitEnv(root: string) {
  const globalConfig = join(root, 'gitconfig');
  writeFileSync(
    globalConfig,
    '[user]\n\tname = Harness Test\n\temail = harness@example.test\n'
  );
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

type Repos = {
  root: string;
  clone: string;
  env: NodeJS.ProcessEnv;
  git: (cwd: string, ...args: string[]) => string;
};

// origin has two commits on develop; `clone` only knows the first one.
function withRepos(run: (repos: Repos) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'blog-harness-')));
  try {
    const env = gitEnv(root);
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
      }
      return result.stdout.trim();
    };
    const origin = join(root, 'origin.git');
    git(root, 'init', '--quiet', '--bare', '--initial-branch=develop', origin);
    const seed = join(root, 'seed');
    git(root, 'clone', '--quiet', origin, seed);
    git(seed, 'commit', '--quiet', '--allow-empty', '-m', 'one');
    git(seed, 'push', '--quiet', 'origin', 'HEAD:develop');
    const clone = join(root, 'clone');
    git(root, 'clone', '--quiet', origin, clone);
    git(seed, 'commit', '--quiet', '--allow-empty', '-m', 'two');
    git(seed, 'push', '--quiet', 'origin', 'HEAD:develop');
    run({ root, clone, env, git });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runHook(
  hook: string,
  payload: object,
  env: NodeJS.ProcessEnv,
  extraEnv: Record<string, string> = {}
) {
  return spawnSync(hook, [], {
    input: JSON.stringify(payload),
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function decision(result: ReturnType<typeof runHook>) {
  if (!result.stdout.trim()) return '';
  return JSON.parse(result.stdout).hookSpecificOutput.permissionDecision;
}

describe('session-context hook', () => {
  test('fetches and warns when HEAD is behind origin/develop', () => {
    withRepos(({ clone, env }) => {
      const result = runHook(sessionHook, { cwd: clone }, env);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('fetched origin/develop just now');
      expect(result.stdout).toContain('- checkout: main checkout');
      expect(result.stdout).toContain(
        'HEAD vs origin/develop: ahead 0, behind 1'
      );
      expect(result.stdout).toContain(
        'WARNING: HEAD is 1 commits behind origin/develop'
      );
      expect(result.stdout).toContain('NOTE: the main checkout');
    });
  });

  test('a failed fetch still exits 0 and says the comparison may be stale', () => {
    withRepos(({ root, clone, env, git }) => {
      git(clone, 'remote', 'set-url', 'origin', join(root, 'missing.git'));
      const result = runHook(sessionHook, { cwd: clone }, env);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('fetch failed');
    });
  });

  test('a fetch that exceeds the timeout is abandoned without blocking', () => {
    withRepos(({ clone, env }) => {
      const result = runHook(sessionHook, { cwd: clone }, env, {
        SESSION_CONTEXT_FETCH_TIMEOUT: '0',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('fetch timed out');
    });
  });

  test('in a worktree it reports the worktree and lists the main checkout', () => {
    withRepos(({ root, clone, env, git }) => {
      const worktree = join(root, 'wt');
      git(clone, 'worktree', 'add', '--quiet', '-b', 'feature', worktree);
      const result = runHook(sessionHook, { cwd: worktree }, env);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`- checkout: worktree (${worktree})`);
      expect(result.stdout).toContain(`  - ${clone} [develop]`);
      expect(result.stdout).not.toContain('NOTE: the main checkout');
    });
  });

  test('outside a git repository it prints nothing and exits 0', () => {
    withRepos(({ root, env }) => {
      const result = runHook(sessionHook, { cwd: root }, env);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
    });
  });
});

describe('guard-main-checkout hook', () => {
  test('asks before a branch switch in the main checkout', () => {
    withRepos(({ clone, env }) => {
      for (const command of [
        'git switch feature',
        'git checkout feature',
        'git checkout -b feature origin/develop',
        'gh pr checkout 12',
      ]) {
        const result = runHook(
          guardHook,
          { cwd: clone, tool_input: { command } },
          env
        );
        expect(result.status).toBe(0);
        expect(decision(result)).toBe('ask');
      }
    });
  });

  test('lets file restores and unrelated commands through', () => {
    withRepos(({ clone, env }) => {
      for (const command of [
        'git checkout -- package.json',
        'git checkout HEAD -- a.txt b.txt',
        'git status',
        'echo git switch-case',
      ]) {
        const result = runHook(
          guardHook,
          { cwd: clone, tool_input: { command } },
          env
        );
        expect(result.status).toBe(0);
        expect(decision(result)).toBe('');
      }
    });
  });

  test('allows switching inside a worktree but not `git -C <main>` from one', () => {
    withRepos(({ root, clone, env, git }) => {
      const worktree = join(root, 'wt');
      git(clone, 'worktree', 'add', '--quiet', '-b', 'feature', worktree);
      const inside = runHook(
        guardHook,
        { cwd: worktree, tool_input: { command: 'git switch -c other' } },
        env
      );
      expect(decision(inside)).toBe('');
      const viaDashC = runHook(
        guardHook,
        {
          cwd: worktree,
          tool_input: { command: `git -C "${clone}" checkout develop` },
        },
        env
      );
      expect(decision(viaDashC)).toBe('ask');
      const viaCd = runHook(
        guardHook,
        {
          cwd: clone,
          tool_input: { command: `cd ${worktree} && git checkout develop` },
        },
        env
      );
      expect(decision(viaCd)).toBe('');
    });
  });
});

describe('harness wiring', () => {
  test('settings register both hooks and the scripts are executable', () => {
    const settings = JSON.parse(
      readFileSync(join(repo, '.claude/settings.json'), 'utf8')
    );
    const commands = (event: string) =>
      settings.hooks[event].flatMap(
        (entry: { matcher?: string; hooks: { command: string }[] }) =>
          entry.hooks.map((hook) => `${entry.matcher ?? '*'} ${hook.command}`)
      );
    expect(commands('SessionStart').join('\n')).toContain('session-context.sh');
    expect(commands('PreToolUse').join('\n')).toContain(
      'Bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard-main-checkout.sh'
    );
    for (const hook of [sessionHook, guardHook]) {
      expect(statSync(hook).mode & 0o111).not.toBe(0);
    }
  });

  test('shared rules and skills carry the freshness and worktree steps', () => {
    const read = (path: string) => readFileSync(join(repo, path), 'utf8');
    const rules = read('docs/ai-shared-rules.md');
    expect(rules).toContain('## Checkout freshness and worktrees');
    expect(rules).toContain('HEAD...origin/develop');
    expect(rules).toContain('gh issue list --state all');
    expect(rules).toContain('git worktree add .claude/worktrees/');
    expect(read('.claude/skills/create-issue/SKILL.md')).toContain(
      'git rev-list --left-right --count HEAD...origin/develop'
    );
    expect(read('.claude/skills/create-issue/SKILL.md')).toContain(
      'gh issue list --state all'
    );
    expect(read('.claude/skills/implement-issue/SKILL.md')).toContain(
      'git worktree add .claude/worktrees/issue-<N>'
    );
    expect(read('.claude/skills/create-pr/SKILL.md')).toContain(
      'git worktree add .claude/worktrees/<name>'
    );
  });
});
