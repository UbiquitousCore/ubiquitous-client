/**
 * The shipped interface, drawn as it ships.
 *
 * Every dialog the movie carries, listed by name and drawn from the movie
 * alone — none of our own interface appears inside the frame. The list on
 * the left is a way to walk them, nothing more.
 *
 * What this answers: how much of a screen arrives finished, and what each
 * one still needs driving. A dialog that draws whole needs a layout doing
 * nothing but placing hit-areas; one that draws empty is a list filled in
 * at runtime, and the art alone will never show it.
 *
 *   npm run dev  ->  /dev/ui-native.html
 */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import '../src/ui/styles/global.css';
import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { uiIconId, uiSkinId } from '../src/assets/ids';
import type { UiMovie } from '../src/assets/ids';
import type { UiSkinArt, UiSkinData } from '../src/assets/types';
import { pickIpa } from '../src/assets/vfs/ipaHandle';
import { MovieDialog } from '../src/ui/art/MovieDialog';
import { pieceStates, planArt, planPiece } from '../src/ui/art/piecePlan';
import type { PieceState } from '../src/ui/art/piecePlan';
import { takeInventory } from '../src/ui/art/pieceInventory';
import type { Inventory } from '../src/ui/art/pieceInventory';

const MOVIES: UiMovie[] = ['IGM', 'LGM', 'store'];

const BTN = 'border border-brass-600 bg-chrome-800 px-2 py-1 text-parchment-100';

function Native(): JSX.Element {
  const [provider] = useState(() => new PackAssetProvider());
  const [status, setStatus] = useState('Pick the game file to begin.');
  const [movie, setMovie] = useState<UiMovie>('IGM');
  const [skin, setSkin] = useState<UiSkinData | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [art, setArt] = useState<ReadonlyMap<string, UiSkinArt>>(new Map());
  const [filter, setFilter] = useState('');
  // Which alternate states are switched on. A dialog carries every state it
  // can be in at once; the movie opens on one and parks the rest.
  const [switched, setSwitched] = useState<ReadonlySet<string>>(new Set());
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());

  /** Fetch whatever art a dialog's own pieces point at, then show it. */
  async function show(name: string): Promise<void> {
    if (!skin) return;
    setStatus(`Loading ${name}…`);
    const plan = planPiece(skin, name);
    const next = new Map(art);
    for (const needed of plan ? planArt(plan) : []) {
      if (next.has(needed)) continue;
      const bitmap = await provider.load(uiIconId(needed)).catch(() => null);
      if (bitmap) next.set(needed, bitmap);
    }
    setArt(next);
    setOpen(name);
    setSwitched(new Set());
    setOff(new Set());
    setStatus(name);
  }

  async function openMovie(target: UiMovie): Promise<void> {
    setMovie(target);
    setOpen(null);
    setInventory(null);
    setStatus(`Parsing ${target}…`);
    try {
      const loaded = await provider.load(uiSkinId(target));
      setSkin(loaded);
      const taken = takeInventory(loaded);
      setInventory(taken);
      setStatus(`${target}: ${taken.screens.length} screens`);
    } catch (err) {
      setStatus(`${target} did not open: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function pick(): Promise<void> {
    setStatus('Waiting for the file picker…');
    const files = await pickIpa().catch(() => null);
    if (!files?.length) {
      setStatus('No file picked.');
      return;
    }
    setStatus(`Mounting ${files.length} file(s)…`);
    const source = provider.offer(files);
    await provider.useSource(source.id);
    await openMovie(movie);
  }

  /** Screens first, biggest first, then everything else that draws. */
  const listed = useMemo(() => {
    if (!inventory) return [];
    const screens = inventory.screens.map(s => ({
      name: s.name,
      width: s.width,
      height: s.height,
      parts: s.pieces.length,
    }));
    const loose = inventory.loose.map(p => ({
      name: p.name,
      width: p.width,
      height: p.height,
      parts: 0,
    }));
    return [...screens, ...loose].filter(entry =>
      entry.name.toLowerCase().includes(filter.toLowerCase()),
    );
  }, [inventory, filter]);

  const states: PieceState[] = useMemo(
    () => (skin && open ? pieceStates(skin, open) : []),
    [skin, open],
  );
  const planStates = useMemo(() => ({ shown: [...switched], hidden: [...off] }), [switched, off]);

  const toggle = (set: ReadonlySet<string>, name: string): ReadonlySet<string> => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  };

  return (
    <div class="flex h-full flex-col gap-2 bg-chrome-900 p-2 text-parchment-100">
      <div class="flex flex-wrap items-center gap-2">
        <button class={BTN} onClick={() => void pick()}>
          Pick game file
        </button>
        {MOVIES.map(m => (
          <button
            key={m}
            class={`${BTN} ${m === movie ? 'border-brass-300' : ''}`}
            onClick={() => void openMovie(m)}
          >
            {m}
          </button>
        ))}
        <input
          class="border border-brass-600 bg-chrome-800 px-2 py-1"
          placeholder="filter"
          value={filter}
          onInput={e => setFilter((e.target as HTMLInputElement).value)}
        />
        <span class="text-sm">{status}</span>
      </div>

      <div class="flex min-h-0 flex-1 gap-2">
        <nav
          aria-label="Dialogs"
          class="flex w-56 shrink-0 flex-col gap-1 overflow-auto border border-brass-600 p-1"
        >
          {listed.map(entry => (
            <button
              key={entry.name}
              class={`${BTN} text-left ${entry.name === open ? 'border-brass-300' : ''}`}
              aria-current={entry.name === open ? 'true' : undefined}
              onClick={() => void show(entry.name)}
            >
              <div class="truncate">{entry.name}</div>
              <div class="text-micro opacity-70">
                {entry.width}×{entry.height}
                {entry.parts ? ` · ${entry.parts} parts` : ''}
              </div>
            </button>
          ))}
        </nav>

        {/* Nothing of ours inside this frame: what shows here is the
            movie's own art at the movie's own arrangement. */}
        <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto border border-brass-600 p-2">
          {skin && open ? (
            <MovieDialog
              skin={skin}
              name={open}
              art={art}
              scale={2}
              states={planStates}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p class="text-sm opacity-70">Pick a dialog to draw it.</p>
          )}
        </div>

        {open && (
          <div class="flex w-64 shrink-0 flex-col gap-1 overflow-auto border border-brass-600 p-2">
            <h2 class="font-bold">States</h2>
            <p class="text-micro opacity-70">
              The dialog carries every state at once. It opens on the ones ticked below; the parked
              ones are the states it switches to.
            </p>
            {states.length === 0 && (
              <p class="text-sm opacity-70">
                This dialog has no named parts to switch — it is one piece of art.
              </p>
            )}
            {states.map(state => {
              const on = state.parked ? switched.has(state.name) : !off.has(state.name);
              return (
                <label key={state.name} class="flex items-center gap-2 text-micro">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      state.parked
                        ? setSwitched(s => toggle(s, state.name))
                        : setOff(s => toggle(s, state.name))
                    }
                  />
                  <span class="truncate">{state.name}</span>
                  {state.parked && <span class="opacity-60">parked</span>}
                </label>
              );
            })}
            {states.some(s => s.parked) && (
              <button
                class={BTN}
                onClick={() =>
                  setSwitched(s =>
                    s.size ? new Set() : new Set(states.filter(x => x.parked).map(x => x.name)),
                  )
                }
              >
                Toggle every parked state
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById('ui-native');
if (root) render(<Native />, root);
