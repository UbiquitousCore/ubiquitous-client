/**
 * One worn screen from a build on disk, with no game, server or picker.
 * Extract the packs once:
 *
 *     python3 -c "import zipfile,shutil;z=zipfile.ZipFile('<the .ipa>');\
 *       [shutil.copyfileobj(z.open(n), open(n.split('/')[-1],'wb'),1<<22) \
 *        for n in z.namelist() if n.endswith(('res.bin','tables.bin'))]"
 *
 *     UBIQUITOUS_PACK_DIR=<that dir> npm run dev
 *     open .../dev/worn.html?dir=<that dir>&screen=auction
 *
 * `?app=<file>.ipa` mounts a whole build (slow). `?screen=`: `auction`,
 * `card`, `storage`, `mail`, `trade`, `mailWrite`, `bag`, `character`,
 * `loot` (`?rows=`, `?money=`), `menu` (`?on=`), `hud` (`?showing=`).
 * `?ready` appears once everything has arrived; `__parts("<dialog>")` and
 * `__skin` are exposed for `dev/shoot.mjs --probe=`.
 */

import { effect } from '@preact/signals';
import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import {
  itemFactsId,
  itemIconId,
  itemNameId,
  itemTextId,
  spellTextId,
  uiIconId,
  uiFacesId,
  uiSkinId,
  uiStringsId,
} from '../src/assets/ids';
import type { UiSkinArt } from '../src/assets/types';
import { pieceNames, planArt, planPiece } from '../src/ui/art/piecePlan';
import {
  setEmblems,
  setMovie,
  setUiWords,
  uiWords,
  wantedDialogs,
  wantedEmblems,
} from '../src/ui/art/pieceStore';
import { SCREEN_MEANINGS } from '../src/ui/art/screenMeanings';
import { registerFaces } from '../src/core/lettering';
import { ArtAuctionWindow } from '../src/ui/components/ArtAuctionWindow';
import { ArtItemCard } from '../src/ui/components/ArtItemCard';
import { ArtMailWindow } from '../src/ui/components/ArtMailWindow';
import { ArtBagWindow } from '../src/ui/components/ArtBagWindow';
import { ArtCharacterWindow } from '../src/ui/components/ArtCharacterWindow';
import { ArtItemListWindow } from '../src/ui/components/ArtItemListWindow';
import { LootWindowContainer } from '../src/ui/LootWindowContainer';
import { lootWindow } from '../src/ui/lootStore';
import { cutToBlobUrl, cutUiSprites, setUiSprites } from '../src/ui/art/uiSprites';
import { ArtMailWriteWindow } from '../src/ui/components/ArtMailWriteWindow';
import { WornStage } from '../src/ui/art/WornStage';
import { ArtMenuBar } from '../src/ui/components/ArtMenuBar';
import { GameHud, setHeadshotSource } from '../src/ui/GameHud';
import { inCombat } from '../src/gameplay/SpellBook';
import { chatAsking, chatOpen, chatSaid, noteChat } from '../src/ui/chatStore';
import { mountUiTextures } from '../src/ui/styles/uiTextures';
import { seedMapBench } from './mapBench';
import { seedSpellBar } from './spellBarBench';
import { ArtStorageWindow } from '../src/ui/components/ArtStorageWindow';
import { ArtTradeWindow } from '../src/ui/components/ArtTradeWindow';
import { heroClass, money, player, setMapState, setPlayer } from '../src/ui/hudStore';
import {
  setClassTrees,
  setSpellIcon,
  setTalentPlaces,
  talentPlaces,
} from '../src/gameplay/SpellBook';
import {
  inventory,
  setInventoryActions,
  setStorageCapacity,
  setItemFacts,
  setItemIcon,
  setItemName,
  setItemText,
  setSpellText,
} from '../src/ui/inventoryStore';
import { equipmentHomesFor } from '../src/ui/items';
import { bankOpen, setStorageUpgrades } from '../src/ui/inventoryStore';
import { openCharacterWindow } from '../src/ui/hudStore';
import { setQuestLog, showQuestConversation } from '../src/ui/questStore';
import { initSpells, setSpellName, spellRanks } from '../src/gameplay/SpellBook';
import { setGuildRoster } from '../src/ui/guildStore';
import { setPartyRoster } from '../src/ui/partyStore';
import { showGossip, showShop } from '../src/ui/hudStore';
import { setMailInbox, setMailMessage, setMailOpened } from '../src/ui/mailStore';
import type { MailDraft } from '../src/ui/mailStore';
import { applyTradeStarted, applyTradeUpdated } from '../src/ui/tradeStore';
import type { AuctionListingView } from '../src/ui/auctionStore';
import '../src/ui/styles/global.css';

const params = new URLSearchParams(location.search);
const DIR = params.get('dir') ?? '';
/** A build to mount whole, for a directory holding the .ipa rather than packs. */
const APP = params.get('app') ?? '';
/** Packs to mount when there is no whole build to hand. */
const PACKS = (params.get('packs') ?? 'res.bin,tables.bin').split(',').filter(Boolean);
/**
 * Loose files worth offering beside the packs: the interface's own
 * lettering sits next to them rather than inside them. Missing is fine.
 */
