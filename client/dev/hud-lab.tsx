/**
 * Dev-only HUD harness.
 *
 * Mounts the production `GameHud` — not a copy — over a stand-in backdrop,
 * and drives the parts of the store a session drives during play: cooldowns
 * tick down, health drifts, a cast runs. That makes the layout reviewable,
 * and the live bits actually live, without needing an `.ipa`.
 *
 *   npm run dev  ->  /dev/hud-lab.html
 *
 * Pass `?dir=<absolute path to a directory holding res.bin>` (that directory
 * must also have been `$UBIQUITOUS_PACK_DIR` when vite started) to wear the shipped
 * art instead of the hand-drawn fallback — `?app=<file name>.ipa` mounts a
 * whole build instead of pre-extracted packs, the same as `dev/worn.tsx`'s
 * own note explains. Without either, the lab draws the hand-drawn fallback.
 */

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '../src/ui/styles/global.css';
import { GameHud, setHeadshotSource } from '../src/ui/GameHud';
import { setMapState, setPlayer, setTarget, setWorldUnits } from '../src/ui/hudStore';
import { announceQuestProgress, setQuestText, showQuestConversation } from '../src/ui/questStore';
import { setLootActions, setLootContents } from '../src/ui/lootStore';
import { setItemName } from '../src/ui/inventoryStore';
import type { Unit } from '../src/ui/hudStore';
import { setAura } from '../src/ui/auraStore';
import {
  cooldowns,
  initSpells,
  setInCombat,
  setSpellName,
  startCooldown,
} from '../src/gameplay/SpellBook';
import { mountUiTextures } from '../src/ui/styles/uiTextures';
import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { uiFacesId, uiIconId, uiSkinId, uiStringsId } from '../src/assets/ids';
import type { UiSkinArt } from '../src/assets/types';
import { planArt, planPiece } from '../src/ui/art/piecePlan';
import { setMovie, setUiWords } from '../src/ui/art/pieceStore';
import { SCREEN_MEANINGS } from '../src/ui/art/screenMeanings';
import { registerFaces } from '../src/core/lettering';
import {
  CLASS_IDS,
  TOPBAR_ICON_NAMES,
  setClassIcon,
  setTopbarIcon,
} from '../src/ui/topbarIconStore';

// The lab wears the same chrome the client does.
mountUiTextures();

const assetParams = new URLSearchParams(location.search);
const ASSET_DIR = assetParams.get('dir') ?? '';
const ASSET_APP = assetParams.get('app') ?? '';
const ASSET_PACKS = (assetParams.get('packs') ?? 'res.bin,tables.bin').split(',').filter(Boolean);

/**
 * Wear the shipped art, the same way `dev/worn.tsx`'s bench mounts one — a
 * trimmed copy of its effect, without the item/quest/mail dressing this lab
 * already does its own way.
 */
async function mountRealAssets(dir: string): Promise<void> {
  const provider = new PackAssetProvider();
  const files: File[] = [];
  for (const name of ASSET_APP ? [ASSET_APP] : ASSET_PACKS) {
    const got = await fetch(`/@fs/${dir}/${name}`).catch(() => null);
    if (!got?.ok) continue;
    const blob = await got.blob();
    if (blob.type.startsWith('text/')) continue;
    files.push(new File([blob], name));
  }
  if (!files.length) return;
  await provider.useSource(provider.offer(files).id);

  const skin = await provider.load(uiSkinId('IGM'));
  setUiWords(await provider.load(uiStringsId()).catch(() => []));

  void provider
    .load(uiFacesId())
    .then(registerFaces)
    .catch(() => false);

  const art = new Map<string, UiSkinArt>();
  const wanted = new Set(
    Object.values(SCREEN_MEANINGS)
      .filter(screen => (screen.movie ?? 'IGM') === 'IGM')
      .map(screen => screen.dialog),
  );
  for (const dialog of wanted) {
    const plan = planPiece(skin, dialog, { includeParked: true });
    for (const needed of plan ? planArt(plan) : []) {
      if (art.has(needed)) continue;
      const bitmap = await provider.load(uiIconId(needed, 'IGM')).catch(() => null);
      if (bitmap) art.set(needed, bitmap);
    }
  }
  setMovie({ skin, art });

  // The target toolbar's action pictures and the class badges, the same
  // loose files `Game` resolves during play, so the lab shows the pictured
  // buttons rather than their captions.
  for (const name of TOPBAR_ICON_NAMES) {
    void provider.topbarIcon(name).then(icon => icon && setTopbarIcon(name, icon));
  }
  for (const classId of CLASS_IDS) {
    void provider.classIcon(classId).then(icon => icon && setClassIcon(classId, icon));
  }
}

