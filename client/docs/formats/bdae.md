# Models (`.bdae`)

A `.bdae` file holds one model, one set of animation curves, or one library
of shader effects: geometry, materials, a node hierarchy, skins, morph
targets and keyframes, all as one block of records that point at each
other. This page is the byte layout, worked out by parsing every `.bdae` in
the user's own packs. Field names here are this document's own; a decoder
is free to pick better ones.

Every `.bdae` in `res.bin` is wrapped in a small ZIP; see
[pack.md](pack.md). Everything below describes the unwrapped member.

## Population checked

| Build | Files | With a data area | With geometry | With animation records | With skins             | With morphs |
| ----- | ----- | ---------------- | ------------- | ---------------------- | ---------------------- | ----------- |
| 1.1.4 | 6,960 | 2,895            | 2,895         | 4,224                  | 823 skins in 250 files | 43          |
| 2.2.0 | 9,464 | 3,926            | 3,926         | 5,747                  | 949 skins in 344 files | 46          |

`res_t.bin` holds none. File sizes run from 344 bytes to 1,052,732. Every
check on this page holds in both builds; no layout difference between them
was found.

A walker that follows every record on this page, from the header down,
reaches every entry of the relocation table (below) in 15,778 of the 16,424
files. The entries it does not reach all lie inside records this page marks
as not decoded: effect records (575 files) and the deeper parts of
material bindings and node extras (71 files).

## General rules

- **Little-endian.** The endian mark at offset 4 is `0xFFFE` in every
  file; reject anything else.
- **Pointers are absolute file offsets**, `u32`. A null pointer is 0.
- **Every non-null pointer is listed in the relocation table**, and nothing
  else is. That gives a decoder a check: a field this page calls a pointer
  should sit at a listed offset. The one kind of offset that is _not_ a
  pointer is the self-relative offset in the animation source table.
- **Count-then-pointer pairs.** Lists are stored as `u32 count` immediately
  followed by a `u32` pointer to `count` consecutive records. When the count
  is 0 the pointer is 0.
