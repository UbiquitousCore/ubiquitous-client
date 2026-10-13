/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:topbar', width: 220, height: 100 }),
}));
vi.mock('../../src/ui/iconUrl', () => ({ iconUrl: () => 'icon:stub' }));

import { ArtTopbarMenu } from '../../src/ui/components/ArtTopbarMenu';
import type { TopbarAction } from '../../src/ui/components/ArtTopbarMenu';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { setClassIcon, setTopbarIcon } from '../../src/ui/topbarIconStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix,
  name,
  opacity: 1,
});

/** `dlgTopBar`'s own shape: a name banner, and a button panel nested three
 * deep (`panelToolBar/group/btn0N`), the same paths a spec keys off. */
function skin(): UiSkinData {
  const rect = (name: string, x: number, y = 0): UiSkinPlaced => place(11, at(x, y), name);
  return {
    movie: 'TEST',
    width: 220,
    height: 100,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 40, h: 40 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 40L0 40Z' }],
      },
    ],
    sprites: [
      {
        id: 30,
        frameCount: 1,
        frames: [
          [
            rect('btn01', 0, 0),
            rect('btn02', 44, 0),
            rect('btn03', 88, 0),
            rect('btn04', 132, 0),
            rect('btn05', 0, 44),
            rect('btn06', 44, 44),
            rect('btn07', 88, 44),
            rect('btn08', 132, 44),
          ],
        ],
      },
      {
        id: 21,
        frameCount: 1,
        frames: [
          [
            place(30, at(0, 0), 'group'),
            rect('background', 0, 0),
            rect('sideLarge', 0, 0),
            rect('sideSmall', 0, 0),
            rect('sideTop', 0, 0),
          ],
        ],
      },
      { id: 22, frameCount: 1, frames: [[rect('textName', 0, 0)]] },
      { id: 23, frameCount: 1, frames: [[rect('back', 0, 0)]] },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(22, at(0, 0), 'panelName'),
            place(21, at(0, 20), 'panelToolBar'),
            place(23, at(200, 0), 'targetclass'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, at(0, 0), 'dlgTopBar')]],
  };
}

const spec = {
  screens: {
    topbarMenu: {
      dialog: 'dlgTopBar',
      frame: ['panelName', 'panelToolBar', 'targetclass'],
      actions: {
        'panelToolBar/group/btn01': 'slot1',
        'panelToolBar/group/btn02': 'slot2',
        'panelToolBar/group/btn03': 'slot3',
        'panelToolBar/group/btn04': 'slot4',
        'panelToolBar/group/btn05': 'slot5',
        'panelToolBar/group/btn06': 'slot6',
        'panelToolBar/group/btn07': 'slot7',
        'panelToolBar/group/btn08': 'slot8',
      },
      values: {
        name: 'panelName/textName',
      },
      groups: { banner: 'panelName', badge: 'targetclass' },
    },
  },
};

const action = (
  icon: TopbarAction['icon'],
  label: string,
  extra: Partial<TopbarAction> = {},
): TopbarAction => ({
  icon,
  label,
  onPick: vi.fn(),
  ...extra,
});

const nothing = { name: 'Rock Elemental' };

