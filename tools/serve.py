#!/usr/bin/env python3
"""Server locale con gli stessi indirizzi puliti di GitHub Pages: / → index.html, /glossario → glossario.html.
Uso:  python3 tools/serve.py [porta]   (default 8000), poi aprire http://localhost:8000"""
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and not os.path.splitext(p)[1] and os.path.exists(p + ".html"): return p + ".html"
        return p
    def send_error(self, code, message=None, explain=None):
        if code == 404 and os.path.exists(os.path.join(ROOT, "404.html")):   # come GitHub Pages: pagina 404 personalizzata
            data = open(os.path.join(ROOT, "404.html"), "rb").read()
            self.send_response(404); self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data))); self.end_headers()
            if self.command != "HEAD": self.wfile.write(data)
        else: super().send_error(code, message, explain)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
