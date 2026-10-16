import type { TerrainTileData } from '../assets/types';

/**
 * Ground within this reach of a hidden object loses its colour cast. Own choice:
 * on the city map 6-12% of ground within 20 units of a festival object carries a
 * warm cast against 0.5% beyond 50, so the cast belongs to the decoration.
 */
const NEUTRAL_REACH = 24;

/** Fully neutral inside this distance, fading out to nothing at the reach. */
const NEUTRAL_FULL = 12;

/** One packed RGB565 colour with its cast blended away by `weight`, keeping its brightness. */
function neutral(packed: number, weight: number): number {
  const r = ((packed >> 11) & 31) << 3;
  const g = ((packed >> 5) & 63) << 2;
  const b = (packed & 31) << 3;
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (c: number): number => c + (grey - c) * weight;
  return (
    ((Math.round(mix(r)) >> 3) << 11) | ((Math.round(mix(g)) >> 2) << 5) | (Math.round(mix(b)) >> 3)
  );
}

/**
 * The tile with its baked colour cast removed around objects the server left
 * out. The map's own tint was baked with the festival decorations in place, so
 * hiding them leaves their glow on bare ground; brightness is kept so the
 * shading still reads. A tile nothing hidden stands near comes back as it is.
 */
export function neutraliseTint(
  tile: TerrainTileData,
  hidden: ReadonlyArray<readonly [number, number, number]>,
): TerrainTileData {
  if (!tile.colours || hidden.length === 0) return tile;
  const [ox, oz] = tile.origin;
  const near = hidden.filter(
    ([x, , z]) =>
      x > ox - NEUTRAL_REACH &&
      x < ox + tile.tileSize + NEUTRAL_REACH &&
      z > oz - NEUTRAL_REACH &&
      z < oz + tile.tileSize + NEUTRAL_REACH,
  );
  if (near.length === 0) return tile;

  const colours = Uint16Array.from(tile.colours);
  const step = tile.tileSize / (tile.side - 1);
  for (let row = 0; row < tile.side; row++) {
    for (let col = 0; col < tile.side; col++) {
      const x = ox + col * step;
      const z = oz + row * step;
      let closest = Infinity;
      for (const [hx, , hz] of near) closest = Math.min(closest, Math.hypot(hx - x, hz - z));
      const weight = Math.min(
        1,
        Math.max(0, (NEUTRAL_REACH - closest) / (NEUTRAL_REACH - NEUTRAL_FULL)),
      );
      if (weight === 0) continue;
      const i = row * tile.side + col;
      colours[i] = neutral(colours[i]!, weight);
    }
  }
  return { ...tile, colours };
}
