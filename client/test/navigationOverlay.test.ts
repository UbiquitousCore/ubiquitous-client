/**
 * The walkable-ground overlay, built headless: polygons in, Three objects out.
 * Building a scene graph needs no WebGL context, so this runs like any other
 * renderer factory test.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { buildNavigationOverlay } from '../src/renderer/NavigationDebug';
import { NavigationGround } from '../src/world/NavigationGround';
import type { NavigationGroundData, NavPolygon } from '../src/world/NavigationGround';

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

function ground(polygons: NavPolygon[]) {
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
  };
  return new NavigationGround(data);
}

function attribute(object: THREE.Object3D, kind: string, name: string): THREE.BufferAttribute {
  const child = object.children.find(c => c.type === kind) as
    | THREE.Mesh<THREE.BufferGeometry>
    | THREE.LineSegments<THREE.BufferGeometry>;
  return child.geometry.getAttribute(name) as THREE.BufferAttribute;
}

describe('the walkable-ground overlay', () => {
  it('is nothing at all when there are no polygons', () => {
    expect(buildNavigationOverlay(ground([]), null)).toBeNull();
  });

  it('fills each four-corner polygon with two triangles', () => {
    const built = buildNavigationOverlay(ground([floor(0, 0, 0, 4, 4, 2)]), null)!;

    expect(attribute(built.object, 'Mesh', 'position').count).toBe(6);
    built.dispose();
  });

  /**
   * Neighbours have to be tellable apart or the mesh reads as one sheet. The
   * bake numbers its rectangles in scan order, so consecutive numbers are
   * usually neighbours — this pins that consecutive numbers get different
   * colours.
   */
  it('gives neighbouring polygons different colours', () => {
    const built = buildNavigationOverlay(
      ground([floor(0, 0, 0, 4, 4, 2, [1]), floor(1, 4, 0, 8, 4, 2, [0])]),
      null,
    )!;

    const colours = attribute(built.object, 'Mesh', 'color');
    const first = [colours.getX(0), colours.getY(0), colours.getZ(0)];
    const second = [colours.getX(6), colours.getY(6), colours.getZ(6)];

    expect(first).not.toEqual(second);
    built.dispose();
  });

  it('draws the polygon under the player white', () => {
    const built = buildNavigationOverlay(
      ground([floor(0, 0, 0, 4, 4, 2, [1]), floor(1, 4, 0, 8, 4, 2, [0])]),
      1,
    )!;

    const colours = attribute(built.object, 'Mesh', 'color');
    expect([colours.getX(6), colours.getY(6), colours.getZ(6)]).toEqual([1, 1, 1]);
    built.dispose();
  });

  it('draws a mutual link once, not once from each end', () => {
    const built = buildNavigationOverlay(
      ground([floor(0, 0, 0, 4, 4, 2, [1]), floor(1, 4, 0, 8, 4, 2, [0])]),
      null,
    )!;

    expect(built.stats.links).toBe(1);
    built.dispose();
  });

  /**
   * Only part of a map is sent at a time, so a link may name a polygon that
   * is not here. Leaving the line out is right; counting it as drawn is not.
   */
  it('leaves out a link whose far end was not sent', () => {
    const built = buildNavigationOverlay(ground([floor(0, 0, 0, 4, 4, 2, [99])]), null)!;

    expect(built.stats.links).toBe(0);
    built.dispose();
  });

  /**
   * A prison has four floors over the same ground and the overlay has no
   * depth test, so drawing them all at once puts ground in mid-air over the
   * room you are standing in, which reads as a bad bake.
   */
  it('draws the storey the player is on, not the ones above and below it', () => {
    const storeys = ground([
      floor(0, 0, 0, 4, 4, -6),
      floor(1, 0, 0, 4, 4, 0),
      floor(2, 0, 0, 4, 4, 9),
    ]);

    const one = buildNavigationOverlay(storeys, null, 0)!;
    expect(one.stats.polygons).toBe(1);
    expect(one.stats.otherStoreys).toBe(2);
    one.dispose();

    const every = buildNavigationOverlay(storeys, null, null)!;
    expect(every.stats.polygons).toBe(3);
    expect(every.stats.otherStoreys).toBe(0);
    every.dispose();
  });

  /** A line to a storey that is not drawn has nothing to draw it as. */
  it('leaves out a link to a storey it is not drawing', () => {
    const built = buildNavigationOverlay(
      ground([floor(0, 0, 0, 4, 4, 0, [1]), floor(1, 0, 0, 4, 4, 9, [0])]),
      null,
      0,
    )!;

    expect(built.stats.links).toBe(0);
    built.dispose();
  });

  it('lifts the polygons clear of the ground they sit on', () => {
    const built = buildNavigationOverlay(ground([floor(0, 0, 0, 4, 4, 2)]), null)!;

    const positions = attribute(built.object, 'Mesh', 'position');
    expect(positions.getY(0)).toBeGreaterThan(2);
    expect(positions.getY(0)).toBeLessThan(2.2);
    built.dispose();
  });
});
