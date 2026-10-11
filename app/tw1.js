// The Witcher 1 summary: a port of witcher/tw1.py. One JSON-able object per save.
const ENGLISH = [4, 2, 6, 0];
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Python's round(): halves go to the even neighbour. */
export function pyRound(x, nd = 0) {
  const m = 10 ** nd, y = x * m, fl = Math.floor(y), d = y - fl;
  const r = (d === 0.5 ? (fl % 2 === 0 ? fl : fl + 1) : Math.round(y)) / m;
  return r === 0 ? 0 : r; // never -0
}

export function loc(v, order = ENGLISH) {
  if (!v) return "";
  const d = new Map(v.strings);
  for (const i of order) if (d.get(i)) return d.get(i);
  return "";
}

export function pretty(s) {
  s = s.replaceAll("_", " ").replaceAll("-", " ").replace(/(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Za-z])/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

const add = (c, k, n = 1) => { c[k] = (c[k] ?? 0) + n; };
export function label(s) {
  const p = pretty(String(s));
  return p.slice(0, 1).toUpperCase() + p.slice(1);
}

export function srt(c, limit) {
  const items = Object.entries(c).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));
  return Object.fromEntries(limit ? items.slice(0, limit) : items);
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const truthy = (x) => !(x === null || x === undefined || x === 0 || x === "" || x === false);

const ACT = { 0: "Prologue", 1: "Act 1", 2: "Act 2", 3: "Act 3", 4: "Act 4", 5: "Act 5", 6: "Epilogue", 9: "Monster hunts" };
export const ACTS = ["Setup", "Prologue", "Act 1", "Act 2", "Act 3", "Act 4", "Act 5", "Epilogue", "Monster hunts", "Other"];

function actOf(qid) {
  if (qid.startsWith("p_")) return "Setup";
  const m = /^q(\d)/.exec(qid);
  if (!m) return "Other";
  return ACT[m[1]] ?? "Other";
}

function itemRow(it, db) {
  const t = it.get("TemplateResRef") || "";
  const name = loc(it.get("LocalizedName")) || (db.items[t] || {}).name || pretty(t);
  const base = String(it.get("BaseItem"));
  const market = db.marketcat[String(it.get("MarketCat"))];
  return { name, template: t, kind: label(db.baseitems[base] ?? base), market: market ? label(market) : "", count: it.get("StackSize") || 1, quest: truthy(it.get("QuestItem")) };
}

function heroOf(save, db) {
  const h = save.hero.root, g = (k) => h.get(k);
  const areas = new Map();
  for (const m of save.modules) if (m.ifo) for (const a of m.ifo.root.get("Mod_Area_list") || []) areas.set(a.get("ObjectId"), a.get("Area_Name"));
  const spells = {};
  for (const sp of g("KnownList0") || []) {
    const info = db.spells[String(sp.get("Spell"))];
    if (info) spells[info.sign] = Math.max(spells[info.sign] ?? -1, info.level);
    else spells["Spell " + sp.get("Spell")] = 0;
  }
  const active = db.spells[String(g("ActiveSpellID"))];
  const inv = (g("ItemList") || []).map((i) => itemRow(i, db));
  const eq = (g("Equip_ItemList") || []).map((i) => ({ ...itemRow(i, db), slot: i.get("WeaponSlot") }));
  const kc = {};
  for (const x of g("KillList") || []) add(kc, (x.get("OppTag") || "").split(";")[0]);
  const styles = (g("StyleList") || []).map((st) => ({ id: st.get("StyleID"), weapon: st.get("StyleWeaponType"), attacks: sum(st.fields.filter(([, t]) => t === 15).map(([, , v]) => v.length)) }));
  const recipes = (g("AlchKnowledge") || []).map((r) => {
    const name = r.get("AlchRecipName") || "";
    const ing = {};
    for (const k of ["Vitriol", "Rebis", "Aether", "Quebrith", "Hydragenum", "Vermilion", "Albedo", "Nigredo", "Rubedo"]) if (r.get(k)) ing[k] = r.get(k);
    return { name: (db.items[name] || {}).name || pretty(name), template: name, base: r.get("AlchBaseType"), ingredients: ing };
  });
  const books = (g("READBOOK_lst") || []).map((x) => { const t = x.get("READBOOK_tmpl"); return (db.items[t] || {}).name || pretty(t); });
  const kinds = {};
  for (const [k, v] of Object.entries(kc)) kinds[pretty(k)] = v;
  const tp = (k) => g(k);
  return {
    name: loc(g("FirstName")), level: g("ExpLevel"), experience: g("Experience"), gold: g("Gold"),
    hitPoints: g("CurrentHitPoints"), endurance: g("CurrentEndurance"), toxicity: pyRound(g("CurrentToxicity") || 0, 1), toxicityCap: g("CurrentToxinCap"),
    talentPoints: { bronze: tp("TalentBronze"), silver: tp("TalentSilver"), gold: tp("TalentGold"), questBronze: tp("QTalentBronze"), questSilver: tp("QTalentSilver"), questGold: tp("QTalentGold") },
    advancementPoints: g("AdvPointsRemain"),
    position: [pyRound(g("XPosition") || 0), pyRound(g("YPosition") || 0), pyRound(g("ZPosition") || 0)],
    areaTag: areas.get(g("AreaId")) ?? null,
    signs: Object.fromEntries(Object.entries(spells).sort((a, b) => cmp(a[0], b[0]))), activeSign: active ? active.sign : null,
    abilities: (g("CharAbilities") || []).map((x) => ({ name: pretty(x.get("RnAbName")), stack: x.get("RnAbStk") || 0 })), styles,
    books: [...books].sort(), identified: (g("AlchIdent") || []).map((x) => { const t = x.get("AlchSubstance"); return (db.items[t] || {}).name || pretty(t); }).sort(),
    recipes, kills: { total: sum(Object.values(kc)), byKind: srt(kinds) },
    inventory: inv, equipment: eq, reputationEntries: (g("PersonalRepList") || []).length,
    trackedQuest: g("DiaryTrackedQues") || null, trackedPhase: g("DiaryTrackedPhas") || null,
  };
}

