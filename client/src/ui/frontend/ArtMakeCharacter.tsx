/**
 * Making a character on the build's four screens (race and sex, class,
 * look, name); a step with no spec keeps its built screen.
 */

import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import {
  PRESSED,
  WornFace,
  WornField,
  WornHit,
  WornPanel,
  WornPicture,
  WornSays,
  WornSteps,
  useHeld,
} from './wornBits';
import { usePreviewOfDraft } from './usePreview';
import {
  busy,
  draft,
  editDraft,
  frontEndActions,
  kinds,
  lookKey,
  looks,
  NO_HAIR_CHOSEN,
  portraits,
  say,
  setStage,
  stage,
} from './frontEndStore';
import type { FrontStage, PreviewLook } from './frontEndStore';

export const RACE_SCREEN = 'race';
export const CLASS_SCREEN = 'class';
export const LOOK_SCREEN = 'look';
export const NAME_SCREEN = 'name';

/** Our own name for the step showing, by the stage it belongs to. */
export const STEP_SCREEN: Partial<Record<FrontStage, string>> = {
  race: RACE_SCREEN,
  class: CLASS_SCREEN,
  look: LOOK_SCREEN,
  name: NAME_SCREEN,
};

/** The two bodies every race ships, as the wire numbers them. */
const MALE = 0;
const FEMALE = 1;

/** Where each step goes, forwards and back. */
const FORWARD: Partial<Record<FrontStage, FrontStage>> = {
  race: 'class',
  class: 'look',
  look: 'name',
};
const BACK: Partial<Record<FrontStage, FrontStage>> = {
  race: 'characters',
  class: 'race',
  look: 'class',
  name: 'look',
};

/**
 * A race's own body, for the picture shown in its place.
 *
 * A plain one: the look a character starts from before anything has
 * been picked, which is what those circles show.
 */
function faceOf(
  race: { race: number; maleDisplayInfoId: number; femaleDisplayInfoId: number },
  gender: number,
): PreviewLook {
  return {
    race: race.race,
    gender,
    displayInfoId: gender === FEMALE ? race.femaleDisplayInfoId : race.maleDisplayInfoId,
    skin: 1,
    hairStyle: NO_HAIR_CHOSEN,
    hairColour: 1,
    face: 1,
    equipment: [],
  };
}

/** The one step of making a character that is showing. */
export function ArtMakeCharacter(): JSX.Element | null {
  const at = stage.value;
  usePreviewOfDraft();
  const name = STEP_SCREEN[at];
  const spec = useWornScreen(name ?? '');
  if (!spec) return null;
  if (at === 'race') return <Race spec={spec} />;
  if (at === 'class') return <Class spec={spec} />;
  if (at === 'look') return <Look spec={spec} />;
  if (at === 'name') return <Name spec={spec} />;
  return null;
}

/** The controls every step keeps: on to the next one, or back. */
function Steps({
  worn,
  spec,
  at,
  onFinish,
  ready,
  hold,
}: {
  worn: ReturnType<typeof useWorn>;
  spec: ScreenSpec;
  at: FrontStage;
  onFinish?: () => void;
  ready?: boolean;
  hold(part: string | undefined): (down: boolean) => void;
}): JSX.Element {
  const working = busy.value;
  const on = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];
  return (
    <>
      {/* What the screen writes on itself — its title, the words on its
          own two buttons — which is the same on every step. */}
      <WornCaptions worn={worn} spec={spec} tone={LIGHT} />
      <WornHit
        worn={worn}
        part={worn.find(on('back'))}
        label="Back"
        disabled={working}
        onHold={hold(on('back'))}
        onPress={() => setStage(BACK[at] ?? 'characters')}
      />

      <WornHit
        worn={worn}
        part={worn.find(on(onFinish ? 'finish' : 'next'))}
        label={onFinish ? 'Finish' : 'Next'}
        disabled={working || ready === false}
        onHold={hold(on(onFinish ? 'finish' : 'next'))}
        onPress={() => (onFinish ? onFinish() : setStage(FORWARD[at] ?? 'name'))}
      />
    </>
  );
}

