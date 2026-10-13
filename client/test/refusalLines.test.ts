import { describe, expect, it } from 'vitest';
import { refusalLines } from '../src/app/helpers/npc/refusalLines';
import { LINES, say } from '../src/ui/gameLines';

describe('refusalLines', () => {
  it('reports a refused inventory move with the server reason', () => {
    expect(
      refusalLines({ code: 'invalid_inventory', reason: 'Bag full.', askedRecently: false }),
    ).toEqual({
      report: ['Bag full.'],
      notice: null,
    });
  });

  it('reports a refused dungeon reset in the game’s own words', () => {
    expect(
      refusalLines({ code: 'dungeon_reset_refused', reason: 'x', askedRecently: false }).report,
    ).toEqual([say(LINES.dungeonResetRefused)]);
  });

  it('reports a refused dungeon mode change with the server reason', () => {
    expect(
      refusalLines({
        code: 'dungeon_mode_refused',
        reason: 'Someone is inside.',
        askedRecently: false,
      }).report,
    ).toEqual(['Someone is inside.']);
  });

  it('says nothing for a refusal that already has its own result message', () => {
    expect(refusalLines({ code: 'other', reason: 'No.', askedRecently: false })).toEqual({
      report: [],
      notice: null,
    });
  });

  it('gives the refusal as a notice only as the answer to an ask of another player', () => {
    expect(refusalLines({ code: 'other', reason: 'Busy.', askedRecently: true }).notice).toBe(
      'Busy.',
    );
  });
});
