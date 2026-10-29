# AGENTS.md — rules for anyone (human or agent) working in this repository

Read this before touching anything. The rules in **Hard rules** are not
negotiable and are not subject to "just this once".

---

## 1. Hard rules

### Asset hygiene — nothing from the game is ever committed

This repository contains **only code we wrote**. Nothing extracted from the
`.ipa` may enter git history, in any form:

| Never commit | Includes |
|---|---|
| Extracted game assets | `.bdae`, `.tga`, `.tbl`, `.trn`, `.msk`, `.shw`, `.itm`, `.wld`, `.phy`, `.beff`, `.wav`, `.bin`, `.ipa` |
| Decoded copies of them | PNGs of game textures, JSON dumps of scenes/models/tables, extracted meshes |
| Pictures of them | screenshots, render captures, GIFs, videos |
| Third-party reference material | anything redistributed rather than written here |
| Local filesystem paths | absolute paths, `.ipa` filenames, anything naming a release group |

The decoders are ours and are public. What they read and what they produce is
neither.

### Where knowledge comes from

Work here from: **the user's own files**, read with the decoders in
`client/src/assets/`; **behaviour anyone can observe** by playing the game, in
play or in screenshots of it; **public format specifications** (SWF, OpenType,
PVRTC); the protocol shared with **this project's server**; and **your own
choices**, labelled as such. Do not consult source code of the game or its
servers. docs/PROVENANCE.md records which of these each fact came from.

- **No copied code.** No code here is copied from the game or its servers.
  No GPL code is used. Code from
  permissively licensed open source (MIT, BSD, Apache-2.0, zlib) is allowed:
  keep its licence notice, list it in `NOTICE`, and record the version in
  [docs/PROVENANCE.md](docs/PROVENANCE.md).
- **No internal names.** Identifiers, comments and docs use this project's own
  names. Names that appear in the user's files — a clip, a table column, a
  resource path — are data and may be used as data.
- **Provenance claims only when true.** A comment that says what a value
  *means* needs no provenance. When a note does say where a value came from,
  it says what actually happened, and nothing else. If you do not know, say
  what the value means and leave its origin out.
- **Interop facts go in [docs/PROVENANCE.md](docs/PROVENANCE.md)**, one line
  each: every file-format or protocol fact the code relies on, and how it was
  established.

**Before every commit:**

```bash
python tools/check_no_assets.py
```

It inspects what `git add -A` would pick up and fails on anything that looks
like game data. `--tracked` audits the whole existing tree. If a file it flags
really is ours, add it to `ALLOWED` in that script *with a reason* — do not
weaken the patterns.

> It matches on **file names and extensions only**. It cannot see a hardcoded
> path inside a file, so the rule below is on you.

### No hardcoded paths, ever

No absolute path belongs in a committed file. Not a drive-letter path, not
`/home/you/...`, not a `.ipa` filename.

In normal use nothing is hardcoded at all: the user picks their own `.ipa`
through the browser's file picker, and it never touches a path on disk that
the client chose. The one place a path can leak in is `client/test/`, where a
few tests want real game data:

```bash
UBIQUITOUS_PACK=/path/to/res.bin UBIQUITOUS_IPA=/path/to/game.ipa npm test
```

`python tools/find_pack.py 1.1.4` prints the `res.bin` for a build, unpacking it
from an `.ipa` into the git-ignored `.cache/` (set `UBIQUITOUS_IPA_DIR`) when it
is not there yet.

Both are read straight from `process.env`, are never committed, and when
neither is set those tests **skip** rather than error, so a clean checkout
stays green.

### Scratch stays local

`work/` and `debug/` are git-ignored. They hold one-off derivation and
diagnostic scripts, and they are where throwaway investigation belongs. Do not
re-add them to git — files tracked there have twice turned out to hardcode
local `.ipa` paths, which is exactly what the rules above exist to prevent.

Findings that matter get written up in `client/docs/formats/` or
`docs/BEHAVIOUR.md`, or turned into a portable test in `client/test/`. The script that produced them does not.

### Comments say why, never what

