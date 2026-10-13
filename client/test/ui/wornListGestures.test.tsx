/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

import { listGestures, listSlice, useListScroll } from '../../src/ui/art/wornList';
import type { PiecePart } from '../../src/ui/art/piecePlan';
import type { ListingSpec } from '../../src/ui/art/uiSpec';
import type { Worn } from '../../src/ui/art/useWorn';

const part = (path: string, y: number, h = 10): PiecePart => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  box: { x: 0, y, w: 100, h },
  draws: true,
});

/** Eight rows ten units tall, shown through a window four of them tall. */
const parts: PiecePart[] = [part('view', 0, 40), { ...part('view/mask', 0, 40), mask: true }];
for (let i = 1; i <= 8; i++) parts.push(part(`view/row0${i}`, (i - 1) * 10));

const spec: ListingSpec = {
  view: 'view',
  viewport: 'view/mask',
  row: 'view/row',
  fields: {},
};

/**
 * A screen whose frame stands away from the movie's origin, drawn one
 * pixel to a unit at the top left of the page. Every part is measured
 * from the frame's corner, as the plan measures them.
 */
function wornAt(frame = { x: 100, y: 200, w: 100, h: 40 }): Worn {
  const picture = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: frame.w, height: frame.h }),
  };
  return {
    frame,
    parts,
    pictureRef: { current: picture },
    find: (name: string | undefined) => parts.find(one => one.path === name),
  } as unknown as Worn;
}

const wheel = (deltaY: number, deltaMode = 0, clientY = 20) =>
  ({ deltaY, deltaMode, clientX: 50, clientY, preventDefault() {} }) as unknown as WheelEvent;

function setUp(worn = wornAt()) {
  const hook = renderHook(() => useListScroll());
  const gestures = () => {
    const slice = listSlice(parts, {
      list: spec,
      items: [1, 2, 3, 4, 5, 6, 7, 8],
      scroll: hook.result.current.at,
    });
    return listGestures(worn, spec, slice, hook.result.current);
  };
  return { hook, gestures };
}

describe('scrolling a list by hand', () => {
  it('takes the wheel over the list on a screen framed away from the origin', () => {
    const { hook, gestures } = setUp();
    act(() => gestures().onWheel!(wheel(10) as never));
    expect(hook.result.current.at).toBe(1);
  });

  it('leaves the wheel alone outside the list', () => {
    const { hook, gestures } = setUp(wornAt({ x: 100, y: 200, w: 100, h: 80 }));
    act(() => gestures().onWheel!(wheel(10, 0, 60) as never));
    expect(hook.result.current.at).toBe(0);
  });

  it('adds up a trackpad’s small movements into whole rows', () => {
    const { hook, gestures } = setUp();
    for (let i = 0; i < 3; i++) act(() => gestures().onWheel!(wheel(3) as never));
    // Nine pixels is less than a ten-pixel row.
    expect(hook.result.current.at).toBe(0);
    act(() => gestures().onWheel!(wheel(3) as never));
    expect(hook.result.current.at).toBe(1);
  });

  it('moves as many rows as a long flick carries, up to the end of the list', () => {
    const { hook, gestures } = setUp();
    act(() => gestures().onWheel!(wheel(30) as never));
    expect(hook.result.current.at).toBe(3);
    act(() => gestures().onWheel!(wheel(500) as never));
    expect(hook.result.current.at).toBe(4);
    act(() => gestures().onWheel!(wheel(-20) as never));
    expect(hook.result.current.at).toBe(2);
  });

  it('counts a wheel that reports in lines a row to a line', () => {
    const { hook, gestures } = setUp();
    act(() => gestures().onWheel!(wheel(2, 1) as never));
    expect(hook.result.current.at).toBe(2);
  });

  it('drags the list under a finger on a screen framed away from the origin', () => {
    const { hook, gestures } = setUp();
    act(() => gestures().onPointerDown!({ clientX: 50, clientY: 35 } as never));
    act(() => gestures().onPointerMove!({ clientX: 50, clientY: 15 } as never));
    act(() => gestures().onPointerUp!({} as never));
    expect(hook.result.current.at).toBe(2);
  });

  it('forgets a press let go somewhere else, so the wheel is not undone by the next move', () => {
    // A press that becomes a drag of what it was on — a spell carried off
    // to the action bar — is let go outside the list, which never hears it.
    const { hook, gestures } = setUp();
    act(() => gestures().onPointerDown!({ clientX: 50, clientY: 35, buttons: 1 } as never));
    act(() => gestures().onWheel!(wheel(30) as never));
    expect(hook.result.current.at).toBe(3);
    act(() => gestures().onPointerMove!({ clientX: 50, clientY: 15, buttons: 0 } as never));
    expect(hook.result.current.at).toBe(3);
  });
});
