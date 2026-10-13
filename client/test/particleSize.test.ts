/**
 * How an emitter's particles are born, sized, turned and coloured, checked
 * through what `EffectInstance` actually writes into its instance buffers.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { EffectInstance, particleOptions, particlesFollow } from '../src/renderer/EffectFactory';
import { placementSeed } from '../src/renderer/emitterSpawn';
import type { EffectCurve, EffectData, EffectEmitter, EffectModel } from '../src/assets/types';

const flat = <T>(value: T): EffectCurve<T> => ({ loop: false, keys: [{ frame: 0, value }] });

function emitter(over: Partial<EffectEmitter> = {}): EffectEmitter {
  const base: EffectEmitter = {
    attachPoint: '',
    shape: 'point',
    faceCamera: false,
    movesWithEmitter: true,
    turnsWithEmitter: false,
    activeFrames: -1,
    firstBurstFrame: 0,
    burstSpacing: 1,
    burstSpacingJitter: 0,
    burstSizeJitter: 0,
    radialSpeedJitter: 0,
    aimSpeedJitter: 0,
    killParticlesWithEmitter: false,
    spawnSize: [flat(0), flat(0), flat(0)],
    hollowPct: flat(0),
    emitterAngle: [flat(0), flat(0), flat(0)],
    emitterOffset: [flat(0), flat(0), flat(0)],
    emitterScale: [flat(1), flat(1), flat(1)],
    burstSize: flat(1),
    radialSpeed: flat(0),
    aimSpeed: flat(1),
    spreadAngle: flat(0),
    aimAxis: flat([0, 1, 0]),
    affectors: [],
    children: [],
    particle: {
      shape: 'sprite',
      movesWithEmitter: true,
      turnsWithEmitter: false,
      lifeFrames: 100,
      lifelong: false,
      lifeJitter: 0,
      sizeJitter: 0,
      lockAspect: true,
      startTilt: [0, 0, 0],
      startTiltJitter: [0, 0, 0],
      spinJitter: [0, 0, 0],
      growJitter: 0,
      blend: 'additive',
      mirrorU: false,
      mirrorV: false,
      uvQuarterTurns: 0,
      texture: 't.tga',
      tintR: flat(255),
      tintG: flat(255),
      tintB: flat(255),
      opacityCurve: flat(255),
      sizeX: flat(2),
      sizeY: flat(2),
      spinX: flat(0),
      spinY: flat(0),
      spinZ: flat(0),
      growX: flat(1),
      growY: flat(1),
      anchorColumn: 'center',
      anchorRow: 'center',
    },
  };
  return { ...base, ...over };
}

function effect(def: EffectEmitter, extra: Partial<EffectData> = {}): EffectData {
  return { path: 'x.beff', delayMin: 0, delayMax: 0, models: [], emitters: [def], ...extra };
}

const still = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld(true);
  return camera;
};

function play(def: EffectEmitter, frames: number, camera: THREE.Camera = still()): EffectInstance {
  const instance = new EffectInstance(effect(def), () => new THREE.MeshBasicMaterial());
  for (let f = 0; f < frames; f++) instance.update(1 / 30, camera);
  return instance;
}

const meshOf = (instance: EffectInstance): THREE.InstancedMesh =>
  instance.object.children[0] as THREE.InstancedMesh;

/** Position, orientation and scale of each drawn instance, in the mesh's space. */
function drawn(instance: EffectInstance) {
  const mesh = meshOf(instance);
  const m = new THREE.Matrix4();
  return Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, m);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    m.decompose(position, quaternion, scale);
    return {
      position,
      quaternion,
      scale,
      right: new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion),
      upAxis: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
      normal: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
    };
  });
}

describe('particle size', () => {
  it('draws a quad as wide and tall as its width and height tracks', () => {
    const [p] = drawn(play(emitter(), 1));
    expect(p!.scale.x).toBeCloseTo(2, 5);
    expect(p!.scale.y).toBeCloseTo(2, 5);
  });

  it('multiplies by the grow tracks', () => {
    const e = emitter();
    e.particle.growX = flat(3);
    expect(drawn(play(e, 1))[0]!.scale.x).toBeCloseTo(6, 5);
  });

  it('follows the width track over the particle life', () => {
    const e = emitter();
    e.burstSpacing = 10_000;
    e.particle.sizeX = {
      loop: false,
      keys: [
        { frame: 0, value: 0 },
        { frame: 10, value: 4 },
      ],
    };
    // The particle is one frame old after the first update, and five frames
    // old after five, half way up its ramp.
    expect(drawn(play(e, 5))[0]!.scale.x).toBeCloseTo(2, 4);
  });

  it('skips a particle while it is zero-sized', () => {
    const e = emitter();
    e.particle.sizeX = flat(0);
    expect(meshOf(play(e, 3)).count).toBe(0);
  });

  it('spreads a particle’s size both ways under size jitter', () => {
    const e = emitter();
    e.burstSpacing = 0;
    e.particle.sizeJitter = 50;
    const sizes = drawn(play(e, 30)).map(p => p.scale.x);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(3 + 1e-6);
    expect(Math.min(...sizes)).toBeLessThan(2);
    expect(Math.max(...sizes)).toBeGreaterThan(2);
  });
});

