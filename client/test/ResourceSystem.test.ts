import { describe, expect, it, vi } from 'vitest';

import { ResourceSystem } from '../src/assets/ResourceSystem';
import { MemoryResourceCache } from '../src/assets/cache/ResourceCache';
import {
  attachPointId,
  modelId,
  networkAppearanceId,
  resourceKey,
  textureId,
  zoneId,
  zoneIndexId,
} from '../src/assets/ids';
import { ResourceNotFoundError } from '../src/core/errors';
import type { AssetProvider, AssetSource } from '../src/assets/AssetProvider';
import type { IdOf, ResourceKind } from '../src/assets/ids';
import type { ModelData, ResourceTypes } from '../src/assets/types';
import type { SpellVisualData } from '../src/assets/formats/tables';

function fakeModel(path: string): ModelData {
  return {
    path,
    meshes: [
      {
        name: 'mesh0',
        positions: new Float32Array([0, 0, 0]),
        normals: new Float32Array([0, 1, 0]),
        uvs: new Float32Array([0, 0]),
        colors: new Uint8Array([255, 255, 255, 255]),
        indices: new Uint32Array([0]),
        groups: [
          {
            start: 0,
            count: 1,
            texture: null,
            material: '',
            blend: 'opaque',
            doubleSided: false,
            unlit: true,
            shader: 'unlit_textured_solid',
          },
        ],
      },
    ],
    defaultMeshes: [],
  };
}

/** Counts calls so de-duplication and caching are observable. */
class StubProvider implements AssetProvider {
  readonly name = 'stub';
  loads = 0;
  source: AssetSource | null = { id: 'src-a', label: 'a.ipa' };
  /** Resolves the next load manually, to create overlapping requests. */
  gate: (() => void) | null = null;
  fail: Error | null = null;
  /** Animation files that exist, by path, with the tracks each holds. */
  animations = new Map<string, number>();
  /** Every animation path asked for, in order. */
  animationAsks: string[] = [];
  /** What each spell's own row names as its visual. Absent means no row. */
  spellVisuals = new Map<number, number>();

  async init(): Promise<void> {}
  async listSources(): Promise<AssetSource[]> {
    return this.source ? [this.source] : [];
  }
  currentSource(): AssetSource | null {
    return this.source;
  }
  async useSource(id: string): Promise<AssetSource> {
    this.source = { id, label: id };
    return this.source;
  }

  async load<K extends ResourceKind>(id: IdOf<K>): Promise<ResourceTypes[K]> {
    this.loads++;
    if (this.gate)
      await new Promise<void>(resolve => {
        this.gate = resolve;
      });
    if (this.fail) throw this.fail;
    const target = id as { kind: string; path?: string };
    if (target.kind === 'model') return fakeModel(target.path!) as ResourceTypes[K];
    // `K` is generic here, so nothing narrower than `unknown` bridges the two.
    if (target.kind === 'zoneIndex') return { zones: [] } as unknown as ResourceTypes[K];
    if (target.kind === 'networkAppearance') {
      // The key the caller asked under, echoed back, so a test can prove which
      // request a cached answer actually came from.
      return {
        model: 'model/npc/x.bdae',
        scale: 1,
        appearance: {
          skin: 'avatar:x',
          meshes: [],
          skinReplacesAll: false,
          key: resourceKey(id as IdOf<'networkAppearance'>),
        },
      } as unknown as ResourceTypes[K];
    }
    if (target.kind === 'attachPoint') {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] as unknown as ResourceTypes[K];
    }
    if (target.kind === 'animation') {
      this.animationAsks.push(target.path!);
      const tracks = this.animations.get(target.path!);
      if (tracks === undefined) throw new ResourceNotFoundError(`animation:${target.path}`);
      return {
        name: target.path,
        duration: 1,
        tracks: Array.from({ length: tracks }, () => ({
          bone: 'Bone01',
          property: 'quaternion',
          times: new Float32Array([0, 1]),
          values: new Float32Array(8),
        })),
      } as unknown as ResourceTypes[K];
    }
    if (target.kind === 'spellVisualOf') {
      const visual = this.spellVisuals.get((id as IdOf<'spellVisualOf'>).id);
      // A build with no spell table at all, which is what the caller must
      // survive rather than propagate.
      if (visual === undefined) throw new ResourceNotFoundError('spell_new');
      return visual as unknown as ResourceTypes[K];
    }
    throw new Error(`stub has no ${target.kind}`);
  }

  async creatureName(): Promise<string | null> {
    return null;
  }
  async creatureEntryName(): Promise<string | null> {
    return null;
  }
  async spellName(): Promise<string | null> {
    return null;
  }
  async spellText(): Promise<string | null> {
    return null;
  }
  async questText(): Promise<string | null> {
    return null;
  }
  async itemName(): Promise<string | null> {
    return null;
  }
  async itemText(): Promise<string | null> {
    return null;
  }
  async spellIcon(): Promise<ImageBitmap | null> {
    return null;
  }
  async itemIcon(): Promise<ImageBitmap | null> {
    return null;
  }
  async classIcon(): Promise<ImageBitmap | null> {
    return null;
  }
  async topbarIcon(): Promise<ImageBitmap | null> {
    return null;
  }
  async spellCastable(): Promise<boolean> {
    return true;
  }
  async spellVisual(): Promise<SpellVisualData | null> {
    return null;
  }
  async spellCastingTime(): Promise<number> {
    return 0;
  }
  async spellVisualOf(): Promise<number> {
    return 0;
  }
  async itemWeaponClass(): Promise<{ itemClass: number; subClass: number }> {
    return { itemClass: 0, subClass: 0 };
  }

  dispose(): void {}
}

