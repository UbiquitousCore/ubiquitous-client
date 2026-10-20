# Screen gallery

`/dev/screen-gallery.html` draws every worn screen on one page, out of a game
build on your own disk, filled with sample data. Use it to see a screen you
changed without playing to it, and to check in one pass down the page that no
other screen broke.

It is a dev page: nothing under `src/` imports it and it never ships. It needs
no server and no account.

## Running it

It reads the build straight from disk, so Vite must be told which folder it
may serve:

```bash
cd client
UBIQUITOUS_PACK_DIR=/path/to/packs npm run dev
```

then open

```
http://localhost:8780/dev/screen-gallery.html?dir=/path/to/packs/1.1.4
```

`dir` is the folder holding `res.bin` and `tables.bin`, unzipped from the
build's `.ipa`. Hold the screens to **1.1.4** (AGENTS.md §6): a folder named
`1.1.4` is also what `test/screenSpecPacks.test.ts` looks for.

If your `.env` sets `UBIQUITOUS_LAN=1`, Vite refuses to start with
`UBIQUITOUS_PACK_DIR` set, because that would serve the game files to your
whole network. Unset one of them for the gallery, or set
`UBIQUITOUS_LAN_PACKS=1` as well if that is really what you want.

| Parameter                    | What it does                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `dir=<folder>`               | The build to draw from. Required.                                                    |
| `only=<screen>,<screen>`     | Draw just these screens, by the names in `screenMeanings.ts` (`only=mail,mailRead`). |
| `hero=warrior\|mage\|ranger` | Whose character sheet the character screens show. A mage by default.                 |
| `open=<screen>`              | Which screen the side menu shows as open. The bag by default.                        |
| `packs=<file>,<file>`        | Which packs to read from `dir`. `res.bin,tables.bin` by default.                     |

## What is on the page

**The table at the top** lists every screen anything in the client asks for by
name. Each row says `drawn from the movie`, or `falls back:` with the reason
the screen cannot be worn from this build: a part the build lacks, a word it
does not have. A fallback here is what a player of that build would see.

**Below it, one cell per screen**, under a heading that gives the screen's
description and its name in brackets (`Mailbox (mail)`). Each cell is the
movie's own screen size at twice its size, outlined.

- A screen with tabs gets one cell per tab, labelled `tab <control> (<caption>)`.
  The gallery presses each tab for you.
- Some cells press a control once the screen is up, to show it doing
  something: the compare control on an item card, a reward on a quest.
- A screen that falls back gets a line saying so instead of a cell.

When everything has drawn, `?ready` is added to the address. That is what
`dev/shoot.mjs --page=/dev/screen-gallery.html` waits for before taking a
screenshot.

## Where the data comes from

The sample data is ours: the players, letters, listings, quests and numbers
are made up in `dev/screen-gallery.tsx`. What an item is called and what it
looks like come from the build, the same way play reads them, and so do every
picture, word and layout.

Screenshots of the gallery are pictures of the game's art: never commit them
(AGENTS.md §1).

## Adding a screen

Add an entry to `SHOWN` in `dev/screen-gallery.tsx`:

```tsx
{
  screen: 'mail',            // its name in screenMeanings.ts
  label: 'Mailbox',          // the heading over its cell
  draw: () => <ArtMailWindow inbox={sampleInbox} message={null} {...handlers} />,
  // Optional:
  // sized: 'fill' | 'own',   // a screen not placed on the movie's screen
  // tabs: false,             // the caller picks the tab, so draw one cell only
  // press: ['[data-reward]'],// selectors to click once it is up, in turn
},
```

An entry whose `screen` is not in `screenMeanings.ts` is skipped. Several
entries may show the same screen in different states. Each needs its own
`label`.
