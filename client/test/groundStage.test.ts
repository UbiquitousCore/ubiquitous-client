import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroundStage, type Ground } from '../src/app/features/frontEnd/GroundStage';
import {
  lookKey,
  looks,
  NO_HAIR_CHOSEN,
  portraits,
  type PreviewLook,
} from '../src/ui/frontend/frontEndStore';

const look = (over: Partial<PreviewLook> = {}): PreviewLook => ({
  race: 1,
  gender: 0,
  displayInfoId: 10,
  skin: 0,
  hairStyle: 3,
  hairColour: 0,
  face: 0,
  ...over,
});

const OFFERED = {
  skins: [0],
  faces: [0],
  hairStyles: [4, 5],
  bareHairStyles: [4],
  hairColours: [0],
};

function setup(over: { appearance?: (input: { hairStyle: number }) => Promise<unknown> } = {}) {
  const ground = {
    open: vi.fn(async () => undefined),
    watch: vi.fn(),
    showBody: vi.fn(async () => undefined),
    portrait: vi.fn(async () => 'blob:portrait'),
    celebrate: vi.fn(async () => undefined),
    turnBy: vi.fn(),
    releaseTurn: vi.fn(),
    dispose: vi.fn(),
  } satisfies Ground;
  const seen: number[] = [];
  const resources = {
    networkAppearance: vi.fn(async (input: { hairStyle: number }) => {
      seen.push(input.hairStyle);
      return over.appearance
        ? over.appearance(input)
        : { model: 'm', appearance: { skin: null }, scale: 1 };
    }),
    lookOptions: vi.fn(async () => OFFERED),
  };
  const made: HTMLCanvasElement[] = [];
  const stage = new GroundStage(resources as never, canvas => {
    made.push(canvas);
    return ground;
  });
  return { stage, ground, resources, seen, made, canvas: {} as HTMLCanvasElement };
}

beforeEach(() => {
  portraits.value = new Map();
  looks.value = { skins: [], faces: [], hairStyles: [], bareHairStyles: [], hairColours: [] };
});

describe('GroundStage', () => {
  it('opens the selection ground on a canvas, once, looking where the screens last asked', () => {
    const { stage, ground, made, canvas } = setup();
    stage.watch('close');
    stage.canvas(canvas);
    stage.canvas(canvas);
    expect(made).toHaveLength(1);
    expect(ground.watch).toHaveBeenCalledWith('close');
    expect(ground.open).toHaveBeenCalledWith('human_selection');
  });

  it('passes the camera and the dais on to the ground', () => {
    const { stage, ground, canvas } = setup();
    stage.canvas(canvas);
    stage.watch('wide');
    stage.turnBy(0.5);
    stage.releaseTurn();
    stage.celebrate();
    expect(ground.watch).toHaveBeenLastCalledWith('wide');
    expect(ground.turnBy).toHaveBeenCalledWith(0.5);
    expect(ground.releaseTurn).toHaveBeenCalled();
    expect(ground.celebrate).toHaveBeenCalled();
  });

  it('does nothing for the dais while there is no ground', () => {
    const { stage } = setup();
    expect(() => {
      stage.turnBy(1);
      stage.releaseTurn();
      stage.celebrate();
      stage.watch('close');
    }).not.toThrow();
  });

  it('stands the last look asked for once the ground arrives', async () => {
    const { stage, ground, canvas } = setup();
    await stage.show(look());
    expect(ground.showBody).not.toHaveBeenCalled();
    stage.canvas(canvas);
    await vi.waitFor(() => expect(ground.showBody).toHaveBeenCalledTimes(1));
    expect(ground.showBody).toHaveBeenCalledWith({
      model: 'm',
      appearance: { skin: null },
      scale: 1,
    });
  });

  it('learns which looks the body offers', async () => {
    const { stage, canvas } = setup();
    stage.canvas(canvas);
    await stage.show(look());
    expect(looks.value.hairStyles).toEqual([4, 5]);
  });

  it('clears the dais for no look at all', async () => {
    const { stage, ground, canvas } = setup();
    stage.canvas(canvas);
    await stage.show(null);
    expect(ground.showBody).toHaveBeenCalledWith(null);
  });

  it('drops a body that was asked for before a newer one', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    let first = true;
    const { stage, ground, canvas } = setup({
      appearance: async () => {
        if (first) {
          first = false;
          await gate;
        }
        return { model: 'm', appearance: { skin: null }, scale: 1 };
      },
    });
    stage.canvas(canvas);
    const slow = stage.show(look({ displayInfoId: 1 }));
    const fast = stage.show(look({ displayInfoId: 2 }));
    await fast;
    release();
    await slow;
    expect(ground.showBody).toHaveBeenCalledTimes(1);
  });

  it('starts an unchosen hair on the style its body starts on', async () => {
    const { stage, seen, canvas } = setup();
    stage.canvas(canvas);
    await stage.show(look({ hairStyle: NO_HAIR_CHOSEN }));
    // The look as asked, then the same look with the body's first hair that is not bare.
    expect(seen).toEqual([NO_HAIR_CHOSEN, 5]);
  });

  it('takes a portrait and keeps it under the look', async () => {
    const { stage, ground, canvas } = setup();
    stage.canvas(canvas);
    const wanted = look();
    await stage.portrait(wanted);
    expect(ground.portrait).toHaveBeenCalledTimes(1);
    expect(portraits.value.get(lookKey(wanted))).toBe('blob:portrait');
    await stage.portrait(wanted);
    expect(ground.portrait).toHaveBeenCalledTimes(1);
  });

  it('holds portraits asked for before the ground, and takes them when it arrives', async () => {
    const { stage, ground, canvas } = setup();
    const wanted = look();
    await stage.portrait(wanted);
    await stage.portrait(wanted);
    expect(ground.portrait).not.toHaveBeenCalled();
    stage.canvas(canvas);
    await vi.waitFor(() => expect(portraits.value.has(lookKey(wanted))).toBe(true));
    expect(ground.portrait).toHaveBeenCalledTimes(1);
  });

  it('keeps going when a picture cannot be taken', async () => {
    const { stage, ground, canvas } = setup();
    stage.canvas(canvas);
    ground.portrait.mockRejectedValueOnce(new Error('no gl'));
    await expect(stage.portrait(look())).resolves.toBeUndefined();
    expect(portraits.value.size).toBe(0);
  });

  it('drops the ground when its canvas goes, and builds a fresh one for the next', () => {
    const { stage, ground, made, canvas } = setup();
    stage.canvas(canvas);
    stage.canvas(null);
    expect(ground.dispose).toHaveBeenCalledTimes(1);
    stage.canvas(canvas);
    expect(made).toHaveLength(2);
    stage.dispose();
    expect(ground.dispose).toHaveBeenCalledTimes(2);
  });
});
