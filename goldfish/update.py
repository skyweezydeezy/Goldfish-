#!/usr/bin/env python3
"""
I See Fish - self-updater. start.bat runs this before the server, so starting the app always gives you the newest version.

What it does:
  * Asks GitHub which commit is newest. If you already have it, nothing is downloaded.
  * Otherwise downloads that commit as a zip, checks it, and copies it over this folder.
    Files that were removed from the app are removed here too. Nothing else in the folder is touched.
  * If this folder is a git checkout (it has a .git folder), it runs "git pull --ff-only" instead.
  * If anything goes wrong (no internet, GitHub down), it says so and the app starts with the version you have.

Standard library only. Skip it with:  start.bat --no-update   (or set GOLDFISH_NO_UPDATE=1)
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO = os.environ.get("GOLDFISH_UPDATE_REPO", "https://github.com/skyweezydeezy/Goldfish-").rstrip("/")
REF = os.environ.get("GOLDFISH_UPDATE_REF", "HEAD")   # HEAD = the repo's default branch; or a branch name, tag or full commit id
HERE = Path(__file__).resolve().parent
MANIFEST = ".goldfish-install.json"
STAGING = ".goldfish-update-tmp"
MAX_ZIP = 300 * 1024 * 1024
WIN_BAD = re.compile(r"^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$", re.I)   # device names: not usable as file names on Windows


def install_root(here=HERE):
    """(folder to update, part of the repo that lives there). The whole download when start.bat sits above
    the goldfish folder; only the goldfish folder itself when it was moved somewhere on its own."""
    root = here.parent
    if here.name == "goldfish" and (root / "start.bat").exists():
        return root, ""
    return here, "goldfish/"


def http_get(url, timeout, limit=MAX_ZIP):
    req = urllib.request.Request(url, headers={"User-Agent": "goldfish-updater"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        data = res.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError("download is larger than expected")
    return data


def remote_sha(repo=REPO, ref=REF, timeout=8):
    """Newest commit id for ref, read from the repo's public git refs (no API key, no rate limit to speak of)."""
    if re.fullmatch(r"[0-9a-f]{40}", ref):
        return ref
    data = http_get(repo + ".git/info/refs?service=git-upload-pack", timeout, 20 * 1024 * 1024)
    want = ["HEAD"] if ref == "HEAD" else ["refs/heads/" + ref, "refs/tags/" + ref]
    i = 0
    while i + 4 <= len(data):
        n = int(data[i:i + 4], 16)
        if n < 4:           # flush packet
            i += 4
            continue
        line = data[i + 4:i + n].split(b"\0")[0].decode("utf-8", "replace").strip()
        i += n
        parts = line.split(" ", 1)
        if len(parts) == 2 and parts[1] in want and re.fullmatch(r"[0-9a-f]{40}", parts[0]):
            return parts[0]
    raise RuntimeError("could not find '%s' in %s" % (ref, repo))


def safe_rel(rel):
    parts = rel.split("/")
    if not rel or rel.startswith("/") or "\\" in rel or ":" in rel or any(p in ("", ".", "..") for p in parts):
        raise RuntimeError("unsafe path in download: %r" % rel)
    if any(WIN_BAD.match(p) or p[-1] in ". " or re.search(r'[<>"|?*\x00-\x1f]', p) for p in parts):
        raise RuntimeError("the download has a file name Windows cannot use: %r" % rel)
    return rel


def read_manifest(root):
    try:
        m = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
        return m if isinstance(m, dict) else {}
    except Exception:
        return {}


def apply_zip(zip_bytes, root, sub, sha):
    """Copy the downloaded commit over root. Returns (files changed, files removed)."""
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    names = [n for n in zf.namelist() if not n.endswith("/")]
    if not names:
        raise RuntimeError("the download is empty")
    top = names[0].split("/")[0] + "/"
    entries = {}
    for n in names:
        if not n.startswith(top):
            raise RuntimeError("unexpected layout in download")
        rel = n[len(top):]
        if sub:
            if not rel.startswith(sub):
                continue
            rel = rel[len(sub):]
        entries[safe_rel(rel)] = n
    need = ["server.py", "static/index.html"] if sub else ["goldfish/server.py", "goldfish/static/index.html", "start.bat"]
    missing = [f for f in need if f not in entries]
    if missing:
        raise RuntimeError("the download does not look like the app (missing %s)" % ", ".join(missing))

    # 1. unpack everything into a staging folder first, so a broken download never touches the app
    staging = root / STAGING
    shutil.rmtree(staging, ignore_errors=True)
    changed = []
    try:
        for rel, n in entries.items():
            data = zf.read(n)
            dest = root / rel
            try:
                if dest.is_file() and dest.stat().st_size == len(data) and dest.read_bytes() == data:
                    continue
            except OSError:
                pass
            tmp = staging / rel
            tmp.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_bytes(data)
            changed.append(rel)
        # 2. move the changed files into place
        for rel in changed:
            dest = root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staging / rel, dest)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    # 3. remove files that an earlier update put here and that are no longer part of the app
    removed = []
    for rel in read_manifest(root).get("files", []):
        try:
            if rel in entries or not isinstance(rel, str):
                continue
            p = root / safe_rel(rel)
            if p.is_file():
                p.unlink()
                removed.append(rel)
                d = p.parent
                while d != root and not any(d.iterdir()):
                    d.rmdir()
                    d = d.parent
        except Exception:
            pass

    (root / MANIFEST).write_text(json.dumps({"sha": sha, "repo": REPO, "ref": REF, "files": sorted(entries)}, indent=0), encoding="utf-8")
    return changed, removed


def git_pull(root):
    git = shutil.which("git")
    if not git:
        print("[update] This folder is a git checkout but git was not found, so it was not updated.")
        return
    r = subprocess.run([git, "-C", str(root), "pull", "--ff-only"], capture_output=True, text=True, timeout=90)
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        print("[update] git pull did not work, starting the version you have:")
        print("         " + (out.splitlines() or ["(no message)"])[-1])
    elif "Already up to date" in out:
        print("[update] You have the newest version.")
    else:
        print("[update] Updated with git pull.")


def update(root=None, sub=None, repo=None, ref=None):
    """Returns 'current', 'updated' or 'git'. Raises on failure."""
    if root is None:
        root, sub = install_root()
    repo = repo or REPO
    ref = ref or REF
    if (root / ".git").exists() or (root.parent / ".git").exists() and sub:
        git_pull(root)
        return "git"
    sha = remote_sha(repo, ref)
    have = read_manifest(root).get("sha")
    if have == sha:
        print("[update] You have the newest version (%s)." % sha[:7])
        return "current"
    print("[update] Downloading the newest version (%s)..." % sha[:7])
    data = http_get(repo + "/archive/" + sha + ".zip", 120)
    changed, removed = apply_zip(data, root, sub, sha)
    print("[update] Updated: %d file(s) changed, %d removed." % (len(changed), len(removed)))
    return "updated"


def main():
    if "--no-update" in sys.argv[1:] or os.environ.get("GOLDFISH_NO_UPDATE"):
        print("[update] Skipped (--no-update).")
        return
    try:
        update()
    except Exception as e:
        print("[update] Could not check for a new version (%s)." % (str(e) or type(e).__name__))
        print("[update] Starting the version you have.")


if __name__ == "__main__":
    main()
