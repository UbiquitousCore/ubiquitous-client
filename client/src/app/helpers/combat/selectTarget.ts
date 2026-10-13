import { stealthSight } from '../../../gameplay/auraState';

interface TargetEntity {
  kind: string;
  networkStealthed?: boolean;
}

interface PickTargetSelectionArgs {
  localId: string;
  entity: TargetEntity | null;
  isOwnBody: boolean;
  onOwnSide: boolean;
  followId: number | null;
}

interface TargetSelection {
  id: number;
  localId: string;
  stopFollow: boolean;
}

/**
 * Whether a tap may select this body, and what side effects that implies.
 */
export function pickTargetSelection(args: PickTargetSelectionArgs): TargetSelection | null {
  const { localId, entity, isOwnBody, onOwnSide, followId } = args;
  const id = Number(localId);
  if (!entity || (entity.kind !== 'creature' && entity.kind !== 'player')) return null;
  if (isOwnBody) return null;
  if (stealthSight(entity.networkStealthed, onOwnSide) === 'hidden') return null;
  return {
    id,
    localId,
    stopFollow: followId !== null && followId !== id,
  };
}