function Race({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const picked = draft.value;
  const races = kinds.value.races;
  const slot = spec.grids?.races?.slot;
  const { hold, faces } = useHeld();

  const on = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];
  const chosen = races.find(one => one.race === picked.race) ?? races[0] ?? null;
  const slotOf = (index: number): string => `${slot}${String(index + 1).padStart(2, '0')}`;
  const chosenIndex = races.findIndex(one => one.race === picked.race);

  // Each race shows its own body in its place, photographed the way the
  // build photographs them, and both sexes are different bodies.
  useEffect(() => {
    for (const one of races) frontEndActions().wantPortrait(faceOf(one, picked.gender));
  }, [races.length, picked.gender]);

  /** The race that many places along, coming round at either end. */
  const stepRace = (by: number): void => {
    if (races.length === 0) return;
    const at = chosenIndex < 0 ? 0 : chosenIndex;
    editDraft({ race: races[(at + by + races.length) % races.length].race });
  };

  // The movie draws a chosen control on its second frame, which says
  // which race and which sex are picked.
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: spec.shown ?? [],
      hidden: spec.hidden ?? [],
      frames: {
        ...faces,
        ...(chosenIndex >= 0 ? { [slotOf(chosenIndex)]: PRESSED } : {}),
        ...(on(picked.gender === MALE ? 'male' : 'female')
          ? { [on(picked.gender === MALE ? 'male' : 'female')!]: PRESSED }
          : {}),
      },
    },
    { movie: spec.movie },
  );

  /** A ring nobody has picked, which is the size every ring is drawn at. */
  const plainRing = worn.find(slotOf(chosenIndex === 0 ? 1 : 0));

  return (
    <WornPanel worn={worn} name="make-character">
      {/* Each race's own body, inside the ring its place draws. */}
      {races.map((one, index) => (
        <WornFace
          key={`face.${one.race}`}
          worn={worn}
          at={worn.find(`displaycallback${String(index + 1).padStart(2, '0')}`)}
          within={plainRing}
          url={portraits.value.get(lookKey(faceOf(one, picked.gender)))}
          name={one.name ?? undefined}
        />
      ))}
      <WornHit
        worn={worn}
        part={worn.find(on('male'))}
        label="Male"
        pressed={picked.gender === MALE}
        onHold={hold(on('male'))}
        onPress={() => editDraft({ gender: MALE })}
      />
      <WornHit
        worn={worn}
        part={worn.find(on('female'))}
        label="Female"
        pressed={picked.gender === FEMALE}
        onHold={hold(on('female'))}
        onPress={() => editDraft({ gender: FEMALE })}
      />

      {/* One place per race, in the order the build's own rows give
          them, each wearing that race's own flag — which is what says
          which is which, since the places are only numbered. */}
      {races.map((one, index) => (
        <WornHit
          key={one.race}
          worn={worn}
          part={worn.find(slotOf(index))}
          label={one.name ?? `Race ${one.race}`}
          pressed={picked.race === one.race}
          onHold={hold(slotOf(index))}
          onPress={() => editDraft({ race: one.race })}
        />
      ))}

      {/* Named beside the flag in the panel, where the build writes it. */}
      <WornSays
        worn={worn}
        part={worn.fieldOf(worn.find(spec.values?.raceName))}
        text={chosen?.name ?? undefined}
        tone={INK}
      />

      {/* What is being picked, said twice over: its own flag in the
          panel the build keeps for it, and what the build says about it
          written under. A race the build carries no words for keeps its
          name there rather than an empty panel. */}
      <WornPicture
        worn={worn}
        at={worn.find(spec.panels?.emblem)}
        asTallAs={worn.fieldOf(worn.find(spec.values?.raceName))}
        file={chosen?.name ? `text/ui_login_flag_${chosen.name.toLowerCase()}.png` : undefined}
      />
      <WornSays
        worn={worn}
        part={worn.fieldOf(worn.find(spec.values?.about))}
        text={chosen ? spec.words?.[`race:${chosen.race}`] || chosen.name || undefined : undefined}
        tone={INK}
        wrap
        scrolls
      />

      <Steps worn={worn} spec={spec} at="race" ready={chosen !== null} hold={hold} />
      <WornSteps label="race" onEarlier={() => stepRace(-1)} onLater={() => stepRace(1)} />
    </WornPanel>
  );
}

function Class({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const picked = draft.value;
  const offered = new Set(kinds.value.classes.map(one => one.playerClass));
  const { hold, faces } = useHeld();

  /** Every control the spec says stands for a class, and which one. */
  const classes = Object.entries(spec.actions ?? {})
    .map(([control, does]) => [control, /^class:(\d+)$/.exec(does)?.[1]] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== undefined)
    .map(([control, id]) => ({ control, playerClass: Number(id) }));

  const chosen = classes.find(one => one.playerClass === picked.playerClass);

  // The build opens this screen on a class rather than on nothing, so
  // there is always something to read about and something to wear.
  useEffect(() => {
    if (picked.playerClass > 0) return;
    const first = classes.find(one => offered.has(one.playerClass));
    if (first) editDraft({ playerClass: first.playerClass });
  }, [classes.length, offered.size, picked.playerClass]);

  /** Marks for unoffered classes, hidden: parked off to the sides, they stretch the frame. */
  const spare = Object.entries(spec.unavailable ?? {})
    .filter(([what]) => offered.has(Number(/^class:(\d+)$/.exec(what)?.[1] ?? -1)))
    .map(([, part]) => part);

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: spec.shown ?? [],
      hidden: [...(spec.hidden ?? []), ...spare],
      frames: { ...faces, ...(chosen ? { [chosen.control]: PRESSED } : {}) },
    },
    { movie: spec.movie },
  );

  /** The class that many places along, coming round at either end. */
  const stepClass = (by: number): void => {
    const open = classes.filter(one => offered.has(one.playerClass));
    if (open.length === 0) return;
    const at = Math.max(
      0,
      open.findIndex(one => one.playerClass === picked.playerClass),
    );
    editDraft({ playerClass: open[(at + by + open.length) % open.length].playerClass });
  };

  return (
    <WornPanel worn={worn} name="make-character">
      {classes.map(one => (
        <WornHit
          key={one.control}
          worn={worn}
          part={worn.find(one.control)}
          label={`Class ${one.playerClass}`}
          pressed={picked.playerClass === one.playerClass}
          // A class the mounted build does not carry a row for is not
          // offered, and the movie has a face for exactly that.
          disabled={!offered.has(one.playerClass)}
          onHold={hold(one.control)}
          onPress={() => editDraft({ playerClass: one.playerClass })}
        />
      ))}

      {/* The build letters each class with a picture of its own name;
          the one being picked is shown in the panel beside it, with what
          the build says about it written under. */}
      <WornPicture
        worn={worn}
        at={worn.find(spec.panels?.emblem)}
        asTallAs={worn.fieldOf(worn.find(spec.values?.className))}
        file={spec.pictures?.[`class:${picked.playerClass}`]?.[0]}
      />
      {/* What it is called, beside its own icon in the panel. */}
      <WornSays
        worn={worn}
        part={worn.fieldOf(worn.find(spec.values?.className))}
        text={spec.calls?.[`class:${picked.playerClass}`]}
        tone={INK}
      />
      <WornSays
        worn={worn}
        part={worn.fieldOf(worn.find(spec.values?.about))}
        text={spec.words?.[`class:${picked.playerClass}`]}
        tone={INK}
        wrap
        scrolls
      />

      <Steps worn={worn} spec={spec} at="class" ready={picked.playerClass > 0} hold={hold} />
      <WornSteps label="class" onEarlier={() => stepClass(-1)} onLater={() => stepClass(1)} />
    </WornPanel>
  );
}

