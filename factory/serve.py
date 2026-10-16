"""Serve the factory dashboard and report git state at /api/git.

Run from the factory folder:  python serve.py [port]
Read-only: it only runs `git status` and `git log`, never changes anything.
"""
import json
import subprocess
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent


def git(*args):
    out = subprocess.run(
        ["git", *args], cwd=REPO, capture_output=True, text=True, timeout=10, check=True
    )
    return out.stdout


CACHE_SECONDS = 10
_cache = {"at": 0.0, "state": None}


def git_state():
    state = {"branch": None, "dirty": [], "unpushed": None}
    try:
        state["branch"] = git("rev-parse", "--abbrev-ref", "HEAD").strip()
        state["dirty"] = [l[3:] for l in git("status", "--porcelain").splitlines()]
    except Exception as err:  # git missing or not a repo
        state["error"] = str(err)
        return state
    try:
        # origin/main as last seen locally; a push updates it, so this is
        # "commits that exist only on this computer".
        log = git("log", "origin/main..HEAD", "--format=%s")
        state["unpushed"] = [l for l in log.splitlines() if l]
    except Exception:
        state["unpushed"] = None  # no origin/main known
    return state


def cached_git_state():
    # The dashboard polls often; git only changes when you commit or push.
    now = time.monotonic()
    if _cache["state"] is None or now - _cache["at"] > CACHE_SECONDS:
        _cache["state"] = git_state()
        _cache["at"] = now
    return _cache["state"]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # no per-request log lines

    def do_GET(self):
        if self.path.split("?")[0] == "/api/git":
            body = json.dumps(cached_git_state()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(HERE)))
    print(f"Dashboard: http://localhost:{port}/dashboard.html")
    server.serve_forever()
