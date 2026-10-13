/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:mail', width: 200, height: 200 }),
}));

import { ArtMailWindow } from '../../src/ui/components/ArtMailWindow';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { itemNames } from '../../src/ui/inventoryStore';
import type { MailInboxEntry, MailMessage } from '../../src/ui/mailStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
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

/** A mailbox with a run of four rows shown through a window two tall. */
function skin(): UiSkinData {
  const rows: UiSkinPlaced[] = [];
  for (let i = 1; i <= 4; i++) rows.push(place(21, at(0, (i - 1) * 20), `row0${i}`));
  return {
    movie: 'TEST',
    width: 200,
    height: 200,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 100, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L100 0L100 20L0 20Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 120, h: 120 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L120 0L120 120L0 120Z' }],
      },
    ],
    sprites: [
      // One row: its own plate, the rule the screen lights, and two fields.
      { id: 21, frameCount: 1, frames: [[place(11, at(0, 0), 'selected')]] },
      { id: 22, frameCount: 1, frames: [[...rows, place(11, at(0, 0), 'mask')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            place(22, at(0, 0), 'group'),
            place(11, at(150, 0), 'shut'),
            place(11, at(0, 150), 'up'),
            place(11, at(0, 170), 'down'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, at(0, 0), 'theBox')]],
  };
}

const spec = {
  screens: {
    mail: {
      dialog: 'theBox',
      frame: 'back',
      close: 'shut',
      lists: {
        inbox: {
          view: 'group',
          viewport: 'group/mask',
          row: 'group/row',
          chosen: 'selected',
          fields: { sender: 'text', subject: 'text2' },
          scroll: { up: 'up', down: 'down' },
        },
      },
    },
  },
};

function letter(id: string, read = false): MailInboxEntry {
  return {
    id,
    senderName: `Sender ${id}`,
    subject: `Subject ${id}`,
    gold: 0,
    sentAt: 0,
    read,
    goldClaimed: false,
    itemCount: 0,
    itemsClaimed: false,
  };
}

const nothing = {
  notice: null,
  onSelect: vi.fn(),
  onClaim: vi.fn(),
  onDelete: vi.fn(),
  onCloseLetter: vi.fn(),
  onWrite: vi.fn(),
  onClose: vi.fn(),
};

