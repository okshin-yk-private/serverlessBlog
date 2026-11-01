import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(actions: string[], type = 'aws_s3_bucket', unknown = false) {
  return spawnSync('python3', ['scripts/ci/check_backup_plan.py'], {
    input: JSON.stringify({
      format_version: '1.2',
      resource_changes: [
        {
          address: `module.content_backup.${type}.backup`,
          type,
          change: { actions, after_unknown: { bucket: unknown } },
        },
      ],
    }),
    encoding: 'utf8',
  });
}

describe('backup recovery plan safety', () => {
  test('rejects both replacement orders, deletion and state removal', () => {
    for (const actions of [
      ['delete'],
      ['delete', 'create'],
      ['create', 'delete'],
      ['forget'],
    ]) {
      expect(run(actions).status).toBe(1);
    }
  });
  test('protects every bucket guard, including default retention', () => {
    for (const type of [
      'aws_s3_bucket_policy',
      'aws_s3_bucket_public_access_block',
      'aws_s3_bucket_versioning',
      'aws_s3_bucket_object_lock_configuration',
      'aws_s3_bucket_server_side_encryption_configuration',
      'aws_s3_bucket_lifecycle_configuration',
    ]) {
      expect(run(['delete', 'create'], type).status).toBe(1);
      expect(run(['create'], type).status).toBe(0);
      expect(run(['update'], type).status).toBe(0);
    }
  });
  test('accepts existing bucket and rejects the incident unknown-name plan', () => {
    expect(run(['no-op']).status).toBe(0);
    expect(run(['update']).status).toBe(0);
    expect(run(['create'], 'aws_s3_bucket', true).status).toBe(1);
    expect(run(['delete', 'create'], 'aws_s3_bucket', true).status).toBe(1);
  });
  test('missing, malformed, errored and unknown-action reports fail closed', () => {
    for (const input of [
      '',
      '{}',
      '{"format_version":"1.2","resource_changes":[] ,"errored":true}',
      'not-json',
    ]) {
      expect(
        spawnSync('python3', ['scripts/ci/check_backup_plan.py'], {
          input,
          encoding: 'utf8',
        }).status
      ).toBe(1);
    }
    expect(run(['unexpected']).status).toBe(1);
  });
  test('both environments retain precise references without module-wide dependency', () => {
    for (const env of ['dev', 'prd']) {
      const source = readFileSync(
        `terraform/environments/${env}/main.tf`,
        'utf8'
      );
      const block = source
        .slice(source.indexOf('module "content_backup"'))
        .split('\n}')[0];
      expect(block).not.toMatch(/^\s*depends_on\s*=/m);
      expect(block).toContain('module.database.table_arn');
    }
    expect(
      readFileSync('terraform/modules/content-backup/main.tf', 'utf8')
    ).toMatch(/lifecycle\s*\{\s*prevent_destroy\s*=\s*true/);
  });
  test('saved plan gate precedes apply and both CI plans invoke it', () => {
    const source = readFileSync(
      'scripts/deploy_passkey_infrastructure.sh',
      'utf8'
    );
    expect(source.indexOf('scripts/ci/check_backup_plan.py')).toBeLessThan(
      source.indexOf('apply "$LOCK_TIMEOUT" -auto-approve "$PLAN_DIR/plan"')
    );
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(
      ci.match(
        /python3 \.\.\/\.\.\/\.\.\/scripts\/ci\/check_backup_plan.py < tfplan.json/g
      )?.length
    ).toBe(2);
    expect(
      ci.match(/name: Upload Plan Artifact\n {8}if: always\(\)/g)?.length
    ).toBe(2);
  });
});
