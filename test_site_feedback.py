"""Public-source contract tests use synthetic responses, never real customer fixtures."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import site_feedback as feedback
from site_builder import validate_product_feedback

PATH = '/krossovki/demo-123'


def response(total=2, average=4.5):
    rows = [{'id': str(i + 1), 'name': 'Demo buyer ' + str(i + 1), 'text': '<p>Demo review</p>', 'rating': 5 - i, 'createdAt': '2026-10-24 12:00:00', 'product': {'url': feedback.ORIGIN + PATH}} for i in range(min(total, 2))]
    return {'data': {'TestimonialList': {'rating': average, 'data': rows, 'paginatorInfo': {'count': len(rows), 'currentPage': 1, 'total': total, 'perPage': 20, 'lastPage': max(1, (total + 19) // 20)}}}}


def page(sku='123'):
    return ('<script id="__NEXT_DATA__">' + json.dumps({'props': {'pageProps': {'product': {'id': 123, 'sku': sku, 'href': PATH}, '_nextI18Next': {'initialI18nStore': {'ru': {'product': {'empty-testimonials': 'Скидка за отзыв'}}}}}}}) + '</script>').encode()


class FeedbackTests(unittest.TestCase):
    def parse(self, data):
        return feedback.parse_response(data, '123', PATH, '123', True, '2026-10-25T00:00:00+00:00')

    def test_honest_product_data_and_counts(self):
        data = self.parse(response(40))
        self.assertEqual(data['aggregate'], {'enabled': True, 'value': '4.5', 'ratingCount': '', 'reviewCount': '40'})
        self.assertEqual(len(data['reviews']), 2)
        self.assertEqual(data['source']['total'], 40)
        self.assertTrue(data['source']['incentive'])
        self.assertEqual(data['reviews'][0]['body'], 'Demo review')
        validate_product_feedback({'123': {k: data[k] for k in ('aggregate', 'reviews', 'source')}})

    def test_empty_is_not_a_fake_five(self):
        data = self.parse(response(0, None))
        self.assertEqual(data['aggregate'], {})
        self.assertEqual(data['reviews'], [])
        self.assertEqual(data['source']['total'], 0)

    def test_missing_values_are_not_invented(self):
        raw = response()
        raw['data']['TestimonialList']['rating'] = None
        raw['data']['TestimonialList']['data'][0]['name'] = ''
        raw['data']['TestimonialList']['data'][1]['createdAt'] = '2026-02-30 00:00:00'
        parsed = self.parse(raw)
        self.assertEqual(parsed['aggregate'], {})
        self.assertEqual(len(parsed['reviews']), 1)
        self.assertEqual(parsed['reviews'][0]['date'], '')
        self.assertEqual(parsed['source']['skipped'], 1)

    def test_wrong_product_global_data_and_malformed_pagination(self):
        for mutate in [lambda d: d['data'][0]['product'].update(url=feedback.ORIGIN + '/other'), lambda d: d.update(data=None), lambda d: d['paginatorInfo'].update(total=0), lambda d: d['paginatorInfo'].update(currentPage=2), lambda d: d['paginatorInfo'].update(count=0), lambda d: d['data'][1].update(id='1')]:
            raw = response();mutate(raw['data']['TestimonialList'])
            with self.assertRaises((ValueError, TypeError)):
                self.parse(raw)
        with self.assertRaises(ValueError):
            self.parse({'errors': [{'message': 'private error must not be echoed'}]})

    def test_identity_and_safe_addresses(self):
        self.assertEqual(feedback.identity(page(), '123', PATH), ('123', True))
        with self.assertRaises(ValueError):
            feedback.identity(page('124'), '123', PATH)
        for u in ('http://haslestore.com/x', 'https://evil.test/x', 'https://u:p@haslestore.com/x', 'https://haslestore.com:444/x', 'https://haslestore.com//evil', 'https://haslestore.com/../graphql', 'https://127.0.0.1/x'):
            with self.assertRaises(ValueError):
                feedback.product_path(u)

    def test_cache_explicit_refresh_and_failure_preserves_snapshot(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(feedback, 'download', side_effect=[page(), json.dumps(response()).encode()]) as fetch:
            product = {'code': '123', 'url': feedback.ORIGIN + PATH}
            first = feedback.load('123', product, folder)
            self.assertEqual(feedback.load('123', product, folder), first)
            self.assertEqual(fetch.call_count, 2)
            with patch.object(feedback, 'download', side_effect=TimeoutError), self.assertRaises(TimeoutError):
                feedback.load('123', product, folder, force=True)
            self.assertEqual(feedback.load('123', product, folder), first)
            self.assertEqual(list(Path(folder).glob('*.lock')), [])


if __name__ == '__main__':
    unittest.main()
