// A folder of saves -> one history. A port of witcher/combine.py.
import { md, n, table } from "./render.js";

const SUFFIX = ".TheWitcherSave";
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const slotKey = (m) => (m.meta.slot !== null ? m.meta.slot : -1);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const when = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");
const order = (a, b) => a.mtime - b.mtime || slotKey(a) - slotKey(b) || cmp(a.file, b.file);
const byName = (f) => (f.endsWith(SUFFIX) ? f.slice(0, -SUFFIX.length) : f);

function progress(m) {
  const h = m.hero, s = new Set();
  for (const x of m.quests.list) if (x.state !== "not started") s.add(`${x.state}:${x.id}`);
  for (const a of h.abilities) s.add("ability:" + a.name + a.stack);
  for (const b of h.books) s.add("book:" + b);
  for (const r of h.recipes) s.add("recipe:" + r.template);
  for (const i of h.identified) s.add("seen:" + i);
  return s;
}

const signature = (m) => JSON.stringify([m.meta.area, m.hero.level, m.hero.experience, m.hero.gold, m.quests.states.completed ?? 0, m.quests.states.active ?? 0, m.quests.states.failed ?? 0,
  m.hero.abilities.length, m.hero.recipes.length, sum(m.hero.inventory.map((i) => i.count)), m.hero.books.length]);

const subset = (a, b) => [...a].every((x) => b.has(x));

function branches(snaps) {
  const prog = snaps.map(progress);
  const par = snaps.map((_, i) => { for (let j = i - 1; j >= 0; j--) if (subset(prog[j], prog[i])) return j; return null; });
  const kids = new Map();
  par.forEach((p, i) => { if (p !== null) kids.set(p, [...(kids.get(p) || []), i]); });
  const nodes = [], cur = {};
  par.forEach((p, i) => {
    if (p !== null && kids.get(p).length === 1 && p in cur) { cur[i] = cur[p]; nodes[cur[i]].push(i); }
    else { cur[i] = nodes.length; nodes.push([i]); }
  });
  const seen = new Set(), edges = [];
  par.forEach((p, i) => { if (p !== null && cur[p] !== cur[i]) { const e = `${cur[p]},${cur[i]}`; if (!seen.has(e)) { seen.add(e); edges.push([cur[p], cur[i]]); } } });
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return [nodes, edges];
}

function firstSeen(snaps, getter) {
  const seen = new Map();
  for (const m of snaps) for (const x of getter(m)) if (!seen.has(x)) seen.set(x, m);
  return seen;
}

function grouped(seen, label) {
  const by = new Map();
  for (const [x, m] of seen) { const k = `${String(m.mtime).padStart(12, "0")}|${String(slotKey(m) + 1).padStart(10, "0")}|${m.file}`; if (!by.has(k)) by.set(k, [m, []]); by.get(k)[1].push(x); }
  const L = [];
  for (const k of [...by.keys()].sort()) {
    const [m, xs] = by.get(k);
    L.push(`#### ${when(m.mtime)}, slot ${slotKey(m)}: ${byName(m.file)}`, "", ...xs.sort().map((x) => `- ${x}`), "");
  }
  return L.length ? L : [`_no ${label}_`, ""];
}

function chart(snaps) {
  const lab = snaps.map((m) => when(m.mtime).slice(5, 10));
  const series = (name, vals) => ["```mermaid", "xychart-beta", `  title "${name}"`, "  x-axis [" + lab.map((x) => `"${x}"`).join(", ") + "]", `  y-axis "${name}" 0 --> ${Math.max(...vals) || 1}`, "  line [" + vals.join(", ") + "]", "```", ""];
  return [...series("Level", snaps.map((m) => m.hero.level)), ...series("Gold (orens)", snaps.map((m) => m.hero.gold)),
    ...series("Quests completed", snaps.map((m) => m.quests.states.completed ?? 0)), ...series("Abilities", snaps.map((m) => m.hero.abilities.length))];
}

