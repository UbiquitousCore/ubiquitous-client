/**
 * The screens before the world, over the ground they stand on, with no
 * server behind them.
 *
 *     UBIQUITOUS_PACK_DIR=<packs> npm run dev
 *     open /dev/front.html?dir=<packs>
 *
 * The build is read off disk the same way the other benches read it. What
 * a real session would ask a server — sign in, make a character, enter
 * the world — is answered here by this file, so the screens, the ground
 * and the body on it can be looked at on their own. `?stage=race` opens
 * straight at a step, and `&race=2&gender=1` on a body other than the
 * first; `?characters=0` starts an account with nobody on
 * it.
 *
 * Dev only. Nothing here ships.
 */

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { ResourceSystem } from '../src/assets/ResourceSystem';
import { uiFacesId, uiIconId, uiSkinId, uiStringsId } from '../src/assets/ids';
import type { UiMovie } from '../src/assets/ids';
import { planArt, planPiece } from '../src/ui/art/piecePlan';
import { drawPiece } from '../src/ui/art/pieceCanvas';
import { registerFaces } from '../src/core/lettering';
import { uiSpec } from '../src/ui/art/uiSpec';
import {
  setEmblems,
  setMovie,
  setUiWords,
  wantedDialogs,
  wantedEmblems,
} from '../src/ui/art/pieceStore';
import type { UiSkinArt, UiSkinData } from '../src/assets/types';
import { effect } from '@preact/signals';
import { SelectionScene } from '../src/renderer/SelectionScene';
import { FrontEnd } from '../src/ui/frontend/FrontEnd';
import {
  characters,
  setCharacters,
  setFrontEndActions,
  setKinds,
  lookKey,
  NO_HAIR_CHOSEN,
  portraits,
  setLooks,
  startingHairStyle,
  setOutfit,
  setPortrait,
  setStage,
  say,
  startDraft,
} from '../src/ui/frontend/frontEndStore';
import type { FrontStage, PreviewLook } from '../src/ui/frontend/frontEndStore';
import type { CharacterSummary } from '../src/net/GameConnection';

import '../src/ui/styles/global.css';

const params = new URLSearchParams(location.search);
const DIR = params.get('dir') ?? '';
const PACKS = (
  params.get('packs') ??
  'res.bin,res_t.bin,tables.bin,human_selection.bin,human_selection_layer.bin'
)
  .split(',')
  .filter(Boolean);
/** A whole build to mount, for a directory holding the archive itself. */
const APP = params.get('app') ?? '';
const STAGE = (params.get('stage') ?? 'signIn') as FrontStage;
/** The race and sex a draft starts as, for opening a later step on another body. */
const RACE = Number(params.get('race') ?? 0);
const GENDER = Number(params.get('gender') ?? 0);
/** Which map to stand on; the other one is `mendel_selection`. */
const MAP = params.get('map') ?? 'human_selection';

/**
 * One real starting kit, for looking at gear on the bench: a robe, a
 * skirt, slippers and a staff, at the worn slots a character record
 * keeps them in. Dev only — the server is what answers this during play.
 */
const BENCH_MAGE_KIT = [0, 0, 0, 0, 1109, 1234, 3068, 0, 0, 0, 0, 0, 0, 5007, 0, 0];
/** How many characters this account is pretending to hold. */
const HELD = Number(params.get('characters') ?? 1);

/** A character to show in the list, made up on the spot. */
function someone(name: string, race: number, gender: number): CharacterSummary {
  return {
    guid: `bench-${name}`,
    name,
    level: 12,
    gender,
    race,
    class: 3,
    displayInfoId: 0,
    appearance: { skin: 1, hairStyle: 2, hairColour: 1, face: 1 },
    mapId: 1,
    position: [0, 0, 0],
    equipment: [],
    xp: 0,
    xpToLevel: 1000,
  };
}

