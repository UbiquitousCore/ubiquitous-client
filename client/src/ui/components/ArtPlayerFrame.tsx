/**
 * The hero's frame in the shipped art: ring and face, health, experience,
 * level, and the class resource. Mana is a clip in the ring; morale and
 * vigor a meter round it whose pips light at fixed power (`PIP_MARKS`,
 * observed in play by the owner), on the shortest length covering the top
 * (own choice), without its own ornament (observed). Our face sits between
 * the art's two halves, as in the target frame.
 */

import type { JSX } from 'preact';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornPiece } from '../art/WornPiece';
import { cornerOverhang } from '../art/cornerOverhang';
import { mailWaiting } from '../mailStore';
import type { ResourceType, Unit } from '../hudStore';
import { barRun, faceFor, shareOf } from '../art/faceRuns';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const PLAYER_FRAME_SCREEN = 'playerFrame';

/** The frame stands at its own size in a HUD corner, not at a place on a stage. */
const CORNER = { unplaced: true } as const;

/**
 * The portrait socket from the movie's portrait spot, fitted by raycasting
 * to the ring's opaque edge in 1.1.4's interface art (centre the spot plus
 * (-0.3, 2.8), radius 27.2, residual 1.0; the top edge reads 33.1 on its
 * own). The radius exceeds it so the rim covers the photo's edge, as the
 * target frame's socket does. The old circle sat 2.8 high and 3 short, and
 * the backdrop showed round the photo.
 */
const SOCKET = { dx: -0.3, dy: 2.8, r: 27.6 };

/**
 * The power held at which each pip lights, first pip first; a pip past the
 * end of the list never lights. The marks do not move with the top, so at
 * a top of 100 the fourth pip of a four-pip meter stays dark.
 */
const PIP_MARKS: readonly number[] = [20, 50, 100, 120];

/** Whether the pip at `index` is lit with `power` held. */
function pipLit(index: number, power: number): boolean {
  const mark = PIP_MARKS[index];
  return mark !== undefined && power >= mark;
}

/** How many of the pips' marks a meter with this top can reach. */
function marksWithin(top: number): number {
  return PIP_MARKS.filter(mark => mark <= top).length;
}
type Hero = Pick<
  Unit,
  'health' | 'maxHealth' | 'mana' | 'maxMana' | 'exp' | 'expToLevel' | 'inCombat' | 'resource'
>;

/** Which parts the hero's frame hides and which face each clip wears, for this hero right now. */
export function heroFaces(
  hero: Hero,
  spec: Pick<ScreenSpec, 'bars' | 'groups' | 'hidden'>,
  parts?: readonly PiecePart[],
): { hidden: string[]; frames: Record<string, number> } {
  const bars = spec.bars ?? { frames: 0, of: {} };
  const of = bars.of;
  /** The face of the bar at `path` for `share` of it; every bar here is full at its first face. */
  const faceAt = (path: string, share: number): number => faceFor(share, barRun(bars, path));
  const groups = spec.groups ?? {};
  const spends: ResourceType = hero.resource ?? 'mana';
  const hidden = [...(spec.hidden ?? [])];
  const frames: Record<string, number> = {};

  if (!hero.inCombat && groups.combat) hidden.push(groups.combat);
  // Health with nothing to measure against reads full; experience with
  // nothing to fill towards is the level cap, and reads empty.
  if (of.health) {
    const share = hero.maxHealth > 0 ? shareOf(hero.health, hero.maxHealth) : 1;
    frames[of.health] = faceAt(of.health, share);
  }
  if (of.exp) frames[of.exp] = faceAt(of.exp, shareOf(hero.exp ?? 0, hero.expToLevel ?? 0));

  // Mana is drawn inside the ring; the other two have a meter of their own.
  const meter = spends === 'mana' ? undefined : groups[spends];
  for (const other of ['morale', 'vigor'] as const) {
    if (groups[other] && groups[other] !== meter) hidden.push(groups[other]!);
  }
  if (!meter) {
    if (of.mana) {
      const share = hero.maxMana > 0 ? shareOf(hero.mana, hero.maxMana) : 1;
      frames[of.mana] = faceAt(of.mana, share);
    }
    return { hidden, frames };
  }
  if (of.mana) hidden.push(of.mana);
  // A meter round the ring carries a larger ornament of its own where the
  // build draws one; the hero keeps the corner's, the one every class wears.
  hidden.push(...ornamentsOf(groups, spends as 'morale' | 'vigor'));

  const lengths = meterLengths(meter, groups, parts);
  const worn =
    lengths.find(one => one.pips.length >= marksWithin(hero.maxMana)) ??
    lengths[lengths.length - 1]!;
  for (const other of lengths) if (other.at !== worn.at) hidden.push(other.at);
  const share = shareOf(hero.mana, hero.maxMana);
  frames[worn.climbs] = faceFor(share, barRun(bars, worn.climbs), 'last');
  worn.pips.forEach((pip, index) => {
    if (!pipLit(index, hero.mana)) hidden.push(pip);
  });
  return { hidden, frames };
}

