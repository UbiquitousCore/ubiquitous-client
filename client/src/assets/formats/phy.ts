/** `.phy` collision (`client/docs/formats/phy.md`); returned in client axes, where a file (x, y, z) is (x, z, -y). */

import { LeView } from './leView';

/**
 * Block kinds by the number each block starts with. These four are the only
 * ones any `.phy` in either build uses; any other number, 1 included, is
 * unknown and ends the list, since its length cannot be known.
 */
export const WALL_BLOCK = 2;
export const BOX_BLOCK = 3;
export const CYLINDER_BLOCK = 4;
export const TRIANGLES_BLOCK = 7;

export type PhyShape = 'wall' | 'box' | 'cylinder' | 'mesh';

export type Vec3 = [number, number, number];
export type PhyFace = [number, number, number, number];

export interface PhyBlock {
  type: 'primitive' | 'mesh';
  flags: number;
  shape?: PhyShape;
  /** Turn about the vertical axis, radians. Primitives only. */
  rotY?: number;
  /** A primitive's centre, or a mesh's origin. */
  position: Vec3;
  /** Half the size along each client axis; never negative. */
  halfSize: Vec3;
  /** Mesh vertices, relative to `position`. */
  vertices?: Vec3[];
  /** Three vertex indices and the face's tag word. */
  faces?: PhyFace[];
}

const PRIMITIVE_SHAPES: Record<number, PhyShape> = {
  [WALL_BLOCK]: 'wall',
  [BOX_BLOCK]: 'box',
  [CYLINDER_BLOCK]: 'cylinder',
};

/** Far above the largest count shipped (187), far below a text file's. */
const MAX_BLOCKS = 1 << 20;

const BODY = 32;
const VERTEX = 12;
const FACE = 8;

function point(view: LeView, at: number): Vec3 {
  const [x, y, z] = view.floats(at, 3);
  return [x, z, -y];
}

function extent(view: LeView, at: number): Vec3 {
  const [x, y, z] = view.floats(at, 3);
  return [Math.abs(x), Math.abs(z), Math.abs(y)];
}

/** One block at `at`, and where the next starts; null when it cannot be read. */
function readBlock(view: LeView, at: number): { block: PhyBlock; next: number } | null {
  if (!view.fits(at, 4 + BODY)) return null;
  const kind = view.i32(at);
  const body = at + 4;
  const flags = view.u32(body);

  const shape = PRIMITIVE_SHAPES[kind];
  if (shape) {
    return {
      block: {
        type: 'primitive',
        flags,
        shape,
        rotY: view.f32(body + 4),
        position: point(view, body + 8),
        halfSize: extent(view, body + 20),
      },
      next: body + BODY,
    };
  }

  if (kind !== TRIANGLES_BLOCK) return null;
  const vertexCount = view.i16(body + 28);
  const faceCount = view.i16(body + 30);
  if (vertexCount < 0 || faceCount < 0) return null;
  const vertexAt = body + BODY;
  const faceAt = vertexAt + vertexCount * VERTEX;
  const next = faceAt + faceCount * FACE;
  if (!view.fits(vertexAt, next - vertexAt)) return null;

  const vertices: Vec3[] = [];
  for (let i = 0; i < vertexCount; i++) vertices.push(point(view, vertexAt + i * VERTEX));
  const faces: PhyFace[] = [];
  for (let i = 0; i < faceCount; i++) {
    const f = faceAt + i * FACE;
    faces.push([view.u16(f), view.u16(f + 2), view.u16(f + 4), view.u16(f + 6)]);
  }
  return {
    block: {
      type: 'mesh',
      flags,
      position: point(view, body + 4),
      halfSize: extent(view, body + 16),
      vertices,
      faces,
    },
    next,
  };
}

/**
 * Every block of a `.phy`, in file order. Never throws: a file that is not in
 * this format gives `[]`, and an unknown or cut-off block ends the list.
 */
export function parsePhy(bytes: Uint8Array): PhyBlock[] {
  const view = new LeView(bytes);
  if (view.size < 4) return [];
  const declared = view.i32(0);
  // The count is only an upper bound, so it cannot be checked against the
  // file's length; a count in the millions or more is a text note, not collision.
  if (declared <= 0 || declared > MAX_BLOCKS) return [];

  const blocks: PhyBlock[] = [];
  let at = 4;
  while (blocks.length < declared) {
    const read = readBlock(view, at);
    if (!read) break;
    blocks.push(read.block);
    at = read.next;
  }
  return blocks;
}
