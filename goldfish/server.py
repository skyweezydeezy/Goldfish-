#!/usr/bin/env python3
"""
I See Fish - local server.

Reads card data and images straight from a local ScryMirror folder:
    <ScryMirror>/data/scryfall.sqlite
    <ScryMirror>/data/images/normal/<set>/<cn>_en[_<face>].jpg

Standard library only. Run:
    python server.py                       (auto-detects ~/Documents/ScryMirror)
    python server.py --scrymirror "D:\\ScryMirror" --port 8765
"""
import argparse
import json
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"

BAD_SET_TYPES = {"memorabilia", "token", "funny", "minigame", "vanguard", "planechase", "archenemy"}


def norm(name):
    name = name.strip().lower()
    name = name.replace("\u2019", "'").replace("\u2018", "'")
    name = re.sub(r"\s+", " ", name)
    return name


class Mirror:
    """Read-only access to a ScryMirror database + image tree."""

    def __init__(self, root):
        self.root = Path(root) if root else None
        self.ok = False
        self.error = None
        self.db_path = None
        self.img_root = None
        self.table = None
        self.raw_col = None
        self.name_col = None
        self.index = {}          # normalized name -> list of rowids
        self.lock = threading.Lock()
        self.conn = None
        if self.root:
            self._open()

    # ---------- setup ----------
    def _open(self):
        candidates = [self.root / "data" / "scryfall.sqlite", self.root / "scryfall.sqlite"]
        self.db_path = next((p for p in candidates if p.exists()), None)
        if not self.db_path:
            self.error = f"scryfall.sqlite not found under {self.root}"
            return
        for p in (self.root / "data" / "images" / "normal", self.root / "images" / "normal"):
            if p.exists():
                self.img_root = p
                break
        uri = "file:" + urllib.parse.quote(str(self.db_path).replace("\\", "/")) + "?mode=ro"
        self.conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
        self._detect_schema()
        if self.table:
            self._build_index()
            self.ok = True

    def _detect_schema(self):
        cur = self.conn.cursor()
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')")]
        best = None
        for t in sorted(tables, key=lambda t: (t != "cards", t)):
            cols = [r[1] for r in cur.execute(f'PRAGMA table_info("{t}")')]
            lc = {c.lower(): c for c in cols}
            raw = next((lc[c] for c in ("raw", "json", "data", "raw_json", "card_json") if c in lc), None)
            name = lc.get("name")
            if raw or name:
                best = (t, raw, name)
                if raw:
                    break
        if not best:
            self.error = "No card table found in scryfall.sqlite (tables: %s)" % ", ".join(tables)
            return
        self.table, self.raw_col, self.name_col = best
        cols = [r[1] for r in cur.execute(f'PRAGMA table_info("{self.table}")')]
        self.columns = cols

    def _build_index(self):
        t0 = time.time()
        cur = self.conn.cursor()
        if self.name_col:
            rows = cur.execute(f'SELECT rowid, "{self.name_col}" FROM "{self.table}"')
        else:
            rows = cur.execute(f'SELECT rowid, json_extract("{self.raw_col}", \'$.name\') FROM "{self.table}"')
        for rowid, name in rows:
            if not name:
                continue
            n = norm(name)
            self.index.setdefault(n, []).append(rowid)
            if " // " in n:  # split / DFC: also index each face name
                for part in n.split(" // "):
                    self.index.setdefault(part, []).append(rowid)
        print(f"[mirror] indexed {len(self.index):,} names from {self.table} in {time.time() - t0:.1f}s")

    # ---------- lookups ----------
    def _row(self, rowid):
        cur = self.conn.cursor()
        if self.raw_col:
            r = cur.execute(f'SELECT "{self.raw_col}" FROM "{self.table}" WHERE rowid=?', (rowid,)).fetchone()
            if r and r[0]:
                try:
                    return json.loads(r[0])
                except Exception:
                    pass
        cur.row_factory = sqlite3.Row
        r = cur.execute(f'SELECT * FROM "{self.table}" WHERE rowid=?', (rowid,)).fetchone()
        return self._row_to_card(dict(r)) if r else None

    @staticmethod
    def _row_to_card(d):
        # Generic fallback for a flat schema: decode any JSON-looking columns.
        out = {}
        for k, v in d.items():
            if isinstance(v, str) and v[:1] in "[{":
                try:
                    v = json.loads(v)
                except Exception:
                    pass
            out[k] = v
        if "set_code" in out and "set" not in out:
            out["set"] = out["set_code"]
        if "cn" in out and "collector_number" not in out:
            out["collector_number"] = out["cn"]
        return out

    def find_image(self, set_code, cn):
        """Return list of (served_path) for a printing, front first."""
        if not self.img_root or not set_code or not cn:
            return []
        d = self.img_root / set_code.lower()
        if not d.exists():
            d = self.img_root / set_code
            if not d.exists():
                return []
        base = f"{cn}_en"
        files = [p.name for p in d.glob(f"{glob_escape(cn)}_en*.jpg")]
        files = [f for f in files if f == base + ".jpg" or f.startswith(base + "_")]
        if not files:
            return []

        def face_key(f):
            suf = f[len(base):-4].lstrip("_").lower()
            order = {"": 0, "front": 0, "0": 0, "a": 0, "1": 1, "back": 1, "b": 1, "2": 2}
            return (order.get(suf, 5), suf)

        files.sort(key=face_key)
        return [f"/img/{d.name}/{urllib.parse.quote(f)}" for f in files]

    def choose(self, rowids, want_set=None, want_cn=None):
        cards = [c for c in (self._row(r) for r in rowids) if c]
        if want_set:
            exact = [c for c in cards if str(c.get("set", "")).lower() == want_set.lower()
                     and (not want_cn or str(c.get("collector_number", "")).lower() == want_cn.lower())]
            if exact:
                cards = exact + [c for c in cards if c not in exact]
                c = exact[0]
                return c, self.find_image(c.get("set"), c.get("collector_number"))

        def score(c):
            bad = 0
            if c.get("lang", "en") != "en": bad += 100
            if c.get("digital"): bad += 50
            games = c.get("games")
            if games and "paper" not in games: bad += 50
            if c.get("set_type") in BAD_SET_TYPES: bad += 40
            if c.get("oversized"): bad += 40
            if c.get("promo"): bad += 10
            if c.get("full_art") or c.get("textless"): bad += 3
            if c.get("border_color") in ("gold", "silver"): bad += 30
            return (bad, -int((c.get("released_at") or "0000-00-00").replace("-", "") or 0))

        cards.sort(key=score)
        for c in cards[:12]:
            imgs = self.find_image(c.get("set"), c.get("collector_number"))
            if imgs:
                return c, imgs
        return (cards[0], []) if cards else (None, [])

    def resolve(self, name, set_code=None, cn=None):
        n = norm(name)
        rowids = self.index.get(n)
        if not rowids and " / " in n and " // " not in n:
            rowids = self.index.get(n.replace(" / ", " // "))
        if not rowids:
            return None
        with self.lock:
            card, imgs = self.choose(rowids, set_code, cn)
        return (card, imgs) if card else None

    def diagnose(self):
        """Self-check: schema, row counts, and whether a few real cards resolve to image files."""
        out = {"root": str(self.root) if self.root else None, "db": str(self.db_path) if self.db_path else None,
               "images_dir": str(self.img_root) if self.img_root else None, "error": self.error}
        if not self.conn:
            return out
        cur = self.conn.cursor()
        tables = {}
        for (t,) in cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')").fetchall():
            cols = [r[1] for r in cur.execute(f'PRAGMA table_info("{t}")')]
            try:
                n = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            except Exception:
                n = None
            tables[t] = {"columns": cols, "rows": n}
        out["tables"] = tables
        out["card_table"] = self.table
        out["raw_column"] = self.raw_col
        out["indexed_names"] = len(self.index)
        checks = []
        for name in ("Sol Ring", "Forest", "Command Tower", "Lightning Bolt"):
            r = self.resolve(name)
            if not r:
                checks.append({"name": name, "found": False})
                continue
            card, imgs = r
            on_disk = []
            for u in imgs:
                rel = urllib.parse.unquote(u[len("/img/"):])
                on_disk.append((self.img_root / rel).exists() if self.img_root else False)
            checks.append({"name": name, "found": True, "set": card.get("set"), "cn": card.get("collector_number"),
                           "image_urls": imgs, "image_files_exist": on_disk})
        out["sample_cards"] = checks
        return out

    def resolve_token(self, tid, name):
        """Find a token printing by Scryfall id (preferred) or by name among token layouts."""
        with self.lock:
            cur = self.conn.cursor()
            card = None
            if tid:
                cols = [c.lower() for c in getattr(self, "columns", [])]
                if "id" in cols:
                    r = cur.execute(f'SELECT rowid FROM "{self.table}" WHERE id=?', (tid,)).fetchone()
                    if r:
                        card = self._row(r[0])
            if not card and name:
                for rowid in self.index.get(norm(name), []):
                    c = self._row(rowid)
                    if c and (c.get("layout") in ("token", "double_faced_token", "emblem") or "Token" in (c.get("type_line") or "")):
                        if not card or (self.find_image(c.get("set"), c.get("collector_number")) and not card.get("_img")):
                            card = c
                            card["_img"] = bool(self.find_image(c.get("set"), c.get("collector_number")))
            if not card:
                return None
            return card, self.find_image(card.get("set"), card.get("collector_number"))

    def search(self, q, limit=12):
        q = norm(q)
        if len(q) < 2:
            return []
        starts = [k for k in self.index if k.startswith(q)]
        contains = [k for k in self.index if q in k and not k.startswith(q)] if len(starts) < limit else []
        return sorted(starts, key=len)[:limit] + sorted(contains, key=len)[: max(0, limit - len(starts))]


