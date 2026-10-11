// BioWare GFF V3.x reader. A port of witcher/gff.py: structs decode lazily, audit() is a flat pass.
export class WitcherError extends Error {}

const td = new TextDecoder("utf-8");
const text = (b) => td.decode(b);
const BYTE = 0, CHAR = 1, WORD = 2, SHORT = 3, DWORD = 4, INT = 5, DWORD64 = 6, INT64 = 7, FLOAT = 8, DOUBLE = 9, STRING = 10, RESREF = 11, LOCSTR = 12, VOID = 13, STRUCT = 14, LIST = 15;

const safe = (x) => (x >= -9007199254740991n && x <= 9007199254740991n ? Number(x) : x.toString());

export class Gff {
  constructor(b) {
    this.b = b;
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length < 56 || b[4] !== 0x56 || b[5] !== 0x33) throw new WitcherError("not a GFF V3 resource");
    this.type = text(b.subarray(0, 4)).trimEnd();
    this.version = text(b.subarray(4, 8));
    const u = (i) => this.v.getUint32(8 + i * 4, true);
    [this.so, this.sc, this.fo, this.fc, this.lo, this.lc, this.fdo, this.fds, this.fio, this.fis, this.lio, this.lis] = Array.from({ length: 12 }, (_, i) => u(i));
    this.labels = Array.from({ length: this.lc }, (_, i) => {
      let s = b.subarray(this.lo + i * 16, this.lo + i * 16 + 16), e = s.length;
      while (e > 0 && s[e - 1] === 0) e--;
      return text(s.subarray(0, e));
    });
    this.root = new Struct(this, 0);
  }

  field(i) {
    const v = this.v, b = this.b, p = this.fo + i * 12;
    const t = v.getUint32(p, true), label = v.getUint32(p + 4, true), dv = v.getUint32(p + 8, true);
    let val;
    const at = this.fdo + dv;
    switch (t) {
      case BYTE: val = dv & 0xff; break;
      case CHAR: val = (dv & 0xff) << 24 >> 24; break;
      case WORD: val = dv & 0xffff; break;
      case SHORT: val = (dv & 0xffff) << 16 >> 16; break;
      case DWORD: val = dv; break;
      case INT: val = dv | 0; break;
      case FLOAT: { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, dv, true); val = d.getFloat32(0, true); break; }
      case DWORD64: val = safe(v.getBigUint64(at, true)); break;
      case INT64: val = safe(v.getBigInt64(at, true)); break;
      case DOUBLE: val = v.getFloat64(at, true); break;
      case STRING: { const n = v.getUint32(at, true); val = text(b.subarray(at + 4, at + 4 + n)); break; }
      case RESREF: { const n = b[at]; val = text(b.subarray(at + 1, at + 1 + n)); break; }
      case LOCSTR: {
        const cnt = v.getUint32(at + 8, true), strs = [];
        let q = at + 12;
        for (let k = 0; k < cnt; k++) { const lid = v.getUint32(q, true), n = v.getUint32(q + 4, true); strs.push([lid, text(b.subarray(q + 8, q + 8 + n))]); q += 8 + n; }
        val = { strref: v.getUint32(at + 4, true), strings: strs };
        break;
      }
      case VOID: { const n = v.getUint32(at, true); val = b.subarray(at + 4, at + 4 + n); break; }
      case STRUCT: val = new Struct(this, dv); break;
      case LIST: {
        const n = v.getUint32(this.lio + dv, true);
        val = Array.from({ length: n }, (_, k) => new Struct(this, v.getUint32(this.lio + dv + 4 + k * 4, true)));
        break;
      }
      default: throw new WitcherError(`unknown GFF field type ${t}`);
    }
    return [this.labels[label], t, val];
  }

  audit() {
    const v = this.v;
    let claimedData = 0, claimedFidx = 0, claimedLidx = 0, refs = 1, fieldsInStructs = 0;
    for (let i = 0; i < this.sc; i++) {
      const fc = v.getUint32(this.so + i * 12 + 8, true);
      fieldsInStructs += fc;
      if (fc > 1) claimedFidx += fc * 4;
    }
    for (let i = 0; i < this.fc; i++) {
      const p = this.fo + i * 12, t = v.getUint32(p, true), dv = v.getUint32(p + 8, true), at = this.fdo + dv;
      if (t === DWORD64 || t === INT64 || t === DOUBLE) claimedData += 8;
      else if (t === STRING || t === LOCSTR || t === VOID) claimedData += 4 + v.getUint32(at, true);
      else if (t === RESREF) claimedData += 1 + this.b[at];
      else if (t === STRUCT) refs += 1;
      else if (t === LIST) { const n = v.getUint32(this.lio + dv, true); claimedLidx += 4 + 4 * n; refs += n; }
    }
    return { fields: this.fc, structs: this.sc, unreferenced: Math.abs(this.fds - claimedData) + Math.abs(this.fis - claimedFidx) + Math.abs(this.lis - claimedLidx) + 12 * Math.abs(this.fc - fieldsInStructs) + 12 * Math.abs(this.sc - refs) };
  }
}

export class Struct {
  constructor(g, i) { this.g = g; this.i = i; this._f = null; }
  get id() { return this.g.v.getUint32(this.g.so + this.i * 12, true); }
  get fields() {
    if (this._f === null) {
      const g = this.g, p = g.so + this.i * 12;
      const dv = g.v.getUint32(p + 4, true), fc = g.v.getUint32(p + 8, true);
      const idx = fc === 0 ? [] : fc === 1 ? [dv] : Array.from({ length: fc }, (_, k) => g.v.getUint32(g.fio + dv + k * 4, true));
      this._f = idx.map((x) => g.field(x));
    }
    return this._f;
  }
  get(name, dflt = null) {
    for (const [n, , v] of this.fields) if (n === name) return v;
    return dflt;
  }
  has(name) { return this.fields.some(([n]) => n === name); }
}