/** Milliseconds between ticks. One tick is one second of cooldown. */
const TICK_MS = 1000;

const MAGE: Unit = {
  id: 'hero',
  networkId: 1,
  name: 'Naevia',
  level: 60,
  health: 4200,
  maxHealth: 5000,
  mana: 1800,
  maxMana: 2400,
  exp: 61_400,
  expToLevel: 148_000,
  disposition: 'friendly',
  kind: 'Mage',
  classId: 2,
  resource: 'mana',
};

/**
 * `?hero=warrior` or `?hero=ranger` seats a hero whose morale or vigor is a
 * meter of its own; `?hero=monk` seats the other class that spends mana.
 */
const HEROES: Record<string, Unit> = {
  warrior: { ...MAGE, kind: 'Warrior', classId: 1, resource: 'morale', mana: 60, maxMana: 100 },
  ranger: { ...MAGE, kind: 'Ranger', classId: 3, resource: 'vigor', mana: 60, maxMana: 100 },
  monk: { ...MAGE, kind: 'Monk', classId: 4 },
};
const HERO: Unit = HEROES[assetParams.get('hero') ?? ''] ?? MAGE;

const MOB: Unit = {
  id: 'mob-1',
  networkId: 2,
  name: 'Rock Elemental',
  level: 62,
  health: 8200,
  maxHealth: 12_000,
  mana: 1800,
  maxMana: 2400,
  disposition: 'hostile',
  kind: 'Elemental',
  resource: 'vigor',
};

/**
 * A stand-in headshot, so the target frame's portrait layer is exercised —
 * without this, `usePortrait` always returns null here (no 3D renderer),
 * which is exactly the state a bug in the loaded-portrait path would hide
 * behind.
 */
const PLACEHOLDER_PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
      '<rect width="200" height="200" fill="#c9a06a"/>' +
      '<circle cx="100" cy="80" r="45" fill="#7a5230"/>' +
      '<rect x="55" y="120" width="90" height="90" fill="#7a5230"/>' +
      '</svg>',
  );

/** Enough spells to fill the primary bar and start the pop-out one. */
const SPELLS = [101, 102, 103, 104, 105, 106, 107, 108];

/** Sample auras on the hero and the target: two buffs, one stacked, and a debuff. */
function seedAuras(): void {
  const on = (unit: Unit, spellId: number, harmful: boolean, stacks: number, remainingMs: number) =>
    setAura(String(unit.networkId), {
      spellId,
      casterId: 0,
      harmful,
      stacks,
      remainingMs,
      durationMs: remainingMs,
    });
  on(HERO, SPELLS[0]!, false, 1, 600_000);
  on(HERO, SPELLS[1]!, false, 3, 90_000);
  on(HERO, SPELLS[2]!, true, 1, 30_000);
  on(MOB, SPELLS[3]!, true, 2, 45_000);
}

