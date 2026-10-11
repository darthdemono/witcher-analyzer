#!/usr/bin/env python3
"""The Witcher save -> Markdown (default) or JSON (-o x.json). Folder(s) or several saves -> one combined history."""
import argparse, glob, json, os, sys
from pathlib import Path

from witcher import container, tw1
from witcher.errors import WitcherError
from witcher.render import md

ROOT = Path(__file__).resolve().parent
SUFFIX = ".TheWitcherSave"
SEARCH = ("~/Documents/The Witcher", "/mnt/*/Documents/The Witcher", "/mnt/*/Backup/Documents/The Witcher/saves", "~/.local/share/Steam/steamapps/compatdata/*/pfx/drive_c/users/*/Documents/The Witcher", ".")


def load_db():
    return {n: json.loads((ROOT / "db_tw1" / f"{n}.json").read_text()) for n in ("items", "baseitems", "spells", "marketcat")}


def summarize_file(path, db):
    return tw1.summarize(container.read(Path(path).read_bytes()), db)


def auto_find():
    found = [Path(f) for pat in SEARCH for d in glob.glob(os.path.expandvars(os.path.expanduser(pat))) for f in glob.glob(os.path.join(d, "**", "*" + SUFFIX), recursive=True)]
    for f in sorted(found, key=lambda f: f.stat().st_mtime, reverse=True):
        try:
            container.read(f.read_bytes()); return f
        except WitcherError: continue
    sys.exit("no readable Witcher save found; pass a path")


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument("paths", nargs="*"); a.add_argument("-o")
    a.add_argument("--combined", action="store_true", help="force the combined document for one save")
    a = a.parse_args()
    try:
        db = load_db()
        paths = a.paths or [str(auto_find())]
        path = Path(paths[0])
        if len(paths) > 1 or path.is_dir() or a.combined:
            from witcher.combine import combined
            out = combined(paths, db)
        else:
            m = summarize_file(path, db)
            out = json.dumps(m, indent=1, default=list, ensure_ascii=False) if a.o and a.o.endswith(".json") else md(m, path.name)
    except (WitcherError, OSError) as e:
        sys.exit(f"{e}")
    Path(a.o).write_text(out) if a.o else sys.stdout.write(out)


if __name__ == "__main__":
    main()