/** @param {{summary:object|null,name:string,size:number,mtime:number}[]} entries mtime in whole seconds */
export function combined(entries) {
  const skipped = entries.filter((e) => !e.summary).map((e) => e.name);
  const snaps = entries.filter((e) => e.summary).map((e) => ({ ...e.summary, file: e.name, bytes: e.size, mtime: e.mtime }));
  if (!snaps.length) throw new Error("no readable Witcher saves found");
  snaps.sort(order);
  const newest = snaps[snaps.length - 1];
  const L = ["# The Witcher: Combined Playthrough Timeline", "",
    `_Reconstructed from ${n(snaps.length)} saves. A date is the file time of the FIRST save in which something appears: an upper bound on when it happened, never a lower one. The saves carry no play-time clock, so the order comes from each file's modified time, then its slot number._`, "",
    `_Span: ${when(snaps[0].mtime)} to ${when(newest.mtime)} UTC. Newest save: ${newest.file}._`, "", "---", "",
    `# Part 1: Current State (${when(newest.mtime)} UTC, slot ${newest.meta.slot})`, "", md(newest, newest.file, "##").split("\n").slice(2).join("\n"), "", "---", "", "# Part 2: Timeline", "",
    "## Branches", "", "_Saves in time order look like one line, but loading an older save and playing on forks the run. A save's parent is the latest earlier one whose progress (quests, abilities, recipes, books) it still contains._", ""];
  const [nodes, edges] = branches(snaps);
  L.push("```mermaid", "flowchart TD");
  nodes.forEach((ch, i) => {
    const a = snaps[ch[0]], z = snaps[ch[ch.length - 1]];
    const span = when(a.mtime) + (a !== z ? ` to ${when(z.mtime)}` : "");
    L.push(`  n${i}["${span}<br/>${ch.length} save${ch.length !== 1 ? "s" : ""} · level ${z.hero.level}<br/>${z.quests.states.completed ?? 0} quests done"]`);
  });
  L.push(...edges.map(([a, b]) => `  n${a} --> n${b}`), "```", "");
  L.push("## Journey", "", ...chart(snaps));
  L.push("## Saves", "", "_Runs of consecutive saves where nothing tracked moved are collapsed to one row._", "");
  const rows = [];
  let prev = null;
  for (const m of snaps) { const s = signature(m); if (s === prev) rows[rows.length - 1].push(m); else { rows.push([m]); prev = s; } }
  const out = rows.map((ms) => {
    const m = ms[0], h = m.hero, q = m.quests.states;
    const saved = when(m.mtime) + (ms.length > 1 ? ` to ${when(ms[ms.length - 1].mtime)} (${ms.length} saves, no change)` : "");
    return [saved, m.meta.slot, m.meta.area, h.level, h.experience, h.gold, q.completed ?? 0, q.active ?? 0, q.failed ?? 0, h.abilities.length, h.recipes.length, sum(h.inventory.map((i) => i.count))];
  });
  L.push(...table(["Saved (UTC)", "Slot", "Area", "Level", "Experience", "Gold", "Done", "Active", "Failed", "Abilities", "Recipes", "Items"], out), "");
  const qt = (pred) => (m) => m.quests.list.filter(pred).map((x) => `${x.title} (${x.act})`);
  L.push("## Quests: first begun", "", ...grouped(firstSeen(snaps, qt((x) => x.state !== "not started")), "quests"));
  L.push("## Quests: first completed", "", ...grouped(firstSeen(snaps, qt((x) => x.state === "completed")), "completed quests"));
  L.push("## Quests: first failed", "", ...grouped(firstSeen(snaps, qt((x) => x.state === "failed")), "failed quests"));
  L.push("## Abilities: first learned", "", ...grouped(firstSeen(snaps, (m) => m.hero.abilities.map((a) => a.name)), "abilities"));
  L.push("## Alchemy recipes: first learned", "", ...grouped(firstSeen(snaps, (m) => m.hero.recipes.map((r) => r.name)), "recipes"));
  L.push("## Books: first read", "", ...grouped(firstSeen(snaps, (m) => m.hero.books), "books"));
  L.push("## Areas: first loaded", "", ...grouped(firstSeen(snaps, (m) => m.world.flatMap((mod) => mod.areas.map((a) => `${a.name || a.resref} (${mod.module})`))), "areas"));
  L.push("## Monsters: first kill of each kind", "", ...grouped(firstSeen(snaps, (m) => Object.keys(m.hero.kills.byKind)), "kills"));
  L.push("---", "", "## Reference list", "");
  snaps.forEach((m, i) => L.push(`${i + 1}. \`${m.file}\`: ${when(m.mtime)} UTC, slot ${m.meta.slot}, level ${m.hero.level}, ${n(m.bytes)} bytes`));
  if (skipped.length) L.push("", "_Skipped (not readable as Witcher saves):_ " + skipped.map((f) => `\`${f}\``).join(", "));
  return L.join("\n") + "\n";
}
