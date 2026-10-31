"""Fail closed on dependency scan errors and actionable findings; retain evidence."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def summary(text):
    print(text)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write(text + '\n')


def bun_findings(data, status):
    if status not in (0, 1) or not isinstance(data, dict):
        raise ValueError('Bun audit failed or returned a non-object report')
    entries = []
    for package, items in data.items():
        if not isinstance(items, list):
            raise ValueError('Invalid Bun advisory list')
        for item in items:
            if not isinstance(item, dict) or item.get('severity') not in ('low', 'moderate', 'high', 'critical') or not isinstance(item.get('url'), str) or not item['url'].startswith('https://github.com/advisories/'):
                raise ValueError('Invalid Bun advisory')
            entries.append((item['url'], item['severity']))
    if (status == 0) != (len(entries) == 0):
        raise ValueError('Bun audit exit/report mismatch')
    return entries


def audit_bun():
    entries, errors = [], []
    for directory in ('.', 'frontend/admin', 'frontend/public-astro', 'scripts/deploy'):
        name = directory.replace('/', '-') if directory != '.' else 'root'
        try:
            if not (Path(directory) / 'bun.lock').is_file():
                raise ValueError('Missing lockfile')
            result = subprocess.run(['bun', 'audit', '--json'], cwd=directory, capture_output=True, text=True)
            # Preserve even malformed/error output before parsing; scan all lockfiles.
            Path(f'bun-audit-{name}.json').write_text(result.stdout)
            Path(f'bun-audit-{name}.stderr.txt').write_text(result.stderr)
            found = bun_findings(json.loads(result.stdout), result.returncode)
            entries.extend(found)
            summary(f'{directory}: {len(found)} advisory records; {len(set(x[0] for x in found))} distinct advisories')
        except (OSError, ValueError) as error:
            errors.append(f'{directory}: {error}')
    unique = set(x[0] for x in entries)
    high = set(x[0] for x in entries if x[1] in ('high', 'critical'))
    summary(f'Bun: {len(entries)} records, {len(unique)} distinct advisories, {len(high)} distinct High/Critical. Moderate/Low remain visible in artifacts.')
    for error in errors:
        summary('Scanner error: ' + error)
    return int(bool(errors or high))


def trivy_findings(data):
    if not isinstance(data, dict) or data.get('version') != '2.1.0' or not isinstance(data.get('runs'), list) or not data['runs']:
        raise ValueError('Missing or invalid SARIF runs')
    records, high = [], set()
    for run in data['runs']:
        driver = run['tool']['driver']
        if driver['name'] != 'Trivy' or not isinstance(run.get('results'), list):
            raise ValueError('Invalid Trivy results')
        rules = {r['id']: r for r in driver['rules']}
        for item in run['results']:
            rule = rules[item['ruleId']]
            props = rule.get('properties', {})
            severities = set(props.get('tags', [])) & {'UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'}
            if len(severities) != 1:
                raise ValueError('Missing or ambiguous Trivy severity')
            records.append(item['ruleId'])
            if severities & {'HIGH', 'CRITICAL'}:
                high.add(item['ruleId'])
    summary(f'Trivy: {len(records)} result locations, {len(set(records))} distinct rules, {len(high)} High/Critical rules. All severities retained in SARIF.')
    return bool(high)


def audit_go():
    result = subprocess.run(['govulncheck', '-show', 'verbose', './...'], cwd='go-functions', capture_output=True, text=True)
    text = result.stdout + result.stderr
    Path('govulncheck.txt').write_text(text)
    print(text)
    # Require the completion footer, not merely an exit-zero command.
    match = re.search(r'Your code is affected by (\d+) vulnerabilit', text)
    clean = 'No vulnerabilities found.' in text and not match
    if result.returncode not in (0, 3) or (not match and not clean):
        raise ValueError(f'govulncheck failed or incomplete: exit {result.returncode}')
    reachable = int(match[1]) if match else 0
    if (result.returncode == 3) != (reachable > 0):
        raise ValueError('govulncheck exit/report mismatch')
    packages = re.search(r'(\d+) vulnerabilities in packages you import', text)
    summary(f'Go: {reachable} reachable vulnerabilities; {packages[1] if packages else 0} package-only findings. Details in govulncheck.txt.')
    return int(reachable > 0)


def main():
    try:
        if sys.argv[1] == 'bun':
            return audit_bun()
        if sys.argv[1] == 'go':
            return audit_go()
        if sys.argv[1] == 'trivy':
            return int(trivy_findings(json.loads(Path(sys.argv[2]).read_text())))
        raise ValueError('Unknown scanner')
    except (OSError, ValueError, KeyError, TypeError) as error:
        summary('Security gate error: ' + str(error))
        return 1


if __name__ == '__main__':
    sys.exit(main())
