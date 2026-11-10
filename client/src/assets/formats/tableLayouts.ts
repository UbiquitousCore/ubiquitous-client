/**
 * Every table the client reads by column: its columns named at their place
 * in the 1.1.4 format, and what each other known format lacks or adds. Each
 * difference was measured by lining two builds' rows up by key.
 */

import { defineLayout, may, must, run, type Resolved } from './columnLayout';

export const mapInfoLayout = defineLayout(
  'map_info',
  'uuuuufffussuuufuuu',
  { name: must(9, 's'), world: must(10, 's') },
  [
    // 1.0.0
    { format: 'uuuuufffussuuuf', edits: [{ lacks: 15, count: 3 }] },
    // 2.2.0 on: three floats of its own ahead of the recall point
    { format: 'uuuuuffffffussuuufuuu', edits: [{ addsBefore: 5, count: 3 }] },
  ],
);

export const zoneLayout = defineLayout(
  'zones',
  'iiiuffffffffuuffuuuussssssfffffusiii',
  {
    parent: may(2, 'iu'),
    map: must(3, 'u'),
    x1: must(4, 'f'),
    z1: must(6, 'f'),
    x2: must(8, 'f'),
    z2: must(10, 'f'),
    priority: may(12, 'u'),
    fogColor: may(13, 'u'),
    fogNear: may(14, 'f'),
    fogFar: may(15, 'f'),
    sunColor: may(16, 'u'),
    shadeColor: may(17, 'u'),
    music: may(18, 'u'),
    ambience: may(19, 'u'),
    skyDome: may(20, 's'),
    skyHill: may(21, 's'),
    skySun: may(22, 's'),
    skyHalo: may(24, 's'),
    icon: may(32, 's'),
    friendly: may(35, 'i'),
  },
  [
    // 1.0.0 to 1.0.3: a dome and a hill, no sun or halo
    { format: 'iiiuffffffffuuffuuuusssiii', edits: [{ lacks: 22, count: 10 }] },
    // 1.1.5
    { format: 'iiiuffffffffuuffuuuussssssfffffusiiiu', edits: [{ addsBefore: 36 }] },
    // 2.2.0 on
    {
      format: 'iiiuffffffffuuffffuuuussssssfffffusiiiu',
      edits: [{ addsBefore: 16, count: 2 }, { addsBefore: 36 }],
    },
  ],
);

export const staticSpawnLayout = defineLayout(
  'staticobject_spawns',
  'uuuffffffuufffuf',
  {
    entry: must(1, 'u'),
    map: must(2, 'u'),
    x: must(3, 'f'),
    y: must(4, 'f'),
    z: must(5, 'f'),
    yaw: must(7, 'f'),
    scale: may(11, 'f'),
    scaleY: may(12, 'f'),
  },
  [
    // 1.0.0 to 1.0.3: one scale, where later builds carry one per axis
    { format: 'uuuffffffuufuf', edits: [{ lacks: 12, count: 2 }] },
  ],
);

export const staticProtoLayout = defineLayout(
  'staticobject_proto',
  'uuuuuuufuuuuuuuuuuuu',
  {
    type: may(1, 'u'),
    display: must(3, 'u'),
    scale: must(7, 'f'),
    /** 0 always present, else a `festival.tbl` id; only the active festival's objects show. */
    festival: may(19, 'u'),
  },
  [
    // 1.0.0 to 1.0.3
    { format: 'uuuuuuufuuuuuuuuuu', edits: [{ lacks: 18, count: 2 }] },
    // 1.1.0 and 1.1.1: the festival is there, the column ahead of it is not
    { format: 'uuuuuuufuuuuuuuuuuu', edits: [{ lacks: 18 }] },
  ],
);

export const staticDisplayLayout = defineLayout('staticobject_displayinfo', 'usuuuuussssssssssss', {
  path: must(1, 's'),
  /** Six nodes in the object's model, then the `.beff` that hangs off each. */
  effectNodes: run([7, 8, 9, 10, 11, 12], 's'),
  effectFiles: run([13, 14, 15, 16, 17, 18], 's'),
});

