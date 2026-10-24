/**
 * What the screens before the world read, and the one seam they act
 * through. The game installs itself once; without it the screens still
 * draw (the design bench).
 */

import { signal } from '@preact/signals';

import type { CharacterSummary } from '../../net/GameConnection';
import type { LookOptions, PlayableKinds } from '../../assets/types';

/** Which of the screens before the world is showing. */
export type FrontStage = 'signIn' | 'characters' | 'race' | 'class' | 'look' | 'name' | 'entering';

/** What a player has picked so far. Numbers, the way they go on the wire. */
export interface DraftCharacter {
  race: number;
  gender: number;
  playerClass: number;
  skin: number;
  hairStyle: number;
  hairColour: number;
  face: number;
  name: string;
}

/** A body to stand on the ground behind the screens. */
export interface PreviewLook {
  race: number;
  gender: number;
  displayInfoId: number;
  skin: number;
  hairStyle: number;
  hairColour: number;
  face: number;
  /** Worn entries by slot, for a character that already has some. */
  equipment?: number[];
}

/** No hair picked yet; no body offers it, so the first looks replace it with the starting style. */
export const NO_HAIR_CHOSEN = -1;

export const EMPTY_DRAFT: DraftCharacter = {
  race: 0,
  gender: 0,
  playerClass: 0,
  skin: 0,
  hairStyle: NO_HAIR_CHOSEN,
  hairColour: 0,
  face: 0,
  name: '',
};

export const stage = signal<FrontStage>('signIn');
export const characters = signal<readonly CharacterSummary[]>([]);
export const kinds = signal<PlayableKinds>({ races: [], classes: [] });
export const draft = signal<DraftCharacter>(EMPTY_DRAFT);
/** The looks this body offers, filled by the game; an empty list hides that row. */
export const looks = signal<LookOptions>({
  skins: [],
  faces: [],
  hairStyles: [],
  bareHairStyles: [],
  hairColours: [],
});

/** The server's starting kit for the pairing being made, by worn slot; empty until answered. */
export const outfit = signal<readonly number[]>([]);
/** What the screen has to say: a refusal, or what it is waiting for. */
export const notice = signal<string>('');

/** A box laid over the screen, which is answered before anything under it. */
export type FrontDialog = { kind: 'connecting' } | { kind: 'message'; text: string };

export const dialog = signal<FrontDialog | null>(null);

export function showDialog(next: FrontDialog | null): void {
  dialog.value = next;
}
/** True while something is in flight, so a control cannot be pressed twice. */
export const busy = signal<boolean>(false);

/** The character just made, which the list opens on, as the build does. */
export const justMade = signal<string | null>(null);

export function setJustMade(name: string | null): void {
  justMade.value = name;
}

/** Portraits by look, photographed through each model's own camera rather than shipped. */
export const portraits = signal<ReadonlyMap<string, string>>(new Map());

/** Our own name for a look, which is what a picture of it is kept under. */
export function lookKey(look: PreviewLook): string {
  return [
    look.race,
    look.gender,
    look.displayInfoId,
    look.skin,
    look.hairStyle,
    look.hairColour,
    look.face,
    (look.equipment ?? []).join('.'),
  ].join(':');
}

/** Remember the picture of a look, once it has been taken. */
export function setPortrait(look: PreviewLook, url: string): void {
  const next = new Map(portraits.value);
  next.set(lookKey(look), url);
  portraits.value = next;
}