const LOOSE = (params.get('loose') ?? 'Fontin-Regular.ttf').split(',').filter(Boolean);
const SCREEN = params.get('screen') ?? 'auction';
/** Which listing the card describes, for a bench showing one card. */
const ITEM = Number(params.get('item') ?? 1);
/** What to wear in its place, so the card has something to be held against. */
const WORN = Number(params.get('worn') ?? 1053);
/** Show some other thing on the card than the listing names. */
const ENTRY = Number(params.get('entry') ?? 0);
/** Turn the wheel over the list this many notches once it is up. */
const SCROLLED = Number(params.get('scrolled') ?? 0);
/** Press Search once the screen is up, to see a list rather than the prompt. */
const SEARCHED = params.get('searched') === '1';
/** Hold the compare control down once the card is up, as a finger would. */
const COMPARE = params.get('compare') === '1';
/** The window the whole HUD opens for `?screen=hud`, through its container as play does. */
const SHOWING = params.get('showing') ?? '';
/** Whether to put words in the chat log and over a head, for `?screen=hud`. */
const CHATTING = params.has('chat');
/**
 * Put a stand-in face in the hero's ring, for `?screen=hud`: without one the
 * ring shows its own empty cabochon, and whatever the frame lays over a face
 * cannot be seen against it.
 */
const FACE = params.has('face');
/** Put the hero in a fight, for `?screen=hud`. */
const FIGHTING = params.has('fighting');
/** Whether this side of a trade has said it is happy with the table. */
const CONFIRMED = params.get('confirmed') === '1';
/** How many letters to put in the mailbox, and which one is open. */
const LETTERS = Number(params.get('letters') ?? 9);
const OPENED = Number(params.get('opened') ?? 1);
/** How many things to put in a strongbox, split between its two halves. */
const STORED = Number(params.get('stored') ?? 14);
/** The first of the trees the bench's own class is given. */
const FIRST_TREE = 111;
/** Which tree the riding page reads, as the spec names it. */
const RIDING_TREE = 102;
/** Stage a talent tree of the bench's own, for the page that draws one. */
const TREE = params.get('tree') === '1';
/** The picture every staged place wears, by its file name in the user's build. */
const ICON = params.get('icon') ?? '';
/** How much room the bench's own bag has, for the offer to buy more. */
const ROOM = Number(params.get('room') ?? 24);
/** Show a sheet of art instead of a screen, with a region marked on it. */
const SHEET = params.get('sheet') ?? '';
/**
 * Fetch art for every named piece the movie carries, not only the ones the
 * curated screens name — for `?sheet=all` when the sheet being hunted for
 * belongs to a piece no screen has asked for yet. Slower: every piece in
 * the movie gets planned and its art requested, not just the ~40 curated
 * ones.
 */
const ALL_SHEETS = params.has('allSheets');
/** How many spells the bench's character knows. */
const SPELLS = Number(params.get('spells') ?? 5);
/** The region to mark, in the pixels the movie's fill matrices use. */
const MARK = (params.get('mark') ?? '').split(',').map(Number);

/** Listings with a shape worth looking at: a stack, a buyout, one of mine. */
const LISTINGS: AuctionListingView[] = [
  {
    id: '1',
    sellerName: 'Someone',
    // Entries in the user's tables, so what the card says comes out of the
    // build rather than out of this file.
    itemEntry: 5206,
    itemCount: 20,
    name: 'Sample Cloth',
    startPrice: 20_000,
    listedAt: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 3_600,
    buyoutPrice: 25_000,
    currentBid: 20_000,
  },
  {
    id: '2',
    sellerName: 'Someone Else',
    itemEntry: 1049,
    itemCount: 1,
    name: 'Legplate of Defense',
    startPrice: 250_000,
    listedAt: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    buyoutPrice: 300_000,
    currentBid: 250_000,
  },
  {
    id: '3',
    sellerName: 'Bench',
    itemEntry: 3,
    itemCount: 5,
    name: 'Sample Ore',
    startPrice: 500,
    listedAt: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 43_200,
    currentBid: 700,
  },
];

/**
 * How many times over to repeat the listings.
 *
 * A list that fits its window proves nothing about scrolling it, so the
 * bench can be told to overfill one.
 */
const OVER = Number(params.get('over') ?? 1);
const SHELF: AuctionListingView[] = Array.from({ length: OVER }, (_, round) =>
  LISTINGS.map(row => ({ ...row, id: `${row.id}.${round}` })),
).flat();

const NOTHING = {
  listings: SHELF,
  status: null,
  onBrowse: () => undefined,
  onList: () => undefined,
  onBid: () => undefined,
  onBuyout: () => undefined,
  onCancel: () => undefined,
};

/**
 * Every sheet the interface was drawn from, one after another.
 *
 * `?sheet=all` — for pointing at a piece of art and naming it: each is
 * drawn at its own size with its name and how fine a rung it is.
 */
function showSheets(art: Map<string, UiSkinArt>): void {
  const into = document.getElementById('worn');
  if (!into) return;
  const page = document.createElement('div');
  page.style.cssText =
    'display:flex;flex-direction:column;gap:12px;padding:12px;font:12px monospace;color:#e8dcc0;background:#151008';
  for (const [name, sheet] of [...art].sort(([a], [b]) => a.localeCompare(b))) {
    const canvas = document.createElement('canvas');
    canvas.width = sheet.image.width;
    canvas.height = sheet.image.height;
    canvas.getContext('2d')?.drawImage(sheet.image, 0, 0);
    canvas.style.cssText = 'image-rendering:pixelated;max-width:100%;border:1px solid #796244';
    const label = document.createElement('p');
    label.textContent = `${name} · ${sheet.image.width}×${sheet.image.height} · rung ${Math.round(1 / sheet.scale)}×`;
    label.style.cssText = 'margin:0;color:#cca76c';
    const block = document.createElement('div');
    block.append(label, canvas);
    page.append(block);
  }
  into.replaceChildren(page);
  document.body.setAttribute('data-ready', 'yes');
}

/**
 * Draw one sheet of art with a region marked on it.
 *
 * A screen that reads the wrong part of a sheet looks almost right, and no
 * amount of staring at the screen says which part it read. This says it:
 * the sheet as the build ships it, and the rectangle a fill claims.
 */
