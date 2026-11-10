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
| `spell_new` | before 1.1.4 | no column 25 (set only on mount spells) |
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

`client/test/columnLayout.test.ts` holds every revision to its own format;
`client/test/tableLayoutPacks.test.ts` holds the layouts to whichever
builds are on disk.

To add a build: point `tableLayoutPacks.test.ts` at its `tables.bin`. It
lists each table whose format no layout knows; add a revision for each.
