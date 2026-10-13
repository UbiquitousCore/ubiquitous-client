# `.beff` particle effect format

A `.beff` file describes one visual effect: a list of particle systems and
animated meshes that play together. This page is the byte layout, worked out
by reading the files in the user's own packs. It names every field in plain
words; those names are this document's own, and a decoder is free to use
them or pick better ones.

## Population checked

Every `.beff` in both supported builds was parsed with the layout below, and
every one ends exactly on its last byte.

| Build | Pack      | Files | Version 8 | Version 9 |
| ----- | --------- | ----- | --------- | --------- |
| 1.1.4 | `res.bin` | 572   | 572       | 0         |
| 2.2.0 | `res.bin` | 875   | 4         | 871       |

`res_t.bin` holds no `.beff` files in either build. Earlier builds use other
version numbers with a different layout; this page does not cover them.

## General rules

- **Little-endian** throughout.
- **No alignment and no padding** between fields. Fields are 4 bytes, except
  two pairs of 2-byte fields, so everything happens to sit on 2-byte
  boundaries, but a decoder must read sequentially and never skip to an
  aligned offset.
- **No offsets, sizes or section lengths.** The file is one sequential stream.
  A decoder cannot skip a part it does not understand, and it cannot
  resynchronise after a misread. The only integrity check the format allows
  is that the last field ends exactly at the end of the file. A decoder should
  reject a file that stops short or leaves bytes over.
