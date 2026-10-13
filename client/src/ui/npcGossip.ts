import type { GossipMenu } from '../assets/types';
import { itemErrorMessage } from '../net/itemErrors';
import type { ChoiceResult } from '../net/wireCodes';
import { formatMoney } from './money';

/** One conversation page from its `String_Menu` markup (0x12 tag 0x13; see `client/docs/formats/gossip.md`), judged against the player. */

/** What the page needs to know about the player to decide what it says. */
export interface GossipContext {
  /** Whether quest `id` is in the player's quest log. */
  holdsQuest(id: number): boolean;
  /** Whether the player wears an aura of spell `id`. */
  hasAura(id: number): boolean;
  name: string;
  className: string;
  raceName: string;
  /** A number in [0, 1), for choosing one of several lines. */
  random(): number;
}

/** How a run of words is marked: plain, or picked out in the page's alert colour. */
export type GossipTone = 'plain' | 'alert';

export interface GossipSpan {
  text: string;
  tone: GossipTone;
}

/** A teleport a choice sells. Where it lands and what it costs are the server's to decide. */
export interface TeleportOffer {
  zoneId: number;
  cost: number;
}

/**
 * What picking a choice does: open the page under it, close the
 * conversation, or ask the server to run the choice's script.
 */
export type GossipAction =
  | { kind: 'open'; menuId: number }
  | { kind: 'close' }
  | { kind: 'run'; slot: number };

export interface GossipChoice {
  label: string;
  /** The page it opens, or 0. */
  subMenuId: number;
  /** Its script slot, 1 to 6, or 0 for none. */
  scriptSlot: number;
  teleport: TeleportOffer | null;
  action: GossipAction;
}

export interface GossipPage {
  text: GossipSpan[];
  choices: GossipChoice[];
}

/** This project's own line for a page with no words and no choices. */
export const NOTHING_TO_SAY = 'The NPC has nothing to say.';

/** This project's own line for a choice whose script the server does not carry out. */
export const NOTHING_HAPPENS = 'Nothing happens.';

/** The word for each class, by class number; no table ties a class number to a name. */
const CLASS_WORDS: Readonly<Record<number, string>> = {
  1: 'Warrior',
  2: 'Mage',
  3: 'Ranger',
  4: 'Monk',
};

export function classWord(playerClass: number): string {
  return CLASS_WORDS[playerClass] ?? '';
}

/**
 * What the player is told when the server answers a picked choice, or null
 * for nothing. A price the player cannot meet names the price, which is the
 * one the page itself sells the teleport for.
 */
export function choiceNotice(result: ChoiceResult, choice: GossipChoice | null): string | null {
  if (result === 'teleported') return null;
  if (result === 'nothingHappens') return NOTHING_HAPPENS;
  const cannot = itemErrorMessage('notEnoughMoney');
  const cost = choice?.teleport?.cost ?? 0;
  return cost > 0 ? `${cannot} It costs ${formatMoney(cost)}.` : cannot;
}

/** Whether the page closes once the server has answered: only a price not met leaves it open. */
export function closesAfter(result: ChoiceResult): boolean {
  return result !== 'notEnoughMoney';
}

/**
 * Where Back goes from a trail of menu ids, greeting first: the menu one up,
 * or null from the greeting itself, which has no page before it.
 */
export function backFrom(trail: readonly number[]): number | null {
  return trail.length > 1 ? trail[trail.length - 2] : null;
}

// — markup ------------------------------------------------------------

interface Tag {
  kind: 'tag';
  name: string;
  /** The first value after `=`, before any comma. */
  value: string;
  attrs: Map<string, string>;
  children: Node[];
}

type Node = { kind: 'text'; text: string } | Tag;

/** Tags that stand alone and are never closed. */
const VOID_TAGS = new Set(['br', 'name', 'class', 'race']);

const TAG = /^(\/?)([a-z_]+)(?:=(.*?))?\s*(\/?)$/;

const SLOTS = 6;

function readAttrs(raw: string): { value: string; attrs: Map<string, string> } {
  const parts = raw.split(',');
  const attrs = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const at = part.indexOf('=');
    if (at > 0) attrs.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return { value: (parts[0] ?? '').trim(), attrs };
}

/**
 * The markup as a tree. A closer with no opener is dropped; an opener never
 * closed runs to the end. Anything between 0x12 and 0x13 that is not a tag
 * is words, and a stray 0x12 or 0x13 is dropped.
 */
function parseMarkup(source: string): Node[] {
  const root: Tag = { kind: 'tag', name: '', value: '', attrs: new Map(), children: [] };
  const stack: Tag[] = [root];
  const add = (node: Node): void => {
    stack[stack.length - 1]!.children.push(node);
  };
  const text = (value: string): void => {
    const clean = value.replace(/[\x12\x13]/g, '');
    if (clean) add({ kind: 'text', text: clean });
  };

  const markup = /\x12([^\x12\x13]*)\x13/g;
  let at = 0;
  for (let match = markup.exec(source); match !== null; match = markup.exec(source)) {
    text(source.slice(at, match.index));
    at = markup.lastIndex;
    const tag = TAG.exec(match[1]!.trim());
    if (!tag) {
      text(match[1]!);
      continue;
    }
    const closing = tag[1] === '/';
    const name = tag[2]!;
    if (closing) {
      const open = stack.map(one => one.name).lastIndexOf(name);
      if (open > 0) stack.length = open;
      continue;
    }
    const node: Tag = { kind: 'tag', name, ...readAttrs(tag[3] ?? ''), children: [] };
    add(node);
    if (tag[4] !== '/' && !VOID_TAGS.has(name)) stack.push(node);
  }
  text(source.slice(at));
  return root.children;
}

