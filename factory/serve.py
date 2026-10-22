"""Serve the factory dashboard and report git state at /api/git.

Run from the factory folder:  python serve.py [port]
Read-only, except POST /api/models, which writes only factory/models.json.
Otherwise it only runs `git status` and `git log`, never changes anything.
"""
import json
import os
import subprocess
import sys
import tempfile
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


AGENTS = {
    "spec-writer", "builder", "reviewer-security", "reviewer-ux", "reviewer-ui",
    "reviewer-code", "approver",
}
MODELS = {"haiku", "sonnet", "opus", "fable"}
EFFORTS = {"low", "medium", "high", "xhigh", "max"}
MAX_BODY = 4096


def validate_models(data):
    """Return the cleaned {agent: {model, effort}} map or raise ValueError."""
    if not isinstance(data, dict):
        raise ValueError("body must be an object")
    clean = {}
    for agent, choice in data.items():
        if agent not in AGENTS:
            raise ValueError(f"unknown agent: {agent!r}")
        if not isinstance(choice, dict) or set(choice) != {"model", "effort"}:
            raise ValueError(f"{agent}: needs exactly model and effort")
        model, effort = choice["model"], choice["effort"]
        if not isinstance(model, str) or model not in MODELS:
            raise ValueError(f"{agent}: unknown model {model!r}")
        if not isinstance(effort, str) or effort not in EFFORTS:
            raise ValueError(f"{agent}: unknown effort {effort!r}")
        clean[agent] = {"model": model, "effort": effort}
    return clean


def origin_allowed(origin, port):
    return origin in (f"http://localhost:{port}", f"http://127.0.0.1:{port}")


def write_models(clean, folder=HERE):
    # Temp file in the same folder, then an atomic replace.
    fd, tmp = tempfile.mkstemp(dir=folder, prefix="models.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(clean, f, indent=2)
            f.write("\n")
        os.replace(tmp, Path(folder) / "models.json")
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


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

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/models":
            return self.reply(404, {"error": "not found"})
        port = self.server.server_address[1]
        if self.headers.get("X-Factory") != "1" or not origin_allowed(
            self.headers.get("Origin"), port
        ):
            return self.reply(403, {"error": "forbidden"})
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self.reply(413, {"error": "Content-Length required"})
        if length < 0 or length > MAX_BODY:
            return self.reply(413, {"error": "body too large"})
        try:
            clean = validate_models(json.loads(self.rfile.read(length)))
        except ValueError as err:  # includes json.JSONDecodeError
            return self.reply(400, {"error": str(err)})
        write_models(clean)
        self.reply(200, clean)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(HERE)))
    print(f"Dashboard: http://localhost:{port}/dashboard.html")
    server.serve_forever()
