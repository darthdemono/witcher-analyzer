// The Witcher 1 save container: a port of witcher/container.py.
import { Gff, WitcherError } from "./gff.js";

export { WitcherError };
const HEADER_SIZE = 0x2028;
const NAME_FIELDS = [0x28, 0x828, 0x1028];
const ERF_TYPES = { 2009: "NSS", 2010: "NCS", 2012: "ARE", 2014: "IFO", 2023: "GIT" };
const latin1 = new TextDecoder("latin1");
const utf16d = new TextDecoder("utf-16le");

const utf16 = (b) => { const s = utf16d.decode(b); const z = s.indexOf("\0"); return z < 0 ? s : s.slice(0, z); };

async function gunzip(bytes) {
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function erf(raw) {
  const b = await gunzip(raw), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (latin1.decode(b.subarray(0, 4)) !== "MOD " || latin1.decode(b.subarray(4, 8)) !== "V1.0") throw new WitcherError("module is not an ERF");
  const n = v.getUint32(16, true), okl = v.getUint32(24, true), orl = v.getUint32(28, true);
  const out = [];
  let covered = 160 + n * 32;
  for (let i = 0; i < n; i++) {
    const kp = okl + i * 24, rt = v.getUint16(kp + 20, true);
    let nm = b.subarray(kp, kp + 16), e = 16;
    while (e > 0 && nm[e - 1] === 0) e--;
    const off = v.getUint32(orl + i * 8, true), size = v.getUint32(orl + i * 8 + 4, true);
    if (rt === 0xffff && size === 0xbaadf00d) continue; // a placeholder entry the writer left behind: no name, no data
    out.push({ name: latin1.decode(nm.subarray(0, e)), type: ERF_TYPES[rt] || String(rt), data: b.subarray(off, off + size) });
    covered += size;
  }
  return [out, b.length - covered];
}

/** bytes -> save. Rejects with WitcherError for anything that is not a readable save. */
export async function read(data) {
  try { return await readSave(data); } catch (e) {
    if (e instanceof WitcherError) throw e;
    throw new WitcherError(`not a readable Witcher save (${e && e.name})`);
  }
}

async function readSave(data) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < HEADER_SIZE + 16 || latin1.decode(data.subarray(0, 4)) !== "RGMH") throw new WitcherError("not a Witcher save: missing RGMH header");
  if (v.getUint32(8, true) !== HEADER_SIZE) throw new WitcherError("unexpected header size");
  const at = v.getUint32(data.length - 8, true), count = v.getUint32(data.length - 4, true);
  if (!(HEADER_SIZE < at && at < data.length - 8) || count > 100000) throw new WitcherError("no file index at the end");
  const files = [];
  let p = at;
  for (let i = 0; i < count; i++) {
    const n = v.getUint32(p, true), path = latin1.decode(data.subarray(p + 4, p + 4 + n));
    files.push({ path, name: path.replaceAll("\\", "/").split("/").pop(), size: v.getUint32(p + 4 + n, true), offset: v.getUint32(p + 8 + n, true) });
    p += 12 + n;
  }
  if (p !== data.length - 8) throw new WitcherError("file index does not end where expected");

  let unreferenced = 0, expect = HEADER_SIZE;
  for (const f of [...files].sort((a, b) => a.offset - b.offset)) {
    if (f.offset !== expect) unreferenced += Math.abs(f.offset - expect);
    expect = f.offset + f.size;
  }
  unreferenced += Math.abs(at - expect);

  const save = {
    header: { version: v.getUint32(4, true), title: utf16(data.subarray(0x28, 0x828)), area: utf16(data.subarray(0x828, 0x1028)), area2: utf16(data.subarray(0x1028, 0x1828)) },
    files: [], modules: [], quests: [], hero: null, qdb: null, smm: null, note: "", thumb: null,
    saveName: files.length ? files[0].path.replaceAll("\\", "/").split("/")[0] : "",
  };
  const audit = { fileBytes: data.length, gapBytes: unreferenced, gffUnreferenced: 0, erfGap: 0, gffs: 0, headerUndecoded: 0 };
  const known = [[0, 8], [8, 12], [0x18, 0x28], ...NAME_FIELDS.map((o) => [o, o + 0x800]), [0x2028, HEADER_SIZE]];
  for (let i = 0; i < HEADER_SIZE; i++) if (data[i] && !known.some(([a, b]) => a <= i && i < b)) audit.headerUndecoded++;

  const gff = (raw) => { const g = new Gff(raw); audit.gffUnreferenced += g.audit().unreferenced; audit.gffs++; return g; };
  for (const f of files) {
    const raw = data.subarray(f.offset, f.offset + f.size);
    const ext = f.name.split(".").pop().toLowerCase();
    save.files.push({ name: f.name, size: f.size });
    if (ext === "tga") {
      const d = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      save.thumb = { width: d.getUint16(12, true), height: d.getUint16(14, true), bpp: raw[16], pixels: raw.subarray(18) };
    } else if (ext === "sav") {
      const [res, gap] = await erf(raw);
      audit.erfGap += gap;
      const mod = { name: f.name.slice(0, -4), areas: {}, ifo: null, scripts: 0 };
      for (const r of res) {
        if (r.type === "GIT" || r.type === "ARE") (mod.areas[r.name] ??= {})[r.type] = gff(r.data);
        else if (r.type === "IFO") mod.ifo = gff(r.data);
        else mod.scripts++;
      }
      save.modules.push(mod);
    } else if (ext === "utc") save.hero = gff(raw);
    else if (ext === "qst") save.quests.push({ id: f.name.slice(0, -4), gff: gff(raw) });
    else if (ext === "qdb") save.qdb = gff(raw);
    else if (ext === "smm") save.smm = gff(raw);
    else if (ext === "txt") save.note = new TextDecoder("utf-8").decode(raw);
    else throw new WitcherError(`unknown file in save: ${f.name}`);
  }
  save.audit = audit;
  return save;
}
