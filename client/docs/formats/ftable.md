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

The tables carry no column names, only the format string. Every column the
client uses is therefore a number. The columns every zone load depends on
are checked against the letter they should have when the tables load; a
mismatch stops the load rather than reading a neighbouring column.

Some columns sit at different positions in different builds, so they are
located by shape instead of by number:

- `map_info`: the map name and the `.wld` path are the first two string
  columns side by side.
- `staticobject_spawns`: one scale float at column 11 in the oldest builds,
  three (x, y, z) from 1.1.4 on.
- `staticobject_displayinfo`: the six node names and six effect paths an
  object carries are the one run of twelve string columns.
