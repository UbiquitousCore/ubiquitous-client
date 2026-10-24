/**
 * Every worn screen on one page, drawn from a build sitting on disk.
 *
 *     UBIQUITOUS_PACK_DIR=<packs> npm run dev
 *     open .../dev/screen-gallery.html?dir=<packs>
 *
 * Each screen the table maps is drawn out of the player's own movie with
 * sample data, once per tab, under a label saying which screen and which
 * tab it is; `?only=<screen>,<screen>` draws just those. Above them, every screen a consumer knows by name, and for
 * the ones not drawn, the reason they fall back. One pass down the page
 * checks the lot. `?ready` is put on the page once it is all drawn, which
 * is what `dev/shoot.mjs --page=/dev/screen-gallery.html` waits for.
 *
 * The sample data is ours. What an item is called and what it looks like
 * is read from the build, the way play reads it. Dev only; nothing ships.
 */

import { render } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import {
  itemFactsId,
  itemIconId,
  itemNameId,
  talentsId,
  uiFacesId,
  uiIconId,
  uiSkinId,
  uiStringsId,
} from '../src/assets/ids';
import type { UiMovie } from '../src/assets/ids';
import type { UiSkinArt, UiSkinData } from '../src/assets/types';
import { planArt, planPiece } from '../src/ui/art/piecePlan';
import { effect } from '@preact/signals';
import { setEmblems, setMovie, setUiWords, wantedEmblems } from '../src/ui/art/pieceStore';
import { screenFallback, screenSpec } from '../src/ui/art/uiSpec';
import { SCREEN_MEANINGS } from '../src/ui/art/screenMeanings';
import { registerFaces } from '../src/core/lettering';
import { cutToBlobUrl, cutUiSprites, setUiSprites } from '../src/ui/art/uiSprites';
import { ArtAskBox } from '../src/ui/components/ArtAskBox';
import { ArtAuctionWindow } from '../src/ui/components/ArtAuctionWindow';
import { ArtNpcChatWindow } from '../src/ui/components/ArtNpcChatWindow';
import { ArtQuestAskWindow } from '../src/ui/components/ArtQuestAskWindow';
import { ArtQuestWindow } from '../src/ui/components/ArtQuestWindow';
import { WornStage } from '../src/ui/art/WornStage';
import { ArtBagWindow } from '../src/ui/components/ArtBagWindow';
import { ArtLootWindow } from '../src/ui/components/ArtLootWindow';
import { ArtSummonWindow } from '../src/ui/components/ArtSummonWindow';
import { ArtMailWindow } from '../src/ui/components/ArtMailWindow';
import { ArtShopWindow } from '../src/ui/components/ArtShopWindow';
import { ArtSellWindow } from '../src/ui/components/ArtSellWindow';
import { ArtStorageWindow } from '../src/ui/components/ArtStorageWindow';
import { ArtSplitWindow } from '../src/ui/components/ArtSplitWindow';
import { ArtTradeWindow } from '../src/ui/components/ArtTradeWindow';
import { money, player } from '../src/ui/hudStore';
import {
  inventory,
  setInventoryActions,
  setItemFacts,
  setItemIcon,
  setItemName,
  setSpellText,
  setStorageUpgrades,
} from '../src/ui/inventoryStore';
import { AuraRow } from '../src/ui/components/AuraRow';
import { AuraCard } from '../src/ui/components/AuraCard';
import { aurasFor, clearAuras, setAura, toggleAuraCard } from '../src/ui/auraStore';
import type { AuctionListingView } from '../src/ui/auctionStore';
import { ArtSignIn } from '../src/ui/frontend/ArtSignIn';
import { ArtAbout } from '../src/ui/frontend/ArtAbout';
import { ArtChooseCharacter } from '../src/ui/frontend/ArtChooseCharacter';
import { ArtConfirmDelete } from '../src/ui/frontend/ArtConfirmDelete';
import { ArtConnecting } from '../src/ui/frontend/ArtConnecting';
import { ArtNotice } from '../src/ui/frontend/ArtNotice';
import { setCharacters } from '../src/ui/frontend/frontEndStore';
import { ArtMailWriteWindow } from '../src/ui/components/ArtMailWriteWindow';
import { ArtPlayerLinkMenu } from '../src/ui/components/ArtPlayerLinkMenu';
import { ArtRowMenu } from '../src/ui/components/ArtRowMenu';
import type { CharacterSummary, QuestRecord } from '../src/net/GameConnection';
import { ArtMenuBar } from '../src/ui/components/ArtMenuBar';
import { ArtTopbarMenu } from '../src/ui/components/ArtTopbarMenu';
import { ArtPlayerFrame } from '../src/ui/components/ArtPlayerFrame';
import { ArtFocusPanel } from '../src/ui/components/ArtFocusPanel';
import { ArtCastBar } from '../src/ui/components/ArtCastBar';
import { ArtTeamFrames } from '../src/ui/components/ArtTeamFrames';
import { ArtChatBar } from '../src/ui/components/ArtChatBar';
import { ArtChatPeek } from '../src/ui/components/ArtChatPeek';
import { ArtChatSaid, useSaidArt } from '../src/ui/components/ArtChatSaid';
import { chatLines, chatOpen, chatPeekUntil } from '../src/ui/chatStore';
import type { Unit } from '../src/ui/hudStore';
import {
  CLASS_IDS,
  TOPBAR_ICON_NAMES,
  setClassIcon,
  setTopbarIcon,
} from '../src/ui/topbarIconStore';
import { ArtCharacterWindow } from '../src/ui/components/ArtCharacterWindow';
import { ArtItemCard, HELD_CARD, cardFor } from '../src/ui/components/ArtItemCard';
import { ArtItemListWindow } from '../src/ui/components/ArtItemListWindow';
import { ArtTalentCard } from '../src/ui/components/ArtTalentCard';
import { ArtSpellCard } from '../src/ui/components/ArtSpellCard';
import { ArtTryOn } from '../src/ui/components/ArtTryOn';
import { KNOWN_SCREENS } from './knownScreens';
import { ArtQuestLogWindow } from '../src/ui/components/ArtQuestLogWindow';
import { ArtSpellsWindow } from '../src/ui/components/ArtSpellsWindow';
import { ArtTalentsWindow } from '../src/ui/components/ArtTalentsWindow';
import { ArtSocialWindow } from '../src/ui/components/ArtSocialWindow';
import { ArtTeamWindow } from '../src/ui/components/ArtTeamWindow';
import { ArtOptionsWindow } from '../src/ui/components/ArtOptionsWindow';
import { setQuestLog, setQuestText } from '../src/ui/questStore';
import {
  classTrees,
  initSpells,
  setClassTrees,
  setMountSpells,
  setSpellIcon,
  setSpellStats,
  setSpellName,
  setTalentPlaces,
  talentPlaces,
} from '../src/gameplay/SpellBook';
import { applyTalentState, talentStaged } from '../src/gameplay/talents';
import type { TalentRow } from '../src/assets/types';
import { heroClass } from '../src/ui/hudStore';
import { setGuildRoster } from '../src/ui/guildStore';
import { setFriendList } from '../src/ui/socialListStore';
import { setPartyRoster } from '../src/ui/partyStore';
import type { ScreenId } from '../src/ui/screenIds';

