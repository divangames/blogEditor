import unittest

from build_instructions import changelog_items


class ChangelogTextTests(unittest.TestCase):
    def test_historical_paragraphs_are_not_lost(self):
        self.assertEqual(changelog_items([
            '', 'Вопросы раскрываются на холсте.', 'Ссылка доступна через Ctrl+K.', '',
            '![Ответ](instructions/screens/demo.png)', '', '- Сохранён прежний пункт.',
        ]), ['Вопросы раскрываются на холсте. Ссылка доступна через Ctrl+K.',
             'Сохранён прежний пункт.'])

    def test_added_changed_fixed_are_visible_searchable_text(self):
        self.assertEqual(changelog_items([
            '### Добавлено', '- **Прелоадер** конструктора.', '',
            '### Изменено', '- Список моделей.', '',
            '### Исправлено', 'Настройки больше не сбрасываются.', '',
            '```js', 'ignored()', '```',
        ]), ['Добавлено: Прелоадер конструктора.', 'Изменено: Список моделей.',
             'Исправлено: Настройки больше не сбрасываются.'])


if __name__ == '__main__':
    unittest.main()
