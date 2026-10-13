/**
 * The account's characters on the build's screen, with an empty place to
 * make one; the server enforces how many an account may hold.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { CharacterSummary } from '../../net/GameConnection';
import { ArtConfirmDelete, DELETE_SCREEN } from './ArtConfirmDelete';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { PRESSED, WornFace, WornHit, WornPanel, WornSays, useHeld } from './wornBits';
import {
  busy,
  characters,
  frontEndActions,
  justMade,
  setJustMade,
  lookKey,
  portraits,
  setStage,
  startDraft,
} from './frontEndStore';

export const CHARACTERS_SCREEN = 'characters';

/** How many places the movie draws. Not how many an account may fill. */
const PLACES = 5;

export function ArtChooseCharacter(): JSX.Element | null {
  const spec = useWornScreen(CHARACTERS_SCREEN);
  return spec ? <Worn spec={spec} /> : null;
}

function Worn({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const list = characters.value;
  const working = busy.value;
  const taken = portraits.value;
  const [chosen, setChosen] = useState<string | null>(list[0]?.guid ?? null);
  const { hold, faces } = useHeld();
  /** Whether the build carries a box to ask with. */
  const wornAsk = useWornScreen(DELETE_SCREEN) !== null;
  const [doomed, setDoomed] = useState<string | null>(null);
  const standing = list.find(one => one.guid === chosen) ?? null;

  useEffect(() => {
    frontEndActions().preview(standing ? lookOf(standing) : null);
  }, [standing?.guid]);

  useEffect(() => {
    if (chosen === null && list.length > 0) setChosen(list[0].guid);
  }, [list.length]);

  // A character just made is the one the list opens on.
  useEffect(() => {
    const made = justMade.value;
    if (!made) return;
    const fresh = list.find(one => one.name === made);
    if (!fresh) return;
    setChosen(fresh.guid);
    setJustMade(null);
  }, [justMade.value, list.length]);

  // A place shows the character that came out of it, photographed
  // through the camera the model itself carries. Asked for as the list arrives.
  useEffect(() => {
    for (const character of list) frontEndActions().wantPortrait(lookOf(character));
  }, [list.map(one => one.guid).join()]);

  const on = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];
  const slot = spec.grids?.characters?.slot;
  const slotOf = (index: number): string => `${slot}${String(index + 1).padStart(2, '0')}`;
  /** Every place the movie draws, filled or not. */
  const places = Array.from({ length: PLACES }, (_, index) => index);
  const standingAt = list.findIndex(one => one.guid === chosen);

  // The place the character on the dais came from is drawn on its other
  // frame, which shows which one is standing there.
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: spec.shown ?? [],
      frames: {
        ...faces,
        // The place itself and the ring inside it, so the one standing
        // on the dais is lit the way a picked race or class is.
        ...(standingAt >= 0
          ? { [slotOf(standingAt)]: PRESSED, [`${slotOf(standingAt)}/btn`]: PRESSED }
          : {}),
        // The bar beside the level is a run of frames in the movie —
        // full at the first, empty at the last — and the frame shown
        // says how far through the level the character is.
        ...(spec.values?.expBar ? { [spec.values.expBar]: emptyBy(standing) } : {}),
      },
      // The strip beside a place is for a name that is not written
      // there, and the plus inside one belongs to an empty place: a
      // place with somebody in it shows that somebody.
      hidden: [
        ...(spec.hidden ?? []),
        // The name goes above the dais instead, so no place shows one.
        ...places.map(index => `${slotOf(index)}/area`),
        // The cross in a place is what an empty one offers; a place with
        // somebody in it shows that somebody.
        ...list.map((_, index) => `${slotOf(index)}/btn/defaulticon`),
      ],
    },
    { movie: spec.movie },
  );
  const place = (index: number) => worn.find(slotOf(index));
  /** A place nobody is standing in, which is the size every place is drawn at. */
  const plainRing = worn.find(`${slotOf(standingAt === 0 ? 1 : 0)}/btn`);

  return (
    <WornPanel worn={worn} name="choose-character">
      <WornCaptions worn={worn} spec={spec} tone={LIGHT} />
      {/* The picture of each character, inside the ring its place
          draws: the middle of that ring is dark rather than empty, so
          the picture goes over it and stops short of the rim. */}
      {list.map((character, index) => (
        <WornFace
          key={`face.${character.guid}`}
          worn={worn}
          at={worn.find(`${slotOf(index)}/displaycallback`)}
          within={plainRing}
          url={taken.get(lookKey(lookOf(character)))}
          name={character.name}
        />
      ))}
      {list.map((character, index) => (
        <div key={character.guid}>
          <WornHit
            worn={worn}
            part={place(index)}
            label={character.name}
            pressed={character.guid === chosen}
            onHold={hold(slotOf(index))}
            onPress={() => setChosen(character.guid)}
          />
        </div>
      ))}

      {/* The place after the last character starts a new one. */}
      <WornHit
        worn={worn}
        part={place(list.length)}
        label="Make a character"
        onHold={hold(slotOf(list.length))}
        onPress={() => {
          startDraft(0, 0);
          setStage('race');
        }}
      />

      <WornSays
        worn={worn}
        part={worn.fieldOf(worn.find(spec.values?.name))}
        text={standing?.name}
        tone={LIGHT}
      />
      <WornSays
        worn={worn}
        part={worn.fieldOf(worn.find(spec.values?.level))}
        text={standing ? String(standing.level) : undefined}
        tone={LIGHT}
      />

      <WornHit
        worn={worn}
        part={worn.find(on('enter'))}
        label="Enter the world"
        disabled={working || standing === null}
        onHold={hold(on('enter'))}
        onPress={() => standing && void frontEndActions().choose(standing.name)}
      />
      {/* The way back off the account, on the build's own plaque. */}
      <WornHit
        worn={worn}
        part={worn.find(on('signOut'))}
        label="Log out"
        disabled={working}
        onHold={hold(on('signOut'))}
        onPress={() => frontEndActions().signOut()}
      />
      <WornHit
        worn={worn}
        part={worn.find(on('delete'))}
        label="Delete"
        disabled={working || standing === null}
        onHold={hold(on('delete'))}
        onPress={() => setDoomed(standing?.name ?? null)}
      />

      {/* Asked before it happens, because it cannot be undone. The
          build's own box where there is one, ours where there is not. */}
      {doomed !== null && wornAsk && (
        <ArtConfirmDelete
          name={doomed}
          onConfirm={() => {
            setDoomed(null);
            void frontEndActions().remove(doomed);
          }}
          onCancel={() => setDoomed(null)}
        />
      )}
      {doomed !== null && !wornAsk && (
        <ConfirmDialog
          question="Delete this character for good?"
          subject={doomed}
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={() => {
            setDoomed(null);
            void frontEndActions().remove(doomed);
          }}
          onCancel={() => setDoomed(null)}
        >
          <p className="m-0 text-tiny text-ink-400">
            Everything it was carrying goes with it, and this cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </WornPanel>
  );
}

/** How many frames along the bar's own run stands for what is left. */
const BAR_FRAMES = 50;

/**
 * Which frame of the bar shows this character's own experience.
 *
 * The run goes from full to empty, so the frame is how much is *left*.
 */
function emptyBy(character: CharacterSummary | null): number {
  if (!character || character.xpToLevel <= 0) return BAR_FRAMES;
  const through = Math.max(0, Math.min(1, character.xp / character.xpToLevel));
  return BAR_FRAMES - Math.round(through * BAR_FRAMES);
}

/** What a listed character looks like, in the shape the ground wants. */
function lookOf(character: CharacterSummary): {
  race: number;
  gender: number;
  displayInfoId: number;
  skin: number;
  hairStyle: number;
  hairColour: number;
  face: number;
  equipment: number[];
} {
  return {
    race: character.race,
    gender: character.gender,
    displayInfoId: character.displayInfoId,
    skin: character.appearance.skin,
    hairStyle: character.appearance.hairStyle,
    hairColour: character.appearance.hairColour,
    face: character.appearance.face,
    equipment: character.equipment,
  };
}