/** Meter lengths, fewest pips first: each length's climbing clip and pips, from its group or beside the clip. */
function meterLengths(
  meter: string,
  groups: Record<string, string>,
  parts: readonly PiecePart[] | undefined,
): Array<{ at: string; climbs: string; pips: string[] }> {
  const there = (path: string): boolean => !parts || parts.some(part => part.path === path);
  const named = [...new Set([groups.fill, groups.fillBeyond].filter(Boolean) as string[])];
  const found = named.map(name => `${meter}/${name}`).filter(there);
  const step = groups.step;
  const pipNames = Object.keys(groups)
    .filter(key => /^pip\d+$/.test(key))
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
    .map(key => groups[key]!);
  return (found.length ? found : [meter])
    .map(at => {
      const inside = Boolean(step) || at === meter;
      const climbs = step ? `${at}/${step}` : at;
      const pips = pipNames.map(pip => `${inside ? at : meter}/${pip}`).filter(there);
      return { at, climbs, pips };
    })
    .sort((a, b) => a.pips.length - b.pips.length);
}

/** The ornaments a meter carries of its own, by the resource it measures. */
function ornamentsOf(groups: Record<string, string>, meter: 'morale' | 'vigor'): string[] {
  return (groups[`${meter}Ornaments`] ?? '').split(' ').filter(Boolean);
}

/** What the frame never draws for any hero: the spec's hidden parts and each meter's own ornaments. */
export function neverDrawn(spec: Pick<ScreenSpec, 'groups' | 'hidden'>): string[] {
  const groups = spec.groups ?? {};
  return [
    ...(spec.hidden ?? []),
    ...ornamentsOf(groups, 'morale'),
    ...ornamentsOf(groups, 'vigor'),
  ];
}

/** The frame's parts less an unspent meter, which pushes the ring out of the corner where drawn outside. */
export function framedOn(
  frame: string | readonly string[] | undefined,
  hidden: readonly string[],
): string | string[] | undefined {
  if (!Array.isArray(frame)) return frame as string | undefined;
  const drawn = frame.filter(part => !hidden.includes(part));
  return drawn.length ? drawn : [...frame];
}

/** Parts of the shared HUD dialog not the frame's (the tutorial pulse over the portrait); only spec'd parts are drawn. */
export function strangers(
  whole: readonly PiecePart[],
  spec: Pick<ScreenSpec, 'frame' | 'groups' | 'bars' | 'values'>,
): string[] {
  const named = [
    ...(Array.isArray(spec.frame) ? spec.frame : spec.frame ? [spec.frame] : []),
    ...Object.values(spec.groups ?? {}),
    ...Object.values(spec.bars?.of ?? {}),
    ...Object.values(spec.values ?? {}),
  ];
  const owned = new Set(named.map(path => path.split('/')[0]!));
  const inside = new Set(
    whole
      .filter(part => part.path.includes('/') && owned.has(part.path.split('/')[0]!))
      .map(part => part.name),
  );
  return whole
    .filter(part => !part.path.includes('/') && !owned.has(part.path) && !inside.has(part.name))
    .map(part => part.path);
}

/**
 * A part the frame's picture leaves out, placed on the picture's grid: the
 * full plan measures from another origin, so it is moved by however far a
 * part both share stands apart in the two.
 */
