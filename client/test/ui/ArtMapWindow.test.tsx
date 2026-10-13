/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:map', width: 300, height: 200 }),
}));

import { ArtMapWindow } from '../../src/ui/components/ArtMapWindow';
import type { ArtMapWindowProps } from '../../src/ui/components/ArtMapWindow';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { closeMap, mapOpen, openMap } from '../../src/ui/hudStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  closeMap();
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, name: string, x = 0, y = 0): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});
const square = (id: number, size: number): UiSkinData['shapes'][number] => ({
  id,
  bounds: { x: 0, y: 0, w: size, h: size },
  fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
  paths: [{ fill: 1, d: `M0 0L${size} 0L${size} ${size}L0 ${size}Z` }],
});

/**
 * The two dialogs the map wears, cut down to the parts the screen reads: a
 * 300 x 200 window, its controls, one place slot with its ring, the eye, the
 * player's arrow, and on the world map a window and one region's press area.
 */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 300, h: 200 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L300 0L300 200L0 200Z' }],
      },
      square(12, 20),
      square(13, 30),
      square(14, 10),
      square(15, 80),
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(11, 'btnscroll'),
            place(12, 'btnClose', 10, 170),
            place(12, 'btntoworldmap', 40, 170),
            place(12, 'btnup', 140, 0),
            place(12, 'btndown', 140, 180),
            place(12, 'btnleft', 0, 90),
            place(12, 'btnright', 280, 90),
            place(21, 'zoneindicator01'),
            place(22, 'zonepage', 200, 170),
            place(14, 'arrow'),
          ],
        ],
      },
      { id: 21, frameCount: 1, frames: [[place(13, 'btn')]] },
      {
        id: 22,
        frameCount: 1,
        frames: [[place(12, 'btnobserver'), place(16, 'text', 0, 30)]],
      },
      {
        id: 23,
        frameCount: 1,
        frames: [[place(11, 'btnscroll'), place(12, 'btnclose', 10, 170), place(24, 'scroll')]],
      },
      { id: 24, frameCount: 1, frames: [[place(15, 'btn10', 100, 50)]] },
    ],
    edits: [
      {
        id: 16,
        bounds: { x: 0, y: 0, w: 120, h: 20 },
        varName: '',
        sampleHtml: 'x',
        sizePx: 12,
        color: null,
        face: null,
      },
    ],
    root: [[place(20, 'holemap'), place(23, 'dlgworldmap')]],
  };
}

function wear(): void {
  uiSpec.value = {
    screens: {
      areaMap: {
        dialog: 'holemap',
        frame: 'btnscroll',
        close: 'btnClose',
        hidden: ['arrow', 'zoneindicator01'],
        actions: {
          btntoworldmap: 'world',
          btnup: 'up',
          btndown: 'down',
          btnleft: 'left',
          btnright: 'right',
        },
        groups: { player: 'arrow', names: 'zonepage/btnobserver', banner: 'zonepage' },
        values: { place: 'zonepage/text' },
        pieces: {
          quest: { part: 'zonepage/btnobserver' },
        },
      },
      worldMap: {
        dialog: 'dlgworldmap',
        frame: 'btnscroll',
        close: 'btnclose',
        groups: { regions: 'scroll' },
        pieces: { back: { dialog: 'holemap', part: 'btnClose' } },
      },
    },
  } as never;
  setMovie({ skin: skin(), art: new Map() });
}

// 300 x 200 is already 3:2, so percentages come out of the frame untouched.
const props: ArtMapWindowProps = {
  zoneName: 'Test Vale',
  bounds: [0, 0, 300, 200],
  playerPosition: [150, 0, 100],
  playerYaw: 0,
  markers: [],
};

const harbour = {
  id: 'teleport-4',
  label: 'Test Harbour',
  position: [75, 0, 150] as [number, number, number],
  kind: 'teleport' as const,
};