No committed comment restates what the code beside it already says. A
comment earns its place by saying *why* — the reason the code has to be
that way — or it goes. A test pinning the behaviour goes further than a
paragraph explaining it. One comment per declaration: a comment sitting
directly above another with no code between them is a doc whose member
moved out. History ("used to", "previously", "before now") belongs in
git, not in the file. The only standing exceptions are a one-line `Own
choice:` note on an eye-picked constant and a what-a-value-means note
where §5 requires one. After moving anything, run:

```bash
python tools/check_doubled_comments.py
```

---

## 2. What this repository is

```
client/     TypeScript + Vite + Three.js. The game client. It reads the
            user's own .ipa entirely in the browser — no server, no build
            step outside `npm run dev` / `npm run build`.
tools/      check_no_assets.py, the pre-commit hygiene guard. Python 3.7,
            standard library only. The only Python left.
docs/       BEHAVIOUR.md (what the client does, known gaps) and
            PROVENANCE.md (where each interop fact comes from).
```

---

## 3. The one rule that matters in `client/`

The game asks for **what it wants**, never for **where it lives**.

```
✅  const model = await resources.model('model/npc/wolf.bdae');
❌  const bytes = await ipa.read('res.bin/model/npc/wolf.bdae');
❌  const json  = await fetch('/api/model?path=...');
```

Everything else follows from this. The model comes from the user's own `.ipa`,
read entirely in the browser. Gameplay, world, renderer, UI and networking
must not be able to tell where a provider gets its data, or whether there is
more than one.

### Layering

Dependencies point **downward only**. A module may import from layers below it
and never from layers above.

```
   app/          lifecycle, wiring, the frame loop
     │
   ui/           HUD, boot screen        ← may only call app/game APIs
     │
   gameplay/     input, movement, network bodies
     │           ← no Three.js beyond the camera rig
   world/        entities, terrain       ← NO GPU, NO Three.js, NO fetch
     │
   renderer/     Three.js adapters       ← consumes resources, not formats
     │
   assets/       ═══ THE BOUNDARY ═══
     │           ids · types · ResourceSystem · AssetProvider
     │
   providers/    PackAssetProvider, in a Worker
     │
   core/         log, errors, config
```

`net/` sits beside `gameplay/`: it owns the protocol, the socket and the
server-id mapping, and carries no assets. `audio/` sits beside `renderer/`:
it consumes resources (`SoundClipData`, `SoundCue`) and owns Web Audio, and
nothing below `app/` reaches into it except through a narrow seam like
`CombatVisuals`' `VisualSounds`.

**What must never cross the boundary.** Below `assets/` may know about: BDAE,
GBMP, ATIL, FTABLE, PVRTC, TGA, `.ipa` structure, IndexedDB, Workers. Above it
may know about: `ModelData`, `TextureData`, `TerrainTileData`, `ZoneData`,
`Placement`, `ResourceId`.

If you are adding a format constant, a byte offset, or an endpoint name to
anything outside `src/assets/providers/`, stop — it is in the wrong place.

**Tiles are the load unit; zones are labels.** The world is one grid of
64-unit tiles streamed around the camera. A zone is a rectangle over it that
picks fog, sky and teleport targets. Zone rows are not sized to load
(`Silence` is 2×2 tiles, `sand box` 4,180).

**The renderer is told nothing.** It diffs `world.terrain.tiles` and
`world.entities` against what it has built, each frame; eviction is the same
diff in reverse.

---

## 4. Rules with teeth

1. **Binary parsers live in `assets/formats/` and `assets/vfs/`, nowhere else.**
   `assets/vfs/` reads the `.ipa` and pack containers; `assets/formats/` reads
   BDAE, PVRTC, TGA, FTABLE, terrain, `.phy` and the avatar compositor. A
   parser in `world/`, `renderer/` or a provider is in the wrong place —
   provider code assembles what the readers produce, it does not read bytes.

   Anything added here needs a test against real packs
   (`client/test/realPacks.test.ts`). Readers have been deleted before for
   describing formats that do not exist.

   The readers are TypeScript and not Rust/WASM because it was measured:
   TypeScript decodes a 1024² PVRTC texture in 54 ms in Chrome. The Rust
   toolchain is not a dependency of this project.

