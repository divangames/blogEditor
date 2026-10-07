"""Save durability/replay and real two-process CAS regression checks."""
import json
import multiprocessing
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import article_storage as storage


def competing_save(file, revision, barrier, results, text):
    barrier.wait()
    try:
        payload={'expectedRevision':revision,'requestId':text,'id':'article'}
        storage.save_document(Path(file),payload,{'id':'article','body':text},lambda r:r['body'])
        results.put('saved')
    except storage.SaveConflict:
        results.put('conflict')


class SaveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.file=Path(self.temp.name)/'article.json'

    def save(self, revision=None, request='first', body='original'):
        return storage.save_document(self.file,{'id':'article','expectedRevision':revision,'requestId':request,'body':body},
                                     {'id':'article','body':body},lambda r:r['body'])

    def test_legacy_requires_version_and_keeps_identity(self):
        self.file.write_text(json.dumps({'id':'article','body':'legacy'}))
        original=storage.read_document(self.file)
        with self.assertRaises(storage.SaveConflict):self.save()
        saved=self.save(original['revision'])
        self.assertEqual(saved['documentId'],original['documentId'])
        with self.assertRaises(storage.SaveConflict):self.save(original['revision'],'second')

    def test_replay_after_newer_save_and_changed_request_rejected(self):
        first=self.save()
        second=self.save(first['revision'],'second','new')
        self.assertEqual(self.save(),first)
        self.assertEqual(storage.read_document(self.file)['revision'],second['revision'])
        with self.assertRaises(ValueError):self.save(body='different')

    def test_interrupted_html_write_recovers_committed_json(self):
        atomic=storage.atomic_write
        def fail_html(file,data):
            if file.suffix=='.html':raise OSError('simulated interruption')
            return atomic(file,data)
        with patch.object(storage,'atomic_write',side_effect=fail_html):
            with self.assertRaises(OSError):self.save()
        committed=storage.read_document(self.file)
        recovered=self.save()
        self.assertEqual(recovered['revision'],committed['revision'])
        self.assertEqual(self.file.with_suffix('.html').read_text(),'original')

    def test_unchanged_save_does_not_advance_revision(self):
        first=self.save()
        again=self.save(first['revision'],'unchanged')
        self.assertEqual(first,again)

    def test_failed_atomic_replace_preserves_original(self):
        first=self.save()
        with patch.object(storage.os,'replace',side_effect=OSError('disk error')):
            with self.assertRaises(OSError):self.save(first['revision'],'second','new')
        self.assertEqual(storage.read_document(self.file)['body'],'original')

    def test_two_processes_only_one_writer_wins(self):
        first=self.save()
        context=multiprocessing.get_context('spawn')
        barrier=context.Barrier(2);results=context.Queue()
        processes=[context.Process(target=competing_save,args=(str(self.file),first['revision'],barrier,results,text)) for text in ('one','two')]
        for process in processes:process.start()
        for process in processes:
            process.join(20)
            if process.is_alive():process.terminate();process.join();self.fail('CAS worker timed out')
            self.assertEqual(process.exitcode,0)
        self.assertEqual(sorted(results.get(timeout=3) for _ in processes),['conflict','saved'])
        results.close();results.join_thread()


if __name__=='__main__':unittest.main()
