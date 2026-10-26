"""The site served locally for testing: python scripts/serve.py [port]
(default 8000), from the repo's root whatever the folder it's started in.

Like `python -m http.server`, but every response says "Cache-Control:
no-cache": the browser asks again each time (a quick 304 when unchanged)
instead of keeping its own copy for a while — the plain server sends no
caching header at all, so the browser guesses, and while files are being
edited it ends up mixing old and new scripts (an old module missing an
export the new one imports: the page's "errore nel caricamento", fine after
a reload). A local run uses the dcp-dev database (js/supabase-client.js).
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("", port), handler) as server:
        print(f"Serving {ROOT} on http://localhost:{port} (no-cache)")
        server.serve_forever()


if __name__ == "__main__":
    main()
