/**
 * The people screen: guild, friends and ignored tabs as last sent. A
 * friend's row offers a whisper, a team invitation and removal; another
 * row's menu removes the person. The bottom control adds or invites.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornEdit } from '../art/WornEdit';
import { WornRow } from '../art/WornRow';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';
import { LINES, say } from '../gameLines';
import { guildActions, guildRoster } from '../guildStore';
import { target, worldUnits } from '../hudStore';
import type { SocialListMember } from '../socialListStore';
import { fill } from '../art/wornWords';
import {
  addFriend,
  addFriendNamed,
  addIgnore,
  friends,
  ignored,
  removeFriend,
  removeIgnore,
} from '../socialListStore';
import { ArtPlayerLinkMenu } from './ArtPlayerLinkMenu';
import type { PlayerLinkAction } from './ArtPlayerLinkMenu';
import { ArtRowMenu } from './ArtRowMenu';
import { beginWhisper, whisperTargetOfNetworkId } from '../chatStore';
import { partyActions } from '../partyStore';

/** Our name for this screen. The spec says which dialog wears it. */
export const SOCIAL_SCREEN = 'social';

/** The list stands in a row beside the bar, not at a place on a stage. */
const ROW = { unplaced: true } as const;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

/** One person as a row reads them. */
interface Person {
  id: number;
  name: string;
  /** Whether the guild answers to them, which decides what can be asked. */
  leads: boolean;
  /** On the friend and ignore lists: who they are, or that they are offline, and where. */
  line?: string;
  where?: string;
  away?: boolean;
}

export interface ArtSocialWindowProps {
  onClose(): void;
}

