import { describe, expect, it, vi } from 'vitest';
import { UiArt } from '../src/app/UiArt';
import type { ResourceSystem } from '../src/assets/ResourceSystem';

/** Only the lookups a case names; anything else is a bug in the case. */
function art(lookups: Record<string, (...args: never[]) => Promise<unknown>>): UiArt {
  return new UiArt(lookups as unknown as ResourceSystem);
}

describe('UiArt', () => {
  it('asks for a spell’s picture, name and words once however often it is wanted', async () => {
    const spellIcon = vi.fn(async () => null);
    const spellName = vi.fn(async () => null);
    const spellText = vi.fn(async () => null);
    const ui = art({ spellIcon, spellName, spellText });
    await ui.loadSpellDetails([1, 2]);
    await ui.loadSpellDetails([2, 3]);
    expect(spellIcon.mock.calls.map(call => call[0 as never])).toEqual([1, 2, 3]);
    expect(spellName).toHaveBeenCalledTimes(3);
    expect(spellText).toHaveBeenCalledTimes(3);
  });

  it('asks for a talent’s words once, and survives a failed read', async () => {
    const spellString = vi
      .fn<(id: number) => Promise<string | null>>()
      .mockRejectedValueOnce(new Error('no pack'))
      .mockResolvedValue(null);
    const ui = art({ spellString });
    await expect(ui.loadTalentWords([7, 8])).resolves.toBeUndefined();
    await ui.loadTalentWords([7, 8]);
    expect(spellString).toHaveBeenCalledTimes(2);
  });

  it('asks for an emblem once', async () => {
    const uiIcon = vi.fn(async () => null);
    const ui = art({ uiIcon });
    await ui.loadUiEmblems(['a', 'b']);
    await ui.loadUiEmblems(['b', 'c']);
    expect(uiIcon).toHaveBeenCalledTimes(3);
  });

  it('asks again for dialogs when the movie was not mounted the first time', async () => {
    const uiSkin = vi.fn(async () => null);
    const uiStrings = vi.fn(async () => null);
    const ui = art({ uiSkin, uiStrings });
    await ui.loadUiDialogs([{ movie: 'IGM', dialog: 'x' }]);
    await ui.loadUiDialogs([{ movie: 'IGM', dialog: 'x' }]);
    expect(uiSkin).toHaveBeenCalledTimes(2);
  });
});

describe('UiArt item art', () => {
  it('reads an item’s description only when its prototype names one', async () => {
    const itemText = vi.fn(async () => null);
    const lookups = {
      itemName: vi.fn(async () => null),
      itemFacts: vi.fn(async () => null),
      itemIcon: vi.fn(async () => null),
      itemText,
    };
    const ui = art(lookups);
    const withText = { entry: 1, prototype: { descriptionStringId: 9 } };
    const without = { entry: 2, prototype: { descriptionStringId: 0 } };
    ui.resolveItemArt(withText as never);
    ui.resolveItemArt(without as never);
    expect(itemText.mock.calls).toEqual([[9]]);
    expect(lookups.itemIcon).toHaveBeenCalledTimes(2);
  });
});