describe('the transform a placed effect carries', () => {
  function underParent(rotation: THREE.Quaternion, scale: number) {
    const instance = play(emitter(), 1);
    const parent = new THREE.Group();
    parent.quaternion.copy(rotation);
    parent.scale.setScalar(scale);
    parent.add(instance.object);
    parent.updateMatrixWorld(true);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld(true);
    instance.update(1 / 30, camera);

    const mesh = meshOf(instance);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    m.premultiply(mesh.matrixWorld);
    const quat = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), quat, sc);
    return { quat, scale: sc, camera };
  }

  it('scales the sprite with the placement', () => {
    const none = underParent(new THREE.Quaternion(), 1);
    const scaled = underParent(new THREE.Quaternion(), 2.63);
    expect(scaled.scale.x / none.scale.x).toBeCloseTo(2.63, 3);
  });

  it('keeps a sprite facing the camera under a turned placement', () => {
    const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const { quat, camera } = underParent(turned, 1);
    expect(quat.angleTo(camera.quaternion)).toBeLessThan(1e-4);
  });

  it('scales the emitter by its scale tracks', () => {
    const e = emitter();
    e.emitterScale = [flat(0.5), flat(0.5), flat(0.5)];
    const mesh = meshOf(play(e, 1));
    mesh.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    m.premultiply(mesh.matrixWorld);
    const sc = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
    expect(sc.x).toBeCloseTo(1, 5);
  });
});

describe('particles and a moving emitter', () => {
  const sliding = (follow: boolean): EffectEmitter => {
    const e = emitter({ movesWithEmitter: follow, burstSpacing: 10_000, aimSpeed: flat(0) });
    e.particle.movesWithEmitter = follow;
    e.emitterOffset = [
      {
        loop: false,
        keys: [
          { frame: 0, value: 0 },
          { frame: 30, value: 30 },
        ],
      },
      flat(0),
      flat(0),
    ];
    return e;
  };
  const worldOfFirst = (instance: EffectInstance) =>
    drawn(instance)[0]!.position.applyMatrix4(meshOf(instance).matrixWorld);

  it('leaves particles where they were born when they do not follow it', () => {
    const instance = play(sliding(false), 20);
    // Born near x = 1 on the first frame; the emitter is now near x = 20.
    expect(worldOfFirst(instance).x).toBeLessThan(2);
    expect(meshOf(instance).position.x).toBeGreaterThan(15);
  });

  it('carries particles along when they follow it', () => {
    expect(worldOfFirst(play(sliding(true), 20)).x).toBeGreaterThan(15);
  });
});