function open(extra: Partial<ArtMapWindowProps> = {}) {
  wear();
  const shown = render(<ArtMapWindow {...props} {...extra} />);
  act(() => openMap());
  return shown;
}

describe('ArtMapWindow', () => {
  it('draws nothing until the full map is opened, and nothing without the movie', () => {
    wear();
    const { container } = render(<ArtMapWindow {...props} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    act(() => openMap());
    expect(container.querySelector('[aria-label="Full map"]')).toBeTruthy();

    cleanup();
    clearMovies();
    const bare = render(<ArtMapWindow {...props} />);
    act(() => openMap());
    expect(bare.container.innerHTML).toBe('');
  });

  it('plots a place on the region picture by its world position', () => {
    const { container } = open({
      places: [{ id: 498, name: 'Test Vale', position: [75, 0, 150] }],
    });
    const spot = container.querySelector('[aria-label="Test Vale"]') as HTMLElement;
    expect(spot.style.left).toBe('25%');
    expect(spot.style.top).toBe('75%');
  });

  it('writes a friendly place’s name in one colour and a hostile one’s in another', () => {
    const { container } = open({
      places: [
        { id: 1, name: 'Kind', position: [10, 0, 10], friendly: 2 },
        { id: 2, name: 'Mid', position: [20, 0, 20], friendly: 1 },
        { id: 3, name: 'Grim', position: [30, 0, 30], friendly: 0 },
      ],
    });
    fireEvent.click(container.querySelector('[data-map="names"]')!);
    const colour = (name: string): string =>
      [...container.querySelectorAll<HTMLElement>('[data-map="place-name"]')].find(
        one => one.textContent === name,
      )!.style.color;
    expect(colour('Kind')).toContain('place-friendly');
    expect(colour('Grim')).toContain('place-hostile');
    expect(colour('Mid')).not.toContain('place-');
  });

  it('draws the player where they stand, turned the way they face', () => {
    const { container } = open({ playerPosition: [75, 0, 150], playerYaw: Math.PI / 2 });
    const arrow = container.querySelector('img[alt="You"]') as HTMLElement;
    expect(arrow.style.left).toBe('25%');
    expect(arrow.style.top).toBe('75%');
    expect(arrow.style.transform).toContain('rotate(');
  });

  it('shows a shop or teleporter only when zoomed all the way in, and a quest marker at any zoom', () => {
    const { container } = open({
      markers: [
        { id: '1', label: 'Shop', position: [150, 0, 100], kind: 'service', iconUrl: 'shop.png' },
        { id: 'q', label: 'Wanted', position: [75, 0, 150], kind: 'quest' },
      ],
    });
    expect(container.querySelector('[data-marker="service"]')).toBeNull();
    expect(container.querySelector('img[alt="Wanted"]')).toBeTruthy();

    const stage = container.querySelector('[data-map="viewport"]') as HTMLElement;
    stage.getBoundingClientRect = () => ({ width: 400, height: 300 }) as DOMRect;
    for (let notch = 0; notch < 11; notch++) fireEvent.wheel(stage, { deltaY: -1 });
    expect(container.querySelector('[data-marker="service"]')).toBeNull();
    fireEvent.wheel(stage, { deltaY: -1 });
    const marker = container.querySelector('[data-marker="service"]') as HTMLElement;
    expect(marker.querySelector('img')?.getAttribute('src')).toBe('shop.png');
    expect(marker.style.left).toBe('50%');
    expect(container.querySelector('img[alt="Wanted"]')).toBeTruthy();
  });

  it('draws a quest marker as the part the table names, at its place', () => {
    const { container } = open({
      markers: [{ id: 'q', label: 'Wanted', position: [75, 0, 150], kind: 'quest' }],
    });
    const marker = container.querySelector('img[alt="Wanted"]') as HTMLElement;
    expect(marker.style.left).toBe('25%');
    expect(marker.style.top).toBe('75%');
  });

  it('slides the region’s banner away after two seconds, and brings it back for a new region', () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = open({ zoneName: 'First' });
      const shown = (): boolean =>
        container.querySelector('[data-map="banner"]')!.hasAttribute('data-shown');
      expect(shown()).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1900);
      });
      expect(shown()).toBe(true);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(shown()).toBe(false);
      rerender(<ArtMapWindow {...props} zoneName="Second" />);
      expect(shown()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes from the movie’s own button', () => {
    const { container } = open();
    fireEvent.click(container.querySelector('[data-map="close"]')!);
    expect(mapOpen.value).toBe(false);
  });

  it('offers a way to a neighbouring region only where there is one, and opens it', () => {
    const onSelectRegion = vi.fn();
    const { container } = open({
      onSelectRegion,
      neighbours: [
        { direction: 'up', region: { id: 5, name: 'Northreach' } },
        { direction: 'right', region: { id: 6, name: 'Eastmarch' } },
      ],
    });
    expect(container.querySelector('[data-map="up"]')).toBeTruthy();
    expect(container.querySelector('[data-map="right"]')).toBeTruthy();
    expect(container.querySelector('[data-map="down"]')).toBeNull();
    expect(container.querySelector('[data-map="left"]')).toBeNull();
    fireEvent.click(container.querySelector('[aria-label="up to Northreach"]')!);
    expect(onSelectRegion).toHaveBeenCalledWith(5);
  });

  it('writes no place names until the eye is pressed, and puts them over the arrow and the markers', () => {
    const { container } = open({
      places: [{ id: 498, name: 'Test Vale', position: [75, 0, 150] }],
      markers: [{ id: 'q', label: 'Wanted', position: [75, 0, 150], kind: 'quest' }],
    });
    expect(container.querySelector('[data-map="place-name"]')).toBeNull();
    // The place itself is there to be pressed all the same.
    expect(container.querySelector('[aria-label="Test Vale"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-map="names"]')!);
    const name = container.querySelector('[data-map="place-name"]')!;
    expect(name.textContent).toBe('Test Vale');
    const surface = [...container.querySelector('[data-map="surface"]')!.children];
    const after = (one: Element | null): number => surface.indexOf(one as Element);
    expect(after(name)).toBeGreaterThan(after(container.querySelector('img[alt="You"]')));
    expect(after(name)).toBeGreaterThan(after(container.querySelector('img[alt="Wanted"]')));
    fireEvent.click(container.querySelector('[data-map="names"]')!);
    expect(container.querySelector('[data-map="place-name"]')).toBeNull();
  });

  it('writes the place the player is in along the bottom, and nothing where there is none', () => {
    const { container } = open({ placeName: 'Test Vale' });
    expect(container.querySelector('[data-map="here"]')?.textContent).toBe('Test Vale');
    cleanup();
    const bare = open({ placeName: '' });
    expect(bare.container.querySelector('[data-map="here"]')).toBeNull();
  });

  describe('travelling', () => {
    const places = [
      {
        id: 1,
        name: 'Test Harbour',
        position: [75, 0, 150] as [number, number, number],
        teleport: harbour,
      },
      { id: 2, name: 'Test Vale', position: [150, 0, 50] as [number, number, number] },
    ];

    it('travels by tapping the place itself', () => {
      const onTeleport = vi.fn();
      const { container } = open({ teleporting: true, onTeleport, places });
      const stop = container.querySelector('[aria-label="Teleport to Test Harbour"]')!;
      fireEvent.click(stop);
      expect(onTeleport).toHaveBeenCalledWith(harbour);
      // A place that is not a stop is not a button.
      expect(container.querySelector('button[aria-label="Teleport to Test Vale"]')).toBeNull();
    });

    it('always writes the names while travelling, with no eye to turn them off', () => {
      const { container } = open({ teleporting: true, places });
      expect(container.querySelectorAll('[data-map="place-name"]')).toHaveLength(2);
      expect(container.querySelector('[data-map="names"]')).toBeNull();
    });

    it('offers no travel until a teleport master asked for the map', () => {
      const { container } = open({ places });
      expect(container.querySelector('button[aria-label^="Teleport to"]')).toBeNull();
    });

    it('draws the build’s picture of the network, and no lines over it', () => {
      const { container } = open({
        teleporting: true,
        imageUrl: 'plain.png',
        routeImageUrl: 'network.png',
        routes: [{ id: 'a', from: [0, 0, 0], to: [300, 0, 200] }],
      });
      expect(container.querySelector('[data-map="surface"]')?.getAttribute('style')).toContain(
        'network.png',
      );
      expect(container.querySelector('[data-map="routes"]')).toBeNull();
    });

    it('draws a line along each leg where the build ships no such picture', () => {
      const { container } = open({
        teleporting: true,
        imageUrl: 'plain.png',
        routeImageUrl: null,
        routes: [{ id: 'a', from: [0, 0, 0], to: [300, 0, 100] }],
      });
      expect(container.querySelector('[data-map="surface"]')?.getAttribute('style')).toContain(
        'plain.png',
      );
      const line = container.querySelector('[data-map="routes"] line')!;
      expect(line.getAttribute('x1')).toBe('0');
      expect(line.getAttribute('x2')).toBe('100');
      expect(line.getAttribute('y2')).toBe('50');
    });
  });

  describe('the world map', () => {
    const regions = [{ id: 71, name: 'Test Coast', button: 'btn10' }];

    it('puts each region where the movie puts its press area, and opens the one pressed', () => {
      const onSelectRegion = vi.fn();
      const { container } = open({
        regions,
        worldMapUrl: 'world.png',
        worldMapSize: { width: 300, height: 200 },
        onSelectRegion,
      });
      fireEvent.click(container.querySelector('[data-map="world"]')!);
      expect(container.querySelector('[aria-label="World map"]')).toBeTruthy();
      const area = container.querySelector('[data-map="region"]') as HTMLElement;
      expect(area.style.left).toBe(`${(100 / 300) * 100}%`);
      expect(area.style.top).toBe('25%');
      expect(area.style.width).toBe(`${(80 / 300) * 100}%`);
      expect(area.style.height).toBe('40%');
      expect(area.textContent).toBe('Test Coast');
      expect(container.querySelector('[data-map="surface"]')?.getAttribute('style')).toContain(
        'world.png',
      );

      fireEvent.click(area);
      expect(onSelectRegion).toHaveBeenCalledWith(71);
      // And it is the region that opens, not the world again.
      expect(container.querySelector('[aria-label="Full map"]')).toBeTruthy();
    });

    it('leaves out a region the movie gives no press area, and every one without a picture size', () => {
      const { container } = open({
        regions: [...regions, { id: 9, name: 'Nowhere', button: 'btn99' }],
        worldMapSize: { width: 300, height: 200 },
      });
      fireEvent.click(container.querySelector('[data-map="world"]')!);
      expect(container.querySelectorAll('[data-map="region"]')).toHaveLength(1);
      cleanup();
      clearMovies();
      const none = open({ regions });
      fireEvent.click(none.container.querySelector('[data-map="world"]')!);
      expect(none.container.querySelector('[data-map="region"]')).toBeNull();
    });

    it('goes back to the region from its own way out, and shuts with the map', () => {
      const { container } = open({ regions, worldMapSize: { width: 300, height: 200 } });
      fireEvent.click(container.querySelector('[data-map="world"]')!);
      fireEvent.click(container.querySelector('[data-map="close"]')!);
      expect(container.querySelector('[aria-label="Full map"]')).toBeTruthy();

      fireEvent.click(container.querySelector('[data-map="world"]')!);
      act(() => closeMap());
      act(() => openMap());
      // Reopening lands on the player's own region, not where they were browsing.
      expect(container.querySelector('[aria-label="Full map"]')).toBeTruthy();
    });
  });

  describe('moving the picture', () => {
    function viewport(container: Element): HTMLElement {
      const stage = container.querySelector('[data-map="viewport"]') as HTMLElement;
      // happy-dom lays nothing out; the picture is 400 x 300 on screen.
      stage.getBoundingClientRect = () => ({ width: 400, height: 300 }) as DOMRect;
      return stage;
    }
    const style = (container: Element): string =>
      container.querySelector('[data-map="surface"]')?.getAttribute('style') ?? '';

    it('zooms on the wheel, between fitted and four times, and cannot be slid while fitted', () => {
      const { container } = open();
      const stage = viewport(container);
      expect(style(container)).toContain('scale(1)');
      fireEvent.wheel(stage, { deltaY: -1 });
      expect(style(container)).toContain('scale(1.25)');
      fireEvent.wheel(stage, { deltaY: 1 });
      fireEvent.wheel(stage, { deltaY: 1 });
      expect(style(container)).toContain('scale(1)');

      // Several notches inside one frame each count.
      act(() => {
        for (let notch = 0; notch < 3; notch++) fireEvent.wheel(stage, { deltaY: -1 });
      });
      expect(style(container)).toContain('scale(1.75)');
      act(() => {
        for (let notch = 0; notch < 3; notch++) fireEvent.wheel(stage, { deltaY: 1 });
      });

      fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(stage, { pointerId: 1, clientX: 160, clientY: 140 });
      expect(style(container)).toContain('translate(0px, 0px)');
    });

    it('does not capture the pointer on press, so places stay clickable', () => {
      /*
       * Capturing the pointer on `pointerdown`, so a drag leaving the element
       * still pans, would redirect the release to the map, and every place and
       * every region is a button *inside* the map -- so none of them would
       * receive a click and tapping a destination would do nothing.
       *
       * A test that dispatches events straight at the button bypasses capture
       * entirely. Only a real press through the map shows it, which is what
       * this reproduces: the press starts on the viewport and must still reach
       * the button.
       */
      const onTeleport = vi.fn();
      const { container } = open({
        teleporting: true,
        onTeleport,
        places: [{ id: 1, name: 'Test Harbour', position: [75, 0, 150], teleport: harbour }],
      });
      const stage = viewport(container);
      let captured = 0;
      stage.setPointerCapture = () => {
        captured++;
      };
      stage.releasePointerCapture = () => {};

      // A tap: down and up in the same place, no travel.
      fireEvent.pointerDown(stage, { pointerId: 1, clientX: 40, clientY: 40 });
      fireEvent.pointerUp(stage, { pointerId: 1, clientX: 40, clientY: 40 });
      expect(captured, 'a tap must not capture the pointer').toBe(0);
      fireEvent.click(container.querySelector('[aria-label="Teleport to Test Harbour"]')!);
      expect(onTeleport).toHaveBeenCalledTimes(1);
    });

    it('captures only once a press has travelled, and then pans', () => {
      const { container } = open({ imageUrl: 'map.png' });
      const stage = viewport(container);
      let captured = 0;
      stage.setPointerCapture = () => {
        captured++;
      };
      // Zoomed in, so there is picture to slide.
      fireEvent.wheel(stage, { deltaY: -1 });
      fireEvent.wheel(stage, { deltaY: -1 });

      fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
      // Under the threshold: still a tap, still no capture, no pan.
      fireEvent.pointerMove(stage, { pointerId: 1, clientX: 102, clientY: 101 });
      expect(captured).toBe(0);
      expect(style(container)).toContain('translate(0px, 0px)');

      // Past it: now it is a drag.
      fireEvent.pointerMove(stage, { pointerId: 1, clientX: 140, clientY: 130 });
      expect(captured).toBe(1);
      expect(style(container)).toContain('translate(40px, 30px)');
      // And the easing is off while it is moving, or the map lags the pointer.
      const surface = container.querySelector('[data-map="surface"]')!;
      expect(surface.hasAttribute('data-dragging')).toBe(true);
      expect(surface.className).toContain('transition-none');
      fireEvent.pointerUp(stage, { pointerId: 1, clientX: 140, clientY: 130 });
    });
  });
});
