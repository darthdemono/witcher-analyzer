"""The Witcher 1 summary: one JSON-able dict per save. Everything the Markdown, the JSON and the
web page show is computed here, so the three cannot drift."""
import re
from collections import Counter

ENGLISH = (4, 2, 6, 0)  # LocString ids: language id * 2 + gender. 2/4/6 are the English variants, 0 the debug text
POLISH = (10, 0)


def loc(v, order=ENGLISH):
    """Best English string of a LocString, '' when it has none."""
    if not v: return ""
    d = dict(v["strings"])
    return next((d[i] for i in order if d.get(i)), "")


def pretty(s):
    """StyleSteelStrong1 -> Style Steel Strong 1; q9001_barghest -> Q9001 Barghest"""
    s = re.sub(r"(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Za-z])", " ", s.replace("_", " ").replace("-", " "))
    return re.sub(r"\s+", " ", s).strip()


def label(s):
    """A table label made readable: MonsterIngredient -> Monster Ingredient, short_axe -> Short axe."""
    p = pretty(str(s))
    return p[:1].upper() + p[1:]


def srt(c, limit=None):
    items = sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))
    return dict(items[:limit] if limit else items)


def act_of(qid):
    if qid.startswith("p_"): return "Setup"
    m = re.match(r"q(\d)", qid)
    if not m: return "Other"
    return {"0": "Prologue", "1": "Act 1", "2": "Act 2", "3": "Act 3", "4": "Act 4", "5": "Act 5", "6": "Epilogue", "9": "Monster hunts"}.get(m.group(1), "Other")


ACTS = ("Setup", "Prologue", "Act 1", "Act 2", "Act 3", "Act 4", "Act 5", "Epilogue", "Monster hunts", "Other")


def item_row(it, db):
    t = it.get("TemplateResRef") or ""
    name = loc(it.get("LocalizedName")) or (db["items"].get(t) or {}).get("name") or pretty(t)
    base = str(it.get("BaseItem"))
    market = db["marketcat"].get(str(it.get("MarketCat")))
    return {"name": name, "template": t, "kind": label(db["baseitems"].get(base, base)), "market": label(market) if market else "",
            "count": it.get("StackSize") or 1, "quest": bool(it.get("QuestItem"))}


def hero_of(save, db):
    h = save["hero"].root
    g = h.get
    areas = {}
    for m in save["modules"]:
        if m["ifo"]:
            for a in m["ifo"].root.get("Mod_Area_list") or []: areas[a.get("ObjectId")] = a.get("Area_Name")
    spells = {}
    for sp in g("KnownList0") or []:
        info = db["spells"].get(str(sp.get("Spell")))
        if info: spells[info["sign"]] = max(spells.get(info["sign"], -1), info["level"])
        else: spells["Spell " + str(sp.get("Spell"))] = 0
    active = db["spells"].get(str(g("ActiveSpellID")))
    inv = [item_row(i, db) for i in g("ItemList") or []]
    eq = [item_row(i, db) | {"slot": i.get("WeaponSlot")} for i in g("Equip_ItemList") or []]
    kills = Counter((x.get("OppTag") or "").split(";")[0] for x in g("KillList") or [])
    styles = []
    for st in g("StyleList") or []:
        feats = sum(len(v) for n, t, v in st.fields if t == 15)
        styles.append({"id": st.get("StyleID"), "weapon": st.get("StyleWeaponType"), "attacks": feats})
    recipes = []
    for r in g("AlchKnowledge") or []:
        name = r.get("AlchRecipName") or ""
        ing = {k: r.get(k) for k in ("Vitriol", "Rebis", "Aether", "Quebrith", "Hydragenum", "Vermilion", "Albedo", "Nigredo", "Rubedo") if r.get(k)}
        recipes.append({"name": (db["items"].get(name) or {}).get("name") or pretty(name), "template": name, "base": r.get("AlchBaseType"), "ingredients": ing})
    books = [(db["items"].get(t) or {}).get("name") or pretty(t) for t in (x.get("READBOOK_tmpl") for x in g("READBOOK_lst") or [])]
    ab = [(x.get("RnAbName"), x.get("RnAbStk") or 0) for x in g("CharAbilities") or []]
    return {
        "name": loc(g("FirstName")), "level": g("ExpLevel"), "experience": g("Experience"), "gold": g("Gold"),
        "hitPoints": g("CurrentHitPoints"), "endurance": g("CurrentEndurance"), "toxicity": round(g("CurrentToxicity") or 0, 1), "toxicityCap": g("CurrentToxinCap"),
        "talentPoints": {"bronze": g("TalentBronze"), "silver": g("TalentSilver"), "gold": g("TalentGold"), "questBronze": g("QTalentBronze"), "questSilver": g("QTalentSilver"), "questGold": g("QTalentGold")},
        "advancementPoints": g("AdvPointsRemain"),
        "position": [round(g("XPosition") or 0), round(g("YPosition") or 0), round(g("ZPosition") or 0)],
        "areaTag": areas.get(g("AreaId")),
        "signs": dict(sorted(spells.items())), "activeSign": active["sign"] if active else None,
        "abilities": [{"name": pretty(n), "stack": s} for n, s in ab], "styles": styles,
        "books": sorted(books), "identified": sorted((db["items"].get(t) or {}).get("name") or pretty(t) for t in (x.get("AlchSubstance") for x in g("AlchIdent") or [])),
        "recipes": recipes, "kills": {"total": sum(kills.values()), "byKind": srt({pretty(k): v for k, v in kills.items()})},
        "inventory": inv, "equipment": eq, "reputationEntries": len(g("PersonalRepList") or []),
        "trackedQuest": g("DiaryTrackedQues") or None, "trackedPhase": g("DiaryTrackedPhas") or None,
    }


