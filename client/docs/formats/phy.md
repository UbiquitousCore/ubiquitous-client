# Collision (`.phy`)

A `.phy` file is the collision shape of one model: a list of boxes, walls,
cylinders and triangle meshes. This page is the byte layout, worked out by
parsing every `.phy` in the user's own packs. Field names here are this
document's own; a decoder is free to pick better ones.

## Where the files are

A model `model/<dir>/<name>.bdae` has its collision at
`model/<dir>/<name>.phy`: the same path with the extension swapped. Case can
differ between the model's path and the collision file's, so look it up
without regard to case. Many models ship no `.phy` and are walk-through.

| Build | Pack            | `.phy` files | Binary | Text | Empty (0 bytes) |
| ----- | --------------- | ------------ | ------ | ---- | --------------- |
| 1.1.4 | `tables.bin`    | 1,622        | 1,620  | 1    | 1               |
| 2.2.0 | `model_phy.bin` | 2,337        | 2,334  | 3    | 0               |

`res.bin` holds none in either build. Every binary file in both builds parses
with the layout below and ends exactly on the last byte of its last block.

The four text files are plain ASCII notes that sit beside a binary file of
the same model. Read as a block count, their first four bytes give a value
in the billions. A decoder should treat a file whose count cannot fit in the
bytes that follow (fewer than 36 bytes per block), or a file shorter than 4
bytes, as "no collision", not as an error.

## General rules

- **Little-endian**, no alignment, no padding. Every field is 2 or 4 bytes
  and the file is read front to back.
- No offsets or section sizes. A block's length follows from its type and,
  for a mesh, its two counts. An unknown block type cannot be stepped over:
  stop there.
- **Axes.** The file stores the vertical axis third: `(x, y, z)` in the file
  is `(x, z, −y)` in the client's world (y up). This applies to positions,
  vertices and extents; an extent then loses its sign, since it is a size.
  Comparing each collision shape's extents with its model's extents over 801
  models, the swap fits better in 669 and no swap in 132; among the close
  fits, the sign flip of the old y agrees in 104 and disagrees in 48.
- Positions and vertices are in the model's own space, before placement.

Types used below:

| Type   | Size | Meaning                         |
| ------ | ---- | ------------------------------- |
| `i16`  | 2    | signed 16-bit integer           |
| `u16`  | 2    | unsigned 16-bit integer         |
| `i32`  | 4    | signed 32-bit integer           |
| `u32`  | 4    | unsigned 32-bit integer         |
| `f32`  | 4    | IEEE-754 single-precision float |
| `vec3` | 12   | three `f32`, in file axes       |

## Top-down layout

```
file
├── declaredBlocks          i32
└── block × (declaredBlocks or fewer — see below)
    ├── blockType           i32
    ├── types 2–4: primitive body     32 bytes
    └── type 7:    mesh body          32 bytes + vertices + faces
```

### The block count is an upper bound

`declaredBlocks` is never smaller than the number of blocks present, but it
is sometimes larger: the file simply ends early, always exactly on a block
boundary.

| Build | Count equals blocks | Count larger | Largest shortfall |
| ----- | ------------------- | ------------ | ----------------- |
| 1.1.4 | 1,568               | 52           | 53                |
| 2.2.0 | 2,274               | 60           | 53                |

Read blocks until `declaredBlocks` have been read or the file ends, whichever
comes first. Treat a block that would run past the end of the file as the
end. The data does not say what the missing blocks were.

## Block types

| blockType | Shape                           | 1.1.4 | 2.2.0 |
| --------- | ------------------------------- | ----- | ----- |
| 2         | wall (a flat upright rectangle) | 1,335 | 1,360 |
| 3         | box                             | 7,237 | 9,711 |
| 4         | cylinder                        | 927   | 1,112 |
| 7         | triangle mesh                   | 1,575 | 2,086 |

No other type appears in any binary file, 1 included. A decoder treats any
other type as unknown and stops there.

## Primitive body (types 2–4), 32 bytes

Offsets from the byte after `blockType`.

