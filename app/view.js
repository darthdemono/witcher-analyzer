// The single-save report as DOM. Built with textContent only, never innerHTML.
import { n } from "./render.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sumv = (d) => Object.values(d).reduce((a, b) => a + b, 0);

function tiles(items) {
  const w = el("div", "tiles");
  for (const [label, value] of items) { const t = el("div", "tile"); t.append(el("b", null, value), el("span", null, label)); w.append(t); }
  return w;
}
function kv(rows) { const dl = el("dl", "kv"); for (const [k, v] of rows) dl.append(el("dt", null, k), el("dd", null, v)); return dl; }
function table(head, rows) {
  const t = el("table"), tr = el("tr");
  head.forEach((h) => tr.append(el("th", null, h)));
  const thead = el("thead"); thead.append(tr); t.append(thead);
  const tb = el("tbody");
  for (const r of rows) { const row = el("tr"); r.forEach((c) => row.append(el("td", typeof c === "number" ? "n" : null, n(c)))); tb.append(row); }
  t.append(tb);
  return t;
}
function fold(title, body, open = false) { const d = el("details"); d.open = open; d.append(el("summary", null, title), body); return d; }
function chips(list, on = false) { const w = el("div", "chips"); for (const x of list) w.append(el("span", on ? "chip on" : "chip", x)); return w; }
function bars(d) {
  const w = el("div", "bars"), max = Math.max(...Object.values(d), 1);
  for (const [k, v] of Object.entries(d)) { const b = el("div", "bar"), i = el("i"); i.style.width = `${(100 * v) / max}%`; b.append(el("span", null, k), i, el("em", null, n(v))); w.append(b); }
  return w;
}
const plate = (title, ...kids) => { const p = el("section", "plate"); p.append(el("h2", null, title), ...kids); return p; };
const counted = (d, a = "Item", b = "×") => table([a, b], Object.entries(d));