def quests_of(save):
    out = []
    for q in save["quests"]:
        r = q["gff"].root
        mp = (r.get("MainPhase") or [None])[0]
        if mp is None: continue
        phases = mp.get("Phases") or []
        cur = mp.get("CurrPhase")
        cp = phases[cur] if isinstance(cur, int) and 0 <= cur < len(phases) else None
        began, done, failed = bool(mp.get("QuestBegan")), bool(mp.get("Completed")), bool(mp.get("Failed"))
        state = "failed" if failed else "completed" if done else "active" if began else "not started"
        out.append({
            "id": q["id"], "act": act_of(q["id"]), "title": loc(r.get("QuestLocName")) or loc(mp.get("LocName")) or pretty(q["id"]),
            "state": state, "primary": bool(r.get("Primary")), "phases": len(phases), "phasesDone": sum(1 for p in phases if p.get("Completed")),
            "phase": (loc(cp.get("LocPhaseName")) if cp else "") or None, "hint": (loc(cp.get("LocShortDescript")) if cp else "") or None,
        })
    out.sort(key=lambda q: q["id"])
    return out


def world_of(save):
    mods = []
    for m in save["modules"]:
        areas = []
        for name, a in sorted(m["areas"].items()):
            are, git = a.get("ARE"), a.get("GIT")
            row = {"resref": name, "name": loc(are.root.get("Name")) if are else "", "creatures": 0, "placeables": 0, "doors": 0, "waypoints": 0, "monsters": 0, "monstersKilled": 0, "containerItems": 0}
            if git:
                gr = git.root
                row["creatures"] = len(gr.get("Creature List") or [])
                pl = gr.get("Placeable List") or []
                row["placeables"] = len(pl)
                row["containerItems"] = sum(sum(i.get("StackSize") or 1 for i in (p.get("ItemList") or [])) for p in pl)
                row["doors"] = len(gr.get("Door List") or [])
                row["waypoints"] = len(gr.get("WaypointList") or [])
                mn = gr.get("MonsterNPCs") or []
                row["monsters"] = len(mn)
                row["monstersKilled"] = sum(1 for x in mn if x.get("WasKilled"))
            areas.append(row)
        mods.append({"module": m["name"], "areas": areas, "scripts": m["scripts"]})
    return mods


def summarize(save, db):
    h, a = save["header"], save["audit"]
    smm = save["smm"].root if save["smm"] else None
    qdb = save["qdb"].root if save["qdb"] else None
    qs = quests_of(save)
    states = Counter(q["state"] for q in qs)
    by_act = {act: Counter(q["state"] for q in qs if q["act"] == act) for act in ACTS}
    mnum = re.match(r"(\d+)", save["saveName"])
    variables = {}
    for m in save["modules"]:
        if m["ifo"]:
            for v in m["ifo"].root.get("VarTable") or []: variables[v.get("Name")] = v.get("Value")
    for v in save["hero"].root.get("VarTable") or []: variables[v.get("Name")] = v.get("Value")
    flags = {k: v for k, v in variables.items() if k and re.match(r"[qQ]\d", k)}
    unread = [x.get("UnReadQName") for x in (qdb.get("JournalQ") or [])] if qdb else []
    journal = qdb.get("Journal") or [] if qdb else []
    return {
        "meta": {"saveName": save["saveName"], "slot": int(mnum.group(1)) if mnum else None, "area": h["area"], "title": h["title"],
                 "files": len(save["files"]), "modules": [m["name"] for m in save["modules"]], "bytes": a["fileBytes"],
                 "difficulty": smm.get("GameDiffSetting") if smm else None, "startingModule": smm.get("StartingMod") if smm else None,
                 "note": save["note"].strip()},
        "integrity": {"files": len(save["files"]), "gffResources": a["gffs"], "undecodedBytes": a["gapBytes"] + a["erfGap"] + a["headerUndecoded"],
                      "unreferencedBytes": a["gffUnreferenced"]},
        "hero": hero_of(save, db),
        "quests": {"total": len(qs), "states": dict(sorted(states.items())), "byAct": {k: dict(sorted(v.items())) for k, v in by_act.items() if v},
                   "list": qs, "journalEntries": len(journal), "journalRead": sum(1 for j in journal if j.get("EntryRead")), "unreadQuests": sorted(unread)},
        "story": {"phases": len((qdb.get("StoryPhase") or [])) if qdb else 0, "npcs": len(smm.get("StoryNPC_list") or []) if smm else 0,
                  "dialogFlags": len(smm.get("DlgFlagList") or []) if smm else 0, "modulesVisited": [x.get("Mod_Name") for x in (smm.get("Meta_Mod_list") or [])] if smm else [],
                  "mapRegions": len(smm.get("MapWorldRegions") or []) if smm else 0, "stores": len(smm.get("StoreList") or []) if smm else 0},
        "variables": {"total": len(variables), "questFlags": dict(sorted(flags.items())),
                      "monologues": sum(1 for k in variables if k and k.startswith("bMonologue")), "cutscenes": sum(1 for k in variables if k and "played" in k.lower())},
        "world": world_of(save),
    }
