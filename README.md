# Ubiquitous Client

**An unofficial web client for Order & Chaos Online. It reads the `.ipa` you
supply and plays it in a browser.**

You supply the `.ipa` you already own. The client reads the archives inside it
directly, entirely in the browser — models, textures, terrain, animation,
collision, game tables, interface art — and builds the world out of them.
Everything it draws from the game comes from your files at runtime; where
something cannot be read, it shows a neutral stand-in of this project's own.
No asset server is involved: the packs are opened, decompressed and decoded in
a Worker. Multiplayer state comes from a game server over a WebSocket.

```bash
cd client && npm install && npm run dev
```

Open <http://localhost:8780> and choose your `.ipa`. `?zone=471` opens the usual test zone. `WASD` moves, drag to look, wheel to zoom, space jumps.

### Playing multiplayer

Without a server the client plays single-player against the local data. For
multiplayer, run the server from the `ubiquitous-server` checkout — both modes serve
the address in `client/public/config.txt`, so the client needs no change:

```bash
just setup   # once: writes .env and server.json from their examples
just dev     # development: saves as editable JSON files, no Docker
just up      # or the full stack (server plus Postgres) in Docker
```

Bots, festival items and other game settings live in the server's
`server.json`; secrets live in its `.env`.

> **Nothing from the game is committed here** — no assets, no decoded copies,
> no screenshots, no local paths. The decoders are ours and are public; what
> they read and what they produce is neither. See [AGENTS.md](AGENTS.md),
> and run `python tools/check_no_assets.py` before every commit.

> **The first run extracts every pack** into browser storage (about 1.5 GB),
> once; after that the `.ipa` is not needed again. An interrupted extraction
> offers the file again to finish. `await ubiquitous.storage()` shows usage;
> `await ubiquitous.clearPacks()` starts over.

### Opening it from another machine

The dev server listens on `localhost` only. To reach it from a phone or a
second PC, start it with `UBIQUITOUS_LAN=1`:

```bash
UBIQUITOUS_LAN=1 npm run dev
```

It is then reachable at `http://<your-ip>:8780` by anyone on your network.
Over plain `http://` **it will work and cache nothing** (see below).

A game server running on the same PC at `ws://127.0.0.1:…` (the `server=`
line of `client/public/config.txt`) works from the phone too: the dev server
forwards the socket for it, so there is no need to open the server's port to
the network.

`UBIQUITOUS_PACK_DIR` lets the dev pages read your extracted packs or `.ipa` folder
from disk. Combined with `UBIQUITOUS_LAN=1` that would offer your game files to the
whole network, so the dev server refuses to start unless you also set
`UBIQUITOUS_LAN_PACKS=1` to say that is what you want.

The origin-private filesystem, where the extracted packs live, requires a
*secure context*. Only `https://` and `localhost` qualify — `http://192.168.x.x`
does not. The client detects this and says so on the boot screen rather than
letting you sit through a 1.5 GB extraction that is discarded on reload.

Options, easiest first:

1. Open it on the machine running the dev server, as `http://localhost:8780`.
2. Tell Chrome to trust that one origin: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
   add `http://192.168.x.x:8780`, set **Enabled**, relaunch.
3. Serve the client over https.

### Ports

```bash
UBIQUITOUS_CLIENT_PORT=8781 npm run dev
```

Lets a second checkout run alongside the first.

### Options

Query-string overrides, read once at boot by `client/src/core/config.ts`:

| Param | Effect |
|---|---|
| `?zone=Highforest` | open a different zone |
| `?log=debug` | verbose logging |
| `?tiles=5` | pin the streamed window's width in tiles (odd, min 3), overriding the Graphics slider's choice |
| `?anim=0` | hold every character at bind pose |
| `?collision=1` | draw the collision wireframe |
| `?admin=1` | show the admin panel (teleport, walk speed, flight) for this session; `?admin=0` hides it |

`client/public/config.txt` holds the defaults: the server address, `debug`, and
`admin`, which ships unset. Unset, the admin panel shows under `npm run dev`
and stays hidden in a production build (`npm run build`). `admin=true` or
`admin=false` there decides either way, and `?admin=1` / `?admin=0` wins over
both for one session.

---

## Status

Every zone is walkable: streamed terrain with live layer blending, skinned and
animated characters, collision, water, swimming and shadows. With a server it
signs in, makes or picks a character, and plays alongside other players and
creatures; without one it is single-player against the local data.

