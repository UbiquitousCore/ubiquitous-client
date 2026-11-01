# Ubiquitous Client

A web client for Order & Chaos Online. It plays in your browser, reading the
`.ipa` you supply: models, textures, terrain, animation and interface art are
decoded on your own machine, and nothing is uploaded anywhere.

> Unofficial fan project, not affiliated with Gameloft. You supply your own
> legally obtained copy of the game. See [Legal](#legal).

## Play

You do not need this repository. The server project runs the server and this
client together from published images, with only Docker installed:

**[ubiquitous-server: Quick start](https://github.com/UbiquitousCore/ubiquitous-server#quick-start)**

It ends at a web address. Open it, choose your `.ipa` the first time (the
game unpacks into your browser's storage once, about 1.5 GB, and the `.ipa`
is not needed again), and sign in.

Controls: `WASD` moves, drag to look, wheel to zoom, space jumps.

If the boot screen complains about storage, open the page as `localhost` or
over https; browsers only keep the unpacked game for a secure page. The
server's [hosting guide](https://github.com/UbiquitousCore/ubiquitous-server/blob/main/docs/HOSTING.md)
covers phones and other computers.

## Supported versions

Built for the **1.1.4** `.ipa`; its character and inventory screens match it.
**2.2.0** reads too. Other versions may work but are untested and may show
missing or wrong data. Details: [docs/BUILDS.md](docs/BUILDS.md).

## Work on it

[docs/DEVELOPING.md](docs/DEVELOPING.md) has setup, configuration, query
flags and commands. Open work is in the
[issue tracker](https://github.com/UbiquitousCore/ubiquitous-client/issues).

| Read | For |
|---|---|
| [docs/DEVELOPING.md](docs/DEVELOPING.md) | run, configure and test the client |
| [AGENTS.md](AGENTS.md) | the rules: asset hygiene, layering, how to work here |
| [docs/BEHAVIOUR.md](docs/BEHAVIOUR.md) | behaviour observed in play, and approximations |
| [docs/BUILDS.md](docs/BUILDS.md) | which game builds are supported and verified |
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
