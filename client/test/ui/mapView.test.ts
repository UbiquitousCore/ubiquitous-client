import { describe, expect, it } from 'vitest';
import {
  AREA_MAP_ASPECT,
  FITTED_VIEW,
  MAX_ZOOM,
  areaMapFrame,
  clampPan,
  fittedWidth,
  markerShown,
  onPicture,
  pannedTo,
  regionDrawing,
  regionSpot,
  routeLine,
  zoomedBy,
} from '../../src/ui/components/mapView';

describe('areaMapFrame', () => {
  it('leaves a frame that is already 3:2 alone', () => {
    expect(areaMapFrame([0, 0, 300, 200])).toEqual([0, 0, 300, 200]);
  });

  it('grows the short axis about the centre, never the long one', () => {
    // A square zone: the picture is 3:2, so the frame widens by half its own
    // width on each side and the vertical extent is untouched.
    expect(areaMapFrame([0, 0, 100, 100])).toEqual([-25, 0, 125, 100]);
    // A tall zone widens; a wide one grows downward and upward instead.
    expect(areaMapFrame([0, 0, 300, 100])).toEqual([0, -50, 300, 150]);
  });

  it('normalises bounds given the wrong way round', () => {
    expect(areaMapFrame([300, 200, 0, 0])).toEqual([0, 0, 300, 200]);
  });

  it('always comes out at the picture aspect', () => {
    for (const bounds of [
      [0, 0, 100, 100],
      [0, 0, 700, 90],
      [-40, 10, 20, 500],
    ] as const) {
      const [x0, z0, x1, z1] = areaMapFrame([...bounds]);
      expect((x1 - x0) / (z1 - z0)).toBeCloseTo(AREA_MAP_ASPECT);
    }
  });
});

describe('fittedWidth', () => {
  it('is as wide as the screen, but no wider than its height lets the aspect be', () => {
    expect(fittedWidth(1.5)).toBe('min(100%, calc((100dvh - 2 * 1rem) * 1.5))');
    expect(fittedWidth(1.5, '0px')).toBe('min(100%, calc((100dvh - 2 * 0px) * 1.5))');
  });
});

describe('onPicture', () => {
  const frame = [100, 200, 400, 400] as [number, number, number, number];

  it('puts the frame corners at the picture corners and the middle in the middle', () => {
    expect(onPicture([100, 0, 200], frame)).toEqual({ left: 0, top: 0 });
    expect(onPicture([400, 0, 400], frame)).toEqual({ left: 100, top: 100 });
    expect(onPicture([250, 0, 300], frame)).toEqual({ left: 50, top: 50 });
  });

  it('runs down the picture as the world runs south, without flipping', () => {
    expect(onPicture([250, 0, 250], frame).top).toBeLessThan(onPicture([250, 0, 350], frame).top);
  });

  it('does not divide by a frame with no extent', () => {
    expect(Number.isFinite(onPicture([5, 0, 5], [5, 5, 5, 5]).left)).toBe(true);
  });
});

describe('routeLine', () => {
  it('runs between the two ends of the leg, in the same percentages as a place', () => {
    const frame = [0, 0, 300, 200] as [number, number, number, number];
    expect(routeLine({ id: 'a', from: [0, 0, 0], to: [300, 0, 100] }, frame)).toEqual({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 50,
    });
  });
});

describe('regionSpot', () => {
  it("turns a box in a picture's own pixels into percentages of that picture", () => {
    expect(regionSpot({ x: 72, y: 96, w: 36, h: 48 }, { width: 720, height: 480 })).toEqual({
      left: 10,
      top: 20,
      width: 5,
      height: 10,
    });
  });
});

describe('the view', () => {
  const size = { width: 400, height: 300 };

  it('zooms in on wheel up and out on wheel down, between fitted and the cap', () => {
    expect(zoomedBy(FITTED_VIEW, -1, size).zoom).toBe(1.25);
    expect(zoomedBy(FITTED_VIEW, 1, size).zoom).toBe(1);
    let view = FITTED_VIEW;
    for (let notch = 0; notch < 40; notch++) view = zoomedBy(view, -1, size);
    expect(view.zoom).toBe(MAX_ZOOM);
  });

  it('cannot slide a picture that fits, and slides one that is zoomed only as far as its edge', () => {
    expect(clampPan({ x: 90, y: -90 }, 1, size)).toEqual({ x: 0, y: 0 });
    // At 2x the picture is twice the window: half the window of room each way.
    expect(clampPan({ x: 500, y: -500 }, 2, size)).toEqual({ x: 200, y: -150 });
    expect(clampPan({ x: 50, y: 20 }, 2, size)).toEqual({ x: 50, y: 20 });
  });

  it('pulls the pan back in when zooming out leaves it past the new edge', () => {
    const wide = pannedTo({ zoom: 3, pan: { x: 0, y: 0 } }, { x: 400, y: 0 }, size);
    expect(wide.pan.x).toBe(400);
    expect(zoomedBy(wide, 1, size).pan.x).toBe(350);
  });
});

describe('regionDrawing', () => {
  const routes = [{ id: 'a', from: [0, 0, 0], to: [1, 0, 1] }] as [
    { id: string; from: [number, number, number]; to: [number, number, number] },
  ];

  it('shows the plain picture and no network when not travelling', () => {
    expect(
      regionDrawing({ travelling: false, imageUrl: 'plain', routeImageUrl: 'net', routes }),
    ).toEqual({
      imageUrl: 'plain',
      lines: [],
    });
  });

  it('swaps in the picture that has the network drawn in, and draws no lines over it', () => {
    expect(
      regionDrawing({ travelling: true, imageUrl: 'plain', routeImageUrl: 'net', routes }),
    ).toEqual({
      imageUrl: 'net',
      lines: [],
    });
  });

  it('draws a line along each leg where the build has no such picture', () => {
    expect(
      regionDrawing({ travelling: true, imageUrl: 'plain', routeImageUrl: null, routes }),
    ).toEqual({
      imageUrl: 'plain',
      lines: routes,
    });
  });

  it('waits for the picture rather than showing the network twice', () => {
    expect(regionDrawing({ travelling: true, imageUrl: 'plain', routes })).toEqual({
      imageUrl: 'plain',
      lines: [],
    });
  });
});

describe('markerShown', () => {
  it('shows a quest marker and the player at any zoom', () => {
    for (const zoom of [1, 2.5, MAX_ZOOM]) {
      expect(markerShown('quest', zoom)).toBe(true);
      expect(markerShown('player', zoom)).toBe(true);
      expect(markerShown('member', zoom)).toBe(true);
    }
  });

  it('shows a shop or teleporter only at the closest zoom', () => {
    expect(markerShown('service', 1)).toBe(false);
    expect(markerShown('service', MAX_ZOOM - 0.25)).toBe(false);
    expect(markerShown('service', MAX_ZOOM)).toBe(true);
    expect(markerShown('teleport', MAX_ZOOM)).toBe(true);
  });
});
