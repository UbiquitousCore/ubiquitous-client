interface MarkerRef {
  id: string;
}

interface IconEntity {
  interactionIcon?: string;
}

/** Icon refs needed for map markers, in warm-up order. */
export function collectMapIconRefs(
  serviceMarkers: readonly MarkerRef[],
  entities: ReadonlyMap<number, IconEntity>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (ref: string | undefined): void => {
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    out.push(ref);
  };
  for (const marker of serviceMarkers) push(entities.get(Number(marker.id))?.interactionIcon);
  return out;
}

/** Icon refs not already cached. */
export function uncachedIconRefs(
  refs: readonly string[],
  cached: ReadonlyMap<string, string>,
): string[] {
  return refs.filter(ref => !cached.has(ref));
}
