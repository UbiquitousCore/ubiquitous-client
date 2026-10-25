/**
 * Making a character without the build's own pages: plain race, class,
 * body and name steps standing where the worn screens would. Used only
 * when the mounted build has no panels of its own; marked so it is never
 * mistaken for the game's own art. Hands the game exactly what the worn
 * screens would: the draft is the same shape, and the look keeps the
 * body's first offered skin, face, hair and colour.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import {
  draft,
  editDraft,
  frontEndActions,
  kinds,
  looks,
  say,
  setStage,
  stage,
  startingHairStyle,
} from '../frontend/frontEndStore';

/** The two bodies every race ships, as the wire numbers them. */
const MALE = 0;
const FEMALE = 1;

const BACK: Partial<Record<string, string>> = {
  race: 'characters',
  class: 'race',
  look: 'class',
  name: 'look',
} as const;

export function FallbackMakeCharacter(): JSX.Element {
  const at = stage.value;
  const picked = draft.value;
  const offered = kinds.value;
  const seen = looks.value;
  const [name, setName] = useState(picked.name);

  const back = (
    <button
      type="button"
      className="rounded border border-parchment-700 px-2 py-1 text-tiny"
      onClick={() => setStage((BACK[at] ?? 'characters') as typeof at)}
    >
      Back
    </button>
  );

  const shell = (title: string, body: JSX.Element, next?: JSX.Element): JSX.Element => (
    <div
      data-fallback
      data-screen={`make-${at}`}
      className="flex w-full max-w-80 flex-col gap-2 rounded border border-parchment-700 bg-ink-900/90 p-4"
    >
      <p className="m-0 text-center text-tiny text-ink-400">
        This build carries no {title} page, so a plain one stands in.
      </p>
      {body}
      <span className="flex gap-2">
        {back}
        {next}
      </span>
    </div>
  );

  if (at === 'race') {
    return shell(
      'race',
      <>
        <span className="flex gap-2" role="group" aria-label="Gender">
          {[
            ['Male', MALE],
            ['Female', FEMALE],
          ].map(([label, gender]) => (
            <button
              key={label as string}
              type="button"
              aria-pressed={picked.gender === gender}
              className="flex-1 rounded border border-parchment-700 px-2 py-1 text-tiny"
              onClick={() => editDraft({ gender: gender as number })}
            >
              {label as string}
            </button>
          ))}
        </span>
        <span className="flex flex-col gap-2" role="group" aria-label="Race">
          {offered.races.map(one => (
            <button
              key={one.race}
              type="button"
              aria-pressed={picked.race === one.race}
              className="rounded border border-parchment-700 px-2 py-1 text-tiny"
              onClick={() => editDraft({ race: one.race })}
            >
              {one.name ?? `Race ${one.race}`}
            </button>
          ))}
        </span>
      </>,
      <button
        type="button"
        className="flex-1 rounded border border-parchment-700 px-2 py-1 text-tiny"
        onClick={() => setStage('class')}
      >
        Continue
      </button>,
    );
  }

  if (at === 'class') {
    return shell(
      'class',
      <span className="flex flex-col gap-2" role="group" aria-label="Class">
        {offered.classes.map(one => (
          <button
            key={one.playerClass}
            type="button"
            aria-pressed={picked.playerClass === one.playerClass}
            className="rounded border border-parchment-700 px-2 py-1 text-tiny"
            onClick={() => editDraft({ playerClass: one.playerClass })}
          >
            Class {one.playerClass}
          </button>
        ))}
      </span>,
      <button
        type="button"
        className="flex-1 rounded border border-parchment-700 px-2 py-1 text-tiny"
        onClick={() => {
          // Dress the body in what it offers before naming it: the look
          // step is cosmetic, and an unoffered choice composites black.
          editDraft({
            skin: seen.skins[0] ?? picked.skin,
            face: seen.faces[0] ?? picked.face,
            hairStyle: startingHairStyle(seen),
            hairColour: seen.hairColours[0] ?? picked.hairColour,
          });
          setStage('look');
        }}
      >
        Continue
      </button>,
    );
  }

  if (at === 'look') {
    return shell(
      'look',
      <p className="m-0 text-center text-tiny">
        The body wears its first offered skin, face, hair and colour.
      </p>,
      <button
        type="button"
        className="flex-1 rounded border border-parchment-700 px-2 py-1 text-tiny"
        onClick={() => setStage('name')}
      >
        Continue
      </button>,
    );
  }

  return shell(
    'name',
    <label className="flex flex-col gap-1 text-tiny">
      Name
      <input
        aria-label="Name"
        className="bg-ink-950 rounded border border-parchment-700 px-2 py-1"
        value={name}
        onInput={event => {
          setName(event.currentTarget.value);
          editDraft({ name: event.currentTarget.value });
        }}
      />
    </label>,
    <button
      type="button"
      className="flex-1 rounded border border-parchment-700 px-2 py-1 text-tiny"
      onClick={() => {
        if (name.trim() === '') {
          say('A name is needed.');
          return;
        }
        void frontEndActions().create({ ...picked, name });
      }}
    >
      Create
    </button>,
  );
}
