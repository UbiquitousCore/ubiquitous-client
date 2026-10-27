/**
 * What the map is made of: the things the game hands it to draw.
 *
 * Plain records with no drawing in them. The map screens read them from
 * `hudStore`, and the helpers under `app/helpers/map` build them.
 */

/** `service` covers every NPC service, all drawn as the NPC's head icon; `member` is a teammate. */
export type MapMarkerKind = 'player' | 'service' | 'quest' | 'teleport' | 'member';

export interface MapMarker {
  id: string;
  label: string;
  position: [number, number, number];
  kind: MapMarkerKind;
  iconUrl?: string | null;
  /** For a teammate: which of the movie's team colours (1 to 3) they wear. */
  slot?: number;
}

/** A named place on the region map; a travel stop carries its id, and tapping it teleports. */
export interface MapPlace {
  id: number;
  name: string;
  position: [number, number, number];
  /** The marker to hand back when tapped, when this place can be travelled to. */
  teleport?: MapMarker | null;
  /** 2 friendly, 1 neutral, 0 hostile. Colours the name. */
  friendly?: number;
}

/**
 * One region of the world map.
 *
 * `button` is the name the build's layout file gives the region's press area
 * on the world picture; the interface movie says where that area stands.
 */
export interface MapRegion {
  id: number;
  name: string;
  button?: string;
}

/** One leg of the bus network: the two places it joins on the region map. */
export interface MapRouteLeg {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
}

export type MapDirection = 'up' | 'down' | 'left' | 'right';