function showSheet(art: UiSkinArt | undefined): void {
  const into = document.getElementById('worn');
  if (!into) return;
  if (!art) {
    into.textContent = `no art called ${SHEET}`;
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = art.image.width;
  canvas.height = art.image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(art.image, 0, 0);
  if (MARK.length === 4 && MARK.every(Number.isFinite)) {
    // The marks are in base-rung pixels; a finer sheet holds the same
    // region at its own scale.
    const [x, y, w, h] = MARK.map(v => v / art.scale);
    ctx.strokeStyle = '#ff2d2d';
    ctx.lineWidth = Math.max(2, 2 / art.scale);
    ctx.strokeRect(x, y, w, h);
  }
  into.replaceChildren(canvas);
  canvas.style.width = '100%';
  canvas.style.imageRendering = 'pixelated';
  document.body.setAttribute('data-ready', 'yes');
}

function Bench(): preact.JSX.Element {
  const [note, setNote] = useState('Reading the build…');

  useEffect(() => {
    void (async () => {
      if (!DIR) {
        setNote('Pass ?dir=<absolute path to a directory holding res.bin>.');
        return;
      }
      const provider = new PackAssetProvider();
      const files: File[] = [];
      const trouble: string[] = [];
      for (const name of APP ? [APP] : [...PACKS, ...LOOSE]) {
        const got = await fetch(`/@fs/${DIR}/${name}`).catch(
          err => ({ ok: false, status: String(err) }) as unknown as Response,
        );
        if (!got.ok) {
          // A loose file that is not there is not a problem: the screens
          // fall back to the lettering the client came with.
          if (!LOOSE.includes(name)) trouble.push(`${name}: ${got.status}`);
          continue;
        }
        const blob = await got.blob();
        // Vite answers a path it will not serve with a page, not a pack.
        if (blob.type.startsWith('text/')) {
          trouble.push(`${name}: served as ${blob.type}, not a file`);
          continue;
        }
        files.push(new File([blob], name));
      }
      if (!files.length) {
        setNote(
          `Nothing to mount from ${DIR}.\n${trouble.join('\n')}\n\n` +
            'That directory must have been $UBIQUITOUS_PACK_DIR when vite started, and must ' +
            'hold either the packs (res.bin, tables.bin) or the build itself — for a ' +
            'build, pass ?app=<its file name> as well.',
        );
        return;
      }
      try {
        await provider.useSource(provider.offer(files).id);
      } catch (err) {
        setNote(
          `${files.map(f => `${f.name} (${(f.size / 1e6).toFixed(0)} MB)`).join(', ')} ` +
            `would not mount: ${String(err)}`,
        );
        return;
      }

      setNote('Parsing the interface…');
      const skin = await provider.load(uiSkinId('IGM'));
      setUiWords(await provider.load(uiStringsId()).catch(() => []));
      // The typefaces the screens were drawn with, read out of the build
      // the same way the client reads them during play.
      void provider
        .load(uiFacesId())
        .then(registerFaces)
        .catch(() => false);

      // Nobody answers a screen's request for art here, so answer it for
      // every dialog the spec names before anything asks.
      const art = new Map<string, UiSkinArt>();
      const wanted = new Set(
        Object.values(SCREEN_MEANINGS)
          .filter(screen => (screen.movie ?? 'IGM') === 'IGM')
          .map(screen => screen.dialog),
      );
      if (ALL_SHEETS) {
        for (const name of pieceNames(skin)) wanted.add(name);
      }
      for (const dialog of wanted) {
        const plan = planPiece(skin, dialog, { includeParked: true });
        for (const needed of plan ? planArt(plan) : []) {
          if (art.has(needed)) continue;
          // Named with the movie: sheet names repeat between the movies,
          // and a name resolved without one comes back as whichever the
          // index happened to hold — or, for a sheet kept inside the
          // movie rather than beside it, as nothing at all.
          const bitmap = await provider.load(uiIconId(needed, 'IGM')).catch(() => null);
          if (bitmap) art.set(needed, bitmap);
        }
      }
      setMovie({ skin, art });

      // Pictures a screen draws for itself, at points the movie only
      // marks. Nobody answers for them here, so the bench answers.
      const askedEmblems = new Set<string>();
      const answerEmblems = async (): Promise<void> => {
        const fresh = wantedEmblems.value.filter(name => !askedEmblems.has(name));
        if (!fresh.length) return;
        for (const name of fresh) askedEmblems.add(name);
        const found = new Map<string, ImageBitmap>();
        for (const name of fresh) {
          const art = await provider.load(uiIconId(name)).catch(() => null);
          if (art) found.set(name, art.image);
        }
        if (found.size) setEmblems(found);
      };
      effect(() => {
        void wantedEmblems.value;
        void answerEmblems();
      });
      // The movie itself, for a camera that wants to ask about the art
      // rather than measure a photograph with a ruler. Dev only.
      (globalThis as Record<string, unknown>).__skin = skin;
      // Which pieces of art the movie handed over, for a camera asking
      // why a screen came out with a hole in it.
      (globalThis as Record<string, unknown>).__art = () => [...art.keys()];
      (globalThis as Record<string, unknown>).__wanted = () => [...wanted];
      // The interface's own words, by number, so a spec can be checked
      // against what the mounted build actually says.
      (globalThis as Record<string, unknown>).__words = uiWords.value;
      // What a screen is made of, the same way.
      // Which screens this page is showing, so an audit can ask each of
      // them what its own fields were authored with.
      (globalThis as Record<string, unknown>).__drawn = [...wanted];
      // Change the size of the bench's own bag while it is open, for a
      // camera watching what a screen does when the store grows under
      // it — which is what buying more room does.
      (globalThis as Record<string, unknown>).__setRoom = (slots: number): void => {
        inventory.value = { ...inventory.value, bagSlotCount: slots };
      };
      // What a screen is actually drawn from: one line per piece of art,
      // with the fill it uses and whether that fill found its sheet. A
      // screen that comes out half-empty says nothing in a photograph.
      (globalThis as Record<string, unknown>).__plan = (dialog: string) => {
        const plan = planPiece(skin, dialog, { includeParked: true });
        return (plan?.ops ?? []).map(op => ({
          path: op.path,
          fill: op.fill.kind,
          art: op.fill.kind === 'bitmap' ? op.fill.art : null,
          found: op.fill.kind === 'bitmap' ? art.has(op.fill.art ?? '') : true,
          d: op.fill.kind === 'bitmap' ? op.fill.matrix.d : null,
          repeating: op.fill.kind === 'bitmap' ? op.fill.repeating : null,
        }));
      };
      // The same, but only what the screen actually draws: a part the
      // movie parks is in the list above and not in this one.
      (globalThis as Record<string, unknown>).__drawnParts = (dialog: string) =>
        (planPiece(skin, dialog)?.parts ?? []).map(part => part.path);
      (globalThis as Record<string, unknown>).__parts = (dialog: string) =>
        (planPiece(skin, dialog, { includeParked: true })?.parts ?? []).map(part => ({
          path: part.path,
          x: Math.round(part.box.x),
          y: Math.round(part.box.y),
          w: Math.round(part.box.w),
          h: Math.round(part.box.h),
          ...(part.text ? { says: part.text.words, size: part.text.sizePx } : {}),
          ...(part.mask ? { mask: true } : {}),
          ...(part.draws ? {} : { flat: true }),
        }));
      if (SHEET === 'all') showSheets(art);
      else if (SHEET) showSheet(art.get(SHEET));

      if (ENTRY) {
        const row = SHELF[ITEM] ?? SHELF[0];
        if (row) row.itemEntry = ENTRY;
      }
      // What the item is comes out of the build, the way the client reads it.
      for (const row of SHELF) {
        const facts = await provider.load(itemFactsId(row.itemEntry)).catch(() => null);
        if (!facts) continue;
        row.facts = facts;
        const name = await provider.load(itemNameId(row.itemEntry)).catch(() => null);
        if (name) row.name = name;
        if (facts.descriptionId) {
          const said = await provider.load(itemTextId(facts.descriptionId)).catch(() => null);
          if (said) row.description = said;
        }
        // What the spells it carries do. The client reads these separately
        // and so does the bench, or the bench would show a card play
        // does not.
        for (const spellId of facts.spells) {
          const does = await provider.load(spellTextId(spellId)).catch(() => null);
          if (does) setSpellText(spellId, does);
        }
      }

      // A game behind the bench, as far as moving a thing about goes: the
      // store answers a move the way the server answers one, so a drag
      // that resolves to the wrong slot shows up as a thing in the wrong
      // place rather than as nothing happening at all.
      setInventoryActions({
        move: (from, to) => {
          const held = inventory.value.items;
          const moving = held.find(
            item => item.slot?.area === from.area && item.slot.index === from.index,
          );
          if (!moving) return;
          // A drop onto an occupied slot exchanges the two, which is what
          // the bag's drag asks for and what the server answers.
          const sitting = held.find(
            item => item.slot?.area === to.area && item.slot.index === to.index,
          );
          inventory.value = {
            ...inventory.value,
            items: held.map(item =>
              item === moving
                ? { ...item, slot: to }
                : item === sitting
                  ? { ...item, slot: from }
                  : item,
            ),
          };
        },
        equip: () => {},
        unequip: () => {},
        use: () => {},
        destroy: () => {},
        sell: () => {},
        sort: () => {},
        upgrade: () => {},
      });

      player.value = { id: 'me', name: 'Bench', level: 40 } as (typeof player)['value'];
      heroClass.value = 1;
      money.value = 4_998_000;
      inventory.value = { bagSlotCount: 16, bankSlotCount: 0, items: [] };

      // What each thing in the bench's own shelf is called, what its row
      // says and what it looks like — read the way the client reads them,
      // so a slot shows a picture rather than a placeholder.
      for (const row of SHELF) {
        if (row.facts) setItemFacts(row.itemEntry, row.facts);
        setItemName(row.itemEntry, row.name);
        const picture = await provider.load(itemIconId(row.itemEntry)).catch(() => null);
        if (picture) setItemIcon(row.itemEntry, picture);
      }

      // A strongbox with something in both halves, and more of it than
      // one page holds: a run that fits its store proves nothing about
      // turning a page.
      if (
        SCREEN === 'storage' ||
        SCREEN === 'trade' ||
        SCREEN === 'mailWrite' ||
        SCREEN === 'bag' ||
        SCREEN === 'itemList'
      ) {
        // A trade has one side to fill, so everything goes in the bag;
        // a strongbox has two, so it is split between them.
        const split = SCREEN === 'storage';
        const held = Array.from({ length: STORED }, (_, at) => {
          const row = SHELF[at % SHELF.length]!;
          return {
            id: `held${at}`,
            slot: {
              area: split && at % 2 === 0 ? 'bank' : 'bag',
              index: split ? Math.floor(at / 2) : at,
            },
            // One thing with no picture in the build, because a
            // bench where everything has a picture hides every fault in
            // the path that draws a thing by name instead — which is the
            // path the thing under the pointer takes while it is dragged.
            entry: at === 1 ? 999_999 : row.itemEntry,
            count: row.itemCount,
          };
        }) as unknown as (typeof inventory)['value']['items'];
        inventory.value = { bagSlotCount: 24, bankSlotCount: 30, items: held };
      }

      // Something already worn where the card's own thing would go, so the
      // comparison has a second side, read the same way play reads it.
      const wornFacts = await provider.load(itemFactsId(WORN)).catch(() => null);
      // Worn where the card's own thing would go, whatever this one is:
      // the bench is choosing a second side, not dressing a character.
      const shown = (SHELF[ITEM] ?? SHELF[0])?.facts?.inventoryType ?? 0;
      // Every home the thing has, not just the first: something worn in
      // two places — a ring, a hand — stands two cards, and one of them
      // landing behind the other is exactly the fault worth seeing.
      // A character sheet with nothing on it says nothing about where
      // the places on the body are, so the bench dresses one.
      if (SCREEN === 'character') {
        // Worn in the places the things themselves belong in, so what the
        // sheet offers to do with one is what play would offer. A
        // bench wearing a bale of cloth on its head can be pressed all
        // day and never show the control that takes a thing off.
        const worn = SHELF.flatMap((row, at) => {
          const home = equipmentHomesFor(row.facts?.inventoryType ?? 0)[0];
          return home === undefined
            ? []
            : [
                {
                  id: `worn${at}`,
                  slot: { area: 'equipment', index: home },
                  entry: row.itemEntry,
                  count: 1,
                },
              ];
        });
        inventory.value = {
          bagSlotCount: 16,
          bankSlotCount: 0,
          items: [
            ...worn,
            ...SHELF.map((row, at) => ({
              id: `bagged${at}`,
              slot: { area: 'bag', index: at },
              entry: row.itemEntry,
              count: row.itemCount,
            })),
          ] as unknown as (typeof inventory)['value']['items'],
        };
      }

      const homes = ['storage', 'trade', 'mailWrite', 'bag', 'character', 'itemList'].includes(
        SCREEN,
      )
        ? []
        : equipmentHomesFor(shown);
      if (wornFacts && homes.length) {
        setItemFacts(WORN, wornFacts);
        const wornName = await provider.load(itemNameId(WORN)).catch(() => null);
        if (wornName) setItemName(WORN, wornName);
        if (wornFacts.descriptionId) {
          const said = await provider.load(itemTextId(wornFacts.descriptionId)).catch(() => null);
          if (said) setItemText(wornFacts.descriptionId, said);
        }
        inventory.value = {
          ...inventory.value,
          items: homes.map(
            (index, at) =>
              ({
                id: `worn${at}`,
                slot: { area: 'equipment', index },
                entry: WORN,
              }) as (typeof inventory)['value']['items'][number],
          ),
        };
      }

      setNote('');
      // The comparison stands only while the control is held, so a bench
      // asked for one holds it: pressing it for real is the only way to
      // see what a press actually does.
      if (SEARCHED) {
        setTimeout(() => {
          document
            .querySelector('[aria-label="search"]')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }, 50);
      }
      if (SCROLLED) {
        setTimeout(() => {
          const list = document.querySelector('[aria-label="Auction house"]');
          const on = list?.getBoundingClientRect();
          for (let turn = 0; turn < SCROLLED; turn += 1) {
            list?.dispatchEvent(
              new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                deltaY: 120,
                clientX: (on?.left ?? 0) + (on?.width ?? 0) / 2,
                clientY: (on?.top ?? 0) + (on?.height ?? 0) * 0.6,
              }),
            );
          }
        }, 150);
      }
      if (COMPARE) {
        setTimeout(() => {
          document
            .querySelector('[aria-label="Compare with what is worn"]')
            ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        }, 50);
      }
      // The whole HUD, reached the way play reaches it: a store the
      // session would have set, and a container deciding what answers.
      // A body with coin on it and more rows than the screen has room for,
      // one of them held for somebody else, shown through the container
      // play uses so the choice between the two windows is the one play makes.
      if (SCREEN === 'loot') {
        await cutUiSprites(
          movie => provider.load(uiSkinId(movie)),
          (sheet, movie) => provider.load(uiIconId(sheet, movie)),
          cutToBlobUrl,
        ).then(setUiSprites);
        lootWindow.value = {
          networkId: 1,
          money: Number(params.get('money') ?? 12_345),
          items: Array.from(
            { length: Number(params.get('rows') ?? 7) },
            (_, at) => SHELF[at % SHELF.length]!,
          ).map((row, slot) => ({
            slot,
            itemId: `loot${slot}`,
            entry: row.itemEntry,
            namePrefixId: 0,
            nameTextId: 0,
            prefixTextId: 0,
            itemClass: 0,
            subClass: 0,
            quality: row.facts?.quality ?? 1,
            count: row.itemCount,
            displayInfoId: 0,
          })),
        };
      }
      if (SCREEN === 'hud') {
        mountUiTextures();
        if (CHATTING) {
          // What a session would have put here, said on a few channels so
          // each one's colour is on screen — and one box standing over a
          // head, which play places each frame and this places once.
          noteChat({ channel: 'say', sender: 'Bench', text: 'Well met.', mine: true }, 1);
          noteChat({ channel: 'general', sender: 'Someone', text: 'Anyone for the caves?' });
          noteChat({ channel: 'trade', sender: 'A trader', text: 'Selling a fine blade.' });
          noteChat({ channel: 'party', sender: 'A friend', text: 'On my way.' });
          chatOpen.value = !params.has('shut');
          chatAsking.value = params.has('typing');
          if (params.has('channels')) {
            setTimeout(() => {
              document
                .querySelector<HTMLElement>(
                  params.has('emotes') ? '[aria-label="Expression"]' : '[aria-label="Speak"]',
                )
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }, 300);
          }
          for (const one of chatSaid.value) {
            one.x = window.innerWidth / 2;
            one.y = window.innerHeight / 2;
            one.onScreen = true;
          }
        }
        if (FACE) {
          const stand = document.createElement('canvas');
          stand.width = stand.height = 64;
          const pen = stand.getContext('2d');
          if (pen) {
            pen.fillStyle = 'rgb(120 150 190)';
            pen.fillRect(0, 0, 64, 64);
            pen.fillStyle = 'rgb(230 200 170)';
            pen.beginPath();
            pen.arc(32, 30, 18, 0, Math.PI * 2);
            pen.fill();
          }
          const face = stand.toDataURL();
          setHeadshotSource(() => face);
        }
        if (FIGHTING) inCombat.value = true;
        // The minimap's ring with a thing of each kind near it: a quest
        // place inside the disc and another far off to the north-east.
        setMapState({
          zoneName: 'Bench',
          bounds: null,
          playerPosition: [100, 0, 100],
          playerYaw: 0.6,
          markers: [
            { id: 'near', label: 'Near', position: [112, 0, 96], kind: 'quest' },
            { id: 'far', label: 'Far', position: [400, 0, -300], kind: 'quest' },
            { id: 'shop', label: 'Shop', position: [90, 0, 112], kind: 'service' },
          ],
        });
        if (params.has('map')) await seedMapBench(provider, params);
        await seedSpellBar(params);
        setPlayer({
          id: 'hero',
          name: 'Bench',
          level: 40,
          health: 4200,
          maxHealth: 5000,
          mana: 1800,
          maxMana: 2400,
          dead: params.has('dead'),
          disposition: 'friendly',
        } as Parameters<typeof setPlayer>[0]);
        // A rung of the ladder that applies at the bag's own size, so
        // the offer to make it bigger is on screen to be looked at.
        // A tree of the shape the page draws: four rows of three, with
        // two places missing and the rest linked one to the next. The
        // picture each place wears is named on the query string — the
        // build's own, which this file does not carry.
        if (TREE) {
          const places = [
            [1, 1, 0, 0, 3],
            [1, 2, 0, 0, 5],
            [2, 1, 5, 1, 1],
            [2, 3, 5, 0, 3],
            [3, 1, 10, 3, 5],
            [3, 2, 10, 0, 1],
            [4, 2, 15, 6, 3],
          ].map(([tier, column, requires, after, ranks], at) => ({
            id: at + 1,
            tier,
            column,
            classId: FIRST_TREE,
            requires,
            after,
            ranks,
            spells: [],
            icon: ICON,
            says: 0,
          }));
          // The riding page's own little tree: four rows of two, each
          // second place following the first beside it.
          const riding = [1, 2, 3, 4].flatMap(tier => [
            { tier, column: 1, after: 0, ranks: 1, spell: 900 + tier * 2 },
            { tier, column: 2, after: tier * 2 - 1, ranks: 3, spell: 901 + tier * 2 },
          ]);
          setTalentPlaces([
            ...places,
            ...riding.map((place, at) => ({
              id: at + 1,
              tier: place.tier,
              column: place.column,
              classId: RIDING_TREE,
              requires: 0,
              after: place.after,
              ranks: place.ranks,
              spells: [place.spell],
              icon: '',
              says: 0,
            })),
          ] as Parameters<typeof setTalentPlaces>[0]);
          // A second tree with one place on it, so the page has two tabs
          // to switch between.
          setTalentPlaces([
            ...(talentPlaces.value as Parameters<typeof setTalentPlaces>[0]),
            {
              id: 99,
              tier: 1,
              column: 2,
              classId: FIRST_TREE + 1,
              requires: 0,
              after: 0,
              ranks: 5,
              spells: [],
              icon: ICON,
              says: 0,
            },
          ] as Parameters<typeof setTalentPlaces>[0]);
          setClassTrees(new Map([[1, [FIRST_TREE, FIRST_TREE + 1]]]));
          // A riding skill wears the picture of the spell it teaches, so
          // the bench gives every one of them the picture it was pointed
          // at on the query string.
          if (ICON) {
            void provider
              .load(uiIconId(ICON))
              .then(art => {
                if (art) for (const place of riding) setSpellIcon(place.spell, art.image);
              })
              .catch(() => undefined);
          }
        }
        setStorageUpgrades([
          { storage: 0, slots: ROOM + 6, currency: 0, price: 1_250_000, item: 0, requires: ROOM },
        ] as Parameters<typeof setStorageUpgrades>[0]);
        if (SHOWING === 'bag' || SHOWING === 'character') {
          openCharacterWindow(SHOWING as 'bag' | 'character');
          // Worn in the places the things themselves belong in: a bench
          // wearing a bale of cloth on its head can be pressed all day
          // and never show the control that takes a thing off.
          const worn =
            SHOWING === 'character'
              ? SHELF.flatMap((row, at) => {
                  const home = equipmentHomesFor(row.facts?.inventoryType ?? 0)[0];
                  return home === undefined
                    ? []
                    : [
                        {
                          id: `worn${at}`,
                          slot: { area: 'equipment', index: home },
                          entry: row.itemEntry,
                          count: 1,
                        },
                      ];
                })
              : [];
          const held = [
            ...worn,
            ...Array.from({ length: STORED }, (_, at) => ({
              id: `held${at}`,
              slot: { area: 'bag', index: at },
              entry: SHELF[at % SHELF.length]!.itemEntry,
              count: SHELF[at % SHELF.length]!.itemCount,
            })),
          ] as unknown as (typeof inventory)['value']['items'];
          inventory.value = { bagSlotCount: ROOM, bankSlotCount: 0, items: held };
        }
        if (SHOWING === 'storage') {
          // Opened the way play opens one: the box says it is open
          // first and says how big it is, and what is in it, a message
          // later. A bench that stages both at once cannot show a
          // strongbox drawn before its size arrived.
          bankOpen.value = true;
          const held = Array.from({ length: STORED }, (_, at) => ({
            id: `held${at}`,
            slot: { area: at % 2 === 0 ? 'bank' : 'bag', index: Math.floor(at / 2) },
            entry: SHELF[at % SHELF.length]!.itemEntry,
            count: SHELF[at % SHELF.length]!.itemCount,
          })) as unknown as (typeof inventory)['value']['items'];
          inventory.value = { bagSlotCount: 24, bankSlotCount: 0, items: held };
          setTimeout(() => setStorageCapacity('bank', 30), 80);
        }
        // A log with a quest of each kind in it: one waiting to be handed
        // back, and one still under way.
        const SHELVED_QUESTS = [
          {
            id: 1,
            name: 'A Matter of Wolves',
            status: 'finished' as const,
            readyToHandIn: true,
            slot: 0,
            objective: 'Wolves thinned',
            progress: '8/8',
            rewardMoney: 4_560,
            rewards: [{ entry: SHELF[0]!.itemEntry, nameTextId: 0, quality: 2, count: 1 }],
          },
          {
            id: 2,
            name: 'Errand to the Mill',
            status: 'active' as const,
            slot: 1,
            objective: 'Sacks carried',
            progress: '1/6',
            rewardMoney: 120,
            rewards: [],
          },
        ] as unknown as Parameters<typeof setQuestLog>[0];

        if (SHOWING === 'quests') {
          openCharacterWindow('quests');
          setQuestLog(SHELVED_QUESTS);
        }
        if (SHOWING === 'questTalk') {
          setQuestLog(SHELVED_QUESTS);
          showQuestConversation({
            kind: 'quest',
            giverId: 7,
            quest: SHELVED_QUESTS[0]!,
            action: 'handIn',
          });
        }
        if (SHOWING === 'questAsk') {
          showQuestConversation({
            kind: 'choices',
            giverId: 7,
            choices: [
              { id: 1, name: 'A Matter of Wolves', status: 'finished' },
              { id: 2, name: 'Errand to the Mill', status: 'available' },
            ],
          });
        }
        if (SHOWING === 'spells') {
          openCharacterWindow('spells');
          const spells = Array.from({ length: SPELLS }, (_, at) => 101 + at);
          initSpells(spells, []);
          const named = ['Cleave', 'Shield Wall', 'Charge', 'Rend', 'Battle Shout'];
          spells.forEach((id, at) => setSpellName(id, `${named[at % named.length]!} ${at + 1}`));
          spellRanks.value = new Map(spells.map((id, at) => [id, at + 1]));
        }
        if (SHOWING === 'social') {
          openCharacterWindow('social');
          setGuildRoster({
            guildId: 'g1',
            guildName: 'The Bench',
            members: [
              { networkId: 1, name: 'Alder', isLeader: true },
              { networkId: 2, name: 'Bramble', isLeader: false },
              { networkId: 3, name: 'Cinder', isLeader: false },
            ],
          } as Parameters<typeof setGuildRoster>[0]);
        }
        if (SHOWING === 'team') {
          openCharacterWindow('team');
          setPartyRoster({
            partyId: 'p1',
            members: [
              { networkId: 1, name: 'Bench', isLeader: true },
              { networkId: 2, name: 'Bramble', isLeader: false },
            ],
          } as Parameters<typeof setPartyRoster>[0]);
        }
        if (SHOWING === 'shop' || SHOWING === 'sell') {
          showShop({
            vendorName: 'Bench Trader',
            currency: 'copper',
            balance: 1_234_056,
            items: SHELF.slice(0, 8).map((row, at) => ({
              id: row.itemEntry,
              slot: at,
              name: row.name,
              price: [45, 1200, 30_000, 7][at % 4]!,
              stock: null,
            })),
            onBuy: () => undefined,
            onSell: () => undefined,
            onSellItem: () => undefined,
          });
          // Something to sell: the second page is the bag, and an empty
          // bag proves nothing about a run of slots.
          inventory.value = {
            bagSlotCount: 24,
            bankSlotCount: 0,
            items: Array.from({ length: 5 }, (_, at) => ({
              id: `held${at}`,
              slot: { area: 'bag', index: at },
              entry: SHELF[at % SHELF.length]!.itemEntry,
              count: SHELF[at % SHELF.length]!.itemCount,
            })) as unknown as (typeof inventory)['value']['items'],
          };
        }
        if (SHOWING === 'options') openCharacterWindow('options');
        if (SHOWING === 'npcChat') {
          showGossip({
            title: 'Bench Elder',
            text: 'The road north is closed. Bandits, they say, though nobody has seen one.',
            choices: [],
            onBack: () => undefined,
          });
        }
        if (SHOWING === 'npcMenu') {
          showGossip({
            title: 'Bench Elder',
            text: '',
            choices: [
              { label: 'What news?', onPick: () => undefined },
              { label: 'I am looking for work.', onPick: () => undefined },
            ],
            onBack: () => undefined,
          });
        }
        if (SHOWING === 'mail') {
          setMailOpened(true);
          const inbox = Array.from({ length: LETTERS }, (_, at) => ({
            id: `letter${at}`,
            senderName: 'Someone',
            subject: `Whatever it is about, number ${at + 1}`,
            gold: 0,
            sentAt: 0,
            read: false,
            goldClaimed: false,
            itemCount: 0,
            itemsClaimed: false,
          }));
          setMailInbox(inbox);
          if (inbox[OPENED]) setMailMessage({ ...inbox[OPENED], body: 'Words.', items: [] });
        }
        if (SHOWING === 'trade') {
          applyTradeStarted(2);
          applyTradeUpdated({
            opponentId: 2,
            opponentItems: [],
            opponentGold: 4_500,
            opponentConfirmed: false,
            yourConfirmed: false,
          });
        }
      }

      document.body.setAttribute('data-ready', 'yes');
    })();
  }, []);

  if (note) {
    return <p className="p-4 font-mono text-parchment-100">{note}</p>;
  }
  if (SCREEN === 'card') {
    return (
      <ArtItemCard
        listing={SHELF[ITEM] ?? SHELF[0]}
        anchor={{ x: 120, y: 160 }}
        canCompare
        actions={[
          { key: 'buy', onPick: () => undefined },
          { key: 'bid', onPick: () => undefined },
        ]}
        onClose={() => undefined}
      />
    );
  }
  if (SCREEN === 'hud') return <GameHud />;
  if (SCREEN === 'storage') return <ArtStorageWindow onClose={() => undefined} />;
  if (SCREEN === 'menu') {
    return (
      <ArtMenuBar
        activeId={(params.get('on') ?? 'bag') as never}
        onPick={() => undefined}
        onDismiss={() => undefined}
      />
    );
  }
  if (SCREEN === 'trade') {
    const bag = inventory.value.items.filter(item => item.slot?.area === 'bag');
    return (
      <ArtTradeWindow
        mine={{ itemIds: bag.slice(0, 3).map(item => item.id), gold: 123_400 }}
        theirs={{
          items: SHELF.slice(0, 2).map((row, at) => ({
            id: `theirs${at}`,
            entry: row.itemEntry,
            count: row.itemCount,
          })),
          gold: 4_500,
        }}
        peerName="Someone Else"
        iConfirmed={CONFIRMED}
        theyConfirmed={false}
        notice={null}
        onOffer={() => undefined}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />
    );
  }
  if (SCREEN === 'mail') {
    const inbox = Array.from({ length: LETTERS }, (_, at) => ({
      id: `letter${at}`,
      senderName: ['Someone', 'Someone Else', 'Bench'][at % 3]!,
      subject: `Whatever it is about, number ${at + 1}`,
      gold: at % 3 === 0 ? 12_345 : 0,
      sentAt: Math.floor(Date.now() / 1000) - at * 3_600,
      read: at % 2 === 0,
      goldClaimed: false,
      itemCount: at % 3 === 0 ? 1 : 0,
      itemsClaimed: false,
    }));
    const open = inbox[OPENED];
    return (
      <WornStage>
        <ArtMailWindow
          inbox={inbox}
          message={
            open
              ? {
                  ...open,
                  body: 'A letter long enough to need more than one line, so the room the screen gave it can be seen to be used. It goes on a little further than that, and then stops.',
                  items: [],
                }
              : null
          }
          notice={null}
          onSelect={() => undefined}
          onClaim={() => undefined}
          onDelete={() => undefined}
          onWrite={() => undefined}
          onCloseLetter={() => undefined}
          onClose={() => undefined}
        />
      </WornStage>
    );
  }
  if (SCREEN === 'mailWrite') return <WritingBench />;
  if (SCREEN === 'bag') return <ArtBagWindow onClose={() => undefined} />;
  if (SCREEN === 'character') return <ArtCharacterWindow onClose={() => undefined} />;
  if (SCREEN === 'loot') {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <LootWindowContainer />
      </div>
    );
  }
  if (SCREEN === 'itemList') {
    const bag = inventory.value.items.filter(item => item.slot?.area === 'bag');
    return (
      <ArtItemListWindow
        choices={bag}
        beside={{ x: 200, y: 120 }}
        onPick={() => undefined}
        onClose={() => undefined}
      />
    );
  }
  return <ArtAuctionWindow {...NOTHING} onClose={() => undefined} />;
}

