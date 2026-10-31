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
    def test_email_rendered_banner_without_canvas(self):
        record={'renderedHtml':'<img class="outmax-email-header-logo" src="https://example.com/logo.png"><img src="https://example.com/promo.jpg"><img alt="Баннер рассылки" src="https://example.com/banner.jpg">'}
        self.assertEqual(workspace.email_cover(record),'https://example.com/banner.jpg')
        record['canvasHtml']='<img src="https://example.com/content.jpg">'
        self.assertEqual(workspace.email_cover(record),'https://example.com/content.jpg')
        self.assertEqual(workspace.email_cover({'renderedHtml':'<img class="hasl-email-logo" src="https://example.com/logo.gif">'}),'')
    def test_site_default_and_block_precedence(self):
        defaults={'desktop':'https://example.com/default.jpg'}
        state={'layout':[{'source':'s0'}]}
        self.assertEqual(workspace.site_cover(state,defaults),defaults['desktop'])
        state['heroBackgrounds']={'desktop':'https://example.com/page.jpg'}
        state['layout'][0]['heroBackgrounds']={'desktop':'https://example.com/block.jpg'}
        self.assertEqual(workspace.site_cover(state,defaults),'https://example.com/block.jpg')
        state['layout'][0]['heroBackgrounds']['desktop']=''
        self.assertEqual(workspace.site_cover(state,defaults),'')
        self.assertEqual(workspace.site_cover({'layout':[{'source':'s1'}]},defaults),'')

if __name__=='__main__':unittest.main()
