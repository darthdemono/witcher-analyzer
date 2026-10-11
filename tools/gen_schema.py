#!/usr/bin/env python3
"""Writes schema.json: the contract for `witcher_to_md.py x.TheWitcherSave -o x.json` and the web app's JSON download."""
import json
from pathlib import Path

INT, NUM, STR, BOOL = {"type": "integer"}, {"type": "number"}, {"type": "string"}, {"type": "boolean"}
NSTR, NINT, NNUM = {"type": ["string", "null"]}, {"type": ["integer", "null"]}, {"type": ["number", "null"]}


def obj(props, **kw):
    return {"type": "object", "required": list(props), "additionalProperties": False, "properties": props, **kw}


def counter(note):
    return {"type": "object", "description": note, "additionalProperties": INT}


def arr(item): return {"type": "array", "items": item}


ITEM = obj({"name": STR, "template": STR, "kind": STR, "market": STR, "count": INT, "quest": BOOL})
schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/darthdemono/witcher-analyzer/schema.json",
    "title": "witcher-analyzer save export",
    "description": "One summary per Witcher 1 save. Python (witcher/tw1.py) and JavaScript (app/tw1.js) produce identical documents, held together by tools/parity.mjs.",
    **obj({
        "meta": obj({"saveName": STR, "slot": NINT, "area": STR, "title": STR, "files": INT, "modules": arr(STR), "bytes": INT, "difficulty": NINT, "startingModule": NSTR, "note": STR}),
        "integrity": obj({"files": INT, "gffResources": INT, "undecodedBytes": INT, "unreferencedBytes": INT},
                         description="undecodedBytes is bytes of the file no reader claimed (zero on a clean read). unreferencedBytes is leftover table space inside quest files that nothing points at."),
        "hero": obj({
            "name": STR, "level": NINT, "experience": NINT, "gold": NINT, "hitPoints": NINT, "endurance": NINT, "toxicity": NUM, "toxicityCap": NNUM,
            "talentPoints": obj({k: NINT for k in ("bronze", "silver", "gold", "questBronze", "questSilver", "questGold")}), "advancementPoints": NINT,
            "position": {"type": "array", "items": INT, "minItems": 3, "maxItems": 3}, "areaTag": NSTR,
            "signs": {"type": "object", "additionalProperties": INT}, "activeSign": NSTR,
            "abilities": arr(obj({"name": STR, "stack": INT})), "styles": arr(obj({"id": NSTR, "weapon": NSTR, "attacks": INT})),
            "books": arr(STR), "identified": arr(STR),
            "recipes": arr(obj({"name": STR, "template": STR, "base": NSTR, "ingredients": {"type": "object", "additionalProperties": INT}})),
            "kills": obj({"total": INT, "byKind": counter("kind -> count")}),
            "inventory": arr(ITEM), "equipment": arr({**ITEM, "properties": {**ITEM["properties"], "slot": NINT}, "required": ITEM["required"] + ["slot"]}),
            "reputationEntries": INT, "trackedQuest": NSTR, "trackedPhase": NSTR}),
        "quests": obj({
            "total": INT, "states": counter("state -> count"), "byAct": {"type": "object", "additionalProperties": counter("state -> count")},
            "list": arr(obj({"id": STR, "act": STR, "title": STR, "state": {"enum": ["failed", "completed", "active", "not started"]}, "primary": BOOL, "phases": INT, "phasesDone": INT, "phase": NSTR, "hint": NSTR})),
            "journalEntries": INT, "journalRead": INT, "unreadQuests": arr(NSTR)}),
        "story": obj({"phases": INT, "npcs": INT, "dialogFlags": INT, "modulesVisited": arr(STR), "mapRegions": INT, "stores": INT}),
        "variables": obj({"total": INT, "questFlags": {"type": "object", "additionalProperties": True}, "monologues": INT, "cutscenes": INT}),
        "world": arr(obj({"module": STR, "scripts": INT, "areas": arr(obj({k: (STR if k in ("resref", "name") else INT) for k in
                         ("resref", "name", "creatures", "placeables", "doors", "waypoints", "monsters", "monstersKilled", "containerItems")}))})),
    }),
}
Path(__file__).resolve().parent.parent.joinpath("schema.json").write_text(json.dumps(schema, indent=1) + "\n")
