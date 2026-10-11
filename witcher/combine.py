"""A folder of saves -> one history: snapshots in slot order, forks, first-appearance tables, charts."""
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from . import container, tw1
from .errors import WitcherError
from .render import md, n, table

SUFFIX = ".TheWitcherSave"


def when(t):
    """File modified time as UTC text. The save carries no clock of its own, so this is what orders the history."""
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M")


def order(m):
    return (m["mtime"], m["meta"]["slot"] if m["meta"]["slot"] is not None else -1, m["file"])


def collect(paths, db):
    files = []
    for p in map(Path, paths):
        files += sorted(p.rglob("*" + SUFFIX)) if p.is_dir() else [p]
    snaps, skipped = [], []
    for f in files:
        try:
            m = tw1.summarize(container.read(f.read_bytes()), db)
        except WitcherError:
            skipped.append(f.name); continue
        m["file"], m["bytes"], m["mtime"] = f.name, f.stat().st_size, int(f.stat().st_mtime)
        snaps.append(m)
    return snaps, skipped


def progress(m):
    """Everything here only ever grows in a straight playthrough, so a later save contains an earlier one. A quest that goes
    active to completed keeps its 'began' entry; storing the state itself would make every such step look like a fork.
    Abilities are left out on purpose: potion effects are abilities too, and they come and go."""
    h, q = m["hero"], m["quests"]["list"]
    out = {f"began:{x['id']}" for x in q if x["state"] != "not started"}
    out |= {f"{x['state']}:{x['id']}" for x in q if x["state"] in ("completed", "failed")}
    return out | {"book:" + b for b in h["books"]} | {"recipe:" + r["template"] for r in h["recipes"]} | {"seen:" + s for s in h["identified"]}


def signature(m):
    h, q = m["hero"], m["quests"]["states"]
    return (m["meta"]["area"], h["level"], h["experience"], h["gold"], q.get("completed", 0), q.get("active", 0), q.get("failed", 0),
            len(h["abilities"]), len(h["recipes"]), sum(i["count"] for i in h["inventory"]), len(h["books"]))


def parents(snaps):
    prog = [progress(m) for m in snaps]
    return [next((j for j in range(i - 1, -1, -1) if prog[j] <= prog[i]), None) for i in range(len(snaps))]


def branches(snaps):
    par = parents(snaps)
    kids = defaultdict(list)
    for i, p in enumerate(par):
        if p is not None: kids[p].append(i)
    nodes, cur = [], {}
    for i, p in enumerate(par):
        if p is not None and len(kids[p]) == 1 and p in cur: cur[i] = cur[p]; nodes[cur[i]].append(i)
        else: cur[i] = len(nodes); nodes.append([i])
    edges = sorted({(cur[p], cur[i]) for i, p in enumerate(par) if p is not None and cur[p] != cur[i]})
    return nodes, edges


def first_seen(snaps, getter):
    seen = {}
    for m in snaps:
        for x in getter(m): seen.setdefault(x, m)
    return seen


def grouped(seen, label):
    by = {}
    for x, m in seen.items(): by.setdefault(order(m), (m, []))[1].append(x)
    L = []
    for _, (m, xs) in sorted(by.items(), key=lambda kv: kv[0]):
        L += [f"#### {when(m['mtime'])}, slot {m['meta']['slot']}: {by_name(m['file'])}", ""] + [f"- {x}" for x in sorted(xs)] + [""]
    return L or [f"_no {label}_", ""]


def by_name(f):
    return f[:-len(SUFFIX)] if f.endswith(SUFFIX) else f


def chart(snaps):
    lab = [when(m["mtime"])[5:10] for m in snaps]

    def series(name, vals):
        return ["```mermaid", "xychart-beta", f'  title "{name}"', "  x-axis [" + ", ".join(f'"{x}"' for x in lab) + "]",
                f'  y-axis "{name}" 0 --> {max(vals) or 1}', "  line [" + ", ".join(str(v) for v in vals) + "]", "```", ""]
    return (series("Level", [m["hero"]["level"] for m in snaps]) + series("Gold (orens)", [m["hero"]["gold"] for m in snaps])
            + series("Quests completed", [m["quests"]["states"].get("completed", 0) for m in snaps]) + series("Abilities", [len(m["hero"]["abilities"]) for m in snaps]))


