/**
 * The team screen on the shipped panel: leader, members, invite and leave
 * (loot rules are not on the wire, so left out). A second page resets
 * dungeons and picks Normal or Legend, leader only, confirmed first.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { DungeonMode, RosterMember } from '../../net/GameConnection';
import type { PiecePart } from '../art/piecePlan';
import type { ComboSpec, ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornRow } from '../art/WornRow';
import { listSlice, rowsIn } from '../art/wornList';
import { unavailableFaces } from '../art/wornState';
import { player, target } from '../hudStore';
import { partyActions, partyRoster, removalBy } from '../partyStore';
import { dungeonMode, instanceActions } from '../instanceStore';
import { ArtAskBox } from './ArtAskBox';

/** Our name for this screen. The spec says which dialog wears it. */
export const TEAM_SCREEN = 'team';

/** Our name for the question asked before the dungeons are reset. */
const DUNGEON_RESET_ASK = 'dungeonResetAsk';

/** Our name for the question asked before the dungeon mode is changed. */
const DUNGEON_MODE_ASK = 'dungeonModeAsk';

/** Which page the screen shows. */
type TeamPage = 'team' | 'dungeon';

/** The screen stands in a row beside the bar, not at a place on a stage. */
const ROW = { unplaced: true } as const;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

const NOBODY: readonly RosterMember[] = [];

/** The smallest box holding both parts, for a control that spans two. */
function around(one: PiecePart, other: PiecePart): PiecePart {
  const x = Math.min(one.box.x, other.box.x);
  const y = Math.min(one.box.y, other.box.y);
  const w = Math.max(one.box.x + one.box.w, other.box.x + other.box.w) - x;
  const h = Math.max(one.box.y + one.box.h, other.box.y + other.box.h) - y;
  return { ...one, box: { x, y, w, h } };
}

/** Who the kick dropdown offers: the rest of the party, open to any member (the leader removes, others vote). */
export function kickChoice(
  spec: Pick<ScreenSpec, 'combos'>,
  members: readonly RosterMember[],
  selfName: string | undefined,
): { combo: ComboSpec | undefined; members: readonly RosterMember[]; can: boolean } {
  const combo = spec.combos?.find(one => one.of === 'member');
  if (!combo) return { combo, members, can: members.length > 0 };
  const others = members.filter(member => member.name !== selfName);
  const inIt = members.some(member => member.name === selfName);
  return { combo, members: others, can: others.length > 0 && inIt };
}

/**
 * The team page's Invite and Quit, each with its words, that the player's
 * standing leaves off: Quit until there is a team to quit, Invite for a
 * member who does not lead it.
 * Own choice: who may invite and quit, which the original has not been checked for.
 */
export function teamControlsOff(
  spec: Pick<ScreenSpec, 'groups'>,
  standing: { inParty: boolean; leads: boolean },
): string[] {
  const groups = spec.groups ?? {};
  return [
    ...(standing.inParty ? [] : [groups.quit, groups.quitWords]),
    ...(standing.leads ? [] : [groups.invite, groups.inviteWords]),
  ].filter((path): path is string => Boolean(path));
}

export interface ArtTeamWindowProps {
  onClose(): void;
}

