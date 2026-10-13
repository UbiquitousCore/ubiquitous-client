/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:sheet', width: 200, height: 200 }),
}));

import {
  ArtCharacterWindow,
  bodyDrop,
  sheetBars,
  sheetFigure,
} from '../../src/ui/components/ArtCharacterWindow';
import { setMovie, wantedDialogs, wantedEmblems } from '../../src/ui/art/pieceStore';
import { SCREEN_MEANINGS } from '../../src/ui/art/screenMeanings';
import { EQUIPMENT_SLOTS } from '../../src/ui/items';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { inventory, itemFacts } from '../../src/ui/inventoryStore';
import { heroClass, heroSheet, heroStats, player, worldUnits } from '../../src/ui/hudStore';
import type { InventoryItem } from '../../src/ui/inventoryStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
  inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [] };
  worldUnits.value = [];
  itemFacts.value = new Map();
  heroStats.value = null;
  heroSheet.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number | null,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({ depth: 1, characterId: characterId as number, matrix, name, opacity: 1 });

/**
 * The smallest sheet: a backdrop, a page of two places on the body laid
 * out as points the way the movie lays them out, and a way to shut it.
 */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 200, h: 200 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 200L0 200Z' }],
      },
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 20, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L20 0L20 20L0 20Z' }],
      },
    ],
    sprites: [
      { id: 31, frameCount: 1, frames: [[place(null, at(0, 0), 'displayCallback')]] },
      {
        id: 30,
        frameCount: 1,
        frames: [[place(31, at(10, 10), 'btn01'), place(31, at(10, 60), 'btn02')]],
      },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            place(30, at(0, 0), 'equip'),
            place(11, at(150, 0), 'shut'),
            place(11, at(0, 0), 'tab'),
            place(11, at(40, 0), 'other'),
            place(11, at(0, 140), 'who'),
            place(11, at(0, 160), 'rank'),
            place(11, at(0, 180), 'str'),
            place(11, at(60, 180), 'strnum'),
            place(11, at(0, 190), 'agi'),
            place(11, at(60, 190), 'aginum'),
            place(11, at(60, 200), 'armnum'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, at(0, 0), 'theSheet')]],
  } as unknown as UiSkinData;
}

const spec = {
  screens: {
    character: {
      dialog: 'theSheet',
      frame: 'back',
      close: 'shut',
      panels: { equipment: 'equip', attributes: 'sheet' },
      tabs: [
        { control: 'tab', text: 'tab', panel: 'equip', caption: 'Worn' },
        {
          control: 'other',
          text: 'other',
          panel: 'sheet',
          caption: 'Numbers',
          openTone: '#330033',
        },
      ],
      values: { name: 'who', level: 'rank' },
      formats: { level: 'Rank %d' },
      grids: {
        equipment: {
          slot: 'btn',
          within: 'equip',
          face: 'displayCallback',
          size: { w: 33, h: 34, dy: -1 },
        },
      },
    },
  },
};

const worn = (id: string, index: number, entry: number): InventoryItem =>
  ({ id, entry, count: 1, slot: { area: 'equipment', index } }) as InventoryItem;

