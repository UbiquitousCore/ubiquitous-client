import { describe, expect, it } from 'vitest';

import {
  bareCoins,
  coinsOf,
  formatMoney,
  namedCoins,
  purseOf,
  splitCoins,
} from '../../src/ui/money';

describe('formatMoney', () => {
  it('splits copper into gold, silver and copper', () => {
    expect(formatMoney(10_205)).toBe('1 gold 2 silver 5 copper');
    expect(formatMoney(99)).toBe('99 copper');
    expect(formatMoney(100)).toBe('1 silver');
  });

  it('names only the denominations that are there', () => {
    // The game writes "1 gold 5 copper", never a zero silver in
    // the middle.
    expect(formatMoney(10_005)).toBe('1 gold 5 copper');
    expect(formatMoney(10_000)).toBe('1 gold');
    expect(formatMoney(10_100)).toBe('1 gold 1 silver');
  });

  it('has something to say about an empty purse', () => {
    expect(formatMoney(0)).toBe('0 copper');
    expect(formatMoney(-5)).toBe('0 copper');
  });
});

describe('the coins a sum is written in', () => {
  it('names only the coins that are there, from the top down', () => {
    // A bare "0" against a gold piece reads as a sum of nothing.
    expect(coinsOf(0)).toEqual({ gold: '', silver: '', copper: '' });
    expect(coinsOf(1)).toEqual({ gold: '', silver: '', copper: '1' });
    expect(coinsOf(40)).toEqual({ gold: '', silver: '', copper: '40' });
  });

  it('writes a silver and a copper as one of each, not as a hundred and one', () => {
    expect(coinsOf(101)).toEqual({ gold: '', silver: '1', copper: '1' });
  });

  it('keeps a zero under a coin that is there', () => {
    // Forty silver exactly is "40 silver 0 copper": the copper is named
    // because there is a sum at all, and only the empty coins above it go.
    expect(coinsOf(4_000)).toEqual({ gold: '', silver: '40', copper: '0' });
    expect(coinsOf(10_000)).toEqual({ gold: '1', silver: '0', copper: '0' });
  });

  it('splits a full sum the way the wire counts it', () => {
    expect(coinsOf(12_345)).toEqual({ gold: '1', silver: '23', copper: '45' });
  });

  it('never writes a negative or a fraction', () => {
    expect(coinsOf(-5)).toEqual({ gold: '', silver: '', copper: '' });
    expect(coinsOf(100.6)).toEqual({ gold: '', silver: '1', copper: '1' });
  });
});

describe('what a player is carrying', () => {
  it('writes an empty purse as nothing but a zero in the lowest coin', () => {
    // The coins stand on the screen either way; with no figure beside
    // any of them the purse reads as never filled in.
    expect(purseOf(0)).toEqual({ gold: '', silver: '', copper: '0' });
    expect(purseOf(-5)).toEqual({ gold: '', silver: '', copper: '0' });
  });

  it('otherwise writes a purse exactly as any other sum', () => {
    expect(purseOf(5_000)).toEqual(coinsOf(5_000));
    expect(purseOf(12_345)).toEqual({ gold: '1', silver: '23', copper: '45' });
  });
});

describe('the coins with nothing beside them', () => {
  const pictures = { gold: 'money/iconGold', silver: 'money/iconSilver', copper: 'money/iconIron' };

  it('names the picture of every coin the sum leaves unwritten', () => {
    expect(bareCoins(pictures, purseOf(5_000))).toEqual(['money/iconGold']);
    expect(bareCoins(pictures, purseOf(0))).toEqual(['money/iconGold', 'money/iconSilver']);
    expect(bareCoins(pictures, purseOf(12_345))).toEqual([]);
  });

  it('leaves alone a picture that is not a coin of the sum', () => {
    expect(bareCoins({ ...pictures, upgrade: 'offer/coin' }, purseOf(12_345))).toEqual([]);
    expect(bareCoins(undefined, purseOf(0))).toEqual([]);
  });
});

describe('a sum split at the edges of each coin', () => {
  it('turns a hundred copper into a silver and ten thousand into a gold', () => {
    expect(splitCoins(99)).toEqual({ gold: 0, silver: 0, copper: 99 });
    expect(splitCoins(100)).toEqual({ gold: 0, silver: 1, copper: 0 });
    expect(splitCoins(102)).toEqual({ gold: 0, silver: 1, copper: 2 });
    expect(splitCoins(9_999)).toEqual({ gold: 0, silver: 99, copper: 99 });
    expect(splitCoins(10_000)).toEqual({ gold: 1, silver: 0, copper: 0 });
    expect(splitCoins(10_102)).toEqual({ gold: 1, silver: 1, copper: 2 });
  });

  it('writes a price in the coins it has and no others', () => {
    expect(namedCoins(99)).toEqual({ copper: '99' });
    expect(namedCoins(100)).toEqual({ silver: '1' });
    expect(namedCoins(102)).toEqual({ silver: '1', copper: '2' });
    expect(namedCoins(10_000)).toEqual({ gold: '1' });
    expect(namedCoins(10_102)).toEqual({ gold: '1', silver: '1', copper: '2' });
    expect(namedCoins(0)).toEqual({});
    expect(formatMoney(102)).toBe('1 silver 2 copper');
  });
});
