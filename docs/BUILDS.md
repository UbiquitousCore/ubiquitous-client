# Game builds

The client and the server are built against **1.1.4**. Other builds can be supported: builds close to 1.1.4 should need little work, more distant ones more. This page is the log of what has been checked, and the rules for adding a build.

## Version log

| Build | Status | What is known |
|---|---|---|
| 1.1.4 | Primary | Everything here is built and checked against it: screens, formats, server data. |
| 2.2.0 | Partial | Maps, zones and terrain load. No sign-in form shows (only the 3D scene), so the game cannot be entered. Ground textures and a few models the maps name are absent from the build; the warnings for them are expected. |
| 1.0.2 | Partial | Particle effects are version 7, which the reader does not know, so effects and the scenery drawn by effects are skipped. |

Status words: **Primary** (built against), **Verified** (named areas checked, listed), **Partial** (some areas work, listed), **Untested**. Add a row per build with what was actually checked, and the date.

## How builds are handled

Today readers recognise their file's shape and the screens assume 1.1.4's string numbering; there is no per-build profile yet. The plan is in the issue tracker:

- A profile per build that names, for each area (tables, world tiles, models, textures, effects, interface strings, audio, collision), the parser it uses: [client#36](https://github.com/UbiquitousCore/ubiquitous-client/issues/36).
- Table schemas per build, with every column named, so differences such as column counts are visible: [client#38](https://github.com/UbiquitousCore/ubiquitous-client/issues/38).
- Captions resolved by word when a build numbers its strings differently: [client#39](https://github.com/UbiquitousCore/ubiquitous-client/issues/39).
- The same for the server's importer: [server#26](https://github.com/UbiquitousCore/ubiquitous-server/issues/26).
- 2.2.0 specifically: [client#40](https://github.com/UbiquitousCore/ubiquitous-client/issues/40).

Rules for a new build: reuse an existing parser where the files match; where a build matches only in part, say so in its profile and write a parser for the differing part only; keep parsers small so they compose; record the result in the version log above.

## Fallback UI

Where a screen cannot be worn (no art for it in the build, or its captions are not mapped for that build), the client may show a **fallback UI**: a minimal screen that exists only so the game can be run. Rules:

- It lives in its own area, `client/src/ui/fallback/`, and is marked as fallback on screen and in the DOM (`data-fallback`), so it is never mistaken for the original game's look.
- It is used only when the worn screen cannot be built; the worn screen always wins.
- It covers what is needed to run (sign in, pick or create a character, connection and error messages), not a second copy of the interface.
- Which screens fell back, and why, is logged in the compatibility report.

Tracked in [client#37](https://github.com/UbiquitousCore/ubiquitous-client/issues/37).