def glob_escape(s):
    return re.sub(r"([*?\[])", r"[\1]", s)


class Handler(BaseHTTPRequestHandler):
    mirror: Mirror = None

    def log_message(self, fmt, *args):
        if "/img/" not in (args[0] if args else ""):
            sys.stderr.write("[http] " + (fmt % args) + "\n")

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path, cache=False):
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = urllib.parse.unquote(u.path)
        m = self.mirror
        if p == "/api/status":
            return self._json({"ok": m.ok, "root": str(m.root) if m.root else None, "error": m.error,
                               "names": len(m.index), "images": bool(m.img_root), "table": m.table})
        if p == "/api/diagnose":
            return self._json(m.diagnose())
        if p == "/api/search":
            q = urllib.parse.parse_qs(u.query).get("q", [""])[0]
            return self._json(m.search(q))
        if p.startswith("/img/") and m.img_root:
            rel = Path(p[len("/img/"):])
            target = (m.img_root / rel).resolve()
            if m.img_root.resolve() not in target.parents:
                return self.send_error(403)
            return self._file(target, cache=True)
        if p in ("/", ""):
            p = "/index.html"
        target = (STATIC / p.lstrip("/")).resolve()
        if STATIC.resolve() not in target.parents:
            return self.send_error(403)
        return self._file(target)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._json({"error": "bad json"}, 400)
        if u.path == "/api/collection":
            # Same shape as Scryfall's POST /cards/collection, answered from the local ScryMirror.
            # Identifiers may also carry a "name" (the browser always sends one) so set+number lookups can fall back to it.
            data, not_found = [], []
            for ident in payload.get("identifiers", []):
                r = None
                if self.mirror.ok:
                    if ident.get("id"):
                        r = self.mirror.resolve_token(ident["id"], ident.get("name"))
                    elif ident.get("name"):
                        r = self.mirror.resolve(ident["name"], ident.get("set"), ident.get("collector_number"))
                if not r:
                    not_found.append(ident)
                    continue
                card, imgs = r
                card = dict(card)
                card["_local_images"] = imgs
                data.append(card)
            return self._json({"object": "list", "not_found": not_found, "data": data})
        return self._json({"error": "not found"}, 404)


