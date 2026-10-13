/**
 * Materials and textures: never upload an image twice, never leak one.
 * Materials start untextured so a mesh draws the frame it is built. Blending
 * comes from the model's shader name, never guessed.
 */

import * as THREE from 'three';
import { patchFadeMaterial } from './fadeMaterial';
import { softenMap } from './foliageSoftness';
import { logger } from '../core/log';
import { WATER_REFLECTION_TEXTURE } from './WaterFactory';
import {
  WaterfallMaterial,
  createWaterfallMaterial,
  prepareWaterfallTexture,
} from './waterfallShader';
import type { ProgramNames } from './packProgram';
import type { ResourceSystem } from '../assets/ResourceSystem';
import type { BlendMode } from '../assets/types';

const log = logger('materials');

/** Fetch-and-upload concurrency: ~300 textures at once would stutter the frame loop. */
const MAX_CONCURRENT_UPLOADS = 2;

/** A world position, for prioritising the texture queue by distance. */
type Vec3 = readonly [number, number, number];

/** Everything that distinguishes one material from another. */
export interface MaterialSpec {
  texture: string | null;
  blend: BlendMode;
  doubleSided: boolean;
  /** Pre-lit art: take no scene lighting. True for nearly all game models. */
  unlit: boolean;
  /** Terrain carries a per-vertex tint; models do not. */
  vertexColors?: boolean;
  /** Terrain uses one baked image per tile and must not repeat it. */
  clampTexture?: boolean;
  /** Only consulted for motion shaders; `waterfall` is the one. */
  shader?: string;
  /**
   * Foliage drawn by alpha-to-coverage: soft-edged but depth-writing and
   * order-free, so it stays opaque and instances. Multisampled canvases only.
   */
  coverage?: boolean;
  /** Foliage sampled a little blurrier (`foliageSoftness.ts`), so it reads soft. */
  soft?: boolean;
}

/** A material's identity; `ModelFactory` uses it too, so both agree on sharing. */
export function specKey(spec: MaterialSpec): string {
  return [
    spec.texture ?? '-',
    spec.blend,
    spec.doubleSided ? '2s' : '1s',
    spec.unlit ? 'unlit' : 'lit',
    spec.shader === 'waterfall' ? 'waterfall' : '',
    spec.vertexColors ? 'vc' : '',
    spec.clampTexture ? 'clamp' : '',
    spec.coverage ? 'a2c' : '',
    spec.soft ? 'soft' : '',
  ].join('|');
}

export class MaterialCache {
  private readonly materials = new Map<string, THREE.Material>();
  /** Flowing-water materials, whose clock the renderer advances. */
  private readonly waterfalls: WaterfallMaterial[] = [];
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly programSources = new Map<
    string,
    Promise<{ vertex: string | null; fragment: string | null } | null>
  >();
  /** The spec each material was made from, for deriving a variant of it. */
  private readonly specs = new Map<THREE.Material, MaterialSpec>();
  /** Whether foliage's cut-out variant is drawn by coverage; see `setCoverage`. */
  private coverage = false;
  /** For a foliage cut-out variant, the blended spec it stands in for. */
  private readonly foliageOrigin = new Map<THREE.Material, MaterialSpec>();
  /** Holders per raw texture, disposed on the last release; per-tile ground masks matter most. */
  private readonly rawUses = new Map<string, number>();
  /** Anisotropic filtering applied to every texture built here. */
  private anisotropy = 4;
  /** Materials whose texture has not landed: tells "untextured" from "still loading" for portraits. */
  private readonly pending = new Set<THREE.Material>();
  private readonly queue: Array<{ job: () => Promise<void>; at: Vec3 | null }> = [];
  /** Queued jobs by material key, so a nearer asker can raise one's priority. */
  private readonly queued = new Map<string, { job: () => Promise<void>; at: Vec3 | null }>();
  /** Whether queue priorities changed since the last sort. */
  private queueNeedsSort = false;
  /** Materials that asked for an image and lack it; a null map alone cannot say (some never have one). */
  private readonly awaitingTexture = new Set<THREE.Material>();
  private active = 0;

  /** `eye` is live (`rig.target`), so priority follows the player. */
  constructor(
    /** Narrowed to what is actually used, so a test can pass a lookup alone. */
    private readonly resources: Pick<ResourceSystem, 'texture'> &
      Partial<Pick<ResourceSystem, 'shaderText'>>,
    private readonly eye?: THREE.Vector3,
  ) {}