function questsOf(save) {
  const out = [];
  for (const q of save.quests) {
    const r = q.gff.root, mp = (r.get("MainPhase") || [null])[0];
    if (mp === null || mp === undefined) continue;
    const phases = mp.get("Phases") || [], cur = mp.get("CurrPhase");
    const cp = Number.isInteger(cur) && cur >= 0 && cur < phases.length ? phases[cur] : null;
    const began = truthy(mp.get("QuestBegan")), done = truthy(mp.get("Completed")), failed = truthy(mp.get("Failed"));
    out.push({
      id: q.id, act: actOf(q.id), title: loc(r.get("QuestLocName")) || loc(mp.get("LocName")) || pretty(q.id),
      state: failed ? "failed" : done ? "completed" : began ? "active" : "not started", primary: truthy(r.get("Primary")),
      phases: phases.length, phasesDone: phases.filter((p) => truthy(p.get("Completed"))).length,
      phase: (cp ? loc(cp.get("LocPhaseName")) : "") || null, hint: (cp ? loc(cp.get("LocShortDescript")) : "") || null,
    });
  }
  out.sort((a, b) => cmp(a.id, b.id));
  return out;
}

function worldOf(save) {
  return save.modules.map((m) => ({
    module: m.name, scripts: m.scripts,
    areas: Object.keys(m.areas).sort().map((name) => {
      const are = m.areas[name].ARE, git = m.areas[name].GIT;
      const row = { resref: name, name: are ? loc(are.root.get("Name")) : "", creatures: 0, placeables: 0, doors: 0, waypoints: 0, monsters: 0, monstersKilled: 0, containerItems: 0 };
      if (git) {
        const gr = git.root, pl = gr.get("Placeable List") || [], mn = gr.get("MonsterNPCs") || [];
        row.creatures = (gr.get("Creature List") || []).length;
        row.placeables = pl.length;
        row.containerItems = sum(pl.map((p) => sum((p.get("ItemList") || []).map((i) => i.get("StackSize") || 1))));
        row.doors = (gr.get("Door List") || []).length;
        row.waypoints = (gr.get("WaypointList") || []).length;
        row.monsters = mn.length;
        row.monstersKilled = mn.filter((x) => truthy(x.get("WasKilled"))).length;
      }
      return row;
    }),
  })).map((m) => ({ module: m.module, areas: m.areas, scripts: m.scripts }));
}

export function summarize(save, db) {
  const h = save.header, a = save.audit;
  const smm = save.smm ? save.smm.root : null, qdb = save.qdb ? save.qdb.root : null;
  const qs = questsOf(save);
  const states = {};
  for (const q of qs) add(states, q.state);
  const byAct = {};
  for (const act of ACTS) { const c = {}; for (const q of qs) if (q.act === act) add(c, q.state); if (Object.keys(c).length) byAct[act] = Object.fromEntries(Object.entries(c).sort((x, y) => cmp(x[0], y[0]))); }
  const mnum = /^(\d+)/.exec(save.saveName);
  const variables = {};
  for (const m of save.modules) if (m.ifo) for (const v of m.ifo.root.get("VarTable") || []) variables[v.get("Name")] = v.get("Value");
  for (const v of save.hero.root.get("VarTable") || []) variables[v.get("Name")] = v.get("Value");
  const flags = {};
  for (const k of Object.keys(variables).sort()) if (k && /^[qQ]\d/.test(k)) flags[k] = variables[k];
  const unread = qdb ? (qdb.get("JournalQ") || []).map((x) => x.get("UnReadQName")) : [];
  const journal = qdb ? qdb.get("Journal") || [] : [];
  return {
    meta: { saveName: save.saveName, slot: mnum ? Number(mnum[1]) : null, area: h.area, title: h.title, files: save.files.length, modules: save.modules.map((m) => m.name), bytes: a.fileBytes,
      difficulty: smm ? smm.get("GameDiffSetting") : null, startingModule: smm ? smm.get("StartingMod") : null, note: save.note.trim() },
    integrity: { files: save.files.length, gffResources: a.gffs, undecodedBytes: a.gapBytes + a.erfGap + a.headerUndecoded, unreferencedBytes: a.gffUnreferenced },
    hero: heroOf(save, db),
    quests: { total: qs.length, states: Object.fromEntries(Object.entries(states).sort((x, y) => cmp(x[0], y[0]))), byAct, list: qs, journalEntries: journal.length,
      journalRead: journal.filter((j) => truthy(j.get("EntryRead"))).length, unreadQuests: [...unread].sort() },
    story: { phases: qdb ? (qdb.get("StoryPhase") || []).length : 0, npcs: smm ? (smm.get("StoryNPC_list") || []).length : 0, dialogFlags: smm ? (smm.get("DlgFlagList") || []).length : 0,
      modulesVisited: smm ? (smm.get("Meta_Mod_list") || []).map((x) => x.get("Mod_Name")) : [], mapRegions: smm ? (smm.get("MapWorldRegions") || []).length : 0, stores: smm ? (smm.get("StoreList") || []).length : 0 },
    variables: { total: Object.keys(variables).length, questFlags: flags, monologues: Object.keys(variables).filter((k) => k && k.startsWith("bMonologue")).length,
      cutscenes: Object.keys(variables).filter((k) => k && k.toLowerCase().includes("played")).length },
    world: worldOf(save),
  };
}
