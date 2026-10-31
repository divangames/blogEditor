"""Commerce input boundaries without starting a server or reading live accounts."""
import copy
import unittest
from site_builder import validate_commerce


class CommerceValidation(unittest.TestCase):
    def test_old_projects_and_drafts(self):
        for c in ({}, {'commerce': {}}, {'commerce': {'shipping': {'enabled': True, 'country': '', 'rate': ''}}}):
            validate_commerce(c)

    def test_real_values_and_zero(self):
        c = {'commerce': {'descriptions': {'43816': 'Кожа <b>не HTML</b>'}, 'shipping': {'enabled': True, 'country': 'RU', 'rate': '0', 'handlingMin': '0', 'handlingMax': '1', 'transitMin': '2', 'transitMax': '5'}, 'returns': {'enabled': True, 'country': 'RU', 'category': 'MerchantReturnFiniteReturnWindow', 'days': '14', 'method': 'ReturnByMail', 'fees': 'ReturnShippingFees', 'amount': '250.50'}}}
        before = copy.deepcopy(c)
        validate_commerce(c)
        self.assertEqual(c, before)

    def test_reject_invalid_types_and_values(self):
        invalid = [None, [], {'descriptions': None}, {'descriptions': {'__proto__': 'bad'}}, {'descriptions': {'x': 'x' * 5001}}, {'shipping': None}, {'shipping': {'enabled': 'true'}}, {'shipping': {'country': 'ZZ'}}, {'shipping': {'rate': '-1'}}, {'shipping': {'rate': 'NaN'}}, {'shipping': {'rate': '1.001'}}, {'shipping': {'rate': 0}}, {'shipping': {'handlingMin': '2', 'handlingMax': '1'}}, {'shipping': {'transitMax': '1.5'}}, {'returns': {'category': 'constructor'}}, {'returns': {'method': 'Other'}}, {'returns': {'fees': 'Bad'}}, {'returns': {'amount': '10000001'}}, {'returns': {'days': '3651'}}, {'other': {}}]
        for c in invalid:
            with self.subTest(value=c), self.assertRaises(ValueError):
                validate_commerce({'commerce': c})


if __name__ == '__main__':
    unittest.main()