2. **Never let `world/` touch the GPU.** It holds positions and heights. If you
   need a `WebGLBuffer` or a `THREE.Mesh` there, the code belongs in
   `renderer/`.

3. **Use Three.js.** Do not hand-roll WebGL, write GLSL, or add a rendering
   abstraction over Three.js. If Three.js can do it, let it.

4. **No ECS.** Entities are plain records in a `Map`. Add an ECS only when
   there is a concrete problem it solves, and say what that problem is.

5. **No abstraction without a second implementation in sight.** One interface
   per real boundary. `AssetProvider`, not `IAssetProviderFactoryService`. A
   test double counts — `WebSocketLike` and `BodyViews` exist for that reason.

6. **Dispose what you allocate.** Three.js geometries, materials and textures
   are not garbage collected off the GPU. Every `new` in `renderer/` needs a
   matching `dispose()`.

7. **UI calls in, never down.** `ui/` may read a snapshot and call game APIs.
   It may not reach into the renderer, the world, or the asset layer.

8. **One design system, and every value in it named.** Every colour, size,
   radius, shadow, transition and stacking layer the DOM draws with lives in
   `client/src/ui/styles/theme.css`, inside `@theme`, so it is a Tailwind
   utility and autocompletes. Components style themselves in `className` at
   the call site — including the screens built with `createElement`, which
   assign the same utility strings. See
   [client/docs/ui/COMPONENTS.md](client/docs/ui/COMPONENTS.md).

   What this forbids, and why:

   - **No third stylesheet.** `theme.css` is the system; `base.css` is the four
     elements `index.html` owns. A `components.css` is where component CSS
     starts accumulating again.
   - **No raw colour outside the theme**, and no `text-[#…]`. A colour that
     does not answer to a token cannot be re-tinted, and the contrast test
     cannot see it.
   - **No bare `z-<n>`.** Use the named layers. A `z-40` in a component is a
     claim about every other element on the page, made without looking at any
     of them. `z-10` for siblings inside one component is fine.
   - **No custom utility that renames one Tailwind already has.** Add one only
     for something Tailwind genuinely lacks — the z-layers, `transition-width`,
     the `short-landscape:` variant.
   - **`@apply` only in `base.css`**, for the shell elements no component can
     class.
   - **Art goes in a slot, never in a utility.** Every surface with a texture
     is a `surface-*` utility reading a `--texture-*` slot that ships as
     `none`; setting the slot re-skins everything wearing that material. A
     `background-image` written into a component is art nobody can swap.
   - **`data-*` for anything JavaScript or a test reaches for**, never a
     styling class. The next restyle is entitled to change the class.

   Enforced: `client/test/ui/designSystem.test.ts` fails the build on a hex
   outside the theme, an arbitrary Tailwind colour, a third stylesheet, a class
   selector in custom CSS, `@apply` outside `base.css`, a stray `!important`
   or a bare `z-<n>`.
   `theme.contrast.test.ts` fails it on a token that breaks its WCAG floor, on
   two tokens holding the same value, and once the palette grows past the
   colour cap set in that test.

   A near-duplicate is not a token. Three spacings a pixel apart, or four greys
   that all mean "muted text", are one design decision written down four times
   — pick the canonical one and use it everywhere.

9. **Take the decision out, not the code.** When a file gets uncomfortable to
   work in, the thing worth lifting is the rule buried in it, not the block of
   statements around the rule.

   Most clusters in a large class are one testable rule wrapped in plumbing.
   Pull the rule out with a test; the plumbing left behind reads fine.

   The counter-test is **how many collaborators the new module needs.** Past
   about four you are inventing an interface that carries the old class
   around, which rule 5 refuses. `TargetRing.ts`, `ZoneFog.ts` and
   `HeadIcons.ts` are the shape that works: a field cluster with a seam that
   needs no GPU and no session.

   **The test comes before the move**, always: it proves the move changed
   nothing. Size is only the prompt to go and look. Move and change are never
   the same commit.

---

## 5. Method — measure, do not reason

Every number in a fix must name the test or the measurement that produced it.
A binary layout that "looks about right" is a guess.

Answers come from the user's files first: decode the packs with our own
readers and look at what a table or a header actually contains. Where the
files do not settle a value, watch the game, compare, and tune until what you
see matches. A number that came out of that is worth writing down with how it
was reached; a number nobody can re-derive is not.

