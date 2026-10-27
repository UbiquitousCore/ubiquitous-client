# Ubiquitous Client

An unofficial web client for Order & Chaos Online. It reads the `.ipa` you
supply and plays it in a browser: models, textures, terrain, animation,
collision, tables and interface art are decoded locally in a Worker. No asset
server is involved. Multiplayer state comes from a game server over a WebSocket.

> **Target build: 1.1.4.** Screens and behaviour are built against the 1.1.4
> `.ipa`. Other builds can be supported: builds close to 1.1.4 should need
> little work, more distant ones more. Particle effects decode at `.beff`
> versions 8 and 9 (1.1.4, 2.2.0); on 1.0.2 effects, and scenery drawn by
> them, are skipped.

## Run

You need three things: this client, [ubiquitous-server](https://github.com/UbiquitousCore/ubiquitous-server)
(it holds the world; without it the client is single-player) and your own
legally obtained 1.1.4 `.ipa`.

```bash
./setup.sh                    # once: Node 26 if missing (via fnm), then npm ci. Windows: setup.bat
cd client && npm run dev      # the client, on http://localhost:8780
```

Then:

1. Start the server (its README: `./run.sh start` for Docker, or `just dev`) and
   make a login: `./run.sh account create <name>`.
2. Open <http://localhost:8780> and choose your `.ipa`. The first run unpacks
   the packs into your browser's storage (about 1.5 GB), once; the `.ipa` is not
   needed again. Nothing is uploaded anywhere.
3. Sign in with that name and password. `WASD` moves, drag to look, wheel to
   zoom, space jumps.

Open it as `localhost` or over https: pack storage needs a secure context, so
over `http://192.168.x.x` the client says so on the boot screen and caches
nothing. `await ubiquitous.storage()` in the browser console shows usage and
`await ubiquitous.clearPacks()` starts over.

Without a server it is single-player against the local data. The server address
is the `server=` line of `client/public/config.txt` (default
`ws://127.0.0.1:8781`, where the server listens); `UBIQUITOUS_SERVER_PORT`
overrides just the port.

Already have Node 26 or newer? Skip `setup.sh`: `cd client && npm ci && npm run dev`.
For a production build, `npm run build && npm run preview`. After pulling
changes, run `npm ci` again when `client/package-lock.json` changed, and restart
the dev server.

The admin panel (teleport, walk speed, flight, collision wireframe, and giving
yourself items, searched by name or id, or gold) is for GMs.
Against a server it appears only after signing in as a GM account
(`account gm <name> on` on the server); played alone it shows under
`npm run dev` and is hidden in a production build, and `admin=false` in
`config.txt` or `?admin=0` hides it everywhere.

## Supported versions

The client was built using the **1.1.4** `.ipa`, and its character and
inventory screens are drawn to match it. **2.2.0** reads too. Other versions
may work but are untested and may show missing or wrong data; supporting every
version is the aim and will be worked on later.

## Configuration

Copy `client/env.example` to `client/.env` (git-ignored). Variables:

| Variable | Effect |
|---|---|
| `UBIQUITOUS_LAN=1` | listen on every interface, to open it from a phone or second PC |
| `UBIQUITOUS_CLIENT_PORT` | dev port (default 8780), to run checkouts side by side |
| `UBIQUITOUS_SERVER_PORT` | game server port, overriding `server=` in `config.txt` |
| `UBIQUITOUS_PACK_DIR` | folders of extracted packs or `.ipa` for the `/dev/` pages |
| `UBIQUITOUS_LAN_PACKS=1` | required to combine the two above, since it serves game files to the network |

Pack storage needs a secure context, so the dev server always serves https.
Install [mkcert](https://github.com/FiloSottile/mkcert) (`brew install mkcert`)
and it makes the certificate on first start, and again whenever the laptop's LAN
address changes (`client/.cert/`, git-ignored). With `UBIQUITOUS_LAN=1`, open
`https://<laptop-ip>:8780/mkcert-root-ca.pem` on the phone once, accept the
warning to download it, and install it as a trusted CA; after that no Chrome
flag is needed. Without mkcert the server falls back to plain http and says so.

Query-string overrides, read at boot (`client/src/core/config.ts`):

| Param | Effect |
|---|---|
| `?zone=Highforest` | open a different zone (`?zone=471` is the usual test zone) |
| `?log=debug` | verbose logging |
| `?tiles=5` | pin the streamed window width in tiles (odd, min 3) |
| `?anim=0` | hold characters at bind pose |
| `?collision=1` | draw the collision wireframe |
| `?admin=1` / `?admin=0` | show or hide the admin panel for the session |

`client/public/config.txt` holds the defaults: the server address, `debug` and
`admin`. Unset, the admin panel shows under `npm run dev` and is hidden in a
production build.

## Commands

```bash
cd client
npm run dev         # dev server
npm run build       # typecheck + production build
npm run typecheck
npm test
python ../tools/check_no_assets.py   # before every commit
```

Search a pack by resource name:

```bash
UBIQUITOUS_IPA=/path/to/game.ipa npx tsx client/dev/searchAssets.ts <pattern>
```

Options: `--regex`, `--pack <name>` (default `res.bin`), `--list-packs`.

In a dev build `window.__game` exposes `inspect()` (client state and timings) and
`step()` (render one frame). `ubiquitous.stressTest(100)` spawns a crowd around
the nearest training dummy (needs the server); read the result with
`ubiquitous.inspect()`.

## Documentation

| Read | For |
|---|---|
| [AGENTS.md](AGENTS.md) | the rules: asset hygiene, layering, how to work here |
| [Issues](https://github.com/UbiquitousCore/ubiquitous-client/issues) | open work |
| [docs/BEHAVIOUR.md](docs/BEHAVIOUR.md) | behaviour observed in play, and approximations |
| [docs/BUILDS.md](docs/BUILDS.md) | which game builds are supported and verified, and the fallback UI rule |
| [docs/PROVENANCE.md](docs/PROVENANCE.md) | where each file-format and protocol fact comes from |
| [client/docs/formats/](client/docs/formats/) | one spec per file format |
| [client/docs/NETWORKING.md](client/docs/NETWORKING.md) | the server contract |
| [client/docs/ui/](client/docs/ui/) | the design system and screen-spec notation |

Nothing from the game is committed here: no assets, decoded copies,
screenshots or local paths. See [AGENTS.md](AGENTS.md).

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
on, or served by any server this project runs. You must supply your own legally
obtained copy of the game. This project does not tell you where to obtain it
and will not help you do so.

File-format details are recorded only as far as needed for interoperability;
see [docs/PROVENANCE.md](docs/PROVENANCE.md).

Rights holders: if you believe anything here infringes your rights, open an
issue. It will be reviewed and removed promptly.
