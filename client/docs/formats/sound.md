# Sound (`sound.bin`, `.wav`, and the sound tables)

Every sound file in `sound.bin` is RIFF/WAVE, and the
tables in `tables.bin` say which file plays when. This page is what the
client relies on, worked out by decoding every file in the user's own 2.2.0
build and reading the tables beside it. Field names are this document's own.

## The pack

`sound.bin` is an ordinary pack (see [pack.md](pack.md)). In 2.2.0 it holds
1,665 `.wav` files under `sound/`, all stored rather than deflated, and two
`.beff` files. Names are lower case: `m_…` is music, `sfx_…` a sound effect,
`vfx_…` a voice.

## WAV files

Standard RIFF: `RIFF`, a length, `WAVE`, then chunks of a four-letter id and
a little-endian `uint32` length, padded to even. `fmt ` gives the coding;
`data` the samples; `fact`, when present, the true frame count, which trims
the padding of a final ADPCM block. Every file is 32,000 Hz, except three at
8,000 Hz.

| Coding (fmt tag)                | Files | Channels               | Block                  |
| ------------------------------- | ----- | ---------------------- | ---------------------- |
| IMA ADPCM (`0x11`), 4-bit       | 1,334 | 1,232 mono, 102 stereo | 1,024 bytes (8 at 512) |
| Microsoft ADPCM (`0x02`), 4-bit | 307   | 287 mono, 20 stereo    | 1,024 bytes            |
| Linear PCM (`0x01`), 16-bit     | 24    | mono                   | —                      |

Browsers decode only the PCM ones themselves, so the client decodes all
three (`assets/formats/wav.ts`), following the public IMA and Microsoft
specifications:

- **IMA**: each block opens with four bytes per channel — the first sample
  (`int16`) and the step index (`uint8`, then a spare byte) — and that
  sample is the block's first output. Codes follow in runs of four bytes per
  channel in turn, eight samples per run, low nibble first.
- **Microsoft**: each block opens with the predictor index (one byte per
  channel), the step scale, then the two seed samples (`int16` per channel
  each), the later seed first. The seeds are output oldest first; codes then
  run high nibble first, channels alternating nibble by nibble. The `fmt `
  chunk carries samples per block and the predictor pairs (the standard
  seven in every shipped file).

`realPacks.test.ts` decodes every file and checks that each coding reads as
sound rather than noise.

## `c_sound` — one row per sound

`uuusfffuuuuuuuuuuu`, keyed by column 0. Every meaning below was read off
the rows themselves: what the files they name are called, and which rows
set what. Where the data does not settle a meaning, the reading is marked
as this project's own.

| Column | What it holds                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1      | How many numbered files the sound has; 0 or 1 for one. Matches the files the pack ships on 400 of the 449 rows above 1 |
| 2      | Flags; see below                                                                                                       |
| 3      | The file, e.g. `sound/sfx_npc_wolf_hurt_1.wav`                                                                         |
| 4      | Volume, 0.2 to 1 (1 on 940 of 978 rows)                                                                                |
| 5      | 0 on every row                                                                                                         |
| 6      | 0 on most rows; 10 to 150 on 40. Taken as how far that sound carries, in world units (own reading)                     |
| 7      | A `c_sound_bank` key                                                                                                   |
| 8-17   | Not read                                                                                                               |

Column 2's bits, by which rows set them:

| Bit | Set on                                                                           | Read as                                |
| --- | -------------------------------------------------------------------------------- | -------------------------------------- |
| `1` | exactly the 53 `m_…` rows                                                        | music                                  |
| `2` | creature, spell, weapon and object sounds; never on interface, music or ambience | heard from where it happens            |
| `4` | music, ambience, running objects (a fountain, a volcano), files named `…_loop`   | loops                                  |
| `8` | mostly creature, weapon and footstep sounds, the ones heard over and over        | varied from play to play (own reading) |

A sound with _n_ files names the first; the others are the same name with
the number after the last underscore changed, `_1` to `_n`. A few rows leave
off the `.wav`, and a few families skip a number (`_2` and `_3` shipped, `_1`
not). 23 of 978 rows in 2.2.0 name files the build does not ship at all.

## `c_sound_bank` — kinds of sound

`usu`: key, a name (`INTERFACE`, `MC_MOVE`, `NPC_HURT`, `NPC_AGGRO`), and a
number whose low 16 bits run from 1 to 8. Taken as how many of the bank's
sounds play at once (own reading: the counts sit with the kinds, one for an
aggro call, four for hurt cries). Bit 16 is set on some banks and is not
read; the data does not say what it means.

## `sound_solution` — what a body says

`uuuuuuuuuuuuuuuus` (one `u` fewer in 1.0.2): key, then one `c_sound` id per
column, then a description. Each column is named by the files its ids point
at across the rows: 1 idle, 2 greeting, 3 attack, 4 jump, 5 aggro, 6 drink,
7 die, 8 eat, 9 hurt, 10 shout, 11 hello, 12 bye, 13 cry, 14 critical. From
1.1.4, column 15 names a few `…_idle_special` sounds and is not read. Some
ids name no `c_sound` row and stay silent.

A body's set is the last column of the `creaturemodeldata` row its display
row wears: those values are `sound_solution` keys, and a set's description
matches its model row's (the male human model's set is "Male Human"). The
playable races' display rows each resolve to their own set.

## Zones

In `zones`, the zone's music and its ambient loop are the two `u` columns
just ahead of the first string column (18 and 19 in 1.0.2 and 1.1.4, 20 and
21 in 2.2.0): their values are `c_sound` ids of `m_…` and `sfx_amb_…` files,
0 for none. Only 43 of 361 zones in 2.2.0 carry music of their own.

`ZoneSpecialMusic` (`uu`, from 1.1.4) pairs a zone id with a `c_sound` id of
an arena's or a region's `…_combat` piece: the zone's fight music.

## Collision surfaces

In a `.phy` block's flags (see [phy.md](phy.md)), bit `0x400` is set on
wooden things: the 99 files in 2.2.0 that carry it are bridges, docks,
wharves, piers, wooden plates and shelves, inns, boats and a watermill.
