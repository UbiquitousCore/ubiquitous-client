/**
 * What a card says about one thing, line by line (`CARD_ORDER`), wherever
 * it is shown. Every sentence and number meaning comes from the user's
 * files. Held against a worn item, lines carry the difference in green or red.
 */

import type { ItemFacts } from '../assets/types';
import type { ScreenSpec } from './art/uiSpec';

/** The colour a line is written in, named for what it means. */
export type Tone = 'plain' | 'gain' | 'loss' | 'note';

export interface CardLine {
  text: string;
  tone: Tone;
  /**
   * The far end of a line written in two columns: where a thing is worn,
   * over against what it is made of. Only one line on the card has one.
   */
  far?: string;
  /** Continues the previous line: the level asked is one sentence in two colours. */
  joined?: boolean;
}

export interface CardSubject {
  facts: ItemFacts | null;
  /** The item's own words, where the user's strings have any for it. */
  describedAs?: string;
  /**
   * What the spells it carries do, in words — one line each, written
   * above the item's own words, as the screen writes them.
   */
  does?: readonly string[];
  /** What the player is, for the lines written about the player. */
  level: number;
  playerClass: number;
  /** What is already worn in its place, when this card is held against one. */
  against?: ItemFacts | null;
}

/**
 * Whether a class may wear an item: the item's class mask carries one bit
 * per class, bit N for class N.
 */
function classMayWear(mask: number, classNumber: number): boolean {
  return ((mask >>> classNumber) & 1) === 1;
}

/** How a number reads in the sentence that holds it: whole, or to a place. */
function formatted(sentence: string, value: number): string {
  const places = /%\.(\d)f/.exec(sentence);
  return places ? value.toFixed(Number(places[1])) : String(Math.round(value));
}

/** A sentence with its one number written in. */
function written(sentence: string | undefined, value: number): string {
  if (!sentence) return '';
  return sentence.replace(/%\.?\d*[dufs]/, formatted(sentence, value));
}

/** What an item gives you, gathered by kind and added up. */
function given(facts: ItemFacts | null): Map<number, number> {
  const out = new Map<number, number>();
  for (const stat of facts?.stats ?? []) {
    out.set(stat.kind, (out.get(stat.kind) ?? 0) + stat.value);
  }
  return out;
}

/** How much more of something the thing held up against this one gives. */
function difference(mine: number, theirs: number): string {
  const gap = theirs - mine;
  if (!gap) return '';
  return gap > 0 ? ` (+${gap})` : ` (${gap})`;
}

/** The tone a difference is written in: a gain is green, a loss is red. */
function toneOf(mine: number, theirs: number, same: Tone): Tone {
  if (theirs > mine) return 'gain';
  if (theirs < mine) return 'loss';
  return same;
}

/** Everything a line builder reads, and the two ways it writes. */
interface CardDraft {
  subject: CardSubject;
  facts: ItemFacts;
  spec: ScreenSpec;
  /** The worn item this card is held against, if any. */
  held: ItemFacts | null;
  /** What this item and the held one give, gathered by kind. */
  mine: Map<number, number>;
  theirs: Map<number, number>;
  /** Whether the item goes in an equipment slot at all. */
  worn: boolean;
  /** Starts a line; empty text writes nothing. */
  add(text: string, tone?: Tone, far?: string): void;
  /** Carries on the line already begun, in its own colour. */
  join(text: string, tone: Tone): void;
}

/** Writes zero or more lines of one kind onto a card. */
type LineBuilder = (card: CardDraft) => void;

/** The word at `at` in a list from the spec, or nothing. */
const pick = (from: readonly string[] | undefined, at: number): string =>
  (at >= 0 && from?.[at]) || '';

const sentence = (card: CardDraft, name: string): string | undefined => card.spec.formats?.[name];

/** Kinds of gift the armour and block lines absorb, so no gift line repeats them. */
const absorbed = (card: CardDraft, kind: number): boolean =>
  kind === card.spec.shape?.armour || kind === card.spec.shape?.block;

const binding: LineBuilder = card => {
  if (card.facts.binding > 0) card.add(pick(card.spec.names?.binds, card.facts.binding));
};

/**
 * Where it is worn and what it is, on one line in two columns. Only about
 * something that is worn: a loaf of bread gets no line saying it cannot be
 * equipped.
 */
