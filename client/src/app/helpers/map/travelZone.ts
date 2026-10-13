import type { AreaLinks } from '../../../assets/types';

/** Teleport-map region (a sub-area redirects to its parent's network). */
export function topZoneForSubArea(
  displayedZoneId: number | null,
  subAreas: AreaLinks['subAreas'] | undefined,
): number | null {
  if (displayedZoneId === null) return null;
  for (const [parent, links] of Object.entries(subAreas ?? {})) {
    if (links.some(link => link.topZoneId === displayedZoneId)) return Number(parent);
  }
  return null;
}