function Bench(): JSX.Element {
  const [note, setNote] = useState('Reading the build…');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!DIR) {
        setNote('Pass ?dir=<absolute path to a directory holding res.bin>.');
        return;
      }
      const provider = new PackAssetProvider();
      const files: File[] = [];
      for (const name of APP ? [APP] : PACKS) {
        const got = await fetch(`/@fs/${DIR}/${name}`).catch(() => null);
        if (!got?.ok) continue;
        const blob = await got.blob();
        if (blob.type.startsWith('text/')) continue;
        files.push(new File([blob], name));
      }
      if (!files.length) {
        setNote(
          `Nothing to mount from ${DIR}. That directory must have been ` +
            '$UBIQUITOUS_PACK_DIR when vite started.',
        );
        return;
      }
      try {
        await provider.useSource(provider.offer(files).id);
      } catch (error) {
        setNote(`Would not mount: ${String(error)}`);
        return;
      }

      const resources = new ResourceSystem(provider);
      const words = await provider.load(uiStringsId()).catch(() => []);
      setUiWords(words);
      // The screens quote these by number, and the numbers differ from
      // build to build — so the bench hands them over to be looked at.
      (globalThis as Record<string, unknown>).__words = words;

      // The pictures the screens draw for themselves. Nobody answers for
      // them here, so the bench answers.
      const asked = new Set<string>();
      effect(() => {
        const fresh = wantedEmblems.value.filter(name => !asked.has(name));
        if (!fresh.length) return;
        for (const name of fresh) asked.add(name);
        void (async () => {
          const found = new Map<string, ImageBitmap>();
          for (const name of fresh) {
            const art = await provider.load(uiIconId(name)).catch(() => null);
            if (art) found.set(name, art.image);
          }
          if (found.size) setEmblems(found);
        })();
      });

      // The screens that wear the shipped panels ask for a dialog out of
      // a movie; nobody answers for them here, so the bench does — the
      // same job the client does during play, with no session behind it.
      const movies = new Map<
        UiMovie,
        { skin: Awaited<ReturnType<typeof provider.load>>; art: Map<string, UiSkinArt> }
      >();
      const answered = new Set<string>();
      const skins = new Map<UiMovie, UiSkinData>();
      const sheets = new Map<UiMovie, Map<string, UiSkinArt>>();
      const answerDialogs = async (): Promise<void> => {
        const fresh = wantedDialogs.value.filter(
          one => !answered.has(`${one.movie}/${one.dialog}`),
        );
        if (!fresh.length) return;
        for (const one of fresh) answered.add(`${one.movie}/${one.dialog}`);
        for (const movie of new Set(fresh.map(one => one.movie))) {
          const skin = await provider.load(uiSkinId(movie)).catch(() => null);
          if (!skin) continue;
          const art = new Map<string, UiSkinArt>();
          for (const { dialog } of fresh.filter(one => one.movie === movie)) {
            const plan = planPiece(skin, dialog, { includeParked: true });
            for (const needed of plan ? planArt(plan) : []) {
              if (art.has(needed)) continue;
              const bitmap = await provider.load(uiIconId(needed, movie)).catch(() => null);
              if (bitmap) art.set(needed, bitmap);
            }
          }
          setMovie({ skin, art }, movie);
          skins.set(movie, skin);
          sheets.set(movie, art);
          void movies;
        }
      };
      // Dev only: the same plan the screens are drawn from, and one
      // part drawn on its own as a picture, for any movie that has been
      // read rather than only the last one.
      const partArt = async (from: UiMovie): Promise<Map<string, UiSkinArt>> => {
        const held = sheets.get(from);
        if (held) return held;
        const fresh = new Map<string, UiSkinArt>();
        sheets.set(from, fresh);
        return fresh;
      };
      const readMovie = async (from: UiMovie): Promise<UiSkinData | null> => {
        const held = skins.get(from);
        if (held) return held;
        const skin = await provider.load(uiSkinId(from)).catch(() => null);
        if (skin) skins.set(from, skin);
        return skin ?? null;
      };
      (globalThis as Record<string, unknown>).__drawPart = async (
        name: string,
        from: UiMovie = 'LGM',
      ): Promise<string | null> => {
        const read = await readMovie(from);
        if (!read) return null;
        const plan = planPiece(read, name, { includeParked: true });
        if (!plan) return null;
        const art = await partArt(from);
        for (const needed of planArt(plan)) {
          if (art.has(needed)) continue;
          const bitmap = await provider.load(uiIconId(needed, from)).catch(() => null);
          if (bitmap) art.set(needed, bitmap);
        }
        const image = drawPiece(plan, art, 2);
        return image ? image.url : null;
      };
      (globalThis as Record<string, unknown>).__drawPart2 = async (
        name: string,
        from: UiMovie = 'LGM',
        states: Record<string, unknown> = {},
      ): Promise<string | null> => {
        const read = await readMovie(from);
        if (!read) return null;
        const plan = planPiece(read, name, states as Parameters<typeof planPiece>[2]);
        if (!plan) return null;
        const art = await partArt(from);
        for (const needed of planArt(plan)) {
          if (art.has(needed)) continue;
          const bitmap = await provider.load(uiIconId(needed, from)).catch(() => null);
          if (bitmap) art.set(needed, bitmap);
        }
        const image = drawPiece(plan, art, 2);
        return image ? image.url : null;
      };
      // One part of a piece, framed on itself, the way a screen wearing
      // it is framed — for looking at a control that lives inside a
      // dialog rather than at the top of the movie.
      (globalThis as Record<string, unknown>).__drawIn = async (
        dialog: string,
        part: string,
        from: UiMovie = 'IGM',
        hidden: string[] = [],
      ): Promise<string | null> => {
        const read = await readMovie(from);
        if (!read) return null;
        const whole = planPiece(read, dialog, { includeParked: true });
        const found = whole?.parts.find(one => one.path === part || one.name === part);
        if (!whole || !found) return null;
        const frame = {
          x: whole.box.x + found.box.x,
          y: whole.box.y + found.box.y,
          w: found.box.w,
          h: found.box.h,
        };
        const plan = planPiece(read, dialog, { hidden, frame });
        if (!plan) return null;
        const art = await partArt(from);
        for (const needed of planArt(plan)) {
          if (art.has(needed)) continue;
          const bitmap = await provider.load(uiIconId(needed, from)).catch(() => null);
          if (bitmap) art.set(needed, bitmap);
        }
        const image = drawPiece(plan, art, 3);
        return image ? image.url : null;
      };
      (globalThis as Record<string, unknown>).__plan = async (
        dialog: string,
        states: Record<string, unknown> = { includeParked: true },
        from: UiMovie = 'LGM',
      ) => {
        const read = await readMovie(from);
        return read ? planPiece(read, dialog, states as Parameters<typeof planPiece>[2]) : null;
      };

      effect(() => {
        void wantedDialogs.value;
        void uiSpec.value;
        void answerDialogs();
      });

      // The typefaces the panels were drawn with, out of the build.
      void provider
        .load(uiFacesId())
        .then(registerFaces)
        .catch(() => false);

      // Dev only: what the page asked the build for, and what it could
      // not have, so a camera is not the only way to ask why something
      // came out wrong.
      (globalThis as Record<string, unknown>).__resources = resources;

      setKinds(await resources.playableKinds().catch(() => ({ races: [], classes: [] })));
      setCharacters(HELD > 0 ? [someone('Ayla', 0, 0), someone('Yrsa', 3, 1)].slice(0, HELD) : []);

      let scene: SelectionScene | null = null;
      // What was asked for before there was anywhere to put it: the
      // screens ask as they mount, which is before the canvas is handed
      // over. The client keeps the same note for the same reason.
      let wanted: PreviewLook | null = null;
      const appearanceOf = (look: PreviewLook) => ({
        entry: 0,
        displayInfoId: look.displayInfoId,
        race: look.race,
        gender: look.gender,
        skin: look.skin,
        face: look.face,
        hairStyle: look.hairStyle,
        hairColor: look.hairColour,
        equipment: look.equipment ?? [],
        animationId: 0,
      });
      // A look nobody has picked hair for gets the style its body starts
      // on, as the client gives it.
      const withStartingHair = async (look: PreviewLook): Promise<PreviewLook> => {
        if (look.hairStyle !== NO_HAIR_CHOSEN) return look;
        try {
          const { model } = await resources.networkAppearance(appearanceOf(look));
          return { ...look, hairStyle: startingHairStyle(await resources.lookOptions(model)) };
        } catch {
          return look;
        }
      };
      // The picture of a look, taken off the selection scene.
      const face = async (look: PreviewLook): Promise<void> => {
        if (!scene || portraits.value.has(lookKey(look))) return;
        const resolved = await resources
          .networkAppearance(appearanceOf(await withStartingHair(look)))
          .catch(() => null);
        if (!resolved || !scene) return;
        const url = await scene.portrait({
          model: resolved.model,
          appearance: resolved.appearance,
          scale: resolved.scale,
        });
        if (url) setPortrait(look, url);
      };

      const show = async (look: PreviewLook | null): Promise<void> => {
        wanted = look;
        if (!scene) return;
        if (look === null) {
          await scene.showBody(null);
          return;
        }
        const resolved = await resources
          .networkAppearance(appearanceOf(await withStartingHair(look)))
          .catch(() => null);
        if (!resolved) return;
        await scene.showBody({
          model: resolved.model,
          appearance: resolved.appearance,
          scale: resolved.scale,
        });
        setLooks(
          await resources.lookOptions(resolved.model).catch(() => ({
            skins: [],
            faces: [],
            hairStyles: [],
            bareHairStyles: [],
            hairColours: [],
          })),
        );
      };

      setFrontEndActions({
        async signIn(userId) {
          say(`Signed in as ${userId} — nothing is behind this bench.`);
          setStage('characters');
        },
        async create(wanted) {
          setCharacters([
            ...[someone('Ayla', 0, 0)].slice(0, HELD),
            {
              ...someone(wanted.name, wanted.race, wanted.gender),
              level: 1,
              class: wanted.playerClass,
            },
          ]);
          setStage('characters');
        },
        async choose(nameOrGuid) {
          say(`Would enter the world as ${nameOrGuid}.`);
        },
        async remove(nameOrGuid) {
          setCharacters(characters.value.filter(one => one.name !== nameOrGuid));
          say(`Deleted ${nameOrGuid}.`);
        },
        signOut: () => setStage('signIn'),
        celebrate: () => void scene?.celebrate(),
        preview: look => void show(look),
        wantPortrait: look => void face(look),
        askOutfit(_race, playerClass) {
          // Dev only, and a stand-in: a starting kit is the server's own
          // content and there is no server here, so the bench answers
          // with one real kit so the gear can be looked at at all.
          setOutfit(playerClass === 2 ? BENCH_MAGE_KIT : []);
        },
        stageCanvas: canvas => {
          if (canvas === null) {
            scene?.dispose();
            scene = null;
            return;
          }
          scene = new SelectionScene(resources, canvas);
          // Dev only: the scene itself, so a question about what is
          // drawn can be asked of it rather than of a photograph.
          (globalThis as Record<string, unknown>).__selection = scene;
          void scene.open(MAP).then(() => {
            if (wanted) void show(wanted);
            document.body.setAttribute('data-ready', 'yes');
          });
        },
        turnBody: radians => scene?.turnBy(radians),
        releaseBody: () => scene?.releaseTurn(),
        watchGround: view => scene?.watch(view),
      });

      startDraft(RACE, GENDER);
      setStage(STAGE);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <pre className="m-0 p-4 font-chrome text-sm whitespace-pre-wrap text-parchment-200">
        {note}
      </pre>
    );
  }
  return <FrontEnd />;
}

render(<Bench />, document.getElementById('front')!);