/**
 * A letter being written, with as much on it as the switches ask for.
 *
 * `?money=` in copper, `?carrying=` how many things ride with it, and
 * `?to=` whether it is addressed to anybody — a letter addressed to
 * nobody is the state the send control cannot be pressed in.
 */
function WritingBench(): JSX.Element {
  const bag = inventory.value.items.filter(item => item.slot?.area === 'bag');
  const [draft, setDraft] = useState<MailDraft>(() => ({
    to: params.get('to') === '0' ? '' : 'Someone',
    subject: 'About the thing',
    body: 'A letter long enough to need more than one line, so the room the screen gave it can be seen to be used.',
    money: Number(params.get('money') ?? 0),
    itemIds: [],
  }));
  // The bag arrives after the first draw, so what the switch asks the
  // letter to carry is worked out against whatever has arrived.
  const [picked, setPicked] = useState<readonly string[] | null>(null);
  const carrying = picked ?? bag.slice(0, Number(params.get('carrying') ?? 0)).map(item => item.id);
  return (
    <WornStage>
      <ArtMailWriteWindow
        draft={{ ...draft, itemIds: carrying }}
        bag={bag}
        onEdit={change => setDraft(was => ({ ...was, ...change }))}
        onCarry={id =>
          setPicked(carrying.includes(id) ? carrying.filter(one => one !== id) : [...carrying, id])
        }
        onEmpty={() => setPicked([])}
        onSend={() => undefined}
        onClose={() => undefined}
      />
    </WornStage>
  );
}

render(
  <div
    className="h-full"
    style={{
      // A board, not a colour: a card drawn on black looks solid however
      // see-through it is, which is a bench that lies about the art.
      backgroundColor: '#8a7f6a',
      backgroundImage: 'repeating-conic-gradient(#b9ad94 0% 25%, #6f6650 0% 50%)',
      backgroundSize: '32px 32px',
    }}
  >
    <Bench />
    <p className="fixed right-0 bottom-0 text-micro text-parchment-100/50">
      {`${SCREEN} · dialogs asked for: ${wantedDialogs.value.join(', ') || 'none'}`}
    </p>
  </div>,
  document.getElementById('worn')!,
);