const slotAndKind: LineBuilder = card => {
  if (!card.worn) return;
  const { facts } = card;
  const names = card.spec.names;
  const kind =
    pick(names?.subClasses?.[String(facts.itemClass)], facts.subClass) ||
    pick(names?.classes, facts.itemClass);
  card.add(pick(names?.worn, facts.inventoryType), 'plain', kind || undefined);
};

/**
 * What it protects, or what it hits for. The armour line absorbs whatever
 * the item itself adds to armour, so a plated ring reads as one figure
 * rather than two, and is green when some of it is a gift.
 */
const protectionOrHit: LineBuilder = card => {
  const { facts, held, mine, theirs } = card;
  const shape = card.spec.shape;
  if (facts.itemClass === shape?.armourClass) {
    const armourOf = (item: ItemFacts, gifts: Map<number, number>): number =>
      item.armour + (shape?.armour ? (gifts.get(shape.armour) ?? 0) : 0);
    const total = armourOf(facts, mine);
    if (total <= 0) return;
    const text = written(sentence(card, 'armour'), total);
    if (held) {
      const other = armourOf(held, theirs);
      card.add(text + difference(total, other), toneOf(total, other, 'plain'));
    } else {
      card.add(text, total === facts.armour ? 'plain' : 'gain');
    }
    return;
  }
  if (!facts.damage.length) return;
  for (const [at, hit] of facts.damage.entries()) {
    const both = pick(card.spec.names?.damageTypes, hit.kind)
      .replace(/%d/, String(Math.round(hit.min)))
      .replace(/%d/, String(Math.round(hit.max)));
    card.add(at ? `+ ${both}` : both, hit.kind === 0 ? 'plain' : 'gain');
  }
  if (facts.delay > 0) {
    const seconds = facts.delay / 1000;
    card.add(written(sentence(card, 'speed'), seconds));
    const swing = facts.damage.reduce((sum, hit) => sum + (hit.min + hit.max) / 2, 0);
    card.add(written(sentence(card, 'dps'), swing / seconds));
  }
};

/**
 * The gifts of one run: the plain kinds the spec lists, or every other
 * kind. Held against a worn item, a gift only the worn one gives is
 * written at zero, with the difference in green.
 */
const gifts =
  (plainRun: boolean): LineBuilder =>
  card => {
    const inRun = (kind: number): boolean =>
      (card.spec.shape?.plainKinds ?? []).includes(kind) === plainRun && !absorbed(card, kind);
    const own: Tone = plainRun ? 'plain' : 'gain';
    const say = (kind: number, value: number): string =>
      written(card.spec.stats?.[String(kind)], value);
    for (const [kind, value] of card.mine) {
      if (!inRun(kind)) continue;
      if (card.held) {
        const other = card.theirs.get(kind) ?? 0;
        card.add(say(kind, value) + difference(value, other), toneOf(value, other, own));
      } else {
        card.add(say(kind, value), own);
      }
    }
    if (!card.held) return;
    for (const [kind, value] of card.theirs) {
      if (inRun(kind) && !card.mine.has(kind)) card.add(`${say(kind, 0)} (+${value})`, 'gain');
    }
  };

/**
 * The level it asks for. Out of reach, it is one line in two colours —
 * the words plain, the number red — written as two joined pieces.
 */
const levelAsked: LineBuilder = card => {
  const { facts } = card;
  if (facts.requiredLevel <= 0 && !card.worn) return;
  const asks = facts.requiredLevel || 1;
  if (asks > card.subject.level) {
    card.add(sentence(card, 'levelPrefix') ?? '');
    card.join(written(sentence(card, 'levelValue'), asks), 'loss');
  } else {
    card.add(written(sentence(card, 'level'), asks));
  }
};

/**
 * Who may wear it, written under its heading rather than beside it: there
 * can be four classes named, and they would not fit on one line.
 */
const allowedWearers: LineBuilder = card => {
  const mask = card.facts.allowedClasses;
  if (mask <= 0) return;
  card.add(sentence(card, 'allowedPrefix') ?? '');
  const who = Object.entries(card.spec.names?.allowed ?? {})
    .filter(([cls, word]) => word && classMayWear(mask, Number(cls)))
    .map(([, word]) => word);
  card.add(who.join(', '), classMayWear(mask, card.subject.playerClass) ? 'gain' : 'loss');
};

