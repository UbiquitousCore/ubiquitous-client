/**
 * The walkable-ground viewer's own logic: reading the server's answer, finding
 * the polygon under the player, and the summary an operator judges a bake by.
 *
 * Every mesh here is written out by hand. A real bake is the server operator's
 * own data, it is not in this repository, and nothing here needs a GPU.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { NavigationGround } from '../src/world/NavigationGround';
import type { NavigationGroundData, NavPolygon } from '../src/world/NavigationGround';
import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

/** A flat square of floor, corner to corner, at one height. */
function floor(
  index: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  y: number,
  links: number[] = [],
): NavPolygon {
  return {
    index,
    vertices: [
      [minX, y, minZ],
      [maxX, y, minZ],
      [maxX, y, maxZ],
      [minX, y, maxZ],
    ],
    links,
  };
}

function ground(polygons: NavPolygon[], over: Partial<NavigationGroundData> = {}) {
  const data: NavigationGroundData = {
    mapId: 13,
    baked: true,
    polygonCount: polygons.length,
    centre: [0, 0, 0],
    radius: 60,
    truncated: false,
    parameters: {
      cellSize: 0.5,
      bodyRadius: 0.5,
      stepHeight: 0.5,
      maxSlopeDegrees: 50,
      headroom: 2,
    },
    polygons,
    standingOn: null,
    groundY: null,
    playerY: 0,
    ...over,
  };
  return new NavigationGround(data);
}

describe('the polygon under the player', () => {
  it('finds the one covering the point', () => {
    const mesh = ground([floor(0, 0, 0, 4, 4, 2, [1]), floor(1, 4, 0, 8, 4, 2, [0])]);

    expect(mesh.polygonAt(1, 1, 2)?.index).toBe(0);
    expect(mesh.polygonAt(6, 1, 2)?.index).toBe(1);
  });

  it('is nothing where the bake covers no ground', () => {
    const mesh = ground([floor(0, 0, 0, 4, 4, 2)]);
    expect(mesh.polygonAt(50, 50, 2)).toBeNull();
  });

  /**
   * The whole reason this is a mesh and not a heightmap: two floors of a
   * building are two polygons over the same spot, and the height asked about
   * is what picks between them.
   */
  it('picks the storey the player is on, not the one below', () => {
    const mesh = ground([floor(0, 0, 0, 4, 4, 0), floor(1, 0, 0, 4, 4, 8)]);

    expect(mesh.polygonAt(2, 2, 7.8)?.index).toBe(1);
    expect(mesh.polygonAt(2, 2, 0.2)?.index).toBe(0);
  });

  it('reads a sloped polygon as a slope rather than a step', () => {
    const mesh = ground([
      {
        index: 0,
        vertices: [
          [0, 0, 0],
          [10, 5, 0],
          [10, 5, 4],
          [0, 0, 4],
        ],
        links: [],
      },
    ]);

    expect(mesh.heightOf(0, 5, 2)).toBeCloseTo(2.5, 5);
    expect(mesh.heightOf(0, 0, 2)).toBeCloseTo(0, 5);
  });
});

describe('the summary an operator reads', () => {
  it('reports the gap between the height the bake claims and where the player is', () => {
    // Which floor the player is on is the server's own answer, carried on the
    // message; this reports it rather than working out a second opinion.
    const mesh = ground([floor(0, 0, 0, 4, 4, 2, [1]), floor(1, 4, 0, 8, 4, 2, [0])], {
      standingOn: 0,
      groundY: 2,
    });

    const summary = mesh.summary(2, 3.25, 2);

    expect(summary.standingOn).toBe(0);
    expect(summary.groundY).toBeCloseTo(2, 5);
    expect(summary.playerY).toBe(3.25);
    expect(summary.drift).toBeCloseTo(1.25, 5);
    expect(summary.links).toEqual([1]);
  });

  it('says so when the player stands where the bake has no ground at all', () => {
    const summary = ground([floor(0, 0, 0, 4, 4, 2)]).summary(50, 2, 50);

    expect(summary.standingOn).toBeNull();
    expect(summary.groundY).toBeNull();
    expect(summary.drift).toBeNull();
    expect(summary.links).toEqual([]);
  });

  /**
   * A doorway the bake closed: two rectangles meeting along an edge with no
   * link between them. Nothing can be walked across that join, and from inside
   * the world it looks exactly like a wall nobody built.
   */
  it('names a neighbour it touches but carries no link to', () => {
    const mesh = ground([floor(0, 0, 0, 4, 4, 2), floor(1, 4, 0, 8, 4, 2)], {
      standingOn: 0,
      groundY: 2,
    });

    expect(mesh.summary(2, 2, 2).touchingWithoutLink).toEqual([1]);
  });

  /**
   * Where the server would stand nobody, the nearest floor it does hold is
   * what says whether the bake is missing this ground or has it elsewhere.
   */
  it('names the nearest floor even where the server would stand nobody', () => {
    const mesh = ground([floor(0, 0, 0, 4, 4, 2)], { standingOn: null, groundY: null });

    const summary = mesh.summary(2, 9, 2);

    expect(summary.standingOn).toBeNull();
    expect(summary.groundY).toBeNull();
    expect(summary.nearestY).toBeCloseTo(2, 5);
  });

  it('does not call the floor above a closed doorway', () => {
    // Over the same footprint, a storey up. Unlinked and unreachable on
    // purpose: that is a ceiling, not a way through.
    const mesh = ground([floor(0, 0, 0, 4, 4, 0), floor(1, 0, 0, 4, 4, 8)]);

    expect(mesh.summary(2, 0, 2).touchingWithoutLink).toEqual([]);
  });

  it('carries the counts and the rules the map was baked with', () => {
    const mesh = ground([floor(0, 0, 0, 4, 4, 2)], { polygonCount: 900, truncated: true });

    const summary = mesh.summary(2, 2, 2);

    expect(summary.drawn).toBe(1);
    expect(summary.polygonCount).toBe(900);
    expect(summary.truncated).toBe(true);
    expect(summary.parameters?.stepHeight).toBe(0.5);
  });
});

