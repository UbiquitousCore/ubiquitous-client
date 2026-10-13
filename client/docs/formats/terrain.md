# World tiles: `.itm`, `.trn`, `.msk` and `.shw`

A map is a grid of square tiles. Each tile has up to five files: scenery
placements (`.itm`), ground (`.trn`), two ground-blend masks (`.msk`) and a
shadow map (`.shw`). This page is their byte layout, worked out by parsing
every such file in the user's own packs. Field names here are this
document's own; a decoder is free to pick better ones.

## Population checked

| Build | Pack                        | `.itm` | `.trn` | `.msk` | `.shw` |
| ----- | --------------------------- | ------ | ------ | ------ | ------ |
| 1.1.4 | `human_selection.bin`       | 17     | 116    |        |        |
| 1.1.4 | `human_selection_layer.bin` |        |        | 101    | 93     |
| 2.2.0 | `human_selection.bin`       | 17     | 116    |        |        |
| 2.2.0 | `human_selection_layer.bin` |        |        | 101    | 93     |
| 2.2.0 | `city.bin`                  | 50     | 234    |        |        |
| 2.2.0 | `land1.bin`                 | 787    | 2,065  |        |        |
| 2.2.0 | `middle_land.bin`           | 1,079  | 3,219  |        |        |

Every `.itm` and `.trn` listed parses with the layout below. The
`human_selection` files decode to identical contents in both builds. The
extracted builds carry layer packs for `human_selection` only, so the mask
and shadow facts below rest on that one map.

## The grid

A tile is 64 world units a side on both horizontal axes. A world position is
`tile × 64 + local`, with x east–west, y up and z north–south. Every per-tile
file is named after its tile, four characters per coordinate: `0017_0012`,
or `-025_-016` for negative ones (a minus sign then three digits).

| File         | Pack              | Path                               |
| ------------ | ----------------- | ---------------------------------- |
| scenery      | `<map>.bin`       | `world/<map>/items/<x>_<z>.itm`    |
| ground       | `<map>.bin`       | `world/<map>/terrain/<x>_<z>.trn`  |
| blend mask 0 | `<map>_layer.bin` | `world/<map>/layers/<x>_<z>_0.msk` |
| blend mask 1 | `<map>_layer.bin` | `world/<map>/layers/<x>_<z>_1.msk` |
| shadow map   | `<map>_layer.bin` | `world/<map>/layers/<x>_<z>.shw`   |

In every `.itm` and `.trn` the tile coordinates in the header match the
file name. Scenery is placed from two sources: the tile's `.itm`, and the
spawn tables in `tables.bin` (see [ftable.md](ftable.md)).

## General rules

- **Little-endian**, no padding between fields.
- Types: `i16`, `u16`, `i32`, `u32` (2 or 4 bytes), `f32` (IEEE-754 single),
  `vec3` (three `f32`), `quat` (four `f32`: x, y, z, w).

### Path tables

Both `.itm` and `.trn` end in the same kind of path table:

| Type              | Field     | Notes                                                                            |
| ----------------- | --------- | -------------------------------------------------------------------------------- |
| `u32`             | pathCount |                                                                                  |
| `u32` × pathCount | pathEnd   | where each path's span ends, counted from the start of the text blob; cumulative |
| bytes             | text blob | span _i_ runs from `pathEnd[i−1]` (0 for the first) to `pathEnd[i]`              |

- Each span holds one ASCII path, a zero byte, and zero padding up to a
  multiple of 4. In the `.itm` files every span is exactly the path length
  plus one, rounded up to 4. In 15 `.trn` spans the bytes after the zero are
  leftover text rather than zeros. Take the text up to the first zero byte
  in the span.
- Paths are full pack paths with directories. No path contains a zero byte
  or a byte outside printable ASCII.

## `.itm`: scenery placements

```
file
├── header              24 bytes
├── placement × placementCount     56 bytes (stamp 3) or 64 (any other stamp seen)
└── path table          (pathCount repeated, pathEnd[], text blob)
```

### Header