describe('ArtTopbarMenu', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByText } = render(<ArtTopbarMenu {...nothing} actions={[]} />);
    expect(queryByText('Rock Elemental')).toBeNull();
  });

  it('shows its own name banner with no actions to open, and nothing to tap', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByText, queryByRole } = render(<ArtTopbarMenu {...nothing} actions={[]} />);
    expect(getByText('Rock Elemental')).toBeTruthy();
    expect(queryByRole('button')).toBeNull();
  });

  it('opens onto exactly as many actions as it was given, not every slot the piece has', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByRole, getAllByRole } = render(
      <ArtTopbarMenu
        {...nothing}
        actions={[action('whisper', 'Whisper'), action('trade', 'Trade')]}
      />,
    );
    fireEvent.click(getByRole('button'));
    expect(getAllByRole('menuitem')).toHaveLength(2);
  });

  it('names each slot with whatever the caller called it, not a game caption', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByRole, getByLabelText } = render(
      <ArtTopbarMenu {...nothing} actions={[action('invite', 'Invite to team')]} />,
    );
    fireEvent.click(getByRole('button'));
    expect(getByLabelText('Invite to team')).toBeTruthy();
  });

  it('picks the action that was pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onPick = vi.fn();
    const { getByRole, getByLabelText } = render(
      <ArtTopbarMenu {...nothing} actions={[action('duel', 'Duel', { onPick })]} />,
    );
    fireEvent.click(getByRole('button'));
    fireEvent.click(getByLabelText('Duel'));
    expect(onPick).toHaveBeenCalled();
  });

  it('closes back to just the name once an action is picked — one pick is the whole errand', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByRole, queryByRole } = render(
      <ArtTopbarMenu {...nothing} actions={[action('duel', 'Duel')]} />,
    );
    fireEvent.click(getByRole('button'));
    expect(queryByRole('menu')).not.toBeNull();
    fireEvent.click(getByRole('menuitem', { name: 'Duel' }));
    expect(queryByRole('menu')).toBeNull();
  });

  it('stays open when a press lands anywhere else — only picking an action closes it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByRole, queryByRole } = render(
      <ArtTopbarMenu {...nothing} actions={[action('observe', 'Inspect')]} />,
    );
    fireEvent.click(getByRole('button'));
    fireEvent.pointerDown(document.body);
    expect(queryByRole('menu')).not.toBeNull();
  });

  it('opens from a tap on the banner, and a second tap leaves it open', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByRole, queryByRole } = render(
      <ArtTopbarMenu {...nothing} actions={[action('observe', 'Inspect')]} />,
    );
    const trigger = getByRole('button');
    fireEvent.click(trigger);
    expect(queryByRole('menu')).not.toBeNull();
    fireEvent.click(trigger);
    expect(queryByRole('menu')).not.toBeNull();
  });

  it('shows a resolved icon for a slot, and its caption where none has resolved yet', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setTopbarIcon('whisper', {} as ImageBitmap);
    const { getByRole, getByLabelText } = render(
      <ArtTopbarMenu
        {...nothing}
        actions={[action('whisper', 'Whisper'), action('trade', 'Trade')]}
      />,
    );
    fireEvent.click(getByRole('button'));
    expect(getByLabelText('Whisper').querySelector('img')).not.toBeNull();
    expect(getByLabelText('Trade').querySelector('img')).toBeNull();
    expect(getByLabelText('Trade').textContent).toBe('Trade');
  });

  it('shows whoever the toolbar belongs to', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByText } = render(
      <ArtTopbarMenu {...nothing} actions={[action('whisper', 'Whisper')]} />,
    );
    expect(getByText('Rock Elemental')).toBeTruthy();
  });
});

describe('ArtTopbarMenu badge and open state', () => {
  it('shows a player’s class picture in the badge, and no picture where there is no class', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setClassIcon(1, {} as ImageBitmap);
    const withClass = render(<ArtTopbarMenu name="Ayla" classId={1} actions={[]} />);
    expect(
      [...withClass.container.querySelectorAll('img')].some(
        img => img.getAttribute('src') === 'icon:stub',
      ),
    ).toBe(true);
    withClass.unmount();
    const creature = render(<ArtTopbarMenu name="Wolf" actions={[]} />);
    expect(
      [...creature.container.querySelectorAll('img')].some(
        img => img.getAttribute('src') === 'icon:stub',
      ),
    ).toBe(false);
  });

  it('opens when the caller says so, and tells the caller when it closes', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onOpenChange = vi.fn();
    const { getByRole } = render(
      <ArtTopbarMenu
        name="Ayla"
        open
        onOpenChange={onOpenChange}
        actions={[action('duel', 'Duel')]}
      />,
    );
    expect(getByRole('menu')).toBeTruthy();
    fireEvent.click(getByRole('menuitem', { name: 'Duel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
