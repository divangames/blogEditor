"""Shared revisions, private assets, stale articles and standalone exports."""
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from concurrent.futures import ThreadPoolExecutor
import threading

import app as core
import shared_blocks as blocks


class SharedBlockTests(unittest.TestCase):
    def setUp(self):
        (core.ROOT / 'tmp').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=core.ROOT / 'tmp')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.token = core.ARTICLE_STORAGE.set(self.folder)
        self.addCleanup(core.ARTICLE_STORAGE.reset, self.token)

    def save(self, text='Первый', **kwargs):
        return blocks.save_block(self.folder, 'outmax', dict(name='Совет', html=f'<aside class="om-callout"><p>{text}</p></aside>', exportHtml=f'<aside style="padding:20px;color:#123456"><p>{text}</p></aside>', **kwargs))

    def linked(self, record, extra=''):
        return f'<aside id="original-anchor" data-shared-id="{record["id"]}" data-shared-revision="{record["revision"]}" {extra}><p>Старая статья</p></aside>'

    def test_latest_without_rewriting_snapshot_and_conflict(self):
        first = self.save()
        source = self.linked(first)
        second = self.save('Новый текст', id=first['id'], expectedRevision=first['revision'])
        current = blocks.resolve_body(source, self.folder, 'outmax')
        self.assertIn('Новый текст', current)
        self.assertIn('original-anchor', current)
        self.assertIn(second['revision'], current)
        self.assertIn('Старая статья', source)
        with self.assertRaises(blocks.BlockConflict):
            self.save('Потерянная правка', id=first['id'], expectedRevision=first['revision'])

    def test_dirty_missing_and_brand_isolation(self):
        first = self.save()
        dirty = self.linked(first, 'data-shared-dirty="true"')
        self.assertIn('Старая статья', blocks.resolve_body(dirty, self.folder, 'outmax'))
        with self.assertRaises(ValueError):
            blocks.resolve_body(dirty, self.folder, 'outmax', exporting=True)
        with self.assertRaises(ValueError):
            blocks.resolve_body(self.linked(first), self.folder, 'hasl', exporting=True)
        self.assertEqual(blocks.list_blocks(self.folder, 'hasl'), [])

    def test_frozen_local_image_survives_original_removal_and_zip(self):
        folder = self.folder / 'source_files'; folder.mkdir()
        original = folder / 'photo.png'; original.write_bytes(b'local-image-fixture')
        raw = '<figure><img src="source_files/photo.png" alt="Фото"><figcaption>Подпись</figcaption></figure>'
        record = blocks.save_block(self.folder, 'outmax', dict(name='Фото', html=raw, exportHtml=raw))
        original.unlink()
        self.assertIn('_shared_assets/', record['html'])
        article = dict(title='Статья', body=self.linked(record), products=[])
        for local in (False, True):
            archive = zipfile.ZipFile(io.BytesIO(core.export_archive('other', article, self.folder / 'other_files', ['ru'], local)))
            html = archive.read('other-outmaxshop-ru.html').decode()
            exported = json.loads(archive.read('other.json'))
            self.assertNotIn('data-shared-', html)
            self.assertNotIn('data-shared-', exported['body'])
            self.assertNotIn('/articles/', html)
            self.assertTrue(any(name.startswith('other_files/') for name in archive.namelist()))
            if local:
                self.assertIn('/image/other/', html)
                self.assertTrue(any(name.startswith('image/other/') for name in archive.namelist()))

    def test_sanitizing_and_traversal(self):
        first = blocks.save_block(self.folder, 'outmax', dict(name='Блок', html='<aside onclick="alert(1)"><script>alert(1)</script><p>Текст</p></aside>', exportHtml='<aside><p>Текст</p></aside>'))
        self.assertNotIn('script', first['html']); self.assertNotIn('onclick', first['html'])
        for source in ('../outside.png', '/articles/../outside.png', 'blob:test'):
            with self.assertRaises(ValueError):
                blocks.save_block(self.folder, 'outmax', dict(name='Фото', html=f'<figure><img src="{source}"></figure>', exportHtml=f'<figure><img src="{source}"></figure>'))

    def test_export_latest_inline_style_and_independent_copy(self):
        first = self.save()
        html = core.export_body(self.linked(first), 'ru')
        self.assertIn('color:#123456', html)
        self.assertNotIn('data-shared', html)
        blocks.save_block(self.folder, 'outmax', dict(name='Новое', id=first['id'], expectedRevision=first['revision'], html='<aside>Вторая версия</aside>', exportHtml='<aside style="background:#abc">Вторая версия</aside>'))
        self.assertIn('Вторая версия', core.export_body(self.linked(first), 'ru'))
        self.assertIn('Первый', html)

    def test_unique_internal_anchors_and_frozen_backgrounds(self):
        raw = '<aside id="card"><h3 id="title">Совет</h3><a href="#title">Перейти</a></aside>'
        record = blocks.save_block(self.folder, 'outmax', dict(name='Якоря', html=raw, exportHtml=raw))
        source = self.linked(record, 'data-shared-instance="11111111"') + self.linked(record, 'data-shared-instance="22222222"')
        exported = blocks.resolve_body(source, self.folder, 'outmax', exporting=True)
        self.assertIn('href="#title--shared-11111111"', exported)
        self.assertIn('href="#title--shared-22222222"', exported)
        raw = '<aside style="background-image:url(data:image/png;base64,aW1hZ2U=)"><p>Фото</p></aside>'
        record = blocks.save_block(self.folder, 'outmax', dict(name='Фон', html=raw, exportHtml=raw))
        self.assertIn('_shared_assets/', record['html'])
        archive = zipfile.ZipFile(io.BytesIO(core.export_archive('bg', dict(title='Фон', body=self.linked(record)), self.folder / 'bg_files', ['ru'], True)))
        html = archive.read('bg-outmaxshop-ru.html').decode()
        self.assertNotIn('_shared_assets', html)
        self.assertIn('/image/bg/', html)

    def test_two_writers_only_one_can_publish(self):
        first = self.save()
        barrier = threading.Barrier(2)
        def publish(text):
            barrier.wait()
            try:
                return self.save(text, id=first['id'], expectedRevision=first['revision'])['revision']
            except blocks.BlockConflict:
                return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(publish, ('Окно А', 'Окно Б')))
        self.assertEqual(results.count('conflict'), 1)


if __name__ == '__main__':
    unittest.main()
