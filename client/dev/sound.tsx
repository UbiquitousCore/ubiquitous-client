/**
 * The sound bench: hear what each zone plays, and any sound in the
 * catalogue, through the same `AudioEngine` the client plays them with.
 *
 *     UBIQUITOUS_PACK_DIR=<packs> npm run dev
 *     open /dev/sound.html?dir=<packs>
 *
 * The directory needs tables.bin and sound.bin. A zone's row plays what a
 * hero standing at its centre would hear, so a detail zone with no music of
 * its own plays the region's, exactly as it would in the world.
 */

import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { ResourceSystem } from '../src/assets/ResourceSystem';
import type { SoundCue } from '../src/assets/formats/tables';
import type { ZoneInfo } from '../src/assets/types';
import { AudioEngine } from '../src/audio/AudioEngine';
import { soundName } from '../src/audio/cues';
import { zoneSoundAt } from '../src/audio/zoneSound';
import '../src/ui/styles/global.css';

const params = new URLSearchParams(location.search);
const DIR = params.get('dir') ?? '';
const PACKS = ['tables.bin', 'sound.bin'];
/** How many catalogue rows are listed at once. */
const SHOWN = 80;

interface Bench {
  engine: AudioEngine;
  zones: ZoneInfo[];
  cues: SoundCue[];
}

const BUTTON =
  'rounded-chrome-sm border border-brass-600 px-2 py-0.5 text-micro text-brass-300 uppercase hover:bg-chrome-900';

function SoundBench(): JSX.Element {
  const [note, setNote] = useState('Reading the build…');
  const [bench, setBench] = useState<Bench | null>(null);
  const [filter, setFilter] = useState('');
  const [playing, setPlaying] = useState('');

  useEffect(() => {
    void (async () => {
      if (!DIR) {
        setNote('Pass ?dir=<absolute path to a directory holding tables.bin and sound.bin>.');
        return;
      }
      const files: File[] = [];
      for (const name of PACKS) {
        const got = await fetch(`/@fs/${DIR}/${name}`).catch(() => null);
        if (!got?.ok) continue;
        const blob = await got.blob();
        if (blob.type.startsWith('text/')) continue;
        files.push(new File([blob], name));
      }
      if (files.length < PACKS.length) {
        setNote(`${DIR} must hold ${PACKS.join(' and ')}, and be $UBIQUITOUS_PACK_DIR when vite started.`);
        return;
      }
      const provider = new PackAssetProvider();
      await provider.useSource(provider.offer(files).id);
      const resources = new ResourceSystem(provider);
      const engine = new AudioEngine(resources);
      const index = await engine.ready();
      const zones = (await resources.zoneIndex()).zones;
      (globalThis as Record<string, unknown>).__audio = engine;
      setBench({ engine, zones, cues: index ? [...index.byId.values()] : [] });
      setNote('Click anywhere once: the browser holds sound back until then.');
    })().catch((err: unknown) => setNote(`Would not mount: ${String(err)}`));
  }, []);

  const heard = useMemo(() => {
    if (!bench) return [];
    return bench.zones
      .filter(zone => zone.mapId >= 0)
      .map(zone => ({ zone, here: zoneSoundAt(bench.zones, zone.mapId, ...zone.centre) }))
      .filter(row => row.here && (row.here.music || row.here.ambience));
  }, [bench]);

  const cues = useMemo(() => {
    const wanted = filter.trim().toLowerCase();
    return (bench?.cues ?? []).filter(cue => soundName(cue.path).includes(wanted)).slice(0, SHOWN);
  }, [bench, filter]);

  const label = (id: number): string => {
    const cue = bench?.engine.cue(id);
    return cue ? soundName(cue.path) : '—';
  };

  return (
    <div className="h-full overflow-auto bg-chrome-950 p-4 text-parchment-200 sm:p-6">
      <h1 className="mb-2 text-lg font-bold tracking-widest text-brass-300 uppercase">Sound</h1>
      <p className="mb-4 text-micro text-ink-400" data-note>
        {note}
      </p>
      {bench && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="text-micro text-ink-400 uppercase">Now</span>
            <span data-playing>{playing || 'nothing'}</span>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                bench.engine.setMusic(0);
                bench.engine.setAmbience(0);
                setPlaying('');
              }}
            >
              Stop
            </button>
          </div>

          <section className="flex flex-col gap-1">
            <h2 className="border-b border-brass-600 pb-1 text-sm tracking-widest text-brass-300 uppercase">
              Zones
            </h2>
            {heard.map(({ zone, here }) => (
              <div key={zone.id} className="flex items-baseline gap-3" data-zone={zone.id}>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    bench.engine.setMusic(here!.music);
                    bench.engine.setAmbience(here!.ambience);
                    setPlaying(`${zone.name}: ${label(here!.music)} + ${label(here!.ambience)}`);
                  }}
                >
                  Play
                </button>
                <span className="w-56 shrink-0 truncate">{zone.name}</span>
                <span className="w-24 shrink-0 text-micro text-ink-400">{zone.mapName}</span>
                <span className="text-micro">{label(here!.music)}</span>
                <span className="text-micro text-ink-400">{label(here!.ambience)}</span>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <h2 className="border-b border-brass-600 pb-1 text-sm tracking-widest text-brass-300 uppercase">
              Catalogue
            </h2>
            <input
              className="mb-2 w-64 rounded-chrome-sm border border-brass-600 bg-chrome-900 px-2 py-1"
              placeholder="filter by name"
              value={filter}
              onInput={event => setFilter((event.target as HTMLInputElement).value)}
            />
            {cues.map(cue => (
              <div key={cue.id} className="flex items-baseline gap-3" data-cue={cue.id}>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    if (cue.music) bench.engine.setMusic(cue.id);
                    else bench.engine.play(cue.id);
                    setPlaying(soundName(cue.path));
                  }}
                >
                  Play
                </button>
                <span className="w-12 shrink-0 text-micro text-ink-400">{cue.id}</span>
                <span>{soundName(cue.path)}</span>
                <span className="text-micro text-ink-400">
                  {[
                    cue.music && 'music',
                    cue.positional && 'placed',
                    cue.loop && 'loop',
                    cue.variants > 1 && `${cue.variants} files`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

render(<SoundBench />, document.getElementById('sound')!);