- Types used below:

  | Type       | Size     | Meaning                                           |
  | ---------- | -------- | ------------------------------------------------- |
  | `i32`      | 4        | signed 32-bit integer                             |
  | `u16`      | 2        | unsigned 16-bit integer                           |
  | `f32`      | 4        | IEEE-754 single-precision float                   |
  | `vec3`     | 12       | three `f32`: x, y, z                              |
  | `text`     | 4 + n    | a length-prefixed string, see [Strings](#strings) |
  | `track<T>` | 8 + keys | an animated value, see [Tracks](#tracks)          |

- **Flags** stored as `i32` or `u16` hold 0 or 1 in every shipped file. Treat
  any non-zero value as "on".
- **Time is in frames.** Every duration, delay, period, lifetime and key
  time in the file (other than the header delays, see below) counts frames.
  This client reads them at 30 frames per second, the rate the `.bdae`
  animation keys use; the effect files themselves do not state a rate. Values cluster on 5, 10, 15, 20, 30, 60 and 100, and a
  particle's colour and size keys most often end exactly on its lifetime.
- **Angles** are radians, except the emitter's spread angle, which is degrees.
- **Percentages** are integers where 100 means 100 %.
- **Axes**: Y is up. The most common aim direction is (0, 1, 0) and the most
  common gravity direction is (0, −1, 0).

## Top-down layout

```
file
├── header                         20 bytes
└── node × nodeCount
    ├── nodeKind                   i32
    ├── kind 0: emitter record     (recursive, see below)
    └── kind 1: mesh node
        ├── meshPath               text
        ├── meshRepeats            i32
        ├── meshOpacity            track<i32>
        └── (version 9 only) emitter record — the "carrier"

emitter record
├── attachPoint                    text
├── childEmitterCount              i32
├── settings block                 48 bytes, fixed
├── emitter tracks                 10 tracks, + 3 in version 9, + 5 more
├── particle look                  84 bytes fixed + text + 11 tracks
├── affectorCount                  i32
├── affector × affectorCount
└── emitter record × childEmitterCount
```

Children come **after** the parent's affectors, not before its settings.

## Header

| Offset | Type  | Field          | Notes                                          |
| ------ | ----- | -------------- | ---------------------------------------------- |
| 0      | `u32` | signature      | always `0x66666562`, the ASCII bytes `b e f f` |
| 4      | `i32` | formatVersion  | 8 or 9                                         |
| 8      | `i32` | startDelayLow  | lower bound of a random start delay            |
| 12     | `i32` | startDelayHigh | upper bound; never below startDelayLow         |
| 16     | `i32` | nodeCount      | 1 to 42 in the shipped files                   |

The start delay is (0, 0) in 1,432 of 1,447 files. The rest have a low bound
of 0 to 5 and a high bound of 5 to 10,000. The unit is **not settled by the
data**: the small pairs read naturally as frames, the 10,000 reads naturally
as milliseconds. Pick one and note it.

## Nodes

Each node starts with an `i32` nodeKind.

| nodeKind | Meaning                                                          | Count (both builds) |
| -------- | ---------------------------------------------------------------- | ------------------- |
| 0        | a particle emitter; an [emitter record](#emitter-record) follows | 5,252               |
| 1        | an animated mesh; a [mesh node](#mesh-node) follows              | 688                 |

No other value appears at the top level. A decoder should reject any other
value, since the length of an unknown node cannot be known.

## Mesh node

| Type           | Field       | Notes                                                               |
| -------------- | ----------- | ------------------------------------------------------------------- |
| `text`         | meshPath    | full pack path of a `.bdae` model, with directories                 |
| `i32`          | meshRepeats | 1 = the mesh's own animation loops (647 nodes), 0 = plays once (41) |
| `track<i32>`   | meshOpacity | 0 = invisible, 255 = opaque                                         |
| emitter record | carrier     | **version 9 only**; absent in version 8                             |

The version-9 carrier is a complete emitter record whose job is to animate
the mesh, not to draw particles:

- Its spawnShape is always 5. That value appears nowhere else.
- Its offset, angle and scale tracks are the mesh's transform over time.
- Its activeFrames is always −1 and its particle lifetime is 99 or 100.
- Its particle opacity track must **not** be used as the mesh's opacity. In
  354 of the 422 carriers it is a constant 0, while the node's own
  meshOpacity is a constant 255. Use meshOpacity.
- 65 carriers name a texture and use additive blending; 357 name none and use
  alpha blending. Whether a carrier's texture re-skins the mesh is not
  settled by the data.

## Emitter record

### Head

| Type   | Field             | Notes                                                                                                                                    |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `text` | attachPoint       | name of a node in whatever model the effect is attached to; empty = the effect's own origin. Non-empty in 1,983 of 6,200 emitter records |
| `i32`  | childEmitterCount | 0 to 7. Children nest at most one level deep in the shipped files                                                                        |

### Settings block (48 bytes)

Offsets are from the start of the block.

| Offset | Type  | Field                    | Observed         | Meaning                                                                 |
| ------ | ----- | ------------------------ | ---------------- | ----------------------------------------------------------------------- |
| 0      | `i32` | spawnShape               | 0, 1, 2, 3, 5    | where particles are born, see below                                     |
| 4      | `u16` | soundId                  | 0 to 1,217       | sound to play with the emitter; 0 = silent (non-zero in 201 records)    |
| 6      | `u16` | faceCamera               | 0, 1             | the emitter itself turns to face the camera (147 records)               |
| 8      | `i32` | inheritMask              | 0, 1, 2, 3       | bit 0: live particles move with the emitter; bit 1: they turn with it   |
| 12     | `i32` | burstSizeJitterPct       | −100 to 1        | random variation of burstSize, in percent                               |
| 16     | `i32` | activeFrames             | −1, 1 to 550     | how long the emitter keeps emitting; −1 = forever (3,735 records)       |
| 20     | `i32` | firstBurstFrame          | 0 to 133         | frames to wait before the first burst                                   |
| 24     | `i32` | burstEveryFrames         | −50 to 1,000,000 | frames between bursts; 0 in 1,243 records; 1,000,000 = effectively once |
| 28     | `i32` | burstSpacingJitterPct    | −100 to 50       | random variation of burstEveryFrames                                    |
| 32     | `i32` | killParticlesWithEmitter | 0, 1             | live particles vanish when the emitter stops                            |
| 36     | `i32` | spareWord                | 0                | 0 in every emitter of 1.1.4 and 2.2.0; nothing reads it                 |
| 40     | `i32` | radialSpeedJitterPct     | −100 to 100      | random variation of radialSpeed                                         |
| 44     | `i32` | aimSpeedJitterPct        | −100 to 25       | random variation of aimSpeed                                            |

Jitter fields are signed, and most are 0. Where one is not, its sign goes
with the field rather than with the effect: across the emitters of 2.2.0,
the burst size, radial speed, aim speed and life jitters are negative on
125, 317, 517 and 42 rows and positive on 0, 1, 1 and 1; burst spacing is
negative on 310 and positive on 5; the size, grow and spin jitters are never
negative (1481, 146 and up to 486 positive). 1.1.4 shows the same pattern.
The data does not say what a sign means. This client reads a jitter by its
size alone and spreads the value both ways (`jittered` in
`src/renderer/emitterSpawn.ts`). Every cast of one effect draws the same values:
the draws are seeded by the effect's path and the emitter's place in it.

spawnShape values:

| Value | Shape                                    | Records                                          |
| ----- | ---------------------------------------- | ------------------------------------------------ |
| 0     | point                                    | 3,457                                            |
| 1     | sphere                                   | 920                                              |
| 2     | disc                                     | 1,393                                            |
| 3     | box                                      | 8 — all with zero size, so they behave as points |
| 5     | carrier for a mesh node (version 9 only) | 422                                              |

### Emitter tracks

Immediately after the settings block, in this order:

| #   | Type            | Field               | Observed values                 | Meaning                                                                         |
| --- | --------------- | ------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `track<f32>`    | shapeSizeX          | 0 to 300                        | spawn-shape size along X (radius for sphere and disc)                           |
| 2   | `track<f32>`    | shapeSizeY          | 0 to 300                        | along Y                                                                         |
| 3   | `track<f32>`    | shapeSizeZ          | 0 to 300                        | along Z                                                                         |
| 4   | `track<i32>`    | hollowPct           | 0 to 100                        | inner part of the shape that spawns nothing, percent of its size                |
| 5   | `track<f32>`    | emitterAngleX       | −2π to 2π                       | emitter rotation about X, over time                                             |
| 6   | `track<f32>`    | emitterAngleY       | −2π to 2π                       | about Y                                                                         |
| 7   | `track<f32>`    | emitterAngleZ       | −2π to 2π                       | about Z                                                                         |
| 8   | `track<f32>`    | emitterOffsetX      | about −14 to 15                 | emitter position, over time                                                     |
| 9   | `track<f32>`    | emitterOffsetY      | about −8 to 53                  |                                                                                 |
| 10  | `track<f32>`    | emitterOffsetZ      | about −13 to 20                 |                                                                                 |
| —   | `track<f32>` ×3 | emitterScaleX, Y, Z | 0.26 to 1; 0.5 to 2 in carriers | **version 9 only**; always exactly one key. Version 8 has no such tracks: use 1 |
| 11  | `track<f32>`    | burstSize           | 0 to 180                        | particles spawned per burst                                                     |
| 12  | `track<f32>`    | radialSpeed         | −40 to 48                       | launch speed away from the shape's centre                                       |
| 13  | `track<f32>`    | aimSpeed            | about −16 to 500                | launch speed along aimDirection                                                 |
| 14  | `track<f32>`    | spreadDegrees       | −70 to 180                      | cone around aimDirection that launches may deviate within                       |
| 15  | `track<vec3>`   | aimDirection        | components −1 to 5              | launch direction; not normalised; (0, 0, 0) in 120 records                      |

These tracks run on the **emitter's** clock (frames since the emitter
started). Nearly every emitter track in the shipped files has a single key,
so it is a constant; the few with more keys are mostly angle, offset, speed
and burstSize tracks.

### Particle look

Immediately after the emitter tracks.

Fixed part, 84 bytes (offsets from its start):

| Offset | Type  | Field               | Observed         | Meaning                                                                                               |
| ------ | ----- | ------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| 0      | `i32` | quadKind            | 0 to 5           | how each particle is drawn, see below                                                                 |
| 4      | `i32` | inheritMask         | 0, 1, 2, 3       | same bits as the emitter's                                                                            |
| 8      | `i32` | lifeFrames          | 1 to 1,000,000   | particle lifetime; 1,000,000 = lives until the emitter goes (116 particles). No negative values occur |
| 12     | `i32` | lifeJitterPct       | −100 to 30       |                                                                                                       |
| 16     | `i32` | sizeJitterPct       | 0 to 100         | random variation of starting size                                                                     |
| 20     | `i32` | lockAspect          | 0, 1             |                                                                                                       |
| 24     | `f32` | startTiltX          | −π/2 to 2π       | starting rotation about X, radians                                                                    |
| 28     | `i32` | startTiltJitterXPct | 0 to 100         |                                                                                                       |
| 32     | `f32` | startTiltY          | about −2.8 to 2π |                                                                                                       |
| 36     | `i32` | startTiltJitterYPct | 0 to 100         |                                                                                                       |
| 40     | `f32` | startTiltZ          | −2π to 2π        | the in-plane rotation of a sprite                                                                     |
| 44     | `i32` | startTiltJitterZPct | 0 to 100         |                                                                                                       |
| 48     | `i32` | spinJitterXPct      | 0 to 100         | random variation of the spin tracks                                                                   |
| 52     | `i32` | spinJitterYPct      | 0 to 100         |                                                                                                       |
| 56     | `i32` | spinJitterZPct      | 0 to 100         |                                                                                                       |
| 60     | `i32` | growJitterPct       | 0 to 100         | random variation of the grow tracks                                                                   |
| 64     | `i32` | blendMode           | 0, 1             | 0 = ordinary alpha blend (1,031 particles), 1 = additive (5,169)                                      |
| 68     | `i32` | anchorColumn        | 0, 1, 2          | which point of the quad sits on the particle position, horizontally                                   |
| 72     | `i32` | anchorRow           | 0, 1, 2          | and vertically                                                                                        |
| 76     | `i32` | uvQuarterTurns      | 0 to 3           | texture rotated by this many 90° steps                                                                |
| 80     | `u16` | mirrorU             | 0, 1             | texture flipped left-right                                                                            |
| 82     | `u16` | mirrorV             | 0, 1             | texture flipped top-bottom                                                                            |

Then:

| Type         | Field       | Notes                                                         |
| ------------ | ----------- | ------------------------------------------------------------- |
| `text`       | textureName | a bare `.tga` file name, no directory; empty only in carriers |
| `track<i32>` | red         | 0 to 255                                                      |
| `track<i32>` | green       | 0 to 255                                                      |
| `track<i32>` | blue        | 0 to 255                                                      |
| `track<i32>` | opacity     | 0 to 255                                                      |
| `track<f32>` | width       | 0 to 120, world units                                         |
| `track<f32>` | height      | 0 to 125                                                      |
| `track<f32>` | spinX       | radians, about −10.5 to 17.5                                  |
| `track<f32>` | spinY       | about −17.5 to 26.2                                           |
| `track<f32>` | spinZ       | about −9.8 to 52.4                                            |
| `track<f32>` | growX       | 0 to 60, multiplier on width                                  |
| `track<f32>` | growY       | 0 to 100, multiplier on height                                |

Particle tracks run on the **particle's** clock: frames since that particle
was born. In 4,014 of 6,200 particles the latest key across these tracks
falls exactly on lifeFrames; in 780 it falls later (the tail is never
reached) and in 1,406 earlier (the last value holds).

The spin tracks are angles at a given age, not speeds: a track going from 0
to 12.57 over a lifetime turns the particle twice.

quadKind values (counts exclude carriers, which are all 0):

| Value | Count | Look                            |
| ----- | ----- | ------------------------------- |
| 0     | 3,747 | camera-facing sprite            |
| 1     | 1,073 | free quad                       |
| 2     | 350   | velocity-aligned quad           |
| 3     | 513   | velocity-aligned, camera-facing |
| 4     | 40    | ribbon, free                    |
| 5     | 55    | ribbon, camera-facing           |

No other quadKind value and no other blendMode value appears in either build.

### Affectors

`i32` affectorCount (0 to 4), then each affector:

| Type  | Field        | Notes                                                         |
| ----- | ------------ | ------------------------------------------------------------- |
| `i32` | serial       | 1-based position within this emitter's list (1 to 6 observed) |
| `i32` | affectorKind | 0 to 3                                                        |
| …     | payload      | depends on kind                                               |

| affectorKind | Name here   | Count | Payload                                                                                                               |
| ------------ | ----------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| 0            | pull        | 506   | `track<f32>` strength (−1.13 to 8), then `track<vec3>` direction (components −1 to 1, often short, e.g. (0, −0.1, 0)) |
| 1            | speed scale | 672   | `track<f32>` factor (0 to 1.6)                                                                                        |
| 2            | wander      | 365   | `f32` amplitudeX, `f32` amplitudeY, `f32` amplitudeZ (each −30 to 30), then `f32` changeEveryFrames (0 to 10)         |
| 3            | swirl       | 499   | `track<f32>` strength (−1.3 to 2.17), then `track<vec3>` axis (components −1 to 1), then `i32` swirlMode              |

- The wander affector's last field is a float. Read as an integer it is 0 in
  247 affectors and values such as 1,092,616,192 in the rest, which is 10.0
  as a float.
- swirlMode is 0 in 488 affectors and 1 in 10. One file holds `0x20202020`
  (four ASCII spaces) there; treat any value other than 1 as 0.
- A decoder must reject any other affectorKind, since its payload length
  cannot be known.

Affector tracks run on the particle's clock.

## Tracks

Every animated value is a track:

| Type           | Field    | Notes                                                            |
| -------------- | -------- | ---------------------------------------------------------------- |
| `i32`          | keyCount | 1 to 36; never 0 in the shipped files                            |
| `i32`          | repeats  | 0 = play once (174,953 tracks), 1 = loop past the last key (950) |
| key × keyCount |          |                                                                  |

Each key is an `i32` time in frames followed by the value: 4 bytes for
`track<i32>` and `track<f32>`, 12 bytes for `track<vec3>`. So a key is 8 or
16 bytes.

- The first key is always at time 0.
- Key times strictly increase within a track, and never exceed 436.
- `repeats` holds junk in some tracks: values such as `0x20202020` that are
  plainly ASCII text left in memory. It only happens on aimDirection tracks
  with a single key, where looping cannot matter. Treat only 1 as "loop".

How to fill in values between keys, and before and after them, is **not
stored in the file**; the renderer's choices are marked own choice in
`client/src/renderer/`.

## Strings

| Type  | Field      | Notes                           |
| ----- | ---------- | ------------------------------- |
| `i32` | byteLength | 0 to 84; always a multiple of 4 |
| bytes |            | exactly byteLength bytes        |

- Length 0 is the empty string, with no bytes following.
- A non-empty string is the text, then 1 to 4 zero bytes that pad it to a
  multiple of 4. Strip trailing zero bytes. No zero byte ever appears inside
  the text.
- All text is plain ASCII. Decode as Latin-1 so a stray high byte cannot
  fail.
- Texture names are bare file names; mesh paths are full pack paths. Pack
  lookups are case-insensitive, so resolve both without regard to case.

## Differences between versions 8 and 9

Only two:

1. **Emitter scale.** Version 9 inserts three `track<f32>` (emitterScaleX, Y,
   Z) between emitterOffsetZ and burstSize in every emitter record. Version 8
   has none; its emitters are scale 1.
2. **Mesh carrier.** Version 9 follows every mesh node with a complete
   emitter record (spawnShape 5) that animates the mesh. Version 8 mesh nodes
   end after meshOpacity and do not move.

Everything else is identical.

## Sanity limits for a decoder

Every shipped file stays well inside these. A value outside them means the
decoder has lost its place.

| Field                 | Largest observed |
| --------------------- | ---------------- |
| nodeCount             | 42               |
| childEmitterCount     | 7                |
| emitter nesting depth | 1                |
| affectorCount         | 4                |
| keyCount              | 36               |
| string byteLength     | 84               |

## What the decoder must provide

These files import from `client/src/assets/formats/beff.ts` today. A new
decoder must give them what they need, under whatever names it chooses; the
importing code is updated to match.

| File                                               | Imports                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/assets/providers/PackAssetProvider.ts` | `readBeff`                                                                                                                                          |
| `client/src/assets/providers/localEffect.ts`       | `SpawnShape`, `QuadKind`, `BlendMode`, `AffectorKind`; types `BeffFile`, `BeffNode`, `BeffEmitter`, `BeffParticleLook`, `BeffAffector`, `BeffTrack` |
| `client/test/realPacks.test.ts`                    | `readBeff`                                                                                                                                          |

- `readBeff(bytes: Uint8Array, label?: string)` returns the decoded effect,
  and throws when the file does not end exactly on its last field. The
  real-pack test relies on that throw to prove every file is read
  completely.
- `localEffect.ts` turns the decoded effect into the renderer-neutral
  `EffectData` in `client/src/assets/types.ts`. It needs the header delays,
  the node list, and every field on this page except soundId and
  spareWord.
- `client/dev/checkBeffVersion.ts` reads the version field itself and imports
  nothing from the decoder.
