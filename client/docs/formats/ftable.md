# Tables (`.tbl`, "FTABLE")

Reader: `client/src/assets/formats/ftable.ts`. Column meanings:
`client/src/assets/formats/tables.ts`. Tests: `client/test/formats.test.ts`,
`client/test/spellTables.test.ts`, `client/test/realPacks.test.ts`.

Every table lives in `tables.bin` as `tables/<name>.tbl`.

## Header (44 bytes)

All numbers are little-endian `uint32`.

| Offset | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| 0      | the six ASCII bytes `FTABLE`, then two zero bytes                      |
| 8      | `0x00100000` in every shipped table; not read                          |
| 12     | row count                                                              |
| 16     | column count                                                           |
| 20     | where the row keys start (44 in every shipped table)                   |
| 24     | where the format string starts (right after the keys)                  |
| 28     | where the rows start (right after the format string and its zero byte) |
| 32     | row stride in bytes                                                    |
| 36     | where the string pool starts (the end of the rows)                     |
| 40     | zero in every shipped table; not read                                  |

The row keys are one `uint32` per row. Lookups by key keep the first row
when a key repeats.

## Format string and cells

One letter per column. Each row is its cells back to back, with no padding.

| Letter   | Cell                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| `k`, `u` | `uint32`                                                                                 |
| `i`      | `int32`                                                                                  |
| `f`      | `float32`                                                                                |
| `h`      | `int16`                                                                                  |
| `c`      | `int8`                                                                                   |
| `s`      | string: a `uint32` file offset, then an `int16` length that counts the closing zero byte |

The letter widths add up to the stated stride in every shipped table. An
unknown letter is read as four bytes.

Strings are UTF-8 when every byte says so, and otherwise single-byte
Western European text (windows-1252): quest prose stores its curly
apostrophes as one byte each.

## No column names

The tables carry no column names, only the format string, and columns move
between builds. Each table the client reads has one layout in
`client/src/assets/formats/tableLayouts.ts`: its columns by name at their
place in the 1.1.4 format, and for every other known format which of those
columns it lacks and where it adds its own. `WorldTables` resolves every
layout against the formats it loaded, and all reading goes through the
names (`tables.columns.items.quality`).

[table-columns.md](table-columns.md) lists every column of every such table:
its number in each build, the name the client reads it under, and what its
rows show. It is generated from the layouts.

- A column a build does not have resolves to -1 and reads as 0 or `''`.
- A required column of the wrong type stops the load.
- A format no layout names is read where the reference has each column, as
  long as its type still agrees, and the log says which columns were left.

Each difference was found by lining two builds' rows up by key and taking
the arrangement under which the rows they share agree. What moves, in 1.1.4
column numbers:

| Table | Builds | Difference |
|---|---|---|
| `items` | before 1.1.4 | one of the always-empty columns 20-22 is absent; the row ends early |
| `spell_new` | before 1.1.4 | no column 25 (the spell's category, below) |
| `spell_new` | 2.2.0 on | columns of its own ahead of 47 |
| `zones` | 1.0.x | no columns 22-31: a dome and a hill, no sun or halo |
| `zones` | 2.2.0 on | two floats ahead of 16 |
| `map_info` | 2.2.0 on | three floats ahead of 5 |
| `spell_talent` | 1.1.5, 2.2.0 on | four columns after each rank's spell |
| `storage_upgrade` | 2.5.0 on | a column ahead of 2 |
| `staticobject_spawns` | 1.0.x | one scale where later builds have one per axis |
| `staticobject_proto` | before 1.1.4 | no festival through 1.0.3; from 1.1.0 it sits one earlier |
| `c_spellvisual` | before 1.1.4 | no ending phase (column 7) |
| `c_spellvisualeffect` | 1.0.0 | no flight or projectile count |
| `sound_solution` | before 1.1.4 | no column 15 |

Only 20 of the 496 tables change format anywhere from 1.0.0 to 4.2.21, and
none swaps two columns of the same type: lining every same-format table up
by key between each pair of neighbouring builds leaves only single columns
whose values were retuned (quest reward amounts in 2.5.0, crafting numbers
in 4.2.21). Where a new column sits among neighbours that are mostly zero,
it was placed by the rows where either build holds a value, not by all rows:
by all rows an empty column agrees with any other.

## What later builds add

Columns the client does not read, as far as the rows say what they hold.
Numbers are the build's own column numbers.

| Table | Build | Column | Holds |
| --- | --- | --- | --- |
| `spell_new` | 2.5.0 on | 25 | more categories than mounts; see below |
| `spell_new` | 2.5.0 on | 55 (70 in 4.2.21) | 0 or 1000 |
| `spell_new` | 4.2.21 | 49 to 61 | thirteen columns of bit flags, set on a few hundred spells each; 62 and 63 are empty |
| `spell_new` | 4.2.21 | 71 to 73 | small numbers on a few dozen spells; 73 runs 50 to 72 on about 1,000. Not settled |
| `items` | 2.2.0 on | 113 (string) | a price in other items, written `<item id> * <count>` and joined with `+`; every id is an item (393 of 393 in 2.2.0, 2,429 of 2,429 in 4.2.21) |
| `items` | 4.2.21 | 116 | on gems, an item id |
| `items` | 4.2.21 | 119 | 40, 60, 70 or 75 on weapons and armour; a Lesser, a plain and a Greater sword carry 40, 60 and 70 |
| `items` | 4.2.21 | 121 to 133 | set on 18 items of class 16 only: id lists as strings, a spell id, and small numbers |
| `items` | 4.2.21 | 134, 135 | on the 60 class-17 boxes: a time in seconds (1,800 to 43,200) and a count |
| `creature_proto` | 2.5.0 on | 74 | 0 or 1 |
| `creature_proto` | 4.2.21 | 75 to 78 | a 0-or-1, a number that is 1 on nearly every row, a time-like number (10,000 to 45,000) on 40 rows, and a float |
| `zones` | 1.1.5, 2.2.0 on | the last | 0, or 3,600 on eleven zones in 4.2.21 |
| `zones` | 2.2.0 on | 16, 17 | two floats set on about 30 zones |
| `map_info` | 2.2.0 on | 5 to 7 | a position: x, height, z |
| `quests` | 4.2.21 | 167 | set on five quests |
| `t_bus_route` | 4.2.21 | 5 | 40 to 70 on every route |
| `storage_upgrade` | 2.5.0 on | 2 | 0 to 3 |
| `spell_effect` | 4.2.21 | 24 to 27 | numbers up to 6 on under 200 rows |

`achievement`, `item_set`, `spell_creation` and `sticker_package` change
format too; the client reads none of them.

### `spell_new` column 25 is a category

In 1.1.4 and 2.2.0 it is set only on mounts (6, or 2 on the arena's war
mounts), and every spell that carries it has an effect that seats its caster
(aura kind 1, detail 50). From 2.5.0 other spells carry one too, and in
4.2.21 1,091 spells with a category seat nobody: 12 is on 830 pet abilities,
13 on 116 class abilities, 4 on bandages and stat scrolls, 14 and 15 on a
few dozen others. So a mount is read from its effect, never from this column
(`WorldTables.spellStats`).

## Which pack a file is in

4.2.21 keeps the whole `ui/` tree (interface movies and every picture under
it) and every `texture/` picture in `res_t.bin`; `res.bin` holds models,
effects and creature art. Earlier builds keep `ui/` in `res.bin`. Anything
under either is looked for in both.

`client/test/columnLayout.test.ts` holds every revision to its own format;
`client/test/tableLayoutPacks.test.ts` holds the layouts to whichever
builds are on disk.

To add a build: point `tableLayoutPacks.test.ts` at its `tables.bin`. It
lists each table whose format no layout knows; add a revision for each.
