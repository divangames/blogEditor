"""Local-only allowlisted preview; never exposes drafts, credentials or APIs."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import mimetypes

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PACKS = {
    'outmax': ROOT / 'OUTMAX/OUTMAX_TOP10_ZIMA_2027_PUBLICATION_PACK_V2_1',
    'hasl': ROOT / 'ХАСЛ/HASL_TOP10_OSEN_2026_PUBLICATION_PACK_V4_4',
}
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        route = unquote(urlsplit(self.path).path)
        files = {'/': HERE/'index.html', '/prototype.css': HERE/'prototype.css',
                 '/app.js': ROOT/'release/tiptap-prototype/app.js',
                 '/outmax.css': ROOT/'outmax.css', '/hasl.css': ROOT/'hasl.css',
                 '/fixtures/blocks.html': HERE/'fixture.html',
                 '/fixtures/controls.html': HERE/'controls.html'}
        for brand, pack in PACKS.items():
            files[f'/fixtures/{brand}.html'] = pack/'article-body.html'
        file = files.get(route)
        if file is None and route.startswith('/media/'):
            pieces = route.split('/', 3)
            if len(pieces) == 4 and pieces[2] in PACKS:
                folder = (PACKS[pieces[2]]/'assets').resolve()
                candidate = (PACKS[pieces[2]]/pieces[3]).resolve()
                if candidate.is_relative_to(folder) and candidate.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2'}:
                    file = candidate
        if file is None or not file.is_file():
            self.send_error(404); return
        body = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; object-src 'none'")
        self.end_headers(); self.wfile.write(body)

if __name__ == '__main__':
    print('Tiptap experiment: http://127.0.0.1:8878', flush=True)
    ThreadingHTTPServer(('127.0.0.1',8878),Handler).serve_forever()