describe("a projectile's trail", () => {
  /** An emitter that sets the emitter's bit and leaves the particle's clear. */
  const trailing = (over: Partial<EffectEmitter> = {}): EffectEmitter => {
    const e = emitter({ movesWithEmitter: true, aimSpeed: flat(0), ...over });
    e.particle.movesWithEmitter = false;
    e.particle.lifeFrames = 30;
    return e;
  };
  const core = (): EffectEmitter => emitter({ aimSpeed: flat(0) });

  /** Fly an effect along +X at 30 units a second for `frames` frames. */
  function fly(data: EffectData, frames: number, inFlight: boolean, roots: THREE.Object3D[] = []) {
    const instance = new EffectInstance(
      data,
      () => new THREE.MeshBasicMaterial(),
      undefined,
      undefined,
      false,
      roots,
      inFlight,
    );
    const camera = still();
    for (let f = 0; f < frames; f++) {
      instance.object.position.x = f;
      instance.object.updateMatrixWorld(true);
      instance.update(1 / 30, camera);
    }
    return instance;
  }
  const worldXs = (instance: EffectInstance, run = 0): number[] => {
    const mesh = instance.object.children[run] as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    return Array.from({ length: mesh.count }, (_, i) => {
      mesh.getMatrixAt(i, m);
      return new THREE.Vector3().setFromMatrixPosition(m.premultiply(mesh.matrixWorld)).x;
    });
  };

  it("lets the particle's own mask decide in flight, and either mask elsewhere", () => {
    const e = trailing();
    expect(particlesFollow(e, true)).toBe(false);
    expect(particlesFollow(e, false)).toBe(true);
    expect(particlesFollow(core(), true)).toBe(true);
    const loose = trailing({ movesWithEmitter: false });
    expect(particlesFollow(loose, false)).toBe(false);
  });

  it('lays particles along the path an effect in flight has flown', () => {
    const xs = worldXs(fly(effect(trailing()), 20, true));
    // One born each frame, each left where the effect was when it was born.
    expect(Math.min(...xs)).toBeLessThan(2);
    expect(Math.max(...xs)).toBeGreaterThan(17);
  });

  it('carries the same emitter along when the effect is not in flight', () => {
    const xs = worldXs(fly(effect(trailing()), 20, false));
    expect(Math.min(...xs)).toBeGreaterThan(17);
  });

  it('keeps a ribbon trail as a strip laid behind the effect', () => {
    const e = trailing();
    e.particle.shape = 'facingRibbon';
    const instance = fly(effect(e), 20, true);
    const ribbon = instance.object.children.find(
      c => !(c as THREE.InstancedMesh).isInstancedMesh,
    ) as THREE.Mesh;
    expect(ribbon.geometry.drawRange.count / 6).toBeGreaterThan(10);
  });

  it('on landing drops what rode with it, stops emitting, and lets the trail burn out', () => {
    const data: EffectData = { ...effect(core()), emitters: [core(), trailing()] };
    const instance = fly(data, 20, true);
    const trailBefore = worldXs(instance, 1).length;
    instance.land();
    const camera = still();
    instance.update(1 / 30, camera);

    expect(meshOf(instance).count).toBe(0);
    expect(worldXs(instance, 1).length).toBeGreaterThan(0);
    expect(worldXs(instance, 1).length).toBeLessThanOrEqual(trailBefore);
    expect(instance.finished).toBe(false);

    // The trail's particles live 30 frames and nothing replaces them.
    for (let f = 0; f < 31; f++) instance.update(1 / 30, camera);
    expect(worldXs(instance, 1)).toEqual([]);
    expect(instance.finished).toBe(true);
  });

  it("takes the projectile's model out of the picture on landing, and not the emitters hung off it", () => {
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    arrow.add(shaft);
    const e = trailing({ attachPoint: 'tail' });
    const instance = new EffectInstance(
      effect(e),
      () => new THREE.MeshBasicMaterial(),
      () => shaft,
      undefined,
      false,
      [arrow],
      true,
    );
    const run = shaft.children[0]!;
    instance.land();

    const camera = still();
    expect(shaft.layers.test(camera.layers)).toBe(false);
    expect(shaft.visible).toBe(true);
    expect(run.layers.test(camera.layers)).toBe(true);
  });

  it('frees every buffer it made when disposed after landing', () => {
    const e = trailing();
    e.particle.shape = 'ribbon';
    const data: EffectData = { ...effect(core()), emitters: [core(), e] };
    const instance = fly(data, 10, true);
    const meshes = instance.object.children.slice() as THREE.Mesh[];
    let freed = 0;
    for (const m of meshes) m.geometry.addEventListener('dispose', () => freed++);
    instance.land();
    instance.dispose();
    expect(freed).toBe(new Set(meshes.map(m => m.geometry)).size);
    expect(instance.object.children).toEqual([]);
  });
});

describe('particle colour', () => {
  function colourOf(def: EffectEmitter) {
    const mesh = meshOf(play(def, 1));
    expect(mesh.count).toBeGreaterThan(0);
    const c = mesh.instanceColor!;
    const a = mesh.geometry.getAttribute('instanceAlpha');
    return { r: c.getX(0), g: c.getY(0), b: c.getZ(0), a: a.getX(0) };
  }

  it('keeps opacity out of the colour', () => {
    const e = emitter();
    e.particle.blend = 'alpha';
    e.particle.opacityCurve = flat(128);
    const { r, g, b, a } = colourOf(e);
    expect(a).toBeCloseTo(128 / 255, 3);
    expect([r, g, b].map(v => +v.toFixed(3))).toEqual([1, 1, 1]);
  });

  it('tints by the colour tracks', () => {
    const e = emitter();
    e.particle.tintR = flat(51);
    expect(colourOf(e).r).toBeCloseTo(51 / 255, 3);
  });
});