  /** Shared material for a spec (fetched once; nearest asker sets priority;
   * omitted sorts first). */
  get(spec: MaterialSpec, at?: Vec3): THREE.Material {
    const key = specKey(spec);
    const existing = this.materials.get(key);
    if (existing) {
      // Already made: a nearer asker may raise its queued priority.
      const pending = this.queued.get(key);
      if (pending && at && this.priority(at) < this.priority(pending.at)) {
        pending.at = at;
        this.queueNeedsSort = true;
      }
      return existing;
    }

    const material = this.create(spec);
    this.materials.set(key, material);
    this.specs.set(material, spec);
    if (spec.texture) {
      this.awaitingTexture.add(material);
      const entry = { job: () => this.hydrate(spec, material), at: at ?? null };
      this.queued.set(key, entry);
      this.enqueue(entry, () => this.queued.delete(key));
    }
    return material;
  }

  /** Every cached material recompiles on its next draw. For a renderer-wide switch such as the shadow map. */
  markAllForRecompile(): void {
    for (const material of this.materials.values()) material.needsUpdate = true;
  }

  /** Draw foliage cut-outs by alpha-to-coverage; set before any model is built, on a multisampled canvas. */
  setCoverage(on: boolean): void {
    this.coverage = on;
  }

  /** Whether foliage cut-outs are drawn by coverage, so need no blended companion. */
  get coverageFoliage(): boolean {
    return this.coverage;
  }

  foliageVariant(material: THREE.Material, cutout: boolean): THREE.Material {
    const spec = this.specs.get(material);
    if (!spec) return material;
    const origin = this.foliageOrigin.get(material) ?? spec;
    if (origin.blend !== 'blend' || origin.shader === 'waterfall') return material;
    // Both of foliage's variants are soft; the surface it came from, which
    // glass and other blended art share, stays as it is.
    const variant = this.get(
      !cutout
        ? { ...origin, soft: true }
        : this.coverage
          ? { ...origin, blend: 'cutout', coverage: true, soft: true }
          : { ...origin, blend: 'cutout', soft: true },
    );
    this.foliageOrigin.set(variant, origin);
    return variant;
  }

  private create(spec: MaterialSpec): THREE.Material {
    // Flowing water is a shader, not a blend mode; without it a fountain is a still image.
    if (spec.shader === 'waterfall') {
      const material = createWaterfallMaterial(spec.doubleSided);
      this.waterfalls.push(material);
      // The sheet reflects the pond's sky picture; the build's program is read
      // and run nowhere in the game now, only on the shader bench.
      void this.rawTexture(WATER_REFLECTION_TEXTURE, 'repeat', 'data').then(texture => {
        if (texture) material.bindReflection(texture);
      });
      return material;
    }

    const common = {
      // Untextured surfaces start neutral; a texture replaces this with white.
      color: spec.texture ? 0x9a9a9a : 0xb0b0b0,
      side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      vertexColors: spec.vertexColors ?? false,
      transparent: spec.blend === 'blend' || spec.blend === 'additive',
      // A blended surface waiting for its texture paints nothing, or it is a
      // grey slab; opaque ones keep their grey, which is easier to notice.
      opacity: spec.texture && (spec.blend === 'blend' || spec.blend === 'additive') ? 0 : 1,
      // Cut-out tests rather than blends, staying in the opaque pass; by
      // coverage, the test only drops what covers nothing.
      alphaTest: spec.blend === 'cutout' ? (spec.coverage ? 0.02 : 0.5) : 0,
      alphaToCoverage: spec.blend === 'cutout' && spec.coverage === true,
      depthWrite: spec.blend === 'blend' || spec.blend === 'additive' ? false : true,
      blending: spec.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    };
    // `unlit_*` art has baked lighting, so Basic; Lambert for the few lit
    // materials and terrain. Every stock material can dissolve (`fadeMaterial.ts`).
    const material = patchFadeMaterial(
      spec.unlit ? new THREE.MeshBasicMaterial(common) : new THREE.MeshLambertMaterial(common),
    );
    if (spec.soft) softenMap(material);
    return material;
  }

