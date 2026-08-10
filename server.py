#!/usr/bin/env python3
"""
HM Command Center — standalone server.

Serves the Command Center app (this folder) AND a small writable JSON data API,
so the app can persist approvals/answers/notes back to disk — which the agents
read on their next run. Atomic writes (temp file + os.replace), path-sandboxed.

By default it reads/writes the SHARED data dir (../Wiki/data) so the Command
Center and the agents use the exact same approvals.json / ecomm_state.json /
event_log.json. Override with env vars for a different deploy.

Run:
    python3 server.py
    CC_PORT=9000 CC_DATA=/path/to/data python3 server.py

API:
    GET  /api/health
    GET  /api/data/<file.json>      → the JSON file
    PUT  /api/data/<file.json>      → overwrite it (atomic)
    everything else                 → static files from this folder
"""
import os, json, tempfile, posixpath
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote
from pathlib import Path

BASE = Path(__file__).resolve().parent
# The Command Center OWNS its data (approvals, questions, tasks) — writes go here only.
DATA_DIR = Path(os.environ.get("CC_DATA", BASE / "data")).resolve()
# Read-only fallback for agent-org state the CC displays but doesn't own
# (ecomm_state.json roster + event_log.json for "last active"). Never written.
READ_FALLBACK = Path(os.environ.get("CC_READ_FALLBACK", BASE.parent / "Wiki" / "data")).resolve()
PORT = int(os.environ.get("CC_PORT", "8787"))
API = "/api/data/"
CTYPES = {".html": "text/html; charset=utf-8", ".js": "application/javascript",
          ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml"}


def atomic_write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def safe_in(root: Path, rel: str):
    rel = posixpath.normpath(unquote(rel)).lstrip("/")
    if rel.startswith("..") or ".." in rel.split("/"):
        return None
    return (root / rel)


def safe_static(rel: str):
    rel = unquote(rel.lstrip("/")) or "index.html"
    fp = (BASE / rel).resolve()
    if not str(fp).startswith(str(BASE)):
        return None
    if fp.is_dir():
        fp = fp / "index.html"
    return fp


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):
        p = self.path.split("?", 1)[0]
        if p == "/api/health":
            return self._json(200, {"ok": True, "server": "cc", "data": str(DATA_DIR)})
        if p.startswith(API):
            rel = p[len(API):]
            fp = safe_in(DATA_DIR, rel)               # CC-owned data first
            if fp and fp.is_file():
                return self._send(200, fp.read_bytes())
            fb = safe_in(READ_FALLBACK, rel)          # read-only agent state (ecomm_state, event_log)
            if fb and fb.is_file():
                return self._send(200, fb.read_bytes())
            return self._json(404, {"error": "not found"})
        fp = safe_static(p)
        if not fp or not fp.is_file():
            return self._send(404, b"not found", "text/plain")
        return self._send(200, fp.read_bytes(), CTYPES.get(fp.suffix, "application/octet-stream"))

    def do_PUT(self):
        if not self.path.startswith(API):
            return self._json(405, {"error": "PUT only on /api/data/"})
        fp = safe_in(DATA_DIR, self.path.split("?", 1)[0][len(API):])
        if not fp:
            return self._json(400, {"error": "bad path"})
        n = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(n) or b"null")
        except Exception as e:
            return self._json(400, {"error": f"invalid JSON: {e}"})
        atomic_write(fp, body)
        return self._send(200, fp.read_bytes())


if __name__ == "__main__":
    print(f"HM Command Center  →  http://localhost:{PORT}")
    print(f"  serving app : {BASE}")
    print(f"  data (r/w)  : {DATA_DIR}")
    print("  Ctrl-C to stop.")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