/** The sample unit's auras, read from the store as the HUD reads them. */
function AuraRowOf(): JSX.Element | null {
  return <AuraRow unitKey={AURA_UNIT} auras={aurasFor(AURA_UNIT)} />;
}

/** A screen drawn once the sample it shows has been put in its store. */
function Seeded({ seed, children }: { seed(): void; children: ComponentChildren }): JSX.Element {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    seed();
    setReady(true);
  }, []);
  return <>{ready ? children : null}</>;
}
import '../src/ui/styles/global.css';

const params = new URLSearchParams(location.search);
const DIR = params.get('dir') ?? '';
/** Only these screens, where given: `?only=chat,menu`. */
const ONLY = (params.get('only') ?? '').split(',').filter(Boolean);
/** Which screen the menu shows as open: `?open=spells`. The bag, where not given. */
const OPEN = (params.get('open') ?? 'bag') as ScreenId;
const PACKS = (params.get('packs') ?? 'res.bin,tables.bin').split(',').filter(Boolean);
const LOOSE = ['Fontin-Regular.ttf'];
/** Whose sheet the gallery shows: `?hero=warrior`, `mage` or `ranger`. A mage by default. */
const HERO_CLASS = { warrior: 1, mage: 2, ranger: 3 }[params.get('hero') ?? ''] ?? 2;

/** Item entries to fill the sample data with; what each is comes from the build. */
const ENTRIES = [5206, 1049, 3] as const;

const now = () => Math.floor(Date.now() / 1000);

/** Sample listings: a stack with a buyout, a single piece, and one of the player's own. */
function listings(): AuctionListingView[] {
  const base = [
    { seller: 'Someone', count: 20, start: 20_000, buy: 25_000, left: 3_600 },
    { seller: 'Someone Else', count: 1, start: 250_000, buy: 300_000, left: 86_400 },
    { seller: 'Gallery', count: 5, start: 500, buy: 0, left: 43_200 },
  ];
  return base.map((row, at) => ({
    id: String(at + 1),
    sellerName: row.seller,
    itemEntry: ENTRIES[at % ENTRIES.length]!,
    itemCount: row.count,
    name: `Sample ${at + 1}`,
    startPrice: row.start,
    listedAt: 0,
    expiresAt: now() + row.left,
    currentBid: row.start,
    ...(row.buy ? { buyoutPrice: row.buy } : {}),
  }));
}

/**
 * Things in the bag and in the strongbox: more than a page of the bag, so
 * turning it shows something, and a few in the box.
 */
function stock(): (typeof inventory)['value']['items'] {
  const held = (area: 'bag' | 'bank', many: number) =>
    Array.from({ length: many }, (_, index) => ({
      id: `${area}${index}`,
      slot: { area, index },
      entry: ENTRIES[index % ENTRIES.length]!,
      count: [20, 1, 5][index % 3]!,
    }));
  return [
    ...held('bag', 14),
    ...held('bank', 8),
  ] as unknown as (typeof inventory)['value']['items'];
}

const nothing = () => undefined;

/** The first place on the first class's first tree, from the build's own tables. */
function firstPlace(): TalentRow | undefined {
  const tree = classTrees.value.get(1)?.[0];
  return talentPlaces.value
    .filter(place => place.classId === tree)
    .sort((a, b) => a.tier - b.tier || a.column - b.column)[0];
}

/** Points to spend, with one staged on the first place and not yet sent. */
function stageOne(): void {
  applyTalentState(5, []);
  const first = firstPlace();
  talentStaged.value = first ? new Map([[first.id, 1]]) : new Map();
}

/**
 * Spells to stand sample auras on: the first places of the build's own
 * talent table, so each has the build's own name and words. Filled once
 * the build is read.
 */
let auraSpells: number[] = [];

/** Whose sample auras these are, as the aura store keys them. */
const AURA_UNIT = 'gallery';

/**
 * A buff, a buff stacked three times, a debuff and a debuff stacked
 * twice, each with some time left, and one that lasts until taken off.
 */
function seedAuras(): void {
  clearAuras();
  const [a = 1, b = 2, c = 3, d = 4] = auraSpells;
  const at = (spellId: number, harmful: boolean, stacks: number, remainingMs: number) =>
    setAura(AURA_UNIT, {
      spellId,
      casterId: 1,
      harmful,
      stacks,
      remainingMs,
      durationMs: remainingMs,
    });
  at(a, false, 1, 754_000);
  at(b, false, 3, 2_700_000);
  at(c, true, 1, 600_000);
  at(d, true, 2, 0);
}