  /** Queue a texture job; `onStart` fires as it leaves the queue. */
  private enqueue(
    entry: { job: () => Promise<void>; at: Vec3 | null },
    onStart?: () => void,
  ): void {
    if (onStart) {
      const inner = entry.job;
      entry.job = async () => {
        onStart();
        await inner();
      };
    }
    // The entry itself: `get` raises its priority in place.
    this.queue.push(entry);
    this.queueNeedsSort = true;
    this.pump();
  }

  /** Squared distance from the eye; unknown position or no eye sorts first. */
  private priority(at: Vec3 | null): number {
    if (!at || !this.eye) return -1;
    const dx = at[0] - this.eye.x,
      dy = at[1] - this.eye.y,
      dz = at[2] - this.eye.z;
    return dx * dx + dy * dy + dz * dz;
  }

  private pump(): void {
    // Nearest the player now first, re-sorted each pump while the backlog
    // drains; skipped when the queue is already small.
    if (this.queueNeedsSort && this.queue.length > MAX_CONCURRENT_UPLOADS - this.active) {
      this.queue.sort((a, b) => this.priority(a.at) - this.priority(b.at));
      this.queueNeedsSort = false;
    }
    while (this.active < MAX_CONCURRENT_UPLOADS && this.queue.length > 0) {
      const { job } = this.queue.shift()!;
      this.active++;
      // Catch it: a failed texture would otherwise leave grey with nothing said.
      void job()
        .catch((err: unknown) => {
          log.warn(`texture job failed: ${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  /** A raw texture for a custom material, through the same queue and cache. */
  async rawTexture(
    ref: string,
    wrap: 'repeat' | 'clamp' = 'repeat',
    kind: 'colour' | 'data' = 'colour',
    at?: Vec3,
  ): Promise<THREE.Texture | null> {
    const key = rawKey(ref, wrap, kind);
    this.rawUses.set(key, (this.rawUses.get(key) ?? 0) + 1);
    const cached = this.textures.get(key);
    if (cached) return cached;

    // Settle on failure too, or the caller waits forever.
    const data = await new Promise<Awaited<ReturnType<typeof this.resources.texture>> | null>(
      resolve =>
        this.enqueue({
          at: at ?? null,
          job: async () => {
            try {
              resolve(await this.resources.texture(ref));
            } catch (err) {
              log.warn(
                `raw texture ${ref} failed: ${err instanceof Error ? err.message : String(err)}`,
              );
              resolve(null);
            }
          },
        }),
    );
    if (!data) {
      log.debug(`no texture for ${ref}`);
      return null;
    }
    // Re-check: two callers can race through the queue for the same ref.
    const raced = this.textures.get(key);
    if (raced) return raced;
    // Every holder let go while the image was in flight — a tile evicted
    // before its mask arrived. Uploading it now would strand it on the GPU.
    if ((this.rawUses.get(key) ?? 0) <= 0) {
      this.rawUses.delete(key);
      return null;
    }

    const texture = new THREE.Texture(data.image);
    const wrapping = wrap === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    texture.wrapS = wrapping;
    texture.wrapT = wrapping;
    // A mask is not a picture. Its channels are blend factors and a shadow
    // level, so decoding them as sRGB bends numbers that were never colours.
    texture.colorSpace = kind === 'data' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    // Same reasoning as every other texture here: see hydrate().
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;
    this.textures.set(key, texture);
    return texture;
  }

  /** The last release disposes; over-releasing is ignored rather than going negative. */
  releaseRawTexture(
    ref: string,
    wrap: 'repeat' | 'clamp' = 'repeat',
    kind: 'colour' | 'data' = 'colour',
  ): void {
    const key = rawKey(ref, wrap, kind);
    const uses = this.rawUses.get(key);
    if (uses === undefined) return;
    if (uses > 1) {
      this.rawUses.set(key, uses - 1);
      return;
    }
    this.rawUses.delete(key);
    const texture = this.textures.get(key);
    if (texture) {
      this.textures.delete(key);
      texture.dispose();
    }
  }

  /** Raw textures currently held, for the diagnostics overlay and tests. */
  get rawTextureCount(): number {
    return this.rawUses.size;
  }

  /** Flowing-water materials and how many hold their texture: an unbound sampler reads black silently. */
  get waterfallStatus(): { total: number; textured: number } {
    return {
      total: this.waterfalls.length,
      textured: this.waterfalls.filter(m => m.uniforms.map.value !== null).length,
    };
  }

  /** Advance every flowing-water material's clock. Each reads the scene's fog itself as it draws. */
  tickWaterfalls(time: number): void {
    for (const m of this.waterfalls) m.uniforms.uTime.value = time;
  }

  /**
   * One GPU program's two stages, fetched once; null where neither ships or the cache cannot ask.
   * Bench-only: the game draws its own surfaces and never calls this. Only the shader bench does.
   */
  programSource(
    names: ProgramNames,
  ): Promise<{ vertex: string | null; fragment: string | null } | null> {
    const key = `${names.vertex}|${names.fragment}`;
    const known = this.programSources.get(key);
    if (known) return known;
    const lookup = this.resources.shaderText?.bind(this.resources);
    const task = lookup
      ? Promise.all([lookup(names.vertex), lookup(names.fragment)])
          .then(([vertex, fragment]) => (vertex || fragment ? { vertex, fragment } : null))
          .catch(() => null)
      : Promise.resolve(null);
    this.programSources.set(key, task);
    return task;
  }

  private async hydrate(spec: MaterialSpec, material: THREE.Material): Promise<void> {
    try {
      await this.fetchAndApply(spec, material);
    } finally {
      // Settled either way, or a missing texture holds the portrait pass forever.
      this.awaitingTexture.delete(material);
    }
  }

  /** Whether this material asked for an image and is still without it. */
  isPending(material: THREE.Material): boolean {
    return this.awaitingTexture.has(material);
  }

  private async fetchAndApply(spec: MaterialSpec, material: THREE.Material): Promise<void> {
    const ref = spec.texture;
    if (!ref) {
      this.pending.delete(material);
      return;
    }

    const cached = this.textures.get(textureKey(spec));
    if (cached) {
      applyMap(material, cached);
      this.pending.delete(material);
      return;
    }

    const data = await this.resources.texture(ref);
    if (!data) {
      // Worth seeing. A blended material stays invisible when its texture
      // never arrives, so the only sign left is this line.
      log.once('warn', `no-texture:${ref}`, `no texture for ${ref}`);
      this.pending.delete(material);
      return;
    }

    const texture = new THREE.Texture(data.image);
    if (spec.clampTexture) {
      // One baked image per tile: clamp, so filtering does not bleed the opposite edge into seams.
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    } else {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    // flipY stays false for models and terrain (BDAE v=0 is the top row;
    // terrain chain is exact: PNG row 0 = chunk cz=0 = grid row 0).
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;

    this.textures.set(textureKey(spec), texture);
    applyMap(material, texture);
    this.pending.delete(material);
  }

  /** Change filtering on every texture; existing ones re-upload once (sampler state only reaches the GPU on upload). */
  setAnisotropy(level: number): void {
    if (level === this.anisotropy) return;
    this.anisotropy = level;
    for (const texture of this.textures.values()) {
      texture.anisotropy = level;
      texture.needsUpdate = true;
    }
  }

  get uploadedCount(): number {
    return this.textures.size;
  }

  /** Textures still queued or in flight. Zero once a zone has finished. */
  get pendingCount(): number {
    return this.queue.length + this.active;
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.textures.clear();
    this.materials.clear();
    this.programSources.clear();
    this.queue.length = 0;
    this.queued.clear();
    this.queueNeedsSort = false;
    this.awaitingTexture.clear();
    this.active = 0;
  }
}

function rawKey(ref: string, wrap: string, kind: string): string {
  return `raw:${wrap}:${kind}:${ref}`;
}

/** Sampler state differs by usage, so one image may need two uploads; flowing water takes it undecoded, a third. */
function textureKey(spec: MaterialSpec): string {
  return `${spec.texture}|${spec.clampTexture ? 'clamp' : 'repeat'}${spec.shader === 'waterfall' ? '|flow' : ''}`;
}

function applyMap(material: THREE.Material, texture: THREE.Texture): void {
  // A ShaderMaterial has no `.map`; its texture arrives through a uniform.
  if (material instanceof WaterfallMaterial) {
    prepareWaterfallTexture(texture);
    material.uniforms.map.value = texture;
    material.uniforms.uHasMap.value = 1;
    material.choosePath();
    log.debug('waterfall material got its texture');
    return;
  }
  const m = material as THREE.MeshBasicMaterial;
  m.map = texture;
  m.color.setHex(0xffffff);
  // Blended materials start at zero opacity so a late or missing texture draws
  // nothing rather than a slab; the texture arriving is what turns them on.
  m.opacity = 1;
  m.needsUpdate = true;
}
