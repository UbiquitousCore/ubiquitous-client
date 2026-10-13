export function selectViewZone<T>(args: {
  mapOpen: boolean;
  browsed: T | null;
  teleporting: boolean;
  travel: T | null;
  display: T | null;
}): T | null {
  const browsed = args.mapOpen ? args.browsed : null;
  return browsed ?? (args.teleporting ? args.travel : null) ?? args.display;
}
