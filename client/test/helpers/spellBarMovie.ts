/**
 * A movie with the two dialogs the spell bar and the jump button wear, and
 * the screen specs that name their parts.
 *
 * Small on purpose: two numbered slots and a mount's, with the parts the real
 * bar has in and beside each slot; a corner with the jump button's face, its
 * pulse and the first-run tip's arrow. The names are the table's, so a test
 * built on this checks the components against the same names.
 */

import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import type { ScreenSpec } from '../../src/ui/art/uiSpec';

const place = (
  depth: number,
  characterId: number,
  name: string | null,
  tx = 0,
  ty = 0,
): UiSkinPlaced => ({
  depth,
  characterId,
  matrix: { a: 1, b: 0, c: 0, d: 1, tx, ty },
  name,
  opacity: 1,
});

const rect = (id: number, w: number, h: number) => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
  paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
});

export function spellBarMovie(): UiSkinData {
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [rect(1, 40, 40), rect(2, 30, 30), rect(3, 20, 20), rect(4, 80, 20)],
    sprites: [
      // A slot: its plate, and the hooks in it. The sweep is a clip of three faces.
      {
        id: 10,
        frameCount: 1,
        frames: [
          [
            place(1, 1, null),
            place(2, 2, 'redmask', 5, 5),
            place(3, 2, 'bluemask', 5, 5),
            place(4, 3, 'hot', 5, 5),
            place(5, 11, 'rectcooldown'),
          ],
        ],
      },
      {
        id: 11,
        frameCount: 3,
        frames: [[place(1, 2, null)], [place(1, 2, null)], [place(1, 2, null)]],
      },
      // The resting art, and the flash: four faces.
      { id: 12, frameCount: 1, frames: [[place(1, 3, null)]] },
      {
        id: 13,
        frameCount: 4,
        frames: [
          [place(1, 3, null)],
          [place(1, 3, null)],
          [place(1, 3, null)],
          [place(1, 3, null)],
        ],
      },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(1, 10, 'btn01', 0, 0),
            place(2, 10, 'btn02', 50, 0),
            place(3, 12, 'beforeAttack01', 0, 0),
            place(4, 12, 'beforeAttack02', 50, 0),
            place(5, 13, 'cooldownFinish01', 0, 0),
            place(6, 13, 'cooldownFinish02', 50, 0),
          ],
        ],
      },
      {
        id: 21,
        frameCount: 1,
        frames: [
          [
            place(1, 10, 'btnMountSkill', 0, 0),
            place(2, 12, 'beforeAttack03', 0, 0),
            place(3, 13, 'cooldownFinish03', 0, 0),
          ],
        ],
      },
      // The dialog has a face for each state of its handle: the control that
      // opens the bar on the first, and the one that closes it on the second.
      {
        id: 30,
        frameCount: 2,
        frames: [
          [
            place(1, 3, 'btnOpen', 40, 0),
            place(2, 20, 'panelButton', 60, 0),
            place(3, 21, 'MountSkill', 0, 60),
          ],
          [place(1, -1, null), place(1, 3, 'btnClose', 40, 0)],
        ],
      },
      // The jump button: a pulse of two faces, a tip holding the face, and the tip's arrow.
      { id: 40, frameCount: 2, frames: [[place(1, 2, null)], [place(1, 2, null)]] },
      { id: 41, frameCount: 1, frames: [[place(1, 1, null)]] },
      { id: 42, frameCount: 1, frames: [[place(1, 41, 'btnJumpTip')]] },
      // The ring: a slot with its sweep, the effects beside it, and the panel of both.
      {
        id: 60,
        frameCount: 1,
        frames: [[place(1, 1, 'btn'), place(2, 11, 'cooldown', 10, 10)]],
      },
      {
        id: 61,
        frameCount: 1,
        frames: [
          [
            place(1, 12, 'autoAttack'),
            place(2, 12, 'beforeAttack'),
            place(3, 13, 'cooldownFinish'),
          ],
        ],
      },
      {
        id: 62,
        frameCount: 1,
        frames: [
          [
            place(1, 60, 'skill01', 0, 0),
            place(2, 60, 'skill02', 60, 0),
            place(3, 61, 'effect01', 0, 0),
            place(4, 61, 'effect02', 60, 0),
          ],
        ],
      },
      { id: 63, frameCount: 1, frames: [[place(1, 62, 'spellpanel')]] },
      {
        id: 50,
        frameCount: 1,
        frames: [
          [
            place(1, 40, 'animJump', 400, 240),
            place(2, 42, 'groupTip', 410, 250),
            place(3, 4, 'jumparrow', 300, 250),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(1, 30, 'bar'), place(2, 50, 'hud'), place(3, 63, 'ring')]],
  };
}

export const SPELL_BAR_SPEC: ScreenSpec = {
  dialog: 'bar',
  frame: ['panelButton', 'MountSkill', 'btnOpen'],
  grids: { slots: { slot: 'btn', within: 'panelButton' } },
  groups: {
    mount: 'MountSkill/btnMountSkill',
    sweep: 'rectcooldown',
    unusable: 'redmask',
    short: 'bluemask',
    lit: 'hot',
    resting: 'beforeAttack',
    flash: 'cooldownFinish',
    handle: 'btnOpen',
  },
  bars: {
    frames: 2,
    of: { sweep: 'rectcooldown' },
    own: { flash: { at: 'panelButton/cooldownFinish01', frames: 3 } },
  },
};

export const JUMP_SPEC: ScreenSpec = {
  dialog: 'hud',
  frame: 'animJump',
  groups: { face: 'animJump' },
};

export const WHEEL_SPEC: ScreenSpec = {
  dialog: 'ring',
  frame: 'spellpanel',
  grids: { slots: { slot: 'skill', within: 'spellpanel' } },
  groups: { sweep: 'cooldown', effects: 'effect', flash: 'cooldownFinish', glow: 'autoAttack' },
  bars: {
    frames: 2,
    of: { sweep: 'cooldown' },
    own: { flash: { at: 'spellpanel/effect01/cooldownFinish', frames: 3 } },
  },
};
