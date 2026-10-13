import { describe, expect, it } from 'vitest';

import { readBeff, type BeffNode } from '../src/assets/formats/beff';
import {
  StreamBuilder,
  emitterSpec,
  writeBeff,
  writeTrack,
  type EmitterSpec,
} from './helpers/beffWriter';

const one = <T>(v: T) => ({ keys: [[0, v]] as Array<[number, T]> });

function onlyEmitter(bytes: Uint8Array) {
  const node = readBeff(bytes).nodes[0];
  if (node.kind !== 'emitter') throw new Error('expected an emitter node');
  return node.emitter;
}

function meshNode(node: BeffNode) {
  if (node.kind !== 'mesh') throw new Error('expected a mesh node');
  return node;
}

describe('the header', () => {
  it('reads the version and the start delay range', () => {
    const f = readBeff(writeBeff({ version: 9, delay: [2, 10], nodes: [] }));
    expect(f).toEqual({ version: 9, startDelayLow: 2, startDelayHigh: 10, nodes: [] });
  });

  it('rejects a wrong signature', () => {
    const bytes = writeBeff({ version: 9, nodes: [] });
    bytes[0] = 0;
    expect(() => readBeff(bytes)).toThrow(/signature/);
  });

  it('rejects versions other than 8 and 9', () => {
    expect(() => readBeff(writeBeff({ version: 7, nodes: [] }))).toThrow(/version 7/);
  });
});

describe('the end-of-file check', () => {
  const bytes = writeBeff({ version: 9, nodes: [{ kind: 'emitter', emitter: emitterSpec() }] });

  it('accepts a file that ends on its last field', () => {
    expect(() => readBeff(bytes)).not.toThrow();
  });

  it('rejects a file that stops short', () => {
    expect(() => readBeff(bytes.subarray(0, bytes.length - 1))).toThrow(/ends early/);
  });

  it('rejects a file with bytes left over', () => {
    const longer = new Uint8Array(bytes.length + 2);
    longer.set(bytes);
    expect(() => readBeff(longer, 'x.beff')).toThrow(/x\.beff: 2 bytes left over/);
  });

  it('reads from a view into a larger buffer', () => {
    const padded = new Uint8Array(bytes.length + 8);
    padded.set(bytes, 4);
    expect(readBeff(padded.subarray(4, 4 + bytes.length)).nodes).toHaveLength(1);
  });
});

describe('nodes', () => {
  it('rejects an unknown node kind', () => {
    const w = new StreamBuilder().u32(0x66666562).i32(9).i32(0).i32(0).i32(1).i32(2);
    expect(() => readBeff(w.finish())).toThrow(/node kind 2/);
  });

  it('reads a version-8 mesh node with no carrier', () => {
    const f = readBeff(
      writeBeff({
        version: 8,
        nodes: [
          {
            kind: 'mesh',
            path: 'model/fx/ring.bdae',
            repeats: 0,
            opacity: {
              keys: [
                [0, 0],
                [10, 255],
              ],
            },
          },
        ],
      }),
    );
    const mesh = meshNode(f.nodes[0]);
    expect(mesh.meshPath).toBe('model/fx/ring.bdae');
    expect(mesh.meshRepeats).toBe(false);
    expect(mesh.meshOpacity.keys).toEqual([
      { frame: 0, value: 0 },
      { frame: 10, value: 255 },
    ]);
    expect(mesh.carrier).toBeNull();
  });

  it('reads the carrier that follows a version-9 mesh node', () => {
    const carrier = emitterSpec({
      settings: [5, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0],
      scale: [one(0.5), one(2), one(1.5)],
      texture: '',
    });
    const f = readBeff(
      writeBeff({
        version: 9,
        nodes: [
          { kind: 'mesh', path: 'model/fx/a.bdae', repeats: 1, opacity: one(255), carrier },
          { kind: 'emitter', emitter: emitterSpec() },
        ],
      }),
    );
    const mesh = meshNode(f.nodes[0]);
    expect(mesh.meshRepeats).toBe(true);
    expect(mesh.carrier?.settings.spawnShape).toBe(5);
    expect(mesh.carrier?.tracks.emitterScaleY.keys[0].value).toBe(2);
    expect(mesh.carrier?.look.textureName).toBe('');
    expect(f.nodes[1].kind).toBe('emitter');
  });
});