export const creatureSpawnLayout = defineLayout(
  'creature_spawns',
  'uuuffffcuuuuuuuuhuuhuuuuuuufuuuuuuuuuuuuuu',
  {
    entry: must(1, 'u'),
    map: must(2, 'u'),
    x: must(3, 'f'),
    y: must(4, 'f'),
    z: must(5, 'f'),
    yaw: must(6, 'f'),
  },
  [
    // 1.0.0 and 1.0.1
    { format: 'uuuffffcuuuuuuuuhuuhuuuuuuufuuuuuuu', edits: [{ lacks: 35, count: 7 }] },
  ],
);

export const creatureAppearanceLayout = defineLayout('creature_appearance', 'ukkkuuu', {
  name: must(1, 'uk'),
  display: must(5, 'uk'),
});

export const creatureDisplayLayout = defineLayout('creaturedisplayinfo', 'uuuuussu', {
  model: must(1, 'u'),
  /** A percentage, not a multiplier. */
  scale: may(3, 'u'),
  skin: must(5, 's'),
  extra: may(7, 'u'),
});

export const creatureModelLayout = defineLayout('creaturemodeldata', 'uissssssssssssssu', {
  path: must(2, 's'),
  /** A `sound_solution` key: the set's own description matches the model row's. */
  sounds: may(16, 'u'),
});

const OLD_CREATURE_PROTO = [{ lacks: 55 }, { addsBefore: 56 }] as const;

export const creatureProtoLayout = defineLayout(
  'creature_proto',
  'uuuuuuuuuufuuuuuuuuuuuuuuuuuuuuuuuffsuuuuuuuuuuuuuuuuuusuuuuufuuuuufuuuuuu',
  {
    scale: must(10, 'f'),
    /** One bit per service the NPC offers. */
    flags: must(11, 'u'),
    /** The `chat_menu` row a creature greets a player with; 0 for none. */
    greetingMenu: may(56, 'u'),
  },
  [
    // 1.0.0 to 1.0.3
    {
      format: 'uuuuuuuuuufuuuuuuuuuuuuuuuuuuuuuuuffsuuuuuuuuuuuuuuuuuuuuuuuufuu',
      edits: [...OLD_CREATURE_PROTO, { lacks: 64, count: 10 }],
    },
    // 1.1.0 and 1.1.1
    {
      format: 'uuuuuuuuuufuuuuuuuuuuuuuuuuuuuuuuuffsuuuuuuuuuuuuuuuuuuuuuuuufuuuuuf',
      edits: [...OLD_CREATURE_PROTO, { lacks: 68, count: 6 }],
    },
    // 2.5.0
    {
      format: 'uuuuuuuuuufuuuuuuuuuuuuuuuuuuuuuuuffsuuuuuuuuuuuuuuuuuusuuuuufuuuuufuuuuuuu',
      edits: [{ addsBefore: 74 }],
    },
    // 4.2.21
    {
      format: 'uuuuuuuuuufuuuuuuuuuuuuuuuuuuuuuuuffsuuuuuuuuuuuuuuuuuusuuuuufuuuuufuuuuuuuuuuf',
      edits: [{ addsBefore: 74, count: 5 }],
    },
  ],
);

export const chatMenuLayout = defineLayout('chat_menu', 'uuuuuuuuuuuuuu', {
  text: may(1, 'u'),
  scripts: run([2, 3, 4, 5, 6, 7], 'u'),
  subMenus: run([8, 9, 10, 11, 12, 13], 'u'),
});

export const mountLayout = defineLayout('mountprototype', 'uussuuuus', {
  id: may(0, 'uk'),
  model: may(2, 's'),
  /** Replaces the model's own texture. */
  texture: may(3, 's'),
  effect: may(8, 's'),
});

export const soundLayout = defineLayout('c_sound', 'uuusfffuuuuuuuuuuu', {
  /** How many numbered files the sound has. */
  variants: must(1, 'u'),
  flags: must(2, 'u'),
  path: must(3, 's'),
  /** 0.2 to 1. */
  volume: must(4, 'f'),
  /** How far it carries: own reading. */
  reach: must(6, 'f'),
  bank: must(7, 'u'),
});

export const soundBankLayout = defineLayout('c_sound_bank', 'usu', {
  capacity: may(2, 'u'),
});

export const battleMusicLayout = defineLayout('ZoneSpecialMusic', 'uu', {
  zone: may(0, 'uk'),
  cue: may(1, 'u'),
});

