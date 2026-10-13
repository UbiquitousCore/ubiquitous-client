# Screen spec notation

A worn screen (`Art*.tsx`) draws a dialog from the player's interface movie
(`ui/IGM.swf`, or `ui/LGM.swf` before the world). `dialogShape.ts` infers
what the movie settles on its own; `screenMeanings.ts` names what only we can
say; `screenSpecs.ts` merges them, and the table wins.

## Naming parts

- A part with no name is written as its holder, `@`, and its depth:
  `meter@1`. One outline of the shape there adds `#n`, counted from one:
  `backdrop@2#1`. Neither is checked by name; the screen's real-pack test
  checks what it draws.

## Quoting the build's words

- `@308` is entry 308 of the build's string file. `@219#3` is the third entry
  after the one found, for runs that go in step with a run of our own numbers.
- A build that numbers differently is searched for the entry. A quote may carry
  the opening words to search by — `@308?Account`, the same word or one
  beginning with it, the copy nearest the number winning; markup is ignored
  when comparing. A shipped screen carries a **digest** of those words instead
  (`@308?~<16 hex>~<length>`, written by `quoteDigest` in `uiSpec.ts`), so the
  build's text stays the user's own rather than this tree's.
- Tests and benches, which invent their words, may spell them out.
- Digest only the opening few words, never a whole entry.
- Numbers come from **1.1.4**'s string file (see AGENTS.md §6).

## Fallback

A screen with no spec draws its built window. `screenFallback(name)` gives
`no-movie`, `not-mapped`, `no-dialog` or `missing-part`. `missing-part` is
strict on purpose: a table written for one build may meet another, and a
screen missing a part is worse than the built window.

## Checking

- `test/screenSpecPacks.test.ts` — every named element, tab, value, quote
  and icon against the player's builds; skips without packs.
- `/dev/screen-gallery.html?dir=<packs>` — every mapped screen with sample
  data.
- `/dev/parts.html?dir=<packs>&dialog=<name>&movie=LGM` — one dialog with
  every named part outlined.
