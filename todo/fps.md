# Frame-rate brief: pick a number

Owner runs a 144 Hz display and never sees above 60. The client renders on
plain `requestAnimationFrame` with no limiter (`app/frameClock.ts`), so 60
rock-steady with single-digit frame ms means the OS/browser is vsyncing at
60 — check the display's refresh setting, which display the window is on,
and low-power mode first, and confirm with the diagnostics overlay's fps
against an independent test. If the overlay reads 60 with ~16 ms frames on
a true 144 Hz pipeline, the client is missing deadlines and the items below
apply. At 144 Hz the whole frame budget is 6.9 ms: every millisecond below
is the whole game.

## How to work a number (the prompt)

> Work item N from `todo/fps.md` in ubiquitous-client. First read `AGENTS.md` and
> follow it — one working tree per agent (`git worktree add -b <branch>
> ../wt-<name> main`, rebase onto main before merging), dependencies point
> downward only, binary parsers stay in `assets/`, `world/` never touches
> the GPU, comments say why never what, and the test comes before any move.
> Reproduce with the 200-bot stress scene and the diagnostics overlay
> (`preMs`/`drawMs`/`postMs`, draws, triangles) plus a DevTools trace
> sampled by JS function before and after. Then implement only item N,
> keeping every other number untouched. Verify with `cd client &&
> npm test`, `npm run typecheck`, `npm run build`, `npm run format`,
> then `python3 tools/check_no_assets.py` and
> `python3 tools/check_doubled_comments.py` from the root. Report frame-ms
> before/after and what you deliberately did not change.

Evidence both traces agree on: the stress trace (200 bots on a dummy)
spends ~49% of JS samples in three.js `projectObject` (166k/338k) with
`updateMatrixWorld`, matrix math and `hideDistantModels` behind it;
`PageAnimator::serviceScriptedAnimations` averages ~60 ms there. The roam
trace is led by our `render` (51k), `hideDistantModels` (31k) and program
selection (`getParameters` 14.5k). Bloom and screen-space AO are already
removed; do not re-add a fullscreen effect without a new measurement.

## 1. Batch static scenery by shared material (large)

Placements already instance per prototype (`renderer/staticBatch.ts`: one
`InstancedMesh` per mesh part), so 1,000 grass tufts of one type cost ~1
draw — but every unique building, prop and multi-material model pays its
own draws, one per mesh per material group (`countDraws` in
`renderer/drawBudget.ts`, whose comment puts the ceiling near ~10k draws).
Merge static batches that share a material, across prototypes, so a street
of different houses with the same wall material draws once. Overlaps
`todo/README.md`: split batches by cell / compact hidden rows, one call
per tile via `DataArrayTexture`, and the WebGPU question — read those lines
first and stay consistent with whichever lands first. Measure draws and
triangles in a dense city before/after; hiding behaviour (`hideDistantModels`,
`setDrawn`, fades) must be unchanged. Product call: none if draws only.

## 2. Find the program churn, then stop it (measure first, fix likely small)

`getParameters`/`getProgram` are top-ten samples in normal play, which
smells like a material taking `needsUpdate` every frame. Suspects:
foliage variant swapping (`syncUnbatchedFoliage`), the shadow-share path
(`shareSunShadow`, `applyShadowMode`), sprite materials. First add a
per-frame count of compiled/selected programs to the diagnostics
(`renderer.info.programs`, `Renderer.stats`), reproduce in a roam, and
name the churner. Then fix the churn, not the symptom — expected shape is
one line ceasing to invalidate. Do not touch program caching itself.
Accept on zero compiles per frame in steady play.

## 3. Stagger animation updates with distance (medium, owner: visible detail)

Every near body pays `mixer.update` plus a forced subtree matrix refresh
per frame (`advanceAnimations` in `renderer/Renderer.ts`), and the
skeleton upload-skip itself compares 16 floats per bone per skeleton per
frame (`renderer/skeletonUpdate.ts`). Pose near bodies every frame and
mid-range bodies every 2nd/3rd frame; the skip-test should bail on the
first word when a mixer did not run. Overlaps `todo/README.md`: distant
bodies posed every frame. Rates need the owner's eye in a crowd before
they ship — propose them from the measurements, do not pick them alone.

## 4. Stop paying double for near grass at High (small, owner: look)

At High (`foliageCutout: false`) every near foliage placement grows a
blend companion over its cut-out row (`updateFoliageCompanion`,
`admitFoliageCompanions` in `renderer/Renderer.ts`, up to
`MAX_FOLIAGE_COMPANIONS`): near grass draws twice. Either tighten
`FOLIAGE_BLEND_DISTANCE`, lower the companion cap, or default High back
to cut-outs. Any of these changes the look of every meadow up close, so
take before/after screenshots in the same spot and get the owner's eye.
Accept on companion count and near-field draws in the overlay.

## 5. Stride the per-frame entity walks (medium)

`Renderer.sync` walks every entity every frame comparing versions,
`World.updateNetwork` walks every entity including statics that cannot
move, and `collectShadows` (`renderer/ObjectShadows.ts`) scans every
entity to keep at most 200 discs — all three already have matching lines
in `todo/README.md` (version-compare walk, dynamic set for network,
stride the shadow scan). Measure each with the overlay first; stride,
dirty-flag, or split across frames only what the timings convict, and
keep all three behaviours identical. Also reads: `NetworkBodies.settle`
grounds every body in one frame on zone arrival.

## 6. Consolidate the HUD's per-frame work (small-to-medium)

Four loops paint on every animation frame (`GameHud`, `DamageNumbers`,
`ChatBubbles`, `PopMessages`), and the HUD republishes map rows and
world-unit state at 10 Hz with JSON compares (`todo/README.md`: publish
only on change, cache places/routes by region). At 144 Hz DOM writes are
frame budget too. Measure with the overlay's `hudMs` and a trace first;
merge the paint loops and publish on change, with no visible change to
update frequency. Do not restyle anything along the way.
