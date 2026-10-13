/**
 * The target frame in the shipped art: ring, level, marks, gauges (clips of
 * faces revealed by a stepping mask) and the cast bar while casting. Our
 * portrait sits between two halves of the art split at the portrait spot,
 * so the glass shows in front of the face. The banner beside it is
 * `ArtTopbarMenu`. What each part is comes from the screen spec.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { Unit } from '../hudStore';
import { barRun, faceFor, shareOf } from '../art/faceRuns';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornPiece } from '../art/WornPiece';
import { strangers } from './ArtPlayerFrame';
import { ArtTopbarMenu } from './ArtTopbarMenu';
import type { TopbarAction } from './ArtTopbarMenu';
import { cx } from './cx';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const TARGET_FRAME_SCREEN = 'targetFrame';

/** The frame stands at its own size in a HUD corner, not at a place on a stage. */
const CORNER = { unplaced: true } as const;

/**
 * The portrait socket from the movie's portrait spot, fitted by raycasting
 * to the ring's opaque edge (residual 0.1). The hole is off the spot; the
 * radius exceeds it (22.0) so the rim covers the photo's edge.
 */
const SOCKET = { dx: 1.0, dy: -2.6, r: 22.4 };

/** The name banner's corner from the same spot, read off the movie (banner and HUD share a stage point). */
const BANNER = { dx: 4.2, dy: -33.1 };

type Resource = 'mana' | 'vigor' | 'morale';

export interface ArtFocusPanelProps {
  unit: Unit;
  /** A headshot, if the body behind this unit has rendered one yet. */
  portraitUrl?: string;
  /** What the toolbar offers, in the order it should be offered. */
  actions: readonly TopbarAction[];
  /** How far the unit's cast has gone, 0 to 1; null or left out while it casts nothing. */
  cast?: number | null;
  className?: string;
}

