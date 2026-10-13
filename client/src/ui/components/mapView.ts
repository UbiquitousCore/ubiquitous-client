/** Where things stand on a map picture, and how far it may be dragged and zoomed. */

import type { MapMarkerKind, MapRouteLeg } from '../mapModel';

/** The shape the region pictures are drawn at: three across to two down. */
export const AREA_MAP_ASPECT = 1.5;

/** The world frame a region picture covers: left, top, right, bottom. */
export type MapFrame = [number, number, number, number];

/** The top zone's bounds grown about the centre to 1.5:1, the picture's aspect, so markers land right. */
export function areaMapFrame(bounds: MapFrame): MapFrame {
  const [x0, z0, x1, z1] = bounds;
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(z0, z1);
  const bottom = Math.max(z0, z1);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return [left, top, right, bottom];
  if (width / height > AREA_MAP_ASPECT) {
    const grown = width / AREA_MAP_ASPECT;
    const pad = (grown - height) / 2;
    return [left, top - pad, right, bottom + pad];
  }
  const grown = AREA_MAP_ASPECT * height;
  const pad = (grown - width) / 2;
  return [left - pad, top, right + pad, bottom];
}

/** The widest window of this aspect that fits on screen with its margin; never stretched (marks are percentages). */
export function fittedWidth(aspect: number, margin = '1rem'): string {
  return `min(100%, calc((100dvh - 2 * ${margin}) * ${aspect}))`;
}

/**
 * Where a world position lands on the picture, as percentages of its box.
 *
 * Screen Y grows with world Z: the picture is a view from above with +Z
 * running down it, so there is no axis to flip.
 */
export function onPicture(
  position: readonly [number, number, number],
  frame: MapFrame,
): { left: number; top: number } {
  const across = (value: number, min: number, max: number): number =>
    ((value - min) / Math.max(1, max - min)) * 100;
  return {
    left: across(position[0], frame[0], frame[2]),
    top: across(position[2], frame[1], frame[3]),
  };
}

/** One bus leg as the two ends of a line on the picture, in percent. */
export function routeLine(
  leg: MapRouteLeg,
  frame: MapFrame,
): { x1: number; y1: number; x2: number; y2: number } {
  const from = onPicture(leg.from, frame);
  const to = onPicture(leg.to, frame);
  return { x1: from.left, y1: from.top, x2: to.left, y2: to.top };
}

/**
 * Where a press area the movie places in the world picture's own pixels
 * stands on the picture, as percentages of it.
 */
export function regionSpot(
  box: { x: number; y: number; w: number; h: number },
  picture: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  return {
    left: (box.x / picture.width) * 100,
    top: (box.y / picture.height) * 100,
    width: (box.w / picture.width) * 100,
    height: (box.h / picture.height) * 100,
  };
}

/** How far a picture may be zoomed in, as a multiple of fitting the window. */
export const MAX_ZOOM = 4;
/** How much one notch of the wheel zooms. */
export const ZOOM_STEP = 0.25;

/** How far a press has to travel before it counts as a drag rather than a tap. */
export const DRAG_THRESHOLD_PX = 5;

/**
 * Whether a marker is drawn at this zoom. A quest marker always is; the shops
 * and teleporters only once the picture is zoomed in as far as it goes, where
 * there is room for them.
 */
export function markerShown(kind: MapMarkerKind, zoom: number): boolean {
  return kind === 'quest' || kind === 'player' || zoom >= MAX_ZOOM;
}

export interface MapView {
  zoom: number;
  pan: { x: number; y: number };
}

export const FITTED_VIEW: MapView = { zoom: 1, pan: { x: 0, y: 0 } };

/** The pan that keeps a zoomed picture covering its window. */
export function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  size: { width: number; height: number },
): { x: number; y: number } {
  const room = (extent: number): number => (Math.max(1, zoom) - 1) * extent * 0.5;
  // `+ 0` turns a negative zero, which no pan has any use for, into zero.
  const limit = (value: number, extent: number): number =>
    Math.max(-room(extent), Math.min(room(extent), value)) + 0;
  return { x: limit(pan.x, size.width), y: limit(pan.y, size.height) };
}

/** The view after one notch of the wheel, wheel up zooming in. */
export function zoomedBy(
  view: MapView,
  deltaY: number,
  size: { width: number; height: number },
): MapView {
  const zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
  return { zoom, pan: clampPan(view.pan, zoom, size) };
}

/** The view after the picture has been dragged to `pan`. */
export function pannedTo(
  view: MapView,
  pan: { x: number; y: number },
  size: { width: number; height: number },
): MapView {
  return { zoom: view.zoom, pan: clampPan(pan, view.zoom, size) };
}

/** While travelling, the build's network picture replaces the plain one; otherwise lines are drawn, never both. */
export function regionDrawing(args: {
  travelling: boolean;
  imageUrl?: string | null;
  routeImageUrl?: string | null;
  routes?: readonly MapRouteLeg[];
}): { imageUrl: string | null; lines: readonly MapRouteLeg[] } {
  const plain = args.imageUrl ?? null;
  if (!args.travelling) return { imageUrl: plain, lines: [] };
  if (args.routeImageUrl) return { imageUrl: args.routeImageUrl, lines: [] };
  return { imageUrl: plain, lines: args.routeImageUrl === null ? (args.routes ?? []) : [] };
}