| Offset | Type   | Field      | Notes                                                                                                                              |
| ------ | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `u32`  | flags      | see [Flags](#flags)                                                                                                                |
| 4      | `f32`  | yaw        | turn about the vertical axis, radians, −π to π. Non-zero in 5,334 of 16,948 boxes, 524 of 2,039 cylinders and 2,546 of 2,695 walls |
| 8      | `vec3` | centre     | the shape's centre                                                                                                                 |
| 20     | `vec3` | halfExtent | half the size along each file axis; never negative in a primitive                                                                  |

Per shape:

- **Box**: extents 0 to 130 units.
- **Wall** (type 2): the second extent (file y, a horizontal axis) is 0 in
  every wall, so the shape is a rectangle standing upright, 2·x wide and
  2·z tall, turned by `yaw`.
- **Cylinder** (type 4): its axis is the file's vertical (third) axis. The
  first two extents are equal in 859 of 2,039 cylinders and differ in the
  rest, so the cross-section can be an ellipse. Every extent is at least
  0.0001.

## Mesh body (type 7)

Offsets from the byte after `blockType`.

| Offset | Type                 | Field       | Notes                                       |
| ------ | -------------------- | ----------- | ------------------------------------------- |
| 0      | `u32`                | flags       | see [Flags](#flags)                         |
| 4      | `vec3`               | position    | where the mesh's origin sits in the model   |
| 16     | `vec3`               | halfExtent  | half the size of the vertices' bounding box |
| 28     | `i16`                | vertexCount | 0 to 972                                    |
| 30     | `i16`                | faceCount   | 0 to 1,709                                  |
| 32     | `vec3` × vertexCount | vertices    | relative to `position`                      |
| …      | face × faceCount     | faces       | 8 bytes each, below                         |

A mesh block is `4 + 32 + 12·vertexCount + 8·faceCount` bytes, counting its
type word.

- **Vertices are stored centred on the origin.** In every non-empty mesh the
  centre of the vertices' bounding box is within 10⁻⁶ of the box size of
  (0, 0, 0), and `halfExtent` equals the box's half size. A vertex's place in
  the model is `position + vertex`.
- **Empty meshes.** 8 meshes (2 in 1.1.4, 6 in 2.2.0) have no vertices and no
  faces. Their position is (0, 0, 0) and every extent is −10,000,000, an
  inverted "nothing yet" box. Skip them.
- Both counts are signed in the file and never negative. Reject a negative
  count as a damaged block.

Face, 8 bytes:

| Offset | Type  | Field   | Notes                                         |
| ------ | ----- | ------- | --------------------------------------------- |
| 0      | `u16` | a       | vertex index                                  |
| 2      | `u16` | b       | vertex index                                  |
| 4      | `u16` | c       | vertex index                                  |
| 6      | `u16` | faceTag | 0 to 7 in every face; 0 in 145,188 of 199,447 |

- Every index is below `vertexCount` in every shipped face.
- 6 faces repeat a vertex. 13 meshes have vertices that no face uses.
- `faceTag` fits in three bits. Its meaning is **not settled by the data**;
  one bit per triangle edge is a plausible reading. The client ignores it.
- Winding is not settled by the data either: the file carries no normals.

## Flags

The flags word is the first field of every body. Only bits 0, 1, 10 and 14
are ever set, and never anything in the upper 16 bits. Both builds together:

| Value    | Box    | Cylinder | Wall  | Mesh  |
| -------- | ------ | -------- | ----- | ----- |
| `0x0000` | 16,395 | 2,028    | 2,695 | 3,420 |
| `0x0001` | 47     | —        | —     | —     |
| `0x0002` | 31     | —        | —     | —     |
| `0x0400` | 445    | 11       | —     | 187   |
| `0x4000` | —      | —        | —     | 52    |
| `0x4002` | 30     | —        | —     | —     |
| `0x4400` | —      | —        | —     | 2     |

The client treats a block with bit 0 or bit 1 set as a trigger volume,
something walked into rather than against, and leaves it out of solid
collision. That is the client's own choice.

Bit 10 (`0x400`) is set on wooden things: in 2.2.0 the 99 files that carry
it are bridges, docks, wharves, piers, wooden plates and shelves, inns,
boats and a watermill, and no stone or earth model carries it. The client
reads it as a wooden surface, for footsteps. What bit 14 means is not
settled by the data, and the client does not read it.

## Differences between the builds

None in the layout. 2.2.0 moves the files from `tables.bin` to
`model_phy.bin` and ships more of them.

## Sanity limits for a decoder

| Field                | Largest observed |
| -------------------- | ---------------- |
| declaredBlocks       | 187              |
| vertexCount          | 972              |
| faceCount            | 1,709            |
| any primitive extent | 130              |

## What the decoder must provide

These files import from `client/src/assets/formats/phy.ts`. A new decoder
must give them what they need, under whatever names it chooses; the
importing code is updated to match.

| File                                        | Imports                                    |
| ------------------------------------------- | ------------------------------------------ |
| `client/src/assets/providers/localModel.ts` | `parsePhy`                                 |
| `client/test/phy.test.ts`                   | `parsePhy`, `BOX_BLOCK`, `TRIANGLES_BLOCK` |
| `client/test/realPacks.test.ts`             | `parsePhy`                                 |

- `parsePhy(bytes: Uint8Array)` returns an array of blocks in file order,
  already in client axes. It returns `[]` for a file too short or not in this
  format, and stops, keeping what it has, at an unknown type or a truncated
  block. It never throws.
- Each block has the shape `{ type: 'primitive' | 'mesh', flags: number,
shape?: 'wall' | 'box' | 'cylinder' | 'mesh', rotY?: number,
position: [x, y, z], halfSize: [x, y, z], vertices?: [x, y, z][],
faces?: [a, b, c, tag][] }`. Primitives carry `shape` and `rotY`; meshes
  carry `vertices` and `faces`. `halfSize` is never negative. Vertices stay
  relative to `position`.
- `localModel.toCollisionItem` copies those fields into `CollisionGeom`
  (`client/src/assets/types.ts`). `client/src/world/CollisionWorld.ts`
  consumes them: flag bits 0–1, `type`, `shape` (only `'cylinder'` changes
  anything), `position`, `halfSize`, `rotY`, `vertices` plus `position`, and
  the first three entries of each face.
- `BOX_BLOCK` (3) and `TRIANGLES_BLOCK` (7) are block-type numbers the synthetic
  tests use to write files.