- All records and lists are 4-byte aligned.
- Types used below:

  | Type                      | Size       | Meaning                                                |
  | ------------------------- | ---------- | ------------------------------------------------------ |
  | `u8`, `u16`, `u32`, `i32` | 1, 2, 4, 4 | integers                                               |
  | `f32`                     | 4          | IEEE-754 single-precision float                        |
  | `ptr`                     | 4          | absolute file offset, or 0                             |
  | `str`                     | 4          | pointer to a string's text, see [Strings](#strings)    |
  | `list<T>`                 | 8          | `u32` count, then `ptr` to count × T                   |
  | `vec3`, `quat`            | 12, 16     | three `f32`; four `f32` x, y, z, w                     |
  | `mat4`                    | 64         | sixteen `f32`, see [Matrices](#matrices-and-rotations) |

## Top-down layout

```
file
├── header                     60 bytes at 0
├── relocation table           u32 × relocationCount, at 60
├── string table               length-prefixed strings, up to modelInfo
├── model info                 188 bytes
├── 8 bytes: u32 1, u32 0      (every file)
├── records                    everything the model info points at, in no fixed order
└── data area (optional)       block table, then blocks, to the end of the file
```

## Header (60 bytes)

| Offset | Type    | Field           | Notes                                      |
| ------ | ------- | --------------- | ------------------------------------------ |
| 0      | 4 bytes | signature       | ASCII `BRES`                               |
| 4      | `u16`   | endianMark      | `0xFFFE`                                   |
| 6      | `u16`   | version         | 0 in every file                            |
| 8      | `u32`   | headerSize      | 60 in every file                           |
| 12     | `u32`   | fileSize        | equals the file's length in every file     |
| 16     | `u32`   | relocationCount | 9 to 4,555                                 |
| 20     | `u32`   | —               | 0                                          |
| 24     | `ptr`   | relocationTable | always 60                                  |
| 28     | `ptr`   | stringTable     | always `60 + 4 × relocationCount`          |
| 32     | `ptr`   | modelInfo       |                                            |
| 36     | `ptr`   | modelInfoEnd    | always `modelInfo + 188`                   |
| 40     | `ptr`   | dataArea        | equals fileSize when there is no data area |
| 44     | `u32`   | dataAreaSize    | `fileSize − dataArea`; 0 when none         |
| 48     | `u32`   | dataBlockCount  | 0 when none; up to 386                     |
| 52     | `u32`   | —               | 0                                          |
| 56     | `u32`   | —               | 0                                          |

The header's own pointer fields (24, 28, 32, 36, 40) are listed in the
relocation table.

## Relocation table

`relocationCount` `u32` file offsets. Each names a 4-byte field that holds a
pointer. They are 4-aligned and lie below `dataArea`, except the entries for
pointers stored inside the data area. They are not sorted. No listed
field holds 0.

## Strings

The string table runs from `stringTable` to `modelInfo` and parses exactly
as a sequence of entries:

| Type  | Field      | Notes                                                                    |
| ----- | ---------- | ------------------------------------------------------------------------ |
| `u32` | byteLength | length of the text, not counting the terminator                          |
| bytes | text       | byteLength bytes, then a zero byte, then zero padding to a multiple of 4 |

- A `str` field points at the **text**, four bytes past the entry's start,
  in every file. So a string can be read either by its length (at pointer − 4) or up to its zero byte; both agree.
- Every entry is referenced by at least one pointer; no entry appears twice.
- All text is ASCII. No text contains a zero byte.
- A reference to another record by name is written as a _URL_: `#` followed
  by that record's id. Record ids themselves carry no `#`.

## Model info (188 bytes)

Offsets from `modelInfo`. Every offset not listed holds 0 in every file.

| Offset | Type                     | Field            | Notes                                                                                      |
| ------ | ------------------------ | ---------------- | ------------------------------------------------------------------------------------------ |
| 0      | `str`                    | versionText      | always set                                                                                 |
| 12     | `u32`                    | unknown12        | 1, or 2 in shader libraries and 50 character models. Meaning not settled                   |
| 20     | `u32`                    | unknown20        | 0 to 30; non-zero in 668 files. Meaning not settled                                        |
| 28     | `i32`                    | timeStart        | ms; equals the animation segment's start in every file. `0x7FFFFFFF` when there is nothing |
| 32     | `i32`                    | timeEnd          | ms; equals the segment's end. `0x80000000` when there is nothing                           |
| 36     | `list<animation record>` | animationRecords | up to 151                                                                                  |
| 48     | `ptr`                    | animationStore   | always set, see [Animation](#animation)                                                    |
| 52     | `list<clip range>`       | clipRanges       | up to 32                                                                                   |
| 68     | `list<light>`            | lights           | 0 or 1; 37 files                                                                           |
| 76     | `list<texture>`          | textures         | up to 31                                                                                   |
| 84     | `list<effect>`           | effects          | up to 27; 575 files                                                                        |
| 92     | `list<material>`         | materials        | up to 32                                                                                   |
| 100    | `list<geometry>`         | geometries       | up to 189                                                                                  |
| 108    | `list<controller>`       | controllers      | up to 27                                                                                   |
| 148    | `list<node tree>`        | nodeTrees        | 0 or 1                                                                                     |
| 180    | `list<scene>`            | scenes           | 0 or 1; present exactly when nodeTrees is (6,889 files)                                    |

## Data area

Present in the 6,821 files that carry geometry.

```
data area
├── block table     dataBlockCount × (u32 size, ptr offset)
└── blocks          back to back, in table order
```

- The first block starts right after the table; each block starts where the
  previous one ends; the last ends at the end of the file. This holds in
  every file.
- Every block starts with a `u32` **block tag**, counted in its size: 1 for
  vertex and index blocks, 2 for skin weight and joint-list blocks. No other
  tag appears.
- Every vertex and index block is referenced by exactly two pointers: its
  block-table entry and the record field that uses it. Record fields point at the block's
  start (the tag), not at its payload.
- The only pointers stored inside the data area are those in skin
  joint-list blocks.

## Textures (20 bytes)

| Offset | Type  | Field | Notes                                    |
| ------ | ----- | ----- | ---------------------------------------- |
| 0      | `str` | id    |                                          |
| 4      | `str` | name  |                                          |
| 8      | `str` | path  | pack path of the image, with directories |
| 12     | `u32` | —     | 0                                        |
| 16     | `u32` | —     | 0                                        |

## Materials (36 bytes)

| Offset | Type              | Field       | Notes                                                                                                                                  |
| ------ | ----------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `str`             | id          | what geometry parts and bindings name                                                                                                  |
| 4      | `str`             | name        |                                                                                                                                        |
| 8      | `str`             | effectFile  | the shader-library `.bdae` the effect lives in; 0 (no pointer) in 1,042 materials, whose effect is in this file                        |
| 12     | `str`             | effectUrl   | `#` + effect id                                                                                                                        |
| 16     | `list<parameter>` | parameters  | 0, 1, 2 or 4                                                                                                                           |
| 24     | `i32`             | localEffect | −1 when effectFile is set; otherwise the index into this file's effects list, whose id equals effectUrl without `#` in all 1,042 cases |
| 28     | `i32`             | —           | −1                                                                                                                                     |
| 32     | `u32`             | —           | 128                                                                                                                                    |

### Parameters (24 bytes)

| Offset | Type  | Field      | Notes                                                                     |
| ------ | ----- | ---------- | ------------------------------------------------------------------------- |
| 0      | `str` | name       |                                                                           |
| 4      | `str` | semantic   | empty except in 32 sampler parameters                                     |
| 8      | `u32` | valueType  | 11 = 2D sampler (21,290), 20 = technique choice (20,531), 4 = float (365) |
| 12     | `u32` | —          | 1                                                                         |
| 16     | `ptr` | valueBlock | a `u32` 1 followed by the value                                           |
| 20     | `ptr` | value      | always `valueBlock + 4`                                                   |

- **Float** (4): the value is one `f32`.
- **2D sampler** (11): the value is a `ptr` to a _surface_, whose first
  `i32` is an index into the textures list, or −1 for no image (754 of
  21,290). Nothing else of the surface is decoded.
- **Technique choice** (20): the value is a `u32` (1 in 20,166, 2 in 365)
  followed by pointers to technique names. Not needed by the client; not
  fully settled.

A material's texture is the one named by its first sampler parameter. A
material with a sampler parameter named `transparent-sampler` (249 of them)
has a transparency texture; the client uses that name.

## Effects (116 bytes)

Present in the shader libraries and in 575 files with effects of their own.

| Offset      | Type       | Field                                                                                                                                                 |
| ----------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0           | `str`      | id                                                                                                                                                    |
| 4           | `str`      | name                                                                                                                                                  |
| 8, 16, 24   | `list` × 3 | first group: techniques (12-byte entries: `str` name, `u32` 1, `ptr`), parameters (24-byte entries shaped like material parameters), and a third list |
| 32, 40, 48  | `list` × 3 | second group, same shapes                                                                                                                             |
| 60, 68, 76  | `list` × 3 | third group; usually empty                                                                                                                            |
| 84          | `u32`      | no meaning; a leftover value                                                                                                                          |
| 88, 96, 104 | `list` × 3 | fourth group; usually empty                                                                                                                           |
| 112         | `u32`      | no meaning; a leftover value                                                                                                                          |

The client draws with its own shaders and reads nothing inside an effect.
The contents below this level are **not decoded**.

## Lights (24 bytes)

| Offset | Type  | Field     | Notes                                                            |
| ------ | ----- | --------- | ---------------------------------------------------------------- |
| 0      | `str` | id        |                                                                  |
| 4      | `str` | name      |                                                                  |
| 8      | `u32` | kind      | 0 in all 37                                                      |
| 12     | `u32` | colour    | packed, top byte `0xFF`; grey in most. Channel order not settled |
| 16     | `f32` | intensity | 1.0 in all 37                                                    |
| 20     | `u32` | —         | 0                                                                |

## Geometries (16 bytes)

| Offset | Type  | Field        | Notes                              |
| ------ | ----- | ------------ | ---------------------------------- |
| 0      | `str` | id           | usually ending `-mesh`             |
| 4      | `str` | name         |                                    |
| 8      | `u32` | geometryKind | 0 = mesh (19,022), 1 = spline (61) |
| 12     | `ptr` | data         | a mesh, or a spline                |

A spline's data is 20 bytes with no pointers (`u32` 0, 15, 3, 0, 0 in the
sample dumped). Splines carry no points and are **not decoded**; skip them.

### Mesh (44 bytes)

| Offset | Type         | Field        | Notes                                        |
| ------ | ------------ | ------------ | -------------------------------------------- |
| 0      | `u32`        | —            | 1                                            |
| 4      | `u32`        | vertexCount  | up to 21,186                                 |
| 8      | `ptr`        | vertexFormat |                                              |
| 12     | `list<part>` | parts        | 1 to 32; 1 in 16,794 meshes                  |
| 20     | `vec3`       | boundsMin    | every vertex position lies within the bounds |
| 32     | `vec3`       | boundsMax    |                                              |

### Vertex format (44 bytes)

| Offset | Type        | Field           | Notes                           |
| ------ | ----------- | --------------- | ------------------------------- |
| 0      | `u32`       | stride          | bytes per vertex, 32 to 284     |
| 4      | `list<u32>` | byteOffsets     | one per attribute               |
| 12     | `list<u32>` | elementTypes    | 6 = `f32`, 1 = `u8`             |
| 20     | `list<u32>` | attributeWidths | values per attribute: 2, 3 or 4 |
| 28     | `list<u32>` | attributeFlags  | 0 in every attribute            |
| 36     | `ptr`       | vertexBlock     | a data block, tag 1             |
| 40     | `u32`       | —               | 0                               |

- The four lists have the same count (3 to 27 attributes) and describe
  attribute _i_ together. `stride` equals the end of the furthest attribute
  in every format.
- The vertex block is the tag, then `vertexCount × stride` bytes, exactly.
- Attributes seen: 3 × `f32` (positions, normals, direction vectors), 2 ×
  `f32` (texture coordinates) and 4 × `u8` (vertex colour, read as bytes
  0–255 in RGBA order by the client; alpha is 224 or more in all but 8 of
  194,348 sampled vertices). The vertex colour holds the scenery's baked
  lighting; the scenery shaders multiply the texture by it.
- Which attribute is which comes from the part's slot map (below). The list
  order is fixed in practice — position, normal, colour if any, texture
  sets, then direction vectors — but a colour attribute can sit at the end
  of the vertex while being third in the list.
- Normals are unit length in every sampled vertex.

### Parts (56 bytes)

| Offset | Type      | Field         | Notes                                                        |
| ------ | --------- | ------------- | ------------------------------------------------------------ |
| 0      | `u32`     | —             | 0                                                            |
| 4      | `str`     | material      | a material id. It can name a material the file does not have |
| 8      | `u32`     | triangleCount | always `indexCount / 3`                                      |
| 12     | `u8` × 16 | slotMap       | see below                                                    |
| 28     | `u32`     | —             | `0xFFFF`                                                     |
| 32     | `u32`     | lowestIndex   | the smallest index the part uses, in every part              |
| 36     | `u32`     | highestIndex  | the largest; always below vertexCount                        |
| 40     | `u32`     | indexCount    | up to 50,361                                                 |
| 44     | `ptr`     | indexBlock    | a data block, tag 1                                          |
| 48     | `u32`     | —             | 0                                                            |
| 52     | `u32`     | —             | 0                                                            |

The index block is the tag, then `indexCount` `u16` indices forming a
triangle list, then 2 bytes of padding when indexCount is odd (3,313 blocks).

**Slot map.** Byte _s_ holds the attribute number (index into the vertex
format's lists) that plays role _s_, or `0xFF` for none:

| Slot  | Role                                          |
| ----- | --------------------------------------------- |
| 0     | position                                      |
| 1     | normal                                        |
| 2     | vertex colour                                 |
| 3     | never used                                    |
| 4–7   | texture coordinates, sets 0–3                 |
| 8–11  | the V-direction vector for sets 0–3           |
| 12–15 | the U-direction vector (tangent) for sets 0–3 |

The two direction roles were told apart by comparing each with the
direction the texture coordinates run across its triangles: slot 12 lines up
with the U direction (mean |cos| 0.87) and slot 8 with V (0.85).

## Controllers (12 bytes)

| Offset | Type  | Field          | Notes                                              |
| ------ | ----- | -------------- | -------------------------------------------------- |
| 0      | `u32` | controllerKind | 0 = skin (1,772), 1 = morph (89)                   |
| 4      | `str` | id             | skins end `-skin`, morphs `-morpher` in every file |
| 8      | `ptr` | data           | a skin or a morph                                  |

### Skin (156 bytes)

| Offset | Type        | Field             | Notes                                                                         |
| ------ | ----------- | ----------------- | ----------------------------------------------------------------------------- |
| 0      | `u32`       | inverseBindFloats | 16 × jointCount                                                               |
| 4      | `ptr`       | inverseBinds      | jointCount × `mat4`, one per joint                                            |
| 8      | `u32`       | jointPoseFloats   | 8 × jointCount                                                                |
| 12     | `ptr`       | jointPoses        | jointCount × 8 `f32`: the same inverse bind as a dual quaternion, see below   |
| 16     | `mat4`      | bindShape         | applied to the mesh's vertices before skinning                                |
| 80     | 8 × `f32`   | bindShapePose     | the bind shape as a dual quaternion                                           |
| 112    | `str`       | sourceUrl         | `#` + the id of the geometry it skins                                         |
| 116    | `list<str>` | joints            | up to 56; each is the sid of a node (all 17,621)                              |
| 124    | `u32`       | weightWords       | `vertexCount × (1 + influences)` of the source mesh, in every skin            |
| 128    | `ptr`       | weightBlock       | a data block, tag 2                                                           |
| 132    | `u32`       | jointListCount    | = jointCount                                                                  |
| 136    | `ptr`       | jointListBlock    | a data block, tag 2                                                           |
| 140    | `u32`       | sphereCount       | = jointCount                                                                  |
| 144    | `ptr`       | jointSpheres      | jointCount × 4 `f32`; looks like a centre and a radius per joint; not settled |
| 148    | `u32`       | —                 | 0                                                                             |
| 152    | `u32`       | influences        | 1 to 4 weights per vertex                                                     |

**Weight block.** The tag, then one record per vertex of the source mesh:
4 `u8` joint indices (into `joints`), then `influences` × `f32` weights. So a
record is `4 + 4 × influences` bytes. Index bytes past `influences` are 0.
The block is larger than the records need — its size is `4 + weightWords ×
(4 + 4 × influences)` — and the rest is zeros. Weights sum to 1 within 10⁻³
in every vertex of 1,769 skins; 3 skins with one influence have other
values.

**Joint-list block.** The same weights, turned around: the tag, then
jointCount × (`u32` entryCount, `ptr` entries), then the entries, each
(`f32` weight, `u32` vertex index). The total of the entry counts equals the
number of non-zero weights in the weight block in every skin.

### Morph (32 bytes)

| Offset | Type        | Field         | Notes                                                   |
| ------ | ----------- | ------------- | ------------------------------------------------------- |
| 0      | `str`       | sourceUrl     | `#` + the id of the geometry it deforms                 |
| 4      | `u32`       | —             | 0                                                       |
| 8      | `list<str>` | targetIds     | geometry ids, without `#`; 1 to 5                       |
| 16     | `list<u32>` | targetIndices | the same geometries as indices into the geometries list |
| 24     | `list<f32>` | restWeights   | each target's weight before any animation               |

The three lists have equal counts, the names and indices agree, and every
target has the same vertex count as its source, in all 89 morphs. The
targets are ordinary geometries that no node instances.

## Node trees (16 bytes)

| Offset | Type         | Field | Notes     |
| ------ | ------------ | ----- | --------- |
| 0      | `str`        | id    |           |
| 4      | `str`        | name  |           |
| 8      | `list<node>` | roots | up to 997 |

### Nodes (80 bytes)

| Offset | Type             | Field          | Notes                                                                                                         |
| ------ | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| 0      | `str`            | id             | usually ending `-node`; what channels and instances name                                                      |
| 4      | `str`            | name           |                                                                                                               |
| 8      | `str`            | sid            | often empty; what skin joints name                                                                            |
| 12     | `vec3`           | translation    |                                                                                                               |
| 24     | `quat`           | storedRotation | the conjugate of the node's rotation, see below                                                               |
| 40     | `vec3`           | scale          |                                                                                                               |
| 52     | `u32`            | visible        | 1 in every node                                                                                               |
| 56     | `list<node>`     | children       | up to 40; depth reaches 13                                                                                    |
| 64     | `list<instance>` | instances      | 0 or 1                                                                                                        |
| 72     | `ptr`            | extra          | 216 nodes: a 4-byte record holding a `str` of plain-text key/value lines (physics-like settings). 0 elsewhere |
| 76     | `ptr`            | extra2         | 4 nodes: a 24-byte record (`u32` 1, 1, 0, `f32` 1.0, 0, 0). Meaning not settled                               |

A node's own transform is: scale each axis, then rotate, then translate. A
child composes onto its parent. The rotation is the **conjugate** of the
stored quaternion (negate x, y and z): built that way, the chain of node
transforms reproduces the inverse of each skin's inverse bind in 7,743 of
9,267 joints tested, against 12 with the quaternion as stored. (The rest
differ because a bind pose need not be the node's rest pose.)

### Instances (8 bytes)

| Offset | Type  | Field        | Notes                                                                      |
| ------ | ----- | ------------ | -------------------------------------------------------------------------- |
| 0      | `u32` | instanceKind | 1 camera (426), 2 controller (1,861), 3 geometry (17,061), 4 light (3,173) |
| 4      | `ptr` | data         |                                                                            |

Instance data, by kind:

| Offset | Type            | Field         | Kinds | Notes                                                                                                                           |
| ------ | --------------- | ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `u32`           | —             | all   | 0                                                                                                                               |
| 4      | `str`           | url           | all   | `#` + id: of a geometry (kind 3, in every case), a controller (kind 2), a light or camera (kinds 4, 1; usually not in the file) |
| 8      | `i32`           | —             | all   | 0 for kinds 2 and 3, −1 for kinds 1 and 4, which end here (12 bytes)                                                            |
| 12     | `list<binding>` | bindings      | 2, 3  | 1 to 32                                                                                                                         |
| 20     | `u32`           | —             | 2, 3  | 0; kind 3 ends here (24 bytes)                                                                                                  |
| 24     | `list<str>`     | skeletonRoots | 2     | node ids; 0 entries for a morph controller (32 bytes)                                                                           |

A controller instance names a skin or a morph; the controller's kind says
which.

### Bindings (60 bytes)

| Offset | Type      | Field              | Notes                                                                                                                                 |
| ------ | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `u32`     | —                  | 0                                                                                                                                     |
| 4      | `str`     | materialUrl        | `#` + material id                                                                                                                     |
| 8      | `u32`     | materialIndex      | the same material as an index into the materials list (all but 3 of 25,202)                                                           |
| 12–24  | `u32` × 4 | —                  | 0                                                                                                                                     |
| 28     | `list`    | techniqueBindings  | 0 to 2 entries of 12 bytes: `str` technique, `list` of 12-byte pass entries (`str` pass, `list` of 4-byte entries, all `01 01 00 00`) |
| 36     | `list`    | techniqueBindings2 | same outer shape; inner entries not settled                                                                                           |
| 44–56  | `u32` × 4 | —                  | 0                                                                                                                                     |

The client does not read bindings: parts name their material directly.

## Scenes (16 bytes)

| Offset | Type  | Field | Notes                                |
| ------ | ----- | ----- | ------------------------------------ |
| 0      | `u32` | kind  | 6                                    |
| 4      | `ptr` | data  | points at this record's own offset 8 |
| 8      | `u32` | —     | 0                                    |
| 12     | `str` | url   | `#` + the node tree's id             |

## Animation

Animation is stored as many small **animation records**, each driving one
property of one target, plus a shared **store** of key arrays. Named time
ranges (clip ranges) cut the timeline into clips.

```
model info +48 → store (8 bytes: u32 segmentCount = 1, ptr segments)
                   └── segment (24 bytes) → source table → key and value arrays
model info +36 → animation records (32 bytes each)
                   ├── samplers (28 bytes): which two sources, and their encodings
                   ├── channels (16 bytes): which target and property
                   └── base value (12 bytes)
model info +52 → clip ranges (12 bytes each)
```

### Segment (24 bytes)

| Offset | Type  | Field       | Notes                                           |
| ------ | ----- | ----------- | ----------------------------------------------- |
| 0      | `i32` | start       | ms; `0x7FFFFFFF` when the file has no animation |
| 4      | `i32` | end         | ms; `0x80000000` when none                      |
| 8      | `u32` | —           | 1                                               |
| 12     | `u32` | —           | 0                                               |
| 16     | `u32` | —           | 0                                               |
| 20     | `ptr` | sourceTable |                                                 |

Every file has exactly one segment, and every animation record reads from
it.

### Source table

| Type                         | Field                        | Notes                                                    |
| ---------------------------- | ---------------------------- | -------------------------------------------------------- |
| `u32`                        | sourceCount                  | up to 302; always 2 × the number of samplers in the file |
| (`u32`, `i32`) × sourceCount | elementCount, relativeOffset |                                                          |

A source's data starts at **the address of its `relativeOffset` field plus
the field's value**: the offset counts from the field itself, not from the
file start. These offsets are not in the relocation table. The data sits
below the data area, 4-aligned, in the same order as the table. Every source
is used by exactly one sampler. `elementCount` is the number of keys (up to
3,001); a value source holds `elementCount × components` floats.

### Animation records (32 bytes)

| Offset | Type            | Field     | Notes                                        |
| ------ | --------------- | --------- | -------------------------------------------- |
| 0      | `str`           | id        |                                              |
| 4      | `list<sampler>` | samplers  | 1, 2 or 4                                    |
| 12     | `list<channel>` | channels  | the same count; channel _i_ uses sampler _i_ |
| 20     | `u32`           | —         | 0                                            |
| 24     | `ptr`           | baseValue |                                              |
| 28     | `u32`           | —         | 0                                            |

### Samplers (28 bytes)

| Offset | Type  | Field           | Notes                                  |
| ------ | ----- | --------------- | -------------------------------------- |
| 0      | `u32` | interpolation   | 1 in every sampler                     |
| 4      | `u32` | keyEncoding     | 1, 3 or 4, see [Key times](#key-times) |
| 8      | `u32` | keyComponents   | 1                                      |
| 12     | `u32` | keySource       | index into the source table            |
| 16     | `u32` | valueType       | 6 (`f32`) in every sampler             |
| 20     | `u32` | valueComponents | 1, 3 or 4                              |
| 24     | `u32` | valueSource     | always keySource + 1                   |

Both sources of a sampler have the same element count.

### Key times

| keyEncoding | Stored as     | Unit                               | Samplers |
| ----------- | ------------- | ---------------------------------- | -------- |
| 1           | `u8` per key  | frame number, 30 frames per second | 528,644  |
| 3           | `u16` per key | frame number, 30 frames per second | 1,333    |
| 4           | `i32` per key | milliseconds; can be negative      | 666      |

- The units follow from the segment range: frame 200 of a clip whose
  segment ends at 6,666 ms, and millisecond keys that run exactly from the
  segment's start to its end. A frame number times 1000/30, rounded down,
  gives the millisecond values the ranges use.
- Times never decrease within a sampler, but can repeat (4,873 samplers).
  The first key is 0 in 513,742 of 530,643 samplers; some clips start their
  keys several frames in.

### Channels (16 bytes)

| Offset | Type  | Field       | Notes                                                                                                                                                                                          |
| ------ | ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `i32` | —           | −1 in every channel                                                                                                                                                                            |
| 4      | `str` | target      | a node id, a morph controller id (kind 14), or a material id (kinds 105–109)                                                                                                                   |
| 8      | `u32` | channelKind | below                                                                                                                                                                                          |
| 12     | `u32` | detail      | kind 14: the low byte is the morph target index (always below the target count). Kinds 105–109: a `str`, often empty; meaning not settled. Other kinds: low byte `0xFF`, upper bytes arbitrary |

| channelKind        | Drives                                                               | Value components | Channels       |
| ------------------ | -------------------------------------------------------------------- | ---------------- | -------------- |
| 1                  | translation                                                          | 3                | 258,933        |
| 2, 3, 4            | translation x, y or z alone                                          | 1                | 215, 340, 45   |
| 5                  | rotation, as a stored quaternion                                     | 4                | 265,023        |
| 7, 8               | one component of the rotation's axis-angle base value (mask 2 and 4) | 1                | 1, 4           |
| 9                  | rotation angle about the base value's axis, radians                  | 1                | 840            |
| 10                 | scale                                                                | 3                | 4,683          |
| 14                 | a morph target's weight                                              | 1                | 168            |
| 105, 106, 107, 109 | texture-coordinate animation of a material                           | 1                | 190, 198, 1, 2 |

Kinds 6 and 11–13 do not appear. In animation-only files the target is
usually a node of another model (the skeleton the clip plays on), not of the
same file.

Rotation keys (kind 5) are unit quaternions stored the same way as node
rotations: the rotation to apply is their conjugate.

### Base values (12 bytes)

| Offset | Type  | Field      | Notes                                                                                                                                               |
| ------ | ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `u32` | drivenAxes | which parts of the base value the channel drives: 7 translation/scale, 1/2/4 one axis, 15 quaternion, 8 angle, 31 texture animation, 0 morph weight |
| 4      | `u32` | valueCount | 1, 3, 4 or 5                                                                                                                                        |
| 8      | `ptr` | values     | valueCount `f32`                                                                                                                                    |

- Translation, scale and morph weight: the base value equals the first key.
- Single-axis translation (kinds 2–4): the base value is the whole
  translation; the first key equals its masked component in 587 of 600.
- Rotation (kinds 5, 7, 8, 9): the base value is **axis (x, y, z) and angle
  in degrees**. Against a quaternion first key it has the same axis and the
  opposite angle in 254,846 of 265,023 channels (most of the rest have an
  identity first key). For kind 9, the first key in radians is minus the
  base angle in every channel.
- Texture animation (105–109): five components, (0, 0, 0, 1, 1) in the
  samples seen. Which component each kind drives is **not settled**.

### Clip ranges (12 bytes)

| Offset | Type  | Field | Notes         |
| ------ | ----- | ----- | ------------- |
| 0      | `str` | name  | the clip name |
| 4      | `i32` | start | ms            |
| 8      | `i32` | end   | ms            |

11,948 ranges in 11,532 files. Values such as −33 occur. A file whose ranges
cover several clips holds all of them on one timeline.

## Matrices and rotations

A `mat4` is sixteen floats. Elements 0–2, 4–6 and 8–10 are a 3 × 3
rotation-and-scale block B, where element `r × 4 + c` is row _r_, column
_c_. Elements 12–14 are the translation; 3, 7 and 11 are 0 and 15 is 1. A
point transforms as a row vector: `p' = p · B + t`.

The dual-quaternion form beside each inverse bind (8 floats: a rotation
quaternion x, y, z, w, then a second quaternion x, y, z, w) encodes the same
transform: B equals the textbook rotation matrix of the first quaternion,
and t is the vector part of 2 · second · conjugate(first). This holds in
17,135 of 17,621 joints; the rest are mirrored (440, negative determinant)
or scaled (46), which a unit quaternion cannot express. Treat the matrix as
authoritative.

The same convention covers the skin's bind shape (element 15 is 1.0 in every
skin).

## What is not decoded

The data leaves these open; a reader can skip them and the client loses
nothing:

- model info +12 and +20;
- effect contents below the lists, and the leftover words at +84 and +112;
- the technique-choice parameter value past its first word;
- the second binding list's inner entries;
- node extras at +76, and the meaning of the text at +72;
- spline data;
- joint spheres;
- what each texture-animation kind drives;
- light colour channel order.

## Sanity limits for a decoder

| Field             | Largest observed |
| ----------------- | ---------------- |
| relocationCount   | 4,555            |
| dataBlockCount    | 386              |
| geometries        | 189              |
| vertexCount       | 21,186           |
| attributes        | 27               |
| stride            | 284              |
| parts per mesh    | 32               |
| indexCount        | 50,361           |
| controllers       | 27               |
| joints per skin   | 56               |
| morph targets     | 5                |
| node tree roots   | 997              |
| node depth        | 13               |
| children per node | 40               |
| animation records | 151              |
| sources           | 302              |
| keys per source   | 3,001            |

## What the decoder must provide

These files import from `client/src/assets/formats/bdae.ts`. A new decoder
must give them what they need, under whatever names it chooses; the
importing code is updated to match.

| File                                               | Imports                                                    | Uses                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/assets/providers/localModel.ts`        | `Bdae`, `selectVariants`; types `BdaeMaterial`, `BdaeMesh` | `new Bdae(payload)`, `materialsByName()`, `meshes(true)`, `morphers()`, `animations()`, `nodeHierarchy()`, `allSkins()`                                                       |
| `client/src/assets/providers/localEffect.ts`       | `Bdae`                                                     | `attachPoints()`                                                                                                                                                              |
| `client/src/assets/providers/PackAssetProvider.ts` | type `Bdae`                                                | `bytes`, `meshes(false)` (names only), `attachPoints()`, `animations()`                                                                                                       |
| `client/src/assets/formats/avatarSheet.ts`         | types `Bdae`, `BdaeNode`; `meshSlot`                       | `nodeHierarchy()`, `allSkins()`, `meshes(true)`                                                                                                                               |
| `client/test/bdae.test.ts`                         | `Bdae`, `BdaeError`                                        | `header`, `textures()`, `nodeHierarchy()`, `placements()`, `animations()`                                                                                                     |
| `client/test/realPacks.test.ts`                    | `Bdae`                                                     | `meshes()`, `materials()`, `materialParams(i)`, `materialsByName()`, `allSkins()`, `animations()`, `nodeHierarchy()`, `animatedNodeKeys()`, `placementSplits()`, `morphers()` |

`client/src/assets/providers/skeletonWire.ts` imports nothing from the
reader but consumes the shapes `nodeHierarchy()`, `allSkins()` and
`animations()` return, and `client/src/assets/providers/surface.ts` restates
the material fields it needs.

The shapes those callers read:

- **Construction.** `new Bdae(payload)` throws `BdaeError` when the payload
  is under 60 bytes, the signature is not `BRES`, the endian mark is not
  `0xFFFE` or the header size is not 60. Every other problem is tolerated:
  unreadable parts are skipped and noted in a `warnings: string[]`.
  `bytes` is the payload.
- **`header`**: `{ signature, version, headerSize, fileSize,
stringTableOffset, modelInfoOffset, modelDataOffset }`.
- **`textures()`**: `{ map (id), mapFriendly (name), file (path) }[]`.
- **`materials()`** / **`materialsByName()`** (a `Map` by id): `{ name (id),
nameFriendly, file (effectFile or ''), shader (effectUrl), textureIndex
(number | null), texture (the texture's path | null), transparent }`.
  `surface.ts` reads `file`, `shader` and `transparent`.
- **`materialParams(i)`**: `{ name, type, raw (the value pointer), floats
(the four f32 at it, or null) }[]`; used only by a real-pack probe.
- **`meshes(withGeometry = true, maxVertices = 300000)`**: `BdaeMesh[]`,
  each `{ name, nameFriendly, vertexCount, boundingBox: { min, max },
positions, normals, uvs (Float32Array | null), colors (Uint8Array RGBA |
null), indices (Uint16Array | null), groups, chain?, morph? }`.
  - One `group` per part, in order, with all parts' indices concatenated:
    `{ material, texture (path | null), noMaterial (the id names no
material), start, count }`. A part with an index at or past vertexCount
    is dropped.
  - **Placement.** A geometry instanced by a node (kind 3, or kind 2 naming
    `<geometry id>-morpher`) is emitted once per instance; the second copy on
    is named `<name>#2`, `#3` …. Its vertices and normals are baked with the
    product of the node transforms from the root down to the instancing
    node — unless a node on that path is the target of this file's own
    channels, in which case nothing is baked and `chain` lists every node on
    the path as `{ key (the id or name the channels use), local (12-number
matrix: 3 rows of rotation-scale, then translation), animated }`.
  - A geometry no node instances is dropped in a file that instances a
    morph controller (it is a morph target). Otherwise it is baked with the
    node whose id or name, lowercased and without a `-node` or `-mesh`
    ending, matches the geometry's, and then with its skin's bind shape
    (skin id `<geometry id>-skin`).
  - `morph`: `{ controller (morph id), targets: { name, positions, normals,
weight (restWeight) }[] }`, baked the same way as the base mesh; a
    target with a different vertex count is dropped. The bounding box is
    widened to cover the targets.
  - Bounds are recomputed after baking. `meshes(false)` returns the same
    list with no vertex data.
- **`nodeHierarchy()`**: the roots of every node tree, each `BdaeNode`
  `{ id, name, sid, translation, rotation (as stored), scale, visible,
instances: { type, url (without '#') }[], children }`.
- **`placements()`** / **`placementSplits()`**: `Map` from geometry id to
  its instancings (a 12-number matrix, or `{ world, chain? }`).
  **`attachPoints()`**: `Map` from every node id and name to its
  model-space 12-number matrix. **`animatedNodeKeys()`**: the channel
  targets of this file. **`skinBinds()`**: geometry id → bind shape.
- **`morphers()`**: `{ name (morph id), source (geometry id), targets
(ids), indices, weights }[]`.
- **`allSkins()`**: an object keyed by skin id, each `{ name, source
(sourceUrl, with '#'), jointNames, bindPoses (16-number rows per joint),
bindShape (16 numbers), maxInfluence, vertexCount, weights: { indices
(4), weights (padded to 4) }[] }`. `avatarSheet` requires
  `weights.length ≥` the mesh's vertexCount.
- **`animations()`**: one clip per animation record, `{ id, samplers: {
interpolation, input: { type, components, sourceIndex, values },
output: { … } }[], channels: { source, target, type, member (the morph
index, or null) }[] }`. `skeletonWire` reads input values as frame
  numbers at 30 per second, output values, channel `target`, `type` and
  `member`, and resolves axis-angle and single-component channels against
  the bind pose.
- **`meshSlot(name)`** splits `hair_03-mesh` into `['hair', 3]` (trailing
  number, with an optional `_` or `-` before it; 0 when none), and
  **`selectVariants(meshes, choice)`** keeps one mesh per slot, the
  `choice`-th variant by number, clamped.