describe('ArtMailWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtMailWindow {...nothing} inbox={[]} message={null} />);
    expect(queryByRole('dialog', { name: /mailbox/i })).toBeNull();
  });

  it('asks for whichever screen the spec says it wears', () => {
    uiSpec.value = { screens: { mail: { dialog: 'someScreen' } } };
    render(<ArtMailWindow {...nothing} inbox={[]} message={null} />);
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('someScreen');
  });

  it('writes only as many letters as the window has room for', () => {
    // The run is laid out longer than the window it shows through.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getAllByRole } = render(
      <ArtMailWindow
        {...nothing}
        inbox={[letter('a'), letter('b'), letter('c'), letter('d')]}
        message={null}
      />,
    );
    const rows = getAllByRole('button').filter(button =>
      /^Sender /.test(button.getAttribute('aria-label') ?? ''),
    );
    expect(rows).toHaveLength(1);
  });

  it('reads a letter through the session rather than opening it itself', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onSelect = vi.fn();
    const { getByLabelText } = render(
      <ArtMailWindow {...nothing} onSelect={onSelect} inbox={[letter('a')]} message={null} />,
    );
    fireEvent.click(getByLabelText('Sender a: Subject a'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('moves the list by a row when the mark that says so is pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const inbox = [letter('a'), letter('b'), letter('c'), letter('d')];
    const { getByLabelText, queryByLabelText } = render(
      <ArtMailWindow {...nothing} inbox={inbox} message={null} />,
    );
    // Standing at the top there is nowhere up to go, so that mark is not
    // there at all — hidden rather than greyed.
    expect(queryByLabelText(/earlier letters/i)).toBeNull();
    fireEvent.click(getByLabelText(/later letters/i));
    expect(queryByLabelText('Sender a: Subject a')).toBeNull();
    expect(queryByLabelText('Sender b: Subject b')).toBeTruthy();
    expect(queryByLabelText(/earlier letters/i)).toBeTruthy();
  });

  it('offers to take what a letter carries only while it carries something', () => {
    // A letter whose coin and things have already been taken has nothing
    // left to offer, and the screen has a face that says so.
    uiSpec.value = {
      screens: {
        ...spec.screens,
        mailRead: {
          dialog: 'theBox',
          frame: 'back',
          close: 'shut',
          actions: { shut: 'claim' },
          unavailable: { claim: 'up' },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const bare: MailMessage = { ...letter('a', true), body: '', items: [] };
    const empty = render(<ArtMailWindow {...nothing} inbox={[letter('a')]} message={bare} />);
    expect((empty.getByLabelText('claim') as HTMLButtonElement).disabled).toBe(true);
    empty.unmount();
    const full = render(
      <ArtMailWindow {...nothing} inbox={[letter('a')]} message={{ ...bare, gold: 4_000 }} />,
    );
    expect((full.getByLabelText('claim') as HTMLButtonElement).disabled).toBe(false);
    full.unmount();
    // Things ride with a letter as well as coin, and either is enough.
    const things = render(
      <ArtMailWindow {...nothing} inbox={[letter('a')]} message={{ ...bare, itemCount: 1 }} />,
    );
    expect((things.getByLabelText('claim') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows what a letter carries beside it, until it is taken', () => {
    // Things riding with a letter were only ever said to a screen reader,
    // so a letter from the market read as empty.
    uiSpec.value = {
      screens: {
        ...spec.screens,
        mailRead: { dialog: 'theBox', frame: 'back', close: 'shut', values: {} },
        mailAttach: { dialog: 'theBox', frame: 'back', grids: { attached: { slot: 'row0' } } },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    itemNames.value = new Map([
      [7, 'Seven'],
      [9, 'Nine'],
    ]);
    const message: MailMessage = {
      ...letter('a', true),
      body: '',
      itemCount: 2,
      items: [
        { entry: 7, count: 1 },
        { entry: 9, count: 3 },
      ],
    };
    const open = render(<ArtMailWindow {...nothing} inbox={[letter('a')]} message={message} />);
    const strip = open.getByRole('dialog', { name: /carried by the letter/i });
    expect([...strip.querySelectorAll('[title]')].map(slot => slot.getAttribute('title'))).toEqual([
      'Seven',
      'Nine',
    ]);
    expect(strip.textContent).toContain('3');
    open.unmount();

    const taken = render(
      <ArtMailWindow
        {...nothing}
        inbox={[letter('a')]}
        message={{ ...message, itemsClaimed: true }}
      />,
    );
    expect(taken.queryByRole('dialog', { name: /carried by the letter/i })).toBeNull();
    itemNames.value = new Map();
  });

  it('opens the card a thing you have opens when a thing a letter carries is pressed', () => {
    uiSpec.value = {
      screens: {
        ...spec.screens,
        mailRead: { dialog: 'theBox', frame: 'back', close: 'shut', values: {} },
        mailAttach: { dialog: 'theBox', frame: 'back', grids: { attached: { slot: 'row0' } } },
        held: { dialog: 'theCard' },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    itemNames.value = new Map([[7, 'Seven']]);
    const message: MailMessage = {
      ...letter('a', true),
      body: '',
      itemCount: 1,
      items: [{ entry: 7, count: 1 }],
    };
    const { getByLabelText } = render(
      <ArtMailWindow {...nothing} inbox={[letter('a')]} message={message} />,
    );
    expect(wantedDialogs.value.map(one => one.dialog)).not.toContain('theCard');
    fireEvent.click(getByLabelText('About Seven'));
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('theCard');
    itemNames.value = new Map();
  });

  it('draws that card over the page rather than on the stage the letter stands on', () => {
    // On the stage each screen is stacked by the movie's depth for it, and
    // the letter and the box came out over the card.
    uiSpec.value = {
      screens: {
        ...spec.screens,
        mailRead: { dialog: 'theBox', frame: 'back', close: 'shut', values: {} },
        mailAttach: { dialog: 'theBox', frame: 'back', grids: { attached: { slot: 'row0' } } },
        held: { dialog: 'theBox', frame: 'back', card: { title: 'up', body: 'down' } },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    itemNames.value = new Map([[7, 'Seven']]);
    const message: MailMessage = {
      ...letter('a', true),
      body: '',
      itemCount: 1,
      items: [{ entry: 7, count: 1 }],
    };
    const { container, getByLabelText } = render(
      <ArtMailWindow {...nothing} inbox={[letter('a')]} message={message} />,
    );
    const before = document.body.children.length;
    fireEvent.click(getByLabelText('About Seven'));
    const drawn = [...document.body.children].slice(before);
    expect(drawn.length).toBe(1);
    expect(container.contains(drawn[0]!)).toBe(false);
    itemNames.value = new Map();
  });

  it('puts a letter away without shutting the box it came from', () => {
    // An opened letter must close again.
    uiSpec.value = {
      screens: {
        ...spec.screens,
        mailRead: { dialog: 'theBox', frame: 'back', close: 'shut', values: {} },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const onCloseLetter = vi.fn();
    const onClose = vi.fn();
    const message: MailMessage = { ...letter('a', true), body: 'Words.', items: [] };
    const { getByLabelText } = render(
      <ArtMailWindow
        {...nothing}
        onCloseLetter={onCloseLetter}
        onClose={onClose}
        inbox={[letter('a')]}
        message={message}
      />,
    );
    fireEvent.click(getByLabelText(/close the letter/i));
    expect(onCloseLetter).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the marks that move the list only when it can be moved', () => {
    // A list that fits shows no marks.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const short = render(<ArtMailWindow {...nothing} inbox={[letter('a')]} message={null} />);
    expect(short.queryByLabelText(/later letters/i)).toBeNull();
    short.unmount();
    const long = render(
      <ArtMailWindow {...nothing} inbox={[letter('a'), letter('b')]} message={null} />,
    );
    expect(long.queryByLabelText(/later letters/i)).toBeTruthy();
  });

  it('turns to the face for a letter with nothing left to take out of it', () => {
    // The screen ships a second face for a control there is nothing
    // behind, and it says so better than dimming our own copy does. The
    // spec has named it since the mailbox was built, unread.
    //
    // The face is drawn into the picture, so what it does is decided
    // here by whether the part is in the plan at all — the control the
    // letter is closed with stands in for it, because that one is drawn
    // on top of the picture and can be looked for.
    const withFace = (control: string) => ({
      screens: {
        ...spec.screens,
        mailRead: {
          dialog: 'theBox',
          frame: 'back',
          close: 'shut',
          values: {},
          unavailable: { claim: control },
        },
      },
    });
    setMovie({ skin: skin(), art: new Map() });
    const empty: MailMessage = { ...letter('a', true), body: 'Words.', items: [], gold: 0 };

    uiSpec.value = withFace('shut');
    const nothingLeft = render(
      <ArtMailWindow {...nothing} inbox={[letter('a')]} message={empty} />,
    );
    expect(nothingLeft.queryByLabelText(/close the letter/i)).toBeTruthy();
    nothingLeft.unmount();

    // Still carrying something: the face is left parked, and the part
    // standing in for it goes with it.
    uiSpec.value = withFace('shut');
    const holding = render(
      <ArtMailWindow {...nothing} inbox={[letter('a')]} message={{ ...empty, gold: 500 }} />,
    );
    expect(holding.queryByLabelText(/close the letter/i)).toBeNull();
  });

  it('offers the control the box writes a letter of your own with', () => {
    uiSpec.value = {
      screens: {
        ...spec.screens,
        mail: { ...spec.screens.mail, actions: { shut: 'write' } },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const onWrite = vi.fn();
    const { getByLabelText } = render(
      <ArtMailWindow {...nothing} onWrite={onWrite} inbox={[letter('a')]} message={null} />,
    );
    fireEvent.click(getByLabelText('write'));
    expect(onWrite).toHaveBeenCalled();
  });

  it('opens the letter beside the box only once there is one to read', () => {
    uiSpec.value = {
      screens: {
        ...spec.screens,
        mailRead: { dialog: 'theBox', frame: 'back', close: 'shut', values: {} },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const message: MailMessage = { ...letter('a', true), body: 'Words.', items: [] };
    const shut = render(<ArtMailWindow {...nothing} inbox={[letter('a')]} message={null} />);
    expect(shut.queryByRole('dialog', { name: /letter/i })).toBeNull();
    shut.unmount();
    const open = render(<ArtMailWindow {...nothing} inbox={[letter('a')]} message={message} />);
    expect(open.queryByRole('dialog', { name: /letter/i })).toBeTruthy();
  });
});