function beside(
  worn: { parts: readonly PiecePart[]; whole: readonly PiecePart[] },
  path: string,
  framed: string | readonly string[] | undefined,
): PiecePart | undefined {
  const target = worn.whole.find(part => part.path === path);
  const shared = [framed ?? []].flat().find(name => worn.parts.some(part => part.path === name));
  const inPicture = worn.parts.find(part => part.path === shared);
  const inWhole = worn.whole.find(part => part.path === shared);
  if (!target || !inPicture || !inWhole) return undefined;
  const dx = inPicture.box.x - inWhole.box.x;
  const dy = inPicture.box.y - inWhole.box.y;
  return { ...target, box: { ...target.box, x: target.box.x + dx, y: target.box.y + dy } };
}

export interface ArtPlayerFrameProps {
  unit: Unit;
  /** A headshot of the hero, once one has rendered. */
  portraitUrl?: string;
}

export function ArtPlayerFrame(props: ArtPlayerFrameProps): JSX.Element | null {
  const spec = useWornScreen(PLAYER_FRAME_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  unit,
  portraitUrl,
  spec,
}: ArtPlayerFrameProps & { spec: ScreenSpec }): JSX.Element | null {
  // Framing needs only which meters show; drawing asks again with the
  // parts in hand, which say how many pips each length of meter holds.
  const framed = framedOn(spec.frame, heroFaces(unit, spec).hidden);
  const portraitAt = spec.groups?.portrait;
  const letter = spec.groups?.newLetter;
  // The letter stands past the ring's edge, so it is drawn on its own rather
  // than widening the frame's picture.
  const faces = (whole: readonly PiecePart[]) => {
    const { hidden, frames } = heroFaces(unit, spec, whole);
    return { hidden: [...hidden, ...strangers(whole, spec), ...(letter ? [letter] : [])], frames };
  };
  // Measured without what the frame never draws, so the ring stands flush
  // in the corner rather than a lit ring's width, or a meter's ornament's,
  // in from it.
  const corner = { ...CORNER, measuredWithout: neverDrawn(spec) };
  const under = useWorn(
    spec.dialog,
    framed,
    whole => ({
      ...faces(whole),
      ...(portraitAt ? { split: { at: portraitAt, keep: 'before' as const } } : {}),
    }),
    corner,
  );
  const over = useWorn(
    portraitAt ? spec.dialog : undefined,
    framed,
    whole => ({ ...faces(whole), split: { at: portraitAt ?? '', keep: 'after' } }),
    corner,
  );

  if (!under.frame) return null;
  const frame = under.frame;
  const lettered = over.image ? over : under;
  const level = lettered.fieldOf(lettered.find(spec.values?.level));
  const spot = portraitAt ? under.find(portraitAt) : undefined;
  const letterAt = letter && mailWaiting.value > 0 ? beside(under, letter, framed) : undefined;
  const pct = (units: number, of: number): string => `${(units / of) * 100}%`;

  const hangs = cornerOverhang(under.onStage, under.stage, 'left');
  const perUnit = (parseFloat(String(under.sized.width)) || frame.w) / frame.w;

  return (
    <div
      className="relative"
      style={{
        ...under.sized,
        transform: `translate(${hangs.x * perUnit}px, ${hangs.y * perUnit}px)`,
      }}
    >
      {under.image && (
        <img
          ref={under.pictureRef}
          src={under.image.url}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={under.sized}
          draggable={false}
        />
      )}
      {portraitUrl && spot && (
        <div
          aria-hidden="true"
          data-socket
          className="pointer-events-none absolute overflow-hidden rounded-full"
          style={{
            left: pct(spot.box.x + SOCKET.dx - SOCKET.r, frame.w),
            top: pct(spot.box.y + SOCKET.dy - SOCKET.r, frame.h),
            width: pct(SOCKET.r * 2, frame.w),
            height: pct(SOCKET.r * 2, frame.h),
          }}
        >
          <img src={portraitUrl} alt="" className="size-full object-cover" draggable={false} />
        </div>
      )}
      {over.image && (
        <img
          ref={over.pictureRef}
          src={over.image.url}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={over.sized}
          draggable={false}
        />
      )}
      {level && <span style={lettered.words(level, LIGHT)}>{unit.level}</span>}
      {letter && letterAt && (
        <span
          data-hud="mail-waiting"
          role="img"
          aria-label={
            mailWaiting.value === 1
              ? 'A letter is waiting'
              : `${mailWaiting.value} letters are waiting`
          }
          className="pointer-events-none absolute"
          style={under.box(letterAt)}
        >
          <WornPiece dialog={spec.dialog} part={letter} box={{ width: '100%', height: '100%' }} />
        </span>
      )}
    </div>
  );
}
