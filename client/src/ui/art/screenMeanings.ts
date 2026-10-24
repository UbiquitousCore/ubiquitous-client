/**
 * What the parts of each worn screen mean to us, by the names the player's
 * movie gives them. Meanings were decided by drawing each dialog and reading
 * its layout; blank captions get our own words. What the movie settles alone
 * is left to `dialogShape`. A name the mounted movie lacks makes the screen
 * fall back; `screenSpecPacks.test.ts` checks them against real builds.
 */

import { ITEM_CLASS, ITEM_QUALITY, qualityName } from '../items';
import { MOVIE_TEXT } from './screenSpecs';
import type { ScreenMeaning } from './screenSpecs';

/** What the market's quality dropdown offers, and what each choice narrows to. */
const QUALITIES = [
  ITEM_QUALITY.poor,
  ITEM_QUALITY.common,
  ITEM_QUALITY.fine,
  ITEM_QUALITY.rare,
  ITEM_QUALITY.epic,
  ITEM_QUALITY.artifact,
] as const;

/** What the market's type dropdown offers, in our own words, by the server's class. */
const KINDS: ReadonlyArray<readonly [string, number]> = [
  ['Weapon', ITEM_CLASS.weapon],
  ['Armour', ITEM_CLASS.armour],
  ['Consumable', ITEM_CLASS.consumable],
  ['Gem', ITEM_CLASS.gem],
  ['Container', ITEM_CLASS.container],
  ['Projectile', ITEM_CLASS.projectile],
  ['Quest', ITEM_CLASS.quest],
];

/** The region map's twenty place slots, all hidden; the screen draws one per place. */
const ZONE_SLOTS = Array.from(
  { length: 20 },
  (_, slot) => `zoneindicator${String(slot + 1).padStart(2, '0')}`,
);

/** What each chat channel is called, by our own name for it. */
const CHANNEL_CALLS = {
  say: '@417?~a2780a89b34c4cad~5',
  general: '@421?~9c436708c02d909c~5',
  trade: '@423?~51366e59e8ff3e55~5',
  party: '@419?~a2fd7d0ca7c0aab8~4',
  whisper: '@424?~ee925beddf4aeb01~7',
  emote: '@425?~cf15afebc958750f~10',
};

/** Each class's word, by the server's class number counted from one. */
const CLASSES = [
  '@389?~59596f09606f05dd~7',
  '@390?~e1a8d8c3ee547ecf~4',
  '@391?~8867dfe073cffabc~6',
  '@392?~ee86e81e400e8a2a~4',
];

/** `count` entries of the build's words, counting along from `first`. */
const run = (first: string, count: number): string[] =>
  Array.from({ length: count }, (_, at) => `${first}#${at}`);

/** A card's words from the build, by an item row's numbers; which run is which is our reading of the items. */
const CARD_WORDS: Pick<ScreenMeaning, 'names' | 'stats' | 'shape' | 'formats'> = {
  names: {
    // By item class, from the first.
    classes: run('@107?~021276924408fef6~10', 15),
    // By where it is worn: nothing for a thing not worn at all. The build
    // names no place past the ranged weapon's.
    worn: ['', ...run('@18?~32694bc355ff273f~4', 22)],
    binds: run('@95?~cafffafcd8e45548~13', 5),
    // Only the kinds whose place in the run is plain from the items.
    subClasses: {
      '2': [
        ...run('@141?~275352966e714d62~5', 5),
        '',
        '',
        '',
        ...run('@147?~275352966e714d62~5', 5),
        '',
        '',
        '',
        ...run('@153?~73c682eb352a0587~3', 2),
      ],
      '4': run('@167?~548f0777d718b533~13', 7),
    },
    // Physical, then fire, frost, holy, shadow, poison and energy; the
    // run carries a second plain one, which is passed over.
    damageTypes: [0, 2, 3, 4, 5, 6, 7].map(at => `@274?~8c242b73015aba3f~12#${at}`),
    allowed: Object.fromEntries(CLASSES.map((word, at) => [String(at + 1), word])),
  },
  // Gift kinds from the first plain gift to the last resistance run in step
  // with their sentences; the last three are a run of their own.
  stats: {
    ...Object.fromEntries(
      Array.from({ length: 50 }, (_, at) => [String(9 + at), `@215?~3b40531264bfaf06~9#${at}`]),
    ),
    ...Object.fromEntries(
      Array.from({ length: 3 }, (_, at) => [String(59 + at), `@273?~cb311ff2c5feaee6~26#${at}`]),
    ),
  },
  shape: {
    // Armour, as the item classes number it.
    armourClass: 4,
    // Mana, health and the four attributes are written plainly.
    plainKinds: [9, 10, 11, 12, 13, 14],
    // The kinds that add to armour and to what is blocked.
    armour: 24,
    block: 21,
  },
  formats: {
    equippedTitle: '@16?~564d7d9e1f5074e2~18',
    armour: '@293?~69c998f331c66487~8',
    speed: '@287?~0f3906901da43f6c~10',
    dps: '@288?~95463bbc3eb9ba10~24',
    level: '@284?~c78455245a86cb50~17',
    levelPrefix: '@285?~9b8caa55d6386a99~8',
    levelValue: '@286?~c4dd8e861f6d5ba2~8',
    allowedPrefix: '@49?~412c0cc2e086839e~15',
    blockValue: 'Block value: %d',
  },
};

/** Run-on marks and bar, shown only while a card's words run past its foot. */
const CARD_RUNS_ON: Pick<ScreenMeaning, 'marks' | 'panels'> = {
  marks: { above: 'lineTop', below: 'lineBottom' },
  panels: { bar: 'scrollBar' },
};

/** The choice that narrows nothing. */
const ANY = 'All';

