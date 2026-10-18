/** The name over a body's head, drawn once into a canvas sprite; `nameLabelLayout` holds the arithmetic. */

import * as THREE from 'three';

import { canvasFont } from '../core/lettering';
import { findAttachmentNode } from './attachPoints';
import type { Relation } from './TargetRing';

/** Names over a friendly creature's head, and over corpses and quest NPCs. */
const FRIENDLY_NAME = '#08dd25';

/** Names over a hostile creature's head. */
const HOSTILE_NAME = '#c81902';

/** Names over a creature that neither helps nor attacks. */
const NEUTRAL_NAME = '#fafa32';

/** Names over a creature the player can catch as a pet. */
const CAPTURABLE_NAME = '#b766ec';

/** Names over other players. */
export const PLAYER_NAME_COLOUR = '#b2d5e5';

/**
 * The colour of another player's always-on name: red while they are the
 * hero's opponent, as a duel makes them, and the player colour otherwise.
 */
export function playerNameColour(relation: Relation): string {
  return relation === 'enemy' ? HOSTILE_NAME : PLAYER_NAME_COLOUR;
}

/** Creature nameplate colours by relationship to the hero. */
export const NAME_COLOURS: Record<Relation, string> = {
  ally: FRIENDLY_NAME,
  bystander: NEUTRAL_NAME,
  enemy: HOSTILE_NAME,
  catchable: CAPTURABLE_NAME,
  corpse: FRIENDLY_NAME,
  questUnit: FRIENDLY_NAME,
};

/** Own choice: glyph height in nameplates, eye-picked; see test for line layout. */
export const NAME_LABEL_PX = 38;

/** Name/role gap: exactly one line (single string, single font, no leading). */
export const NAME_LABEL_LINE_PX = NAME_LABEL_PX;

/** Canvas heights: enough for the glyphs and their drop shadow, no more. */
export const NAME_LABEL_ONE_LINE_PX = 96;

export const NAME_LABEL_TWO_LINE_PX = 112;

/** World height of a one-line nameplate's canvas; taller canvases scale with it. */
export const NAME_LABEL_WORLD_HEIGHT = 0.9;

/** Nameplate line layout (exported for its test). */
export function nameLabelLayout(lineCount: number): {
  height: number;
  textPx: number;
  centres: number[];
} {
  if (lineCount < 2) {
    return {
      height: NAME_LABEL_ONE_LINE_PX,
      textPx: NAME_LABEL_PX,
      centres: [NAME_LABEL_ONE_LINE_PX / 2 - 2],
    };
  }
  const half = NAME_LABEL_LINE_PX / 2;
  const middle = NAME_LABEL_TWO_LINE_PX / 2;
  return {
    height: NAME_LABEL_TWO_LINE_PX,
    textPx: NAME_LABEL_PX,
    centres: [middle - half, middle + half],
  };
}

/** What a label draws, kept on its sprite so it can be drawn again. */
interface LabelText {
  lines: string[];
  colour: string;
}

/**
 * Rasterise `lines` into a fresh canvas, in the body face.
 *
 * The canvas is as wide as the text measures, so the world size the
 * sprite is given keeps the glyphs' own aspect.
 */
function paintLabel({ lines, colour }: LabelText): HTMLCanvasElement {
  const layout = nameLabelLayout(lines.length);
  const canvas = document.createElement('canvas');
  const font = canvasFont(layout.textPx);
  canvas.width = 1;
  canvas.height = layout.height;
  const context = canvas.getContext('2d')!;
  context.font = font;
  let textWidth = 0;
  for (const line of lines) {
    textWidth = Math.max(textWidth, Math.ceil(context.measureText(line).width));
  }
  canvas.width = Math.max(96, textWidth + 32);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // Resizing a canvas resets its drawing state, including the font.
  context.font = font;
  context.shadowColor = 'rgba(0, 0, 0, 1)';
  context.shadowBlur = 2;
  context.shadowOffsetX = 3;
  context.shadowOffsetY = 4;
  context.fillStyle = colour;
  // The two lines straddle the nameplate height, half a line each side and
  // exactly one line apart. See `NAME_LABEL_LINE_PX`.
  for (const [i, line] of lines.entries()) {
    context.fillText(line, canvas.width / 2, layout.centres[i]!);
  }
  return canvas;
}

function labelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** The measured bitmap and world size share one aspect, so glyphs are never stretched. */
function fitLabel(sprite: THREE.Sprite, canvas: HTMLCanvasElement): void {
  const worldHeight = NAME_LABEL_WORLD_HEIGHT * (canvas.height / NAME_LABEL_ONE_LINE_PX);
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
}

/** Head label: name + optional dashed role line, centred on plate height. */
export function unitNameLabel(
  name: string,
  subName: string | undefined,
  colour: string,
  plateHeight: number,
): THREE.Sprite {
  const text: LabelText = { lines: subName ? [name, `- ${subName} -`] : [name], colour };
  const canvas = paintLabel(text);
  const material = new THREE.SpriteMaterial({
    map: labelTexture(canvas),
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, plateHeight, 0);
  fitLabel(sprite, canvas);
  sprite.renderOrder = 21;
  sprite.name = 'unit-name';
  sprite.userData.labelText = text;
  return sprite;
}

/** Redraw a label in the current typeface, disposing the old texture. */
export function redrawNameLabel(sprite: THREE.Sprite): void {
  const text = sprite.userData.labelText as LabelText | undefined;
  if (!text) return;
  const canvas = paintLabel(text);
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.map = labelTexture(canvas);
  material.needsUpdate = true;
  fitLabel(sprite, canvas);
}

/** Draw a label again in another colour. A label already that colour is left as it is. */
export function recolourNameLabel(sprite: THREE.Sprite, colour: string): void {
  const text = sprite.userData.labelText as LabelText | undefined;
  if (!text || text.colour === colour) return;
  sprite.userData.labelText = { ...text, colour };
  redrawNameLabel(sprite);
}

/** Own choice: clearance above a body's measured top, eye-picked. */
const NAME_PLATE_CLEARANCE = 0.5;

/**
 * Label height: the model's `Dummy_Name` Y, else its measured height, else 1.8.
 * Never below the measured top: wolves carry the anchor at the back.
 */
export function namePlateHeight(object: THREE.Object3D, bodyHeight: number): number {
  const clear = bodyHeight > 0 ? bodyHeight + NAME_PLATE_CLEARANCE : 1.8;
  const node = findAttachmentNode(object, 'Dummy_Name');
  if (node) {
    const world = new THREE.Vector3();
    node.getWorldPosition(world);
    const y = world.y - object.position.y;
    if (Number.isFinite(y) && y > 0) return Math.max(y, clear);
  }
  return clear;
}

/**
 * Show or hide the name over a body: a stealthed body wears none, on the
 * screens that still draw it faded — its own player's and their team's.
 */
export function showNamePlate(
  label: THREE.Sprite,
  body: { networkStealthed?: boolean },
  drawn = true,
): void {
  label.visible = drawn && !body.networkStealthed;
}

/** Keep a label outside the frozen model subtree, while retaining its local anchor. */
export function updateNameLabelMatrix(body: THREE.Object3D, label: THREE.Sprite): void {
  label.updateMatrix();
  label.matrixWorld.multiplyMatrices(body.matrixWorld, label.matrix);
}
