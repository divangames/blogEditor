"""Review/rating validation is pure and never contacts a provider or live account."""
import copy
import unittest
from site_builder import validate_commerce, validate_product_feedback


class ProductFeedbackValidation(unittest.TestCase):
    def test_drafts_and_real_values_without_mutation(self):
        for f in ({}, {'sku': {}}, {'sku': {'aggregate': {'enabled': True, 'value': '', 'ratingCount': '0'}}}, {'sku': {'reviews': [{'id': 'draft', 'enabled': True, 'author': '', 'body': '', 'rating': '', 'date': ''}]}}):
            validate_product_feedback(f)
        f = {'sku': {'aggregate': {'enabled': True, 'value': '4.5', 'ratingCount': '2', 'reviewCount': '2'}, 'reviews': [{'id': 'real-review', 'enabled': True, 'author': 'Покупатель', 'body': '<b>Буквальный текст</b>', 'rating': '5', 'date': '2024-02-29'}]}}
        before = copy.deepcopy(f)
        validate_commerce({'commerce': {'feedback': f}})
        self.assertEqual(f, before)

    def test_invalid_aggregate(self):
        for a in (None, [], {'value': '0'}, {'value': '5.1'}, {'value': 'NaN'}, {'value': 5}, {'value': '4,5'}, {'ratingCount': '-1'}, {'ratingCount': '1.5'}, {'ratingCount': '10000001'}, {'enabled': 'true'}, {'invented': '5'}):
            with self.subTest(value=a), self.assertRaises(ValueError):
                validate_product_feedback({'sku': {'aggregate': a}})

    def test_invalid_review(self):
        base = {'id': 'review', 'enabled': True, 'author': 'Покупатель', 'body': 'Реальный текст', 'rating': '4', 'date': ''}
        for patch in ({'id': '__proto__'}, {'enabled': 'true'}, {'author': 'A' * 100}, {'author': '😀' * 50}, {'body': 'x' * 5001}, {'rating': '0'}, {'rating': '6'}, {'rating': True}, {'date': '2026-02-29'}, {'date': '2024-02-30'}, {'date': '0000-01-01'}, {'date': '2026-1-1'}, {'url': 'javascript:bad'}):
            with self.subTest(value=patch), self.assertRaises(ValueError):
                validate_product_feedback({'sku': {'reviews': [{**base, **patch}]}})
        for rows in ([base, base], [{**base, 'id': 'r' + str(i)} for i in range(21)]):
            with self.assertRaises(ValueError):
                validate_product_feedback({'sku': {'reviews': rows}})
        for feedback in (None, [], {'__proto__': {}}, {'sku': None}, {'sku': {'reviews': None}}):
            with self.assertRaises(ValueError):
                validate_product_feedback(feedback)


if __name__ == '__main__':
    unittest.main()