export function ArtTeamWindow(props: ArtTeamWindowProps): JSX.Element | null {
  const spec = useWornScreen(TEAM_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({ onClose, spec }: ArtTeamWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const roster = partyRoster.value;
  const actions = partyActions();
  const list = spec.lists?.members;
  const inParty = roster.partyId !== null;
  /** Whom the control that brings someone in would ask. */
  const asking = target.value?.name ?? '';
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<TeamPage>('team');
  const [askingReset, setAskingReset] = useState(false);
  const resetAsk = useWornScreen(DUNGEON_RESET_ASK);
  /** The mode the arrows have stepped to, which Save asks the server for. */
  const [stepped, setStepped] = useState<DungeonMode>(dungeonMode.value);
  const [askingMode, setAskingMode] = useState(false);
  const modeAsk = useWornScreen(DUNGEON_MODE_ASK);
  const kick = kickChoice(spec, roster.members, player.value?.name);
  /** On their own, or leading: the dungeons are theirs to reset. */
  const leads = !inParty || roster.members.some(m => m.isLeader && m.name === player.value?.name);
  /** The parts of the page not showing, and what belongs to that page alone. */
  const otherPage = page === 'team' ? spec.panels?.dungeon : spec.panels?.team;
  const teamOnly = page === 'dungeon' ? Object.values(spec.groups ?? {}) : [];
  const listing = kick.combo && !(open && kick.can) ? NOBODY : kick.members;
  /** The leader line and the kick dropdown, which belong to a team you are in. */
  const partyOnly = inParty ? [] : (spec.partyOnly ?? []);
  const standingOff = teamControlsOff(spec, { inParty, leads });

  const columnsOf = (member: RosterMember): Record<string, string> => ({ name: member.name });

  const sliceOf = (whole: readonly PiecePart[]) =>
    listSlice(whole, { list, items: listing, scroll: 0, values: columnsOf });

  const faces = unavailableFaces(spec, {
    invite: asking.length > 0,
    quit: inParty,
    resetDungeons: leads,
  });

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    whole => ({
      shown: [...(spec.shown ?? []), ...faces.shown],
      hidden: [
        ...(spec.hidden ?? []),
        ...faces.hidden,
        ...(otherPage ? [otherPage] : []),
        ...teamOnly,
        ...partyOnly,
        ...standingOff,
        ...sliceOf(whole).hidden,
        // The note for a party you are not in, which only shows while you
        // are not in one.
        ...(inParty && spec.emptyNote ? [spec.emptyNote] : []),
        // The dropdown's list, and the frame it pops up in, while it is shut.
        ...(kick.combo && listing.length === 0 ? [kick.combo.list] : []),
      ],
    }),
    ROW,
  );
  const slice = sliceOf(worn.whole);
  const rows = rowsIn(worn.parts, slice);

  if (!worn.image || !worn.frame) return null;

  const leaderName = roster.members.find(member => member.isLeader)?.name ?? '';
  const named = worn.fieldOf(worn.find(spec.values?.leader));
  const resetDungeons = (): void => {
    setAskingReset(false);
    instanceActions().resetDungeons();
  };
  const chooseMode = (): void => {
    setAskingMode(false);
    instanceActions().chooseDungeonMode(stepped);
  };
  const modeField = worn.fieldOf(worn.find(spec.values?.dungeonMode));
  const modeWord = spec.words?.[stepped] ?? '';

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Team"
      className="touch-none overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="relative block h-full w-auto"
        draggable={false}
      />

      <WornCaptions
        worn={worn}
        spec={spec}
        tone={LIGHT}
        hidden={[...(otherPage ? [otherPage] : []), ...teamOnly, ...partyOnly, ...standingOff]}
      />

      {page === 'team' && named && leaderName ? (
        <span style={worn.words(named, INK)}>{leaderName}</span>
      ) : null}

      {page === 'dungeon' && modeField && modeWord ? (
        <span style={worn.words(modeField, LIGHT)}>{modeWord}</span>
      ) : null}

      {/* The dropdown that lists whom the leader can put out. */}
      {page === 'team' &&
        inParty &&
        kick.combo &&
        (() => {
          const control = worn.find(kick.combo.control);
          const value = worn.find(kick.combo.value);
          const over = control && value ? around(control, value) : (control ?? value);
          return over ? (
            <button
              type="button"
              aria-label="Choose someone to kick out"
              aria-expanded={open && kick.can}
              disabled={!kick.can}
              onClick={() => setOpen(was => !was)}
              style={worn.box(over)}
              className={HIT}
            />
          ) : null;
        })()}

      {/* Pressing a name asks for them to be removed, which is what this
          section of the screen is for. */}
      {rows.map(({ row, item }) => (
        <button
          key={row.path}
          type="button"
          aria-label={`Kick out ${item.name}`}
          onClick={() => {
            setOpen(false);
            const how = removalBy(roster.members, player.value?.name, item.networkId);
            if (how === 'kick') actions.kick(item.networkId);
            else if (how === 'vote') actions.voteKick(item.networkId);
          }}
          style={worn.box(row)}
          className={HIT}
        />
      ))}

      {list &&
        rows.map(({ row, fields, item }) => (
          <WornRow
            key={`${row.path}.words`}
            worn={worn}
            fields={fields}
            list={list}
            values={columnsOf(item)}
            tone={INK}
            styleOf={() => (item.isLeader ? 'font-semibold' : undefined)}
          />
        ))}

      {/* The two pages' tabs, and resetting the dungeons. */}
      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        if (!part) return null;
        if (what === 'teamPage' || what === 'dungeonPage') {
          const to: TeamPage = what === 'teamPage' ? 'team' : 'dungeon';
          return (
            <button
              key={where}
              type="button"
              role="tab"
              aria-selected={page === to}
              aria-label={to === 'team' ? 'Team' : 'Dungeon'}
              onClick={() => setPage(to)}
              style={worn.box(part)}
              className={HIT}
            />
          );
        }
        if (what === 'resetDungeons') {
          if (page !== 'dungeon') return null;
          return (
            <button
              key={where}
              type="button"
              aria-label="Reset all dungeons"
              disabled={!leads}
              onClick={() => (resetAsk ? setAskingReset(true) : resetDungeons())}
              style={worn.box(part)}
              className={HIT}
            />
          );
        }
        if (what === 'otherMode') {
          if (page !== 'dungeon') return null;
          const other: DungeonMode = stepped === 'normal' ? 'legend' : 'normal';
          return (
            <button
              key={where}
              type="button"
              aria-label={`Switch to ${spec.words?.[other] ?? other}`}
              disabled={!leads}
              onClick={() => setStepped(other)}
              style={worn.box(part)}
              className={HIT}
            />
          );
        }
        if (what === 'saveMode') {
          if (page !== 'dungeon') return null;
          const changes = stepped !== dungeonMode.value;
          return (
            <button
              key={where}
              type="button"
              aria-label="Save the dungeon mode"
              disabled={!leads || !changes}
              onClick={() => (modeAsk ? setAskingMode(true) : chooseMode())}
              style={worn.box(part)}
              className={HIT}
            />
          );
        }
        if (page !== 'team') return null;
        if (standingOff.includes(where)) return null;
        const can = what === 'invite' ? asking.length > 0 : inParty;
        // Said by the button itself: the screen's own words for these two
        // sit across the paper's edge above them, and are left off.
        const label =
          what === 'invite'
            ? asking
              ? `Invite ${asking}`
              : 'Invite whoever you have targeted'
            : 'Leave the party';
        return (
          <button
            key={where}
            type="button"
            aria-label={label}
            title={label}
            disabled={!can}
            onClick={() => {
              if (!can) return;
              if (what === 'invite') actions.inviteTarget();
              else actions.leave();
            }}
            style={worn.box(part)}
            className={HIT}
          />
        );
      })}

      {askingReset ? (
        <ArtAskBox
          screen={DUNGEON_RESET_ASK}
          label="Reset all dungeons"
          acceptLabel="Yes"
          onAccept={resetDungeons}
          onDecline={() => setAskingReset(false)}
        />
      ) : null}

      {askingMode ? (
        <ArtAskBox
          screen={DUNGEON_MODE_ASK}
          label="Change the dungeon mode"
          acceptLabel="Yes"
          onAccept={chooseMode}
          onDecline={() => setAskingMode(false)}
        />
      ) : null}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the team screen"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}
