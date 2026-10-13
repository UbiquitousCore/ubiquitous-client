import type { ZoneInfo } from '../../../assets/types';
import type { CharacterSummary } from '../../../net/GameConnection';
import type { LoadStage } from '../../../world/World';

/** The progress bar's colour: the destination's fog, as a CSS colour. */
export function fogAccent(fogColor: readonly [number, number, number]): string {
  const [r, g, b] = fogColor;
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/** Where on the ground the zone's soundscape is chosen for: the arrival point when it is on this map, else the zone's centre. */
export function soundscapePoint(
  zone: Pick<ZoneInfo, 'mapId' | 'centre'>,
  spawn: { mapId: number; position: readonly [number, number, number] } | null,
): [number, number] {
  const arriving = spawn?.mapId === zone.mapId ? spawn.position : null;
  return arriving ? [arriving[0], arriving[2]] : [zone.centre[0], zone.centre[1]];
}

/** What to ask the asset layer for to put the chosen character's own body in the zone. */
export function characterAppearanceRequest(character: CharacterSummary) {
  return {
    entry: 0,
    displayInfoId: character.displayInfoId,
    race: character.race,
    gender: character.gender,
    skin: character.appearance.skin,
    face: character.appearance.face,
    hairStyle: character.appearance.hairStyle,
    hairColor: character.appearance.hairColour,
    equipment: character.equipment,
    animationId: 0,
  };
}

/** The loading line for the world's own stages, and how far along the bar sits. */
export function stageProgress(
  stage: LoadStage,
  zoneName: string,
  tileCount: number,
): { text: string; fraction: number } {
  return stage === 'zone'
    ? { text: `Loading ${zoneName} — ground`, fraction: 0.2 }
    : { text: `Loading ${zoneName} — ${tileCount} tiles`, fraction: 0.5 };
}

/** What the loading screen has seen of the renderer catching up with the zone. */
export interface BuildReading {
  zoneName: string;
  /** Entities in the world when the wait began. */
  entities: number;
  /** Attachments pending when the wait began. */
  attachments: number;
  /** Textures pending at the first reading. */
  textures: number;
  pendingAttachments: number;
  pendingTextures: number;
  /** Attachments finished since the wait began. */
  attachedSince: number;
}

/**
 * One reading of the wait for the renderer. It has drained once nothing waits
 * to attach, or enough have attached that the rest can finish behind the
 * game: the queue sits near its budget until the very end, so a count of
 * what is pending alone would hold the screen for tens of seconds.
 */
export function buildStep(
  reading: BuildReading,
  settleThreshold: number,
): { drained: boolean; text: string; fraction: number } {
  const drained = reading.pendingAttachments === 0 || reading.attachedSince >= settleThreshold;
  const attachFraction =
    reading.attachments > 0 ? 1 - reading.pendingAttachments / reading.attachments : 1;
  const textureFraction = reading.textures > 0 ? 1 - reading.pendingTextures / reading.textures : 1;
  return {
    drained,
    text:
      `Building ${reading.zoneName} — ${reading.entities} objects` +
      (reading.pendingAttachments > 0 ? `, ${reading.pendingAttachments} pending` : ''),
    fraction: 0.6 + 0.35 * Math.min(attachFraction, textureFraction),
  };
}