/** What the screens ask the game; each answers when the server has, a failure with its reason. */
export interface FrontEndActions {
  signIn(userId: string, passHash: string): Promise<void>;
  create(character: DraftCharacter): Promise<void>;
  choose(nameOrGuid: string): Promise<void>;
  /** Take a character off the account for good. */
  remove(nameOrGuid: string): Promise<void>;
  /** Leave the account and go back to signing in. */
  signOut(): void;
  /** Give up on waiting for the server: start over with a fresh connection. */
  cancelSignIn(): void;
  /** Set light round the character on the dais when one has just been
   * made. */
  celebrate(): void;
  /** Stand this body on the ground behind the screens, or clear it. */
  preview(look: PreviewLook | null): void;
  /** Ask what this race and class would start out wearing. */
  askOutfit(race: number, playerClass: number): void;
  /**
   * Ask for the picture of a look, for a screen that shows one in a
   * circle. Answered by putting it in `portraits`.
   */
  wantPortrait(look: PreviewLook): void;
  /** Where the ground is drawn. Handed over as the screen mounts it. */
  stageCanvas(canvas: HTMLCanvasElement | null): void;
  /** Turn the body by hand, in radians, and let it go again. */
  turnBody(radians: number): void;
  releaseBody(): void;
  /** The place seen wide and turning, or close on the dais once there is a character. */
  watchGround(view: 'wide' | 'close'): void;
}

const IDLE: FrontEndActions = {
  async signIn() {},
  async create() {},
  async choose() {},
  async remove() {},
  signOut() {},
  cancelSignIn() {},
  celebrate() {},
  preview() {},
  askOutfit() {},
  wantPortrait() {},
  stageCanvas() {},
  turnBody() {},
  releaseBody() {},
  watchGround() {},
};

let installed: FrontEndActions = IDLE;

export function setFrontEndActions(actions: Partial<FrontEndActions>): void {
  installed = { ...IDLE, ...actions };
}

/** The game's actions over idle defaults: one missing action throwing would take every queued effect with it. */
export function frontEndActions(): FrontEndActions {
  return installed;
}

export function setStage(next: FrontStage): void {
  stage.value = next;
  notice.value = '';
}

export function setCharacters(list: readonly CharacterSummary[]): void {
  characters.value = list;
}

export function setKinds(offered: PlayableKinds): void {
  kinds.value = offered;
}

export function setOutfit(worn: readonly number[]): void {
  outfit.value = worn;
}

/** The first offered hair style that has hair; most bodies number bare scalps first. */
export function startingHairStyle(offered: LookOptions): number {
  const bare = new Set(offered.bareHairStyles);
  return offered.hairStyles.find(style => !bare.has(style)) ?? offered.hairStyles[0] ?? 0;
}

/**
 * Snap the draft onto what this body offers. A look of 0 names an unshipped
 * `_00.tga` and composites black, so unoffered choices become the first
 * offered (hair: the starting style). Offered choices are kept, since every
 * preview answers with the same list.
 */
export function setLooks(offered: LookOptions): void {
  looks.value = offered;
  const kept = (run: number[], current: number, first = run[0] ?? 0): number =>
    run.includes(current) ? current : first;
  const now = draft.value;
  const snapped: DraftCharacter = {
    ...now,
    skin: kept(offered.skins, now.skin),
    face: kept(offered.faces, now.face),
    hairStyle: kept(offered.hairStyles, now.hairStyle, startingHairStyle(offered)),
    hairColour: kept(offered.hairColours, now.hairColour),
  };
  if (
    snapped.skin !== now.skin ||
    snapped.face !== now.face ||
    snapped.hairStyle !== now.hairStyle ||
    snapped.hairColour !== now.hairColour
  ) {
    draft.value = snapped;
  }
}

/** Change the draft; a new race or sex restarts the hair, whose numbering differs per body. */
export function editDraft(change: Partial<DraftCharacter>): void {
  const now = draft.value;
  const newBody =
    (change.race !== undefined && change.race !== now.race) ||
    (change.gender !== undefined && change.gender !== now.gender);
  draft.value = { ...now, ...(newBody ? { hairStyle: NO_HAIR_CHOSEN } : {}), ...change };
}

export function startDraft(race: number, gender: number): void {
  draft.value = { ...EMPTY_DRAFT, race, gender };
}

export function say(what: string): void {
  notice.value = what;
}

export function working(state: boolean): void {
  busy.value = state;
}
