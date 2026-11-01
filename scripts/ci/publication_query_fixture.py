"""Bounded read-only Insights fixture check; never writes AWS logs.

Default prints a query. Explicit --verify --log-group NAME runs it using
existing events in the last five minutes. Synthetic events exist only inside the
query. Empty source windows fail; this does not emulate the Insights engine.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]


def timing_query():
    source = (ROOT / 'terraform/modules/monitoring/observability.tf').read_text()
    return re.search(r'publication_timing_query\s*=\s*<<-QUERY\n(.*?)\n\s*QUERY', source, re.S).group(1)


def fixture_query():
    # Production filter, aggregation, calculation and display stay unchanged.
    tail = timing_query().split('| filter o.event', 1)[1]
    events = json.loads((ROOT / 'tests/fixtures/publication-timing.json').read_text())['events']
    literal = json.dumps(events, separators=(',', ':'))
    if "'" in literal or '\\' in literal:
        raise ValueError('Unsupported fixture escapes')
    return "fields jsonParse('" + literal + "') as fixtureEvents\n| unnest fixtureEvents into o\n| filter o.event" + tail


def verify_results(response):
    if response.get('status') != 'Complete':
        raise ValueError('Query did not complete')
    expected = json.loads((ROOT / 'tests/fixtures/publication-timing.json').read_text())['expectedSeconds']
    actual = {}
    for row in response['results']:
        fields = {item['field']: item['value'] for item in row}
        key = fields['buildId'] + '/' + fields['contentRevision']
        if key in actual:
            raise ValueError('Duplicate group: ' + key)
        value = fields.get('saveToPublicSeconds')
        actual[key] = None if value in (None, '', 'null') else float(value)
    if actual != expected:
        raise ValueError(f'Fixture mismatch: {actual!r}, expected {expected!r}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--log-group')
    parser.add_argument('--region', default='ap-northeast-1')
    args = parser.parse_args()
    query = fixture_query()
    if not args.verify:
        print(query)
        return
    if not args.log_group:
        parser.error('--verify requires one explicit --log-group')
    def aws(*parts):
        return json.loads(subprocess.check_output(['aws', '--region', args.region, 'logs', *parts]))
    end = int(time.time())
    started = aws('start-query', '--log-group-name', args.log_group,
                  '--start-time', str(end - 300), '--end-time', str(end), '--query-string', query)
    result = None
    for _ in range(15):
        result = aws('get-query-results', '--query-id', started['queryId'])
        if result['status'] not in ('Scheduled', 'Running'):
            break
        time.sleep(2)
    if result['status'] in ('Scheduled', 'Running'):
        aws('stop-query', '--query-id', started['queryId'])
        raise ValueError('Fixture exceeded bounded wait')
    print(json.dumps({'status': result['status'], 'fixtureGroups': len(result['results']),
                      'statistics': result.get('statistics')}))
    verify_results(result)


if __name__ == '__main__':
    main()
