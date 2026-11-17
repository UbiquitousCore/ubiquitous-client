/**
 * The account's characters without the build's own list: names to enter
 * with, to delete, and to make. Used only when the mounted build has no
 * character list of its own; marked so it is never mistaken for the game's
 * own art. Hands the game exactly what the worn screen would.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { characters, frontEndActions, setStage, startDraft } from '../frontend/frontEndStore';

export function FallbackCharacters(): JSX.Element {
  const list = characters.value;
  // Deleting takes two presses: the first arms the button, the second
  // removes the character for good.
  const [doomed, setDoomed] = useState<string | null>(null);

  return (
    <div
      data-fallback
      data-screen="characters"
      className="flex w-full max-w-80 flex-col gap-2 rounded border border-parchment-700 bg-ink-900/90 p-4"
    >
      <p className="m-0 text-center text-tiny text-ink-400">
        This build carries no character list, so a plain one stands in.
      </p>
      {list.length === 0 && <p className="m-0 text-center text-tiny">No characters yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.map(one => (
          <li
            key={one.guid}
            className="flex items-center justify-between gap-2 rounded border border-parchment-700 px-2 py-1"
          >
            <span className="text-tiny">
              {one.name} · {one.level}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="rounded border border-parchment-700 px-2 py-1 text-tiny"
                onClick={() => one.name && void frontEndActions().choose(one.name)}
              >
                Enter
              </button>
              <button
                type="button"
                className="rounded border border-parchment-700 px-2 py-1 text-tiny"
                onClick={() => {
                  if (doomed === one.guid) {
                    setDoomed(null);
                    if (one.name) void frontEndActions().remove(one.name);
                  } else {
                    setDoomed(one.guid);
                  }
                }}
              >
                {doomed === one.guid ? 'Sure?' : 'Delete'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <span className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded border border-parchment-700 px-2 py-1 text-tiny"
          onClick={() => {
            startDraft(0, 0);
            setStage('race');
          }}
        >
          New
        </button>
        <button
          type="button"
          className="flex-1 rounded border border-parchment-700 px-2 py-1 text-tiny"
          onClick={() => frontEndActions().signOut()}
        >
          Sign out
        </button>
      </span>
    </div>
  );
}
