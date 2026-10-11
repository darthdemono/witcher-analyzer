"""summary dict -> Markdown. Bold-label bullets, tables, counts as a plain column."""
from collections import Counter

NOTE = "_Made by witcher-analyzer. Figures worked out from the save rather than stored in it say so where they appear._"


def n(v):
    """Whole numbers print whole, whether the source held 5 or 5.0."""
    if isinstance(v, float): return f"{int(v):,}" if v.is_integer() else f"{v:,.1f}"
    if v is None: return "None"
    return f"{v:,}" if isinstance(v, int) and not isinstance(v, bool) else str(v)


def table(head, rows):
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + ["| " + " | ".join(n(c) for c in r) + " |" for r in rows]


def cell(s):
    return str(s).replace("|", "/").replace("\n", " ")


def md(m, source=None, heading="#"):
    me, hero, q, st, var, ig = m["meta"], m["hero"], m["quests"], m["story"], m["variables"], m["integrity"]
    h2, h3 = heading + "#", heading + "##"
    L = [f"{heading} The Witcher save: {me['saveName']}", ""]
    if source: L += [f"_Source: `{source}`_", ""]
    L += [NOTE, ""]
    L += [f"- **Area:** {me['area']}", f"- **Header title:** {me['title']}",
          f"- **Difficulty setting:** {n(me['difficulty'])}", f"- **Modules loaded:** {', '.join(me['modules'])}",
          f"- **Files in the save:** {n(me['files'])}, {n(me['bytes'])} bytes", ""]
    L += [f"- **Read integrity:** {n(ig['files'])} files, {n(ig['gffResources'])} resources, {n(ig['undecodedBytes'])} undecoded bytes, "
          f"{n(ig['unreferencedBytes'])} bytes of leftover table space that nothing points at", ""]

    t = hero["talentPoints"]
    L += [f"{h2} {hero['name'] or 'Hero'}", "",
          f"- **Level:** {n(hero['level'])}  ·  **Experience:** {n(hero['experience'])}  ·  **Gold:** {n(hero['gold'])} orens",
          f"- **Hit points:** {n(hero['hitPoints'])}  ·  **Endurance:** {n(hero['endurance'])}  ·  **Toxicity:** {n(hero['toxicity'])} of {n(hero['toxicityCap'])}",
          f"- **Talent points unspent:** bronze {n(t['bronze'])}, silver {n(t['silver'])}, gold {n(t['gold'])}  ·  quest talents: bronze {n(t['questBronze'])}, silver {n(t['questSilver'])}, gold {n(t['questGold'])}",
          f"- **Signs known:** " + (", ".join(f"{k} {v}" for k, v in hero["signs"].items()) or "none") + (f"  ·  **selected:** {hero['activeSign']}" if hero["activeSign"] else ""),
          f"- **Position:** {', '.join(n(v) for v in hero['position'])} in area `{hero['areaTag']}`"]
    if hero["trackedQuest"]: L.append(f"- **Tracked quest:** {hero['trackedQuest']}" + (f", phase {hero['trackedPhase']}" if hero["trackedPhase"] else ""))
    L.append("")

    L += [f"{h3} Equipment", ""] + (table(["Item", "Kind"], [(cell(i["name"]), i["kind"]) for i in hero["equipment"]]) if hero["equipment"] else ["_nothing equipped_"]) + [""]
    groups = {}
    for i in hero["inventory"]:
        g = i["market"] or "Other"
        groups.setdefault(g, Counter())[i["name"]] += i["count"]
    total = sum(i["count"] for i in hero["inventory"])
    L += [f"{h3} Inventory ({n(total)} items in {n(len(hero['inventory']))} stacks)", ""]
    quest_items = sorted({i["name"] for i in hero["inventory"] if i["quest"]})
    for g in sorted(groups):
        c = groups[g]
        L += [f"#### {g} ({n(sum(c.values()))})", ""] + table(["Item", "×"], sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))) + [""]
    if quest_items: L += ["#### Quest items", "", ", ".join(quest_items), ""]

    L += [f"{h3} Abilities and sword styles", "", f"{n(len(hero['abilities']))} abilities: " + ", ".join(a["name"] for a in hero["abilities"]) if hero["abilities"] else "_none_", ""]
    if hero["styles"]: L += table(["Style", "Weapon", "Attacks"], [(s["id"], s["weapon"], s["attacks"]) for s in hero["styles"]]) + [""]

    L += [f"{h3} Alchemy", "", f"- **Substances identified:** {n(len(hero['identified']))}" + (": " + ", ".join(hero["identified"]) if hero["identified"] else ""),
          f"- **Recipes known:** {n(len(hero['recipes']))}", ""]
    if hero["recipes"]:
        L += table(["Recipe", "Base", "Ingredients"], [(cell(r["name"]), r["base"] or "", ", ".join(f"{k} {v}" for k, v in r["ingredients"].items())) for r in hero["recipes"]]) + [""]
    if hero["books"]: L += [f"{h3} Books and scrolls read ({n(len(hero['books']))})", ""] + [f"- {b}" for b in hero["books"]] + [""]
    k = hero["kills"]
    L += [f"{h3} Kills ({n(k['total'])})", ""]
    L += table(["Kind", "Count"], list(k["byKind"].items())[:25]) + [""] if k["byKind"] else ["_none_", ""]

    L += [f"{h2} Quests", "", f"- **{n(q['total'])} quests in the journal database:** " + ", ".join(f"{v} {s}" for s, v in q["states"].items()),
          f"- **Journal pages read:** {n(q['journalRead'])} of {n(q['journalEntries'])}" + (f", unread in quests: {', '.join(q['unreadQuests'])}" if q["unreadQuests"] else ""), ""]
    acts = q["byAct"]
    L += table(["Part", "Completed", "Active", "Failed", "Not started"], [(a, c.get("completed", 0), c.get("active", 0), c.get("failed", 0), c.get("not started", 0)) for a, c in acts.items()]) + [""]
    active = [x for x in q["list"] if x["state"] == "active"]
    if active: L += [f"{h3} Active", ""] + table(["Quest", "Part", "Phase", "Hint"], [(cell(x["title"]), x["act"], cell(x["phase"] or ""), cell(x["hint"] or "")) for x in active]) + [""]
    for state, title in (("failed", "Failed"), ("completed", "Completed")):
        rows = [x for x in q["list"] if x["state"] == state]
        if rows: L += [f"{h3} {title} ({n(len(rows))})", ""] + [f"- {cell(x['title'])} ({x['act']})" for x in rows] + [""]

    L += [f"{h2} Story", "", f"- **Story phases recorded:** {n(st['phases'])}  ·  **NPCs tracked:** {n(st['npcs'])}  ·  **Dialog flags:** {n(st['dialogFlags'])}  ·  **Stores:** {n(st['stores'])}",
          f"- **Map regions:** {n(st['mapRegions'])}  ·  **Modules visited:** {', '.join(st['modulesVisited'])}", ""]
    L += [f"{h2} Variables", "", f"- **{n(var['total'])} script variables**, {n(var['monologues'])} monologue flags, {n(var['cutscenes'])} cutscene flags", ""]
    if var["questFlags"]: L += table(["Variable", "Value"], list(var["questFlags"].items())) + [""]

    L += [f"{h2} World", ""]
    for mod in m["world"]:
        L += [f"{h3} Module `{mod['module']}`", ""] + table(["Area", "Creatures", "Placeables", "Doors", "Waypoints", "Monsters", "Killed", "Loot in containers"],
              [(f"{a['name'] or a['resref']} (`{a['resref']}`)", a["creatures"], a["placeables"], a["doors"], a["waypoints"], a["monsters"], a["monstersKilled"], a["containerItems"]) for a in mod["areas"]]) + [""]
    return "\n".join(L).rstrip() + "\n"
