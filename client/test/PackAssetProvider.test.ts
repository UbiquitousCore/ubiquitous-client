/**
 * The pack provider: the resource shapes it produces, and that kinds without
 * a reader fail with a distinguishable error rather than something plausible.
 */

import { describe, expect, it, vi } from 'vitest';

import { ProviderNotReadyError, ResourceNotFoundError } from '../src/core/errors';
import {
  PackAssetProvider,
  ResourceUnsupportedError,
} from '../src/assets/providers/PackAssetProvider';
import { Library } from '../src/assets/vfs/Library';
import { buildPack, buildPvr, buildTablesPack, text } from './helpers/fixtures';

/**
 * An .ipa is a plain zip whose members are the packs — plus, in a real one,
 * Apple's own `META-INF/com.apple.FixedZipMetadata.bin`, which is included
 * here because it is a .bin that is not a pack and once broke the scan.
 */
function ipaFile(packs: Record<string, Uint8Array>): File {
  const members = Object.entries(packs).map(([name, data]) => ({
    name: `Payload/Game.app/${name}`,
    // Stored, so the provider can address them in place — the deflate path is
    // covered by packReader.test.ts and needs no 654 MB here.
    data,
  }));
  const zip = buildPack(
    [{ name: 'META-INF/com.apple.FixedZipMetadata.bin', data: text('not a pack') }, ...members],
    0x04034b50,
  );
  return new File([zip as BlobPart], 'ubiquitous-2.2.0-test.ipa');
}

/**
 * A `.bdae` with a valid header and nothing behind it.
 *
 * `new Bdae` validates the signature, the byte-order mark and the header
 * size, and everything past that is parsed lazily by whichever method is
 * called. That is exactly what a caching test wants: the document constructs,
 * so it is cached, and the readers above it then fail honestly on the empty
 * body. Building a model real enough to decode would be a fixture the size of
 * the format.
 */
function headerOnlyBdae(): Uint8Array {
  const bytes = new Uint8Array(128);
  const dv = new DataView(bytes.buffer);
  bytes.set(text('BRES'), 0);
  dv.setUint16(4, 0xfffe, true); // little-endian mark
  dv.setUint16(6, 1, true); // version
  dv.setUint32(8, 60, true); // header size, which must be exactly this
  dv.setUint32(12, bytes.length, true);
  return bytes;
}

