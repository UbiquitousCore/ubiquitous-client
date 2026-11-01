# Developing the client

Work on the client itself. To just play, see the
[README](../README.md). Rules for working in this repository are in
[AGENTS.md](../AGENTS.md).

## Run it

You need this client, [ubiquitous-server](https://github.com/UbiquitousCore/ubiquitous-server)
(it holds the world; without it the client is single-player) and your own
legally obtained 1.1.4 `.ipa`.

```bash
./setup.sh                    # once: Node 26 if missing (via fnm), then npm ci. Windows: setup.bat
cd client && npm run dev      # the client, on port 8780
```

Then:

1. Start the server from its checkout (`dotnet watch --project src/server run`,
   or `docker compose up dev` with only Docker) and make a login:
   `dotnet run --project src/server -- account create <name>`.
2. Open the address `npm run dev` prints (`https://localhost:8780` with
   mkcert installed, see below; `http://localhost:8780` without) and choose
   your `.ipa`. The first run unpacks
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
npm run format:check                 # CI fails on unformatted files
python ../tools/check_no_assets.py   # before every commit
cd .. && docker build -t ubiquitous-client .   # the image the server's compose file runs
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
