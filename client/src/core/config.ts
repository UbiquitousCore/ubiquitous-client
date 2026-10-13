/**
 * Client configuration. Values are read once at boot so nothing deeper in the
 * client reaches for `import.meta.env` or the URL bar.
 */

import type { LogLevel } from './log';

export interface ClientConfig {
  /**
   * Zone to open on boot, by name, when no server places the player. Null
   * leaves the choice to the data: the first top-level zone with scenery.
   */
  defaultZoneName: string | null;
  /** Explicit zone id, which wins over the name when set. */
  defaultZoneId: number | null;
  logLevel: LogLevel;
  /** Tiles across the window, or null for the graphics setting; set, it pins the window (`?tiles=`). */
  tileWindow: number | null;
  /**
   * Play animations. `?anim=0` holds every character at its bind pose, which
   * separates "the skinning is wrong" from "the animation is wrong" — the two
   * look identical on screen.
   */
  animate: boolean;
  /**
   * Draw the collision geometry as wireframe. `?collision=1` answers "is the
   * geometry where the models are?", which no amount of console output does.
   */
  collisionDebug: boolean;
}

const DEFAULTS: ClientConfig = {
  defaultZoneName: null,
  defaultZoneId: null,
  logLevel: 'info',
  tileWindow: null,
  animate: true,
  collisionDebug: false,
};

/** Reads overrides from the query string, e.g. `?zone=471&log=debug`. */
export function loadConfig(search = ''): ClientConfig {
  const q = new URLSearchParams(search);
  const cfg: ClientConfig = { ...DEFAULTS };
  // `?zone=` takes either a name or an id; ids are unambiguous, names are not
  // (the 2.2.0 build has two distinct zones sharing one name).
  const zone = q.get('zone');
  if (zone) {
    const asId = Number(zone);
    if (Number.isInteger(asId) && asId > 0) cfg.defaultZoneId = asId;
    else cfg.defaultZoneName = zone;
  }
  const log = q.get('log');
  if (log === 'debug' || log === 'info' || log === 'warn' || log === 'error') {
    cfg.logLevel = log;
  }
  if (q.get('anim') === '0') cfg.animate = false;
  if (q.get('collision') === '1') cfg.collisionDebug = true;
  const tiles = Number(q.get('tiles'));
  if (Number.isFinite(tiles) && tiles >= 3) cfg.tileWindow = tiles;
  return cfg;
}
