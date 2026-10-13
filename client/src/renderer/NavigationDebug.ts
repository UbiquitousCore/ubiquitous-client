/** Walkable-ground overlay: the server's baked polygons drawn on the ground
 * they describe. Reads plain arrays from world/; builds Three objects here only. */

import * as THREE from 'three';
import type { NavigationGround } from '../world/NavigationGround';

/** Lift above the floor, so the overlay does not z-fight the terrain. */
const LIFT = 0.02;

/** The polygon under the player, drawn white so it is unmistakable. */
const STANDING_COLOUR = new THREE.Color(1, 1, 1);

/**
 * Links are drawn a little higher again, so a line between two polygons is
 * not buried in the fill of either.
 */
const LINK_LIFT = 0.25;

/** Vertical reach for one storey: the overlay has no depth test, so other floors would hover. */
export const ONE_STOREY = 4;

export interface NavigationDebugStats {
  polygons: number;
  /** Links drawn — a link whose far end was not sent cannot be drawn. */
  links: number;
  /** Polygons left out because they belong to another storey. */
  otherStoreys: number;
}

export interface NavigationDebugObject {
  object: THREE.Group;
  stats: NavigationDebugStats;
  dispose(): void;
}

/** Golden-angle hues, so neighbouring polygons (numbered in scan order) differ. */
function colourFor(index: number, into: THREE.Color): THREE.Color {
  return into.setHSL((index * 0.618033988749895) % 1, 0.75, 0.55);
}

/** Build the overlay (fills, outlines, links between linked pairs), or null with no polygons. */
export function buildNavigationOverlay(
  ground: NavigationGround,
  standingOn: number | null,
  /** Draw only the storey around this height; null draws every one of them. */
  aroundY: number | null = null,
): NavigationDebugObject | null {
  const all = ground.polygons;
  if (all.length === 0) return null;

  const polygons =
    aroundY === null
      ? all
      : all.filter(polygon => Math.abs(middleY(polygon.vertices) - aroundY) <= ONE_STOREY);
  const otherStoreys = all.length - polygons.length;
  if (polygons.length === 0) return null;

  const fillPositions: number[] = [];
  const fillColours: number[] = [];
  const edgePositions: number[] = [];
  const edgeColours: number[] = [];
  const linkPositions: number[] = [];
  const colour = new THREE.Color();

  for (const polygon of polygons) {
    const shade = polygon.index === standingOn ? STANDING_COLOUR : colourFor(polygon.index, colour);
    const { r, g, b } = shade;
    // Convex outline, so a fan from the first corner covers it exactly.
    for (let i = 1; i + 1 < polygon.vertices.length; i++) {
      pushVertex(fillPositions, polygon.vertices[0]);
      pushVertex(fillPositions, polygon.vertices[i]);
      pushVertex(fillPositions, polygon.vertices[i + 1]);
      for (let c = 0; c < 3; c++) fillColours.push(r, g, b);
    }
    for (let i = 0; i < polygon.vertices.length; i++) {
      pushVertex(edgePositions, polygon.vertices[i]);
      pushVertex(edgePositions, polygon.vertices[(i + 1) % polygon.vertices.length]);
      edgeColours.push(r, g, b, r, g, b);
    }
  }

  const linksOf = new Map<number, Set<number>>();
  for (const polygon of polygons) linksOf.set(polygon.index, new Set(polygon.links));

  const drawn = new Set(polygons.map(polygon => polygon.index));
  let links = 0;
  for (const polygon of polygons) {
    const from = ground.centroidOf(polygon.index);
    if (!from) continue;
    for (const to of polygon.links) {
      // Each mutual pair once. A link the bake wrote only one way still
      // draws, which is deliberate: a one-way link is itself worth seeing.
      if (to < polygon.index && linksOf.get(to)?.has(polygon.index)) continue;
      // A link to a storey that is not drawn has no line to draw it as.
      if (!drawn.has(to)) continue;
      const other = ground.centroidOf(to);
      // Only part of the map is sent, so a link may name a polygon that is
      // not here. Not drawing it is right; treating it as missing is not.
      if (!other) continue;
      linkPositions.push(from[0], from[1] + LINK_LIFT, from[2]);
      linkPositions.push(other[0], other[1] + LINK_LIFT, other[2]);
      links++;
    }
  }

  const group = new THREE.Group();
  group.name = 'navigation-debug';

  const fillGeometry = new THREE.BufferGeometry();
  fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3));
  fillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fillColours, 3));
  const fillMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const fill = new THREE.Mesh(fillGeometry, fillMaterial);
  fill.frustumCulled = false;
  fill.renderOrder = 998;
  group.add(fill);

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(edgeColours, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    fog: false,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.frustumCulled = false;
  edges.renderOrder = 999;
  group.add(edges);

  const linkGeometry = new THREE.BufferGeometry();
  linkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linkPositions, 3));
  const linkMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    fog: false,
  });
  const linkLines = new THREE.LineSegments(linkGeometry, linkMaterial);
  linkLines.frustumCulled = false;
  linkLines.renderOrder = 1000;
  group.add(linkLines);

  return {
    object: group,
    stats: { polygons: polygons.length, links, otherStoreys },
    dispose(): void {
      fillGeometry.dispose();
      fillMaterial.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      linkGeometry.dispose();
      linkMaterial.dispose();
    },
  };
}

function pushVertex(into: number[], vertex: [number, number, number]): void {
  into.push(vertex[0], vertex[1] + LIFT, vertex[2]);
}

/** A polygon's own height, as the one number that places it on a storey. */
function middleY(vertices: Array<[number, number, number]>): number {
  let total = 0;
  for (const vertex of vertices) total += vertex[1];
  return total / vertices.length;
}
