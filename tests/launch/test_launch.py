#!/usr/bin/env python3
"""
Launch tests: the self-updater (goldfish/update.py) and the local server (goldfish/server.py).
No internet needed: a small local web server plays the part of GitHub.

    python tests/launch/test_launch.py
"""
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("update", REPO_ROOT / "goldfish" / "update.py")
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)

SHA1 = "1" * 40
SHA2 = "2" * 40
BASE = {
    "start.bat": b"@echo off\r\n",
    "README.md": b"readme v1",
    "goldfish/server.py": (REPO_ROOT / "goldfish" / "server.py").read_bytes(),
    "goldfish/update.py": (REPO_ROOT / "goldfish" / "update.py").read_bytes(),
    "goldfish/static/index.html": b"<html>v1</html>",
    "goldfish/static/old.js": b"old",
}


def make_zip(files, top="Goldfish--abc/"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(top, "")
        for name, data in files.items():
            z.writestr(top + name, data)
    return buf.getvalue()


def pkt(s):
    b = s.encode() if isinstance(s, str) else s
    return ("%04x" % (len(b) + 4)).encode() + b


class FakeGitHub:
    """Serves /repo.git/info/refs and /repo/archive/<sha>.zip like github.com does."""

    def __init__(self):
        self.head = SHA1
        self.zips = {}
        self.hits = []
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                fake.hits.append(self.path)
                if self.path.startswith("/repo.git/info/refs"):
                    body = (pkt("# service=git-upload-pack\n") + b"0000" + pkt(fake.head.encode() + b" HEAD\0multi_ack side-band\n")
                            + pkt(fake.head + " refs/heads/main\n") + pkt(SHA2 + " refs/heads/other\n") + b"0000")
                elif self.path.startswith("/repo/archive/") and self.path[len("/repo/archive/"):-4] in fake.zips:
                    body = fake.zips[self.path[len("/repo/archive/"):-4]]
                else:
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = "http://127.0.0.1:%d/repo" % self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.gh = FakeGitHub()
        self.gh.zips[SHA1] = make_zip(BASE)
        self.tmp = Path(tempfile.mkdtemp(prefix="goldfish-launch-"))
        self.root = self.tmp / "Goldfish--download"
        for name, data in BASE.items():           # what you get from "Download ZIP"
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        os.environ.pop("HTTP_PROXY", None), os.environ.pop("http_proxy", None)
        os.environ["NO_PROXY"] = os.environ["no_proxy"] = "127.0.0.1,localhost"

    def tearDown(self):
        self.gh.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_update(self, root=None, sub=""):
        return update.update(root or self.root, sub, self.gh.url, "HEAD")

    def test_first_run_then_current(self):
        self.assertEqual(self.run_update(), "updated")
        m = json.loads((self.root / update.MANIFEST).read_text())
        self.assertEqual(m["sha"], SHA1)
        self.assertIn("goldfish/server.py", m["files"])
        self.gh.hits.clear()
        self.assertEqual(self.run_update(), "current")
        self.assertFalse([h for h in self.gh.hits if "archive" in h], "nothing is downloaded when already up to date")

    def test_new_version_replaces_adds_and_removes(self):
        self.run_update()
        (self.root / "my-notes.txt").write_text("mine")                       # the user's own file
        (self.root / "goldfish" / ".deck-cache").mkdir()
        (self.root / "goldfish" / ".deck-cache" / "x.json").write_text("{}")
        v2 = dict(BASE)
        v2["goldfish/static/index.html"] = b"<html>v2</html>"
        v2["goldfish/static/new/deep.js"] = b"new"
        del v2["goldfish/static/old.js"]
        self.gh.zips[SHA2] = make_zip(v2)
        self.gh.head = SHA2
        self.assertEqual(self.run_update(), "updated")
        self.assertEqual((self.root / "goldfish/static/index.html").read_bytes(), b"<html>v2</html>")
        self.assertEqual((self.root / "goldfish/static/new/deep.js").read_bytes(), b"new")
        self.assertFalse((self.root / "goldfish/static/old.js").exists(), "files dropped from the app are removed")
        self.assertEqual((self.root / "my-notes.txt").read_text(), "mine")
        self.assertTrue((self.root / "goldfish/.deck-cache/x.json").exists())
        self.assertFalse((self.root / update.STAGING).exists())
        self.assertEqual(json.loads((self.root / update.MANIFEST).read_text())["sha"], SHA2)

    def test_branch_and_commit_refs(self):
        self.assertEqual(update.remote_sha(self.gh.url, "other"), SHA2)
        self.assertEqual(update.remote_sha(self.gh.url, "main"), SHA1)
        self.assertEqual(update.remote_sha("http://127.0.0.1:1/none", "a" * 40), "a" * 40)
        with self.assertRaises(RuntimeError):
            update.remote_sha(self.gh.url, "no-such-branch")

    def test_broken_download_leaves_app_alone(self):
        self.run_update()
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.gh.head = SHA2
        for bad in (b"not a zip", make_zip({"README.md": b"only a readme"}),
                    make_zip(dict(BASE, **{"../evil.txt": b"x"})), make_zip(dict(BASE, **{"goldfish/../../evil.txt": b"x"}))):
            self.gh.zips[SHA2] = bad
            with self.assertRaises(Exception):
                self.run_update()
            self.assertEqual({p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}, before)
            self.assertFalse((self.tmp / "evil.txt").exists())

    def test_goldfish_folder_on_its_own(self):
        alone = self.tmp / "elsewhere" / "goldfish"
        shutil.copytree(self.root / "goldfish", alone)
        root, sub = update.install_root(alone)
        self.assertEqual((root, sub), (alone, "goldfish/"))
        self.assertEqual(update.update(root, sub, self.gh.url, "HEAD"), "updated")
        self.assertFalse((alone.parent / "README.md").exists(), "nothing is written outside the goldfish folder")
        self.assertFalse((alone / "README.md").exists())
        self.assertTrue((alone / "static/index.html").exists())
        self.assertEqual(update.install_root(self.root / "goldfish"), (self.root, ""))

    def test_git_checkout_is_not_overwritten(self):
        (self.root / ".git").mkdir()
        self.assertEqual(self.run_update(), "git")
        self.assertFalse((self.root / update.MANIFEST).exists())
        self.assertFalse([h for h in self.gh.hits if "archive" in h])

    def test_offline_still_starts(self):
        env = dict(os.environ, GOLDFISH_UPDATE_REPO="http://127.0.0.1:1/none")
        r = subprocess.run([sys.executable, str(self.root / "goldfish" / "update.py")], env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Starting the version you have", r.stdout)
        r = subprocess.run([sys.executable, str(self.root / "goldfish" / "update.py"), "--no-update"], env=env, capture_output=True, text=True, timeout=60)
        self.assertIn("Skipped", r.stdout)

    def test_update_then_server_serves_the_new_files(self):
        """The whole launch: what start.bat does, minus the .bat itself."""
        v2 = dict(BASE)
        v2["goldfish/static/index.html"] = b"<html>v2</html>"
        self.gh.zips[SHA2] = make_zip(v2)
        self.gh.head = SHA2
        env = dict(os.environ, GOLDFISH_UPDATE_REPO=self.gh.url)
        r = subprocess.run([sys.executable, "update.py"], cwd=self.root / "goldfish", env=env, capture_output=True, text=True, timeout=60)
        self.assertIn("Updated", r.stdout, r.stdout + r.stderr)
        port = 8791
        srv = subprocess.Popen([sys.executable, "server.py", "--no-browser", "--no-update", "--port", str(port), "--scrymirror", str(self.tmp / "none")],
                               cwd=self.root / "goldfish", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            body = None
            for _ in range(50):
                try:
                    body = urllib.request.urlopen("http://127.0.0.1:%d/" % port, timeout=2).read()
                    break
                except Exception:
                    time.sleep(0.2)
            self.assertEqual(body, b"<html>v2</html>")
            st = json.loads(urllib.request.urlopen("http://127.0.0.1:%d/api/status" % port, timeout=2).read())
            self.assertIn("ok", st)
        finally:
            srv.terminate()
            srv.wait(timeout=10)


class RealAppTests(unittest.TestCase):
    def test_real_app_files_are_served(self):
        """The real goldfish folder starts and serves every file the service worker lists."""
        port = 8792
        srv = subprocess.Popen([sys.executable, "server.py", "--no-browser", "--port", str(port), "--scrymirror", str(REPO_ROOT / "no-such-folder")],
                               cwd=REPO_ROOT / "goldfish", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            html = None
            for _ in range(50):
                try:
                    html = opener.open("http://127.0.0.1:%d/" % port, timeout=2).read().decode()
                    break
                except Exception:
                    time.sleep(0.2)
            self.assertTrue(html and "<script" in html)
            import re
            sw = (REPO_ROOT / "goldfish/static/sw.js").read_text()
            shell = re.findall(r"'([^']+)'", sw.split("const SHELL = [")[1].split("];")[0])
            self.assertGreater(len(shell), 10)
            for f in shell:
                self.assertEqual(opener.open("http://127.0.0.1:%d/%s" % (port, f.lstrip("./")), timeout=5).status, 200, f)
        finally:
            srv.terminate()
            srv.wait(timeout=10)

    def test_launchers_run_the_updater_first(self):
        for bat in ("goldfish/start.bat", "goldfish/start-lan.bat"):
            text = (REPO_ROOT / bat).read_text()
            line = [l for l in text.splitlines() if "update.py %*" in l]
            self.assertEqual(len(line), 1, bat)
            self.assertLess(line[0].index("update.py %*"), line[0].index("server.py"), bat)
            self.assertIn("exit /b", line[0], bat + ": update, start and exit must be one line (the update can replace the file)")
        self.assertIn('goldfish\\start.bat" %* & exit /b', (REPO_ROOT / "start.bat").read_text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
