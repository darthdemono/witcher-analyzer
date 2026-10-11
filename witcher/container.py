"""The Witcher 1 save container.

A save is one file holding a small virtual file system: a fixed header (three UTF-16 name fields
and a 64x64 TGA thumbnail), then the files back to back, then an index naming every file with its
size and offset, then `index offset u32` and `file count u32`.

The files are: a gzip'd BioWare ERF per module (`<module>.sav`, GFF resources inside), the hero as
a GFF creature (`player.utc`), one GFF per quest (`*.qst`), the quest database (`save.qdb`), the map
state (`save_NNNNNN.smm`), a text note (`savenfo.txt`) and the thumbnail (`NNNNNN.tga`)."""
import struct
import zlib

from .errors import WitcherError
from .gff import Gff

MAGIC = b"RGMH"
HEADER_SIZE = 0x2028
NAME_FIELDS = (0x28, 0x828, 0x1028)  # title, area, area again; 2 KB of UTF-16 each
ERF_TYPES = {2009: "NSS", 2010: "NCS", 2012: "ARE", 2014: "IFO", 2023: "GIT"}


def utf16(b):
    return b.decode("utf-16-le", "replace").split("\0")[0]


def read(data):
    """bytes -> dict. Raises WitcherError for anything that is not a readable save."""
    try:
        return _read(data)
    except (struct.error, zlib.error, IndexError, UnicodeDecodeError, ValueError, OverflowError, MemoryError) as e:
        raise WitcherError(f"not a readable Witcher save ({type(e).__name__})") from e


def index_of(data):
    if len(data) < HEADER_SIZE + 16: raise WitcherError("file too short")
    at, count = struct.unpack_from("<II", data, len(data) - 8)
    if not HEADER_SIZE < at < len(data) - 8 or count > 100000: raise WitcherError("no file index at the end")
    files, p = [], at
    for _ in range(count):
        n, = struct.unpack_from("<I", data, p)
        name = data[p + 4:p + 4 + n].decode("latin1")
        size, off = struct.unpack_from("<II", data, p + 4 + n)
        files.append({"path": name, "name": name.replace("\\", "/").rsplit("/", 1)[-1], "size": size, "offset": off})
        p += 4 + n + 8
    if p != len(data) - 8: raise WitcherError("file index does not end where expected")
    return at, files


def erf(raw):
    """gzip'd ERF bytes -> list of {name, type, data}."""
    dec = zlib.decompressobj(31)
    b = dec.decompress(raw)
    if not dec.eof or dec.unused_data: raise WitcherError("module gzip stream is not exactly one member")
    typ, ver, _, _, n, _, okl, orl, _, _, _ = struct.unpack_from("<4s4s9I", b, 0)
    if typ != b"MOD " or ver != b"V1.0": raise WitcherError("module is not an ERF")
    out, covered = [], 160 + n * 32
    for i in range(n):
        name, _, rt, _ = struct.unpack_from("<16sIHH", b, okl + i * 24)
        off, size = struct.unpack_from("<II", b, orl + i * 8)
        if rt == 0xFFFF and size == 0xBAADF00D: continue  # a placeholder entry the writer left behind: no name, no data
        out.append({"name": name.rstrip(b"\0").decode("latin1"), "type": ERF_TYPES.get(rt, str(rt)), "data": b[off:off + size]})
        covered += size
    return out, len(b) - covered


def _read(data):
    if data[:4] != MAGIC: raise WitcherError("not a Witcher save: missing RGMH header")
    ver, hsize = struct.unpack_from("<II", data, 4)
    if hsize != HEADER_SIZE: raise WitcherError(f"unexpected header size {hsize}")
    at, files = index_of(data)

    claimed = HEADER_SIZE + (len(data) - at)  # header + index + the 8 closing bytes
    unreferenced, expect = 0, HEADER_SIZE
    for f in sorted(files, key=lambda f: f["offset"]):
        if f["offset"] != expect: unreferenced += abs(f["offset"] - expect)
        expect = f["offset"] + f["size"]
        claimed += f["size"]
    unreferenced += abs(at - expect)

    save = {"header": {"version": ver, "title": utf16(data[0x28:0x828]), "area": utf16(data[0x828:0x1028]),
                       "area2": utf16(data[0x1028:0x1828]), "guid": data[0x18:0x28].hex()},
            "files": [], "modules": [], "quests": [], "hero": None, "qdb": None, "smm": None, "note": "", "thumb": None,
            "saveName": files[0]["path"].replace("\\", "/").split("/")[0] if files else ""}
    audit = {"fileBytes": len(data), "gapBytes": unreferenced, "gffUnreferenced": 0, "erfGap": 0, "gffs": 0}
    known = [(0, 8), (8, 12), (0x18, 0x28)] + [(o, o + 0x800) for o in NAME_FIELDS] + [(0x2028, HEADER_SIZE)]
    audit["headerUndecoded"] = sum(1 for i in range(HEADER_SIZE) if data[i] and not any(a <= i < b for a, b in known))

    def gff(raw):
        g = Gff(raw)
        a = g.audit()
        audit["gffUnreferenced"] += a["unreferenced"]
        audit["gffs"] += 1
        return g

    for f in files:
        raw = data[f["offset"]:f["offset"] + f["size"]]
        ext = f["name"].rsplit(".", 1)[-1].lower()
        save["files"].append({"name": f["name"], "size": f["size"]})
        if ext == "tga":
            w, h, bpp = struct.unpack_from("<HHB", raw, 12)
            save["thumb"] = {"width": w, "height": h, "bpp": bpp, "pixels": raw[18:]}
        elif ext == "sav":
            res, gap = erf(raw)
            audit["erfGap"] += gap
            mod = {"name": f["name"][:-4], "areas": {}, "ifo": None, "scripts": 0}
            for r in res:
                if r["type"] in ("GIT", "ARE"): mod["areas"].setdefault(r["name"], {})[r["type"]] = gff(r["data"])
                elif r["type"] == "IFO": mod["ifo"] = gff(r["data"])
                else: mod["scripts"] += 1
            save["modules"].append(mod)
        elif ext == "utc": save["hero"] = gff(raw)
        elif ext == "qst": save["quests"].append({"id": f["name"][:-4], "gff": gff(raw)})
        elif ext == "qdb": save["qdb"] = gff(raw)
        elif ext == "smm": save["smm"] = gff(raw)
        elif ext == "txt": save["note"] = raw.decode("utf-8", "replace")
        else: raise WitcherError(f"unknown file in save: {f['name']}")
    save["audit"] = audit
    return save
