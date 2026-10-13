# Asset processing: the packs and the GPU programs

The audit's **F-05** (the client inflates every pack into browser storage,
re-encodes loading art to WebP and copies the bundle's fonts) and **F-06** (the
client loads the game's GLSL from `res.bin` and compiles it) are what make the
game look and sound right. They are not to be deleted on the audit's say-so.
This file is the decision the owner has to make: how much of that processing to
keep, and in what form, so the look survives with less copying of the game's
material.

Nothing here is started. It is a decision plus a work list.

## What the client does today

- `Library.extractAll` / `PackStore.open` inflate each pack and write it to
  OPFS at `ubiquitous-packs/<build>/<pack>.bin` (~1.5 GB), with a manifest so the
  `.ipa` is not needed again (`client/src/assets/vfs/Library.ts`,
  `PackStore.ts`).
- `Library.typefaces` reads every `.ttf/.otf/.ttc` in the `.app` and
  `PackStore.writeTypeface` keeps the bytes in OPFS for later sessions.
- `PackAssetProvider.buildSplashCache` decodes zone loading art and re-encodes
  it to WebP, stored per top zone.
- `PackAssetProvider.loadShaderText` reads the game's GLSL from `res.bin`; the
  water, waterfall and terrain materials adapt and compile it
  (`client/src/renderer/{packProgram,waterShader,waterfallShader,terrainShader}.ts`).

## The question

Each of those is a copy or a derivative of the user's own game material. A
persistent copy is not obviously covered by the transient-copy exception, and
executing the game's shaders is a separate act again. The owner wants to keep
the look. The options, cheapest first:

1. **Keep runtime loading, drop persistence.** Inflate packs into memory for
   the session and release them; read fonts and loading art from the `.ipa`
   handle on demand; never write a derived WebP. The look is unchanged; the
   cost is re-inflating on every reload, and the `.ipa` must be reachable
   (the file handle is already kept in IndexedDB).
2. **Keep a cache the user controls.** Treat OPFS as an explicit, clearable
   cache (`ubiquitous.clearPacks()` already exists), make clear on the boot screen
   that it holds the user's own game data, and stop deriving new artefacts
   such as the WebP splash.
3. **Rewrite the shaders.** The three fallbacks already exist; make them the
   sole path for a build that ships no program, or offer a setting that never
   reads the game's GLSL. Loses the exact water/ground look unless the
   fallbacks are tuned against the game. A bench now exists for that tuning:
   `/dev/shader-lab.html?dir=<packs>` draws the build's own water program and
   our fallback on one plane, moves the program's inputs on sliders, captures
   a PNG, and prints a fingerprint distance between the two so a clean-room
   shader can be measured as it is written (`client/dev/shader-lab.tsx`,
   `client/dev/shaderCompare.ts`).
4. **Leave as is**, and take counsel's view on the copying (the audit's
   preferred first step before any hosted build).

### Owner's decision (2026-10-11)

Option 1 or 2 — session-only by default, with persistence only if measured to
be necessary. Questions to settle before the code changes:

- `res.bin` is 654 MB and DEFLATE cannot be seeked, so dropping persistence
  means inflating a whole pack into memory. The memory fallback in
  `PackStore.open` already warns about this. **Measure** the peak on the target
  hardware before making session-only the default; it may OOM the tab.
- If it holds: keep the `.ipa` handle, inflate on demand, evict unused packs,
  never write to OPFS.
- If it does not: keep OPFS as a setting the user turns on, defaulting to
  session-only, and always drop the derived WebP splash and the font copies.

Option 3 keeps the look, and needs the owner's eyes on real hardware.

Options 1 and 2 keep the look; option 3 changes it. The loading-art WebP is the
easiest to drop: the source PNG is already unencrypted and the decode is cheap.

## What to do

- [ ] Take counsel's view (audit F-05/F-06) before changing the architecture,
      so the choice is made against advice rather than guessed.
- [ ] Decide between options 1–3, and write the decision here.
- [ ] If 1 or 2: reload the packs in memory or a clearable cache, and drop the
      WebP splash derivative.
- [ ] If 2: say on the boot screen what browser storage holds and who it
      belongs to.
- [ ] Whatever is chosen, record it in `docs/BEHAVIOUR.md` and
      `docs/PROVENANCE.md`.
- [ ] Add a test that pins the chosen behaviour (e.g. that no derived image is
      written, or that the game's GLSL is only read when the setting allows).

## Not to be confused with

- The plain cache of the user's own `.ipa` file handle (`ipaHandle.ts`) — that
  is the user's file, not a copy of the game's contents.
- `MemoryResourceCache`, which is session-only.