def default_root():
    home = Path.home()
    for p in (home / "Documents" / "ScryMirror", home / "OneDrive" / "Documents" / "ScryMirror", HERE.parent / "ScryMirror"):
        if p.exists():
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description="I See Fish")
    ap.add_argument("--scrymirror", help="Path to the ScryMirror folder (default: ~/Documents/ScryMirror)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--lan", action="store_true", help="Let other devices on your Wi-Fi (phone, iPad) open the app")
    ap.add_argument("--no-update", action="store_true", help="Used by start.bat: start without checking for a new version")
    a = ap.parse_args()
    root = Path(a.scrymirror) if a.scrymirror else default_root()
    if not root:
        print("!! ScryMirror folder not found. Pass --scrymirror \"C:\\path\\to\\ScryMirror\"")
    mirror = Mirror(root)
    if mirror.error:
        print("!! " + mirror.error)
    Handler.mirror = mirror
    if mirror.conn:
        d = mirror.diagnose()
        print(f"[mirror] card table: {d.get('card_table')} (raw json column: {d.get('raw_column')}), images: {d.get('images_dir')}")
        for c in d.get("sample_cards", []):
            ok = c.get("found") and all(c.get("image_files_exist") or [False])
            print(f"[mirror]   {'OK ' if ok else 'BAD'} {c['name']}: " + (f"{c.get('set')} #{c.get('cn')} -> {c.get('image_urls')}" if c.get("found") else "not found"))
        print("[mirror] full report: http://127.0.0.1:%d/api/diagnose" % a.port)
    srv = ThreadingHTTPServer(("0.0.0.0" if a.lan else "127.0.0.1", a.port), Handler)
    url = f"http://127.0.0.1:{a.port}/"
    print(f"I See Fish running at {url}  (Ctrl+C to stop)")
    if a.lan:
        import socket
        try:
            sk = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); sk.connect(("10.255.255.255", 1)); ip = sk.getsockname()[0]; sk.close()
        except Exception:
            ip = "<your-PC-address>"
        print(f"On your phone or iPad (same Wi-Fi) open:  http://{ip}:{a.port}/")
    if not a.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
