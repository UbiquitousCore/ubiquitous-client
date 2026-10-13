/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:box', width: 200, height: 120 }),
}));

import { AskPromptContainer } from '../../src/ui/AskPromptContainer';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import {
  applyDuelRequested,
  applyDuelStarted,
  duelPhase,
  resetPvp,
  setPvpActions,
} from '../../src/ui/pvpStore';
import {
  partyInvite,
  partyKickVote,
  partyActions,
  resetParty,
  setPartyActions,
  setPartyInvite,
  setPartyKickVote,
} from '../../src/ui/partyStore';
import {
  applyTradeRequested,
  applyTradeStarted,
  resetTrade,
  setTradeActions,
  tradeOpen,
  tradePhase,
} from '../../src/ui/tradeStore';
import {
  offerSharedQuest,
  resetSharedQuests,
  setQuestShareActions,
  sharedQuestOffers,
} from '../../src/ui/questShareStore';
import { questText, setQuestText } from '../../src/ui/questStore';
import { askTravel, clearTravelQuestion, fareWords } from '../../src/ui/travelStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

const TRADE = {
  requestTarget: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  offer: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
};
const PVP = {
  challengeTarget: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  forfeit: vi.fn(),
  setFlagged: vi.fn(),
};

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  resetTrade();
  resetPvp();
  resetParty();
  resetSharedQuests();
  questText.value = new Map();
  clearTravelQuestion();
  vi.clearAllMocks();
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const rect = (name: string, x: number, y: number): UiSkinPlaced => ({
  depth: 1,
  characterId: 11,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** The message box: a backing, a line for the question, a yes and a no. */
function skin(): UiSkinData {
  return {
    movie: 'IGM',
    width: 400,
    height: 300,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 60, h: 30 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L60 0L60 30L0 30Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [rect('btn', 0, 0), rect('textMsg', 0, 40), rect('btnYes', 0, 80), rect('btnNo', 80, 80)],
        ],
      },
    ],
    edits: [],
    root: [[{ depth: 1, characterId: 20, matrix: at(0, 0), name: 'dlgMsg', opacity: 1 }]],
  };
}

const ask = (prompt: string) => ({
  dialog: 'dlgMsg',
  movie: 'IGM' as const,
  frame: ['btn', 'btnYes', 'btnNo'],
  actions: { btnYes: 'accept', btnNo: 'decline' },
  values: { message: 'textMsg' },
  words: { prompt },
});

const spec = {
  screens: {
    teamAsk: ask('%s would like you in their group.'),
    voteKickAsk: ask('Should %s go?'),
    tradeAsk: ask('%s wants to trade.'),
    duelAsk: ask('%s challenges you to a duel.'),
    travelAsk: ask('Go to %s? It costs %s.'),
  },
};