export function ArtSocialWindow(props: ArtSocialWindowProps): JSX.Element | null {
  const spec = useWornScreen(SOCIAL_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({ onClose, spec }: ArtSocialWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const scroll = useListScroll();
  const tabs = spec.tabs ?? [];
  const [open, setOpen] = useState(tabs[0]?.panel ?? '');
  const [chosen, setChosen] = useState<number | null>(null);
  const [beside, setBeside] = useState<{ x: number; y: number } | null>(null);
  /** The name being typed into the box along the bottom. */
  const [typed, setTyped] = useState('');
  const list = spec.lists?.people;
  const roster = guildRoster.value;
  const actions = guildActions();

  // A friend in the world reads by name, level,
  // race and class, with the zone under it; one who is not, by name and
  // the word for offline, greyed.
  const listed = (members: readonly SocialListMember[]): Person[] =>
    members.map(member => {
      const classWord =
        member.classId && spec.names?.classes
          ? (spec.names.classes[(member.classId - 1) * 2 + (member.gender ?? 0)] ?? '')
          : '';
      const line = member.online
        ? fill(
            spec.words?.friendRow ?? say(LINES.friendRow),
            member.name,
            member.level ?? 0,
            member.raceName ?? '',
            classWord,
          ).replace(/\s+$/, '')
        : `${member.name} - ${spec.words?.offline ?? say(LINES.offline)}`;
      return {
        id: member.networkId,
        name: member.name,
        leads: false,
        line,
        ...(member.online && member.zoneName ? { where: member.zoneName } : {}),
        away: !member.online,
      };
    });
  const people: Person[] =
    open === 'friends'
      ? listed(friends.value)
      : open === 'ignored'
        ? listed(ignored.value)
        : // Whichever tab is not one of the two lists is the guild's.
          roster.members.map(member => ({
            id: member.networkId,
            name: member.name,
            leads: member.isLeader === true,
          }));
  const picked = people.find(person => person.id === chosen) ?? null;

  const columnsOf = (person: Person): Record<string, string> => ({ name: person.name });

  const sliceOf = (whole: readonly PiecePart[]) =>
    listSlice(whole, { list, items: people, scroll: scroll.at, values: columnsOf });

  /** Whom the bottom control would ask, where there is anyone to ask. */
  const asking = target.value?.name ?? '';

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    whole => {
      // The tab whose list is showing wears its lit face; the rest wear
      // the one they were drawn in.
      const faces = Object.fromEntries(
        tabs.map(tab => [tab.control, tab.panel === open ? (spec.faces?.[tab.control] ?? 1) : 0]),
      );
      const slice = sliceOf(whole);
      const lit = slice.keptRows.find((_path, at) => slice.shown[at]?.id === chosen);
      return {
        frames: faces,
        shown: [...(spec.shown ?? []), ...(lit ? [lit] : [])],
        hidden: [
          ...(spec.hidden ?? []),
          ...slice.hidden,
          // The note for an empty list, which only an empty list shows.
          ...(people.length && spec.emptyNote ? [spec.emptyNote] : []),
          // Every row draws the backing the screen lights the picked one
          // with. Drawn as shipped, every row reads as the picked one.
          ...(list?.chosen
            ? slice.keptRows
                .map(path => `${path}/${list.chosen}`)
                .filter(path => !lit || !path.startsWith(`${lit}/`))
            : []),
        ],
      };
    },
    ROW,
  );
  const slice = sliceOf(worn.whole);
  const rows = rowsIn(worn.parts, slice);

  if (!worn.image || !worn.frame) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="People"
      className="touch-none overflow-hidden"
      style={worn.placed}
      {...listGestures(worn, list, slice, scroll)}
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
        styleOf={where => {
          const tab = tabs.find(one => one.text === where);
          if (!tab || tab.panel !== open) return undefined;
          return tab.openTone ? { color: tab.openTone } : undefined;
        }}
      />

      {/* The tabs, each opening its own list. */}
      {tabs.map(tab => {
        const part = worn.find(tab.control);
        return part ? (
          <button
            key={tab.control}
            type="button"
            aria-current={tab.panel === open ? 'true' : undefined}
            aria-label={tab.caption || tab.panel}
            onClick={() => {
              setOpen(tab.panel);
              setChosen(null);
            }}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}

      {rows.map(({ row, item }) => (
        <button
          key={row.path}
          type="button"
          aria-current={item.id === chosen ? 'true' : undefined}
          aria-label={item.name}
          onClick={(event: MouseEvent) => {
            const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
            setBeside({ x: on.right, y: on.top });
            setChosen(current => (current === item.id ? null : item.id));
          }}
          style={worn.box(row)}
          className={HIT}
        />
      ))}

      {/* A friend or ignored row: its own two lines in the row's own field. */}
      {rows.map(({ row, fields, item }) => {
        if (item.line === undefined) return null;
        const field = worn.fieldOf(
          fields.find(part => part.path.endsWith(`/${list?.fields.name ?? ''}`)),
        );
        if (!field) return null;
        return (
          <span
            key={`${row.path}.line`}
            style={{ ...worn.words(field, INK, true), display: 'block' }}
          >
            <span className="block" style={item.away ? { color: spec.tones?.offline } : undefined}>
              {item.line}
            </span>
            {item.where ? (
              <span className="block" style={{ color: spec.tones?.zone }}>
                {item.where}
              </span>
            ) : null}
          </span>
        );
      })}

      {list &&
        rows
          .filter(({ item }) => item.line === undefined)
          .map(({ row, fields, item }) => (
            <WornRow
              key={`${row.path}.words`}
              worn={worn}
              fields={fields}
              list={list}
              values={columnsOf(item)}
              tone={INK}
              styleOf={() => (item.leads ? 'font-semibold' : undefined)}
            />
          ))}

      {/* The line a name is written on. */}
      {Object.entries(spec.edits ?? {}).map(([where, edit]) => {
        const part = worn.find(where);
        return part ? (
          <WornEdit
            key={where}
            worn={worn}
            part={part}
            name={edit.holds}
            value={typed}
            max={edit.max}
            tone={INK}
            onInput={said => setTyped(said)}
          />
        ) : null;
      })}

      {/* Asking someone in. A friend is added by name; otherwise a name is
          looked for among the people in sight, and with the box empty it
          asks whoever has been singled out in the world. */}
      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        if (!part) return null;
        const word = spec.words?.[what];
        const named = typed.trim();
        const found = named
          ? worldUnits.value.find(unit => unit.name?.toLowerCase() === named.toLowerCase())
          : null;
        // A friend is taken on by name wherever they are; the server knows
        // every character, in the world or not.
        const can = named
          ? open === 'friends' || (found !== undefined && found !== null)
          : asking.length > 0;
        return (
          <button
            key={where}
            type="button"
            aria-label={
              named
                ? `${word || what}: ${named}`
                : asking
                  ? `${word || what}: ${asking}`
                  : word || what
            }
            disabled={!can}
            onClick={() => {
              if (!can) return;
              // The same control adds to whichever list is open: the
              // guild asks them in, the other two take them on at once.
              if (open === 'friends' && named) addFriendNamed(named);
              else if (open === 'friends' || open === 'ignored') {
                const who = named ? found?.id : target.value?.id;
                if (who) (open === 'friends' ? addFriend : addIgnore)(who);
              } else if (named) actions.inviteNamed(named);
              else actions.inviteTarget();
              setTyped('');
            }}
            style={worn.box(part)}
            className={HIT}
          />
        );
      })}

      {/* What can be asked about the person picked out. The server is the
          one that decides whether it is allowed, and says so. */}
      {picked && open === 'friends' ? (
        <ArtPlayerLinkMenu
          beside={beside}
          actions={friendActions(picked, spec, () => setChosen(null))}
          onClose={() => setChosen(null)}
        />
      ) : null}

      {picked &&
      open !== 'friends' &&
      (open === 'ignored' ? spec.words?.remove : spec.words?.kick) ? (
        <ArtRowMenu
          beside={beside}
          says={
            (open === 'friends' || open === 'ignored' ? spec.words?.remove : spec.words?.kick) ?? ''
          }
          onPick={() => {
            if (open === 'ignored') removeIgnore(picked.id);
            else actions.kick(picked.id);
            setChosen(null);
          }}
          onClose={() => setChosen(null)}
        />
      ) : null}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the people list"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}

/** What a friend's row offers: a word and an invitation while they are in the world, and always their removal. */
export function friendActions(
  friend: Pick<Person, 'id' | 'name' | 'away'>,
  spec: Pick<ScreenSpec, 'words'>,
  done: () => void,
): PlayerLinkAction[] {
  const then = (act: () => void) => () => {
    act();
    done();
  };
  const remove = {
    label: spec.words?.remove ?? 'Remove',
    onPick: then(() => removeFriend(friend.id)),
  };
  if (friend.away) return [remove];
  return [
    {
      label: spec.words?.whisper ?? 'Whisper',
      onPick: then(() => beginWhisper(whisperTargetOfNetworkId(friend.id), friend.name)),
    },
    {
      label: spec.words?.teamInvite ?? 'Invite',
      onPick: then(() => partyActions().invite(friend.id)),
    },
    remove,
  ];
}
