# AGENTS.md

Unified instruction file for any coding agent (Claude Code, Codex, or similar). Both `CLAUDE.md` and `AGENTS.md` resolve to this content. Machine-specific paths (where the saves and the game install are) live in `AGENTS.local.md`, which is not committed.

## What this is

A Witcher 1 save goes in, a report comes out: a Python CLI (`witcher_to_md.py`: Markdown, JSON against `schema.json`, or a combined history of many saves) and a browser app (`index.html` + `app/*.js`) that ports the Python and is held byte for byte by `tools/parity.mjs`. Python side: the `witcher/` package, standard library. Web side: no framework, no build step, Mermaid vendored.

## Commands

```bash
python3 witcher_to_md.py                              # newest save on this machine (auto_find)
python3 witcher_to_md.py x.TheWitcherSave -o x.md|x.json
python3 witcher_to_md.py dir1 dir2 f.TheWitcherSave -o out.md   # COMBINED history; --combined forces it for one save
python3 -m unittest discover -s tests                 # sampled saves decode completely + schema check
node tools/parity.mjs <folder|save>...                # THE gate for the web port: py vs js summary, markdown, combined doc
python3 tools/gen_schema.py                           # regenerate schema.json after changing the summary shape
python3 tools/gamefiles.py build <Data folder> db_tw1 # regenerate the shipped game tables from an install
python3 -m http.server <free port> --bind 127.0.0.1   # CHECK `ss -ltn` for the port first; never kill by port
```

## Architecture

```
witcher/container.py   header, file index, gzip'd ERF modules -> save dict; read() raises WitcherError for anything unreadable
witcher/gff.py         GFF V3.x: lazy structs + a flat audit() pass
witcher/tw1.py         summarize(save, db) -> one JSON-able dict; EVERYTHING the writers show is computed here
witcher/render.py      summary -> Markdown        witcher/combine.py   many summaries -> history document
app/*.js               line-for-line ports; view.js, mdview.js, main.js, worker.js are web-only
db_tw1/*.json          item/kind/sign tables generated from the install by tools/gamefiles.py
```

**The reading rule: every byte is accounted for.** `integrity.undecodedBytes` is bytes of the file no reader claimed (index gaps, ERF gaps, unknown header bytes). It must be 0 on every save, and `tests/test_saves.py` and the report both say so. `unreferencedBytes` is a different figure: dead index space inside quest files that nothing points at. Do not fold one into the other, and do not add a guess to make a number go to zero; find the structure.

**Facts that cost time to find** (details in `notes/format.md`): the index is at the END of the file, located by the last 8 bytes; the thumbnail is a real TGA listed in that index; an ERF can hold a `0xBAADF00D` placeholder entry that must be skipped; LocString language ids are language*2+gender and English is 2, 4 or 6; in a quest a `Completed` flag does not imply `QuestBegan`, so state is derived failed, completed, active, not started in that order.

## The parity gate (do not skip)

`app/` is a port, and a port drifts silently. `tools/parity.mjs` runs both readers on the same saves and compares the summary JSON (value AND key order), the Markdown (byte for byte) and the combined document. Traps: Python `round()` is half-even and JS `Math.round` is not (`pyRound` in `app/tw1.js`); a JSON number has no int/float split, so `render.n()` prints whole-valued floats as integers in both; `str(None)` is `None` and a template literal prints `null`; JS objects reorder integer-like keys, so no map key may be a bare integer. After ANY change to `witcher/*.py` or `app/*.js`: regenerate the schema if the shape moved, run the parity on a few saves, and the whole set before declaring done.

## Conventions

- Match `~/Code/satisfactory-analyzer` and `~/Code/sl2-analyzer`: comments in the owner's direct voice, the point first and why. No restating the obvious.
- Prose in the README, the page and report text follows the joy-writing skill's hard bans (the tool-as-subject sentence with two chained verbs, and the exclusion closer). Run the skill's two greps over any draft.
- Output shape lives in `render.py` / `render.js`: bold-label bullets and tables. No emoji, no em dashes.
- Never commit or push. Hand a pwsh one-liner per the user's global instructions.

## Limits

No play-time clock exists in the save, so the combined history is ordered by slot number. Ability names are the game's internal ids made readable. Only the first game is read.
