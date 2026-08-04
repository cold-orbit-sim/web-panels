#!/usr/bin/env python3
"""
aux-display-client static webserver.

Serves the static HTML/JS/CSS for Cold Orbit's browser-based auxiliary
screens. No build step, no framework, no runtime dependencies beyond the
Python 3 standard library — this only ever serves files as-is.

Routes (by URL prefix):
  /hardpoint-panel/...   -> ./hardpoint-panel   (4x generic utility panels, placeholder)
  /... (everything else) -> ./public            (the touchscreen client)

Each physical screen's browser is pointed at the matching path, e.g.
  http://<this-host>:8080/                  touchscreen
  http://<this-host>:8080/hardpoint-panel/   each of the 4 hardpoint panels

Run:
  python3 server.py [port]      (default port 8080)
"""
import http.server
import os
import sys
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))

ROUTES = {
    "/hardpoint-panel": os.path.join(ROOT, "hardpoint-panel"),
}
DEFAULT_ROOT = os.path.join(ROOT, "public")


class AuxDisplayHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        for prefix, directory in ROUTES.items():
            if path == prefix or path.startswith(prefix + "/"):
                rest = path[len(prefix):] or "/"
                self.directory = directory
                return super().translate_path(rest)
        self.directory = DEFAULT_ROOT
        return super().translate_path(path)

    def end_headers(self):
        # These are status displays that must pick up file changes on the
        # next load without fighting stale cache state during development.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(AuxDisplayHandler, directory=DEFAULT_ROOT)
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"aux-display-client serving:")
    print(f"  touchscreen     -> http://0.0.0.0:{port}/")
    print(f"  hardpoint-panel -> http://0.0.0.0:{port}/hardpoint-panel/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