| Offset | Type    | Field          | Notes                                                    |
| ------ | ------- | -------------- | -------------------------------------------------------- |
| 0      | 4 bytes | signature      | ASCII `AITM`                                             |
| 4      | `u32`   | stamp          | 3 or 4 in the files seen; picks the record width, see below                 |
| 8      | `i32`   | tileX          |                                                          |
| 12     | `i32`   | tileZ          |                                                          |
| 16     | `i32`   | placementCount | 1 to 1,275                                               |
| 20     | `i32`   | pathCount      | 1 to 49; the number of distinct paths, not of placements |

The path table's own `pathCount` (right after the last placement) equals the
header's in every file.

| Build | Stamp 3            | Other stamp |
| ----- | -------------------- | ----------- |
| 1.1.4 | 0                    | 17          |
| 2.2.0 | 4 (all in `land1`)   | 1,929       |

The stamp is per file, not per build. File sizes run from 132 to 82,300 bytes.

### Placement record

Offsets from the start of the record.

| Offset | Type      | Field          | Notes                                                                                                  |
| ------ | --------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| 0      | `u32`     | placementKind  | 2 = a model (174,620 records), 8 = an effect (2,020), 15 = a model (13, 2.2.0 only)                    |
| 4      | `u32`     | placementId    | a small serial number. Not unique within a tile in 89 tiles. The client does not act on it             |
| 8      | `u32`     | unknown        | −1 in 1,280 records, other values elsewhere. Meaning not settled                                       |
| 12     | `u32`     | pathIndex      | index into the tile's path table; always below pathCount                                               |
| 16     | `vec3`    | position       | tile-local: x and z in [0, 64), y (height) from −400 to 149                                            |
| 28     | `quat`    | storedRotation | the conjugate of the rotation to apply (see below)                                                     |
| 44     | `vec3`    | scale          | per axis                                                                                               |
| 56     | `u32` × 2 | trailing words | only when the record is 64 bytes wide. Pairs seen: (255, 255), (177, 255), (−1, −1) and a few others. Meaning not settled |

- The path of a kind-2 or kind-15 placement is a `.bdae`; of a kind-8
  placement, a `.beff`. No other extension appears.
- **Rotation.** The stored quaternion is the inverse of the placement's
  rotation in the world; conjugate it (negate x, y, z) once when building the
  placement. Scenery and collision must use the same conversion or they end
  up at opposite angles. All but 2 of 176,653 stored quaternions are unit
  length to 10⁻³; those two have length 0.996 and should be normalised.
- **Scale.** Equal on all three axes in 175,087 records. 33 records have a
  zero or negative component.
- In one tile a path in the table is used by no placement. In one tile the
  path table is followed by 112 bytes of leftover path text; ignore bytes
  after the last span. 43 tiles list two paths that differ only in case.

## `.trn`: ground

```
file
├── header            24 bytes      at 0
├── chunk × 64        12 bytes each at 24
├── heights           65 × 65 i16   at 792
├── tints             65 × 65 u16   at 9,242
├── normals           65 × 65 × 3 bytes at 17,692
├── pad               1 byte        at 30,367, always 0
└── path table                      at 30,368, ends at end of file
```

Every `.trn` has this fixed 30,368-byte prefix, and in every file the path
table's last span ends exactly at the end of the file. No search is needed.

### Header

| Offset | Type    | Field     | Notes                                                                                   |
| ------ | ------- | --------- | --------------------------------------------------------------------------------------- |
| 0      | 4 bytes | signature | ASCII `ATIL`                                                                            |
| 4      | `u32`   | version   | 9 in every file                                                                         |
| 8      | `i32`   | tileX     |                                                                                         |
| 12     | `i32`   | tileZ     |                                                                                         |
| 16     | `u32`   | tileFlags | 0, 1, 2 or 3; once `0x63`. Meaning not settled; it does not track visible water or tint |
| 20     | `u16`   | unknownA  | 0 or 65,535                                                                             |
| 22     | `u16`   | unknownB  | 0, 1, 2 or 65,535                                                                       |

### The sample grid

