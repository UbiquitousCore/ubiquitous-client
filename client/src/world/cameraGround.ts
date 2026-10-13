/**
 * Where a camera boom first dips under terrain, or null (buildings are
 * collision). Bisected within the first step that goes under; short steps,
 * since narrow ridges can slip between them.
 */
export function groundHitDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  heightAt: (x: number, z: number) => number | null,
  clearance: number,
  stepLength = 0.5,
): number | null {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (length < 1e-6) return null;
  const steps = Math.max(1, Math.ceil(length / stepLength));
  /** Height of the boom above the clearance line at fraction t; negative is under. */
  const above = (t: number): number | null => {
    const ground = heightAt(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t);
    return ground === null ? null : a[1] + (b[1] - a[1]) * t - (ground + clearance);
  };
  let previous = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const h = above(t);
    if (h !== null && h < 0) {
      // Bisect inside the step: the distance then varies continuously as the
      // player moves, where the step boundary alone would make it jump.
      let lo = previous;
      let hi = t;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        const m = above(mid);
        if (m !== null && m < 0) hi = mid;
        else lo = mid;
      }
      return hi * length;
    }
    previous = t;
  }
  return null;
}