Write the result as **behaviour**. "Backing up runs at 0.4x forward speed" is
a finding. State its provenance only if the provenance is true and useful,
and never borrow a name that is not this project's own or the data's. This
applies to comments and docs alike, including `docs/BEHAVIOUR.md` and
`client/docs/formats/`.

### A comment describes the present, and one thing

**One comment per declaration.** A comment sitting directly above another
comment, with no code between them, is a doc whose member moved out or was
renamed — and what a reader now sees above a declaration describes something
else. They build up wherever code is being moved into modules of its own.
Run the check after moving anything:

```bash
python tools/check_doubled_comments.py
```

A hit is a lie until proved otherwise. Either the fact is already stated
where the code now lives, and the copy left behind goes, or it is the only
copy and belongs on whatever it actually names. It sees block docs and
one-line docs alike, and does not scan `client/test`, where the one benign
case lives: a `@vitest-environment` pragma above a test file's own doc.

**Say what the code does, not what it used to.** "Omitted before now",
"previously unread", "this used to hit the wrong string" — a test that says a
gap *used to* happen does not say it must not happen, and a doc that leads
with its own history buries the fact. Keep the finding, drop the account.
Git has the account.

### A test must reach the code the game runs

If nothing but a test calls something in `src/`, the test is not testing the
game. It passes, it reads like cover, and the behaviour it describes never
happens. `fitOutside` covered the map-sizing choice that was not taken;
`equipmentHomeFor` previewed a landing slot no screen asks for.

Find them by intersecting three sets: declared in `src/`, named in no other
file under `src/`, and named in a file under `test/`. Then, for each:

| What it is | What to do |
|---|---|
| A twin of the function production calls | Delete it; the test asks the one production calls |
| A constant specialising one production evaluates | Delete it; the test calls the function (`minimapHalfWorld(1)`, not a zoom-1 constant) |
| A reset for module-level signal state | Move it to `test/helpers/stores.ts`, written through the store's own exported signals |
| An observation impossible from outside | Keep it, and say so in its doc comment |

Only the last row is legitimate, and it has to earn itself — a cache hit is
invisible from outside, so `cacheStats` stays and its doc says why. "For
diagnostics and for the tests" does not count when nothing diagnostic reads
it.

`dev/` is a second real consumer, not a test. Something only the review tool
uses is reached by a person, and stays.

### Write down what you chose, where you chose it

A constant picked by eye gets a one-line `Own choice:` comment where it is
declared. Comments say *why*, never *what*; prefer a test to a paragraph.
Do not add Markdown to explain code.

