# UI components

## Labs

| Page                                    | What it is                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/dev/hud-lab.html`                     | The real `GameHud` over a stand-in backdrop, with seeded state                                                         |
| `/dev/worn.html?dir=<packs>&screen=hud` | The worn spell bar and jump button over the real HUD (`&bar=closed`, `&cooling=<id>:<share>,…`, `&cast=<id>`, `&dead`) |

`hud-lab` needs no game data. Nothing under `src/` imports them.

`/dev/screen-gallery.html` draws every worn screen from a build on disk; see
[SCREEN_GALLERY.md](SCREEN_GALLERY.md).

## Styling

**Tailwind utilities at the call site. No component CSS classes.**
`theme.css` is a Tailwind v4 `@theme` block, so every token is a utility.
Screens built with `document.createElement` put the same utility strings on
`className`; `Button.tsx` exports `BUTTON_BASE`, `BUTTON_VARIANT` and
`BUTTON_SIZE` for them.

Custom CSS is two files: `theme.css` (tokens, layers, variants) and
`base.css` (the elements `index.html` owns). `test/ui/designSystem.test.ts`
enforces the rules in AGENTS.md §4.8; `theme.contrast.test.ts` asserts every
colour pair a component renders against its WCAG floor.

Colours drawn by three.js (nameplates, the target ring) stay in
`src/renderer/`: bridging the theme into a WebGL material would make the
renderer depend on the stylesheet.

### Materials

A surface is a tint plus a texture slot. `surface-*` utilities read
`--texture-*` slots that ship as `none`; set the slots once to re-skin
everything:

```css
:root {
  --texture-leather: url('/textures/leather.png');
  --texture-size: 100% 100%; /* for one stretched sheet rather than a tile */
  --texture-repeat: no-repeat;
}
```

A slot holds a whole `background-image` value, so gradients and
`image-set()` fit. The test fails on a `surface-*` that bakes in its own image
or colour, and on a slot committed with art in it.

### Layers

Named z-layers in `theme.css`, lowest first: `z-world`, `z-hud`,
`z-hud-bar`, `z-hud-float`, `z-window`, `z-map`, `z-dialog` (above the map, so
a teleport confirm opens over it), `z-boot`, `z-login`, `z-admin` (reachable
over a stuck boot screen).

### Variants

`Record<Variant, string>` maps joined by `cx`; no `cva`, no `tailwind-merge`.
A caller's `className` adds utilities, it does not override. Where an
override is wanted, the component splits the property out: `BUTTON_CENTRED`
exists because two `justify-*` classes resolve by Tailwind's order, not the
order written.

## Conventions

1. Function components, controlled, presentational: value in through props,
   changes out through callbacks. No component fetches or reaches for game
   state.
2. Clamp hostile inputs. Overheal, `max` of `0` and `NaN` are ordinary; no
   fill may pass the end of its channel.
3. Extract a UI concept, not a CSS property.
4. Hooks for JavaScript and tests are `data-*`, never a styling class.
5. The HUD is `pointer-events-none`; interactive pieces opt back in.
6. `Dialog` does not trap focus: focus belongs to whatever opened it.
   `ItemTooltip` is unpositioned for the same reason.

## Accessibility

Real `<button>`, `<input>`, `<label>`. `IconButton` and `Dialog` require a
`label`. `focus-visible:shadow-selected` replaces every removed outline.
Colour is never the only signal (`aria-pressed`, numbers beside sweeps). Text
over the world carries `text-shadow-world`. `sm` controls hold the 24px WCAG
2.2 AA target floor and are for dense toolbars only. `base.css` cuts
animation under `prefers-reduced-motion`.

Component tests live in `test/ui/` (`/** @vitest-environment happy-dom */`)
and query the accessibility tree, not classes.
