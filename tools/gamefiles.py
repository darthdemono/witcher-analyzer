#!/usr/bin/env python3
"""Read the installed game's own tables (KEY/BIF archives, 2DA tables, TLK strings).

    python3 tools/gamefiles.py list  <Data dir> [type]        resources in main.key, optionally one type id
    python3 tools/gamefiles.py 2da   <Data dir> <name>        print one 2DA table
    python3 tools/gamefiles.py tlk   <Data dir> <strref>...   look up strings (English, dialog_3.tlk)
    python3 tools/gamefiles.py build <Data dir> <out dir>     write the db_tw1/*.json tables the analyzer ships

It only reads. KEY V1.1 entries are 26 bytes: 16-byte resref, u16 type, u32 resource index, u32 (bif index << 20); BIFF V1.1 holds a table of (id, 0, offset, size, type) per resource."""
import json
import struct
import sys
from pathlib import Path

TYPE_2DA = 2017


class Game:
    def __init__(self, data):
        self.dir = Path(data)
        k = (self.dir / "main.key").read_bytes()
        bifc, keyc, _, off_files, off_keys = struct.unpack_from("<5I", k, 8)
        # file table at the offset in the header: (size, name offset, name length) x bifc
        self.bifs = []
        for i in range(bifc):
            size, no, nl = struct.unpack_from("<3I", k, off_files + i * 12)
            self.bifs.append(k[no:no + nl].decode("latin1"))
        self.keys = {}
        p = off_keys
        for _ in range(keyc):
            name, t, rid, bif = struct.unpack_from("<16sHII", k, p)
            self.keys[(name.rstrip(b"\0").decode("latin1").lower(), t)] = (bif >> 20, rid)
            p += 26
        self._bif = {}

    def resource(self, name, rtype):
        bi, ri = self.keys[(name.lower(), rtype)]
        if bi not in self._bif: self._bif[bi] = (self.dir / self.bifs[bi]).read_bytes()
        b = self._bif[bi]
        off, = struct.unpack_from("<I", b, 16)
        _, _, o, size, _ = struct.unpack_from("<5I", b, off + ri * 20)  # (id, 0, offset, size, type)
        return b[o:o + size]

    def table(self, name):
        """A 2DA as (columns, rows) with rows as dicts keyed by column."""
        raw = self.resource(name, TYPE_2DA).decode("latin1").splitlines()
        cols = raw[2].split()
        rows = []
        for line in raw[3:]:
            parts = line.split()
            if parts: rows.append(dict(zip(["_row"] + cols, parts)))
        return cols, rows


def tlk(path):
    b = Path(path).read_bytes()
    lang, n, off = struct.unpack_from("<3I", b, 8)
    out = []
    for i in range(n):
        flags, _, vol, pitch, so, size, _ = struct.unpack_from("<I16sIIIIf", b, 20 + i * 40)
        out.append(b[off + so:off + so + size].decode("utf-8", "replace") if flags & 1 else "")
    return out


ENGLISH = (4, 2, 6, 0)  # LocString ids: language id * 2 + gender; 2/4/6 are the English variants, 0 is the debug text


def english(loc):
    d = dict(loc["strings"])
    return next((d[i] for i in ENGLISH if d.get(i)), "")


def build(g, out):
    """Write the lookup tables the analyzer ships, straight from the install."""
    from witcher.gff import Gff
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    put = lambda name, obj: (out / f"{name}.json").write_text(json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
    items = {}
    for (name, t), _ in sorted(g.keys.items()):
        if t != 2025: continue  # UTI item templates
        r = Gff(g.resource(name, t)).root
        loc = r.get("LocalizedName")
        if loc: items[name] = {"name": english(loc), "base": r.get("BaseItem"), "quest": r.get("QuestItem")}
    put("items", items)
    put("baseitems", {r["_row"]: r["Label"] for r in g.table("baseitems")[1]})
    put("spells", {r["_row"]: {"label": r["Label"], "sign": r["Spell" + "Type"], "level": int(r["SpellLevel"]), "variant": int(r["SpellSubtype"])} for r in g.table("spells")[1]})
    put("marketcat", {r["_row"]: r["Label"] for r in g.table("marketcat")[1]})
    print(f"wrote {len(items)} items to {out}")


if __name__ == "__main__":
    cmd, data = sys.argv[1], sys.argv[2]
    g = Game(data)
    if cmd == "list":
        want = int(sys.argv[3]) if len(sys.argv) > 3 else None
        for (n, t), rid in sorted(g.keys.items()):
            if want is None or t == want: print(n, t, rid)
    elif cmd == "2da":
        cols, rows = g.table(sys.argv[3])
        print("\t".join(["row"] + cols))
        for r in rows: print("\t".join(r.get(c, "") for c in ["_row"] + cols))
    elif cmd == "build":
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        build(g, sys.argv[3])
    elif cmd == "tlk":
        s = tlk(Path(data) / "dialog_3.tlk")
        for a in sys.argv[3:]: print(a, repr(s[int(a)]))
