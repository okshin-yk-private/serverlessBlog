"""Publish only fixed labels and action counts, never Terraform plan values."""

import json
import sys
from collections import Counter


ALLOWED_ACTIONS = {
    ('no-op',), ('create',), ('read',), ('update',), ('delete',), ('forget',),
    ('delete', 'create'), ('create', 'delete'), ('create', 'forget'),
}


def summarize(plan):
    if (not isinstance(plan, dict)
            or not isinstance(plan.get('format_version'), str)
            or not plan['format_version'].startswith('1.')
            or plan.get('errored')):
        raise ValueError('Invalid plan')
    changes = plan.get('resource_changes')
    if not isinstance(changes, list):
        raise ValueError('Missing resource changes')
    counts = Counter()
    for resource in changes:
        change = resource.get('change') if isinstance(resource, dict) else None
        actions = change.get('actions') if isinstance(change, dict) else None
        if (not isinstance(actions, list)
                or not all(isinstance(action, str) for action in actions)
                or tuple(actions) not in ALLOWED_ACTIONS):
            raise ValueError('Invalid actions')
        counts.update(actions)

    # Do not render any input string: addresses, output names, diagnostics and
    # arbitrary fields can all contain secrets or Markdown/script injections.
    lines = ['| Resource action | Count |', '| --- | ---: |']
    for action in ('create', 'update', 'delete', 'read', 'forget', 'no-op'):
        lines.append(f'| {action} | {counts[action]} |')
    lines.extend([
        '',
        'Replacement operations contribute to both action counts.',
        'Counts are not a full plan review: values, addresses, outputs, drift and diagnostics are intentionally omitted.',
        'Raw plan files are not published. Use an authorized restricted review for detailed infrastructure changes.',
    ])
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    try:
        result = summarize(json.load(sys.stdin))
    except (ValueError, TypeError, KeyError):
        # Never echo the JSON parse error or the rejected input.
        print('Cannot publish summary: invalid Terraform plan.', file=sys.stderr)
        sys.exit(1)
    print(result, end='')
