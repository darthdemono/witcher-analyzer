// summary -> Markdown. A port of witcher/render.py, byte for byte.
const NOTE = "_Made by witcher-analyzer. Figures worked out from the save rather than stored in it say so where they appear._";

const grp = (x) => (x === 0 ? 0 : x).toLocaleString("en-US", { maximumFractionDigits: 0, useGrouping: true });

/** Whole numbers print whole, whether the source held 5 or 5.0. */
export function n(v) {
  if (typeof v === "number") return Number.isInteger(v) ? grp(v) : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (v === null || v === undefined) return "None";
  return String(v);
}

export const table = (head, rows) => ["| " + head.join(" | ") + " |", "|" + "---|".repeat(head.length), ...rows.map((r) => "| " + r.map(n).join(" | ") + " |")];
const cell = (s) => String(s).replaceAll("|", "/").replaceAll("\n", " ");
const byCount = (c) => Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const sumv = (d) => Object.values(d).reduce((a, b) => a + b, 0);

export function md(m, source = null, heading = "#") {
  const me = m.meta, hero = m.hero, q = m.quests, st = m.story, v = m.variables, ig = m.integrity;
  const h2 = heading + "#", h3 = heading + "##";
  const L = [`${heading} The Witcher save: ${me.saveName}`, ""];
  if (source) L.push(`_Source: \`${source}\`_`, "");
  L.push(NOTE, "");
  L.push(`- **Area:** ${me.area}`, `- **Header title:** ${me.title}`, `- **Difficulty setting:** ${n(me.difficulty)}`, `- **Modules loaded:** ${me.modules.join(", ")}`,
    `- **Files in the save:** ${n(me.files)}, ${n(me.bytes)} bytes`, "");
  L.push(`- **Read integrity:** ${n(ig.files)} files, ${n(ig.gffResources)} resources, ${n(ig.undecodedBytes)} undecoded bytes, ${n(ig.unreferencedBytes)} bytes of leftover table space that nothing points at`, "");

  const t = hero.talentPoints;
  L.push(`${h2} ${hero.name || "Hero"}`, "",
    `- **Level:** ${n(hero.level)}  ·  **Experience:** ${n(hero.experience)}  ·  **Gold:** ${n(hero.gold)} orens`,
    `- **Hit points:** ${n(hero.hitPoints)}  ·  **Endurance:** ${n(hero.endurance)}  ·  **Toxicity:** ${n(hero.toxicity)} of ${n(hero.toxicityCap)}`,
    `- **Talent points unspent:** bronze ${n(t.bronze)}, silver ${n(t.silver)}, gold ${n(t.gold)}  ·  quest talents: bronze ${n(t.questBronze)}, silver ${n(t.questSilver)}, gold ${n(t.questGold)}`,
    "- **Signs known:** " + (Object.entries(hero.signs).map(([k, x]) => `${k} ${x}`).join(", ") || "none") + (hero.activeSign ? `  ·  **selected:** ${hero.activeSign}` : ""),
    `- **Position:** ${hero.position.map(n).join(", ")} in area \`${hero.areaTag}\``);
  if (hero.trackedQuest) L.push(`- **Tracked quest:** ${hero.trackedQuest}` + (hero.trackedPhase ? `, phase ${hero.trackedPhase}` : ""));
  L.push("");

  L.push(`${h3} Equipment`, "", ...(hero.equipment.length ? table(["Item", "Kind"], hero.equipment.map((i) => [cell(i.name), i.kind])) : ["_nothing equipped_"]), "");
  const groups = {};
  for (const i of hero.inventory) { const g = i.market || "Other"; (groups[g] ??= {}); groups[g][i.name] = (groups[g][i.name] ?? 0) + i.count; }
  const total = hero.inventory.reduce((a, i) => a + i.count, 0);
  L.push(`${h3} Inventory (${n(total)} items in ${n(hero.inventory.length)} stacks)`, "");
  const questItems = [...new Set(hero.inventory.filter((i) => i.quest).map((i) => i.name))].sort();
  for (const g of Object.keys(groups).sort()) L.push(`#### ${g} (${n(sumv(groups[g]))})`, "", ...table(["Item", "×"], byCount(groups[g])), "");
  if (questItems.length) L.push("#### Quest items", "", questItems.join(", "), "");

  L.push(`${h3} Abilities and sword styles`, "", hero.abilities.length ? `${n(hero.abilities.length)} abilities: ` + hero.abilities.map((a) => a.name).join(", ") : "_none_", "");
  if (hero.styles.length) L.push(...table(["Style", "Weapon", "Attacks"], hero.styles.map((s) => [s.id, s.weapon, s.attacks])), "");

  L.push(`${h3} Alchemy`, "", `- **Substances identified:** ${n(hero.identified.length)}` + (hero.identified.length ? ": " + hero.identified.join(", ") : ""), `- **Recipes known:** ${n(hero.recipes.length)}`, "");
  if (hero.recipes.length) L.push(...table(["Recipe", "Base", "Ingredients"], hero.recipes.map((r) => [cell(r.name), r.base || "", Object.entries(r.ingredients).map(([k, x]) => `${k} ${x}`).join(", ")])), "");
  if (hero.books.length) L.push(`${h3} Books and scrolls read (${n(hero.books.length)})`, "", ...hero.books.map((b) => `- ${b}`), "");
  const k = hero.kills;
  L.push(`${h3} Kills (${n(k.total)})`, "");
  if (Object.keys(k.byKind).length) L.push(...table(["Kind", "Count"], Object.entries(k.byKind).slice(0, 25)), "");
  else L.push("_none_", "");

  L.push(`${h2} Quests`, "", `- **${n(q.total)} quests in the journal database:** ` + Object.entries(q.states).map(([s, x]) => `${x} ${s}`).join(", "),
    `- **Journal pages read:** ${n(q.journalRead)} of ${n(q.journalEntries)}` + (q.unreadQuests.length ? `, unread in quests: ${q.unreadQuests.join(", ")}` : ""), "");
  L.push(...table(["Part", "Completed", "Active", "Failed", "Not started"], Object.entries(q.byAct).map(([a, c]) => [a, c.completed ?? 0, c.active ?? 0, c.failed ?? 0, c["not started"] ?? 0])), "");
  const active = q.list.filter((x) => x.state === "active");
  if (active.length) L.push(`${h3} Active`, "", ...table(["Quest", "Part", "Phase", "Hint"], active.map((x) => [cell(x.title), x.act, cell(x.phase || ""), cell(x.hint || "")])), "");
  for (const [state, title] of [["failed", "Failed"], ["completed", "Completed"]]) {
    const rows = q.list.filter((x) => x.state === state);
    if (rows.length) L.push(`${h3} ${title} (${n(rows.length)})`, "", ...rows.map((x) => `- ${cell(x.title)} (${x.act})`), "");
  }

  L.push(`${h2} Story`, "", `- **Story phases recorded:** ${n(st.phases)}  ·  **NPCs tracked:** ${n(st.npcs)}  ·  **Dialog flags:** ${n(st.dialogFlags)}  ·  **Stores:** ${n(st.stores)}`,
    `- **Map regions:** ${n(st.mapRegions)}  ·  **Modules visited:** ${st.modulesVisited.join(", ")}`, "");
  L.push(`${h2} Variables`, "", `- **${n(v.total)} script variables**, ${n(v.monologues)} monologue flags, ${n(v.cutscenes)} cutscene flags`, "");
  if (Object.keys(v.questFlags).length) L.push(...table(["Variable", "Value"], Object.entries(v.questFlags)), "");

  L.push(`${h2} World`, "");
  for (const mod of m.world)
    L.push(`${h3} Module \`${mod.module}\``, "", ...table(["Area", "Creatures", "Placeables", "Doors", "Waypoints", "Monsters", "Killed", "Loot in containers"],
      mod.areas.map((a) => [`${a.name || a.resref} (\`${a.resref}\`)`, a.creatures, a.placeables, a.doors, a.waypoints, a.monsters, a.monstersKilled, a.containerItems])), "");
  return L.join("\n").trimEnd() + "\n";
}