function seed(): void {
  setPlayer(HERO);
  setWorldUnits([MOB]);
  setTarget(MOB.id);
  seedAuras();
  setHeadshotSource(() => PLACEHOLDER_PORTRAIT);
  setMapState({
    zoneName: 'Test Vale',
    bounds: [-256, -256, 256, 256],
    playerPosition: [0, 0, 0],
    playerYaw: 0,
    markers: [
      { id: 'smith', label: 'Smith', position: [60, 0, -40], kind: 'service' },
      { id: 'quest', label: 'Quest', position: [-80, 0, 90], kind: 'quest' },
    ],
  });
  initSpells(
    SPELLS,
    SPELLS.map((id, slot) => ({
      bar: slot < 6 ? 'primary' : 'shortcut',
      slot: slot % 6,
      id,
      type: 0,
    })),
  );
  for (const [index, id] of SPELLS.entries()) setSpellName(id, `Spell ${index + 1}`);
  startCooldown(SPELLS[2]!, 12_000);
  setInCombat(true);

  setItemName(24815, 'Small Sample Tonic');
  setItemName(24816, 'Ranger’s Primer');

  /*
   * The giver's window and the loot window are cut from the same page and
   * sit on the same layer, so the lab shows one at a time: `?loot=1` for the
   * body, and the giver by default.
   */
  if (new URLSearchParams(location.search).has('loot')) {
    setLootActions({ take: () => {}, takeMoney: () => {}, close: () => {} });
    setLootContents({
      networkId: 1,
      money: 12_345,
      items: [
        {
          slot: 0,
          itemId: 'a',
          entry: 24815,
          namePrefixId: 0,
          nameTextId: 700,
          prefixTextId: 0,
          itemClass: 0,
          subClass: 0,
          quality: 2,
          count: 3,
          displayInfoId: 0,
        },
        {
          slot: 1,
          itemId: 'b',
          entry: 24816,
          namePrefixId: 0,
          nameTextId: 701,
          prefixTextId: 0,
          itemClass: 0,
          subClass: 0,
          quality: 4,
          count: 1,
          displayInfoId: 0,
        },
      ],
    });
    return;
  }

  // A giver's window, so the page and its torn edge can be judged over the
  // world rather than over a blank backdrop.
  setQuestText(6924, 'Eine erfundene Beispielaufgabe mit langem Titel');
  setQuestText(6925, 'Ein erfundener Beispielsatz für die Anzeige.');
  setQuestText(6926, 'Beispielschuss I');
  showQuestConversation({
    kind: 'quest',
    giverId: 1,
    action: 'accept',
    quest: {
      id: 620,
      name: 'Quest 620',
      status: 'available',
      titleStringId: 6924,
      detailsStringId: 6925,
      objectives: [
        {
          index: 0,
          killed: 1,
          triggered: 0,
          held: 0,
          objectiveItem: 0,
          objectiveItemCount: 0,
          goalCount: 1,
          objectiveStringId: 6926,
        },
      ],
      rewards: [
        { entry: 24815, nameTextId: 700, quality: 2, count: 3 },
        { entry: 24816, nameTextId: 701, quality: 4, count: 1 },
      ],
    },
  });

  // A quest mid-flight, so the on-screen tracker can be seen in the lab.
  setQuestText(6920, 'Sample Errand');
  setQuestText(6927, 'Kill the wolves');
  announceQuestProgress(
    {
      id: 620,
      name: 'Quest 620',
      status: 'incomplete',
      titleStringId: 6920,
      objectives: [
        {
          index: 0,
          killed: 3,
          triggered: 0,
          held: 0,
          objectiveItem: 0,
          objectiveItemCount: 0,
          goalCount: 5,
          objectiveStringId: 6927,
        },
      ],
    },
    0,
  );
}

function HudLab(): ReturnType<typeof GameHud> {
  const [assetsReady, setAssetsReady] = useState(!ASSET_DIR);

  useEffect(() => {
    if (!ASSET_DIR) return;
    void mountRealAssets(ASSET_DIR).finally(() => setAssetsReady(true));
  }, []);

  useEffect(() => {
    seed();
    const timer = setInterval(() => {
      // Drift the hostile unit's health so the target frame can be seen
      // tracking a live source, and let the cooldown run down.
      setWorldUnits(
        [MOB].map(unit => {
          const next = unit.health - unit.maxHealth * 0.03;
          return { ...unit, health: next <= 0 ? unit.maxHealth : next };
        }),
      );
      const remaining = cooldowns.value.get(SPELLS[2]!)?.remaining ?? 0;
      if (remaining <= 0) startCooldown(SPELLS[2]!, 12_000);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-ready={assetsReady ? 'yes' : undefined}
    >
      {/* Stand-in for the rendered world: enough depth and clutter that the
          HUD's contrast can be judged against something, rather than flat
          black. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-b from-map-ground via-chrome-800 to-chrome-950"
      >
        <div className="absolute inset-0 bg-radial from-transparent to-black/45" />
        <p className="absolute top-2 left-1/2 -translate-x-1/2 text-micro tracking-widest text-parchment-100/40 uppercase">
          rendered world goes here
        </p>
      </div>

      <GameHud />
    </div>
  );
}

const root = document.getElementById('hud-lab');
if (root) render(<HudLab />, root);