describe('PackAssetProvider', () => {
  it('reads one .bdae once however many resources are cut from it', async () => {
    // `model` and `skeleton` are separate ids for the same file, so
    // de-duplication above this layer cannot see that they coincide -- and
    // `animation` needs the model's bind pose on top. One read, inflate and
    // parse serves all three, and all of it sits on the path between a
    // creature spawning and its body being drawn.
    const provider = new PackAssetProvider();
    const file = ipaFile({
      'tables.bin': buildTablesPack(),
      'res.bin': buildPack([{ name: 'model/npc/test.bdae', data: headerOnlyBdae() }]),
    });
    await provider.useSource(provider.offer(file).id);

    // Both fail: the body is empty, so there is no geometry and no skeleton
    // to find. What matters is how many times the file was opened to find out.
    await expect(provider.load({ kind: 'model', path: 'model/npc/test.bdae' })).rejects.toThrow();
    expect(provider.cacheStats().documents).toBe(1);

    await provider.load({ kind: 'skeleton', path: 'model/npc/test.bdae' }).catch(() => null);
    await provider
      .load({ kind: 'attachPoint', path: 'model/npc/test.bdae', node: 'Dummy_ride' })
      .catch(() => null);

    // Still one. Three ids, one document.
    expect(provider.cacheStats().documents).toBe(1);
  });

  it('matches a cached document case-insensitively, as the packs do', async () => {
    const provider = new PackAssetProvider();
    const file = ipaFile({
      'tables.bin': buildTablesPack(),
      'res.bin': buildPack([{ name: 'model/npc/test.bdae', data: headerOnlyBdae() }]),
    });
    await provider.useSource(provider.offer(file).id);

    await provider.load({ kind: 'model', path: 'model/npc/test.bdae' }).catch(() => null);
    await provider.load({ kind: 'model', path: 'Model/NPC/Test.BDAE' }).catch(() => null);

    expect(provider.cacheStats().documents).toBe(1);
  });

  it('forgets everything cached when the source changes', async () => {
    const provider = new PackAssetProvider();
    const file = ipaFile({
      'tables.bin': buildTablesPack(),
      'res.bin': buildPack([{ name: 'model/npc/test.bdae', data: headerOnlyBdae() }]),
    });
    await provider.useSource(provider.offer(file).id);
    await provider.load({ kind: 'model', path: 'model/npc/test.bdae' }).catch(() => null);
    expect(provider.cacheStats().documents).toBe(1);

    // A different build is different bytes under the same paths.
    const other = ipaFile({ 'tables.bin': buildTablesPack() });
    await provider.useSource(provider.offer(other).id);
    expect(provider.cacheStats()).toEqual({ documents: 0, documentBytes: 0, skeletons: 0 });
  });

  it('does not cache a document it could not read', async () => {
    const provider = new PackAssetProvider();
    const file = ipaFile({
      'tables.bin': buildTablesPack(),
      'res.bin': buildPack([{ name: 'model/npc/broken.bdae', data: text('not a bdae at all') }]),
    });
    await provider.useSource(provider.offer(file).id);

    await expect(provider.load({ kind: 'model', path: 'model/npc/broken.bdae' })).rejects.toThrow();
    // A failed read leaves no entry, so a later attempt is free to try again
    // rather than being handed the failure for ever.
    expect(provider.cacheStats().documents).toBe(0);
  });

  it('mounts an .ipa the user picked and reports the build', async () => {
    const provider = new PackAssetProvider();
    await provider.init();

    const file = ipaFile({ 'tables.bin': buildTablesPack() });
    const offered = provider.offer(file);
    expect(offered.label).toContain('.ipa');

    const source = await provider.useSource(offered.id);
    expect(source.version).toBe('2.2.0');
    expect(provider.currentSource()?.id).toBe(offered.id);
  });

  it("names a creature by its entry, through its appearance row's string id", async () => {
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'tables.bin': buildTablesPack() })).id);
    expect(await provider.load({ kind: 'creatureEntryName', entry: 500 })).toBe('Grey Wolf');
    expect(await provider.load({ kind: 'creatureEntryName', entry: 501 })).toBeNull();
  });

  it('reads the zone list out of tables.bin', async () => {
    const provider = new PackAssetProvider();
    const file = ipaFile({ 'tables.bin': buildTablesPack() });
    await provider.useSource(provider.offer(file).id);

    const index = await provider.load({ kind: 'zoneIndex' });
    expect(index.zones).toHaveLength(1);

    const [zone] = index.zones;
    expect(zone.id).toBe(5);
    expect(zone.name).toBe('Test Vale'); // from String_Zones_en
    expect(zone.mapId).toBe(13);
    expect(zone.mapName).toBe('Test Vale'); // from map_info's string pair
    expect(zone.bounds).toEqual([-100, -50, 100, 50]);
    expect(zone.centre).toEqual([0, 0]);
    expect(zone.hasScenery).toBe(true); // the map has a static spawn
  });

  it('resolves a texture through the search path, not just the literal name', async () => {
    // A model asks for "texture/tree.tga"; the file actually lives under
    // texture/scene/. Resolving on basename is what makes that work.
    const res = buildPack([{ name: 'texture/scene/tree.tga', data: buildPvr(4, 4, [[0, 0]]) }]);
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'res.bin': res })).id);

    const bitmap = { width: 4, height: 4, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    );
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );

    const texture = await provider.load({ kind: 'texture', ref: 'texture/tree.tga' });
    expect(texture.ref).toBe('texture/tree.tga');
    expect(texture.image).toBe(bitmap);
    vi.unstubAllGlobals();
  });

  it('hands the renderer a texture’s colour as decoded, not multiplied by its alpha', async () => {
    // Multiplied, a leaf's soft edge reached the GPU dark and drew a black rim.
    const res = buildPack([{ name: 'texture/leaf.tga', data: buildPvr(4, 4, [[0, 0]]) }]);
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'res.bin': res })).id);
    const made = vi.fn(async () => ({ width: 4, height: 4, close: vi.fn() }));
    vi.stubGlobal('createImageBitmap', made);
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );

    await provider.load({ kind: 'texture', ref: 'texture/leaf.tga' });
    expect(made).toHaveBeenCalledWith(expect.anything(), { premultiplyAlpha: 'none' });
    vi.unstubAllGlobals();
  });

  it('reads a minimap tile from the map own pack, sign-padded as the game names it', async () => {
    // The thumbnails are NOT in res.bin, and the texture index only covers
    // res.bin and res_t.bin -- which is why resolving them as textures found
    // nothing. They are in the map's world pack, which `map_info` names.
    // The fixture's map 13 is `test_vale.wld`, so `test_vale.bin`.
    const tile = buildPvr(4, 4, [[0, 0]]);
    const file = ipaFile({
      'tables.bin': buildTablesPack(),
      'res.bin': buildPack([]),
      'test_vale.bin': buildPack([
        { name: 'world/test_vale/thumbnails/0000_0000.tga', data: tile },
        { name: 'world/test_vale/thumbnails/-001_0012.tga', data: tile },
      ]),
    });
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(file).id);

    const bitmap = { width: 4, height: 4, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    );
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );

    expect((await provider.load({ kind: 'minimap', mapId: 13, tx: 0, tz: 0 })).ref).toBe(
      'world/test_vale/thumbnails/0000_0000.tga',
    );
    // A negative index is `-001`, four characters including the sign -- not
    // `-0001`, which is what padding the absolute value would produce.
    expect((await provider.load({ kind: 'minimap', mapId: 13, tx: -1, tz: 12 })).ref).toBe(
      'world/test_vale/thumbnails/-001_0012.tga',
    );

    // A tile the build does not ship is absent, not broken: the minimap
    // leaves that quadrant blank rather than failing to draw at all.
    await expect(provider.load({ kind: 'minimap', mapId: 13, tx: 9, tz: 9 })).rejects.toThrow(
      ResourceNotFoundError,
    );
    vi.unstubAllGlobals();
  });

  it('reports a missing texture as not found, not as a decode failure', async () => {
    const provider = new PackAssetProvider();
    const res = buildPack([{ name: 'texture/a.tga', data: buildPvr(4, 4, [[0, 0]]) }]);
    await provider.useSource(provider.offer(ipaFile({ 'res.bin': res })).id);

    await expect(provider.load({ kind: 'texture', ref: 'texture/nope.tga' })).rejects.toThrow(
      /not found/,
    );
  });

  it('dispatches every resource kind, and reports absent data as not-found', async () => {
    // Every kind now has a reader, so asking for one that is not in the
    // mounted data must fail as "not in the game data" rather than as "this
    // client cannot read it" — the two mean different things and only the
    // second is worth falling back to a server for.
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'res.bin': buildPack([]) })).id);

    for (const id of [
      { kind: 'model', path: 'model/a.bdae' },
      { kind: 'skeleton', path: 'model/a.bdae' },
      { kind: 'animation', path: 'a.bdae', modelPath: 'b.bdae' },
    ] as const) {
      const err = await provider.load(id as never).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ResourceNotFoundError);
      expect(err).not.toBeInstanceOf(ResourceUnsupportedError);
    }
  });

  it('serves a zone as a label and a spawn point, not as a lump of ground', async () => {
    // A zone is not a load unit. What it carries is where you arrive and
    // what the weather is.
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'tables.bin': buildTablesPack() })).id);

    const zone = await provider.load({ kind: 'zone', zoneId: 5 });
    expect(zone.info.name).toBe('Test Vale');
    expect(zone.spawn).toEqual([0, 0]);
    expect(zone.info.atmosphere.fogNear).toBe(30);
    expect(zone.info.atmosphere.skybox).toBe('city_sky.bdae');
    expect(zone).not.toHaveProperty('terrain');
    expect(zone).not.toHaveProperty('placements');
  });

  it('files each spawn under the tile it stands on, and only that tile', async () => {
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'tables.bin': buildTablesPack() })).id);

    // The fixture's static stands at (1, 2, 3) and its creature at (5, 6, 7):
    // both inside tile 0,0 of the 64-unit grid.
    const here = await provider.load({ kind: 'tile', mapId: 13, tx: 0, tz: 0 });
    const models = here.placements.map(p => p.model).sort();
    expect(models).toContain('model/scene/tree.bdae');
    expect(models).toContain('model/npc/wolf.bdae');

    // A tile with nothing on it is empty, not a scan of the whole map.
    const elsewhere = await provider.load({ kind: 'tile', mapId: 13, tx: 5, tz: 5 });
    expect(elsewhere.placements).toEqual([]);
    expect(elsewhere.tile).toEqual([5, 5]);
  });

  it('places spawn-table objects on a map whose tile pack is absent', async () => {
    // test_vale.bin is not in this fixture. The ground is missing, which is
    // honest; the objects the server places are not the map pack's to supply.
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'tables.bin': buildTablesPack() })).id);

    const tile = await provider.load({ kind: 'tile', mapId: 13, tx: 0, tz: 0 });
    expect(tile.terrain).toBeNull();
    expect(tile.placements.length).toBeGreaterThan(0);
  });

  it('gives a player-kind network body a fallback model when its displayInfoId names no row', async () => {
    // The fixture's own creaturedisplayinfo only carries id 300 (the wolf's).
    // A remote player whose character record carries an unmodelled or
    // placeholder displayInfoId must still get a body — see
    // `FALLBACK_PLAYER_MODEL_PATH`'s own doc comment for why silently
    // dropping the spawn is the actual bug this pins.
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'tables.bin': buildTablesPack() })).id);

    const look = await provider.load({
      kind: 'networkAppearance',
      entry: 0,
      displayInfoId: 999999,
      race: 0,
      gender: 1,
      skin: 0,
      face: 0,
      hairStyle: 0,
      hairColor: 0,
      equipment: [],
      animationId: 0,
    });

    expect(look.model).toBe('model/npc/character/human/male/human_m_h.bdae');
  });

  it('still fails a creature entry whose displayInfoId names no row', async () => {
    // A creature is a real, catalogued spawn — an unresolvable one is a data
    // gap worth surfacing, not something to paper over with a human body.
    const provider = new PackAssetProvider();
    await provider.useSource(provider.offer(ipaFile({ 'tables.bin': buildTablesPack() })).id);

    await expect(
      provider.load({
        kind: 'networkAppearance',
        entry: 999999,
        displayInfoId: 0,
        race: 0,
        gender: 0,
        skin: 0,
        face: 0,
        hairStyle: 0,
        hairColor: 0,
        equipment: [],
        animationId: 0,
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('will not serve anything before a source is mounted', async () => {
    const provider = new PackAssetProvider();
    await provider.init();
    await expect(provider.load({ kind: 'zoneIndex' })).rejects.toBeInstanceOf(
      ProviderNotReadyError,
    );
  });

  it('does not mistake Apple zip metadata for a game pack', async () => {
    // META-INF/com.apple.FixedZipMetadata.bin ships in every real .ipa, is the
    // *smallest* .bin in the bundle, and is not ZIP-shaped. Treating it as a
    // pack makes anything that reaches for "a pack" reach for it first.
    const lib = await Library.mount(
      ipaFile({
        'tables.bin': buildTablesPack(),
        'res.bin': buildPack([]),
      }),
    );
    const names = lib.info().packs.map(p => p.name);
    expect(names).toContain('tables.bin');
    expect(names).toContain('res.bin');
    expect(names).not.toContain('com.apple.fixedzipmetadata.bin');
    expect(lib.hasPack('com.apple.FixedZipMetadata.bin')).toBe(false);
  });

  it('rejects a file with no packs in it', async () => {
    const provider = new PackAssetProvider();
    const notAnIpa = new File(
      [buildPack([{ name: 'readme.txt', data: text('hi') }], 0x04034b50) as BlobPart],
      'x.ipa',
    );
    await expect(provider.useSource(provider.offer(notAnIpa).id)).rejects.toThrow(/no \.bin packs/);
  });
});