The heights, tints and normals are three 65 × 65 grids over the tile, one
sample per world unit, edges included. Sample `(row, col)` is at index
`row × 65 + col`, at tile-local position `x = col`, `z = row`. The last
column of a tile equals the first column of the tile to its east (+x) in
5,056 of 5,162 neighbour pairs; the last row equals the first row of the tile
to its south (+z) in 5,063 of 5,155. With rows and columns swapped, fewer
than 700 match.

### Heights

`i16`, in hundredths of a unit: height = value / 100. Raw values run from
−9,500 to 22,045.

A tile whose every sample is −1,000 is **empty** (no ground): 233 tiles in
2.2.0, none in 1.1.4. The value on its own is an ordinary height of −10: 529
non-empty tiles contain some samples of exactly −1,000. Only a tile that is
−1,000 everywhere is empty.

### Tints

`u16` per sample, in 5-6-5 bit form: bits 11–15, 5–10 and 0–4. The ground
shader multiplies the ground colour by it. All samples are `0xFFFF` (white)
in 4,653 of 5,401 non-empty tiles. Almost every non-white sample is grey (the
three fields equal after scaling); of the few that are not, the top field is
the larger in 479 of 535. Which of the outer fields is red and which blue is
**not settled by the data**; the client reads the top five bits as red.

### Normals

Three signed bytes per sample: x, y, z in the client's axes (y up), scaled so
that length is about 127. Checked against normals computed from the height
grid, the mean agreement is 0.9995 (cosine) with the bytes read in this order
and signs; any other order or sign scores 0.55 or less.

### Chunks

The tile is 8 × 8 chunks of 8 × 8 units. Chunk _i_ covers columns
`8·(i mod 8)` to `8·(i mod 8) + 8` and rows `8·⌊i / 8⌋` to `8·⌊i / 8⌋ + 8`
of the sample grid (so chunk index runs along x first). The mask test below
confirms this order.

Chunk record, 12 bytes:

| Offset | Type  | Field      | Notes                                                               |
| ------ | ----- | ---------- | ------------------------------------------------------------------- |
| 0      | `u32` | chunkFlags | bit 16: water; bit 17: hole. Bits 0–15 are always 0                 |
| 4      | `i16` | waterLevel | hundredths of a unit, −9,500 to 7,500                               |
| 6      | `i16` | layer0     | index into the tile's path table: the base ground texture. Never −1 |
| 8      | `i16` | layer1     | texture blended over the base by blend mask 0; −1 = none            |
| 10     | `i16` | layer2     | texture blended over that by blend mask 1; −1 = none                |

- chunkFlags values seen: `0x00000000`, `0x00010000`, `0x00020000` (9 chunks),
  `0x00030000` (7), and `0xCCCC0000` (2,734) / `0xCCCD0000` (402) in 49
  `land1` tiles. The last two look like an uninitialised-memory fill in bits
  18–31. Read only bits 16 and 17.
- **Water.** The water bit is set on most chunks, usually with a level far
  below the ground. Water shows only where its level rises above the ground.
  No stored bit marks a chunk as visible.
- **Layers are positional.** Every index is −1 or below the path count.
  Filled layers, both builds (2.2.0 / 1.1.4): base only 186,039 / 5,471; base
  - layer 1 30,218 / 193; base + layer 2 16,223 / 794; all three 128,096 /
  966. A chunk can fill layer 2 and leave layer 1 empty; layers must never be
       shifted down to close the gap, or the ground blends by the wrong mask.
- Paths are `.tga` textures with directories; 1 to 16 per tile.
- **A named texture can be missing from the build.** Across the 16 maps in
  1.1.4 that ship both a map pack and a layer pack (492,125 drawn chunks),
  273 chunks name a base texture, 88 a layer1 and 219 a layer2 that is in no
  pack, looked up by file name as every texture is. Of the 307 missing upper
  layers, 144 have an all-zero patch in their blend mask, so they would show
  nothing anyway; 163 have some non-zero texels, 123 of them above a quarter. A
  missing upper layer must not stop the chunk drawing its other layers;
  the client treats it exactly like an empty (−1) slot.