describe('AskPromptContainer', () => {
  it('asks nothing until somebody asks something', () => {
    const { container } = render(<AskPromptContainer />);
    expect(container.firstChild).toBeNull();
  });

  it("asks a proposed trade in the build's message box, naming who proposed it", () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    applyTradeRequested(7, 'Bram');
    const { getByRole } = render(<AskPromptContainer />);
    expect(getByRole('alertdialog', { name: 'Trade request' }).textContent).toContain(
      'Bram wants to trade.',
    );
  });

  it('accepting a trade sends the yes, puts the question away, and the table opens when the server starts it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setTradeActions(TRADE);
    applyTradeRequested(7, 'Bram');
    const { getByRole, queryByRole } = render(<AskPromptContainer />);
    fireEvent.click(getByRole('button', { name: 'Accept' }));
    expect(TRADE.accept).toHaveBeenCalled();
    expect(queryByRole('alertdialog')).toBeNull();
    applyTradeStarted(7);
    expect(tradePhase.value).toBe('open');
    expect(tradeOpen.value).toBe(true);
  });

  it('declining a trade sends the no and puts the question away', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setTradeActions(TRADE);
    applyTradeRequested(7, 'Bram');
    const { getByRole, queryByRole } = render(<AskPromptContainer />);
    fireEvent.click(getByRole('button', { name: 'Decline' }));
    expect(TRADE.decline).toHaveBeenCalled();
    expect(queryByRole('alertdialog')).toBeNull();
    expect(tradePhase.value).toBe('idle');
  });

  it('asks a duel challenge the same way, and a yes waits on the server to start it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setPvpActions(PVP);
    applyDuelRequested(9, 'Ayla');
    const { getByRole, queryByRole } = render(<AskPromptContainer />);
    expect(getByRole('alertdialog', { name: 'Duel challenge' }).textContent).toContain(
      'Ayla challenges you to a duel.',
    );
    fireEvent.click(getByRole('button', { name: 'Accept' }));
    expect(PVP.accept).toHaveBeenCalled();
    expect(queryByRole('alertdialog')).toBeNull();
    applyDuelStarted(9);
    expect(duelPhase.value).toBe('duelling');
  });

  it('asks a journey with the place and the fare picked out in green, and a yes sends it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const accept = vi.fn();
    askTravel({ place: 'Test Harbour', fare: fareWords(620), accept, decline: vi.fn() });
    const { getByRole, queryByRole } = render(<AskPromptContainer />);
    const box = getByRole('alertdialog', { name: 'Travel' });
    expect(box.textContent).toContain('Go to Test Harbour? It costs 6 Silver 20 Copper.');
    const green = [...box.querySelectorAll<HTMLElement>('span')]
      .filter(one => one.style.color.includes('ask-pick'))
      .map(one => one.textContent);
    expect(green).toEqual(['Test Harbour', '6 Silver 20 Copper']);
    fireEvent.click(getByRole('button', { name: 'Accept' }));
    expect(accept).toHaveBeenCalled();
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('writes a fare with each coin named in capitals, and nothing for an empty coin', () => {
    expect(fareWords(620)).toBe('6 Silver 20 Copper');
    expect(fareWords(10_000)).toBe('1 Gold');
  });

  it('asks a team invitation first, and either answer puts it away', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const party = {
      inviteTarget: vi.fn(),
      invite: vi.fn(),
      inviteNamed: vi.fn(),
      kickTarget: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
      leave: vi.fn(),
      kick: vi.fn(),
      voteKick: vi.fn(),
      answerVoteKick: vi.fn(),
    };
    setPartyActions(party);
    applyTradeRequested(7, 'Bram');
    setPartyInvite({ networkId: 9, name: 'Ayla' });
    const { getByRole } = render(<AskPromptContainer />);
    expect(getByRole('alertdialog', { name: 'Team invitation' }).textContent).toContain(
      'Ayla would like you in their group.',
    );
    fireEvent.click(getByRole('button', { name: 'Accept' }));
    expect(party.accept).toHaveBeenCalled();
    expect(partyInvite.value).toBeNull();
    // The trade still waiting is asked next.
    expect(getByRole('alertdialog', { name: 'Trade request' })).toBeTruthy();
  });

  it("asks a vote on removing a team member in the build's box, naming the member", () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const answerVoteKick = vi.fn();
    setPartyActions({ ...partyActions(), answerVoteKick });
    setPartyKickVote({ initiatorId: 3, initiatorName: 'Kael', targetId: 4, targetName: 'Bram' });
    const { getByRole, queryByRole } = render(<AskPromptContainer />);
    expect(
      getByRole('alertdialog', { name: 'Vote to remove a team member' }).textContent,
    ).toContain('Should Bram go?');
    fireEvent.click(getByRole('button', { name: 'Decline' }));
    expect(answerVoteKick).toHaveBeenCalledWith(false);
    expect(partyKickVote.value).toBeNull();
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('asks about a shared quest by its title, and the answer goes to the server', () => {
    const answer = vi.fn();
    setQuestShareActions({ answer });
    setQuestText(5, 'Wolves at the Gate');
    offerSharedQuest({
      sharerId: 3,
      sharerName: 'Kael',
      questId: 101,
      titleStringId: 5,
      detailsStringId: 6,
      minLevel: 1,
    });
    const { getByRole, getByText, queryByRole } = render(<AskPromptContainer />);
    expect(getByText('Kael wants to share Wolves at the Gate with you.')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Accept' }));
    expect(answer).toHaveBeenCalledWith(101, true);
    expect(sharedQuestOffers.value).toEqual([]);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('asks a shared quest in the plain dialog even where a build is mounted', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const answer = vi.fn();
    setQuestShareActions({ answer });
    offerSharedQuest({
      sharerId: 3,
      sharerName: 'Kael',
      questId: 101,
      titleStringId: 0,
      detailsStringId: 0,
      minLevel: 1,
    });
    const { getByRole } = render(<AskPromptContainer />);
    fireEvent.click(getByRole('button', { name: 'Decline' }));
    expect(answer).toHaveBeenCalledWith(101, false);
  });

  it("asks nothing that has a box of its own until the build's box is there", () => {
    setPvpActions(PVP);
    applyDuelRequested(9, 'Ayla');
    const { container } = render(<AskPromptContainer />);
    expect(container.innerHTML).toBe('');
  });
});