Readers key off what each file declares, not off a chosen build, so several
builds load. The exception is particle effects: `.beff` decodes at versions 8
and 9 (1.1.4 and 2.2.0), so on 1.0.2 effects, and scenery drawn by effects,
are skipped.

In a dev build `window.__game` is exposed: `__game.inspect()` dumps client
state and `__game.step()` renders one frame, for tabs where
`requestAnimationFrame` never fires.

## Performance

Rendering has never been profiled on real hardware, so measure before
changing anything below. With the server running, stand where the load is
(an admin account helps) and spawn a crowd around the nearest training
dummy in sight:

```
ubiquitous.stressTest(100)
```

Then read `ubiquitous.inspect()`: `networkMs`, `syncMs`, `clipsMs`, `effectsMs`,
`hudMs`, `preMs`, `drawMs`, draw calls and triangles. The HUD shows fps,
draws, entity counts and the `fx`/`clips` timings live. The audit's prime
suspect is the per-frame simulation over every mover with no distance gating
(`World.updateNetwork`, `NetworkBodies.updateClips`); the stress bots exist
to put numbers on it. The full list lives in [todo/README.md](todo/README.md).

Todos, in the order they should be attempted:

- [x] Time `updateClips` (`clipsMs`) and effect simulation (`effectsMs`) in
  `ubiquitous.inspect()` and the HUD.
- [x] Stress-test command on both sides (`dev.stressTest`): bots wander and
  swing at the nearest training dummy in sight.
- [ ] Run the benchmark scenes (100-bot crowd, dense spell combat with and
  without post-effects, high-density scenery, busy UI) and record the
  timings above on real hardware.
- [ ] Time `PostEffects.render` (GTAO + Bloom) and count skippable distant
  movers.
- [ ] Scale GTAO samples by graphics profile (low-risk).
- [ ] Reuse the live-tile `Set` in `syncTerrain` (per-frame allocation).
- [ ] Cull effects by distance, pool name-label canvases, publish the HUD
  incrementally — only if the measurements justify each.
- [ ] Prototype distance-gated simulation LOD for `updateNetwork` and
  `updateClips`, with resume/snap handling.

## Documentation

| Read this | For |
|---|---|
| [AGENTS.md](AGENTS.md) | the rules: asset hygiene, layering, how to work here |
| [todo/README.md](todo/README.md) | the open list |
| [docs/BEHAVIOUR.md](docs/BEHAVIOUR.md) | behaviour observed in play, and approximations |
| [docs/PROVENANCE.md](docs/PROVENANCE.md) | where each file-format and protocol fact comes from |
| [client/docs/formats/](client/docs/formats/) | one spec per file format |
| [client/docs/NETWORKING.md](client/docs/NETWORKING.md) | the server contract |
| [client/docs/ui/](client/docs/ui/) | the design system and the screen-spec notation |

## Commands

```bash
cd client
npm run dev         # dev server, port 8780 (UBIQUITOUS_CLIENT_PORT overrides)
npm run build       # typecheck + production build
npm run typecheck
npm test
python ../tools/check_no_assets.py   # before every commit
```

Search a pack by resource name (only the named pack is extracted):

```bash
UBIQUITOUS_IPA=/path/to/game.ipa npx tsx client/dev/searchAssets.ts <pattern>
```

`--regex` for a pattern, `--pack <name>` (default `res.bin`), `--list-packs`.

## Legal

This is an unofficial, non-commercial fan project. It is not affiliated with,
endorsed by, or sponsored by Gameloft SE or any rights holder. "Order & Chaos
Online" is a trademark of its owner and is used here only to say which game
files this software is compatible with.

This repository contains only source code written for this project, licensed
under Apache-2.0: no game asset files and no game binary or source code. It is
not a redistribution of the game.

The client reads, copies, decodes and transforms material from the copy of the
game you supply. That processing happens locally in your browser; the extracted
data is kept in your browser's own storage, and nothing is uploaded to, stored
on, or served by any server this project runs. To use it you must supply your
own legally obtained copy of the game. This project does not tell you where to
obtain the game and will not help you do so.

File-format details are recorded only as far as needed for
interoperability; see docs/PROVENANCE.md.

Rights holders: if you believe anything here infringes your rights, open an
issue. It will be reviewed and removed promptly.