const blockLine: LineBuilder = card => {
  const shape = card.spec.shape;
  if (shape?.block === undefined) return;
  const { facts, held } = card;
  const blocks = facts.block + (card.mine.get(shape.block) ?? 0);
  const other = held ? held.block + (card.theirs.get(shape.block) ?? 0) : blocks;
  if (blocks <= 0 && other <= 0) return;
  const text = written(sentence(card, 'blockValue'), blocks);
  if (held) card.add(text + difference(blocks, other), toneOf(blocks, other, 'gain'));
  else card.add(text, 'gain');
};

/** What its spells do, then its own words, in the same colour. */
const spellsAndWords: LineBuilder = card => {
  for (const said of card.subject.does ?? []) card.add(said, 'note');
  if (card.subject.describedAs) card.add(card.subject.describedAs, 'note');
};

/** The order a card is written in, top to bottom. */
const CARD_ORDER: readonly LineBuilder[] = [
  binding, // From the owner's screenshots, through `gifts(false)`.
  slotAndKind,
  protectionOrHit, // A weapon's damage, speed and DPS in this place: own choice.
  gifts(true), // Seen in play.
  levelAsked,
  allowedWearers,
  gifts(false),
  blockLine, // Seen in play.
  spellsAndWords, // Own choice.
];

/** Every line, top to bottom; nothing without a spec, since bare figures read as a fault. */
export function cardLines(subject: CardSubject, spec: ScreenSpec | null): CardLine[] {
  const facts = subject.facts;
  if (!facts || !spec) return [];
  const held = subject.against ?? null;
  const lines: CardLine[] = [];
  const draft: CardDraft = {
    subject,
    facts,
    spec,
    held,
    mine: given(facts),
    theirs: given(held),
    worn: facts.inventoryType > 0,
    add(text, tone = 'plain', far) {
      if (text) lines.push(far ? { text, tone, far } : { text, tone });
    },
    join(text, tone) {
      if (text) lines.push({ text, tone, joined: true });
    },
  };
  for (const build of CARD_ORDER) build(draft);
  return lines;
}

// ------------------------------------------------------------- where it goes

/**
 * The one spacing card placement uses: between a card and the point that
 * opened it, between a card and its neighbours, and between any card and
 * the edge of the view.
 */
export const CARD_MARGIN = 12;

/** How much room there is to stand cards in. */
export interface Room {
  w: number;
  h: number;
}

/** A start position kept a margin inside a span, for something `size` long. */
function inside(start: number, size: number, span: number): number {
  return Math.max(CARD_MARGIN, Math.min(start, span - size - CARD_MARGIN));
}

/** Beside the press, never over it: towards the roomier side, centred vertically, inside the view; `from` grows it out of the press. */
export function placeBeside(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  room: Room,
): { left: number; top: number; from: string } {
  const rightwards = room.w - anchor.x >= anchor.x;
  const beside = rightwards ? anchor.x + CARD_MARGIN : anchor.x - CARD_MARGIN - size.w;
  const left = inside(beside, size.w, room.w);
  const top = inside(anchor.y - size.h / 2, size.h, room.h);
  return { left, top, from: `${rightwards ? 'left' : 'right'} ${anchor.y - top}px` };
}

/** Worn-item cards level with the opener's top, stacked on its roomier side; two that do not fit split sides. */
export function placeAlongside(
  card: { left: number; top: number; w: number },
  width: number,
  count: number,
  room: Room,
): Array<{ left: number; top: number }> {
  const step = width + CARD_MARGIN;
  const rightOf = card.left + card.w;
  const freeLeft = card.left - CARD_MARGIN;
  const freeRight = room.w - rightOf - CARD_MARGIN;
  const rightFirst = freeRight >= freeLeft;
  const outward = (right: boolean, n: number): number =>
    right ? rightOf + CARD_MARGIN + n * step : card.left - (n + 1) * step;
  const stacks = count * step <= Math.max(freeLeft, freeRight);
  const lefts: number[] = [];
  for (let n = 0; n < count; n++) {
    const right = stacks || n === 0 ? rightFirst : !rightFirst;
    lefts.push(outward(right, stacks ? n : 0));
  }
  return lefts.map(left => ({ left: inside(left, width, room.w), top: card.top }));
}

/** A finger or pen holds; a mouse or unknown pointer switches (holding a mouse down is the worse mistake). */
export function holding(event: { pointerType?: string }): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}