describe('asking the server for it', () => {
  let socket: FakeWebSocket;
  type GroundHandler = (ground: NavigationGroundData) => void;
  let events: ConnectionEvents & { onNavigationGround: Mock<GroundHandler> };

  beforeEach(() => {
    socket = new FakeWebSocket();
    events = { onNavigationGround: vi.fn<GroundHandler>() };
  });

  async function connected() {
    const conn = new WebSocketConnection({
      url: 'ws://server.invalid:7020',
      createSocket: () => socket,
    });
    const connecting = conn.connect(events);
    socket.accept();
    await connecting;
    return conn;
  }

  it('asks with no radius by default, so the server picks one', async () => {
    const conn = await connected();

    conn.sendNavigationRequest();
    conn.sendNavigationRequest(120);

    expect(socket.ofType('navigation.request').map(m => m.payload)).toEqual([{}, { radius: 120 }]);
  });

  it('reads flattened corners back into polygons', async () => {
    await connected();

    socket.emit('navigation.ground', {
      mapId: 13,
      baked: true,
      polygonTotal: 900,
      centre: [1, 2, 3],
      radius: 60,
      truncated: false,
      parameters: {
        cellSize: 0.5,
        bodyRadius: 0.5,
        stepHeight: 0.5,
        maxSlopeDegrees: 50,
        headroom: 2,
      },
      polygons: [{ index: 7, vertices: [0, 2, 0, 4, 2, 0, 4, 2, 4, 0, 2, 4], links: [8] }],
      standingOn: 7,
      groundY: 2,
      playerY: 2.5,
    });

    const data = events.onNavigationGround.mock.calls[0]![0];
    expect(data.mapId).toBe(13);
    expect(data.polygonCount).toBe(900);
    expect(data.polygons).toEqual([
      {
        index: 7,
        vertices: [
          [0, 2, 0],
          [4, 2, 0],
          [4, 2, 4],
          [0, 2, 4],
        ],
        links: [8],
      },
    ]);
    expect(data.standingOn).toBe(7);
    expect(data.groundY).toBe(2);
    expect(data.playerY).toBe(2.5);
  });

  /**
   * A map nobody has baked. The server answers rather than failing, and the
   * optional fields are simply absent — which is how every optional field on
   * this wire travels.
   */
  it('reads a map with no bake as an empty answer, not a failure', async () => {
    await connected();

    socket.emit('navigation.ground', {
      mapId: 5,
      baked: false,
      polygonTotal: 0,
      centre: [0, 0, 0],
      radius: 60,
      truncated: false,
      polygons: [],
      playerY: 3,
    });

    const data = events.onNavigationGround.mock.calls[0]![0];
    expect(data.baked).toBe(false);
    expect(data.parameters).toBeNull();
    expect(data.standingOn).toBeNull();
    expect(data.groundY).toBeNull();
    expect(data.polygons).toEqual([]);
  });

  it('drops a polygon with fewer than three corners rather than drawing half of one', async () => {
    await connected();

    socket.emit('navigation.ground', {
      mapId: 13,
      baked: true,
      polygonTotal: 2,
      centre: [0, 0, 0],
      radius: 60,
      truncated: false,
      polygons: [
        { index: 0, vertices: [0, 0, 0, 1, 0, 0], links: [] },
        { index: 1, vertices: [0, 0, 0, 1, 0, 0, 1, 0, 1, 9, 9], links: [] },
      ],
      playerY: 0,
    });

    const data = events.onNavigationGround.mock.calls[0]![0];
    // The first has two corners and goes; the second's trailing part-corner is
    // dropped and the three whole ones stand.
    expect(data.polygons.map(p => p.index)).toEqual([1]);
    expect(data.polygons[0].vertices).toHaveLength(3);
  });
});
