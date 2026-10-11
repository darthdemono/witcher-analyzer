// The correctness gate for the web port: the Python and JavaScript readers run over the same saves and must
// agree on the summary JSON (values and key order), the Markdown (byte for byte) and the combined document.
//   node tools/parity.mjs <folder-or-save>...
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { read } from "../app/container.js";
import { summarize } from "../app/tw1.js";
import { md } from "../app/render.js";
import { combined } from "../app/combine.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = Object.fromEntries(["items", "baseitems", "spells", "marketcat"].map((n) => [n, JSON.parse(fs.readFileSync(path.join(root, "db_tw1", `${n}.json`), "utf8"))]));
const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).sort().flatMap((f) => walk(path.join(p, f))) : p.endsWith(".TheWitcherSave") ? [p] : []);
const files = process.argv.slice(2).flatMap(walk);

function diff(a, b, p = "") {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return `${p}: ${JSON.stringify(a)?.slice(0, 60)} vs ${JSON.stringify(b)?.slice(0, 60)}`;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (Array.isArray(a) !== Array.isArray(b) || ka.length !== kb.length) return `${p}: length/shape ${ka.length} vs ${kb.length}`;
  for (const k of ka) { if (!(k in b)) return `${p}/${k}: missing in JS`; const d = diff(a[k], b[k], `${p}/${k}`); if (d) return d; }
  if (!Array.isArray(a) && ka.join("\u0000") !== kb.join("\u0000")) return `${p}: key order differs`;
  return null;
}

let bad = 0;
const entries = [];
for (const f of files) {
  const name = path.basename(f);
  let py = null, js = null;
  try { py = JSON.parse(execFileSync("python3", [path.join(root, "tools/dump.py"), f], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] })); } catch {}
  try { const s = summarize(await read(new Uint8Array(fs.readFileSync(f))), db); js = { summary: JSON.parse(JSON.stringify(s)), md: md(s, name) }; } catch (e) { js = null; }
  if (!py !== !js) { console.log(`FAIL ${name}: only one side could read it`); bad++; continue; }
  if (!py) { console.log(`skip ${name} (not a Witcher save, both agree)`); entries.push({ summary: null, name, size: fs.statSync(f).size, mtime: Math.floor(fs.statSync(f).mtimeMs / 1000) }); continue; }
  const d = diff(py.summary, js.summary);
  if (d || py.md !== js.md) { bad++; console.log(`FAIL ${name}: ${d || "markdown differs"}`); } else console.log(`ok   ${name}`);
  entries.push({ summary: js.summary, name, size: fs.statSync(f).size, mtime: Math.floor(fs.statSync(f).mtimeMs / 1000) });
}
if (files.length > 1) {
  const pyDoc = execFileSync("python3", [path.join(root, "witcher_to_md.py"), ...process.argv.slice(2)], { maxBuffer: 1 << 30 }).toString();
  const jsDoc = combined(entries);
  if (pyDoc === jsDoc) console.log("ok   combined document");
  else { bad++; const a = pyDoc.split("\n"), b = jsDoc.split("\n"); const i = a.findIndex((l, k) => l !== b[k]); console.log(`FAIL combined at line ${i + 1}:\n  py: ${a[i]}\n  js: ${b[i]}`); }
}
console.log(bad ? `${bad} FAILED` : "all parity checks passed");
process.exit(bad ? 1 : 0);
