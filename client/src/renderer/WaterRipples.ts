/**
 * Rings where a body meets the water, drawn as an expanding annulus that
 * thins and fades. Rings appear only while the body is at the waterline
 * (below the surface, within half a unit of a swimmer's float line).
 */

import * as THREE from 'three';

/** How many rings can be alive at once. Older ones are recycled. */
const MAX_RINGS = 24;

/** Seconds a ring takes to expand and fade out. */
const RING_LIFETIME = 1.4;

/** Ring radius in world units, at birth and at death. */
const RING_START_RADIUS = 0.35;
const RING_END_RADIUS = 2.2;

/** Sit rings this far above the surface so they do not z-fight with it. */
const SURFACE_LIFT = 0.03;

interface Ring {
  x: number;
  z: number;
  y: number;
  age: number;
  /** Scales the ring's final size — a splash is bigger than a wake. */
  scale: number;
}

export class WaterRipples {
  readonly object = new THREE.Group();

  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly rings: Ring[] = [];
  private readonly offsets: Float32Array;
  private readonly params: Float32Array;
  private next = 0;
  /** Distance walked since the last wake ring, so rings space out evenly. */
  private sinceLastRing = 0;

  constructor() {
    // One quad, drawn once per live ring.
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2); // lie flat on the water

    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.attributes = quad.attributes;
    this.geometry.instanceCount = 0;

    this.offsets = new Float32Array(MAX_RINGS * 3);
    // x = age 0..1, y = final radius
    this.params = new Float32Array(MAX_RINGS * 2);
    this.geometry.setAttribute('ringPos', new THREE.InstancedBufferAttribute(this.offsets, 3));
    this.geometry.setAttribute('ringParam', new THREE.InstancedBufferAttribute(this.params, 2));

    this.material = createRippleMaterial();
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 11; // over the water, which sorts with the rest at 0
    this.object.add(mesh);
  }

  /**
   * Spawn one ring. `scale` multiplies its final size: a wake is 1, a body
   * breaking the surface is bigger.
   */
  spawn(x: number, y: number, z: number, scale = 1): void {
    const ring = this.rings[this.next] ?? ({} as Ring);
    ring.x = x;
    ring.y = y;
    ring.z = z;
    ring.age = 0;
    ring.scale = scale;
    this.rings[this.next] = ring;
    this.next = (this.next + 1) % MAX_RINGS;
  }

  /**
   * Trail rings behind a body at the waterline.
   *
   * `travelled` is how far it moved this frame; standing still still ripples,
   * just far more slowly, which is what the held `swim_circle` effect looks
   * like.
   */
  trail(x: number, y: number, z: number, travelled: number, dt: number): void {
    this.sinceLastRing += travelled + dt * 0.35;
    if (this.sinceLastRing < 0.6) return;
    this.sinceLastRing = 0;
    this.spawn(x, y, z, 1);
  }

  /** Advance every live ring and push the result to the GPU. */
  update(dt: number): void {
    let live = 0;
    for (const ring of this.rings) {
      if (!ring || ring.age >= RING_LIFETIME) continue;
      ring.age += dt;
      if (ring.age >= RING_LIFETIME) continue;
      this.offsets[live * 3] = ring.x;
      this.offsets[live * 3 + 1] = ring.y + SURFACE_LIFT;
      this.offsets[live * 3 + 2] = ring.z;
      this.params[live * 2] = ring.age / RING_LIFETIME;
      this.params[live * 2 + 1] = ring.scale;
      live++;
    }
    this.geometry.instanceCount = live;
    if (live > 0) {
      (this.geometry.getAttribute('ringPos') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (this.geometry.getAttribute('ringParam') as THREE.InstancedBufferAttribute).needsUpdate =
        true;
    }
  }

  /** Forget every ring — on a zone change, nothing carries over. */
  clear(): void {
    this.rings.length = 0;
    this.next = 0;
    this.sinceLastRing = 0;
    this.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function createRippleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStartRadius: { value: RING_START_RADIUS },
      uEndRadius: { value: RING_END_RADIUS },
    },
    vertexShader: `
      attribute vec3 ringPos;
      attribute vec2 ringParam;
      varying vec2 vUv;
      varying float vFade;
      varying float vAge;
      uniform float uStartRadius, uEndRadius;

      void main() {
        float age = ringParam.x;
        float scale = ringParam.y;
        // Expand quickly then ease off, the way a real ring spreads.
        float r = mix(uStartRadius, uEndRadius * scale, sqrt(age));
        // Fade in over the first tenth of life, then out across the rest.
        vFade = smoothstep(0.0, 0.1, age) * (1.0 - age);
        vAge = age;
        vUv = uv;
        vec3 world = ringPos + vec3(position.x * r * 2.0, 0.0, position.z * r * 2.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      varying float vFade;
      varying float vAge;

      void main() {
        // Distance from the centre of the quad, 0 at the middle, 1 at the edge.
        float d = length(vUv - 0.5) * 2.0;

        // A ring that thins as it spreads: wide and soft when it is small,
        // narrow when it is large. Real ripples do this, and it is what keeps
        // the effect from reading as a growing disc.
        float width = mix(0.30, 0.09, vAge);
        float ring = smoothstep(1.0, 1.0 - width, d) * smoothstep(1.0 - width * 2.0, 1.0 - width, d);

        gl_FragColor = vec4(1.0, 1.0, 1.0, ring * vFade * 0.5);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
