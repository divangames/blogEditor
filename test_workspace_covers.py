"""Archive thumbnails reuse material URLs and never fetch remote content."""
import unittest
import workspace

class WorkspaceCovers(unittest.TestCase):
    def test_cover_priority_and_local_path(self):
        self.assertEqual(workspace.document_cover('<img src="https://example.com/photo.jpg"><meta name="article-cover" content="https://example.com/cover.webp">'),'https://example.com/cover.webp')
        self.assertEqual(workspace.document_cover('<img src="story_files/photo.png">'),'/articles/story_files/photo.png')
        self.assertEqual(workspace.document_cover('<img width="1" src="https://example.com/pixel"><img src="/images/real.jpg">'),'/images/real.jpg')
    def test_safe_sources_and_missing_images(self):
        for source in ['javascript:alert(1)','data:image/svg+xml,x','blob:123','../private.json','https://[bad']:
            self.assertEqual(workspace.safe_cover_url(source),'')
        self.assertEqual(workspace.document_cover('<p>Без обложки</p>'),'')
    def test_email_and_site_original_assets(self):
        self.assertEqual(workspace.document_cover('<img data-email-src="images/cover.png" src="blob:old">',{'images/cover.png':'immutable.png'},'my-email'),'/editor-api/email-projects/my-email/asset/immutable.png')
        self.assertEqual(workspace.site_cover({'heroBackgrounds':{'desktop':'https://example.com/banner.jpg'},'images':{}}),'https://example.com/banner.jpg')

if __name__=='__main__':unittest.main()