export const soundSetLayout = defineLayout(
  'sound_solution',
  'uuuuuuuuuuuuuuuus',
  { states: run([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 'u') },
  [
    // 1.0.0 to 1.1.1
    { format: 'uuuuuuuuuuuuuuus', edits: [{ lacks: 15 }] },
  ],
);

export const spellVisualLayout = defineLayout(
  'c_spellvisual',
  'uuuuuuuuuuuss',
  {
    opening: may(1, 'u'),
    windUp: may(2, 'u'),
    release: may(3, 'u'),
    impact: may(4, 'u'),
    lasting: may(5, 'u'),
    area: may(6, 'u'),
    ending: may(7, 'u'),
    missile: may(8, 'u'),
    streak: may(9, 'u'),
    impactDelay: may(10, 'u'),
  },
  [
    // 1.0.0 to 1.1.1: no ending phase
    { format: 'uuuuuuuuuuss', edits: [{ lacks: 7 }] },
  ],
);

export const spellVisualStateLayout = defineLayout('c_spellvisualstate', 'uuuuuuuuuuus', {
  clip: may(1, 'u'),
  effects: run([2, 3, 4, 5, 6, 7], 'u'),
  sound: may(8, 'u'),
  shake: may(9, 'u'),
  clipBlend: may(10, 'u'),
});

export const spellVisualEffectLayout = defineLayout(
  'c_spellvisualeffect',
  'ussiiiuuuu',
  {
    name: may(1, 's'),
    path: may(2, 's'),
    /** A percentage, like `creaturedisplayinfo`'s. */
    scale: may(6, 'ui'),
    placement: may(7, 'ui'),
    flight: may(8, 'ui'),
    projectiles: may(9, 'ui'),
  },
  [
    // 1.0.0
    { format: 'ussiiiuu', edits: [{ lacks: 8, count: 2 }] },
  ],
);

export const animationLayout = defineLayout('c_animationdata', 'usuuu', {
  name: may(1, 's'),
  loop: may(2, 'u'),
});

export const spellLayout = defineLayout(
  'spell_new',
  'uuusuuuuuusuiuuuuuffffuuuuuuuuuuuuuuuuufuuuuuuuuuuuuu',
  {
    skillSet: may(1, 'u'),
    /** The spell's name string id; the spell id itself lands on the wrong string for many spells. */
    nameString: may(5, 'u'),
    /** `1..N` in its chain, like the name's numeral. */
    rank: may(6, 'u'),
    descriptionString: may(7, 'u'),
    icon: may(10, 's'),
    castMs: may(16, 'iu'),
    cooldownMs: may(17, 'iu'),
    range: may(21, 'f'),
    mountKind: may(25, 'u'),
    visual: may(26, 'u'),
    /** The ids of its effect rows. */
    effects: run([33, 34, 35], 'u'),
    powerCost: may(41, 'u'),
    flags: may(43, 'u'),
  },
  [
    // 1.0.0 to 1.1.1: no mount column
    { format: 'uuusuuuuuusuiuuuuuffffuuuuuuuuuuuuuuuufuuuuuuuuuuuuu', edits: [{ lacks: 25 }] },
    // 2.2.0
    {
      format: 'uuusuuuuuusuiuuuuuffffuuuuuuuuuuuuuuuuufuuuuuuuuuuuuuuu',
      edits: [{ addsBefore: 47, count: 2 }],
    },
    // 2.5.0
    {
      format: 'uuusuuuuuusuiuuuuuffffuuuuuuuuuuuuuuuuufuuuuuuuuuuuuuuuu',
      edits: [{ addsBefore: 47, count: 2 }, { addsBefore: 53 }],
    },
    // 4.2.21
    {
      format: 'uuusuuuuuusuiuuuuuffffuuuuuuuuuuuuuuuuufuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu',
      edits: [
        { addsBefore: 47, count: 17 },
        { addsBefore: 53, count: 4 },
      ],
    },
  ],
);

export const spellEffectLayout = defineLayout(
  'spell_effect',
  'uuuuufuuiiiuuuuuuuuuusss',
  {
    kind: may(6, 'iu'),
    detail: may(7, 'iu'),
    /** The number the effect does its work with. */
    argument: may(11, 'u'),
    /** The written name of what it does. */
    label: may(22, 's'),
  },
  [
    // 4.2.21
    { format: 'uuuuufuuiiiuuuuuuuuuusssuuuu', edits: [{ addsBefore: 24, count: 4 }] },
  ],
);

export const skillSetLayout = defineLayout('spell_skillset', 'uus', {
  /** A file under `ui/icons/class/`. */
  icon: may(2, 's'),
});

const OLD_ITEMS = { lacks: 22 } as const;

export const itemLayout = defineLayout(
  'items',
  'uuukuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuffuffuuuufuuuuuuuuuuuuukuuuuuuuufuuuuuuuuuuuuuuuusuuuusuuuuuuuuuu',
  {
    itemClass: may(1, 'uc'),
    subClass: may(2, 'uc'),
    nameString: may(3, 'uk'),
    /** A fallback; equipment dresses from the appearance tables. */
    look: may(4, 'u'),
    quality: may(5, 'u'),
    wornOn: may(11, 'u'),
    wearerClasses: may(13, 'u'),
    levelNeeded: may(16, 'u'),
    /** Nine (kind, amount) pairs from here. */
    statsFirst: may(28, 'u'),
    /** Two runs of least, most and kind from here, one per sort of damage. */
    damageFirst: may(48, 'uf'),
    armour: may(54, 'uf'),
    delay: may(55, 'uf'),
    /** Two spell slots six columns apart from here; the trigger follows the id. */
    spellsFirst: may(58, 'u'),
    binding: may(70, 'uk'),
    descriptionString: may(71, 'uk'),
    /** Always a `quests.tbl` key; 0 for none. */
    startsQuest: may(75, 'u'),
    block: may(81, 'uf'),
  },
  [
    // Before 1.1.4 one of the always-empty columns 20 to 22 is not there;
    // the rows cannot say which, and nothing reads any of the three.
    // 1.0.0 and 1.0.1
    {
      format:
        'uuukuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuffuffuuuufuuuuuuuuuuuuukuuuuuuuufuuuuuuuuuuuuuuuusuuuusuu',
      edits: [OLD_ITEMS, { lacks: 105, count: 8 }],
    },
    // 1.0.3
    {
      format:
        'uuukuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuffuffuuuufuuuuuuuuuuuuukuuuuuuuufuuuuuuuuuuuuuuuusuuuusuuu',
      edits: [OLD_ITEMS, { lacks: 105, count: 8 }, { addsBefore: 113 }],
    },
    // 1.1.0 and 1.1.1
    {
      format:
        'uuukuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuffuffuuuufuuuuuuuuuuuuukuuuuuuuufuuuuuuuuuuuuuuuusuuuusuuuuuuu',
      edits: [OLD_ITEMS, { lacks: 109, count: 4 }, { addsBefore: 113 }],
    },
    // 2.2.0
    {
      format:
        'uuukuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuffuffuuuufuuuuuuuuuuuuukuuuuuuuufuuuuuuuuuuuuuuuusuuuusuuuuuuuuuus',
      edits: [{ addsBefore: 113 }],
    },
    // 2.5.0
    {
      format:
        'uuukuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuffuffuuuufuuuuuuuuuuuuukuuuuuuuufuuuuuuuuuuuuuuuusuuuusuuuuuuuuuusuuuu',
      edits: [{ addsBefore: 113, count: 5 }],
    },
    // 4.2.21
    {
      format:
        'uuukuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuffuffuuuufuuuuuuuuuuuuukuuuuuuuufuuuuuuuuuuuuuuuusuuuusuuuuuuuuuusuuuuuufsusssuuuuuuuuuu',
      edits: [{ addsBefore: 113, count: 23 }],
    },
  ],
);

export const itemDisplayLayout = defineLayout('itemdisplayinfo', 'uuussssuuu', {
  /** After the two models and their textures. */
  icon: may(5, 's'),
});

export const raceLayout = defineLayout('character_race', 'uuuuuuu', {
  id: may(0, 'uk'),
  maleDisplay: may(3, 'u'),
  femaleDisplay: may(4, 'u'),
  nameString: may(5, 'u'),
});

export const classLayout = defineLayout('character_class', 'uuuuuuuu', {
  id: may(0, 'uk'),
  /** Its three trees; 0 for none. */
  trees: run([3, 4, 5], 'u'),
});

const SPREAD_RANKS = [
  { addsBefore: 10, count: 4 },
  { addsBefore: 11, count: 4 },
  { addsBefore: 12, count: 4 },
  { addsBefore: 13, count: 4 },
  { addsBefore: 14, count: 4 },
] as const;

export const talentLayout = defineLayout(
  'spell_talent',
  'uuuuuuuuuuuuuusu',
  {
    id: may(0, 'uk'),
    tier: may(1, 'u'),
    column: may(2, 'u'),
    tree: may(3, 'u'),
    requires: may(4, 'u'),
    after: may(5, 'u'),
    ranks: may(8, 'u'),
    /** The spell each rank teaches; unused ranks are 0. */
    spells: run([9, 10, 11, 12, 13], 'u'),
    icon: may(14, 's'),
    says: may(15, 'u'),
  },
  [
    // 1.1.5: ranks spread as in 2.2.0, with a shorter tail
    {
      format: 'uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuusuuu',
      edits: [...SPREAD_RANKS, { addsBefore: 16, count: 2 }],
    },
    // 2.2.0 on: each rank's spell is followed by four columns of its own
    {
      format: 'uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuusuuuuuuu',
      edits: [...SPREAD_RANKS, { addsBefore: 16, count: 6 }],
    },
  ],
);

export const storageUpgradeLayout = defineLayout(
  'storage_upgrade',
  'uuuuuuu',
  {
    storage: may(1, 'u'),
    /** Capacity granted. */
    slots: may(2, 'u'),
    currency: may(3, 'u'),
    price: may(4, 'u'),
    item: may(5, 'u'),
    /** Capacity required. */
    requires: may(6, 'u'),
  },
  [
    // 2.5.0 on
    { format: 'uuuuuuuu', edits: [{ addsBefore: 2 }] },
  ],
);

export const teleportLayout = defineLayout('teleport_spot', 'usuffffu', {
  id: may(0, 'uk'),
  name: may(1, 's'),
  map: may(2, 'u'),
  x: may(3, 'f'),
  y: may(4, 'f'),
  z: may(5, 'f'),
  orientation: may(6, 'f'),
  type: may(7, 'u'),
});

export const busRouteLayout = defineLayout(
  't_bus_route',
  'uuuuu',
  { from: may(1, 'u'), to: may(2, 'u'), price: may(3, 'u') },
  [
    // 1.0.3 to 1.1.1
    { format: 'uuuu', edits: [{ lacks: 4 }] },
    // 4.2.21
    { format: 'uuuuuu', edits: [{ addsBefore: 5 }] },
  ],
);

/** Every layout, by the name its columns are read under. */
export const TABLE_LAYOUTS = {
  mapInfo: mapInfoLayout,
  zones: zoneLayout,
  staticSpawns: staticSpawnLayout,
  staticProto: staticProtoLayout,
  staticDisplay: staticDisplayLayout,
  creatureSpawns: creatureSpawnLayout,
  creatureAppearance: creatureAppearanceLayout,
  creatureDisplay: creatureDisplayLayout,
  creatureModel: creatureModelLayout,
  creatureProto: creatureProtoLayout,
  chatMenu: chatMenuLayout,
  mounts: mountLayout,
  sounds: soundLayout,
  soundBanks: soundBankLayout,
  battleMusic: battleMusicLayout,
  soundSets: soundSetLayout,
  spellVisuals: spellVisualLayout,
  spellVisualStates: spellVisualStateLayout,
  spellVisualEffects: spellVisualEffectLayout,
  animations: animationLayout,
  spells: spellLayout,
  spellEffects: spellEffectLayout,
  skillSets: skillSetLayout,
  items: itemLayout,
  itemDisplay: itemDisplayLayout,
  races: raceLayout,
  classes: classLayout,
  talents: talentLayout,
  storageUpgrades: storageUpgradeLayout,
  teleports: teleportLayout,
  busRoutes: busRouteLayout,
} as const;

export type TableColumns = {
  readonly [K in keyof typeof TABLE_LAYOUTS]: Resolved<(typeof TABLE_LAYOUTS)[K]['columns']>;
};
