# Image provenance

Every image this repository commits is listed here, one entry per file, by
its path from the repository root. `tools/check_no_assets.py` refuses any
image that is not named in its `ALLOWED` set, and any allowed image that has
no entry here.

Each entry says who made the file, how it was made, and whether any game
asset was used as input. The answer to that last question must be "none".

An image that carries an AI-provenance manifest (C2PA / JUMBF) is refused
unless its entry has a line reading `AI provenance manifest: accepted`,
followed by the reason. An SVG may not contain `<image>` or a `data:` URI.

Everything else the interface wears is either drawn in CSS and inline SVG
written in this repository, or read at runtime from the player's own game
files and never stored here.

## App icons

The owner's own logo, at each size the page and the manifest name. Artwork generated with Google Gemini on the owner's account; the generator's licence/terms are not yet verified, and the favicon conversions below went through an online favicon generator whose name was not recorded.

### `client/public/icons/icon-192.png`

- Made by: the owner, with Google Gemini.
- How: the owner's 192 px icon, unchanged.
- Game assets used as input: none.
- Status: supplied by the owner as their own artwork, 2026-10-04.

### `client/public/icons/icon-512.png`

- Made by: the owner, with Google Gemini.
- How: the owner's 512 px icon, unchanged.
- Game assets used as input: none.
- Status: supplied by the owner as their own artwork, 2026-10-04.

### `client/public/icons/icon-512-maskable.png`

- Made by: the owner, with Google Gemini.
- How: the owner's 1024 px icon with the white corners trimmed (7% off each edge) so the art fills the square a maskable icon is cut from, resized to 512 px.
- Game assets used as input: none.
- Status: supplied by the owner as their own artwork, 2026-10-04.

### `client/public/icons/apple-touch-icon.png`

- Made by: the owner, with Google Gemini.
- How: the owner's 1024 px icon with the white corners trimmed (7% off each edge), resized to 180 px; Safari rounds the corners itself.
- Game assets used as input: none.
- Status: supplied by the owner as their own artwork, 2026-10-04.

### `client/public/icons/favicon-32.png`

- Made by: the owner, with Google Gemini; converted with an online favicon generator (name not recorded).
- How: the owner's 32 px icon, unchanged.
- Game assets used as input: none.
- Status: supplied by the owner as their own artwork, 2026-10-04.

### `client/public/icons/favicon-16.png`

- Made by: the owner, with Google Gemini; converted with an online favicon generator (name not recorded).
- How: the owner's 16 px icon, unchanged.
- Game assets used as input: none.
- Status: supplied by the owner as their own artwork, 2026-10-04.