/** One resolved character look, for the caching cases below to vary. */
const LOOK = {
  entry: 0,
  displayInfoId: 41,
  race: 1,
  gender: 0,
  skin: 1,
  face: 1,
  hairStyle: 2,
  hairColor: 1,
  equipment: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  animationId: 0,
} as const;

describe('resourceKey', () => {
  it('is stable and distinguishes kinds', () => {
    expect(resourceKey(zoneIndexId())).toBe('zoneIndex');
    expect(resourceKey(zoneId(490))).toBe('zone:490');
    expect(resourceKey(modelId('model/a.bdae'))).toBe('model:model/a.bdae');
    expect(resourceKey(textureId('t.tga'))).toBe('texture:t.tga');
  });

  it('treats model paths case-insensitively, as the packs do', () => {
    expect(resourceKey(modelId('Model/A.BDAE'))).toBe(resourceKey(modelId('model/a.bdae')));
  });

  it('gives a network appearance a key covering every field of its id', () => {
    // The cache is only safe if the key is total over the id. Anything left
    // out here silently dresses one character as another.
    const base = networkAppearanceId(LOOK);
    const fields = Object.keys(base).filter(k => k !== 'kind');
    expect(fields).toHaveLength(10);
    for (const field of fields) {
      const changed = networkAppearanceId({
        ...LOOK,
        [field]: field === 'equipment' ? [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] : 77,
      });
      expect(resourceKey(changed)).not.toBe(resourceKey(base));
    }
  });
});

