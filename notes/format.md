# The Witcher 1 save format as implemented

Every claim here was checked against the 75 saves of one playthrough; all of them decode with zero undecoded bytes.

## The container

A `.TheWitcherSave` is one file holding a small virtual file system:

1. **Header, 0x2028 bytes.** `RGMH`, `u32 1`, `u32 0x2028`, a 16-byte GUID at 0x18, then three 2 KB UTF-16 name fields at 0x28 (a header title, the same in every save here), 0x828 (the area display name) and 0x1028 (the area again). The last bytes are a 64x64 24-bit TGA thumbnail header: the TGA file starts at 0x2028 and is listed in the index like any other file.
2. **Files, back to back.** Sizes and offsets come from the index.
3. **The index.** Per file: `u32 name length`, the path (`<save name>\<file>`), `u32 size`, `u32 offset`.
4. **The last 8 bytes:** `u32 index offset`, `u32 file count`. The index must end exactly at those 8 bytes.

The files: `NNNNNN.tga` (thumbnail), one `<module>.sav` per module the game has loaded, `player.utc` (Geralt), one `<quest>.qst` per quest (137 here), `save.qdb`, `savenfo.txt` (the area name as plain text) and `save_NNNNNN.smm`.

## Modules

A `.sav` is one **gzip** member holding a BioWare **ERF** (`MOD V1.0`, 160-byte header, key list of 24-byte entries, resource list of `u32 offset, u32 size`). The resources are `IFO` (module state), and an `ARE` and a `GIT` per area, plus compiled scripts (`NCS`) and their source (`NSS`) in early saves.

An ERF can end with a **placeholder entry**: empty name, type 0xFFFF, offset and size both `0xBAADF00D`. It has no data and is skipped. Without that rule a size sum comes out at three billion.

## GFF V3.3

Header: type, version, then six (offset, count) pairs: structs, fields, labels, field data, field indices, list indices. A struct is `(type id, data-or-offset, field count)`: one field stores the field index inline, more than one points into the field-index table. A field is `(type, label index, data-or-value)`. Types 0 to 15 are the standard set (byte, char, word, short, dword, int, dword64, int64, float, double, CExoString, CResRef, CExoLocString, void, struct, list). No type above 15 appears in any of the 75 saves.

A **LocString** is `u32 total, u32 strref, u32 count`, then `(language id, length, bytes)` entries. The id is language*2+gender, and `languages.2da` in the install gives the languages: 2, 4 and 6 are the English variants, 0 is debug text, 10 is Polish, 20 is German. Strings are UTF-8.

## What lives where

- **Geralt** (`player.utc`, also repeated in the module's IFO): level (`ExpLevel`), `Experience`, `Gold`, `ItemList` and `Equip_ItemList` (full item structs, names included), `KnownList0` (spell ids; `db_tw1/spells.json` maps them to signs), `CharAbilities`, `StyleList`, `AlchIdent`/`AlchKnowledge`, `READBOOK_lst`, `KillList`, and `VarTable` (script variables).
- **Quests** (`*.qst`): one `MainPhase` struct with `QuestBegan`, `Completed`, `Failed`, `CurrPhase` and a `Phases` list; each phase has localized names and descriptions. A quest is "not started" until `QuestBegan` is set.
- **Areas** (`GIT`): creature, placeable, door, waypoint and monster lists; `WasKilled` on a monster record marks a kill. `ARE` carries the localized area name.
- **Map state** (`.smm`): difficulty setting, story NPCs, dialog flags, visited modules, stores.

## Dead space

Quest files carry field-index and list-index runs that no struct or list points at. They are the writer's leftovers, they hold no live data, and the report counts them separately from undecoded bytes.
