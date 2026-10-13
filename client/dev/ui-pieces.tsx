/**
 * Dev-only piece bench.
 *
 * Pick the game file and every named piece of interface art in a movie is
 * drawn on its own, at its own size. Click one to see it stretched to an
 * arbitrary box with nine-slice edges, and to read off the slice numbers a
 * screen would wear it with. Nothing here ships.
 *
 *   npm run dev  ->  /dev/ui-pieces.html
 */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import '../src/ui/styles/global.css';
import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { uiIconId, uiSkinId } from '../src/assets/ids';
import type { UiMovie } from '../src/assets/ids';
import type { UiSkinArt, UiSkinData } from '../src/assets/types';
import { pickIpa } from '../src/assets/vfs/ipaHandle';
import { drawPiece } from '../src/ui/art/pieceCanvas';
import type { PieceImage } from '../src/ui/art/pieceCanvas';
import { pieceNames, planArt, planPiece } from '../src/ui/art/piecePlan';
import { inventoryBriefs, takeInventory } from '../src/ui/art/pieceInventory';

const MOVIES: UiMovie[] = ['IGM', 'LGM', 'store'];

const BTN = 'border border-brass-600 bg-chrome-800 px-2 py-1 text-parchment-100';

interface Piece extends PieceImage {
  name: string;
}

/**
 * Hand a file to the browser's downloads.
 *
 * The inventory describes shipped content, so it belongs beside the game
 * file on the machine that owns it — never in the repository. Saving it
 * rather than copying it keeps that obvious.
 */
function save(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

interface Slice {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function Bench(): JSX.Element {
  const [provider] = useState(() => new PackAssetProvider());
  const [status, setStatus] = useState('Pick the game file to begin.');
  const [movie, setMovie] = useState<UiMovie>('IGM');
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [skin, setSkin] = useState<UiSkinData | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Piece | null>(null);
  const [frame, setFrame] = useState({ w: 360, h: 460 });
  const [slice, setSlice] = useState<Slice>({ top: 24, right: 24, bottom: 24, left: 24 });

  /** Draw every named piece the movie carries, art fetched as each needs it. */
  async function harvest(skin: UiSkinData, target: UiMovie): Promise<void> {
    const art = new Map<string, UiSkinArt>();
    const names = pieceNames(skin);
    const out: Piece[] = [];
    for (const [index, name] of names.entries()) {
      if (index % 10 === 0) setStatus(`${target}: drawing ${index + 1} of ${names.length}…`);
      const plan = planPiece(skin, name);
      if (!plan) continue;
      for (const needed of planArt(plan)) {
        if (art.has(needed)) continue;
        const bitmap = await provider.load(uiIconId(needed)).catch(() => null);
        if (bitmap) art.set(needed, bitmap);
      }
      const image = drawPiece(plan, art, 1);
      if (image) out.push({ name, ...image });
    }
    setPieces(out);
    setStatus(`${target}: ${out.length} of ${names.length} named pieces drew something.`);
  }

  async function openMovie(target: UiMovie): Promise<void> {
    setMovie(target);
    setSelected(null);
    setPieces([]);
    setStatus(`Parsing ${target}…`);
    try {
      const loaded = await provider.load(uiSkinId(target));
      setSkin(loaded);
      await harvest(loaded, target);
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

  const shown = pieces.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));

  /** The CSS a screen would wear the selected piece with. */
  const css = selected
    ? [
        `background-image: url("…");`,
        `border-image-source: url("…");`,
        `border-image-slice: ${slice.top} ${slice.right} ${slice.bottom} ${slice.left} fill;`,
        `border-image-width: ${slice.top}px ${slice.right}px ${slice.bottom}px ${slice.left}px;`,
      ].join('\n')
    : '';

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
          placeholder="filter by name"
          value={filter}
          onInput={e => setFilter((e.target as HTMLInputElement).value)}
        />
        <button
          class={BTN}
          disabled={!skin}
          onClick={() => {
            if (!skin) return;
            const inventory = takeInventory(skin);
            save(`${movie}-pieces.json`, JSON.stringify(inventory, null, 2), 'application/json');
          }}
        >
          Save inventory
        </button>
        <button
          class={BTN}
          disabled={!skin}
          onClick={() => {
            if (!skin) return;
            save(`${movie}-screens.md`, inventoryBriefs(takeInventory(skin)), 'text/markdown');
          }}
        >
          Save task briefs
        </button>
        <span class="text-sm">{status}</span>
      </div>

      <div class="flex min-h-0 flex-1 gap-2">
        <div class="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 overflow-auto">
          {shown.map(piece => (
            <button
              key={piece.name}
              class={`${BTN} flex flex-col items-center gap-1 ${
                selected?.name === piece.name ? 'border-brass-300' : ''
              }`}
              onClick={() => setSelected(piece)}
            >
              <img
                src={piece.url}
                alt=""
                class="max-h-24 max-w-full object-contain"
                style={{ imageRendering: 'auto' }}
              />
              <span class="text-micro break-all">{piece.name}</span>
              <span class="text-micro opacity-70">
                {piece.width}×{piece.height}
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <div class="flex w-96 shrink-0 flex-col gap-2 overflow-auto border border-brass-600 p-2">
            <div class="font-bold">{selected.name}</div>
            <div class="text-micro">
              authored {selected.width}×{selected.height}
            </div>

            <div class="text-sm">Stretched to a box, nine-slice edges:</div>
            <div
              style={{
                width: `${frame.w}px`,
                height: `${frame.h}px`,
                borderStyle: 'solid',
                borderTopWidth: `${slice.top}px`,
                borderRightWidth: `${slice.right}px`,
                borderBottomWidth: `${slice.bottom}px`,
                borderLeftWidth: `${slice.left}px`,
                borderImageSource: `url(${selected.url})`,
                borderImageSlice: `${slice.top} ${slice.right} ${slice.bottom} ${slice.left} fill`,
              }}
            />

            {(['w', 'h'] as const).map(axis => (
              <label key={axis} class="flex items-center gap-2 text-micro">
                box {axis}
                <input
                  type="range"
                  min={40}
                  max={800}
                  value={frame[axis]}
                  onInput={e =>
                    setFrame(b => ({ ...b, [axis]: Number((e.target as HTMLInputElement).value) }))
                  }
                />
                {frame[axis]}
              </label>
            ))}
            {(['top', 'right', 'bottom', 'left'] as const).map(edge => (
              <label key={edge} class="flex items-center gap-2 text-micro">
                slice {edge}
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(Math.min(selected.width, selected.height) / 2))}
                  value={slice[edge]}
                  onInput={e =>
                    setSlice(s => ({
                      ...s,
                      [edge]: Number((e.target as HTMLInputElement).value),
                    }))
                  }
                />
                {slice[edge]}
              </label>
            ))}

            <textarea class="h-28 border border-brass-600 bg-chrome-800 p-1 text-micro" readOnly>
              {css}
            </textarea>
            <button
              class={BTN}
              onClick={() => void navigator.clipboard?.writeText(css).catch(() => undefined)}
            >
              Copy CSS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById('ui-pieces');
if (root) render(<Bench />, root);