// — reading a page ----------------------------------------------------

/** Where words go while the tree is walked: the page, or the label of the choice being read. */
interface Sink {
  spans: GossipSpan[];
  /** Set while reading a choice: the script slot a `script` tag inside it names. */
  slot?: number;
}

function toNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A choice that opens a page opens it; otherwise one with a script asks the
 * server to run it; anything else closes the conversation.
 */
function actionFor(subMenuId: number, scriptSlot: number): GossipAction {
  if (subMenuId !== 0) return { kind: 'open', menuId: subMenuId };
  if (scriptSlot > 0) return { kind: 'run', slot: scriptSlot };
  return { kind: 'close' };
}

/** One conversation page: the words it says to this player, and the choices it offers them. */
export function readGossip(menu: GossipMenu, context: GossipContext): GossipPage {
  const page: Sink = { spans: [] };
  const choices: GossipChoice[] = [];
  const teleports = new Map<number, TeleportOffer>();

  const say = (sink: Sink, text: string, tone: GossipTone): void => {
    if (text) sink.spans.push({ text, tone });
  };

  const readChoice = (node: Tag, tone: GossipTone): void => {
    const label: Sink = { spans: [] };
    walk(node.children, label, tone);
    const text = label.spans
      .map(span => span.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    // A choice with no words has nothing to click on.
    if (!text) return;
    const column = toNumber(node.value);
    const named = toNumber(node.attrs.get('script'));
    const slot = named > 0 ? named : (label.slot ?? 0);
    const scriptSlot = slot <= SLOTS ? slot : 0;
    const subMenuId = column >= 1 && column <= SLOTS ? (menu.subMenus[column - 1] ?? 0) : 0;
    choices.push({
      label: text,
      subMenuId,
      scriptSlot,
      teleport: null,
      action: actionFor(subMenuId, scriptSlot),
    });
  };

  const walk = (nodes: readonly Node[], sink: Sink, tone: GossipTone): void => {
    for (const node of nodes) {
      if (node.kind === 'text') {
        say(sink, node.text, tone);
        continue;
      }
      const id = toNumber(node.value);
      switch (node.name) {
        case 'br':
          say(sink, '\n', tone);
          break;
        case 'name':
          say(sink, context.name, tone);
          break;
        case 'class':
          say(sink, context.className, tone);
          break;
        case 'race':
          say(sink, context.raceName, tone);
          break;
        case 'color':
          walk(node.children, sink, node.value === 'red' ? 'alert' : tone);
          break;
        case 'has_quest':
          if (context.holdsQuest(id)) walk(node.children, sink, tone);
          break;
        case 'not_has_quest':
          if (!context.holdsQuest(id)) walk(node.children, sink, tone);
          break;
        case 'has_aura':
          if (context.hasAura(id)) walk(node.children, sink, tone);
          break;
        case 'not_has_aura':
          if (!context.hasAura(id)) walk(node.children, sink, tone);
          break;
        case 'random': {
          // One of the lines, and nothing else written inside the block.
          const lines = node.children.filter(
            (child): child is Tag => child.kind === 'tag' && child.name === 'randomtext',
          );
          if (lines.length === 0) break;
          const at = Math.min(lines.length - 1, Math.floor(context.random() * lines.length));
          walk(lines[at]!.children, sink, tone);
          break;
        }
        case 'teleport':
          if (id > 0 && !teleports.has(id)) {
            teleports.set(id, {
              zoneId: toNumber(node.attrs.get('topzone')),
              cost: toNumber(node.attrs.get('moneycount')),
            });
          }
          break;
        case 'script':
          if (sink !== page && id > 0) sink.slot = id;
          walk(node.children, sink, tone);
          break;
        case 'link_menu':
          if (sink === page) readChoice(node, tone);
          else walk(node.children, sink, tone);
          break;
        default:
          walk(node.children, sink, tone);
      }
    }
  };

  walk(parseMarkup(menu.text.replace(/\r\n?/g, '\n')), page, 'plain');
  for (const choice of choices) choice.teleport = teleports.get(choice.scriptSlot) ?? null;
  return { text: tidy(page.spans), choices };
}

/**
 * The page's words with the layout whitespace taken out: nothing blank at
 * either end, no spaces before a line break, and never more than one blank
 * line in a row. Neighbouring runs of the same tone are merged.
 */
function tidy(spans: readonly GossipSpan[]): GossipSpan[] {
  const out: GossipSpan[] = [];
  let breaks = 0;
  let started = false;
  const push = (char: string, tone: GossipTone): void => {
    const last = out[out.length - 1];
    if (last && last.tone === tone) last.text += char;
    else out.push({ text: char, tone });
  };
  const trimEnd = (pattern: RegExp): void => {
    while (out.length > 0) {
      const last = out[out.length - 1]!;
      last.text = last.text.replace(pattern, '');
      if (last.text) return;
      out.pop();
    }
  };
  for (const span of spans) {
    for (const char of span.text) {
      if (char === '\n') {
        trimEnd(/[ \t]+$/);
        if (!started || breaks >= 2) continue;
        breaks += 1;
        push(char, span.tone);
        continue;
      }
      if (!started && /\s/.test(char)) continue;
      started = true;
      // Spaces and tabs sit between line breaks without ending a run of them.
      if (char !== ' ' && char !== '\t') breaks = 0;
      push(char, span.tone);
    }
  }
  trimEnd(/\s+$/);
  return out;
}
