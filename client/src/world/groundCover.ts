/**
 * Grass is authored at heights that miss the drawn ground: measured against
 * the terrain in one map, about 1 in 70 `human_grass04` blades hover up to 40
 * units above it and about 1 in 90 are buried. Plants named grass are
 * therefore stood on the terrain wherever it is known.
 */
export function isGroundCover(model: string): boolean {
  return /(^|[/_])grass\d*(_\d+)?\.bdae$/i.test(model);
}

/** The height a blade is drawn at: the terrain under it, or its own where the terrain is unknown. */
export function coverHeight(model: string, authored: number, ground: number | null): number {
  return ground !== null && isGroundCover(model) ? ground : authored;
}
