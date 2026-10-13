/**
 * Which service icon a body wears over its head.
 *
 * The rule under test: an NPC wears one icon, for the most specific thing it
 * offers. Teaching beats a service window, a service window beats a shop, and
 * all of them beat plain conversation. A shop category only counts on an NPC
 * that sells at all. Objects wear an icon by their kind, and only when they
 * can be used.
 */

import { describe, expect, it } from 'vitest';

import { npcServiceIcon, objectServiceIcon } from '../src/assets/serviceIcons';

const bit = (...bits: number[]) => bits.reduce((flags, b) => (flags | (1 << b)) >>> 0, 0);
const icon = (name: string) => `ui/icons/head/ui_head_${name}.png`;

const GOSSIP = 0;
const QUESTS = 1;
const VENDOR = 2;

describe('the icon an NPC wears', () => {
  it('wears nothing when it offers nothing', () => {
    expect(npcServiceIcon(0)).toBeUndefined();
  });

  it('shows a speech bubble for an NPC that only talks', () => {
    expect(npcServiceIcon(bit(GOSSIP))).toBe(icon('chat'));
  });

  it('leaves quest business to the quest marks', () => {
    // The quest giver's "!" follows what the server says about this player,
    // so the flag alone puts nothing overhead.
    expect(npcServiceIcon(bit(QUESTS))).toBeUndefined();
    expect(npcServiceIcon(bit(QUESTS, GOSSIP))).toBe(icon('chat'));
  });

  it('shows what a shop sells, and only when it sells', () => {
    expect(npcServiceIcon(bit(VENDOR, 5))).toBe(icon('weapon'));
    expect(npcServiceIcon(bit(VENDOR, 6))).toBe(icon('armor'));
    expect(npcServiceIcon(bit(VENDOR, 3, GOSSIP))).toBe(icon('food'));
    expect(npcServiceIcon(bit(VENDOR, 31))).toBe(icon('soul'));
    // The same category bit on an NPC that does not sell is not a shop.
    expect(npcServiceIcon(bit(31))).toBeUndefined();
    expect(npcServiceIcon(bit(5, GOSSIP))).toBe(icon('chat'));
  });

  it('puts a class or craft trainer above the shop it also runs', () => {
    expect(npcServiceIcon(bit(VENDOR, 4, 27))).toBe(icon('book_mage'));
    expect(npcServiceIcon(bit(VENDOR, 10))).toBe(icon('foundry'));
    expect(npcServiceIcon(bit(GOSSIP, VENDOR, 29))).toBe(icon('book_ranger'));
  });

  it('puts a service window above a shop, and a shop above talk', () => {
    expect(npcServiceIcon(bit(GOSSIP, VENDOR, 16))).toBe(icon('guild'));
    expect(npcServiceIcon(bit(GOSSIP, 25))).toBe(icon('teleport'));
    expect(npcServiceIcon(bit(VENDOR, 4, 21))).toBe(icon('auction'));
    expect(npcServiceIcon(bit(GOSSIP, VENDOR, 22))).toBe(icon('mount'));
  });

  it('shows nothing for a flag no NPC in the tables carries', () => {
    expect(npcServiceIcon(bit(VENDOR, 9))).toBeUndefined();
    expect(npcServiceIcon(bit(14))).toBeUndefined();
  });

  it('reads the top flag bit as a flag, not a sign', () => {
    expect(npcServiceIcon((1 << 31) | (1 << VENDOR))).toBe(icon('soul'));
  });
});

describe('the icon an object wears', () => {
  it('names each usable kind', () => {
    expect(objectServiceIcon(2, true)).toBe(icon('board'));
    expect(objectServiceIcon(8, true)).toBe(icon('mail'));
    expect(objectServiceIcon(9, true)).toBe(icon('storage'));
    expect(objectServiceIcon(12, true)).toBe(icon('arena'));
    expect(objectServiceIcon(105, true)).toBe(icon('summon'));
  });

  it('wears nothing when it cannot be used, or is some other kind', () => {
    expect(objectServiceIcon(8, false)).toBeUndefined();
    expect(objectServiceIcon(8, undefined)).toBeUndefined();
    expect(objectServiceIcon(6, true)).toBeUndefined();
    expect(objectServiceIcon(undefined, true)).toBeUndefined();
  });
});