export const SCREEN_MEANINGS: Readonly<Record<string, ScreenMeaning>> = {
  // The screens before the world, out of the movie they are kept in.
  signIn: {
    dialog: 'login_panel',
    movie: 'LGM',
    edits: {
      btnAccount: { holds: 'account' },
      btnPassword: { holds: 'password' },
    },
    values: { account: 'inputAccount', password: 'inputPassword' },
    // The "i" is the build's information button, which is what opens the
    // about page. Remembering keeps the account name, never the password.
    actions: { btnLogin: 'signIn', btnInformation: 'about', btnRemember: 'remember' },
    captions: {
      textAccount: '@302?~294fc75c3a18b018~7',
      textPassword: '@303?~364b5f184af689fc~8',
      textRemember: '@304?~0b1300dcdf02ccb8~11',
    },
    // The cross that says remembering is on. It has one face, so it is
    // shown or hidden rather than switched.
    panels: { remembered: 'radioRemember' },
    // Other ways in, other servers, other games and settings before signing
    // in are the build's and not this client's.
    hidden: [
      'btnGLLive',
      'btnMoreGame',
      'btnMoreGameGreen',
      'textMoreGame',
      'btnselectserver',
      'textselectserver',
      'btnserverannounce',
      'textserverannounce',
      'btnCreateAccount',
      'textCreateAccount',
      'btnRetrievePassword',
      'textRetrievePassword',
      'btnOption',
      'textOption',
      'textVersion',
      'textGameName',
    ],
  },

  about: {
    dialog: 'dlgAbout',
    movie: 'LGM',
    frame: 'panelBg',
    values: { title: 'panelBg/textTitle', body: 'text' },
    actions: { 'panelBg/btnClose': 'close' },
    hidden: ['btnScroll'],
  },

  characters: {
    dialog: 'create_group',
    movie: 'LGM',
    grids: { characters: { slot: 'playerbutton' } },
    values: { name: 'textname', level: 'roleinfo/level', expBar: 'roleinfo/expbar' },
    actions: { btnEnter: 'enter', btnLogout: 'signOut', btnDelete: 'delete' },
    // The shop, the list of servers and turning the body are the
    // build's and not yet this client's.
    hidden: [
      'btnleft',
      'btnright',
      'btnstore',
      'btnServerslist',
      'textServerslist',
      'Subscribe',
      'createtip',
      'pluslastlock',
      'roleinfo/btnserver',
      'roleinfo/textserver',
      'roleinfo/textclass',
      'roleinfo/exp',
    ],
  },

  // Waiting on the server, before the world: the build's "connecting" box.
  connecting: {
    dialog: 'connect_panel',
    movie: 'LGM',
    actions: { btnCancel: 'cancel' },
    captions: { textConnect: '@310?~666ad1e3c4eb2907~13', textCancel: 'Cancel' },
  },

  // The build's message box with one button, for what the server answers.
  // The movie lays its two buttons out for a question, so the one that is
  // kept (`btnYes`) is drawn on its own, in the middle.
  notice: {
    dialog: 'dlgMsg',
    movie: 'LGM',
    frame: 'background',
    values: { message: 'textMsg' },
    panels: { sheet: 'btnempty' },
    actions: { btnYes: 'confirm' },
    hidden: ['btnNo', 'textNo', 'btnRight', 'btnMsgInfo'],
  },

  deleteCharacter: {
    dialog: 'dlgMsg',
    frame: 'background',
    values: { message: 'textMsg' },
    panels: { sheet: 'btnempty' },
    actions: { btnYes: 'confirm', btnNo: 'cancel' },
    captions: { textYes: 'Yes', textNo: 'No' },
    words: { prompt: '@513?~b2805712872ee786~24' },
    hidden: ['btnRight', 'btnMsgInfo'],
  },

  race: {
    dialog: 'races_group',
    movie: 'LGM',
    grids: { races: { slot: 'btnraceselect' } },
    actions: { btnmale: 'male', btnfemale: 'female', btnBack: 'back', btnNext: 'next' },
    values: { raceName: 'desc_info/classinfo1', about: 'desc_info/desc_text' },
    panels: { emblem: 'desc_info/displaycallback' },
    // The title sits in the wide band across the top; the boxed strip
    // under it is a field of its own.
    captions: { textSelect: '@595?~9f7db0b9c3c828c5~16' },
    words: {
      'race:0': '@730?~6b2434f37ef32627~18',
      'race:1': '@731?~28b86f1f412496d3~15',
      'race:2': '@732?~3c35e23e145c34e2~22',
      'race:3': '@733?~57a30850247af1c4~25',
    },
    hidden: ['btnleft', 'btnright'],
  },

  class: {
    dialog: 'class_group',
    movie: 'LGM',
    // By the server's class numbers: warrior, mage, ranger, monk.
    actions: {
      btnWarrior: 'class:1',
      btnMage: 'class:2',
      btnRanger: 'class:3',
      btnMonk: 'class:4',
      btnBack: 'back',
      btnNext: 'next',
    },
    unavailable: {
      'class:1': 'coverWA',
      'class:2': 'coverMG',
      'class:3': 'coverHT',
      'class:4': 'coverPR',
    },
    values: { className: 'desc_info/classinfo1', about: 'desc_info/desc_text' },
    panels: { emblem: 'desc_info/displaycallback' },
    pictures: {
      'class:1': ['text/ui_login_warrior.png'],
      'class:2': ['text/ui_login_mage.png'],
      'class:3': ['text/ui_login_ranger.png'],
      'class:4': ['text/ui_login_monk.png'],
    },
    calls: {
      'class:1': '@389?~59596f09606f05dd~7',
      'class:2': '@390?~e1a8d8c3ee547ecf~4',
      'class:3': '@391?~8867dfe073cffabc~6',
      'class:4': '@392?~ee86e81e400e8a2a~4',
    },
    words: {
      'class:1': '@734?~23c3423366a78cd7~19',
      'class:2': '@735?~3cf09e8dfaec5509~20',
      'class:3': '@736?~341453ce2c973a9a~21',
      'class:4': '@737?~e96bfb4b6508fbdf~16',
    },
    // In the band across the top, as on the race step.
    captions: { textSelect: '@596?~982ff5d4b9661a20~17' },
  },

  look: {
    dialog: 'prop_select',
    movie: 'LGM',
    actions: {
      btnSkincolor: 'skin',
      btnHairstyle: 'hairStyle',
      btnHaircolor: 'hairColour',
      btnFace: 'face',
      btnRandom: 'random',
      btnBack: 'back',
      btnNext: 'next',
    },
    captions: {
      title: '@597?~0b426a9ec8505a02~20',
      Skincolortext: '@399?~f3140a1fa17f5203~10',
      Hairstyletext: '@400?~52142b9c71764648~10',
      Haircolortext: '@401?~02d144bab6bf87b6~10',
      Facetext: '@404?~116b77dcdb182cd0~4',
    },
    // A body here has four things to choose; the fifth row is the build's.
    hidden: ['btnFaceFeature', 'FaceFeaturetext'],
  },

  name: {
    dialog: 'input_name_panel',
    movie: 'LGM',
    edits: { btnInput: { holds: 'name' } },
    values: { name: 'textInput' },
    actions: { btnBack: 'back', btnFinish: 'finish' },
    captions: { textInputtitle: '@324?~d5c3eb59075ebc35~15' },
  },

  // Always on screen in play.
  menu: {
    dialog: 'MCToolBar',
    panels: { bar: 'btnempty' },
    menu: [
      { icon: 'bagicon', screen: 'bag', says: '@585?~63b75f31d5356475~3' },
      { icon: 'charactericon', screen: 'character', says: '@586?~8b3aa710720dc22c~9' },
      { icon: 'questsicon', screen: 'quests', says: '@587?~c1b657cafbfcc5ce~6' },
      { icon: 'spellsicon', screen: 'spells', says: '@588?~74f5d6ce7806cf72~6' },
      { icon: 'socialicon', screen: 'social', says: '@589?~b2ecd6d2a6a18266~6' },
      { icon: 'teamicon', screen: 'team', says: '@590?~a2fd7d0ca7c0aab8~4' },
      { icon: 'optionicon', screen: 'options', says: '@591?~ef286ca530d82da1~7' },
    ],
    // The shop and the lottery are not this client's, and the hints are
    // the build's first-run tour.
    hidden: ['btnLotto', 'btnstore', 'animBagTip', 'animCloseTip', 'animQuestTip', 'animSpellTip'],
  },

  topbarMenu: {
    dialog: 'dlgTopBar',
    // The eight places on the toolbar, in the order they are filled.
    actions: Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].map(at => [`panelToolBar/group/btn0${at}`, `action${at}`]),
    ),
    groups: { badge: 'targetclass', banner: 'panelName' },
    values: { name: 'panelName/textName' },
    // Each action's picture is a whole button, frame and all; drawn over
    // the panel behind them it would sit in a box.
    hidden: [
      'panelToolBar/background',
      'panelToolBar/sideLarge',
      'panelToolBar/sideSmall',
      'panelToolBar/sideTop',
      'btnextend',
    ],
  },

  playerFrame: {
    dialog: 'hud',
    // The art behind the ring for every class; some builds put the warrior
    // and ranger meters round the outside.
    frame: ['heroiconback', 'btnCharFace', 'MCRageBar', 'MCPowerBar'],
    bars: {
      of: {
        health: 'btnCharFace/MCHpBar',
        mana: 'btnCharFace/MCMpBar',
        exp: 'btnCharFace/exp',
      },
    },
    groups: {
      portrait: 'btnCharFace/displayCallback',
      combat: 'animCombatMC',
      // The corner ornament: the first outline of the art behind the ring.
      ornament: 'heroiconback@2#1',
      // A meter's own two larger ornaments, never drawn (every class wears the corner's). Space-separated.
      moraleOrnaments: 'MCRageBar@1 MCRageBar/anim@2#2',
      vigorOrnaments: 'MCPowerBar@1 MCPowerBar/anim@3#2',
      morale: 'MCRageBar',
      vigor: 'MCPowerBar',
      fill: 'anim',
      fillBeyond: 'anim',
      pip1: 'rage1',
      pip2: 'rage2',
      pip3: 'rage3',
      pip4: 'rage4',
      // The sealed letter beside the ring while letters wait unread.
      newLetter: 'btnnewletter',
    },
    values: { level: 'btnCharFace/MClv' },
    // The signal marks and the ring lit round a picked portrait.
    hidden: ['btnCharFace/network', 'btnCharFace/ping', 'btnCharFace/selected'],
  },

  targetFrame: {
    dialog: 'hud',
    frame: 'btnTarget',
    bars: {
      of: {
        health: 'btnTarget/targetHP',
        mana: 'btnTarget/targetMP',
        morale: 'btnTarget/targetRage',
        vigor: 'btnTarget/targetPower',
      },
      // How far the target's cast has gone, on a run of faces of its own.
      own: { cast: 'btnTarget/targetprocessbar' },
      // The health clip fills red, then green, then yellow: the colours a
      // hostile, a friendly and a neutral body are marked in.
      runsFor: { health: ['hostile', 'friendly', 'neutral'] },
    },
    groups: {
      portrait: 'btnTarget/displayCallback',
      dead: 'targetDead',
      combat: 'animCombatTarget',
    },
    values: { level: 'btnTarget/targetLv' },
    // The switch the movie stands beside the ring, worn for a creature.
    pieces: { switch: { part: 'btnChangetarget' } },
    // The ring lit round a picked portrait.
    hidden: ['btnTarget/selected'],
  },

  // The bar a cast runs in: a clip of its own on the stage, full at its
  // first face and empty at its last.
  castBar: {
    dialog: 'process',
    bars: { of: { cast: 'process' } },
  },

  // The right-edge bar: twelve slots two across, a mount slot and a handle;
  // its two-face clip offers to open or to close.
  spellBar: {
    dialog: 'dlgShortcutBar',
    frame: ['btnempty', 'MountSkill', 'panelButton', 'btnOpen'],
    grids: { slots: { slot: 'btn', within: 'panelButton' } },
    // What lies inside each slot, and what lies beside it.
    groups: {
      mount: 'MountSkill/btnMountSkill',
      sweep: 'rectcooldown',
      unusable: 'redmask',
      short: 'bluemask',
      lit: 'hot',
      resting: 'beforeAttack',
      flash: 'cooldownFinish',
      // The control that opens the bar. The face where the bar is out has
      // another in its place, the only control of the dialog not named here.
      handle: 'btnOpen',
    },
    // The clip a cooldown sweeps through, and the clip played when it ends.
    bars: { of: { sweep: 'rectcooldown' }, own: { flash: 'panelButton/cooldownFinish01' } },
  },

  // The spell ring in the jump button's corner: twelve slots with sweeps,
  // and per-slot disc, swirl, press glow and cooldown flash. Mostly off-screen.
  spellWheel: {
    dialog: 'buttonSwitch',
    frame: 'spellpanel',
    grids: { slots: { slot: 'skill', within: 'spellpanel' } },
    groups: {
      sweep: 'cooldown',
      effects: 'effect',
      flash: 'cooldownFinish',
      glow: 'autoAttack',
    },
    bars: { of: { sweep: 'cooldown' }, own: { flash: 'spellpanel/effect01/cooldownFinish' } },
    // The first-run tip's pulse.
    hidden: ['btnSpellTip'],
  },

  // The button that jumps, in the corner under the spell bar: a clip of two
  // faces, the second the one it wears while pressed.
  jumpButton: {
    dialog: 'hud',
    frame: 'animJump',
    groups: { face: 'animJump' },
  },

  // The minimap ring; the screen draws the arrow and markers, and the movie
  // leaves the compass letters blank.
  minimap: {
    dialog: 'btnShowMap',
    frame: 'minimapbackground',
    hidden: ['arrow', 'btnsmalldir', 'displaycallback', 'mapindicator'],
    groups: {
      player: 'arrow',
      north: 'minimapbackground/N',
      east: 'minimapbackground/E',
      south: 'minimapbackground/S',
      west: 'minimapbackground/W',
    },
    pieces: {
      quest: { part: 'mapindicator/questarrow01' },
      // The HUD's own control that folds the ring away and back.
      toggle: { dialog: 'hud', part: 'btnminimapcontrol' },
    },
  },

  // The region map: the movie's frame over the region's picture; places,
  // the player's arrow and quest marks are parked parts placed one by one.
  areaMap: {
    dialog: 'holemap',
    frame: 'btnscroll',
    hidden: [
      'arrow',
      'btnLotto',
      'displayCallback',
      'mapindicator',
      'scroll',
      'team01',
      'team02',
      'team03',
      'zonepage/btnleft',
      'zonepage/btnright',
      'zonepage/dissplaycallback',
      ...ZONE_SLOTS,
    ],
    values: { title: 'horititle/areaname', place: 'zonepage/text' },
    actions: {
      btntoworldmap: 'world',
      btnup: 'up',
      btndown: 'down',
      btnleft: 'left',
      btnright: 'right',
    },
    groups: { player: 'arrow', names: 'zonepage/btnobserver', banner: 'horititle' },
    pieces: {
      quest: { part: 'mapindicator/questreceive01' },
    },
  },

  // The world map: clear press areas per region; the way out is the region map's button.
  worldMap: {
    dialog: 'dlgworldmap',
    frame: 'btnscroll',
    close: 'btnclose',
    hidden: ['btnLotto', 'displayCallback', 'mask'],
    groups: { regions: 'scroll' },
    values: { regionName: 'scroll/btn01/text' },
    pieces: { back: { dialog: 'holemap', part: 'btnClose' } },
  },

  teamFrames: {
    dialog: 'dlgteam',
    frame: 'namearea',
    groups: {
      member1: 'namearea/player1',
      member2: 'namearea/player2',
      member3: 'namearea/player3',
      away1: 'namearea/grayplayer1',
      away2: 'namearea/grayplayer2',
      away3: 'namearea/grayplayer3',
      leader: 'leadericon',
    },
    // By the name each row gives it.
    bars: { of: { health: 'hp', mana: 'mp', vigor: 'power', morale: 'rage' } },
    values: { name: 'name' },
    actions: { btnplayer: 'select' },
    // What a member can be asked to do is the team window's.
    hidden: ['operation', 'leadericon', 'leadericon2'],
  },

  chat: {
    dialog: 'DlgChatControl',
    frame: ['lockedDisplayLine', 'btnClose'],
    values: { body: 'text' },
    pieces: {
      show: { dialog: 'hud', part: 'iconChat' },
      channel: { part: 'btnExpand', without: ['text'] },
      more: { part: 'btnExpand', without: ['text'] },
      emote: { part: 'btnExpand', without: ['text'] },
    },
    calls: CHANNEL_CALLS,
    words: { more: 'More', again: '@1533?~d99ba82a5f610c76~6' },
    // The strip of channel shortcuts is the build's; this client offers
    // its channels from the one control.
    hidden: [
      'panelCh',
      'panelExp',
      'btnExpand',
      'lockedDisplayLine',
      // The face the round control beside the log wears while it cannot
      // be pressed; here it always can.
      'btnClose/maskOff',
    ],
  },

  chatSay: { dialog: 'DlgChatControl', calls: CHANNEL_CALLS },

  // Words over a head stand in the same plain box as the latest lines
  // along the bottom, written in the colour that box writes them in.
  chatSaid: {
    dialog: 'DlgChatText',
    frame: 'background',
    hidden: ['bgName', 'textName', 'textSpeak'],
    toneOf: { say: 'DlgChatText/textChat' },
  },

  chatPeek: {
    dialog: 'DlgChatText',
    frame: 'background',
    values: { body: 'textChat' },
    // The name strip is for one speaker; this box holds everyone's.
    hidden: ['bgName', 'textName', 'textSpeak'],
  },

  // The character sheet and the cards that describe things.
  character: {
    dialog: 'dlgcharacter',
    frame: 'btnempty',
    // Our names for the pages are the movie's own names for them, which
    // is how the sheet leaves out the one that is not open.
    tabs: [
      {
        control: 'btnPage1',
        panel: 'equip',
        text: 'textPage1',
        caption: '@342?~ce7228f7665c0ad3~9',
      },
      {
        control: 'btnPage2',
        panel: 'property',
        text: 'textPage2',
        caption: '@343?~e1ffdb948ac9f998~10',
      },
    ],
    panels: {
      equipment: 'equip',
      attributes: 'property',
      // The attribute page's own pages, side by side on one strip that
      // slides under a window; a dot under the window for each.
      strip: 'property/info/scroll',
      window: 'property/info/mask',
    },
    sides: [0, 1, 2, 3, 4, 5].map(page => ({
      control: `property/group${page}`,
      panel: `property/info/scroll/page${page}`,
      caption: [
        '',
        '@328?~0535023d6429d6d1~5',
        '@347?~c704a419116a3305~12',
        '@353?~d864baa2a1ac621e~12',
        '@356?~e6875533c62fa44f~12',
        '@360?~761a8c53861c2eef~7',
      ][page]!,
    })),
    captions: {
      textPage1: '@342?~ce7228f7665c0ad3~9',
      textPage2: '@343?~e1ffdb948ac9f998~10',
      'page2/meleetitle': '@347?~c704a419116a3305~12',
      'page2/meleedpsall': '@367?~aabb163da09a9ce1~17',
      'page2/meleemainhand': '@368?~e89207c90d7e9205~10',
      'page2/meleeoffhand': '@369?~89b27fdbaafde6df~9',
      'page2/meleeattackpower': '@370?~d1163e66d1022942~13',
      'page2/meleehitchance': '@371?~0b8fc44427dc99b8~11',
      'page2/meleecriticalchance': '@372?~f1f3e7da31e6092e~16',
      'page3/rangedtitle': '@353?~d864baa2a1ac621e~12',
      'page3/rangeddpsall': '@367?~aabb163da09a9ce1~17',
      'page3/rangeddamage': '@373?~41518b1b1fe3a90f~14',
      'page3/rangedrange': '@352?~d06851381e20e8d4~6',
      'page3/rangedattackpower': '@370?~d1163e66d1022942~13',
      'page3/rangedhitchance': '@371?~0b8fc44427dc99b8~11',
      'page3/rangedcriticalchance': '@372?~f1f3e7da31e6092e~16',
      'page4/spelltitle': '@356?~e6875533c62fa44f~12',
      'page4/spelldamagebonus': '@374?~496e1252f0781cd6~12',
      'page4/spellhealingpower': '@375?~69f449260f07b1ca~14',
      'page4/spellhitchance': '@371?~0b8fc44427dc99b8~11',
      'page4/spellcriticalchance': '@372?~f1f3e7da31e6092e~16',
      'page5/defensetitle': '@360?~761a8c53861c2eef~7',
      'page5/scroll/txtResilience': '@1590?~3c05f902cbab0796~11',
      'page5/scroll/arm': '@111?~f84984d46dc495e8~5',
      'page5/scroll/defensetype': '@379?~fc46ed03f9ce2f37~20',
      'page5/scroll/defensedodgechance': '@376?~caa0ef5271b9864e~13',
      'page5/scroll/defenseparrychance': '@377?~2d37ffffe1dd8503~13',
      'page5/scroll/defenseblockchance': '@378?~4f8357ec0ecb5bb8~13',
      'page5/scroll/blockvalue': '@1550?~596bf5875364c4d3~12',
      'page5/scroll/defenseresistance': '@388?~15b727002113ddcc~10',
    },
    grids: {
      equipment: {
        slot: 'btn',
        within: 'equip',
        driven: true,
        // Numbered head to ranged in the movie's order; `holds` maps to the server's sixteen slots.
        numbered: true,
        holds: [
          'Head',
          'Neck',
          'Shoulders',
          'Shirt',
          'Chest',
          'Legs',
          'Feet',
          'Hands',
          'Ring 1',
          'Ring 2',
          'Trinket 1',
          'Trinket 2',
          'Back',
          'Main hand',
          'Off hand',
          'Ranged',
        ],
        face: 'displayCallback',
        size: { w: 26, h: 26 },
        // Empty-place outlines in the movie's order; rings and trinkets share one, the back wears the cloak's.
        empty: {
          icons: [
            'head',
            'neck',
            'shoulder',
            'shirt',
            'check',
            'leg',
            'foot',
            'hand',
            'ring',
            'ring',
            'acc',
            'acc',
            'rope',
            'main',
            'slaver',
            'ranged',
          ].map(place => `item/icon_static_${place}.png`),
          size: 26,
        },
      },
    },
    groups: { body: 'equip/btnmodel' },
    values: {
      class: 'page1/roleclass',
      level: 'page1/level',
      exp: 'page1/exp',
      // The character's own name heads the page.
      name: 'page1/pagetitle',
      health: 'page1/hp',
      mana: 'page1/mp',
      // Each attribute's name, and its figure beside it.
      strengthName: 'page1/str',
      strength: 'page1/strnum',
      staminaName: 'page1/sta',
      stamina: 'page1/stanum',
      agilityName: 'page1/agi',
      agility: 'page1/aginum',
      wisdomName: 'page1/wis',
      wisdom: 'page1/wisnum',
      armor: 'page5/scroll/armnum',
    },
    // The other pages write each figure in the same field as its caption,
    // after the words.
    figures: {
      'page2/meleeattackpower': 'attackPower',
      'page2/meleehitchance': 'hitChance',
      'page2/meleecriticalchance': 'critChance',
      'page3/rangedattackpower': 'attackPower',
      'page3/rangedhitchance': 'hitChance',
      'page3/rangedcriticalchance': 'critChance',
      'page4/spelldamagebonus': 'spellPower',
      'page4/spellhealingpower': 'healingPower',
      'page4/spellhitchance': 'spellHitChance',
      'page4/spellcriticalchance': 'spellCritChance',
      'page5/scroll/defensetype': 'armorMitigation',
      'page5/scroll/defensedodgechance': 'dodgeChance',
      'page5/scroll/defenseparrychance': 'parryChance',
      'page5/scroll/defenseblockchance': 'blockChance',
    },
    // A raised figure (gear, buff, talent) in the parchment green.
    tones: { raised: 'var(--color-ink-success)' },
    bars: {
      of: {
        exp: 'page1/basicexpact',
        health: 'page1/basichpact',
        mana: 'page1/basicmpact',
        // The same place again, in the colour of each other thing a
        // class spends.
        morale: 'page1/basicrageact',
        vigor: 'page1/basicpoweract',
      },
    },
    formats: {
      level: '@330?~c26b4fded0549cfa~9',
      exp: '@331?~72a68728a16529fc~3',
      health: '@332?~513ad265325e9bf9~2',
      mana: '@335?~532e099873c0eba4~2',
      morale: '@336?~88e8f7bfacdcadab~6',
      vigor: '@337?~31fd524436116c58~5',
      strength: '@338?~e07a18b0a77050cc~8',
      stamina: '@339?~e6f7dd36428c12d2~7',
      agility: '@340?~bb90b938518b04f4~7',
      wisdom: '@341?~2e0e79e6861c805a~6',
    },
    // A word per class and body, in that order: the build has one word
    // per class, and both bodies wear it.
    names: {
      classes: CLASSES.flatMap(word => [word, word]),
    },
    // Figures the wire never sends are left off; attributes and armour show
    // once sent, never for somebody else.
    hidden: [
      'page1/hprestore',
      'page1/mprestore',
      ...['str', 'sta', 'agi', 'wis', 'spd'].flatMap(stat => [`page1/${stat}`, `page1/${stat}num`]),
      // The other pages' figures: unsent, so left empty rather than sample numbers.
      'page0/pagetitle',
      'page0/scroll',
      'page0/top',
      'page0/bottom',
      'page2/meleeaddmainhand',
      'page2/meleeaddoffhand',
      'page2/meleehitchanceact',
      'page2/meleecriticalchanceact',
      'page3/rangedadd',
      'page3/rangedhitchanceact',
      'page3/rangedcriticalchanceact',
      ...['arcane', 'dark', 'fire', 'holy', 'ice', 'nature'].map(
        kind => `page4/defenseres${kind}num`,
      ),
      'page4/spellhitchanceact',
      'page4/spellcriticalchanceact',
      'page5/top',
      'page5/bottom',
      'page5/scroll/armnum',
      'page5/scroll/barResilienceChance',
      'page5/scroll/txtResilience_num',
      'page5/scroll/txtResilienceChance',
      'page5/scroll/blockvaluenum',
      'page5/scroll/defensedodgechanceact',
      'page5/scroll/defenseparrychanceact',
      'page5/scroll/defenseblockchanceact',
      'page5/scroll/defensephysicalchanceact',
      ...['arcane', 'dark', 'fire', 'holy', 'ice', 'nature'].map(
        kind => `page5/scroll/defenseres${kind}num`,
      ),
    ],
  },

  held: {
    dialog: 'dlgItemInfo',
    // The card's backdrop and the strip of controls along its foot; some
    // builds draw a border under the strip as well.
    frame: ['winbackground', 'btnEqu_Use', 'btnequip', 'btnclose'],
    card: {
      title: 'textTitle',
      body: 'group/text',
      compare: 'btnequip',
      // One control puts a thing on, takes it off, uses it or tries it on.
      actions: {
        equip: { control: 'btnEqu_Use', label: 'textEqu_Use', says: '@295?~13886493386c1297~5' },
        unequip: { control: 'btnEqu_Use', label: 'textEqu_Use', says: '@296?~9dc2a6ba7a449246~7' },
        use: { control: 'btnEqu_Use', label: 'textEqu_Use', says: '@294?~5791c4f4ce83e388~3' },
        tryOn: { control: 'btnEqu_Use', label: 'textEqu_Use', says: '@583?~6f3c33a32ccc89bf~6' },
        // Taking one thing out of a letter being read.
        take: { control: 'btnEqu_Use', label: 'textEqu_Use', says: '@692?~9443f47ea8ec450a~7' },
      },
    },
    ...CARD_WORDS,
    ...CARD_RUNS_ON,
    // The name is written once; the card leaves its two spare copies and
    // the first-run hint out.
    hidden: ['animEquipTip', 'e_icon', 'textIndicator', 'textItemEquipped', 'lineIndicator1'],
  },

  equipped: {
    dialog: 'dlgItemInfoHero1',
    frame: 'winbackground',
    card: {
      title: 'textTitle',
      body: 'group/text',
      equipped: 'textItemEquipped',
      equippedLine: 'lineIndicator1',
    },
    ...CARD_WORDS,
    ...CARD_RUNS_ON,
    // A card standing for what is already worn offers nothing.
    hidden: [
      'btnEqu_Use',
      'textEqu_Use',
      'btnequip',
      'btnclose',
      'animEquipTip',
      'e_icon',
      'textIndicator',
    ],
  },

  // The market listing card, and the bag card while the market is up: a
  // fixed price strip and one control that bids, withdraws or lists.
  goods: {
    dialog: 'dlgGoodsDesc',
    card: {
      title: 'textTitle',
      body: 'group/text',
      compare: 'panelDefault/btnCompare',
      actions: {
        // A shop's own strip: one wide control with the price written on it.
        purchase: {
          control: 'panelBuy/group/btnBuy',
          label: 'panelBuy/textbuy',
          says: 'Buy',
          strip: 'panelBuy',
          price: {
            amounts: {
              gold: 'panelBuy/price/textGold',
              silver: 'panelBuy/price/textSilver',
              copper: 'panelBuy/price/textIron',
            },
            coins: {
              gold: 'panelBuy/price/iconGold',
              silver: 'panelBuy/price/iconSilver',
              copper: 'panelBuy/price/iconIron',
            },
          },
        },
        buy: {
          control: 'panelFixedBuy/btn',
          label: 'panelFixedBuy/btn/text1',
          says: '@869?~2b051584f0692d20~10',
          strip: 'panelFixedBuy',
        },
        bid: {
          control: 'panelDefault/panelTryOn/btn',
          label: 'panelDefault/panelTryOn/text',
          says: '@843?~50cac900c55ef4ec~3',
          strip: 'panelDefault',
        },
        withdraw: {
          control: 'panelDefault/panelTryOn/btn',
          label: 'panelDefault/panelTryOn/text',
          says: '@872?~066e9c1b0f721327~6',
          strip: 'panelDefault',
        },
        auction: {
          control: 'panelDefault/panelTryOn/btn',
          label: 'panelDefault/panelTryOn/text',
          says: '@844?~903a8c22857f7c0e~7',
          strip: 'panelDefault',
        },
      },
    },
    ...CARD_WORDS,
    ...CARD_RUNS_ON,
    // The shop's selling strip, the second row and other currencies of its
    // buying strip, the worn-item line and each control's greyed copy.
    hidden: [
      'panelSell',
      'panelBuy/group/btnCompare',
      'panelBuy/group/panelTryOn',
      'panelBuy/group/btnBuy/disable',
      'panelBuy/group/btnBuy/text1',
      'panelBuy/priceBusiness',
      'panelBuy/storestone',
      'textIndicator',
      'lineIndicator',
      'panelFixedBuy/btn/disable',
      'panelDefault/panelTryOn/btn/disable',
    ],
  },

  itemList: {
    dialog: 'dlgitemlist',
    lists: { choices: { row: 'group/element', fields: { name: 'btnPick/text' } } },
    // What is worn in the place pressed, in its own section above the rest.
    grids: { equipped: { slot: 'eleequ/btnItem', one: true, face: 'bluemask' } },
    values: { equipped: 'eleequ/btnPick/text' },
    hidden: ['eleequ/btnPick/selected'],
  },

  talentCard: {
    dialog: 'dlgTalentDesc',
    // The sheet and the controls under it, so the whole card is kept in view.
    frame: ['btnempty', 'btnClose', 'panelAddPoint'],
    card: { title: 'textTitle', body: 'group/text' },
    // Confirm sends every staged point and shows only while one is staged.
    actions: { btnAdd: 'stage', btnSub: 'unstage', btnConfirm: 'confirm' },
    // Unavailable faces; each control's lit mark or panel shows only when usable.
    unavailable: { stage: 'iconAddDis', unstage: 'iconSubDis', confirm: 'btnConfirm/disable' },
    groups: { stage: 'iconAddEn', unstage: 'iconSubEn', confirm: 'panelConfirm' },
    values: { confirm: 'btnConfirm/text1' },
    words: { confirm: '@640?~70daee4fc248182b~7' },
    // The marks and the bar that say the words run on, shown only when
    // they do.
    marks: { above: 'lineTop', below: 'lineBottom' },
    panels: { bar: 'scrollBar' },
    hidden: ['textConfirm'],
  },

  // What one spell is, on the card a row of the spell book opens: its
  // name, four short lines beside its picture, and what it does. Each line
  // has the build's own picture of what it is for drawn beside it.
  spellCard: {
    dialog: 'dlgSpellDesc',
    // The sheet and its close, and not the strip along the foot that
    // carries the cast button this card leaves out.
    frame: ['background', 'btnClose'],
    card: { title: 'textTitle', body: 'group/textDesc' },
    values: {
      cost: 'group/groupIcon/text01',
      range: 'group/groupIcon/text02',
      cast: 'group/groupIcon/text03',
      cooldown: 'group/groupIcon/text04',
    },
    formats: { range: '@352?~d06851381e20e8d4~6' },
    ...CARD_RUNS_ON,
    // The book opens it to be read. Casting is the bar's.
    hidden: ['btnUse', 'textUse', 'bottomside', 'bottomline'],
  },

  fittingRoom: {
    dialog: 'dlgFittingRoom',
    groups: { room: 'btnRoom' },
    actions: { Reset: 'reset' },
    captions: {
      'Reset/text': '@855?~650d33c08afbcf84~5',
      textFittingRoom: '@583?~6f3c33a32ccc89bf~6',
    },
  },

  teamAsk: askBox('@414?~4896ef8f8ad035ab~22'),
  // The build has no words for a vote; its own question before a member is
  // put out is the one the rest of the team is asked.
  voteKickAsk: askBox('@1328?~be7fba62bf4d1f9e~23'),
  tradeAsk: askBox('@764?~1dc94bc5bd3e1bc9~17'),
  duelAsk: askBox('@983?~639dcb5740fb1dcb~16'),
  // The fare quoted for a journey: the place, then the sum, in the two holes.
  travelAsk: askBox('@1346?~ff24bb1403a28a90~30', 'warnning'),
  // Who is summoning, then where to, in the two holes.
  summonAsk: askBox('@1488?~00a5a995a1dd8019~21'),

  // The character window's own screens.
  talents: {
    dialog: 'dlgTalent',
    tabs: [
      { control: 'btnTab01', panel: 'treeOne', text: 'btnTab01/text' },
      { control: 'btnTab02', panel: 'treeTwo', text: 'btnTab02/text' },
    ],
    panels: { tree: 'group', window: 'mask' },
    // Tree names count on from the tree number; the third mage tree's name is
    // the one every build words alike.
    rowsFrom: { treeWords: { quote: '@1213?~376569d8ab3e639c~11', less: 113 } },
    // Each class's own mark for each of its trees, by the server's class
    // numbers: warrior, mage, ranger, monk.
    pictures: {
      '1': ['class/ui_class_warrior_01.png', 'class/ui_class_warrior_02.png'],
      '2': ['class/ui_class_mage_01.png', 'class/ui_class_mage_02.png'],
      '3': ['class/ui_class_ranger_01.png', 'class/ui_class_ranger_02.png'],
      '4': ['class/ui_class_monk_01.png', 'class/ui_class_monk_02.png'],
    },
    // The points left are written as the build's own sentence, across the
    // plate's name field; the figure's own field beside it goes unused.
    values: { points: 'textPointName' },
    formats: { points: '@628?~d9a8024024e068c4~13' },
  },

  quests: {
    dialog: 'QuestLog',
    frame: ['btnempty', 'btnclose'],
    lists: {
      log: {
        row: 'scroll/QuestName',
        fields: { name: 'panelText/text' },
        does: { track: 'btnsel' },
      },
    },
    groups: {
      // The plate lit under a quest that can be handed back, and the two
      // marks: one for a quest ready to hand in, one for one under way.
      chosen: 'blueback',
      ready: 'yellowquestion',
      under: 'grayquestion',
      choices: 'scroll/info/scroll/groupchoose',
      required: 'scroll/info/scroll/groupreq',
      rewards: 'scroll/info/scroll/groupreward',
      moneyTitle: 'scroll/info/scroll/rewardmoney',
    },
    panels: { detail: 'scroll/info', window: 'newmask', area: 'btnscroll' },
    values: {
      count: 'count',
      objective: 'scroll/info/scroll/objinfo',
      body: 'scroll/info/scroll/questdest',
      gold: 'scroll/info/scroll/money/textGold',
    },
    coins: {
      gold: 'scroll/info/scroll/money/iconGold',
      silver: 'scroll/info/scroll/money/iconSilver',
      copper: 'scroll/info/scroll/money/iconIron',
    },
    purseIn: false,
    actions: { 'panelButton/button01': 'share', 'panelButton/button02': 'drop' },
    captions: {
      'panelButton/button01/btn/text': '@751?~a9c9fc38988a8a5c~5',
      'panelButton/button02/btn/text': '@752?~a9a58d8c2f616930~4',
      'scroll/info/scroll/groupchoose/title': '@394?~7d8552234177027f~18',
      'scroll/info/scroll/groupreq/title': '@393?~848c8620bae0dbb4~8',
      'scroll/info/scroll/groupreward/title': '@395?~a1a016358d5cc289~16',
      'scroll/info/scroll/rewardmoney': '@115?~e150c94f73c89323~5',
    },
    formats: { count: '%d/%d' },
    // The first-run hint, and the parts of a quest's own page the screen
    // lays out itself rather than where the movie stacks them.
    hidden: [
      'animQuestLogTip',
      'logbar',
      'scroll/info/scrollbar',
      'scroll/info/lineTop',
      'scroll/info/lineBottom',
      'scroll/info/scroll/plus',
      'scroll/info/scroll/completeprocess',
      'scroll/info/scroll/info',
    ],
  },

  spells: {
    dialog: 'dlgSpellTalent',
    frame: ['btnempty', 'btnclose'],
    tabs: [
      { control: 'btnSpells', panel: 'spells', text: 'textSpell' },
      {
        control: 'btnMounts',
        panel: 'mounts',
        text: 'textMount',
        caption: '@1603?~6c166aba16129096~5',
      },
      { control: 'btnTalents', panel: 'talents', text: 'textTalent' },
    ],
    // The mounts the player has are spells too, and are listed in the
    // rows the spells wear. That page's riding and pet pages are not drawn.
    sides: [{ control: '', panel: 'mounts', caption: '@1603?~6c166aba16129096~5' }],
    panels: { spells: 'panelSpell', mounts: 'panelSpell', talents: 'panelTalent' },
    captions: {
      textSpell: '@626?~74f5d6ce7806cf72~6',
      textMount: '@1603?~6c166aba16129096~5',
      textTalent: '@627?~f675ce88352271cc~7',
    },
    lists: {
      // By its whole path: the riding page keeps rows of the same name.
      spells: { row: 'panelSpell/group/item', fields: { name: 'text01', note: 'text02' } },
    },
    formats: { rank: '@1094?~ac9b9e2799f26ce3~4' },
    hidden: ['panelRiding', 'TalentType', 'textHelp'],
  },

  social: {
    dialog: 'dlgFriendList',
    frame: ['btnempty', 'btnclose'],
    tabs: [
      { control: 'btnGuild', panel: 'guild', text: 'textGuild' },
      { control: 'btnFriend', panel: 'friends', text: 'textFriend' },
      { control: 'btnIgnored', panel: 'ignored', text: 'textIgnored' },
    ],
    lists: { people: { row: 'group/btn', fields: { name: 'textPrefix' }, chosen: 'background' } },
    emptyNote: 'textNobody',
    // Where an online friend is, in green. The movie has no field for it
    // and so no colour: the palette's green for words on parchment.
    tones: { zone: 'var(--color-ink-success)' },
    edits: { btnName: { holds: 'name' } },
    actions: { btnAdd: 'invite' },
    captions: {
      textAdd: '@718?~3b3912745ca1a300~3',
      textNobody: '@719?~fee805bae27688be~25',
    },
    words: {
      invite: '@718?~3b3912745ca1a300~3',
      kick: '@826?~998c55a7aef0593b~8',
      remove: '@410?~db9215fd2c3c0931~6',
      offline: '@723?~ec8b992829b51394~7',
      whisper: '@408?~ee925beddf4aeb01~7',
      teamInvite: '@413?~1386011048f5e5d4~6',
    },
    // What a class is called, twice over for its two bodies, by the
    // server's class numbers: warrior, mage, ranger, monk.
    names: {
      classes: [
        '@389?~59596f09606f05dd~7',
        '@389?~59596f09606f05dd~7',
        '@390?~e1a8d8c3ee547ecf~4',
        '@390?~e1a8d8c3ee547ecf~4',
        '@391?~8867dfe073cffabc~6',
        '@391?~8867dfe073cffabc~6',
        '@392?~ee86e81e400e8a2a~4',
        '@392?~ee86e81e400e8a2a~4',
      ],
    },
  },

  team: {
    dialog: 'dlgteamsetting',
    frame: ['btnempty', 'btnclose'],
    lists: { members: { row: 'teamsetting/NameLists/items/item', fields: { name: 'text' } } },
    combos: [
      {
        control: 'teamsetting/NameLists/btn',
        list: 'teamsetting/NameLists/items',
        value: 'teamsetting/NameLists/CurName',
        of: 'member',
      },
    ],
    values: { leader: 'teamsetting/txtLeaderName', dungeonMode: 'dungeonsetting/txtdungeonmode' },
    // The two modes the Dungeon page steps between.
    words: { normal: '@1484?~e68b9c52af755a66~6', legend: '@1485?~0214fc64b9f87d58~6' },
    emptyNote: 'teamsetting/txtNotinteam',
    partyOnly: [
      'teamsetting/txtLeader',
      'teamsetting/txtLeaderName',
      'teamsetting/txtKick',
      'teamsetting/NameLists',
    ],
    actions: {
      btnInvite: 'invite',
      btnQuit: 'quit',
      btnteamsetting: 'teamPage',
      btndungeonsetting: 'dungeonPage',
      'dungeonsetting/btndungeonreset': 'resetDungeons',
      'dungeonsetting/btndungeonmodeleft': 'otherMode',
      'dungeonsetting/btndungeonmoderight': 'otherMode',
      'dungeonsetting/btndungeonsave': 'saveMode',
    },
    // The two pages, and the controls that belong to the team page alone.
    panels: { team: 'teamsetting', dungeon: 'dungeonsetting' },
    groups: {
      invite: 'btnInvite',
      quit: 'btnQuit',
    },
    // The friends list's own name field, floated over Invite: the team
    // page has none of its own.
    pieces: { nameField: { dialog: 'dlgFriendList', part: 'btnName' } },
    unavailable: { resetDungeons: 'dungeonsetting/btndungeonreset/disable' },
    captions: {
      textteamsetting: '@419?~a2fd7d0ca7c0aab8~4',
      textdungeonsetting: '@1482?~c9fe34cd7b2c0931~7',
      'dungeonsetting/txtdungeonreset': '@1486?~40787936038e9c4a~18',
      'dungeonsetting/txtdungeonsave': '@492?~7011a3c571fe2689~13',
      'teamsetting/txtLeader': '@488?~3e26757abeff021e~7',
      'teamsetting/txtKick': '@1402?~54eac627fd9afd6b~9',
      'teamsetting/txtNotinteam': 'You are not in a team.',
    },
    // The arena page, the rules for sharing out loot, and the dungeon page's
    // exhaustion, are the build's and not yet this client's.
    hidden: [
      // The buttons' words sit across the paper's edge; the icons say it.
      'textInvite',
      'textQuit',
      'btnPVPSetting',
      'txtTitleArena',
      'pvpsetting',
      'dungeonsetting/exhausting',
      'teamsetting/btnLeaderLeft',
      'teamsetting/btnLeaderRight',
      'teamsetting/btnQualityLeft',
      'teamsetting/btnQualityRight',
      'teamsetting/btnRuleLeft',
      'teamsetting/btnRuleRight',
      'teamsetting/btnsave',
      'teamsetting/textsave',
      'teamsetting/txtExcellent',
      'teamsetting/txtQuality',
      'teamsetting/txtRule',
      'teamsetting/txtTeamAllotment',
    ],
  },

  options: {
    dialog: 'popupMenuOption',
    frame: ['btnempty', 'btnclose'],
    panels: {
      scroll: 'panelSetting/optiongroup',
      window: 'panelSetting/optionmask',
      bar: 'panelSetting/optionscrollbar',
      quality: 'panelSetting/optiongroup/btncameraparam',
      // The page the window opens on, and the settings page it leads to.
      main: 'panelMain',
      settings: 'panelSetting',
    },
    marks: { above: 'panelSetting/optiontop', below: 'panelSetting/optionbottom' },
    bars: { of: { quality: 'panelSetting/optiongroup/anim_camera' } },
    // This client's own settings, one to each switch the page's column
    // carries in every build, in the order it keeps them.
    actions: {
      'panelSetting/optiongroup/btnVertical': 'music',
      'panelSetting/optiongroup/btnHorizontal': 'sound',
      'panelSetting/optiongroup/btnReverseY': 'damageNumbers',
      'panelSetting/optiongroup/btnEffect': 'touchStick',
      'panelSetting/optiongroup/btnLag': 'antialias',
      'panelSetting/optiongroup/btnHelmet': 'shadowMode',
      'panelSetting/optiongroup/btnLoot': 'renderScale',
      'panelSetting/optiongroup/btnGuild': 'uiScale',
      'panelSetting/optiongroup/btnRedTag': 'viewDistance',
      'panelSetting/optiongroup/btnMiniMusic': 'diagnostics',
      // The build's spare switch carries our fog: its
      // words field is filled at runtime, so the row reads fog throughout.
      'panelSetting/optiongroup/btn3g': 'fog',
      // The page the window opens on, and the ways off it this client has.
      'panelMain/buttonGameSetting': 'gameSettings',
      'panelMain/buttonCharacterList': 'characterList',
      'panelMain/buttonMainMenu': 'mainMenu',
    },
    captions: {
      'panelMain/buttonGameSetting/text': '@1441?~da64aba88570d5dc~13',
      'panelMain/buttonCharacterList/text': '@775?~a12a9518b29f9304~14',
      'panelMain/buttonMainMenu/text': '@776?~2ea13b7f6154c053~9',
      // Shown, and not yet wired to anything.
      'panelMain/buttonHelp/text': '@1004?~3871a3fa749178a6~4',
      'panelMain/buttonSetting/text': '@777?~68067b08783127a4~8',
      'panelMain/buttonReport/text': '@1498?~feab1448e614f6bc~12',
    },
    values: {
      quality: 'panelSetting/optiongroup/textcameraparam',
      music: 'panelSetting/optiongroup/textVertical',
      sound: 'panelSetting/optiongroup/textHorizontal',
      damageNumbers: 'panelSetting/optiongroup/textReverseY',
      touchStick: 'panelSetting/optiongroup/textEffect',
      antialias: 'panelSetting/optiongroup/textLag',
      shadowMode: 'panelSetting/optiongroup/textHelmet',
      renderScale: 'panelSetting/optiongroup/textLoot',
      uiScale: 'panelSetting/optiongroup/textGuild',
      viewDistance: 'panelSetting/optiongroup/textRedTag',
      diagnostics: 'panelSetting/optiongroup/textMiniMusic',
      fog: 'panelSetting/optiongroup/text3g',
    },
    // The page's other pages: the sound, the interface and asking for help.
    hidden: ['panelAudio', 'panelInterface', 'panelSOS', 'btnScroll'],
  },
  // Asked before leaving the world, in the build's own words.
  dungeonResetAsk: askBox('@1487?~619545e64e89320a~51'),
  dungeonModeAsk: askBox('@1499?~510204e757e56d93~71'),
  characterListAsk: askBox('@794?~9dea6ff214e72b4e~55'),
  mainMenuAsk: askBox('@795?~422c69852d1d81d9~50'),

  // Asked before the bag is made bigger, in gold, the only way the build
  // words it; and what is said on a yes the purse cannot pay for.
  bagUpgradeAsk: {
    ...markedBox('question'),
    actions: { btnYes: 'accept', btnNo: 'decline' },
    captions: { textYes: '@634?~4e9f3590ef08dfac~3', textNo: '@635?~62366ffa66f3c466~2' },
    words: { gold: '@1200?~0583f4e497d99f28~20' },
    hidden: ['btnRight', 'btnMsgInfo'],
  },
  // Asked before a thing let go over nothing is thrown away. In our own
  // words: which line of the build's asks this is not settled.
  discardAsk: askBox('Throw away %s? It cannot be got back.', 'warnning'),
  bagUpgradeShort: {
    ...markedBox('gold'),
    // The one control, where the pair would be.
    actions: { btnRight: 'accept' },
    captions: { textYes: '@636?~663437afe8165c73~2' },
    words: { prompt: '@766?~6a4fd52c711c6740~17' },
    hidden: ['btnYes', 'btnNo', 'textNo', 'btnMsgInfo'],
  },

  bag: {
    dialog: 'dlgItem',
    grids: { bag: {} },
    // The offer, by its own name: one build parks it at the top of the
    // dialog, another keeps one on each numbered page.
    panels: { upgrade: 'btnupgrade' },
    // The offer is drawn on its own, in the first place the bag lacks.
    hidden: ['btnupgrade', 'animItemTip', 'animflash', 'storestone'],
    values: { slots: 'btnupgrade/info', price: 'btnupgrade/price' },
    // Its one coin, drawn beside each figure of the price instead.
    groups: { upgradeCoin: 'btnupgrade/moneyIcon' },
    formats: { slots: '+%d slots' },
    optional: ['btnupgrade', 'btnupgrade/info', 'btnupgrade/price', 'btnupgrade/moneyIcon'],
  },

  auction: {
    dialog: 'dlgAuction',
    // The first panel's backdrop and tabs are the window; the bag panel
    // scrolls pages off to the side.
    frame: ['panelBid', 'btnBid', 'btnAuctionList', 'btnClose'],
    // "My bids" opens the "My auctions" list panel under another tab name.
    tabs: [
      { control: 'btnAuctionList', caption: 'myAuctions' },
      {
        control: 'btnBidList',
        panel: 'auctionList',
        text: 'textBidList',
        caption: 'myBids',
      },
    ],
    captions: {
      'panelBid/button02/text': 'Search',
      'panelBid/textHelp': 'Set what you are looking for, then search.',
      'panelAuction/textBidPrice': MOVIE_TEXT,
      'panelAuction/textFixedPrice': MOVIE_TEXT,
      'panelAuction/button01/text': 'List',
      'panelAuction/button02/text': 'Clear',
      'panelAuctionList/textHead01': 'Item',
      'panelAuctionList/textHead02': 'Time left',
      'panelAuctionList/textHead03': 'Bid',
      'panelAuctionList/textHead04': 'Buyout',
    },
    emptyNote: 'panelBid/textHelp',
    // The first panel carries a pale plate over the second tab, which
    // reads as that tab being open while it is not.
    hidden: ['animflash', 'panelBid/footnote/panelSwitch/text', 'panelBid@6'],
    lists: {
      bid: {
        region: 'panelBid',
        row: 'listView/group/item',
        rowArt: false,
        fields: {
          name: 'sub01/text',
          level: 'sub02',
          remaining: 'sub03',
          seller: 'sub04',
          priceGold: 'sub05/price01/textGold',
          priceSilver: 'sub05/price01/textSilver',
          buyGold: 'sub05/price02/textGold',
          buySilver: 'sub05/price02/textSilver',
        },
      },
      auctionList: {
        region: 'panelAuctionList',
        row: 'listView/group/item',
        rowArt: false,
        fields: {
          name: 'sub01/text',
          remaining: 'sub02',
          priceGold: 'sub03/price/textGold',
          priceSilver: 'sub03/price/textSilver',
          buyGold: 'sub04/price/textGold',
          buySilver: 'sub04/price/textSilver',
        },
      },
    },
    combos: [
      {
        control: 'panelBid/btnQuality',
        list: 'comboList01',
        value: 'panelBid/textQualityVal',
        of: 'quality',
        options: [ANY, ...QUALITIES.map(qualityName)],
      },
      {
        control: 'panelBid/btnType',
        list: 'comboList02',
        value: 'panelBid/textTypeVal',
        of: 'type',
        options: [ANY, ...KINDS.map(([word]) => word)],
      },
      {
        control: 'panelBid/btnSubType',
        list: 'comboList03',
        value: 'panelBid/textSubTypeVal',
        of: 'sub-type',
        options: [ANY],
      },
      {
        control: 'btnAuctionTime',
        list: 'comboList01',
        value: 'panelAuction/textAuctionTimeVal',
        of: 'auction time',
        options: ['12h', '24h', '48h'],
      },
    ],
    conditions: {
      [ANY]: {},
      ...Object.fromEntries(QUALITIES.map(quality => [qualityName(quality), { quality }])),
      ...Object.fromEntries(KINDS.map(([word, itemClass]) => [word, { kinds: [{ itemClass }] }])),
    },
    numbers: {
      'panelBid/btnLevelL': 'levelLow',
      'panelBid/btnLevelH': 'levelHigh',
      'panelAuction/btnGoldBid': 'startPrice',
      'panelAuction/btnSilverBid': 'startSilver',
      'panelAuction/btnGoldFixed': 'buyoutPrice',
      'panelAuction/btnSilverFixed': 'buyoutSilver',
    },
    actions: {
      'panelBid/button01': 'reset',
      'panelBid/button02': 'search',
      'panelAuction/button01': 'list',
      'panelAuction/button02': 'reset',
    },
    bag: {
      run: 'panelAuction',
      sell: 'panelAuction/auctionItem',
      name: 'panelAuction/textAuctionItemName',
    },
    purseIn: false,
    purse: {
      gold: 'footnote/money/textGold',
      silver: 'footnote/money/textSilver',
      copper: 'footnote/money/textIron',
      total: 'footnote/textTotalNumber',
      page: 'footnote/panelSwitch/text',
    },
    formats: { total: 'Total: %d' },
    paging: {
      back: 'footnote/panelSwitch/btnleft',
      on: 'footnote/panelSwitch/btnright',
      perPage: 50,
    },
  },

  // Writing a letter, and the three screens it opens beside itself.
  mailWrite: {
    dialog: 'dlgmailwrite',
    edits: {
      'btnsendto/text': { holds: 'to' },
      'btnmailtitle/text': { holds: 'subject' },
      'mailcontent/btnmailcontent/text': { holds: 'body', lines: true },
    },
    actions: { btnaddmoney: 'money', btnaddattch: 'attach', btnsend: 'send' },
    coins: { gold: 'gold', silver: 'sliver', copper: 'copper' },
    groups: { noMoney: 'textaddmoney', attached: 'textaddattch' },
    captions: {
      textaddmoney: '@693?~b388e14891c34704~9',
      textaddattch: '@694?~1a545e81c9b7afd5~11',
      textsend: '@695?~7261c8afd0478133~4',
    },
    formats: { attached: '@698?~24946e20a3ca49e4~11' },
    // The dark cover behind the letter, and the sample figures the movie
    // parks where the sum goes. Money and Attachments' grey layers, which
    // cover their lit faces.
    hidden: [
      'btnBlack',
      'textgold',
      'textsliver',
      'textcopper',
      'btnaddmoney/disable',
      'btnaddattch/disable',
    ],
  },

  mailMoney: {
    dialog: 'group_performence/mailmoney',
    // As big as the plate it draws: the part the movie sizes it by is the
    // dark cover over the whole screen.
    frame: [],
    edits: {
      'btngold/text': { holds: 'gold', number: true },
      'btnsliver/text': { holds: 'silver', number: true },
    },
    actions: { btnconfirm: 'confirm', btnrevert: 'revert' },
    captions: { textconfirm: '@696?~70daee4fc248182b~7', textrevert: '@697?~5f6eb3837f3fa9a7~6' },
    hidden: ['btnempty'],
  },

  mailBag: {
    dialog: 'dlgmailbag',
    grids: { bag: { slot: 'item' } },
    actions: { btnconfirm: 'confirm', btnrevert: 'revert' },
    captions: {
      title: '@694?~1a545e81c9b7afd5~11',
      textconfirm: '@696?~70daee4fc248182b~7',
      textrevert: '@697?~5f6eb3837f3fa9a7~6',
    },
    // Putting the bag in order is the bag's own screen's.
    hidden: ['pageleftright/animflash'],
  },

  mailAttach: {
    dialog: 'mailattach',
    grids: { attached: { slot: 'attch' } },
    captions: { title: '@694?~1a545e81c9b7afd5~11' },
  },

  // How many to take off a stack held and let go on its own slot.
  split: {
    dialog: 'dlgsplit',
    frame: 'btnempty',
    edits: { 'btnContent/text': { holds: 'count', number: true } },
    actions: { confirm: 'split' },
    captions: {
      txtLabel: '@1345?~7ff02c9bb5254e67~6',
      textConfirm: '@696?~70daee4fc248182b~7',
    },
    // The sheet the movie lays across the whole screen behind the box.
    hidden: ['btntrans'],
  },

  // A short stack of controls beside a unit or a row, lettered by the caller.
  playerLink: {
    dialog: 'dlgPlayerLink',
    actions: Object.fromEntries([1, 2, 3, 4, 5].map(at => [`btn0${at}`, `link${at}`])),
    values: Object.fromEntries([1, 2, 3, 4, 5].map(at => [`link${at}`, `text0${at}`])),
  },

  // A summon stone: the other members of the team, a name to each plaque.
  summon: {
    dialog: 'dlgsummon',
    actions: { btn01: 'member1', btn02: 'member2', btn03: 'member3' },
    values: { member1: 'text01', member2: 'text02', member3: 'text03' },
    captions: { texttitle: '@1478?~00c9959a3ea8d836~6' },
    // The plaques' own labels go unused: the name is written over each.
    hidden: ['btn01/text1', 'btn02/text1', 'btn03/text1'],
  },

  rowMenu: {
    dialog: 'dlgPlayerLink',
    actions: { btn01: 'ask' },
    values: { ask: 'text01' },
    hidden: ['btn02', 'btn03', 'btn04', 'btn05'],
  },

  // What the run-up to a duel says in chat. The box is only somewhere for
  // the words to belong; nothing of it is drawn.
  duelWords: {
    dialog: 'dlgMsg',
    words: {
      accepted: '@984?~8dd80a1109d50cbd~27',
      acceptedBy: '@985?~b9c32fdd831b2eb1~25',
      start: '@986?~40b8dbdac2f319a6~6',
    },
  },

  mail: {
    dialog: 'dlgmailbox',
    lists: {
      inbox: { row: 'group/btn', fields: { sender: 'text', subject: 'text2' } },
    },
    actions: { btnwrite: 'write' },
    // The grey layer every face of the control wears over it until it is
    // taken off: left on, the lit face showed only as a red rim round it.
    hidden: ['btnwrite/disable'],
    // The quill on the control, in the room the movie leaves left of its word.
    emblems: { write: { at: 'btnwrite', icon: 'mail/ui_mail_write.png', size: 30 } },
    captions: { title: 'Mailbox', textwrite: 'Write' },
    formats: { from: 'From' },
  },

  mailRead: {
    dialog: 'dlgmailread',
    values: {
      from: 'textfrom',
      subject: 'texttitle',
      body: 'mailcontent/btnmailcontent/text',
      gold: 'moneygroup/mailmoney/textGold',
      silver: 'moneygroup/mailmoney/textSilver',
      copper: 'moneygroup/mailmoney/textIron',
    },
    groups: { money: 'moneygroup' },
    // The marks that say the letter runs on are the letter's to slide;
    // drawn into the picture they sit there whether it runs on or not.
    hidden: ['top', 'bottom'],
    actions: {
      btnextractall: 'claim',
      btndelete: 'delete',
      'moneygroup/btnextractmoney': 'claimMoney',
      btnreply: 'reply',
    },
    unavailable: { claimMoney: 'moneygroup/btnextractmoney/disable' },
    // Returning a letter is the game's and not yet ours: it wears the face
    // of a control that is not available.
    shown: ['btnsendback/disable'],
    captions: {
      textextractall: 'Take all',
      textdelete: 'Delete',
      textreply: 'Reply',
      textsendback: 'Return',
      'moneygroup/textextractmoney': 'Money',
    },
    formats: { from: 'From' },
  },

  loot: {
    dialog: 'dlgLoot',
    lists: {
      loot: {
        row: 'element',
        bar: 'lootScroll/lootScrollbar',
        more: { above: 'arrowup', below: 'arrowdown' },
        fields: { name: 'btnPick/text' },
      },
    },
    actions: { btnPickAll: 'takeAll' },
    captions: { txtpickall: 'Take all' },
    hidden: ['lootScroll/scroll/btnMoney'],
  },

  storage: {
    dialog: 'dlgstoragebox',
    grids: {
      // The one sort button stands under the chest's half.
      bank: { slot: 'boxitem', pager: /^pageleftrightbox$/i, sort: 'btnsort' },
      bag: { slot: 'bagitem', pager: /^pageleftrightbag$/i },
    },
    // The room offer, half labels and second currency are not ours yet.
    hidden: [
      'btnupgradebag',
      'btnupgradebox',
      'animflash',
      'bagindicator',
      'boxindicator',
      'Stone',
    ],
    captions: { textsort: 'Sort' },
  },

  trade: {
    dialog: 'dlgTrade',
    grids: { mine: { slot: 'btnOwner' }, theirs: { slot: 'btnPeer' } },
    values: {
      peer: 'textNamePeer',
      myGold: 'textGoldOwner',
      mySilver: 'textSilverOwner',
      theirGold: 'textGoldPeer',
      theirSilver: 'textSilverPeer',
    },
    numbers: { btnGoldOwner: 'myGold', btnSilverOwner: 'mySilver' },
    coins: { theirGold: 'iconGoldPeer', theirSilver: 'iconSilverPeer' },
    groups: { waiting: 'texttoconfirm' },
    actions: { buttonConfirm: 'confirm' },
    captions: {
      textTitle: 'Trade',
      'buttonConfirm/text': 'Confirm',
      texttoconfirm: 'Waiting for both sides to confirm',
    },
    hidden: ['btnmailcontent'],
    purseIn: false,
  },

  shop: {
    dialog: 'dlgBuy',
    tabs: [
      { control: 'btnBuy', panel: 'buy', text: 'textBuy', caption: 'Buy' },
      { control: 'btnSell', panel: 'sell', text: 'textSell', caption: 'Sell' },
    ],
    captions: { textBuy: 'Buy', textSell: 'Sell' },
    grids: {
      goods: {
        slot: 'buyelement',
        face: 'displaycallback',
        size: { w: 40, h: 40, dx: -20, dy: -20 },
      },
    },
    lists: {
      goods: {
        row: 'buyelement',
        fields: { name: 'name', price: 'money' },
        coins: { gold: 'icongold', silver: 'iconsliver', copper: 'iconcopper' },
        // The card's own control asking what the thing is.
        does: { inspect: 'btninfo' },
      },
    },
    // A second strip of four tabs lies over the two this screen uses, and
    // the rest are currencies and offers this client does not keep.
    hidden: [
      'btnTab01',
      'btnTab02',
      'btnTab03',
      'btnTab04',
      'textTab01',
      'textTab02',
      'textTab03',
      'textTab04',
      'btnstore',
      'buyfilter',
      'priceBusiness',
      'storestone',
      'animflash',
      'lock',
      'desc',
      'name2',
      'iconcompounder',
      'icongarment',
      'iconleather',
      'iconPVP',
      'iconSoulStone',
      'iconstone',
    ],
  },

  sell: {
    dialog: 'dlgsell',
    tabs: [
      { control: 'btnBuy', panel: 'buy', text: 'textBuy', caption: 'Buy' },
      { control: 'btnSell', panel: 'sell', text: 'textSell', caption: 'Sell' },
    ],
    captions: { textBuy: 'Buy', textSell: 'Sell', 'btnSellAll/text1': 'Sell' },
    grids: { bag: { slot: 'bagitem' }, tray: { slot: 'sellitem' } },
    actions: { btnSellAll: 'sell' },
    // What selling the tray fetches is not worked out here, so the figure
    // on the control is left off along with its own shorter caption. The
    // strip naming the bag lies over the second tab.
    hidden: ['priceRepair', 'txtsellall', 'priceBusiness', 'animflash', 'bagindicator'],
    // The control's own price is a purse too; the player's is the other.
    purseIn: 'money',
  },
  npcChat: {
    dialog: 'dlgNPCChat',
    values: { title: 'panelTitle/text', body: 'text', back: 'textBack' },
    actions: { btnBack: 'back' },
    words: { back: '@6?~5bb421a21e1455b6~4' },
    // The marks that say the words run on are drawn whether they do or
    // not; this screen scrolls its words itself.
    hidden: ['lineTop', 'lineBottom', 'scrollBar'],
  },

  questAsk: {
    dialog: 'dlgQuestList',
    values: { title: 'textTitle' },
    lists: { choices: { row: 'group/btn', fields: { name: 'panelText/text' } } },
  },

  questTalk: {
    dialog: 'dlgQuest',
    panels: { window: 'questScroll/mask' },
    values: {
      title: 'panelTitle/text',
      objective: 'questScroll/scroll/objinfo',
      body: 'questScroll/scroll/questdest',
      gold: 'questScroll/scroll/money/textGold',
      first: 'textok',
      second: 'textmiddle',
      close: 'textcancel',
    },
    // Along the foot: one thing to do stands alone on the middle control.
    actions: { btnOK: 'first', btnMiddle: 'second', btnCancel: 'close' },
    words: {
      accept: '@7?~08247e29eb48352d~6',
      handIn: '@9?~55caed828960899e~8',
      close: '@1025?~27cb3b23887720a7~5',
    },
    groups: {
      rewards: 'questScroll/scroll/groupreward',
      choices: 'questScroll/scroll/groupchoose',
      moneyTitle: 'questScroll/scroll/rewardmoney',
    },
    captions: {
      'questScroll/scroll/groupreward/title': '@395?~7e02b99d00b79ed1~17',
      'questScroll/scroll/groupchoose/title': '@394?~b1e03d5b32df64d7~19',
      'questScroll/scroll/rewardmoney': '@1331?~1ad56a8cd1b720b0~13',
    },
    // The middle is laid out by the screen, so every part of it the
    // movie stacks on one spot is left out of the picture.
    hidden: [
      'questScroll/scroll/groupreq',
      'questScroll/scroll/completeprocess',
      'questScroll/scroll/info',
      'questScroll/scroll/money',
      'questScroll/scroll/plus',
      'questScroll/lineTop',
      'questScroll/lineBottom',
      'questScroll/scrollbar',
      'animQuestTip',
    ],
  },

  // One aura icon: rim green for a buff, red for a debuff, a stack badge.
  // The movie has two spots and a list; here every aura has its own, so
  // only the first spot is drawn.
  auraIcon: {
    dialog: 'DlgBuff',
    frame: 'btnTopBuff',
    groups: {
      picture: 'btnTopBuff/displaycallback',
      buff: 'btnTopBuff/outer_light',
      debuff: 'btnTopBuff/outer_light_debuff',
      badge: 'btnTopBuff/bgCount',
    },
    values: { stacks: 'btnTopBuff/textCount' },
    hidden: ['btnTopDebuff', 'DlgBuffGroup'],
  },

  // What an aura is, on the card a talent is read on: the spell's name,
  // what it does, and the time left in the build's own sentence. The
  // card's controls for spending points are not drawn.
  auraCard: {
    dialog: 'dlgTalentDesc',
    frame: ['btnempty', 'btnClose'],
    card: {
      title: 'textTitle',
      body: 'group/text',
      // The talent card's confirm strip, for an aura the player may take off.
      actions: {
        cancel: {
          strip: 'panelAddPoint/panelConfirm',
          control: 'panelAddPoint/panelConfirm/btnConfirm',
          label: 'panelAddPoint/panelConfirm/textConfirm',
          says: 'Cancel',
        },
      },
    },
    formats: { timeLeft: '@712?~5a924507d7ca6533~13' },
    marks: { above: 'lineTop', below: 'lineBottom' },
    panels: { bar: 'scrollBar' },
    hidden: ['panelAddPoint'],
  },
};

/** The message box with a mark in its top ring, at the spot's hit-box size (26 in both builds). */
function markedBox(mark: string): ScreenMeaning {
  return {
    dialog: 'dlgMsg',
    frame: 'background',
    values: { message: 'textMsg' },
    // The sheet the box lays behind itself, as big as the movie's screen.
    panels: { sheet: 'btnempty' },
    emblems: { mark: { at: 'displayCallback', icon: `msgbox/${mark}.png`, size: 26 } },
  };
}

/** A yes-or-no question from another player, in the build's words and mark (a question mark unless said). */
function askBox(prompt: string, mark = 'question'): ScreenMeaning {
  return {
    ...markedBox(mark),
    actions: { btnYes: 'accept', btnNo: 'decline' },
    captions: { textYes: '@634?~4e9f3590ef08dfac~3', textNo: '@635?~62366ffa66f3c466~2' },
    words: { prompt },
    // A single wide control lies under the pair, for a box that only
    // says something; and the mark in the corner opens nothing here.
    hidden: ['btnRight', 'btnMsgInfo'],
  };
}

/** The dialog and movie a screen wears, before any movie has been read. */
export function meaningOf(screen: string): ScreenMeaning | undefined {
  return SCREEN_MEANINGS[screen];
}