/** The sample auras with the first one's card open beside them. */
function seedAuraCard(): void {
  seedAuras();
  toggleAuraCard({ unitKey: AURA_UNIT, spellId: auraSpells[0] ?? 1, at: { x: 40, y: 60 } });
}

interface Shown {
  screen: string;
  label: string;
  draw(): JSX.Element;
  /**
   * How a screen that is not placed on the movie's screen takes its size:
   * `fill` for one that fills the height it is given, `own` for one that
   * stands at its own size.
   */
  sized?: 'fill' | 'own';
  /** False where the screen shows one of its tabs and the caller picks which. */
  tabs?: false;
  /** What to press once it is up, to show it doing something; several in turn. */
  press?: string | readonly string[];
}

/** A sample quest, ready to hand back, with a reward of each kind. */
const QUEST = {
  id: 1,
  name: 'A sample errand',
  status: 'finished',
  readyToHandIn: true,
  rewardMoney: 4_560,
  rewards: [{ entry: ENTRIES[0], nameTextId: 0, quality: 2, count: 2 }],
  rewardChoices: [
    { entry: ENTRIES[1], nameTextId: 0, quality: 2, count: 1 },
    { entry: ENTRIES[2], nameTextId: 0, quality: 2, count: 1 },
  ],
} as unknown as QuestRecord;

/** Where the gallery keeps a sample quest's own words: not a number any build uses. */
const SAMPLE_WORDS = -1;

/** A character on the sample account. */
function someone(name: string, race: number, level: number): CharacterSummary {
  return {
    guid: `gallery-${name}`,
    name,
    level,
    gender: 0,
    race,
    class: 1,
    displayInfoId: 0,
    appearance: { skin: 1, hairStyle: 1, hairColour: 1, face: 1 },
    mapId: 1,
    position: [0, 0, 0],
    equipment: [],
    xp: 300,
    xpToLevel: 1_000,
  } as CharacterSummary;
}

/** A body in the world, full of health and half out of mana. */
function body(id: string, name: string, kind: Unit['kind'], resource?: Unit['resource']): Unit {
  return {
    id,
    name,
    level: 40,
    health: 3_000,
    maxHealth: 4_000,
    mana: 60,
    maxMana: 100,
    exp: 300,
    expToLevel: 1_000,
    disposition: 'friendly',
    kind,
    ...(resource ? { resource } : {}),
  } as Unit;
}

const TEAM = [
  { networkId: 1, name: 'Gallery', isLeader: false, online: true },
  { networkId: 2, name: 'Someone', isLeader: true, online: true },
  { networkId: 3, name: 'Someone Else', isLeader: false, online: true },
];

/** A box over somebody's head, where the build carries one. */
function Said(): JSX.Element | null {
  const art = useSaidArt();
  if (!art) return null;
  const said = {
    key: 1,
    networkId: 2,
    sender: 'Someone',
    text: 'A sample line, said out loud.',
    channel: 'say',
    mine: false,
    bornAt: 0,
    livesFor: 3500,
    x: 50,
    y: 50,
    onScreen: true,
  };
  return <ArtChatSaid said={said} art={art} />;
}

/**
 * A card for the third thing in the bag, beside the one worn in its place;
 * held up against it where `compare` says so.
 */
function HeldCard({ compare }: { compare: boolean }): JSX.Element | null {
  const box = useRef<HTMLDivElement>(null);
  const item = inventory.value.items.find(one => one.id === 'bag2');
  useEffect(() => {
    if (!compare) return;
    const timer = setInterval(() => {
      const control = box.current?.querySelector('[aria-label="Compare with what is worn"]');
      if (!control) return;
      control.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }),
      );
      clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [compare]);
  if (!item) return null;
  return (
    <div ref={box}>
      <ArtItemCard
        listing={cardFor(item)}
        wears={HELD_CARD}
        actions={[{ key: 'equip', onPick: nothing }]}
        anchor={{ x: 60, y: 40 }}
        canCompare
        onClose={nothing}
      />
    </div>
  );
}

