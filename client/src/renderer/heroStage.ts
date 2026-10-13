/** A character on its own stage canvas from the shared renderer; a resized or hidden box copies nothing. */

import * as THREE from 'three';

/** One open character-sheet stage; see `Renderer.stageHero`. */
export interface HeroStage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  box: HTMLElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  body: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  yaw: number;
  /** Whether the player has turned the body. */
  touched: boolean;
  height: number;
  centreY: number;
  /** The frame's colour behind the stage; read from the DOM on mount and resize, not per frame. */
  background: THREE.Color;
  /** Camera distance as a multiple of the framing distance; the wheel moves it. */
  zoom: number;
}

/** How far one pixel of wheel travel zooms, as an exponent: 100px is about 10%. */
export const STAGE_ZOOM_PER_WHEEL_PX = 0.001;

export const STAGE_ZOOM_MIN = 0.5;

export const STAGE_ZOOM_MAX = 2.5;

/** Keep the stage camera between a close head-and-shoulders and a distant full body. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, zoom));
}

/**
 * Where a stage's pixels sit in the main drawing buffer, and how much of it
 * to take. The stage renders at the buffer's origin — bottom-left in GL —
 * which `drawImage` reads from the top, hence `sourceY`. A stage larger than
 * the buffer is cropped to it; a buffer with no room at all yields null.
 */
export function stageCopyRect(
  stageWidth: number,
  stageHeight: number,
  bufferWidth: number,
  bufferHeight: number,
): { width: number; height: number; sourceY: number } | null {
  const width = Math.min(stageWidth, bufferWidth);
  const height = Math.min(stageHeight, bufferHeight);
  if (width <= 0 || height <= 0) return null;
  return { width, height, sourceY: bufferHeight - height };
}

/** Backdrop colour behind a stage (nearest opaque ancestor, else black). */
export function stageBackground(box: HTMLElement): THREE.Color {
  const colour = new THREE.Color(0x000000);
  if (typeof getComputedStyle === 'undefined') return colour;
  for (let el: HTMLElement | null = box; el; el = el.parentElement) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(bg);
    if (!m) continue;
    if (m[4] !== undefined && Number(m[4]) === 0) continue;
    return colour.setRGB(
      Number(m[1]) / 255,
      Number(m[2]) / 255,
      Number(m[3]) / 255,
      THREE.SRGBColorSpace,
    );
  }
  return colour;
}