/** The 64x64 TGA thumbnail: BGR, rows bottom to top. */
export function thumbCanvas(t) {
  const c = document.createElement("canvas");
  c.width = t.width; c.height = t.height; c.className = "thumb";
  const ctx = c.getContext("2d"), img = ctx.createImageData(t.width, t.height), bytes = t.bpp / 8;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
    const s = ((t.height - 1 - y) * t.width + x) * bytes, d = (y * t.width + x) * 4;
    img.data[d] = t.pixels[s + 2]; img.data[d + 1] = t.pixels[s + 1]; img.data[d + 2] = t.pixels[s]; img.data[d + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function renderSave(m, file, thumb) {
  const me = m.meta, hero = m.hero, q = m.quests, st = m.story, ig = m.integrity;
  const root = el("div", "sat");
  const head = el("div", "head-row");
  if (thumb) head.append(thumbCanvas(thumb));
  const titles = el("div");
  titles.append(el("h1", null, me.saveName), el("span", "sub", `${file} · area ${me.area} · ${n(me.bytes)} bytes`));
  head.append(titles);
  root.append(head);
  const total = hero.inventory.reduce((a, i) => a + i.count, 0);
  root.append(tiles([["Level", n(hero.level)], ["Experience", n(hero.experience)], ["Gold", n(hero.gold)], ["Quests done", n(q.states.completed ?? 0)], ["Quests active", n(q.states.active ?? 0)],
    ["Abilities", n(hero.abilities.length)], ["Recipes", n(hero.recipes.length)], ["Items", n(total)]]));

  const t = hero.talentPoints;
  root.append(plate(hero.name || "Hero", kv([
    ["Hit points", n(hero.hitPoints)], ["Endurance", n(hero.endurance)], ["Toxicity", `${n(hero.toxicity)} of ${n(hero.toxicityCap)}`],
    ["Talent points", `bronze ${n(t.bronze)}, silver ${n(t.silver)}, gold ${n(t.gold)} (quest: ${n(t.questBronze)}, ${n(t.questSilver)}, ${n(t.questGold)})`],
    ["Signs", Object.entries(hero.signs).map(([k, v]) => `${k} ${v}`).join(", ") || "none"], ["Selected sign", hero.activeSign || "none"],
    ["Position", `${hero.position.map(n).join(", ")} in area ${hero.areaTag}`], ["Difficulty setting", n(me.difficulty)], ["Modules", me.modules.join(", ")]])));

  const inv = [fold("Equipment", hero.equipment.length ? table(["Item", "Kind"], hero.equipment.map((i) => [i.name, i.kind])) : el("p", "sub", "nothing equipped"), true)];
  const groups = {};
  for (const i of hero.inventory) { const g = i.market || "Other"; (groups[g] ??= {}); groups[g][i.name] = (groups[g][i.name] ?? 0) + i.count; }
  for (const g of Object.keys(groups).sort()) inv.push(fold(`${g} (${n(sumv(groups[g]))})`, counted(Object.fromEntries(Object.entries(groups[g]).sort((a, b) => b[1] - a[1])))));
  root.append(plate(`Inventory (${n(total)} items)`, ...inv));

  const ab = [chips(hero.abilities.map((a) => a.name), true)];
  if (hero.styles.length) ab.push(table(["Style", "Weapon", "Attacks"], hero.styles.map((s) => [s.id, s.weapon, s.attacks])));
  root.append(plate(`Abilities (${n(hero.abilities.length)})`, ...ab));

  root.append(plate("Alchemy", kv([["Substances identified", n(hero.identified.length)], ["Recipes known", n(hero.recipes.length)]]),
    ...(hero.identified.length ? [fold("Substances", chips(hero.identified))] : []),
    ...(hero.recipes.length ? [fold("Recipes", table(["Recipe", "Base", "Ingredients"], hero.recipes.map((r) => [r.name, r.base || "", Object.entries(r.ingredients).map(([k, v]) => `${k} ${v}`).join(", ")])))] : []),
    ...(hero.books.length ? [fold(`Books and scrolls read (${n(hero.books.length)})`, chips(hero.books))] : [])));

  const k = hero.kills;
  root.append(plate(`Kills (${n(k.total)})`, Object.keys(k.byKind).length ? table(["Kind", "Count"], Object.entries(k.byKind).slice(0, 25)) : el("p", "sub", "none")));

  const qrows = [bars(Object.fromEntries(Object.entries(q.states))), table(["Part", "Completed", "Active", "Failed", "Not started"], Object.entries(q.byAct).map(([a, c]) => [a, c.completed ?? 0, c.active ?? 0, c.failed ?? 0, c["not started"] ?? 0]))];
  const active = q.list.filter((x) => x.state === "active");
  if (active.length) qrows.push(fold(`Active (${n(active.length)})`, table(["Quest", "Part", "Phase", "Hint"], active.map((x) => [x.title, x.act, x.phase || "", x.hint || ""])), true));
  for (const [s, title] of [["failed", "Failed"], ["completed", "Completed"]]) {
    const rows = q.list.filter((x) => x.state === s);
    if (rows.length) qrows.push(fold(`${title} (${n(rows.length)})`, table(["Quest", "Part"], rows.map((x) => [x.title, x.act]))));
  }
  root.append(plate("Quests", el("p", "sub", `${n(q.total)} quests in the journal database. Journal pages read: ${n(q.journalRead)} of ${n(q.journalEntries)}.`), ...qrows));

  root.append(plate("Story", kv([["Story phases recorded", n(st.phases)], ["NPCs tracked", n(st.npcs)], ["Dialog flags", n(st.dialogFlags)], ["Stores", n(st.stores)], ["Map regions", n(st.mapRegions)], ["Modules visited", st.modulesVisited.join(", ")]]),
    ...(Object.keys(m.variables.questFlags).length ? [fold(`Quest variables (${n(Object.keys(m.variables.questFlags).length)} of ${n(m.variables.total)} script variables)`, table(["Variable", "Value"], Object.entries(m.variables.questFlags)))] : [])));

  root.append(plate("World", ...m.world.map((mod) => fold(`Module ${mod.module} (${mod.areas.length} areas)`, table(["Area", "Creatures", "Placeables", "Doors", "Waypoints", "Monsters", "Killed", "Loot"],
    mod.areas.map((a) => [`${a.name || a.resref} (${a.resref})`, a.creatures, a.placeables, a.doors, a.waypoints, a.monsters, a.monstersKilled, a.containerItems]))))));

  const ok = !ig.undecodedBytes;
  const foot = el("p", "integrity");
  foot.append("Read integrity: ", el("b", ok ? "" : "bad", ok ? "complete" : "gaps"), ` — ${n(ig.files)} files, ${n(ig.gffResources)} resources, ${n(ig.undecodedBytes)} undecoded bytes, ${n(ig.unreferencedBytes)} bytes of leftover table space nothing points at.`);
  root.append(foot);
  return root;
}
