#!/usr/bin/env python3
"""
Visual Goldfish Calculator - local server.

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

    def search(self, q, limit=12):
        q = norm(q)
        if len(q) < 2:
            return []
        starts = [k for k in self.index if k.startswith(q)]
        contains = [k for k in self.index if q in k and not k.startswith(q)] if len(starts) < limit else []
        return sorted(starts, key=len)[:limit] + sorted(contains, key=len)[: max(0, limit - len(starts))]


def glob_escape(s):
    return re.sub(r"([*?\[])", r"[\1]", s)


def slim(card, imgs):
    """Reduce a Scryfall card object to what the simulator needs."""
    faces = card.get("card_faces") or []
    remote = []
    if card.get("image_uris"):
        remote = [card["image_uris"].get("normal")]
    elif faces and faces[0].get("image_uris"):
        remote = [f.get("image_uris", {}).get("normal") for f in faces]
    front = faces[0] if faces and card.get("layout") in ("transform", "modal_dfc", "double_faced_token", "reversible_card") else None

    def g(key, default=""):
        if front and front.get(key) not in (None, ""):
            return front.get(key)
        if card.get(key) not in (None, ""):
            return card.get(key)
        return default

    oracle = card.get("oracle_text")
    if oracle is None and faces:
        oracle = "\n//\n".join(f.get("oracle_text", "") for f in faces)
    return {
        "name": card.get("name"),
        "layout": card.get("layout", "normal"),
        "mana_cost": g("mana_cost"),
        "cmc": card.get("cmc", 0) or 0,
        "type_line": g("type_line"),
        "full_type_line": card.get("type_line") or " // ".join(f.get("type_line", "") for f in faces),
        "oracle_text": oracle or "",
        "front_oracle": (front or card).get("oracle_text", oracle or ""),
        "power": g("power", None),
        "toughness": g("toughness", None),
        "colors": card.get("colors") or (front or {}).get("colors") or [],
        "color_identity": card.get("color_identity") or [],
        "produced_mana": card.get("produced_mana") or [],
        "keywords": card.get("keywords") or [],
        "legal_commander": (card.get("legalities") or {}).get("commander"),
        "set": card.get("set"),
        "cn": card.get("collector_number"),
        "faces": [{"name": f.get("name"), "mana_cost": f.get("mana_cost", ""), "type_line": f.get("type_line", ""),
                   "oracle_text": f.get("oracle_text", ""), "power": f.get("power"), "toughness": f.get("toughness")}
                  for f in faces],
        "images": imgs,
        "remote_images": [u for u in remote if u],
    }


LINE_RE = re.compile(
    r"^\s*(?:(?P<qty>\d+)\s*[xX]?\s+)?(?P<name>.+?)"
    r"(?:\s+\((?P<set>[A-Za-z0-9]{2,6})\)(?:\s+(?P<cn>[A-Za-z0-9\-\u2605]+))?)?"
    r"(?P<tags>(?:\s+\*[^*]+\*|\s+\[[^\]]*\]|\s+#\S+)*)\s*$"
)
SECTION_RE = re.compile(r"^\s*(//\s*)?(commander|commanders|deck|mainboard|main|sideboard|maybeboard|companion|tokens?|considering)\s*:?\s*(\(\d+\))?\s*$", re.I)


def parse_decklist(text):
    entries, section = [], "main"
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            if not line and section == "commander" and entries:
                section = "main"
            continue
        m = SECTION_RE.match(line)
        if m:
            s = m.group(2).lower()
            section = "commander" if s.startswith("commander") else ("main" if s in ("deck", "mainboard", "main") else "skip")
            continue
        if line.startswith("//"):
            continue
        if section == "skip":
            continue
        m = LINE_RE.match(line)
        if not m:
            continue
        tags = (m.group("tags") or "").lower()
        is_cmdr = section == "commander" or "*cmdr*" in tags or "[commander" in tags
        name = m.group("name").strip()
        name = re.sub(r"\s+\*F\*$", "", name)
        entries.append({
            "qty": int(m.group("qty") or 1),
            "name": name,
            "set": m.group("set"),
            "cn": m.group("cn"),
            "commander": is_cmdr,
        })
    return entries


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
        if u.path == "/api/resolve":
            entries = parse_decklist(payload.get("text", ""))
            out, missing = [], []
            for e in entries:
                r = self.mirror.resolve(e["name"], e.get("set"), e.get("cn")) if self.mirror.ok else None
                if not r:
                    missing.append(e)
                    continue
                card = slim(*r)
                card.update({"qty": e["qty"], "commander": e["commander"], "input_name": e["name"]})
                out.append(card)
            return self._json({"cards": out, "missing": missing, "parsed": len(entries)})
        return self._json({"error": "not found"}, 404)


def default_root():
    home = Path.home()
    for p in (home / "Documents" / "ScryMirror", home / "OneDrive" / "Documents" / "ScryMirror", HERE.parent / "ScryMirror"):
        if p.exists():
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description="Visual Goldfish Calculator")
    ap.add_argument("--scrymirror", help="Path to the ScryMirror folder (default: ~/Documents/ScryMirror)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    root = Path(a.scrymirror) if a.scrymirror else default_root()
    if not root:
        print("!! ScryMirror folder not found. Pass --scrymirror \"C:\\path\\to\\ScryMirror\"")
    mirror = Mirror(root)
    if mirror.error:
        print("!! " + mirror.error)
    Handler.mirror = mirror
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    url = f"http://127.0.0.1:{a.port}/"
    print(f"Goldfish calculator running at {url}  (Ctrl+C to stop)")
    if not a.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