function Look({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const { hold, faces } = useHeld();
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [], frames: faces },
    { movie: spec.movie },
  );
  const picked = draft.value;
  const options = looks.value;

  /** Each row: what it changes, the run it steps through, and where it says so. */
  const rows = [
    { does: 'skin', run: options.skins, now: picked.skin },
    { does: 'hairStyle', run: options.hairStyles, now: picked.hairStyle },
    { does: 'hairColour', run: options.hairColours, now: picked.hairColour },
    { does: 'face', run: options.faces, now: picked.face },
  ];

  const control = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];

  /**
   * The build's own control is one button per row, not a pair of
   * arrows: pressing it takes the next of whatever that row offers, and
   * comes round again at the end.
   */
  const step = (row: (typeof rows)[number]): void => {
    if (row.run.length === 0) return;
    const at = Math.max(0, row.run.indexOf(row.now));
    editDraft({ [row.does]: row.run[(at + 1) % row.run.length] });
  };

  const surprise = (): void => {
    const any = (run: number[], now: number): number =>
      run.length ? run[Math.floor(Math.random() * run.length)] : now;
    editDraft({
      skin: any(options.skins, picked.skin),
      face: any(options.faces, picked.face),
      hairStyle: any(options.hairStyles, picked.hairStyle),
      hairColour: any(options.hairColours, picked.hairColour),
    });
  };

  return (
    <WornPanel worn={worn} name="make-character">
      {/* One control per row, each already lettered with what it
          changes by the movie's own words — so nothing is written over
          them here. Pressing takes the next of whatever that row
          offers. */}
      {rows.map(row => (
        <WornHit
          key={row.does}
          worn={worn}
          part={worn.find(control(row.does))}
          label={row.does}
          disabled={row.run.length < 2}
          onHold={hold(control(row.does))}
          onPress={() => step(row)}
        />
      ))}

      <WornHit
        worn={worn}
        part={worn.find(control('random'))}
        label="Surprise me"
        onHold={hold(control('random'))}
        onPress={surprise}
      />

      <Steps worn={worn} spec={spec} at="look" hold={hold} />
    </WornPanel>
  );
}

function Name({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const { hold, faces } = useHeld();
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [], frames: faces },
    { movie: spec.movie },
  );
  const picked = draft.value;
  const working = busy.value;

  const finish = (): void => {
    if (picked.name.trim() === '') {
      say('A name is needed.');
      return;
    }
    void frontEndActions().create(picked);
  };

  // The movie has no text box here, only a button standing for one.
  // Ours is a real input standing where that button is.
  const control = Object.keys(spec.edits ?? {})[0];
  const edit = control ? spec.edits?.[control] : undefined;
  const where = worn.fieldOf(worn.find(spec.values?.name)) ?? worn.find(control);

  useEffect(() => {
    // Nothing is picked here, so the name is the only thing to do: it
    // takes the caret the moment the screen is up.
    const field = document.querySelector<HTMLInputElement>('[data-part="name"]');
    field?.focus();
  }, [where?.path]);

  return (
    <WornPanel worn={worn} name="make-character">
      <WornField
        worn={worn}
        part={where}
        label="Name"
        limit={edit?.max}
        value={picked.name}
        disabled={working}
        onChange={name => editDraft({ name })}
        onDone={finish}
      />

      <Steps worn={worn} spec={spec} at="name" onFinish={finish} hold={hold} />
    </WornPanel>
  );
}
