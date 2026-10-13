/**
 * An NPC's one head icon, most specific first: teaching, its own window, what
 * its shop sells (only with the vendor bit), then the speech bubble. Quests
 * use quest marks. Bit meanings are read off the titles of NPCs carrying them.
 */

const HEAD_ICONS = 'ui/icons/head/';

type Offer = readonly [bit: number, icon: string];

/** NPC flag bit: the NPC sells something. */
const SELLS = 2;

/** Most specific first; the first offer an NPC carries is the icon it wears. */
const TEACHES: readonly Offer[] = [
  [26, 'ui_head_book_warrior.png'],
  [27, 'ui_head_book_mage.png'],
  [28, 'ui_head_book_monk.png'],
  [29, 'ui_head_book_ranger.png'],
  [10, 'ui_head_foundry.png'],
  [11, 'ui_head_garment.png'],
  [15, 'ui_head_leathering.png'],
];

const WINDOWS: readonly Offer[] = [
  [16, 'ui_head_guild.png'],
  [21, 'ui_head_auction.png'],
  [18, 'ui_head_arena.png'],
  [25, 'ui_head_teleport.png'],
];

const SHOP_STOCK: readonly Offer[] = [
  [22, 'ui_head_mount.png'],
  [31, 'ui_head_soul.png'],
  [5, 'ui_head_weapon.png'],
  [6, 'ui_head_armor.png'],
  [3, 'ui_head_food.png'],
  [7, 'ui_head_material.png'],
  [8, 'ui_head_special.png'],
  [4, 'ui_head_goods.png'],
];

const TALKS: Offer = [0, 'ui_head_chat.png'];

const has = (flags: number, bit: number) => ((flags >>> bit) & 1) === 1;

/** The icon an NPC wears for its flags, or none. */
export function npcServiceIcon(flags: number): string | undefined {
  const offers = has(flags, SELLS)
    ? [...TEACHES, ...WINDOWS, ...SHOP_STOCK, TALKS]
    : [...TEACHES, ...WINDOWS, TALKS];
  const found = offers.find(([bit]) => has(flags, bit));
  return found && HEAD_ICONS + found[1];
}

/**
 * Object kinds that wear an icon, by the kind number in `staticobject_proto`.
 * Read off the models each kind places: way markers and guideposts, mailboxes,
 * the bank and treasure boxes, the city battle banners, the call stones.
 */
const OBJECT_ICONS: ReadonlyMap<number, string> = new Map([
  [2, 'ui_head_board.png'],
  [8, 'ui_head_mail.png'],
  [9, 'ui_head_storage.png'],
  [12, 'ui_head_arena.png'],
  [105, 'ui_head_summon.png'],
]);

/** The icon an object wears, only while it can be used. */
export function objectServiceIcon(
  kind: number | undefined,
  usable: boolean | undefined,
): string | undefined {
  if (!usable || kind === undefined) return undefined;
  const file = OBJECT_ICONS.get(kind);
  return file && HEAD_ICONS + file;
}
