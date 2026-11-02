"""Offline contracts; AWS fixture execution is separately opt-in."""
import unittest
from publication_query_fixture import timing_query, fixture_query, verify_results


class PublicationQueryTest(unittest.TestCase):
    def test_stats_fields_are_not_redeclared(self):
        after = timing_query().split('| stats ', 1)[1]
        lines = [line.strip() for line in after.splitlines() if line.strip().startswith('| fields ')]
        self.assertEqual(lines, ['| fields (confirmedAtMs - requestedAtMs) / 1000 as saveToPublicSeconds'])
        self.assertIn('| display buildId, contentRevision, releaseRevision, lastEvent, requestedAtMs, confirmedAtMs, saveToPublicSeconds', after)

    def test_fixture_preserves_production_query_tail(self):
        self.assertTrue(fixture_query().startswith("fields jsonParse('"))
        self.assertEqual(fixture_query().split('| filter o.event', 1)[1], timing_query().split('| filter o.event', 1)[1])

    def test_verifier_rejects_empty_incomplete_or_wrong_results(self):
        for status in ('Complete', 'Failed'):
            with self.assertRaises(ValueError):
                verify_results({'status': status, 'results': []})
        rows = [[{'field': 'buildId', 'value': build}, {'field': 'contentRevision', 'value': revision}] +
                ([] if seconds is None else [{'field': 'saveToPublicSeconds', 'value': str(seconds)}])
                for build, revision, seconds in [('fixture-a', '7', 5), ('fixture-b', '7', None), ('fixture-c', '7', None), ('fixture-a', '8', 2.5)]]
        verify_results({'status': 'Complete', 'results': rows})
        rows[0][-1]['value'] = '8'
        with self.assertRaises(ValueError):
            verify_results({'status': 'Complete', 'results': rows})


if __name__ == '__main__':
    unittest.main()
