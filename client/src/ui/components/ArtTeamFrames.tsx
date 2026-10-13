/**
 * The other team members under the hero's frame: name (in their map colour
 * where the spec gives it), health and resource bars while their body is in
 * sight, a leader's mark, greyed when offline. A press targets them.
 */

import type { JSX } from 'preact';

import { barRun, faceFor, shareOf } from '../art/faceRuns';
import type { ScreenSpec } from '../art/uiSpec';
import { useWorn, useWornScreen } from '../art/useWorn';
import { WornPiece } from '../art/WornPiece';
import type { PartyMember } from '../partyStore';
import type { ResourceType, Unit } from '../hudStore';

/** Our name for this screen. The spec says which dialog wears it. */
export const TEAM_FRAMES_SCREEN = 'teamFrames';

/**
 * Where the leader's mark sits against the leader's row, in movie units:
 * past the end of the name, a little above the row's top edge, as observed
 * in play by the owner.
 */
const LEADER_MARK = { dx: 74, dy: -10 };

export interface TeamRow {
  member: PartyMember;
  /** Their body, where it is in sight. */
  unit?: Unit;
}

/** The other members, in roster order, each with their body where it is in sight. */
export function teamRows(
  members: readonly PartyMember[],
  selfName: string | undefined,
  units: readonly Unit[],
): TeamRow[] {
  return members
    .filter(member => member.name !== selfName)
    .map(member => {
      const unit = units.find(one => one.networkId === member.networkId);
      return unit ? { member, unit } : { member };
    });
}

/**
 * The faces a member's row wears: its health bar, and the bar for what the
 * member's class spends, each stepped along the run the movie gives that
 * bar (see `faceRuns.ts`). Every bar here is full at its first face.
 */
export function memberFaces(
  row: string,
  unit: Pick<Unit, 'health' | 'maxHealth' | 'mana' | 'maxMana' | 'resource'>,
  bars: NonNullable<ScreenSpec['bars']>,
): Record<string, number> {
  const faces: Record<string, number> = {};
  const readings: Array<[string | undefined, number]> = [
    [bars.of.health, shareOf(unit.health, unit.maxHealth)],
    [bars.of[unit.resource ?? 'mana'], shareOf(unit.mana, unit.maxMana)],
  ];
  for (const [bar, share] of readings) {
    if (!bar) continue;
    const path = `${row}/${bar}`;
    faces[path] = faceFor(share, barRun(bars, path));
  }
  return faces;
}

export interface ArtTeamFramesProps {
  members: readonly PartyMember[];
  selfName: string | undefined;
  units: readonly Unit[];
  onSelect(unitId: string): void;
}

export function ArtTeamFrames(props: ArtTeamFramesProps): JSX.Element | null {
  const spec = useWornScreen(TEAM_FRAMES_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  members,
  selfName,
  units,
  onSelect,
  spec,
}: ArtTeamFramesProps & { spec: ScreenSpec }): JSX.Element | null {
  const groups = spec.groups ?? {};
  const slots: Array<{ online: string; away?: string }> = [];
  for (let n = 1; groups[`member${n}`]; n++) {
    slots.push({ online: groups[`member${n}`]!, away: groups[`away${n}`] });
  }
  const rows = teamRows(members, selfName, units).slice(0, slots.length);
  const bars = spec.bars;
  const resourceClips = Object.entries(bars?.of ?? {}).filter(([what]) => what !== 'health');

  const hidden: string[] = [...(spec.hidden ?? [])];
  const frames: Record<string, number> = {};
  slots.forEach((slot, at) => {
    const row = rows[at];
    // The greyed row is for a member who has left the world.
    if (slot.away && !(row && !row.member.online)) hidden.push(slot.away);
    if (!row) {
      hidden.push(slot.online);
      return;
    }
    // A member out of the world has no body here, and so no bars.
    const unit = row.member.online ? row.unit : undefined;
    const spends: ResourceType = unit?.resource ?? 'mana';
    for (const [what, clip] of resourceClips) {
      if (!unit || what !== spends) hidden.push(`${slot.online}/${clip}`);
    }
    if (!bars) return;
    const health = bars.of.health;
    if (!unit) {
      if (health) hidden.push(`${slot.online}/${health}`);
      return;
    }
    Object.assign(frames, memberFaces(slot.online, unit, bars));
  });

  const worn = useWorn(spec.dialog, spec.frame, { hidden, frames }, { floats: true });
  if (!rows.length || !worn.image || !worn.frame) return null;
  const frame = worn.frame;
  const pct = (units: number, of: number): string => `${(units / of) * 100}%`;
  const select = Object.entries(spec.actions ?? {}).find(([, does]) => does === 'select')?.[0];
  const leaderAt = rows.findIndex(row => row.member.isLeader);
  const leaderRow = leaderAt >= 0 ? worn.find(slots[leaderAt]!.online) : undefined;

  return (
    <div role="list" aria-label="Team" className="relative" style={worn.sized}>
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={worn.sized}
        draggable={false}
      />
      {rows.map((row, at) => {
        const slot = slots[at]!;
        const name = worn.fieldOf(worn.find(`${slot.online}/${spec.values?.name ?? ''}`));
        const mark = spec.tones?.[`mark${at + 1}`];
        const hit = select ? worn.find(`${slot.online}/${select}`) : worn.find(slot.online);
        return (
          <div key={row.member.networkId} role="listitem">
            {name && (
              <span style={mark ? { ...worn.words(name), color: mark } : worn.words(name)}>
                {row.member.name}
              </span>
            )}
            {hit && (
              <button
                type="button"
                aria-label={row.member.online ? row.member.name : `${row.member.name}, offline`}
                disabled={!row.unit || !row.member.online}
                onClick={() => row.unit && onSelect(row.unit.id)}
                style={worn.box(hit)}
                className="pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-brass-300 disabled:cursor-default"
              />
            )}
          </div>
        );
      })}
      {leaderRow && groups.leader ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: pct(leaderRow.box.x + LEADER_MARK.dx, frame.w),
            top: pct(leaderRow.box.y + LEADER_MARK.dy, frame.h),
          }}
        >
          <WornPiece dialog={spec.dialog} part={groups.leader} />
        </div>
      ) : null}
    </div>
  );
}
