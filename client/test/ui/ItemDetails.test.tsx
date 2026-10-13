/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { InventoryItem } from '../../src/net/GameConnection';
import { setUiWords } from '../../src/ui/art/pieceStore';
import { ItemDetails } from '../../src/ui/components/ItemDetails';
import { LINES } from '../../src/ui/gameLines';

afterEach(() => {
  cleanup();
  setUiWords([]);
});

function item(requiredLevel = 0): InventoryItem {
  return {
    id: 'a',
    slot: { area: 'bag', index: 0 },
    entry: 100,
    quality: 2,
    count: 1,
    durability: 0,
    maxDurability: 0,
    stats: [],
    prototype: {
      maxStack: 1,
      damage: [],
      armour: 0,
      delay: 0,
      requiredLevel,
      spells: [],
      inventoryType: 0,
      descriptionStringId: 900,
    },
  } as unknown as InventoryItem;
}

describe('ItemDetails', () => {
  it('reads the item its description once it is resolved', () => {
    const { container } = render(
      <ItemDetails
        item={item()}
        name="Old key"
        description="Opens a door somebody forgot."
        onClose={() => {}}
      />,
    );
    expect(container.textContent).toContain('Opens a door somebody forgot.');
  });

  it('says nothing where there is no description yet', () => {
    const { container } = render(<ItemDetails item={item()} name="Old key" onClose={() => {}} />);
    expect(container.textContent).toContain('Old key');
    expect(container.textContent).not.toContain('undefined');
  });

  it("writes a level requirement in the user's own words, level filled in", () => {
    const words = Array.from({ length: 1911 }, (_, i) => `word ${i}`);
    words[LINES.requiresLevel.at[1911]!] = 'SYNTHETIC LEVEL %d';
    setUiWords(words);
    const { container } = render(<ItemDetails item={item(7)} name="Old key" onClose={() => {}} />);
    expect(container.textContent).toContain('SYNTHETIC LEVEL 7');
  });

  it('writes a level requirement in its own words before the strings arrive', () => {
    const { container } = render(<ItemDetails item={item(7)} name="Old key" onClose={() => {}} />);
    expect(container.textContent).toContain('Needs level 7');
  });
});