describe('the places on the body with nothing in them', () => {
  const grid = SCREEN_MEANINGS.character!.grids!.equipment as {
    empty?: { icons: string[]; size: number };
  };

  it('has an outline for every place the server keeps, in its order', () => {
    expect(grid.empty?.icons).toHaveLength(EQUIPMENT_SLOTS.length);
    // Head first, what is fired last: the outline is the place's own.
    expect(grid.empty?.icons[0]).toMatch(/head/);
    expect(grid.empty?.icons.at(-1)).toMatch(/ranged/);
  });

  it("names every one of the server's slots once among the places", () => {
    const holds = (SCREEN_MEANINGS.character!.grids!.equipment as { holds?: string[] }).holds;
    expect([...(holds ?? [])].sort()).toEqual([...EQUIPMENT_SLOTS].sort());
  });

  it('draws the outline in each empty place and none under a thing worn', () => {
    wantedEmblems.value = [];
    const sheet = spec.screens.character;
    uiSpec.value = {
      screens: {
        character: {
          ...sheet,
          grids: { equipment: { ...sheet.grids.equipment, empty: grid.empty! } },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [worn('hat', 0, 5)] };
    render(<ArtCharacterWindow onClose={() => undefined} />);
    expect(wantedEmblems.value).toEqual([grid.empty!.icons[1]]);
  });
});

describe('ArtCharacterWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtCharacterWindow onClose={() => undefined} />);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('keeps a place on the body that the movie lays out as a point', () => {
    // The movie says where a thing goes and the thing is drawn at a size
    // of its own. Counted out for drawing nothing, the whole run of them
    // disappears; drawn from the point alone, each is a thing of no size.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container } = render(<ArtCharacterWindow onClose={() => undefined} />);
    const places = Array.from(container.querySelectorAll('[data-drop-slot]'));
    expect(places.map(one => one.getAttribute('data-drop-slot'))).toEqual([
      'equipment:0',
      'equipment:1',
    ]);
    expect((places[0] as HTMLElement).style.width).not.toBe('');
  });

  it('puts each place on the slot the spec says it holds', () => {
    const sheet = spec.screens.character;
    uiSpec.value = {
      screens: {
        character: {
          ...sheet,
          grids: { equipment: { ...sheet.grids.equipment, holds: ['Hands', 'Head'] } },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [worn('gloves', 3, 7)] };
    const { container } = render(<ArtCharacterWindow onClose={() => undefined} />);
    const places = Array.from(container.querySelectorAll('[data-drop-slot]'));
    expect(places.map(one => one.getAttribute('data-drop-slot'))).toEqual([
      'equipment:3',
      'equipment:0',
    ]);
    expect(places[0]?.getAttribute('title')).toBeTruthy();
  });

  it('shows what is worn where it is worn', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [worn('a', 1, 7)] };
    const { container } = render(<ArtCharacterWindow onClose={() => undefined} />);
    const second = container.querySelector('[data-drop-slot="equipment:1"]');
    expect(second?.getAttribute('title')).toBeTruthy();
    expect(container.querySelector('[data-drop-slot="equipment:0"]')?.getAttribute('title')).toBe(
      null,
    );
  });

  it('closes when the control the spec names is pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onClose = vi.fn();
    const { getByLabelText } = render(<ArtCharacterWindow onClose={onClose} />);
    fireEvent.click(getByLabelText(/close the character sheet/i));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('what a drag onto or off the body means', () => {
  it('takes a thing off when it is dragged into a store', () => {
    expect(bodyDrop({ area: 'equipment', index: 3 }, { area: 'bag', index: 0 })).toBe('remove');
  });

  it('wears a thing dragged out of a store', () => {
    expect(bodyDrop({ area: 'bag', index: 0 }, { area: 'equipment', index: 3 })).toBe('wear');
  });

  it('refuses a move from one body place to another, and a drop over nothing', () => {
    // Body to body, and a drop over nothing.
    expect(bodyDrop({ area: 'equipment', index: 3 }, { area: 'equipment', index: 4 })).toBeNull();
    expect(bodyDrop({ area: 'equipment', index: 3 }, null)).toBeNull();
  });
});

describe('the page of plain facts', () => {
  it('writes only what the wire actually carries', () => {
    // The rest of that page asks for numbers this client is never sent,
    // and a figure made up here would be worse than a blank.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    heroClass.value = 0;
    player.value = {
      id: 'player',
      name: 'Someone',
      level: 40,
      health: 10,
      maxHealth: 20,
      mana: 0,
      maxMana: 0,
      disposition: 'friendly',
    } as (typeof player)['value'];
    const { getByText, getByLabelText } = render(<ArtCharacterWindow onClose={() => undefined} />);
    fireEvent.click(getByLabelText('Numbers'));
    expect(getByText('Someone')).toBeTruthy();
    expect(getByText('Rank 40')).toBeTruthy();
  });
});

describe('the four attributes', () => {
  const RAISED = 'rgb(0, 128, 0)';
  const withStats = {
    screens: {
      character: {
        ...spec.screens.character,
        values: {
          ...spec.screens.character.values,
          strengthName: 'str',
          strength: 'strnum',
          agilityName: 'agi',
          agility: 'aginum',
          armor: 'armnum',
        },
        formats: { ...spec.screens.character.formats, strength: 'Strength', agility: 'Agility' },
        tones: { raised: RAISED },
        hidden: ['str', 'strnum', 'agi', 'aginum', 'armnum'],
      },
    },
  };
  const hero = {
    id: 'player',
    name: 'Someone',
    level: 17,
    health: 10,
    maxHealth: 20,
    mana: 0,
    maxMana: 0,
    disposition: 'friendly',
  } as (typeof player)['value'];

  it('writes each one, in green where something stands on top of it', () => {
    uiSpec.value = withStats;
    setMovie({ skin: skin(), art: new Map() });
    player.value = hero;
    heroStats.value = {
      strength: { value: 26, base: 21 },
      agility: { value: 21, base: 21 },
      stamina: { value: 28, base: 28 },
      wisdom: { value: 38, base: 38 },
    };
    const { getByText, getByLabelText } = render(<ArtCharacterWindow onClose={() => undefined} />);
    fireEvent.click(getByLabelText('Numbers'));
    expect(getByText('Strength')).toBeTruthy();
    expect(getByText('26').style.color).toBe(RAISED);
    expect(getByText('Agility')).toBeTruthy();
    expect(getByText('21').style.color).not.toBe(RAISED);
  });

  it('writes the armour once the server has said it, and not before', () => {
    uiSpec.value = withStats;
    setMovie({ skin: skin(), art: new Map() });
    player.value = hero;
    const first = render(<ArtCharacterWindow onClose={() => undefined} />);
    fireEvent.click(first.getByLabelText('Numbers'));
    expect(first.queryByText('135')).toBeNull();
    cleanup();

    heroSheet.value = { armor: 135 };
    const { getByText, getByLabelText } = render(<ArtCharacterWindow onClose={() => undefined} />);
    fireEvent.click(getByLabelText('Numbers'));
    expect(getByText('135')).toBeTruthy();
  });

  it('writes a chance as a percent to two places, and anything else whole', () => {
    expect(sheetFigure({ hitChance: 9500 }, 'hitChance')).toBe('95.00%');
    expect(sheetFigure({ armorMitigation: 135 }, 'armorMitigation')).toBe('1.35%');
    expect(sheetFigure({ attackPower: 64 }, 'attackPower')).toBe('64');
    expect(sheetFigure({}, 'parryChance')).toBe('');
    expect(sheetFigure(null, 'attackPower')).toBe('');
  });

  it('leaves them off until the server has said them', () => {
    uiSpec.value = withStats;
    setMovie({ skin: skin(), art: new Map() });
    player.value = hero;
    const { queryByText, getByLabelText } = render(
      <ArtCharacterWindow onClose={() => undefined} />,
    );
    fireEvent.click(getByLabelText('Numbers'));
    expect(queryByText('Strength')).toBeNull();
  });

  it("leaves them off somebody else's sheet, whose figures are never sent", () => {
    uiSpec.value = withStats;
    setMovie({ skin: skin(), art: new Map() });
    heroStats.value = {
      strength: { value: 26, base: 21 },
      agility: { value: 21, base: 21 },
      stamina: { value: 28, base: 28 },
      wisdom: { value: 38, base: 38 },
    };
    const { queryByText, getByLabelText } = render(
      <ArtCharacterWindow
        of={{ unitId: 'u2', name: 'Ayla', equipment: [] }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(getByLabelText('Numbers'));
    expect(queryByText('Strength')).toBeNull();
  });
});

describe('choosing what to wear', () => {
  it('opens the list only where something in the bag could go there', () => {
    // A place there is nothing to put in is not worth opening. The build
    // asks the same question and shows nothing when the answer is
    // nothing.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 4, bankSlotCount: 0, items: [] };
    const { container, queryByRole } = render(<ArtCharacterWindow onClose={() => undefined} />);
    const place = container.querySelector('[data-drop-slot="equipment:0"]') as HTMLElement;
    fireEvent.click(place);
    expect(queryByRole('dialog', { name: /choose what to wear/i })).toBeNull();
  });
});

describe("somebody else's sheet", () => {
  const ayla = { unitId: 'u2', name: 'Ayla', equipment: [5, 0] };

  it('shows what they wear, not what the hero wears, and takes no drop anywhere', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [worn('a', 1, 7)] };
    const { container, getByRole } = render(
      <ArtCharacterWindow of={ayla} onClose={() => undefined} />,
    );
    expect(getByRole('dialog', { name: "Ayla's character" })).toBeTruthy();
    expect(container.querySelector('[data-drop-slot]')).toBeNull();
    const titled = [...container.querySelectorAll('[title]')].map(one => one.getAttribute('title'));
    expect(titled).toEqual(['Item 5']);
  });

  it('writes their name and level, from what the world knows of them', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    worldUnits.value = [
      {
        id: 'u2',
        name: 'Ayla',
        level: 12,
        health: 1,
        maxHealth: 1,
        mana: 0,
        maxMana: 0,
        disposition: 'friendly',
        kind: 'player',
      },
    ];
    const { getByText, getByLabelText } = render(
      <ArtCharacterWindow of={ayla} onClose={() => undefined} />,
    );
    fireEvent.click(getByLabelText('Numbers'));
    expect(getByText('Rank 12')).toBeTruthy();
  });

  it('opens nothing to choose from when one of their places is pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container, queryByRole } = render(
      <ArtCharacterWindow of={ayla} onClose={() => undefined} />,
    );
    fireEvent.click(container.querySelector('[title="Item 5"]') as HTMLElement);
    expect(queryByRole('dialog', { name: /choose what to wear/i })).toBeNull();
  });

  it('closes from the same control, named for whose sheet it is', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onClose = vi.fn();
    const { getByLabelText } = render(<ArtCharacterWindow of={ayla} onClose={onClose} />);
    fireEvent.click(getByLabelText("Close Ayla's sheet"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the bars on the page of plain facts', () => {
  const bars = {
    frames: 50,
    of: { exp: 'xp', health: 'hp', mana: 'mp', morale: 'rage', vigor: 'power' },
  };
  const hero = { exp: 25, expToLevel: 100, health: 100, maxHealth: 100, mana: 0, maxMana: 80 };

  it('turns each bar to the face for how full it is: full first, empty last', () => {
    expect(sheetBars(hero, bars, 'mana').frames).toEqual({ xp: 37, hp: 0, mp: 50 });
  });

  it('draws a bar with nothing to measure against as empty', () => {
    expect(sheetBars({ ...hero, expToLevel: 0 }, bars, 'mana').frames.xp).toBe(50);
  });

  it('fills the bar of what the class spends, and leaves the other two out', () => {
    const { frames, hidden } = sheetBars({ ...hero, mana: 40 }, bars, 'morale');
    expect(frames.rage).toBe(25);
    expect(frames.mp).toBeUndefined();
    expect(hidden).toEqual(['mp', 'power']);
    expect(sheetBars(hero, bars, 'vigor').hidden).toEqual(['mp', 'rage']);
    expect(sheetBars(hero, bars, 'mana').hidden).toEqual(['rage', 'power']);
  });

  it('keeps the mana bar for a class whose own bar the build does not carry', () => {
    const plain = { frames: 50, of: { exp: 'xp', health: 'hp', mana: 'mp' } };
    const { frames, hidden } = sheetBars({ ...hero, mana: 40 }, plain, 'vigor');
    expect(frames.mp).toBe(25);
    expect(hidden).toEqual([]);
  });
});