describe('ResourceSystem', () => {
  it('serves a repeated request from cache instead of the provider', async () => {
    const provider = new StubProvider();
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    const first = await resources.model('model/tree.bdae');
    const second = await resources.model('model/tree.bdae');

    expect(provider.loads).toBe(1);
    expect(second).toBe(first);
  });

  it('de-duplicates concurrent requests for the same resource', async () => {
    const provider = new StubProvider();
    provider.gate = () => {};
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    const a = resources.model('model/rock.bdae');
    const b = resources.model('model/rock.bdae');

    // The cache is consulted asynchronously, so let the microtask queue drain
    // before checking how many times the provider was actually reached.
    await new Promise(resolve => setTimeout(resolve, 0));

    // Both callers are now waiting on one in-flight load.
    expect(provider.loads).toBe(1);

    provider.gate!();
    expect(await a).toBe(await b);
    expect(provider.loads).toBe(1);
  });

  it('does not cache textures, which are re-decodable and GPU-bound', async () => {
    const provider = new StubProvider();
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    // The stub cannot make textures, so both attempts must reach it.
    await resources.texture('a.tga');
    await resources.texture('a.tga');
    expect(provider.loads).toBe(2);
  });

  it('serves a repeated network appearance from cache', async () => {
    const provider = new StubProvider();
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    // A crowd of the same mob. Without caching this is one full table walk
    // per body, because in-flight de-duplication only covers overlap.
    const look = { ...LOOK };
    const first = await resources.networkAppearance(look);
    const second = await resources.networkAppearance({ ...look });

    expect(provider.loads).toBe(1);
    expect(second).toBe(first);
  });

  it('does not let a different look collide with a cached one', async () => {
    const provider = new StubProvider();
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    const base = await resources.networkAppearance(LOOK);
    // Each of these changes what the compositor produces, so each must be
    // its own entry. A key missing any one of them would hand back `base`.
    const varied = [
      { ...LOOK, equipment: [9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { ...LOOK, animationId: 7 },
      { ...LOOK, hairColor: 4 },
      { ...LOOK, displayInfoId: 99 },
      { ...LOOK, entry: 12 },
      { ...LOOK, race: 2 },
      { ...LOOK, gender: 1 },
      { ...LOOK, skin: 3 },
      { ...LOOK, face: 5 },
      { ...LOOK, hairStyle: 6 },
    ];
    for (const look of varied) {
      expect(await resources.networkAppearance(look)).not.toBe(base);
    }
    expect(provider.loads).toBe(1 + varied.length);
  });

  it('caches an attach point per model and node', async () => {
    const provider = new StubProvider();
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    // Every equipped item asks for one of these, on every body wearing it.
    await resources.tryGet(attachPointId('model/m.bdae', 'Dummy_ride'));
    await resources.tryGet(attachPointId('model/m.bdae', 'Dummy_ride'));
    expect(provider.loads).toBe(1);

    // A different node on the same model is a different answer.
    await resources.tryGet(attachPointId('model/m.bdae', 'Dummy_weapon'));
    expect(provider.loads).toBe(2);
  });

  it('drops cached resources when the source changes', async () => {
    const provider = new StubProvider();
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    await resources.model('model/tree.bdae');
    expect(provider.loads).toBe(1);

    await resources.useSource('src-b');
    await resources.model('model/tree.bdae');
    // A different .ipa is a different build: the old entry must not be reused.
    expect(provider.loads).toBe(2);
  });

  it('tryGet turns a failure into null rather than rejecting', async () => {
    const provider = new StubProvider();
    provider.fail = new ResourceNotFoundError('model:missing');
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resources.tryGet(modelId('model/missing.bdae'))).toBeNull();
    warn.mockRestore();
  });

  describe('animation', () => {
    const BUTTERFLY = 'model/scene/broadleafforrest/broadleafforrest_butterfly.bdae';
    const HUMAN = 'model/npc/character/human/male/human_m_h.bdae';

    async function system(provider: StubProvider): Promise<ResourceSystem> {
      const resources = new ResourceSystem(provider, new MemoryResourceCache());
      await resources.init();
      return resources;
    }

    it("takes a character's idle from its anim directory without opening its own file", async () => {
      const provider = new StubProvider();
      provider.animations.set('model/npc/character/human/male/anim/idle.bdae', 3);
      const resources = await system(provider);

      const clip = await resources.animation(HUMAN);
      expect(clip?.tracks).toHaveLength(3);
      expect(provider.animationAsks).toEqual(['model/npc/character/human/male/anim/idle.bdae']);
    });

    it('animates skinned scenery from the clip inside its own file when it has no anim directory', async () => {
      // A butterfly's wings ride a skin controller, so its animation targets
      // bones rather than scene nodes; it ships no `anim/` sibling, and the
      // only place that clip exists is the model file itself.
      const provider = new StubProvider();
      provider.animations.set(BUTTERFLY, 2);
      const resources = await system(provider);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const clip = await resources.animation(BUTTERFLY);
      warn.mockRestore();

      expect(clip?.tracks).toHaveLength(2);
      expect(provider.animationAsks).toEqual([
        'model/scene/broadleafforrest/anim/idle.bdae',
        BUTTERFLY,
      ]);
    });

    it('is null when neither the anim directory nor the model file animates anything', async () => {
      const provider = new StubProvider();
      provider.animations.set(BUTTERFLY, 0);
      const resources = await system(provider);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(await resources.animation(BUTTERFLY)).toBeNull();
      warn.mockRestore();
    });

    it("does not answer a missing named clip with the model's own file", async () => {
      // A character without a `combat_ready` must fall back through the clip
      // vocabulary, not be handed whatever its model file happens to hold.
      const provider = new StubProvider();
      provider.animations.set(HUMAN, 4);
      const resources = await system(provider);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(await resources.animation(HUMAN, 'combat_ready')).toBeNull();
      warn.mockRestore();
      expect(provider.animationAsks).toEqual([
        'model/npc/character/human/male/anim/combat_ready.bdae',
      ]);
    });
  });

  /*
   * The spell's own row is the second route to a cast's visual, and on a
   * server that does not send one it is the only route. `castVisualId`
   * (CombatVisuals) owns the choice between the two; this owns the reading.
   */
  describe('spellVisualOf', () => {
    it('reads the visual a spell row names', async () => {
      const provider = new StubProvider();
      provider.spellVisuals.set(5815, 3);
      const resources = new ResourceSystem(provider, new MemoryResourceCache());
      await resources.init();

      expect(await resources.spellVisualOf(5815)).toBe(3);
    });

    it('answers none, not an error, when the build ships no spell table', async () => {
      // A cast with no visual is a thing a spell is allowed to be. Throwing
      // here would take the whole cast down with it — including the caster's
      // animation, which hangs off the same lookup.
      const provider = new StubProvider();
      const resources = new ResourceSystem(provider, new MemoryResourceCache());
      await resources.init();

      expect(await resources.spellVisualOf(5815)).toBe(0);
    });

    it('is read once per spell and cached after that', async () => {
      // Every cast asks, and a fight asks the same handful of spells over
      // and over.
      const provider = new StubProvider();
      provider.spellVisuals.set(5815, 3);
      const resources = new ResourceSystem(provider, new MemoryResourceCache());
      await resources.init();

      await resources.spellVisualOf(5815);
      const after = provider.loads;
      await resources.spellVisualOf(5815);
      expect(provider.loads).toBe(after);
    });
  });

  it('get still rejects, so callers that need a resource find out', async () => {
    const provider = new StubProvider();
    provider.fail = new ResourceNotFoundError('model:missing');
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    await expect(resources.model('model/missing.bdae')).rejects.toThrow(ResourceNotFoundError);
  });

  it('clears the in-flight entry after a failure so a retry is possible', async () => {
    const provider = new StubProvider();
    provider.fail = new ResourceNotFoundError('model:x');
    const resources = new ResourceSystem(provider, new MemoryResourceCache());
    await resources.init();

    await expect(resources.model('model/x.bdae')).rejects.toThrow();
    await expect(resources.model('model/x.bdae')).rejects.toThrow();
    expect(provider.loads).toBe(2);
  });
});