- **An empty layer can have a non-zero mask.** In the same population,
  about 6,500 chunks leave layer1 or layer2 empty while the matching mask
  has texels above a quarter over them. The build's ground program blends
  every slot by its mask whether or not a texture is bound, so how the game
  draws these is not settled by the data. The client weighs such a layer at
  zero, so the layers beneath show through (this project's choice). Found by resolving
  every chunk's layer paths against the texture index of the user's own
  1.1.4 packs.

## `.msk`: blend masks

A plain 256 × 256 grid of `u8`, no header, 65,536 bytes. Texel
`(row, col)` is byte `row × 256 + col`; rows run along z and columns along x,
the same way as the sample grid, so a chunk covers 32 × 32 texels.

`<x>_<z>_0.msk` is the mask for layer1 and `<x>_<z>_1.msk` for layer2: 255
shows that layer fully, 0 not at all. This is established by comparing each
chunk's texels with its layer indices in `human_selection`: a chunk whose
layer1 is −1 has an all-zero patch in mask 0 in 1,937 of 1,977 chunks, and a
chunk that uses it has a non-zero patch in 1,078 of 1,159. With the chunk
order transposed the split is much weaker (1,749 / 228 and 890 / 269).

A tile can lack either mask (67 of the 116 tiles lack mask 0, 64 lack mask
1); treat a missing mask as all zero. Across a tile edge, texels do not
repeat exactly (mask 0: all 256 edge texels equal the neighbour's in 15 of 40
pairs), so how the 256 texels map onto the 64-unit tile — texel centres, or
edge-inclusive — is **not settled by the data**.

## `.shw`: shadow map

Same form as a mask: 256 × 256 `u8`, no header, same row and column order.
0 is fully lit; values reach 128 at most. 24 of the 116 tiles have no shadow
map; treat a missing one as all lit. Edges repeat the neighbour's texels
exactly in 74 of 84 pairs.

The client packs the three layer files into one RGB texture per tile: mask
0 in red, mask 1 in green, shadow in blue.

## Differences between the builds

None in any layout. 2.2.0 adds the maps `city`, `land1` and `middle_land`,
and `land1` is the only place version-3 `.itm` files appear.

## What the decoder must provide

These files import from `client/src/assets/formats/terrain.ts`. A new
decoder must give them what they need, under whatever names it chooses; the
importing code is updated to match.

| File                                               | Imports                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `client/src/assets/providers/localTile.ts`         | `TRN_SIDE`, `parseItm`, `parseTrn`, `tileName`; types `ItmTile`, `TrnTile` |
| `client/src/assets/providers/PackAssetProvider.ts` | `layerName`                                                                |
| `client/test/realPacks.test.ts`                    | `parseItm`, `parseTrn`, `tileName`                                         |

- `parseItm(bytes)` returns `{ version, recordSize, tile: [x, z], count,
names: string[], items }`, each item `{ model: string, ref: number,
nameIndex: number, pos: [x, y, z], rot: [x, y, z, w], scale: [x, y, z] }`.
  `rot` is the stored quaternion, not yet conjugated (`localTile` does
  that). `ref` is the field at record offset 8. It throws an error of its own
  class on a wrong signature or a table that does not fit.
  `localTile` reads `tile`, `items[].model`, `pos`, `rot` and `scale`.
- `parseTrn(bytes, wantHeights = true)` returns `{ version, side: 65,
textures: string[], chunks, flat: boolean, heights: Float32Array | null,
colours: Uint16Array | null }`. `heights` are in world units, row-major as
  above; `heights` and `colours` are null and `flat` true for an empty tile
  or when `wantHeights` is false. Each chunk is `{ chunk: [cx, cz], flag,
hasWater, isHole, waterLevel (world units), textures: [l0, l1, l2] }`, with
  an out-of-range index turned into −1. It throws on a wrong signature or a
  file too short for the height grid. `localTile` reads `flat`, `heights`,
  `colours`, `textures`, and per chunk `chunk`, `hasWater`, `isHole`,
  `waterLevel`, `textures`.
- `TRN_SIDE` is 65.
- `tileName(map, kind, x, z, ext)` builds `world/<map>/<kind>/<stem>.<ext>`
  and `layerName(map, x, z, layer | null)` builds the mask path for layer 0
  or 1, or the shadow path for null, both with the four-character stem
  above. `tileStem(x, z)` is exported and builds the stem.
