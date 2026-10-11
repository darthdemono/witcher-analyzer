"""BioWare GFF V3.x reader (the Aurora container The Witcher 1 uses for every resource in a save).

A struct decodes lazily: opening a 3 MB area file costs nothing until a list is walked. The
audit() pass is separate and flat, so "every byte accounted for" is checkable without
materialising two million fields."""
import struct

from .errors import WitcherError

SCALAR = {0: "B", 1: "b", 2: "H", 3: "h", 4: "I", 5: "i", 8: "f"}
BIG = {6: "Q", 7: "q", 9: "d"}
BYTE, CHAR, WORD, SHORT, DWORD, INT, DWORD64, INT64, FLOAT, DOUBLE, STRING, RESREF, LOCSTR, VOID, STRUCT, LIST = range(16)


def text(b):
    return b.decode("utf-8", "replace")


class Gff:
    def __init__(self, b):
        self.b = b
        if len(b) < 56 or b[4:6] != b"V3":
            raise WitcherError("not a GFF V3 resource")
        self.type = b[:4].decode("latin1").rstrip()
        self.version = b[4:8].decode("latin1")
        (self.so, self.sc, self.fo, self.fc, self.lo, self.lc, self.fdo, self.fds,
         self.fio, self.fis, self.lio, self.lis) = struct.unpack_from("<12I", b, 8)
        self.labels = [text(b[self.lo + i * 16:self.lo + i * 16 + 16].rstrip(b"\0")) for i in range(self.lc)]
        self.root = Struct(self, 0)

    def field(self, i):
        b = self.b
        t, label, dv = struct.unpack_from("<III", b, self.fo + i * 12)
        if t in SCALAR:
            v = struct.unpack("<" + SCALAR[t], struct.pack("<I", dv)[:struct.calcsize(SCALAR[t])])[0] if t != FLOAT else struct.unpack("<f", struct.pack("<I", dv))[0]
        elif t in BIG:
            v = struct.unpack_from("<" + BIG[t], b, self.fdo + dv)[0]
        elif t == STRING:
            n, = struct.unpack_from("<I", b, self.fdo + dv)
            v = text(b[self.fdo + dv + 4:self.fdo + dv + 4 + n])
        elif t == RESREF:
            n = b[self.fdo + dv]
            v = text(b[self.fdo + dv + 1:self.fdo + dv + 1 + n])
        elif t == LOCSTR:
            _, sid, cnt = struct.unpack_from("<III", b, self.fdo + dv)
            p, strs = self.fdo + dv + 12, []
            for _ in range(cnt):
                lid, n = struct.unpack_from("<II", b, p)
                strs.append((lid, text(b[p + 8:p + 8 + n])))
                p += 8 + n
            v = {"strref": sid, "strings": strs}
        elif t == VOID:
            n, = struct.unpack_from("<I", b, self.fdo + dv)
            v = b[self.fdo + dv + 4:self.fdo + dv + 4 + n]
        elif t == STRUCT:
            v = Struct(self, dv)
        elif t == LIST:
            n, = struct.unpack_from("<I", b, self.lio + dv)
            v = [Struct(self, x) for x in struct.unpack_from(f"<{n}I", b, self.lio + dv + 4)]
        else:
            raise WitcherError(f"unknown GFF field type {t}")
        return self.labels[label], t, v

    def audit(self):
        """Flat pass over the tables. Returns {'fields', 'structs', 'unreferenced'}; unreferenced is
        the number of bytes in the data tables that no field, struct or list points at."""
        b = self.b
        claimed_data = claimed_fidx = claimed_lidx = 0
        refs = 1
        fields_in_structs = 0
        for sty, dv, fc in struct.iter_unpack("<3I", b[self.so:self.so + self.sc * 12]):
            fields_in_structs += fc
            if fc > 1: claimed_fidx += fc * 4
        for t, label, dv in struct.iter_unpack("<3I", b[self.fo:self.fo + self.fc * 12]):
            if t in BIG: claimed_data += 8
            elif t == STRING: claimed_data += 4 + struct.unpack_from("<I", b, self.fdo + dv)[0]
            elif t == RESREF: claimed_data += 1 + b[self.fdo + dv]
            elif t == LOCSTR: claimed_data += 4 + struct.unpack_from("<I", b, self.fdo + dv)[0]
            elif t == VOID: claimed_data += 4 + struct.unpack_from("<I", b, self.fdo + dv)[0]
            elif t == STRUCT: refs += 1
            elif t == LIST:
                n, = struct.unpack_from("<I", b, self.lio + dv)
                claimed_lidx += 4 + 4 * n
                refs += n
        gaps = (abs(self.fds - claimed_data) + abs(self.fis - claimed_fidx) + abs(self.lis - claimed_lidx)
                + 12 * abs(self.fc - fields_in_structs) + 12 * abs(self.sc - refs))
        return {"fields": self.fc, "structs": self.sc, "unreferenced": gaps}


class Struct:
    __slots__ = ("g", "i", "_f")

    def __init__(self, g, i):
        self.g, self.i, self._f = g, i, None

    @property
    def id(self):
        return struct.unpack_from("<I", self.g.b, self.g.so + self.i * 12)[0]

    @property
    def fields(self):
        """[(label, type, value)] in file order. Duplicate labels are legal and kept."""
        if self._f is None:
            g = self.g
            _, dv, fc = struct.unpack_from("<III", g.b, g.so + self.i * 12)
            if fc == 0: idx = ()
            elif fc == 1: idx = (dv,)
            else: idx = struct.unpack_from(f"<{fc}I", g.b, g.fio + dv)
            self._f = [g.field(x) for x in idx]
        return self._f

    def get(self, name, default=None):
        for n, _, v in self.fields:
            if n == name: return v
        return default

    def all(self, name):
        return [v for n, _, v in self.fields if n == name]

    def has(self, name):
        return any(n == name for n, _, _ in self.fields)