describe('an emitter record', () => {
  it('reads the settings block field by field', () => {
    const e = onlyEmitter(
      writeBeff({
        version: 9,
        nodes: [
          {
            kind: 'emitter',
            emitter: emitterSpec({
              settings: [2, 1217, 1, 3, -100, 550, 133, 1_000_000, 50, 1, 0, -40, 25],
            }),
          },
        ],
      }),
    );
    expect(e.settings).toEqual({
      spawnShape: 2,
      soundId: 1217,
      faceCamera: true,
      inheritMask: 3,
      burstSizeJitterPct: -100,
      activeFrames: 550,
      firstBurstFrame: 133,
      burstEveryFrames: 1_000_000,
      burstSpacingJitterPct: 50,
      killParticlesWithEmitter: true,
      spareWord: 0,
      radialSpeedJitterPct: -40,
      aimSpeedJitterPct: 25,
    });
  });

  it('reads every emitter track in order', () => {
    const placement = Array.from({ length: 10 }, (_, i) => one(i + 1));
    const launch = [one(11), one(12), one(13), one(14)];
    const e = onlyEmitter(
      writeBeff({
        version: 9,
        nodes: [
          {
            kind: 'emitter',
            emitter: emitterSpec({
              placement,
              scale: [one(0.25), one(0.5), one(0.75)],
              launch,
              aimDirection: one([0, 0, -1]),
            }),
          },
        ],
      }),
    );
    const first = (k: keyof typeof e.tracks) => e.tracks[k].keys[0].value;
    expect(
      [
        'shapeSizeX',
        'shapeSizeY',
        'shapeSizeZ',
        'hollowPct',
        'emitterAngleX',
        'emitterAngleY',
        'emitterAngleZ',
        'emitterOffsetX',
        'emitterOffsetY',
        'emitterOffsetZ',
      ].map(k => first(k as keyof typeof e.tracks)),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([first('emitterScaleX'), first('emitterScaleY'), first('emitterScaleZ')]).toEqual([
      0.25, 0.5, 0.75,
    ]);
    expect([
      first('burstSize'),
      first('radialSpeed'),
      first('aimSpeed'),
      first('spreadDegrees'),
    ]).toEqual([11, 12, 13, 14]);
    expect(first('aimDirection')).toEqual([0, 0, -1]);
  });

  it('gives a version-8 emitter a scale of one, with no scale tracks stored', () => {
    const spec = emitterSpec({ scale: [one(9), one(9), one(9)] });
    const e = onlyEmitter(writeBeff({ version: 8, nodes: [{ kind: 'emitter', emitter: spec }] }));
    expect(e.tracks.emitterScaleX.keys).toEqual([{ frame: 0, value: 1 }]);
    expect(e.tracks.emitterScaleZ.keys).toEqual([{ frame: 0, value: 1 }]);
    // The writer left them out, so the rest of the record lines up only if the
    // reader did too.
    expect(e.tracks.aimSpeed.keys[0].value).toBe(2);
  });

  it('reads the particle look block and its tracks', () => {
    const look = [
      3, 1, 60, -20, 50, 1, 0.5, 10, -1.25, 20, 3, 30, 40, 50, 60, 70, 0, 1, 2, 3, 1, 0,
    ];
    const lookTracks = Array.from({ length: 11 }, (_, i) => one(i < 4 ? 10 * (i + 1) : i + 0.5));
    const e = onlyEmitter(
      writeBeff({
        version: 9,
        nodes: [
          { kind: 'emitter', emitter: emitterSpec({ look, lookTracks, texture: 'spark_a.tga' }) },
        ],
      }),
    );
    const {
      red,
      green,
      blue,
      opacity,
      width,
      height,
      spinX,
      spinY,
      spinZ,
      growX,
      growY,
      ...fixed
    } = e.look;
    expect(fixed).toEqual({
      quadKind: 3,
      inheritMask: 1,
      lifeFrames: 60,
      lifeJitterPct: -20,
      sizeJitterPct: 50,
      lockAspect: true,
      startTilt: [0.5, -1.25, 3],
      startTiltJitterPct: [10, 20, 30],
      spinJitterPct: [40, 50, 60],
      growJitterPct: 70,
      blendMode: 0,
      anchorColumn: 1,
      anchorRow: 2,
      uvQuarterTurns: 3,
      mirrorU: true,
      mirrorV: false,
      textureName: 'spark_a.tga',
    });
    expect([red, green, blue, opacity].map(t => t.keys[0].value)).toEqual([10, 20, 30, 40]);
    expect([width, height, spinX, spinY, spinZ, growX, growY].map(t => t.keys[0].value)).toEqual([
      4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5,
    ]);
  });

  it('reads children after the parent affectors', () => {
    const child = emitterSpec({ attachPoint: 'hand_r', texture: 'child.tga' });
    const parent = emitterSpec({
      affectors: [{ kind: 1, factor: one(0.9) }],
      children: [child, emitterSpec({ texture: 'second.tga' })],
    });
    const e = onlyEmitter(writeBeff({ version: 9, nodes: [{ kind: 'emitter', emitter: parent }] }));
    expect(e.affectors).toHaveLength(1);
    expect(e.children.map(c => c.look.textureName)).toEqual(['child.tga', 'second.tga']);
    expect(e.children[0].attachPoint).toBe('hand_r');
  });
});

describe('affectors', () => {
  function affectorsOf(spec: EmitterSpec['affectors']) {
    return onlyEmitter(
      writeBeff({
        version: 8,
        nodes: [{ kind: 'emitter', emitter: emitterSpec({ affectors: spec }) }],
      }),
    ).affectors;
  }

  it('reads a pull as a strength and an unnormalised direction', () => {
    expect(affectorsOf([{ kind: 0, strength: one(2), direction: one([0, -0.1, 0]) }])).toEqual([
      {
        kind: 'pull',
        strength: { loop: false, keys: [{ frame: 0, value: 2 }] },
        direction: { loop: false, keys: [{ frame: 0, value: [0, expect.closeTo(-0.1, 6), 0] }] },
      },
    ]);
  });

  it('reads a speed scale', () => {
    const [a] = affectorsOf([
      {
        kind: 1,
        factor: {
          keys: [
            [0, 1],
            [20, 0.5],
          ],
        },
      },
    ]);
    expect(a).toEqual({
      kind: 'speedScale',
      factor: {
        loop: false,
        keys: [
          { frame: 0, value: 1 },
          { frame: 20, value: 0.5 },
        ],
      },
    });
  });

  it('reads a wander, whose period is a float', () => {
    const [a] = affectorsOf([{ kind: 2, amplitude: [3, -30, 0], changeEveryFrames: 10 }]);
    expect(a).toEqual({ kind: 'wander', amplitude: [3, -30, 0], changeEveryFrames: 10 });
  });

  it('reads a swirl, and treats any swirl mode other than 1 as 0', () => {
    const got = affectorsOf([
      { kind: 3, strength: one(1.5), axis: one([0, 1, 0]), swirlMode: 1 },
      { kind: 3, strength: one(-1), axis: one([0, 1, 0]), swirlMode: 0x20202020 },
    ]);
    expect(got.map(a => (a.kind === 'swirl' ? a.swirlMode : null))).toEqual([1, 0]);
    expect(got[0].kind === 'swirl' && got[0].axis.keys[0].value).toEqual([0, 1, 0]);
  });

  it('rejects an unknown affector kind', () => {
    const unknown = { kind: 4, strength: one(1), axis: one([0, 1, 0]), swirlMode: 0 } as never;
    expect(() => affectorsOf([unknown])).toThrow(/affector kind 4/);
  });
});

describe('track key encoding', () => {
  function trackBytes(
    kind: 'int' | 'float' | 'vec3',
    keys: Array<[number, number | number[]]>,
    repeats = 0,
  ) {
    const w = new StreamBuilder();
    writeTrack(w, kind, { keys, repeats });
    return w.finish();
  }

  it('stores int and float keys in eight bytes and vec3 keys in sixteen', () => {
    expect(
      trackBytes('int', [
        [0, 1],
        [5, 2],
      ]).length,
    ).toBe(8 + 2 * 8);
    expect(trackBytes('vec3', [[0, [1, 2, 3]]]).length).toBe(8 + 16);
  });

  it('loops only on repeats = 1, and keeps integer and float values apart', () => {
    const e = onlyEmitter(
      writeBeff({
        version: 9,
        nodes: [
          {
            kind: 'emitter',
            emitter: emitterSpec({
              placement: [
                {
                  keys: [
                    [0, 1.5],
                    [10, 3.25],
                  ],
                  repeats: 1,
                },
                ...Array.from({ length: 2 }, () => one(0)),
                {
                  keys: [
                    [0, 20],
                    [15, 80],
                  ],
                },
                ...Array.from({ length: 6 }, () => one(0)),
              ],
              aimDirection: { keys: [[0, [0, 1, 0]]], repeats: 0x20202020 },
            }),
          },
        ],
      }),
    );
    expect(e.tracks.shapeSizeX).toEqual({
      loop: true,
      keys: [
        { frame: 0, value: 1.5 },
        { frame: 10, value: 3.25 },
      ],
    });
    expect(e.tracks.hollowPct.keys.map(k => k.value)).toEqual([20, 80]);
    expect(e.tracks.aimDirection.loop).toBe(false);
  });

  it('rejects a key count that cannot be right', () => {
    const w = new StreamBuilder()
      .u32(0x66666562)
      .i32(8)
      .i32(0)
      .i32(0)
      .i32(1)
      .i32(1)
      .text('m.bdae')
      .i32(1);
    w.i32(-3).i32(0);
    expect(() => readBeff(w.finish())).toThrow(/key count/);
  });
});

describe('strings', () => {
  function meshPathOf(raw: (w: StreamBuilder) => void): string {
    const w = new StreamBuilder().u32(0x66666562).i32(8).i32(0).i32(0).i32(1).i32(1);
    raw(w);
    w.i32(1);
    writeTrack(w, 'int', one(255));
    return meshNode(readBeff(w.finish()).nodes[0]).meshPath;
  }

  it('reads an empty string as length zero and no bytes', () => {
    expect(meshPathOf(w => w.i32(0))).toBe('');
  });

  it('strips the zero padding', () => {
    expect(meshPathOf(w => w.i32(8).raw(0x61, 0x2e, 0x62, 0x64, 0x61, 0x65, 0, 0))).toBe('a.bdae');
  });

  it('pads a text whose length is a multiple of four with four zeros', () => {
    expect(meshPathOf(w => w.text('abcd'))).toBe('abcd');
    expect(meshPathOf(w => w.i32(8).raw(0x61, 0x62, 0x63, 0x64, 0, 0, 0, 0))).toBe('abcd');
  });

  it('decodes a high byte as Latin-1 rather than failing', () => {
    expect(meshPathOf(w => w.i32(4).raw(0xe9, 0, 0, 0))).toBe('é');
  });
});