def combined(paths, db):
    snaps, skipped = collect(paths, db)
    if not snaps: raise WitcherError("no readable Witcher saves found")
    snaps.sort(key=order)
    newest = snaps[-1]
    L = ["# The Witcher: Combined Playthrough Timeline", "",
         f"_Reconstructed from {n(len(snaps))} saves. A date is the file time of the FIRST save in which something appears: an upper bound on when it happened, never a lower one. The saves carry no play-time clock, so the order comes from each file's modified time, then its slot number._", "",
         f"_Span: {when(snaps[0]['mtime'])} to {when(newest['mtime'])} UTC. Newest save: {newest['file']}._", "", "---", "",
         f"# Part 1: Current State ({when(newest['mtime'])} UTC, slot {newest['meta']['slot']})", "", md(newest, newest["file"], "##").split("\n", 2)[2], "", "---", "", "# Part 2: Timeline", "",
         "## Branches", "", "_Saves in time order look like one line, but loading an older save and playing on forks the run. A save's parent is the latest earlier one whose progress (quests, recipes, books, identified substances) it still contains._", ""]
    nodes, edges = branches(snaps)
    L += ["```mermaid", "flowchart TD"]
    for i, ch in enumerate(nodes):
        a, z = snaps[ch[0]], snaps[ch[-1]]
        span = when(a["mtime"]) + (f" to {when(z['mtime'])}" if a is not z else "")
        L.append(f'  n{i}["{span}<br/>{len(ch)} save{"s" if len(ch) != 1 else ""} · level {z["hero"]["level"]}<br/>{z["quests"]["states"].get("completed", 0)} quests done"]')
    L += [f"  n{a} --> n{b}" for a, b in edges] + ["```", ""]
    L += ["## Journey", ""] + chart(snaps)
    L += ["## Saves", "", "_Runs of consecutive saves where nothing tracked moved are collapsed to one row._", ""]
    rows, prev = [], None
    for m in snaps:
        s = signature(m)
        if s == prev: rows[-1].append(m); continue
        rows.append([m]); prev = s
    out = []
    for ms in rows:
        m, h, q = ms[0], ms[0]["hero"], ms[0]["quests"]["states"]
        saved = when(m["mtime"]) + (f" to {when(ms[-1]['mtime'])} ({len(ms)} saves, no change)" if len(ms) > 1 else "")
        out.append((saved, m["meta"]["slot"], m["meta"]["area"], h["level"], h["experience"], h["gold"], q.get("completed", 0), q.get("active", 0), q.get("failed", 0), len(h["abilities"]), len(h["recipes"]), sum(i["count"] for i in h["inventory"])))
    L += table(["Saved (UTC)", "Slot", "Area", "Level", "Experience", "Gold", "Done", "Active", "Failed", "Abilities", "Recipes", "Items"], out) + [""]
    L += ["## Quests: first begun", ""] + grouped(first_seen(snaps, lambda m: [f"{x['title']} ({x['act']})" for x in m["quests"]["list"] if x["state"] != "not started"]), "quests")
    L += ["## Quests: first completed", ""] + grouped(first_seen(snaps, lambda m: [f"{x['title']} ({x['act']})" for x in m["quests"]["list"] if x["state"] == "completed"]), "completed quests")
    L += ["## Quests: first failed", ""] + grouped(first_seen(snaps, lambda m: [f"{x['title']} ({x['act']})" for x in m["quests"]["list"] if x["state"] == "failed"]), "failed quests")
    L += ["## Abilities: first learned", ""] + grouped(first_seen(snaps, lambda m: [a["name"] for a in m["hero"]["abilities"]]), "abilities")
    L += ["## Alchemy recipes: first learned", ""] + grouped(first_seen(snaps, lambda m: [r["name"] for r in m["hero"]["recipes"]]), "recipes")
    L += ["## Books: first read", ""] + grouped(first_seen(snaps, lambda m: m["hero"]["books"]), "books")
    L += ["## Areas: first loaded", ""] + grouped(first_seen(snaps, lambda m: [f"{a['name'] or a['resref']} ({mod['module']})" for mod in m["world"] for a in mod["areas"]]), "areas")
    L += ["## Monsters: first kill of each kind", ""] + grouped(first_seen(snaps, lambda m: list(m["hero"]["kills"]["byKind"])), "kills")
    L += ["---", "", "## Reference list", ""]
    for i, m in enumerate(snaps, 1):
        L.append(f"{i}. `{m['file']}`: {when(m['mtime'])} UTC, slot {m['meta']['slot']}, level {m['hero']['level']}, {n(m['bytes'])} bytes")
    if skipped: L += ["", "_Skipped (not readable as Witcher saves):_ " + ", ".join(f"`{f}`" for f in skipped)]
    return "\n".join(L) + "\n"
