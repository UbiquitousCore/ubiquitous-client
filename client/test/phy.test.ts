/**
 * The `.phy` collision reader against hand-built files.
 *
 * Every block is a type word followed by 32 bytes: flags, then either a
 * rotation and two vectors (primitives) or two vectors and two counts
 * (meshes, whose vertices and quads follow). Coordinates are stored with
 * the vertical axis third and are turned to (x, z, -y) on the way out.
 */

import { describe, expect, it } from 'vitest';

import {
  BOX_BLOCK,
  CYLINDER_BLOCK,
  TRIANGLES_BLOCK,
  WALL_BLOCK,
  parsePhy,
} from '../src/assets/formats/phy';
import { CollisionWriter } from './helpers/formatWriters';

class Writer {
  private readonly bytes: number[] = [];
  i32(v: number): this {
    const b = new DataView(new ArrayBuffer(4));
    b.setInt32(0, v, true);
    this.bytes.push(...new Uint8Array(b.buffer));
    return this;
  }
  f32(...vs: number[]): this {
    for (const v of vs) {
      const b = new DataView(new ArrayBuffer(4));
      b.setFloat32(0, v, true);
      this.bytes.push(...new Uint8Array(b.buffer));
    }
    return this;
  }
  u16(...vs: number[]): this {
    for (const v of vs) this.bytes.push(v & 0xff, (v >> 8) & 0xff);
    return this;
  }
  done(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

describe('parsePhy', () => {
  it('reads a primitive: flags, a turn, a centre and half extents', () => {
    const data = new Writer()
      .i32(1)
      .i32(BOX_BLOCK)
      .i32(0x2)
      .f32(0.5)
      .f32(1, 2, 3)
      .f32(-4, 5, 6)
      .done();
    const [box] = parsePhy(data);
    expect(box).toMatchObject({
      type: 'primitive',
      shape: 'box',
      flags: 0x2,
      position: [1, 3, -2],
      // Extents are sizes, so the sign the axis turn gives them is dropped.
      halfSize: [4, 6, 5],
    });
    expect(box.rotY).toBeCloseTo(0.5);
  });

  it('reads a mesh: vertices turned like positions, then four indices per face', () => {
    const data = new Writer()
      .i32(1)
      .i32(TRIANGLES_BLOCK)
      .i32(0x400)
      .f32(10, 20, 30)
      .f32(1, 1, 1)
      .u16(2, 1) // two vertices, one face
      .f32(1, 2, 3, 4, 5, 6)
      .u16(0, 1, 1, 7)
      .done();
    const [mesh] = parsePhy(data);
    expect(mesh).toMatchObject({
      type: 'mesh',
      flags: 0x400,
      position: [10, 30, -20],
      vertices: [
        [1, 3, -2],
        [4, 6, -5],
      ],
      faces: [[0, 1, 1, 7]],
    });
  });

  it('walks blocks back to back and stops at a type it does not know', () => {
    const box = (x: number) => new Writer().i32(BOX_BLOCK).i32(0).f32(0).f32(x, 0, 0).f32(1, 1, 1);
    const one = box(1).done();
    const two = box(2).done();
    const unknown = new Writer().i32(99).i32(0).done();
    const data = new Uint8Array([
      ...new Writer().i32(4).done(),
      ...one,
      ...two,
      ...unknown,
      ...one,
    ]);
    expect(parsePhy(data).map(g => g.position[0])).toEqual([1, 2]);
  });

  it('treats block kind 1, which no file ships, as unknown', () => {
    const data = new CollisionWriter(2)
      .primitive(BOX_BLOCK, 0, 0, [1, 0, 0], [1, 1, 1])
      .primitive(1, 0, 0, [2, 0, 0], [1, 1, 1])
      .done();
    expect(parsePhy(data).map(g => g.shape)).toEqual(['box']);
  });

  it('returns nothing for a mesh whose counts run past the file', () => {
    const data = new Writer()
      .i32(1)
      .i32(TRIANGLES_BLOCK)
      .i32(0)
      .f32(0, 0, 0, 0, 0, 0)
      .u16(100, 0)
      .done();
    expect(parsePhy(data)).toEqual([]);
  });

  it('treats the block count as an upper bound, stopping where the file ends', () => {
    const data = new CollisionWriter(45).primitive(BOX_BLOCK, 0, 0, [1, 2, 3], [1, 1, 1]).done();
    expect(parsePhy(data)).toHaveLength(1);
  });

  it('reads no more blocks than the count declares', () => {
    const data = new CollisionWriter(1)
      .primitive(BOX_BLOCK, 0, 0, [1, 0, 0], [1, 1, 1])
      .primitive(BOX_BLOCK, 0, 0, [2, 0, 0], [1, 1, 1])
      .done();
    expect(parsePhy(data).map(g => g.position[0])).toEqual([1]);
  });

  it('names walls and cylinders by their block type', () => {
    const data = new CollisionWriter(2)
      .primitive(WALL_BLOCK, 0, 1, [0, 0, 0], [2, 0, 3])
      .primitive(CYLINDER_BLOCK, 0x400, 0, [0, 0, 0], [1, 1, 4])
      .done();
    expect(parsePhy(data).map(g => [g.shape, g.halfSize])).toEqual([
      ['wall', [2, 3, 0]],
      ['cylinder', [1, 4, 1]],
    ]);
  });

  it('keeps an empty mesh block and reads on past it', () => {
    const data = new CollisionWriter(2)
      .mesh(0, [0, 0, 0], [-1e7, -1e7, -1e7], [], [])
      .primitive(BOX_BLOCK, 0, 0, [5, 0, 0], [1, 1, 1])
      .done();
    const [empty, box] = parsePhy(data);
    expect(empty).toMatchObject({ type: 'mesh', vertices: [], faces: [] });
    expect(box.position[0]).toBe(5);
  });

  it('stops at a mesh with a negative count', () => {
    const data = new CollisionWriter(2)
      .primitive(BOX_BLOCK, 0, 0, [5, 0, 0], [1, 1, 1])
      .raw(w => w.i32(TRIANGLES_BLOCK).u32(0).f32(0, 0, 0, 1, 1, 1).i16(-1, 0))
      .done();
    expect(parsePhy(data)).toHaveLength(1);
  });

  it('reads a text note, a short file and an empty file as no collision', () => {
    const note = new TextEncoder().encode('collision notes for this model\n');
    expect(parsePhy(note)).toEqual([]);
    expect(parsePhy(new Uint8Array(3))).toEqual([]);
    expect(parsePhy(new Uint8Array(0))).toEqual([]);
  });
});