export function ArtFocusPanel(props: ArtFocusPanelProps): JSX.Element | null {
  const spec = useWornScreen(TARGET_FRAME_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

/** Each gauge's face, by clip path: health always on the green run (observed in play by the owner); empty when dead. */
export function gaugeFaces(
  shown: Pick<Unit, 'health' | 'maxHealth' | 'mana' | 'maxMana' | 'dead'>,
  bars: NonNullable<ScreenSpec['bars']>,
  resource: Resource,
): Record<string, number> {
  const faces: Record<string, number> = {};
  const dead = shown.dead || shown.health <= 0;
  const health = bars.of.health;
  if (health) {
    const which = bars.runsFor?.health?.indexOf('friendly') ?? -1;
    const run = barRun(bars, health, Math.max(0, which));
    faces[health] = faceFor(dead ? 0 : shareOf(shown.health, shown.maxHealth), run);
  }
  const spent = bars.of[resource];
  if (spent) {
    faces[spent] = faceFor(dead ? 0 : shareOf(shown.mana, shown.maxMana), barRun(bars, spent));
  }
  return faces;
}

/** The cast bar's face for a cast this far gone, or none while nothing is cast. */
export function castFaces(
  share: number | null,
  bar: { at: string; frames: number } | undefined,
): { hidden: string[]; frames: Record<string, number> } {
  if (!bar) return { hidden: [], frames: {} };
  if (share === null) return { hidden: [bar.at], frames: {} };
  return { hidden: [], frames: { [bar.at]: faceFor(share, { first: 0, last: bar.frames }) } };
}

function Worn({
  unit: target,
  portraitUrl,
  actions,
  cast = null,
  className,
  spec,
}: ArtFocusPanelProps & { spec: ScreenSpec }): JSX.Element | null {
  // Open for a player target until an action is used; closed until tapped
  // again, remembered per target so a new target opens it afresh.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const canAct = target.kind === 'player' && actions.length > 0;
  const toolbarOpen = canAct && closedFor !== target.id;
  const setToolbarOpen = (next: boolean): void => setClosedFor(next ? null : target.id);
  const resource: Resource = target.resource ?? 'mana';
  const bars = spec.bars;
  const portraitAt = spec.groups?.portrait;

  const hidden = [
    ...(spec.hidden ?? []),
    ...(!target.dead && spec.groups?.dead ? [spec.groups.dead] : []),
    ...(!target.inCombat && spec.groups?.combat ? [spec.groups.combat] : []),
    // One resource clip shows, the one this unit's class spends; the
    // others share its place and would draw over it.
    ...Object.entries(bars?.of ?? {})
      .filter(([what]) => what !== 'health' && what !== resource)
      .map(([, where]) => where),
  ];
  const casting = castFaces(cast, bars?.own?.cast);
  hidden.push(...casting.hidden);
  const frames = { ...(bars ? gaugeFaces(target, bars, resource) : {}), ...casting.frames };

  // No portrait spot: one picture, no split. The frame is cut from the HUD
  // dialog, leaving out the tour pulse and the switch (stood on its own).
  const under = useWorn(
    spec.dialog,
    spec.frame,
    whole => ({
      hidden: [...hidden, ...strangers(whole, spec)],
      frames,
      ...(portraitAt ? { split: { at: portraitAt, keep: 'before' as const } } : {}),
    }),
    CORNER,
  );
  const over = useWorn(
    portraitAt ? spec.dialog : undefined,
    spec.frame,
    whole => ({
      hidden: [...hidden, ...strangers(whole, spec)],
      frames,
      split: { at: portraitAt ?? '', keep: 'after' },
    }),
    CORNER,
  );

  if (!under.frame) return null;
  const frame = under.frame;
  // Words are sized against a drawn picture; the upper half always has the
  // ring in it, the lower half can come out empty.
  const lettered = over.image ? over : under;
  const level = lettered.fieldOf(lettered.find(spec.values?.level));
  const spot = portraitAt ? under.find(portraitAt) : undefined;
  const isPlayer = target.kind === 'player';
  const swap = spec.pieces?.switch;

  /** A point `dx, dy` movie units from the portrait spot, as a percentage of the frame. */
  const fromSpot = (dx: number, dy: number): { left: string; top: string } => ({
    left: `${(((spot?.box.x ?? 0) + dx) / frame.w) * 100}%`,
    top: `${(((spot?.box.y ?? 0) + dy) / frame.h) * 100}%`,
  });
  const socketCorner = fromSpot(SOCKET.dx - SOCKET.r, SOCKET.dy - SOCKET.r);
  const portraitBox: JSX.CSSProperties = {
    ...socketCorner,
    width: `${((SOCKET.r * 2) / frame.w) * 100}%`,
    height: `${((SOCKET.r * 2) / frame.h) * 100}%`,
  };

  return (
    <div
      role="group"
      aria-label={target.name}
      // No `overflow-hidden` here: the banner is placed outside this box.
      className={cx('relative touch-none', className)}
      style={under.sized}
    >
      {/*
       * The name banner and toolbar (`dlgTopBar`) at `BANNER`, painted first
       * so the ring covers its left end. Keyed on the unit to replay its slide;
       * `stopPropagation` because the HUD clears the target on any click.
       */}
      {spot && (
        <div
          className="absolute"
          style={fromSpot(BANNER.dx, BANNER.dy)}
          onClick={event => event.stopPropagation()}
        >
          <ArtTopbarMenu
            key={target.id}
            name={target.name}
            classId={isPlayer ? target.classId : undefined}
            actions={canAct ? actions : []}
            open={toolbarOpen}
            onOpenChange={setToolbarOpen}
          />
        </div>
      )}

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

      {/* Between the two halves of the art: over the socket and the
          resource bar, under the ring and its glass. The box lives on a
          wrapper `div`, not the `img`: an absolutely placed image sizes
          itself off its own pixels whatever box it is given. */}
      {portraitUrl && spot && (
        <div
          aria-hidden="true"
          className={cx('absolute overflow-hidden rounded-full', canAct && 'cursor-pointer')}
          style={portraitBox}
          onClick={
            canAct
              ? event => {
                  event.stopPropagation();
                  setToolbarOpen(true);
                }
              : undefined
          }
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

      {/* The switch stands beside a creature's frame, where the movie
          puts it; a player's frame has the toolbar instead. */}
      {!isPlayer && swap && (
        <div data-switch className="pointer-events-none absolute inset-0">
          <WornPiece dialog={swap.dialog ?? spec.dialog} part={swap.part} within={frame} />
        </div>
      )}

      {level && <span style={lettered.words(level, LIGHT)}>{target.level}</span>}
    </div>
  );
}
