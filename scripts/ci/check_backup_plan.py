"""Reject deletion/replacement of the backup bucket and its protection resources."""
import json
import sys

PROTECTED = {
    'aws_s3_bucket',
    'aws_s3_bucket_policy',
    'aws_s3_bucket_public_access_block',
    'aws_s3_bucket_versioning',
    'aws_s3_bucket_object_lock_configuration',
    'aws_s3_bucket_server_side_encryption_configuration',
    'aws_s3_bucket_lifecycle_configuration',
}


def check(plan):
    if not isinstance(plan, dict) or not str(plan.get('format_version', '')).startswith('1.') or plan.get('errored'):
        raise ValueError('Invalid or errored Terraform plan')
    changes = plan.get('resource_changes')
    if not isinstance(changes, list):
        raise ValueError('Missing resource_changes; cannot verify backup safety')
    for resource in changes:
        if not isinstance(resource, dict) or not isinstance(resource.get('address'), str):
            raise ValueError('Malformed resource change')
        if 'module.content_backup.' not in resource['address'] or resource.get('type') not in PROTECTED:
            continue
        change = resource['change']
        actions = change['actions']
        if not isinstance(actions, list) or not actions or any(a not in ('no-op', 'create', 'read', 'update', 'delete', 'forget') for a in actions):
            raise ValueError('Invalid backup action')
        if any(a in actions for a in ('delete', 'forget')):
            raise ValueError(f"Backup deletion/replacement/state removal forbidden: {resource['address']}")
        if resource['type'] == 'aws_s3_bucket' and change.get('after_unknown', {}).get('bucket'):
            raise ValueError('Backup bucket name must be known at plan time')
    return True


if __name__ == '__main__':
    try:
        check(json.load(sys.stdin))
        print('Backup plan safety check passed: no protected resource deletion/replacement.')
    except (ValueError, KeyError, TypeError) as error:
        print(f'Backup plan rejected: {error}', file=sys.stderr)
        sys.exit(1)
