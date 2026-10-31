import json
import io
import unittest
from unittest.mock import patch
import site_catalog as catalog


class FinderBrandsTests(unittest.TestCase):
    def test_full_stock_shoes_only_and_decoded_names(self):
        goods = {
            'a': {'brand': ' Nike ', 'available': True, 'url': 'https://хасл.рф/krossovki/a'},
            'b': {'brand': 'Nike', 'available': True, 'url': 'https://хасл.рф/krossovki/b'},
            'c': {'brand': 'Coat', 'available': True, 'url': 'https://хасл.рф/odezhda/c'},
            'd': {'brand': 'Puma', 'available': False, 'url': 'https://хасл.рф/krossovki/d'},
            'e': {'brand': 'Unknown', 'url': 'https://хасл.рф/krossovki/e'},
            'f': {'brand': 'Dolce &amp; Gabbana', 'available': True, 'url': 'https://хасл.рф/krossovki/f'},
        }
        with patch.object(catalog, 'PRODUCTS', goods), patch.object(catalog, 'FINDER_MANUFACTURERS', {'nike': '1', 'dolce & gabbana': '46'}):
            self.assertEqual(catalog.finder_brands_snapshot(), [{'id': '1', 'name': 'Nike'}, {'id': '46', 'name': 'Dolce & Gabbana'}])

    def test_verified_ids_batches_and_no_global_mutation_on_error(self):
        goods = {str(i): {'brand': 'Brand ' + str(i), 'available': True, 'url': 'https://хасл.рф/krossovki/' + str(i)} for i in range(23)}
        calls = []
        def response(request, **kwargs):
            codes = json.loads(request.data)['variables']['input']['id']
            calls.append(codes)
            return io.BytesIO(json.dumps({'data': {'Product': [{'id': c, 'manufacturer': {'id': str(100 + int(c))}} for c in codes]}}).encode())
        with patch.object(catalog, 'FINDER_MANUFACTURERS', {}), patch.object(catalog, 'urlopen', side_effect=response):
            registry = catalog.resolve_finder_manufacturers(goods)
            self.assertEqual([len(c) for c in calls], [10, 10, 3])
            self.assertEqual(len(registry), 23)
            self.assertEqual(catalog.FINDER_MANUFACTURERS, {})
        with patch.object(catalog, 'FINDER_MANUFACTURERS', {'old': '7'}), patch.object(catalog, 'urlopen', return_value=io.BytesIO(b'{"data":{"Product":[]}}')):
            with self.assertRaises(ValueError):
                catalog.resolve_finder_manufacturers(goods)
            self.assertEqual(catalog.FINDER_MANUFACTURERS, {'old': '7'})


if __name__ == '__main__':
    unittest.main()