const SHOWN: Shown[] = [
  {
    screen: 'split',
    label: 'How many to take off a stack',
    draw: () => <ArtSplitWindow name="Sample" count={9} onSplit={nothing} onCancel={nothing} />,
  },
  {
    screen: 'playerLink',
    label: 'What can be done with a player',
    draw: () => (
      <ArtPlayerLinkMenu
        beside={{ x: 20, y: 20 }}
        actions={['Whisper', 'Trade', 'Invite'].map(label => ({ label, onPick: nothing }))}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'rowMenu',
    label: 'What can be asked about a row',
    draw: () => (
      <ArtRowMenu beside={{ x: 20, y: 20 }} says="Delete" onPick={nothing} onClose={nothing} />
    ),
  },
  ...(
    [
      ['mailWrite', 'A letter being written, with coin on it', undefined, 12_345],
      [
        'mailWrite',
        'A letter carrying more coin than its field has room for',
        undefined,
        12_345_678,
      ],
      ['mailMoney', 'The coin to send with a letter', '[aria-label="money"]', 12_345],
      [
        'mailBag',
        'The bag to pick from, and what rides with the letter',
        '[aria-label="attach"]',
        12_345,
      ],
    ] as const
  ).map(([screen, label, press, money]) => ({
    screen,
    label,
    ...(press ? { press } : {}),
    draw: () => {
      const bag = inventory.value.items.filter(item => item.slot?.area === 'bag');
      return (
        <WornStage>
          <ArtMailWriteWindow
            draft={{
              to: 'Someone',
              subject: 'About the thing',
              body: 'A sample letter, long enough to run onto a second line.',
              money,
              itemIds: bag.slice(0, 2).map(item => item.id),
            }}
            bag={bag}
            onEdit={nothing}
            onCarry={nothing}
            onEmpty={nothing}
            onSend={nothing}
            onClose={nothing}
          />
        </WornStage>
      );
    },
  })),
  {
    screen: 'menu',
    label: 'The menu beside a screen',
    sized: 'fill',
    draw: () => (
      <div className="flex h-full">
        <ArtMenuBar activeId={OPEN} onPick={nothing} onDismiss={nothing} />
      </div>
    ),
  },
  {
    screen: 'topbarMenu',
    label: 'A player picked, and what can be done with them',
    sized: 'own',
    draw: () => (
      <ArtTopbarMenu
        name="Someone"
        classId={2}
        open
        actions={(['whisper', 'trade', 'follow', 'duel'] as const).map(icon => ({
          icon,
          label: icon,
          onPick: nothing,
        }))}
      />
    ),
  },
  {
    screen: 'playerFrame',
    label: 'The hero’s own frame, a warrior with no experience yet',
    sized: 'own',
    draw: () => <ArtPlayerFrame unit={{ ...body('me', 'Gallery', 'player', 'morale'), exp: 0 }} />,
  },
  {
    screen: 'playerFrame',
    label: 'The hero’s own frame, a mage halfway through a level',
    sized: 'own',
    draw: () => <ArtPlayerFrame unit={{ ...body('me', 'Gallery', 'player', 'mana'), exp: 500 }} />,
  },
  {
    screen: 'targetFrame',
    label: 'The target’s frame, a mage',
    sized: 'own',
    draw: () => (
      <div className="pt-16">
        <ArtFocusPanel unit={body('it', 'Someone', 'player')} actions={[]} />
      </div>
    ),
  },
  {
    screen: 'targetFrame',
    label: 'The target’s frame, a warrior',
    sized: 'own',
    draw: () => (
      <div className="pt-16">
        <ArtFocusPanel unit={body('it', 'Someone', 'player', 'morale')} actions={[]} />
      </div>
    ),
  },
  {
    screen: 'targetFrame',
    label: 'A target part-way through a cast',
    sized: 'own',
    draw: () => (
      <div className="pt-16">
        <ArtFocusPanel unit={body('it', 'Someone', 'player')} actions={[]} cast={0.5} />
      </div>
    ),
  },
  {
    screen: 'targetFrame',
    label: 'A creature’s frame, with the switch beside it',
    sized: 'own',
    draw: () => (
      <div className="pt-16 pl-8">
        <ArtFocusPanel
          unit={{ ...body('beast', 'Something', 'Beast'), disposition: 'hostile' }}
          actions={[]}
        />
      </div>
    ),
  },
  {
    screen: 'auraIcon',
    label: 'A unit’s auras: buffs, then debuffs, some stacked',
    sized: 'own',
    draw: () => (
      <Seeded seed={seedAuras}>
        <AuraRowOf />
      </Seeded>
    ),
  },
  {
    screen: 'auraCard',
    label: 'An aura, described, with its time left',
    draw: () => (
      <Seeded seed={seedAuraCard}>
        <AuraRowOf />
        <AuraCard />
      </Seeded>
    ),
  },
  {
    screen: 'castBar',
    label: 'A spell part-way through its cast',
    sized: 'own',
    draw: () => (
      <Seeded seed={() => setSpellName(9001, 'Sample Bolt')}>
        <ArtCastBar spellId={9001} castTime={2000} elapsed={1200} />
      </Seeded>
    ),
  },
  {
    screen: 'teamFrames',
    label: 'The rest of the team',
    sized: 'own',
    draw: () => (
      <ArtTeamFrames
        members={TEAM}
        selfName="Gallery"
        units={[
          { ...body('u2', 'Someone', 'player'), networkId: 2 } as Unit,
          { ...body('u3', 'Someone Else', 'player', 'vigor'), networkId: 3 } as Unit,
        ]}
        onSelect={nothing}
      />
    ),
  },
  {
    screen: 'chat',
    label: 'The chat, open',
    draw: () => <ArtChatBar />,
  },
  { screen: 'chatSaid', label: 'Words over somebody’s head', sized: 'own', draw: () => <Said /> },
  {
    screen: 'chatPeek',
    label: 'The latest lines, chat shut',
    sized: 'own',
    draw: () => <ArtChatPeek />,
  },
  // The character sheet and the cards that describe things.
  {
    screen: 'character',
    label: 'The character sheet',
    sized: 'fill',
    draw: () => <ArtCharacterWindow onClose={nothing} />,
  },
  {
    screen: 'held',
    label: 'A card for something in the bag',
    draw: () => <HeldCard compare={false} />,
  },
  {
    screen: 'equipped',
    label: 'The same card held up against what is worn',
    draw: () => <HeldCard compare />,
  },
  {
    screen: 'itemList',
    label: 'What could go in a place on the body',
    draw: () => (
      <ArtItemListWindow
        choices={inventory.value.items.filter(one => one.slot?.area === 'bag').slice(0, 3)}
        wearing={inventory.value.items.find(one => one.id === 'worn4') ?? null}
        beside={{ x: 40, y: 20 }}
        onPick={nothing}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'talentCard',
    label: 'A talent, described',
    draw: () => (
      <Seeded seed={stageOne}>
        <ArtTalentCard
          place={
            firstPlace() ??
            ({
              id: 1,
              tier: 1,
              column: 1,
              classId: 1,
              requires: 0,
              after: 0,
              ranks: 3,
              spells: [0],
              says: 0,
            } as unknown as Parameters<typeof ArtTalentCard>[0]['place'])
          }
          beside={{ left: 40, top: 20, right: 40, bottom: 20 }}
          onClose={nothing}
        />
      </Seeded>
    ),
  },
  {
    screen: 'spellCard',
    label: 'A spell, described',
    draw: () => (
      <ArtSpellCard
        spellId={auraSpells[0] ?? 1}
        beside={{ left: 40, top: 20, right: 40, bottom: 20 }}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'fittingRoom',
    label: 'Trying something on',
    sized: 'fill',
    draw: () => <ArtTryOn entries={[ENTRIES[2]]} onReset={nothing} onClose={nothing} />,
  },
  { screen: 'signIn', label: 'Signing in', draw: () => <ArtSignIn /> },
  { screen: 'about', label: 'What this client is', draw: () => <ArtAbout onClose={nothing} /> },
  {
    screen: 'characters',
    label: 'The characters on the account',
    draw: () => <ArtChooseCharacter />,
  },
  {
    screen: 'deleteCharacter',
    label: 'Asking before a character is deleted',
    draw: () => <ArtConfirmDelete name="Someone" onConfirm={nothing} onCancel={nothing} />,
  },
  {
    screen: 'connecting',
    label: 'Waiting for the server to answer a sign-in',
    draw: () => <ArtConnecting onCancel={nothing} />,
  },
  {
    screen: 'notice',
    label: 'What the server said back (a refused sign-in)',
    draw: () => (
      <ArtNotice
        text="This username does not exist, or the password is incorrect."
        onClose={nothing}
      />
    ),
  },
  ...(['teamAsk', 'voteKickAsk', 'tradeAsk', 'duelAsk'] as const).map(screen => ({
    screen,
    label: `A question from another player (${screen})`,
    draw: () => (
      <ArtAskBox
        screen={screen}
        name="Someone"
        label="A question"
        onAccept={nothing}
        onDecline={nothing}
      />
    ),
  })),
  {
    screen: 'summonAsk',
    label: 'Summoned by a member of the team',
    draw: () => (
      <ArtAskBox
        screen="summonAsk"
        label="Summon"
        fills={['Someone', 'High Forest']}
        marks={['High Forest']}
        onAccept={nothing}
        onDecline={nothing}
      />
    ),
  },
  {
    screen: 'bagUpgradeAsk',
    label: 'Asked before the bag is made bigger',
    draw: () => (
      <ArtAskBox
        screen="bagUpgradeAsk"
        label="Make the bag bigger"
        words="gold"
        fills={[3]}
        onAccept={nothing}
        onDecline={nothing}
      />
    ),
  },
  {
    screen: 'bagUpgradeShort',
    label: 'Told the purse is short',
    draw: () => (
      <ArtAskBox
        screen="bagUpgradeShort"
        label="Not enough money"
        acceptLabel="OK"
        onAccept={nothing}
      />
    ),
  },
  {
    screen: 'discardAsk',
    label: 'Asked before a thing is thrown away',
    draw: () => (
      <ArtAskBox
        screen="discardAsk"
        label="Throw this away"
        name="Sample Warden Helm"
        acceptLabel="Yes"
        onAccept={nothing}
        onDecline={nothing}
      />
    ),
  },
  {
    screen: 'npcChat',
    label: 'Talking to someone',
    draw: () => (
      <WornStage>
        <ArtNpcChatWindow
          speaker="Sample elder"
          says="The road north is closed. Bandits, they say, though nobody has seen one."
          choices={[
            { label: 'Where is the captain?', onPick: nothing },
            { label: 'Goodbye.', onPick: nothing },
          ]}
          onBack={nothing}
          onClose={nothing}
        />
      </WornStage>
    ),
  },
  {
    screen: 'questAsk',
    label: 'What someone has on offer',
    draw: () => (
      <WornStage>
        <ArtQuestAskWindow
          giver="Sample elder"
          choices={[
            { id: 1, name: 'A sample errand', ready: true },
            { id: 2, name: 'Another sample errand' },
          ]}
          onPick={nothing}
          onClose={nothing}
        />
      </WornStage>
    ),
  },
  {
    screen: 'questTalk',
    label: 'Somebody with only words, where the build has no talking screen',
    draw: () => (
      <WornStage>
        <ArtQuestWindow
          speech={{
            speaker: 'Sample Keeper',
            words: 'Mind the road after dark. The wolves are bolder this year.',
            replies: [{ label: 'Tell me about the wolves', onPick: nothing }],
          }}
          onClose={nothing}
        />
      </WornStage>
    ),
  },
  {
    screen: 'questTalk',
    label: 'One quest, ready to hand back',
    draw: () => (
      <WornStage>
        <ArtQuestWindow
          quest={QUEST}
          offers={[{ key: 'handIn', onPick: nothing }]}
          onClose={nothing}
        />
      </WornStage>
    ),
  },
  {
    screen: 'questTalk',
    label: 'One quest, with the card a reward to choose from opens',
    press: '[aria-pressed="false"]',
    draw: () => (
      <WornStage>
        <ArtQuestWindow
          quest={QUEST}
          offers={[{ key: 'handIn', onPick: nothing }]}
          onClose={nothing}
        />
      </WornStage>
    ),
  },
  {
    screen: 'questTalk',
    label: 'One quest, handed back for nothing but thanks',
    draw: () => (
      <Seeded seed={() => setQuestText(SAMPLE_WORDS, 'You found it. Thank you, truly.')}>
        <WornStage>
          <ArtQuestWindow
            quest={{
              ...QUEST,
              rewards: [],
              rewardChoices: [],
              rewardMoney: 0,
              detailsStringId: SAMPLE_WORDS,
            }}
            offers={[{ key: 'handIn', onPick: nothing }]}
            onClose={nothing}
          />
        </WornStage>
      </Seeded>
    ),
  },
  {
    screen: 'bag',
    label: 'Bag',
    sized: 'fill',
    draw: () => <ArtBagWindow onClose={nothing} />,
  },
  {
    screen: 'auction',
    label: 'Auction house',
    press: '[aria-label="search"]',
    draw: () => (
      <ArtAuctionWindow
        listings={listings()}
        total={3}
        status={null}
        onBrowse={nothing}
        onList={nothing}
        onBid={nothing}
        onBuyout={nothing}
        onCancel={nothing}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'mail',
    label: 'Mailbox, with a letter open',
    draw: () => {
      const inbox = Array.from({ length: 9 }, (_, at) => ({
        id: `letter${at}`,
        senderName: ['Someone', 'Someone Else', 'Gallery'][at % 3]!,
        subject: `Sample letter ${at + 1}`,
        gold: at % 3 === 0 ? 12_345 : 0,
        sentAt: now() - at * 3_600,
        read: at % 2 === 0,
        goldClaimed: false,
        itemCount: at % 3 === 0 ? 1 : 0,
        itemsClaimed: false,
      }));
      return (
        <ArtMailWindow
          inbox={inbox}
          message={{
            ...inbox[0]!,
            body: 'A sample letter, long enough to run onto a second and a third line of the room it is given.',
            items: [],
          }}
          notice={null}
          onSelect={nothing}
          onClaim={nothing}
          onDelete={nothing}
          onWrite={nothing}
          onCloseLetter={nothing}
          onClose={nothing}
        />
      );
    },
  },
  {
    screen: 'loot',
    label: 'Loot',
    sized: 'own',
    draw: () => (
      <ArtLootWindow
        title="Sample body"
        money="1 gold 23 silver 45 copper"
        copper={12_345}
        entries={ENTRIES.map((entry, slot) => ({
          slot,
          entry,
          item: { id: `loot${slot}`, name: `Sample ${slot + 1}`, quality: 2, count: slot + 1 },
        }))}
        onTake={nothing}
        onTakeMoney={nothing}
        onTakeAll={nothing}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'loot',
    label: 'Loot, with the card its first picture opens',
    sized: 'own',
    press: '[aria-label="About Sample 1"]',
    draw: () => (
      <ArtLootWindow
        title="Sample body"
        entries={ENTRIES.map((entry, slot) => ({
          slot,
          entry,
          item: { id: `loot${slot}`, name: `Sample ${slot + 1}`, quality: 2, count: 1 },
        }))}
        onTake={nothing}
        onTakeMoney={nothing}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'summon',
    label: 'A summon stone, one member away from the world',
    sized: 'own',
    draw: () => (
      <ArtSummonWindow
        rows={[
          { name: 'Sample One', canSummon: true, onPick: nothing },
          { name: 'Sample Two', canSummon: false, onPick: nothing },
        ]}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'storage',
    label: 'Strongbox',
    draw: () => <ArtStorageWindow onClose={nothing} />,
  },
  {
    screen: 'trade',
    label: 'Trade',
    draw: () => (
      <ArtTradeWindow
        mine={{ itemIds: ['bag0', 'bag1', 'bag2'], gold: 123_400 }}
        theirs={{
          items: ENTRIES.slice(0, 2).map((entry, at) => ({ id: `theirs${at}`, entry, count: 1 })),
          gold: 4_500,
        }}
        peerName="Someone Else"
        iConfirmed={false}
        theyConfirmed={false}
        notice={null}
        onOffer={nothing}
        onConfirm={nothing}
        onClose={nothing}
        // The bag beside the table, as the trade stands it in play.
        beside={
          <ArtBagWindow
            onClose={nothing}
            trading={{ offered: ['bag0', 'bag1', 'bag2'], offer: nothing }}
          />
        }
      />
    ),
  },
  {
    screen: 'shop',
    label: 'Shop',
    tabs: false,
    draw: () => (
      <ArtShopWindow
        vendorName="Sample trader"
        balance={1_234_056}
        items={ENTRIES.map((entry, slot) => ({
          id: entry,
          slot,
          name: `Sample ${slot + 1}`,
          price: [102, 1_200, 30_045][slot]!,
          stock: null,
          // The second card is a lesson this player cannot take, the third one already known.
          ...(slot === 1
            ? { lesson: 'cannot' as const }
            : slot === 2
              ? { lesson: 'learned' as const }
              : {}),
        }))}
        onBuy={nothing}
        onSell={nothing}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'sell',
    label: 'Selling',
    tabs: false,
    draw: () => (
      <ArtSellWindow
        vendorName="Sample trader"
        balance={1_234_056}
        onSell={nothing}
        onBuy={nothing}
        onClose={nothing}
      />
    ),
  },
  {
    screen: 'quests',
    label: 'The quest log',
    sized: 'fill',
    draw: () => (
      <Seeded
        seed={() => {
          setQuestLog([
            {
              id: 1,
              name: 'A sample errand',
              status: 'finished',
              readyToHandIn: true,
              tracked: true,
            },
            { id: 2, name: 'Another sample errand', status: 'incomplete' },
          ] as unknown as Parameters<typeof setQuestLog>[0]);
        }}
      >
        <ArtQuestLogWindow onClose={nothing} />
      </Seeded>
    ),
  },
  {
    screen: 'quests',
    label: 'The quest log, with the card a reward opens',
    sized: 'fill',
    press: ['[aria-expanded="false"]', '[data-reward]'],
    draw: () => (
      <Seeded seed={() => setQuestLog([{ ...QUEST, tracked: true }])}>
        <ArtQuestLogWindow onClose={nothing} />
      </Seeded>
    ),
  },
  {
    screen: 'spells',
    label: 'The spell book',
    sized: 'fill',
    tabs: false,
    draw: () => (
      <Seeded
        seed={() => {
          // More than the window holds, so the list scrolls.
          const spells = Array.from({ length: 9 }, (_, at) => at + 1);
          for (const id of spells) setSpellName(id, `Sample spell ${id}`);
          initSpells(spells, []);
          setSpellName(20, 'Sample mount');
          setMountSpells([20]);
        }}
      >
        <ArtSpellsWindow onClose={nothing} />
      </Seeded>
    ),
  },
  {
    screen: 'talents',
    label: 'A class’s talent trees',
    tabs: false,
    draw: () => (
      <Seeded
        seed={() => {
          heroClass.value = 1;
          stageOne();
        }}
      >
        <WornStage>
          <ArtTalentsWindow onClose={nothing} />
        </WornStage>
      </Seeded>
    ),
  },
  {
    screen: 'social',
    label: 'The people screen',
    sized: 'fill',
    tabs: false,
    draw: () => (
      <Seeded
        seed={() => {
          setGuildRoster({
            guildId: 'g',
            guildName: 'Sample guild',
            members: [
              { networkId: 2, name: 'Someone', isLeader: true },
              { networkId: 3, name: 'Someone Else', isLeader: false },
            ],
          });
          setFriendList([
            { networkId: 4, name: 'A friend' },
            {
              networkId: 5,
              name: 'Another',
              online: true,
              level: 12,
              raceName: 'Human',
              zoneName: 'Somewhere',
            },
          ]);
        }}
      >
        <ArtSocialWindow onClose={nothing} />
      </Seeded>
    ),
  },
  {
    screen: 'team',
    label: 'The team screen',
    sized: 'fill',
    draw: () => (
      <Seeded
        seed={() => {
          setPartyRoster({ partyId: 'p', members: TEAM });
        }}
      >
        <ArtTeamWindow onClose={nothing} />
      </Seeded>
    ),
  },
  {
    screen: 'options',
    label: 'Settings',
    sized: 'fill',
    draw: () => <ArtOptionsWindow onClose={nothing} />,
  },
];

/**
 * One screen, drawn inside a box the size of the movie's own screen.
 *
 * The box is transformed so a screen that stands itself over the whole
 * view stays inside its box instead, and positioned so a screen placed
 * where the movie places it lands inside the box too.
 */
function Cell({
  label,
  sized,
  tab,
  press,
  stage,
  children,
}: {
  label: string;
  sized?: 'fill' | 'own';
  tab?: string;
  press?: string | readonly string[];
  stage: { w: number; h: number };
  children: ComponentChildren;
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Turn to the tab this cell shows, then press what shows it working,
    // once each is on the page.
    let tries = 0;
    const want = [tab ? `[data-tab="${tab}"]` : '', ...[press ?? ''].flat()].filter(Boolean);
    const timer = setInterval(() => {
      const next = want[0];
      if (!next || tries++ > 200) return clearInterval(timer);
      const control = box.current?.querySelector<HTMLElement>(next);
      if (!control) return;
      control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      want.shift();
    }, 50);
    return () => clearInterval(timer);
  }, [tab, press]);
  const scale = 2;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-mono text-sm text-brass-300">{label}</h2>
      <div
        ref={box}
        className={
          sized === 'fill'
            ? 'flex items-stretch justify-start'
            : sized === 'own'
              ? 'flex items-start justify-start'
              : 'relative'
        }
        style={{
          transform: 'translateZ(0)',
          width: `${stage.w * scale}px`,
          height: `${stage.h * scale}px`,
          outline: '1px solid var(--color-brass-400)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Gallery({ stage }: { stage: { w: number; h: number } }): JSX.Element {
  const cells: JSX.Element[] = [];
  for (const shown of SHOWN) {
    if (!SCREEN_MEANINGS[shown.screen]) continue;
    if (ONLY.length && !ONLY.includes(shown.screen)) continue;
    const tabs = shown.tabs === false ? [] : (screenSpec(shown.screen)?.tabs ?? []);
    const reason = screenFallback(shown.screen);
    if (reason) {
      cells.push(
        <p key={shown.screen} className="font-mono text-sm text-parchment-100">
          {`${shown.label} (${shown.screen}): falls back — ${JSON.stringify(reason)}`}
        </p>,
      );
      continue;
    }
    const turns = tabs.length ? tabs.map(tab => tab.control) : [undefined];
    for (const tab of turns) {
      const words = tabs.find(one => one.control === tab)?.caption;
      cells.push(
        <Cell
          key={`${shown.screen}.${tab ?? ''}`}
          label={`${shown.label} (${shown.screen})${tab ? ` — tab ${tab} (${words})` : ''}`}
          sized={shown.sized}
          tab={tab}
          press={shown.press}
          stage={stage}
        >
          {shown.draw()}
        </Cell>,
      );
    }
  }
  return (
    <div className="fixed inset-0 flex flex-col gap-6 overflow-auto bg-chrome-950 p-4">
      <table className="font-mono text-xs text-parchment-100">
        <tbody>
          {KNOWN_SCREENS.map(name => {
            const reason = screenFallback(name);
            return (
              <tr key={name} data-screen={name} data-worn={reason ? 'no' : 'yes'}>
                <td className="pr-4">{name}</td>
                <td>{reason ? `falls back: ${JSON.stringify(reason)}` : 'drawn from the movie'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cells}
    </div>
  );
}

function Page(): JSX.Element {
  const [note, setNote] = useState('Reading the build…');
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    void (async () => {
      if (!DIR) return setNote('Pass ?dir=<absolute path to a directory holding res.bin>.');
      const files: File[] = [];
      for (const name of [...PACKS, ...LOOSE]) {
        const got = await fetch(`/@fs/${DIR}/${name}`).catch(() => null);
        if (!got?.ok) continue;
        const blob = await got.blob();
        if (blob.type.startsWith('text/')) continue;
        files.push(new File([blob], name));
      }
      if (!files.length) return setNote(`Nothing to mount from ${DIR}.`);
      const provider = new PackAssetProvider();
      await provider.useSource(provider.offer(files).id);
      setUiWords(await provider.load(uiStringsId()).catch(() => []));
      void provider
        .load(uiFacesId())
        .then(registerFaces)
        .catch(() => false);
      await cutUiSprites(
        movie => provider.load(uiSkinId(movie)),
        (sheet, movie) => provider.load(uiIconId(sheet, movie)),
        cutToBlobUrl,
      )
        .then(setUiSprites)
        .catch(() => undefined);

      // Every dialog the table names, with every sheet it is drawn from.
      const byMovie = new Map<UiMovie, Set<string>>();
      for (const meaning of Object.values(SCREEN_MEANINGS)) {
        const movie = meaning.movie ?? 'IGM';
        byMovie.set(movie, (byMovie.get(movie) ?? new Set()).add(meaning.dialog));
      }
      let igm: UiSkinData | null = null;
      for (const [movie, dialogs] of byMovie) {
        const skin = await provider.load(uiSkinId(movie)).catch(() => null);
        if (!skin) continue;
        if (movie === 'IGM') igm = skin;
        const art = new Map<string, UiSkinArt>();
        for (const dialog of dialogs) {
          const plan = planPiece(skin, dialog, { includeParked: true });
          for (const needed of plan ? planArt(plan) : []) {
            if (art.has(needed)) continue;
            const sheet = await provider.load(uiIconId(needed, movie)).catch(() => null);
            if (sheet) art.set(needed, sheet);
          }
        }
        setMovie({ skin, art }, movie);
      }

      // Pictures a screen draws for itself at points the movie only marks
      // — the outline in an empty place on the body, a tree's mark. The
      // game answers for them in play; here the gallery does.
      const askedEmblems = new Set<string>();
      effect(() => {
        const fresh = wantedEmblems.value.filter(name => !askedEmblems.has(name));
        for (const name of fresh) askedEmblems.add(name);
        void Promise.all(
          fresh.map(name =>
            provider
              .load(uiIconId(name))
              .then(art => (art ? ([name, art.image] as const) : null))
              .catch(() => null),
          ),
        ).then(found => {
          const got = found.filter((one): one is readonly [string, ImageBitmap] => one !== null);
          if (got.length) setEmblems(new Map(got));
        });
      });

      for (const [at, entry] of ENTRIES.entries()) {
        const facts = await provider.load(itemFactsId(entry)).catch(() => null);
        if (facts) setItemFacts(entry, facts);
        setItemName(
          entry,
          (await provider.load(itemNameId(entry)).catch(() => null)) ?? `Sample ${at + 1}`,
        );
        const picture = await provider.load(itemIconId(entry)).catch(() => null);
        if (picture) setItemIcon(entry, picture);
      }
      setInventoryActions({
        move: nothing,
        equip: nothing,
        unequip: nothing,
        use: nothing,
        destroy: nothing,
        sell: nothing,
        sort: nothing,
        split: nothing,
        upgrade: nothing,
      });
      setStorageUpgrades([
        { storage: 0, slots: 24, currency: 0, price: 30_045, item: 0, requires: 18 },
      ] as Parameters<typeof setStorageUpgrades>[0]);
      player.value = {
        id: 'me',
        name: 'Gallery',
        level: 40,
        health: 3_000,
        maxHealth: 4_000,
        mana: 60,
        maxMana: 100,
        exp: 500,
        expToLevel: 1_000,
      } as (typeof player)['value'];
      heroClass.value = HERO_CLASS;
      money.value = 4_998_000;
      for (const name of TOPBAR_ICON_NAMES) {
        void provider.topbarIcon(name).then(icon => icon && setTopbarIcon(name, icon));
      }
      for (const classId of CLASS_IDS) {
        void provider.classIcon(classId).then(icon => icon && setClassIcon(classId, icon));
      }
      chatLines.value = [
        { key: 1, channel: 'say', sender: 'Someone', text: 'A sample line.' },
        { key: 2, channel: 'party', sender: 'Someone Else', text: 'Another, on the team.' },
      ];
      chatOpen.value = true;
      chatPeekUntil.value = Number.POSITIVE_INFINITY;
      setCharacters([someone('Someone', 0, 12), someone('Someone Else', 2, 40)]);
      inventory.value = { bagSlotCount: 18, bankSlotCount: 30, items: stock() };
      // Something worn on the head and on the chest, for the sheet and for
      // the card to hold things up against.
      inventory.value = {
        ...inventory.value,
        items: [
          ...inventory.value.items,
          ...[
            { id: 'worn0', slot: { area: 'equipment', index: 0 }, entry: ENTRIES[1], count: 1 },
            { id: 'worn4', slot: { area: 'equipment', index: 4 }, entry: ENTRIES[2], count: 1 },
          ],
        ] as typeof inventory.value.items,
      };
      // The talent trees are in the build's own tables, as in play.
      const talents = await provider.load(talentsId()).catch(() => null);
      if (talents) {
        setTalentPlaces(talents.places);
        setClassTrees(new Map(talents.trees.map(row => [row.classId, row.trees])));
        auraSpells = talents.places.slice(0, 4).map(place => place.spells[0] ?? 0);
        for (const id of auraSpells) {
          const name = await provider.load({ kind: 'spellName', id } as const).catch(() => null);
          if (name) setSpellName(id, name);
          const text = await provider.load({ kind: 'spellText', id } as const).catch(() => null);
          if (text) setSpellText(id, text);
          const icon = await provider.load({ kind: 'spellIcon', id } as const).catch(() => null);
          if (icon) setSpellIcon(id, icon);
          const stats = await provider.load({ kind: 'spellStats', id } as const).catch(() => null);
          if (stats) setSpellStats(id, stats);
        }
      }
      setStage({ w: igm?.width ?? 480, h: igm?.height ?? 320 });
      setNote('');
      setTimeout(() => document.body.setAttribute('data-ready', 'yes'), 3_000);
    })();
  }, []);
  if (note || !stage) return <p className="p-4 font-mono text-parchment-100">{note}</p>;
  return <Gallery stage={stage} />;
}

const root = document.getElementById('gallery');
if (root) render(<Page />, root);
