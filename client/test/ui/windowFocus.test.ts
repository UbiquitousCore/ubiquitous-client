import { afterEach, describe, expect, it } from 'vitest';

import {
  closeCharacterWindow,
  closeShop,
  openCharacterWindow,
  openScreen,
  shopInteraction,
  showShop,
} from '../../src/ui/hudStore';
import { closeMail, mailOpen, setMailOpened } from '../../src/ui/mailStore';
import { installWindowFocus, windowsToShut } from '../../src/ui/windowFocus';

const none = { menu: false, npc: [false, false, false] };

describe('windowsToShut', () => {
  it('puts the NPC windows away when the character window opens', () => {
    expect(
      windowsToShut(
        { menu: false, npc: [true, false, true] },
        { menu: true, npc: [true, false, true] },
      ),
    ).toEqual({ menu: false, npc: [0, 2] });
  });

  it('puts the character window and any other NPC window away when an NPC window opens', () => {
    expect(
      windowsToShut(
        { menu: true, npc: [true, false, false] },
        { menu: true, npc: [true, true, false] },
      ),
    ).toEqual({ menu: true, npc: [0] });
  });

  it('leaves the character window opened beside a shop to sell from', () => {
    expect(
      windowsToShut(
        { menu: false, npc: [true, false, false] },
        { menu: true, npc: [true, false, false] },
        true,
      ),
    ).toEqual({ menu: false, npc: [] });
  });

  it('shuts nothing when nothing opened', () => {
    expect(windowsToShut(none, none)).toEqual({ menu: false, npc: [] });
  });
});

describe('installWindowFocus', () => {
  let stop: () => void = () => {};
  afterEach(() => {
    stop();
    closeCharacterWindow();
    closeShop();
    closeMail();
  });

  const shop = () =>
    showShop({
      vendorName: 'Nick',
      currency: 'gold',
      items: [],
      onBuy: () => {},
      onSell: () => {},
    });

  it('closes the mailbox when the hero opens the character window', () => {
    stop = installWindowFocus();
    setMailOpened(true);
    openCharacterWindow('bag');
    expect(mailOpen.value).toBe(false);
    expect(openScreen.value).toBe('bag');
  });

  it('closes the character window when a vendor is spoken to', () => {
    stop = installWindowFocus();
    openCharacterWindow('bag');
    shop();
    expect(openScreen.value).toBeNull();
    expect(shopInteraction.value?.vendorName).toBe('Nick');
  });

  it('keeps a shop open while its bag is opened beside it to sell', () => {
    stop = installWindowFocus();
    shop();
    openCharacterWindow('bag', true);
    expect(shopInteraction.value).not.toBeNull();
    expect(openScreen.value).toBe('bag');
  });
});