describe('an effect model', () => {
  function drawn(): THREE.Group {
    const root = new THREE.Group();
    root.position.set(1, 2, 3);
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()));
    return root;
  }

  function withModel(over: Partial<EffectModel>, root: THREE.Object3D) {
    const model: EffectModel = {
      model: 'fx.bdae',
      loop: true,
      alpha: flat(255),
      attachPoints: {},
      animation: null,
      ...over,
    };
    const data = effect(emitter(), { emitters: [], models: [model] });
    return new EffectInstance(
      data,
      () => new THREE.MeshBasicMaterial(),
      undefined,
      undefined,
      false,
      [root],
    );
  }

  const meshOf = (root: THREE.Object3D) => root.children[0] as THREE.Mesh;

  it('fades the drawn model by its opacity track', () => {
    const root = drawn();
    withModel({ alpha: flat(51) }, root).update(1 / 30, still());
    expect((meshOf(root).material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(51 / 255, 3);
  });

  it('keeps the shared material of a model that never fades', () => {
    const root = drawn();
    const shared = meshOf(root).material;
    withModel({}, root).update(1 / 30, still());
    expect(meshOf(root).material).toBe(shared);
  });

  it('moves the model along its carrier tracks, from where it was placed', () => {
    const root = drawn();
    const carrier = emitter({ shape: 'carrier' });
    carrier.emitterOffset = [flat(0), flat(4), flat(0)];
    carrier.emitterScale = [flat(2), flat(2), flat(2)];
    withModel({ animation: carrier }, root).update(1 / 30, still());
    expect(root.position.toArray()).toEqual([1, 6, 3]);
    expect(root.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('turns the model by its carrier angle tracks', () => {
    const root = drawn();
    const carrier = emitter({ shape: 'carrier' });
    carrier.emitterAngle = [flat(0), flat(Math.PI / 2), flat(0)];
    withModel({ animation: carrier }, root).update(1 / 30, still());
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
    expect(facing.x).toBeCloseTo(1, 5);
  });

  it('leaves a model with still tracks where it was placed', () => {
    const root = drawn();
    withModel({ animation: emitter({ shape: 'carrier' }) }, root).update(1 / 30, still());
    expect(root.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe('a mesh node carrier', () => {
  function litMesh(name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    return mesh;
  }

  function model(opacity: number, attach: string): EffectModel {
    return {
      model: 'fx.bdae',
      loop: true,
      alpha: flat(opacity),
      attachPoints: {},
      animation: emitter({ attachPoint: attach, shape: 'carrier' }),
    };
  }

  function fadeBy(opacity: number, host = litMesh('rune')) {
    const data = effect(emitter(), { emitters: [], models: [model(opacity, 'rune')] });
    const instance = new EffectInstance(
      data,
      () => new THREE.MeshBasicMaterial(),
      () => null,
      uid => (uid === host.name ? host : null),
    );
    instance.update(1 / 30, still());
    return { host, material: host.material as THREE.MeshBasicMaterial, instance };
  }

  it('fades the node it names by the mesh opacity track', () => {
    const { material } = fadeBy(128);
    expect(material.opacity).toBeCloseTo(128 / 255, 3);
    expect(material.transparent).toBe(true);
  });

  it('draws the node solid again at full opacity', () => {
    const { material } = fadeBy(255);
    expect(material.opacity).toBeCloseTo(1, 5);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
  });

  it('stops drawing the node once it has faded out', () => {
    expect(fadeBy(0).host.visible).toBe(false);
  });

  it('fades a copy of the material, never the shared one', () => {
    const shared = new THREE.MeshBasicMaterial();
    const host = litMesh('rune');
    host.material = shared;
    fadeBy(10, host);
    expect(host.material).not.toBe(shared);
    expect(shared.opacity).toBe(1);
  });

  it('draws no particles of its own', () => {
    const { instance } = fadeBy(255);
    expect(instance.emitterCount).toBe(0);
    expect(instance.finished).toBe(true);
  });
});

describe('particle quad texture coordinates', () => {
  function cornerUvs(over: Partial<EffectEmitter['particle']> = {}) {
    const e = emitter();
    Object.assign(e.particle, over);
    const geometry = meshOf(play(e, 1)).geometry;
    const pos = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const at = (x: number, y: number): [number, number] => {
      for (let i = 0; i < pos.count; i++) {
        if (Math.sign(pos.getX(i)) === x && Math.sign(pos.getY(i)) === y) {
          return [+uv.getX(i).toFixed(6), +uv.getY(i).toFixed(6)];
        }
      }
      throw new Error('no such corner');
    };
    return { topLeft: at(-1, 1), topRight: at(1, 1), bottomLeft: at(-1, -1) };
  }

  it('puts the top of the image on the top edge', () => {
    expect(cornerUvs().topLeft).toEqual([0, 0]);
    expect(cornerUvs().bottomLeft).toEqual([0, 1]);
  });

  it('mirrors left to right and top to bottom', () => {
    expect(cornerUvs({ mirrorU: true }).topLeft).toEqual([1, 0]);
    expect(cornerUvs({ mirrorV: true }).topLeft).toEqual([0, 1]);
  });

  it('turns the image by quarter turns', () => {
    expect(cornerUvs({ uvQuarterTurns: 1 }).topLeft).not.toEqual([0, 0]);
    const twice = cornerUvs({ uvQuarterTurns: 2 });
    expect(twice.topLeft).toEqual([1, 1]);
    expect(twice.topRight).toEqual([0, 1]);
  });
});

describe('burst timing', () => {
  function aliveAfter(def: EffectEmitter, frames: number, stepFrames = 1): number {
    const instance = new EffectInstance(effect(def), () => new THREE.MeshBasicMaterial());
    const camera = still();
    for (let f = 0; f < frames; f += stepFrames) instance.update(stepFrames / 30, camera);
    return meshOf(instance).count;
  }

  it('holds a lifelong emitter at its first burst', () => {
    const e = emitter({ burstSpacing: 2, burstSize: flat(3) });
    e.particle.lifelong = true;
    e.particle.lifeFrames = 10;
    expect(aliveAfter(e, 200)).toBe(3);
  });

  it('bursts once for a long frame rather than catching up', () => {
    const e = emitter({ burstSpacing: 2, burstSize: flat(1) });
    e.particle.lifeFrames = 10_000;
    expect(aliveAfter(e, 30, 30)).toBe(1);
  });

  it('bursts steadily at its spacing', () => {
    const e = emitter({ burstSpacing: 5, burstSize: flat(1) });
    e.particle.lifeFrames = 10_000;
    const n = aliveAfter(e, 60);
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(16);
  });

  it('bursts every frame at a spacing of zero', () => {
    const e = emitter({ burstSpacing: 0, burstSize: flat(1) });
    e.particle.lifeFrames = 10_000;
    expect(aliveAfter(e, 20)).toBe(20);
  });

  it('carries a fractional burst size over to later bursts', () => {
    const e = emitter({ burstSpacing: 0, burstSize: flat(0.5) });
    e.particle.lifeFrames = 10_000;
    expect(aliveAfter(e, 20)).toBe(10);
  });

  it('emits nothing at all for a burst size of zero', () => {
    const e = emitter({ burstSpacing: 0, burstSize: flat(0) });
    e.particle.lifeFrames = 1000;
    expect(aliveAfter(e, 120)).toBe(0);
  });

  it('emits the stored burst size exactly, with no burst size jitter', () => {
    const e = emitter({ burstSpacing: 10_000, burstSize: flat(5), burstSizeJitter: 90 });
    e.particle.lifeFrames = 10_000;
    for (let i = 0; i < 20; i++) expect(aliveAfter(e, 1)).toBe(5);
  });

  it('waits for its first burst frame', () => {
    const e = emitter({ burstSpacing: 0, firstBurstFrame: 10 });
    e.particle.lifeFrames = 10_000;
    expect(aliveAfter(e, 9)).toBe(0);
    expect(aliveAfter(e, 12)).toBeGreaterThan(0);
  });

  it('stops after its active frames, and its particles finish their lives', () => {
    const e = emitter({ burstSpacing: 0, activeFrames: 10 });
    e.particle.lifeFrames = 20;
    const instance = new EffectInstance(effect(e), () => new THREE.MeshBasicMaterial());
    const camera = still();
    for (let f = 0; f < 15; f++) instance.update(1 / 30, camera);
    expect(meshOf(instance).count).toBeGreaterThan(0);
    for (let f = 0; f < 30; f++) instance.update(1 / 30, camera);
    expect(meshOf(instance).count).toBe(0);
    expect(instance.finished).toBe(true);
  });

  it('winds an endless emitter down: no new bursts, and its particles finish their lives', () => {
    const e = emitter({ burstSpacing: 0, activeFrames: -1 });
    e.particle.lifeFrames = 20;
    const instance = new EffectInstance(effect(e), () => new THREE.MeshBasicMaterial());
    const camera = still();
    for (let f = 0; f < 15; f++) instance.update(1 / 30, camera);
    expect(instance.finished).toBe(false);
    instance.windDown();
    instance.update(1 / 30, camera);
    expect(meshOf(instance).count).toBeGreaterThan(0);
    for (let f = 0; f < 30; f++) instance.update(1 / 30, camera);
    expect(meshOf(instance).count).toBe(0);
    expect(instance.finished).toBe(true);
  });

  it('lets a lifelong particle go when its endless emitter winds down', () => {
    const e = emitter({ burstSpacing: 0, activeFrames: -1 });
    e.particle.lifeFrames = 20;
    e.particle.lifelong = true;
    const instance = new EffectInstance(effect(e), () => new THREE.MeshBasicMaterial());
    const camera = still();
    for (let f = 0; f < 60; f++) instance.update(1 / 30, camera);
    expect(instance.finished).toBe(false);
    instance.windDown();
    for (let f = 0; f < 30; f++) instance.update(1 / 30, camera);
    expect(instance.finished).toBe(true);
  });

  it('leaves an emitter that stops on its own to finish its burst through a wind-down', () => {
    const e = emitter({ burstSpacing: 0, activeFrames: 10 });
    e.particle.lifeFrames = 1000;
    const instance = new EffectInstance(effect(e), () => new THREE.MeshBasicMaterial());
    const camera = still();
    instance.update(1 / 30, camera);
    instance.windDown();
    for (let f = 0; f < 5; f++) instance.update(1 / 30, camera);
    const partWay = meshOf(instance).count;
    for (let f = 0; f < 5; f++) instance.update(1 / 30, camera);
    expect(meshOf(instance).count).toBeGreaterThan(partWay);
  });

  it('removes live particles with the emitter when asked to', () => {
    const e = emitter({ burstSpacing: 0, activeFrames: 10, killParticlesWithEmitter: true });
    e.particle.lifeFrames = 1000;
    expect(aliveAfter(e, 12)).toBe(0);
  });

  it('waits out the start delay before anything is born', () => {
    const instance = new EffectInstance(
      effect(emitter({ burstSpacing: 0 }), { delayMin: 500, delayMax: 500 }),
      () => new THREE.MeshBasicMaterial(),
    );
    const camera = still();
    for (let f = 0; f < 12; f++) instance.update(1 / 30, camera);
    expect(meshOf(instance).count).toBe(0);
    for (let f = 0; f < 6; f++) instance.update(1 / 30, camera);
    expect(meshOf(instance).count).toBeGreaterThan(0);
  });
});

describe('a looping track', () => {
  it("starts its next pass on its last key's frame", () => {
    const widthAtAge = (frames: number): number => {
      const e = emitter({ burstSpacing: 100_000 });
      e.particle.sizeX = {
        loop: true,
        keys: [
          { frame: 0, value: 1 },
          { frame: 1, value: 2 },
          { frame: 2, value: 3 },
        ],
      };
      e.particle.lifeFrames = 100_000;
      return drawn(play(e, frames))[0]!.scale.x;
    };
    expect(widthAtAge(1)).toBeCloseTo(2, 3);
    expect(widthAtAge(2)).toBeCloseTo(1, 3);
    expect(widthAtAge(3)).toBeCloseTo(2, 3);
  });
});

describe('a disc emitter', () => {
  /** A four-particle ring, born on the rim and launched up within `spread` degrees. */
  function ring(spread: number): EffectEmitter {
    const e = emitter({ shape: 'disc' });
    e.spawnSize = [flat(1), flat(4), flat(1)];
    e.hollowPct = flat(100);
    e.burstSpacing = 10_000;
    e.burstSize = flat(4);
    e.spreadAngle = flat(spread);
    e.particle.lifeFrames = 10_000;
    return e;
  }

  const positions = (def: EffectEmitter) => drawn(play(def, 20)).map(p => p.position);

  it('sends a ring straight up when the spread is zero', () => {
    const at = positions(ring(0));
    expect(at).toHaveLength(4);
    for (const p of at) expect(Math.hypot(p.x, p.z)).toBeCloseTo(1, 5);
    for (const p of at) expect(p.y).toBeGreaterThan(0);
  });

  it('opens outward within the spread, never inward', () => {
    for (let run = 0; run < 10; run++) {
      for (const p of positions(ring(45))) {
        const outward = Math.hypot(p.x, p.z) - 1;
        expect(outward).toBeGreaterThanOrEqual(-1e-6);
        expect(p.y).toBeGreaterThan(0);
        // At most 45 degrees off vertical.
        expect(outward).toBeLessThanOrEqual(p.y + 1e-6);
      }
    }
  });

  it('puts one particle of a burst in each quarter of the ring', () => {
    for (let run = 0; run < 10; run++) {
      const quarters = positions(ring(40))
        .map(p =>
          Math.floor(((Math.atan2(p.z, p.x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)),
        )
        .sort();
      expect(quarters).toEqual([0, 1, 2, 3]);
    }
  });
});

describe('launch speed jitter', () => {
  it('spreads the speed both ways for a negative jitter too', () => {
    const e = emitter({ burstSpacing: 0, aimSpeedJitter: -50 });
    e.particle.lifeFrames = 10_000;
    const instance = play(e, 60);
    // Each particle climbs between half a unit and one and a half units a
    // second: after 60 frames, no higher than three units, and the fastest
    // of the early ones past the two a plain unit a second would reach.
    const heights = drawn(instance).map(p => p.position.y);
    expect(heights.length).toBeGreaterThan(30);
    expect(Math.max(...heights)).toBeLessThanOrEqual(3 + 1e-6);
    expect(Math.max(...heights)).toBeGreaterThan(2);
  });
});

describe('free quads', () => {
  const camera = (x: number, z: number) => {
    const c = new THREE.PerspectiveCamera();
    c.position.set(x, 5, z);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  };
  const freeQuad = (): EffectEmitter => {
    const e = emitter();
    e.particle.shape = 'freeQuad';
    return e;
  };

  it('lies flat, with its face to the sky', () => {
    const { normal } = drawn(play(freeQuad(), 3, camera(0, 12)))[0]!;
    expect(normal.x).toBeCloseTo(0, 5);
    expect(Math.abs(normal.y)).toBeCloseTo(1, 5);
    expect(normal.z).toBeCloseTo(0, 5);
  });

  it('does not follow the camera', () => {
    const a = drawn(play(freeQuad(), 3, camera(0, 12)))[0]!.normal;
    const b = drawn(play(freeQuad(), 3, camera(12, 0)))[0]!.normal;
    expect(a.angleTo(b)).toBeLessThan(1e-4);
  });

  it('tilts on X and Y as well as Z', () => {
    const e = freeQuad();
    e.particle.startTilt = [Math.PI / 2, 0, 0];
    const { normal } = drawn(play(e, 3, camera(0, 12)))[0]!;
    expect(Math.abs(normal.y)).toBeCloseTo(0, 5);
  });
});

describe('streaks', () => {
  const rising = (shape: 'streak' | 'facingStreak'): EffectEmitter => {
    const e = emitter();
    e.particle.shape = shape;
    e.particle.lifeFrames = 1000;
    return e;
  };
  const looking = (x: number, z: number) => {
    const c = new THREE.PerspectiveCamera();
    c.position.set(x, 0, z);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  };

  it('stretch along the direction of travel', () => {
    expect(drawn(play(rising('facingStreak'), 3, looking(0, 10)))[0]!.upAxis.y).toBeCloseTo(1, 4);
    expect(drawn(play(rising('streak'), 3, looking(0, 10)))[0]!.upAxis.y).toBeCloseTo(1, 4);
  });

  it('turn their face to the viewer when facing, and hold still otherwise', () => {
    const facingA = drawn(play(rising('facingStreak'), 3, looking(0, 10)))[0]!.right;
    const facingB = drawn(play(rising('facingStreak'), 3, looking(10, 0)))[0]!.right;
    expect(Math.abs(facingA.dot(facingB))).toBeLessThan(0.5);

    const freeA = drawn(play(rising('streak'), 3, looking(0, 10)))[0]!.right;
    const freeB = drawn(play(rising('streak'), 3, looking(10, 0)))[0]!.right;
    expect(Math.abs(freeA.dot(freeB))).toBeCloseTo(1, 4);
  });

  it('hang the body behind the head when anchored on row 2', () => {
    const e = rising('facingStreak');
    e.particle.anchorRow = 'end';
    e.burstSpacing = 10_000;
    const [p] = drawn(play(e, 3, looking(0, 10)));
    // The particle has climbed 0.1; the quad's centre sits a half-height below it.
    expect(p!.position.y).toBeCloseTo(0.1 - 1, 4);
  });

  it('draw as free quads with the velocity switch off', () => {
    particleOptions.streaksFollowVelocity = false;
    try {
      const { normal } = drawn(play(rising('streak'), 3, looking(0, 10)))[0]!;
      expect(Math.abs(normal.y)).toBeCloseTo(1, 5);
    } finally {
      particleOptions.streaksFollowVelocity = true;
    }
  });
});

describe('a continuously replaced particle', () => {
  it('never leaves a frame with nothing drawn', () => {
    const e = emitter({ burstSpacing: 10, burstSize: flat(1) });
    e.particle.lifeFrames = 10;
    const instance = new EffectInstance(effect(e), () => new THREE.MeshBasicMaterial());
    const camera = still();
    const empty: number[] = [];
    for (let f = 0; f < 200; f++) {
      instance.update(1 / 30, camera);
      if (meshOf(instance).count === 0) empty.push(f);
    }
    expect(empty).toEqual([]);
  });

  it('still holds one at a time rather than piling up', () => {
    const e = emitter({ burstSpacing: 10, burstSize: flat(1) });
    e.particle.lifeFrames = 10;
    const instance = new EffectInstance(effect(e), () => new THREE.MeshBasicMaterial());
    const camera = still();
    let most = 0;
    for (let f = 0; f < 200; f++) {
      instance.update(1 / 30, camera);
      most = Math.max(most, meshOf(instance).count);
    }
    expect(most).toBeLessThanOrEqual(2);
  });
});

describe('affectors', () => {
  it('pull by strength times an unnormalised direction', () => {
    const e = emitter({ burstSpacing: 10_000, aimSpeed: flat(0) });
    e.affectors = [{ kind: 'pull', strength: flat(3), direction: flat([0, -0.1, 0]) }];
    expect(drawn(play(e, 30))[0]!.position.y).toBeLessThan(0);
  });

  it('swirl around the axis through the emitter without lifting', () => {
    const e = emitter({ shape: 'disc', burstSpacing: 10_000, aimSpeed: flat(0) });
    e.spawnSize = [flat(1), flat(0), flat(1)];
    e.hollowPct = flat(100);
    e.affectors = [{ kind: 'swirl', strength: flat(0.1), axis: flat([0, 1, 0]), swirlMode: 0 }];
    const [p] = drawn(play(e, 10));
    expect(Math.hypot(p!.position.x, p!.position.z)).toBeGreaterThan(0.9);
    expect(Math.abs(p!.position.y)).toBeLessThan(1e-6);
  });

  it('wander only on its own period', () => {
    const e = emitter({ burstSpacing: 10_000, aimSpeed: flat(0) });
    e.affectors = [{ kind: 'wander', amplitude: [0, 30, 0], changeEveryFrames: 1_000 }];
    const instance = play(e, 2);
    const y1 = drawn(instance)[0]!.position.y;
    instance.update(1 / 30, still());
    const y2 = drawn(instance)[0]!.position.y;
    instance.update(1 / 30, still());
    const y3 = drawn(instance)[0]!.position.y;
    // One push at birth, then a straight line: equal steps.
    expect(y3 - y2).toBeCloseTo(y2 - y1, 6);
  });
});

/** Sizes, heights and spins of what one cast of `path` draws after 20 frames, seeded by `seed`. */
function cast(path: string, seed?: string) {
  const e = emitter({ burstSpacing: 0, aimSpeedJitter: -50, radialSpeedJitter: 40 });
  e.particle.sizeJitter = 60;
  e.particle.lifeJitter = -30;
  e.particle.lifeFrames = 10_000;
  const data = effect(e, { path });
  const material = () => new THREE.MeshBasicMaterial();
  const instance = seed
    ? new EffectInstance(data, material, undefined, undefined, false, [], false, seed)
    : new EffectInstance(data, material);
  for (let f = 0; f < 20; f++) instance.update(1 / 30, still());
  return drawn(instance).map(p => [p.scale.x, p.position.x, p.position.y, p.position.z]);
}

describe('every cast of one effect', () => {
  it('draws the same particles each time it is cast', () => {
    const first = cast('Effects/a.beff');
    expect(first.length).toBeGreaterThan(5);
    expect(cast('Effects/a.beff')).toEqual(first);
  });

  it('differs from another effect with the same settings', () => {
    expect(cast('Effects/b.beff')).not.toEqual(cast('Effects/a.beff'));
  });

  it('does not repeat one particle through a burst', () => {
    const sizes = cast('Effects/a.beff').map(p => p[0]);
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });
});

describe('one effect placed in the world at several places', () => {
  const at = (x: number, z: number) =>
    cast('Effects/lamp.beff', placementSeed('Effects/lamp.beff', [x, 0, z]));

  it('draws differently at each place, so the copies do not run in step', () => {
    expect(at(10, 20)).not.toEqual(at(30, 20));
    expect(at(10, 20)).not.toEqual(cast('Effects/lamp.beff'));
  });

  it('draws the same at the same place every time it is built', () => {
    expect(at(10, 20)).toEqual(at(10, 20));
    // A position read back with rounding noise is the same place.
    expect(placementSeed('a.beff', [10.0000001, 0, 20])).toBe(placementSeed('a.beff', [10, 0, 20]));
  });
});
