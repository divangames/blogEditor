"""Local deployment size bounds; never opens an SSH connection."""
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from deploy_vps import MAX_DEPLOY_ARCHIVE_BYTES,upload_archive
class ReachedTransport(Exception):pass
class DeploymentLimitTest(unittest.TestCase):
 def test_size_boundaries(self):
  self.assertEqual(MAX_DEPLOY_ARCHIVE_BYTES,50*1024*1024)
  with tempfile.TemporaryDirectory() as folder:
   archive=Path(folder)/'probe.zip'
   for size,accepted in [(999,False),(1000,True),(5*1024*1024+1,True),(50*1024*1024,True),(50*1024*1024+1,False)]:
    with self.subTest(size=size):
     with archive.open('wb') as f:f.truncate(size)
     with patch('paramiko.SSHClient',side_effect=ReachedTransport):
      with self.assertRaises(ReachedTransport if accepted else ValueError):upload_archive(archive)
if __name__=='__main__':unittest.main()
