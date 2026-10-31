import { describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/security-scan.yml', 'utf8');

function scriptAfter(marker: string) {
  const step = workflow.slice(workflow.indexOf(marker));
  const script = step.split('        run: |\n')[1].split(/\n\S|\n {2,8}\S/)[0];
  return script.replace(/^ {10}/gm, '');
}

function fixture(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'security-workflow-'));
  try {
    mkdirSync(join(directory, 'bin'));
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function execute(
  script: string,
  directory: string,
  env: Record<string, string>
) {
  return spawnSync('bash', ['-e', '-c', script], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${directory}/bin:${process.env.PATH}`,
      ...env,
    },
    encoding: 'utf8',
  });
}

describe('security scan uses immutable branch targets', () => {
  const script = scriptAfter('      - id: targets');

  test('scheduled scans resolve both deploy branches once', () => {
    fixture((directory) => {
      writeFileSync(
        join(directory, 'bin/gh'),
        '#!/bin/sh\nprintf "%s\\n" "$2"\n',
        { mode: 0o755 }
      );
      const output = join(directory, 'output');
      expect(
        execute(script, directory, {
          EVENT_NAME: 'schedule',
          REPOSITORY: 'owner/repo',
          GITHUB_OUTPUT: output,
        }).status
      ).toBe(0);
      const targets = JSON.parse(
        readFileSync(output, 'utf8').trim().replace('targets=', '')
      );
      expect(targets).toEqual(
        ['develop', 'main'].map((branch) => ({
          name: branch,
          ref: `refs/heads/${branch}`,
          sha: `repos/owner/repo/git/ref/heads/${branch}`,
        }))
      );
    });
  });

  test('PR scans preserve the merge ref and event SHA', () => {
    fixture((directory) => {
      const output = join(directory, 'output');
      expect(
        execute(script, directory, {
          EVENT_NAME: 'pull_request',
          EVENT_REF: 'refs/pull/123/merge',
          EVENT_SHA: 'abc123',
          GITHUB_OUTPUT: output,
        }).status
      ).toBe(0);
      expect(
        JSON.parse(readFileSync(output, 'utf8').trim().replace('targets=', ''))
      ).toEqual([{ name: 'event', ref: 'refs/pull/123/merge', sha: 'abc123' }]);
    });
  });

  test('branch resolution failure cannot become an empty successful scan', () => {
    fixture((directory) => {
      writeFileSync(join(directory, 'bin/gh'), '#!/bin/sh\nexit 1\n', {
        mode: 0o755,
      });
      expect(
        execute(script, directory, {
          EVENT_NAME: 'schedule',
          REPOSITORY: 'owner/repo',
          GITHUB_OUTPUT: join(directory, 'output'),
        }).status
      ).not.toBe(0);
    });
  });
});

describe('dependency audit distinguishes findings from tool errors', () => {
  const script = `python3 '${resolve('scripts/ci/security_gate.py')}' bun`;
  for (const [output, status, expected] of [
    ['{}', 0, 0],
    [
      '{"package":[{"severity":"moderate","url":"https://github.com/advisories/GHSA-test"}]}',
      1,
      0,
    ],
    [
      '{"package":[{"severity":"critical","url":"https://github.com/advisories/GHSA-test"}]}',
      1,
      1,
    ],
    [
      '{"package":[{"severity":"high","url":"https://github.com/advisories/GHSA-test"}]}',
      1,
      1,
    ],
    ['', 1, 1],
    ['{"error":"registry unavailable"}', 1, 1],
    ['{}', 1, 1],
    ['{}', 2, 1],
    ['{"package":[]}', 1, 1],
    ['{"package":[{"severity":"unknown"}]}', 1, 1],
  ] as const) {
    test(`audit exit ${status}, report ${output || 'missing'}`, () => {
      fixture((directory) => {
        for (const name of [
          '.',
          'frontend/admin',
          'frontend/public-astro',
          'scripts/deploy',
        ]) {
          mkdirSync(join(directory, name), { recursive: true });
          writeFileSync(join(directory, name, 'bun.lock'), '{}');
        }
        writeFileSync(
          join(directory, 'bin/bun'),
          '#!/bin/sh\nprintf "%s" "$AUDIT_OUTPUT"\nexit "$AUDIT_STATUS"\n',
          { mode: 0o755 }
        );
        expect(
          execute(script, directory, {
            AUDIT_OUTPUT: output,
            AUDIT_STATUS: String(status),
          }).status
        ).toBe(expected);
      });
    });
  }
});

describe('security aggregate fails closed', () => {
  const script = scriptAfter(
    '      - name: Require successful scanners and uploads'
  );
  const success = Object.fromEntries(
    ['TARGETS', 'GITLEAKS', 'CODEQL', 'TRIVY', 'ZIZMOR', 'AUDIT'].map(
      (name) => [`${name}_RESULT`, 'success']
    )
  );
  test('all scanners and uploads must succeed', () => {
    fixture((directory) => {
      expect(execute(script, directory, success).status).toBe(0);
      for (const key of Object.keys(success)) {
        for (const result of ['failure', 'cancelled', 'skipped', '']) {
          expect(
            execute(script, directory, { ...success, [key]: result }).status
          ).toBe(1);
        }
      }
    });
  });
});

describe('security enforcement keeps evidence and fails closed', () => {
  const gate = resolve('scripts/ci/security_gate.py');
  test('Trivy gates severity, not duplicate locations, and rejects missing reports', () => {
    fixture((directory) => {
      const report = join(directory, 'trivy.json');
      const summary = join(directory, 'summary');
      const command = `python3 '${gate}' trivy '${report}'`;
      expect(execute(command, directory, {}).status).toBe(1);
      for (const severity of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
        writeFileSync(
          report,
          JSON.stringify({
            version: '2.1.0',
            runs: [
              {
                tool: {
                  driver: {
                    name: 'Trivy',
                    rules: [
                      { id: 'CVE-test', properties: { tags: [severity] } },
                    ],
                  },
                },
                results: [{ ruleId: 'CVE-test' }, { ruleId: 'CVE-test' }],
              },
            ],
          })
        );
        const result = execute(command, directory, {
          GITHUB_STEP_SUMMARY: summary,
        });
        expect(result.status).toBe(
          ['HIGH', 'CRITICAL'].includes(severity) ? 1 : 0
        );
        expect(result.stdout).toContain('2 result locations, 1 distinct rules');
      }
      for (const invalid of ['{}', '{"runs":[]}', 'not json']) {
        writeFileSync(report, invalid);
        expect(execute(command, directory, {}).status).toBe(1);
      }
    });
  });
  test('Go blocks reachable findings and tool failures but preserves package-only details', () => {
    fixture((directory) => {
      mkdirSync(join(directory, 'go-functions'));
      writeFileSync(
        join(directory, 'bin/govulncheck'),
        '#!/bin/sh\nprintf "%s" "$REPORT"\nexit "$STATUS"\n',
        { mode: 0o755 }
      );
      for (const [status, report, expected] of [
        [0, 'No vulnerabilities found.', 0],
        [
          0,
          'Your code is affected by 0 vulnerabilities.\nThis scan also found 2 vulnerabilities in packages you import',
          0,
        ],
        [3, 'Your code is affected by 1 vulnerability.', 1],
        [0, 'Your code is affected by 1 vulnerability.', 1],
        [0, '', 1],
        [1, 'network failure', 1],
      ] as const) {
        expect(
          execute(`python3 '${gate}' go`, directory, {
            STATUS: String(status),
            REPORT: report,
          }).status
        ).toBe(expected);
        expect(readFileSync(join(directory, 'govulncheck.txt'), 'utf8')).toBe(
          report
        );
      }
    });
  });
  test('Bun collects all four reports even when findings fail', () => {
    fixture((directory) => {
      for (const path of [
        '.',
        'frontend/admin',
        'frontend/public-astro',
        'scripts/deploy',
      ]) {
        mkdirSync(join(directory, path), { recursive: true });
        writeFileSync(join(directory, path, 'bun.lock'), '{}');
      }
      writeFileSync(
        join(directory, 'bin/bun'),
        '#!/bin/sh\nprintf \'%s\' \'{"p":[{"severity":"high","url":"https://github.com/advisories/GHSA-test"}]}\'\nexit 1\n',
        { mode: 0o755 }
      );
      const result = execute(`python3 '${gate}' bun`, directory, {});
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        '4 records, 1 distinct advisories, 1 distinct High/Critical'
      );
      for (const name of [
        'root',
        'frontend-admin',
        'frontend-public-astro',
        'scripts-deploy',
      ])
        expect(
          readFileSync(join(directory, `bun-audit-${name}.json`), 'utf8')
        ).toContain('GHSA-test');
    });
  });
  test('workflow preserves reports on failure and aggregate consumes gate job', () => {
    expect(workflow).toContain(
      'run: python3 scripts/ci/security_gate.py trivy trivy-fs.sarif'
    );
    expect(workflow).toContain('python3 scripts/ci/security_gate.py go');
    expect(workflow).toContain(
      '- name: Preserve dependency reports\n        if: always()'
    );
    expect(workflow).toContain(
      'needs: [scan-targets, gitleaks, codeql, trivy-fs, zizmor, dependency-audit]'
    );
  });
});