[docs/BEHAVIOUR.md](docs/BEHAVIOUR.md) holds only what the code cannot:
behaviour the owner observed in play, server behaviour the client works
around, and approximations a reader would not spot. Missing behaviour goes in
the [issue tracker](https://github.com/UbiquitousCore/ubiquitous-client/issues), as a line in the issue for its area.

---

## 6. Where to add things

| You want to… | Do it here |
|---|---|
| Support a new resource kind | `assets/ids.ts` + `assets/types.ts` + `PackAssetProvider` |
| Add or fix a format reader | `assets/formats/` — a real-pack test, a spec in `client/docs/formats/`, and a line in `docs/PROVENANCE.md` |
| Change how a resource is assembled | `assets/providers/local{Model,Zone}.ts` |
| Change how the .ipa is read or cached | `assets/vfs/` |
| Add persistent caching | implement `ResourceCache`, pass it to `ResourceSystem` |
| Draw something new | `renderer/` — a factory that takes a resource type |
| Play a sound somewhere new | `app/Game.ts` calls `AudioEngine.play` by `c_sound` id or file name; the rule deciding *when* goes in `audio/` or `gameplay/` with a test. `/dev/sound.html?dir=<packs>` auditions any zone or sound |
| Add movement, collision, combat | `gameplay/` |
| Change what the Graphics slider buys | `core/graphics.ts` — the anchors and the profile; the renderer and streamer only read it |
| Add a setting | `ui/components/ArtOptionsWindow.tsx` for the row, `ui/optionsStore.ts` for the field and its validation, `Game.applyOptions` to act on it |
| Change how a server-owned body moves or animates | `gameplay/NetworkBodies.ts` |
| Track a new kind of entity | `world/World.ts` |
| Talk to the game server | `net/` — see [client/docs/NETWORKING.md](client/docs/NETWORKING.md) |
| Change how clips are chosen | `gameplay/ClipMachine.ts` |
| Add a second provider | `app/Game.ts`, the constructor, plus the `AssetProvider` interface if it needs a new capability |
| Style anything | Tailwind utilities in `className`, at the call site |
| Add a colour, size, radius, shadow, animation or layer | `client/src/ui/styles/theme.css`, inside `@theme` — nowhere else |
| Add a reusable UI element | `client/src/ui/components/` — a component for a UI concept, never for a CSS property |
| Add a screen to the character window | an `Art*Window` in `client/src/ui/components/`, plus its id in `ui/screenIds.ts` and a branch in `InventoryWindow.tsx` |
| Change the screens before the world (sign in, pick, make) | `client/src/ui/frontend/`; the ground they stand on is `client/src/renderer/SelectionScene.ts` |
| Drop in a texture | set the `--texture-*` slot; never touch a `surface-*` utility |
| Style a screen built with `createElement` | the same utility strings; `Button.tsx` exports its face for exactly this |

The worn screens target the **1.1.4** build. A caption in
`client/src/ui/art/screenMeanings.ts` is quoted as `@<number>?<word>`: take
the number from 1.1.4's interface string file, not 2.2.0's — the same word
sits at a different number in each. Name only elements 1.1.4's movie carries,
and leave out what only a later build has. The word after the `?` is still
what lets another build find its own copy.

`client/test/screenSpecPacks.test.ts` holds the table to this, against the
build in a directory named `1.1.4` (`.cache/1.1.4/res.bin`, or `UBIQUITOUS_PACK`
pointed at a `res.bin` inside such a directory). Check which build a pack is
before trusting it: an older pack numbers its words differently again.

---

## 7. Running things

```bash
cd client && npm install && npm run dev          # the client, on :8780
```

Open it and choose your `.ipa`. See [README.md](README.md).

```bash
python tools/check_no_assets.py       # hygiene — run before committing
cd client && npm test                 # client subsystems
cd client && npm run typecheck        # src and tests
cd client && npm run build            # client builds
cd client && npm run format           # Prettier, incl. Tailwind class order
```

`/dev/hud-lab.html` needs no game data; see
[client/docs/ui/COMPONENTS.md](client/docs/ui/COMPONENTS.md).

These need a build on disk: start vite with `UBIQUITOUS_PACK_DIR=<packs>` and pass
`?dir=<packs>`.

| Page | What it is |
|---|---|
| `/dev/front.html` | The screens before the world, over the ground they stand on, with no server behind them |
| `/dev/screen-gallery.html` | Every worn screen with sample data, each tab in turn, and why any falls back. See [client/docs/ui/SCREEN_GALLERY.md](client/docs/ui/SCREEN_GALLERY.md) |
| `/dev/sound.html` | Every zone's music and ambience and every sound, through the client's audio engine. Needs `tables.bin` and `sound.bin` |
| `/dev/shader-lab.html` | The build's own water program and our fallback on one plane, the program's inputs on sliders, a PNG capture and a fingerprint to measure the gap. `?dir=` names the folder of packs or a single `.ipa` |

Test the seams, not the framework:

- **providers** — pack bytes in, resource type out. The rotation conventions
  pinned in `client/test/` were derived by measurement and are easy to break
  silently.
- **ResourceSystem** — caching, de-duplication, error semantics.
- **world** — terrain sampling and entity bookkeeping, no rendering.
- **renderer factories** — resource in, `Object3D` out. These run headless;
  building a scene graph needs no WebGL context.

Do not write a test that only proves TypeScript compiles.

The 2.2.0 `.ipa` is ~1.64 GB; packs extract lazily into browser storage on
first run. The client targets modern browsers; Node 26 for tooling (`.nvmrc`).

---

## 8. Picking up work

The **[issue tracker](https://github.com/UbiquitousCore/ubiquitous-client/issues)** is the list of open work, written as
behaviour and grouped by area. Take a line; tick it off when it is done.

**One working tree per agent. Not negotiable.** A shared checkout lets one
agent's reset revert another's uncommitted work.

```bash
git worktree add -b <branch> ../wt-<name> main
```

Branch from `main`, and rebase onto it before merging: a worktree cut days ago
will silently revert whatever landed since.

---

## 9. Things that look done but are not

- **Collision (working, roughly tuned).** `.phy` files are decoded and kept as
  world-space triangles in `CollisionWorld`. Floors, walls and sliding all
  work; `?collision=1` draws the wireframe. Still guesswork: spheres are boxes,
  and stairs and water have no special handling. Some models ship no `.phy` at all — the inn, forest
  trees, every `*_inside` companion — and are walk-through for that reason.
- **Caching.** `MemoryResourceCache` is session-only; only the raw packs
  persist between sessions.
- **Networking.** The client connects, signs in, makes or picks a character
  and sees other players and creatures move. Not built: reconnect (a dropped
  socket stops, it does not come back). The
  networking issue in the [tracker](https://github.com/UbiquitousCore/ubiquitous-client/issues) has the rest.
- **Zone switching.** `Renderer.loadZone` drops entity views as well as
  terrain, so the previous zone does not stay visible in the distance. Local
  entity ids are never reused (`World.nextId` only counts up), but the
  server's network ids belong to the map a body is on: anything cached per
  network id must be dropped at the switch, or an unrelated body in the new
  zone inherits it.

---

## 10. Lessons learned

Hard-won and easy to rediscover the expensive way.

- **`.phy` file naming**: `model/foo/bar.bdae` → `model/foo/bar.phy` in
  `model_phy.bin`. NOT `model/foo/phy.bdae`.
- **`.phy` axes**: a point `(x, y, z)` in a `.phy` file is `(x, z, -y)` in
  the world, NOT `(x, -y, z)`. The Y and Z axes swap, and the old Y (now Z) is
  negated. A primitive's half-size needs the same swap — it is an extent, but
  the axis it extends along changes.
  Getting this wrong swaps bridge dimensions (a 100-unit roadbed shows as
  100 units tall instead of 100 units deep).
- **`.itm` quaternions must be conjugated**, once, in the provider: the file
  stores the inverse of the rotation a placement has in the world. Scenery and
  collision both go through `itmRotation`, so their geometry lines up;
  a consumer that skips it puts collision at the opposite angle to the model
  it belongs to, which is invisible until something draws it. A third consumer
  must use it too.
- **Pack lookups must be case-insensitive.** `model_phy.bin` capitalises names
  differently from the `.itm` placements that reference them:
  `maincity_inn.bdae` → `maincity_Inn.phy`. An exact match silently drops the
  asset, and a silently-missing collision mesh looks exactly like a bug in the
  physics. Index by lowercase name.
- **A zone is placed from two sources, not one.** The map's `.itm` tiles
  (scenery) and the spawn tables (statics). Anything consuming placements needs
  both — collision consumed only `.itm` and left every spawn-table building,
  the bank included, walk-through. `localZone.ts` reads both.
- **Animation keyframe offsets**: some clips (`walk_forward`, `run_normal`)
  have keyframes starting at tick 22–30, not 0. Three.js loops 0→duration,
  causing a visible pause. `toThreeClip` shifts them to start at 0.
- **Animation clip names**: the files use descriptive names (`run_normal`,
  `run_spint`), not generic ones (`run`, `sprint`). Brute-force search the pack
  for available clips rather than guessing — `client/dev/searchAssets.ts`.
- **Preact appends `px` to a numeric style value** unless the property is on
  its short unitless list, and `aspect-ratio` is not on it. `style={{
  aspectRatio: w / h }}` becomes `aspect-ratio: 1.159px`, which the browser
  drops silently — the minimap button ended up zero pixels tall and everything
  placed in percentages of it vanished. Pass a string. happy-dom computes no
  layout, so no component test catches this: assert the style value.
- **Debug the thing you can see.** Three sessions chased a collision bug
  through console tables of averaged heights. Ten minutes of wireframe found
  it. Build the view first.
