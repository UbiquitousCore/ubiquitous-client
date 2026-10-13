/**
 * The target's name banner (`dlgTopBar`), and for a player the actions
 * `TargetFrame` hands it. The banner slides in and the class badge rides its
 * end (players only); the toolbar's backing panel is hidden and each action
 * picture is a whole button. Icons fall back to captions until resolved. The
 * toolbar stays open until an action is picked; `open` lets the caller own it.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { iconUrl } from '../iconUrl';
import { classIcons, topbarIcons } from '../topbarIconStore';
import type { TopbarIconName } from '../topbarIconStore';
import { cx } from './cx';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const TOPBAR_MENU_SCREEN = 'topbarMenu';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

/**
 * How far past the banner's point the badge sits, in movie units — clear
 * of it, not tucked over it: the gap between the point and the badge's
 * left edge, in the same units as the banner's own authored width.
 */
const BADGE_GAP = 3;
/** How much smaller than its slot an action picture is drawn, in movie units: each is drawn at its slot's size less this. */
const ICON_MARGIN = 8;

/** How long the toolbar takes to slide, in ms. */
const SLIDE_MS = 200;

export interface TopbarAction {
  icon: TopbarIconName;
  label: string;
  /** Highlighted rather than merely present — today only follow toggles. */
  active?: boolean;
  onPick(): void;
}

export interface ArtTopbarMenuProps {
  /** Whose toolbar this is — the banner shows it. */
  name: string;
  /** The target's class number, for the badge. Absent draws no badge. */
  classId?: number;
  /** What to offer, in the order it should be offered. Empty draws no tap handler. */
  actions: readonly TopbarAction[];
  /** Whether the toolbar is open, where the caller keeps that itself. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
}

export function ArtTopbarMenu(props: ArtTopbarMenuProps): JSX.Element | null {
  const spec = useWornScreen(TOPBAR_MENU_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  name,
  classId,
  actions,
  open: asked,
  onOpenChange,
  spec,
}: ArtTopbarMenuProps & { spec: ScreenSpec }): JSX.Element | null {
  const [own, setOwn] = useState(false);
  const open = asked ?? own;
  const setOpen = (next: boolean): void => {
    if (onOpenChange) onOpenChange(next);
    if (asked === undefined) setOwn(next);
  };
  const canOpen = actions.length > 0;

  // Opened as it mounts, the toolbar still slides down rather than simply
  // being there: it is drawn tucked for the first frame, then let go.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const next = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(next);
  }, []);
  const shownOpen = open && arrived;

  const slots = Object.keys(spec.actions ?? {});
  const badgeAt = spec.groups?.badge;
  const nameAt = spec.groups?.banner;

  // The banner, without its badge: the badge is drawn on its own so it can
  // sit where the client moves it, at the banner's end.
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { hidden: [...(spec.hidden ?? []), ...(badgeAt ? [badgeAt] : [])] },
    { floats: true },
  );
  const badge = useWorn(
    classId !== undefined && badgeAt ? spec.dialog : undefined,
    badgeAt,
    {
      hidden: [
        ...(spec.hidden ?? []),
        ...(spec.frame ? [spec.frame].flat().filter(part => part !== badgeAt) : []),
      ],
    },
    { floats: true },
  );

  if (!worn.image || !worn.frame) return null;
  const frame = worn.frame;

  const bitmaps = topbarIcons.value;
  const nameField = worn.fieldOf(worn.find(spec.values?.name));
  const nameBox = nameAt ? worn.find(nameAt)?.box : undefined;
  // The badge's own picture is framed on the badge, so its frame is its
  // box — both frames are in the dialog's own coordinates.
  const badgeBox = badge.frame
    ? { x: badge.frame.x - frame.x, y: badge.frame.y - frame.y, w: badge.frame.w, h: badge.frame.h }
    : undefined;
  const pct = (units: number, of: number): string => `${(units / of) * 100}%`;

  // Closed, the dialog is as tall as its top row — banner and badge — and
  // open, as tall as the whole of it.
  const closedTo = Math.max(
    nameBox ? nameBox.y + nameBox.h : 0,
    badgeBox ? badgeBox.y + badgeBox.h : 0,
  );
  const closedHeight = closedTo * worn.perUnit;
  const fullHeight = frame.h * worn.perUnit;
  // The toolbar starts tucked up under the banner by the distance it opens.
  const tucked = fullHeight - closedHeight;

  const badgeX = nameBox ? nameBox.x + nameBox.w + BADGE_GAP : (badgeBox?.x ?? 0);
  const classPicture = classId !== undefined ? classIcons.value.get(classId) : undefined;
  const classSpot = badgeAt ? badge.find(`${badgeAt}/displaycallback`)?.box : undefined;
  // The class picture fills the badge inside its rim: the rim's width is
  // how far in the badge's own spot sits from its corner.
  const rim = classSpot ? Math.max(0, classSpot.x) : 0;

  return (
    <div
      role={canOpen ? 'button' : undefined}
      aria-label={canOpen ? `${name}: actions` : undefined}
      aria-expanded={canOpen ? open : undefined}
      tabIndex={canOpen ? 0 : undefined}
      className={cx(
        'relative overflow-hidden transition-[height] ease-out',
        canOpen && 'cursor-pointer',
      )}
      style={{
        width: worn.sized.width,
        height: `${shownOpen ? fullHeight : closedHeight}px`,
        transitionDuration: `${SLIDE_MS}ms`,
      }}
      // A tap opens it and nothing but picking an action closes it: the
      // toolbar is the reason a player is targeted, so it stays put.
      onClick={
        canOpen
          ? event => {
              event.stopPropagation();
              if (!open) setOpen(true);
            }
          : undefined
      }
    >
      {/* The toolbar, under the banner in paint order so it slides out from
          behind it. Kept mounted closed so it can slide back up, but hidden
          from assistive tech and from Tab while closed. */}
      {canOpen && (
        // Clipped to the space under the banner, so the buttons come out
        // from beneath it and are wholly out of sight when tucked away.
        <div
          className="pointer-events-none absolute left-0 overflow-hidden"
          style={{ top: `${closedHeight}px`, width: worn.sized.width, height: `${tucked}px` }}
        >
          <div
            role="menu"
            aria-label={`What to do with ${name}`}
            aria-hidden={!open}
            className={cx(
              'absolute left-0 transition-transform ease-out',
              open && 'pointer-events-auto',
            )}
            style={{
              ...worn.sized,
              top: `${-closedHeight}px`,
              transform: shownOpen ? 'translateY(0)' : `translateY(${-tucked}px)`,
              transitionDuration: `${SLIDE_MS}ms`,
            }}
          >
            {slots.map((control, index) => {
              const action = actions[index];
              if (!action) return null;
              const part = worn.find(control);
              if (!part) return null;
              const spot = worn.find(`${control}/displayCallback`)?.box;
              const bitmap = bitmaps.get(action.icon);
              const side = Math.max(1, part.box.w - ICON_MARGIN);
              return (
                <button
                  key={control}
                  type="button"
                  role="menuitem"
                  tabIndex={open ? 0 : -1}
                  aria-label={action.label}
                  aria-pressed={action.active === true}
                  onClick={event => {
                    event.stopPropagation();
                    action.onPick();
                    setOpen(false);
                  }}
                  style={worn.box(part)}
                  className={HIT}
                >
                  {bitmap ? (
                    <img
                      src={iconUrl(bitmap)}
                      alt=""
                      aria-hidden="true"
                      className="absolute object-contain"
                      style={{
                        left: pct(spot ? spot.x - part.box.x : ICON_MARGIN / 2, part.box.w),
                        top: pct(spot ? spot.y - part.box.y : ICON_MARGIN / 2, part.box.h),
                        width: pct(side, part.box.w),
                        height: pct(side, part.box.h),
                      }}
                      draggable={false}
                    />
                  ) : (
                    <span className="block text-micro text-parchment-100">{action.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* The banner row, sliding in from the left out from under the
          dialog's own edge — the wrapper's clip is the mask it slides from. */}
      <div
        className="pointer-events-none absolute inset-0 motion-safe:animate-[slide-in-left_var(--opening,260ms)_cubic-bezier(0.2,0.8,0.2,1)]"
        style={worn.sized}
      >
        <img
          ref={worn.pictureRef}
          src={worn.image.url}
          alt=""
          aria-hidden="true"
          className="block"
          style={worn.sized}
          draggable={false}
        />

        {nameField && <span style={worn.words(nameField, LIGHT)}>{name}</span>}

        {badge.image && badgeBox && (
          <div
            aria-hidden="true"
            className="absolute"
            style={{
              left: pct(badgeX, frame.w),
              top: pct(badgeBox.y, frame.h),
              width: pct(badgeBox.w, frame.w),
              height: pct(badgeBox.h, frame.h),
            }}
          >
            <img src={badge.image.url} alt="" className="block size-full" draggable={false} />
            {classPicture && (
              <img
                src={iconUrl(classPicture)}
                alt=""
                className="absolute object-contain"
                style={{
                  left: pct(rim, badgeBox.w),
                  top: pct(rim, badgeBox.h),
                  width: pct(badgeBox.w - rim * 2, badgeBox.w),
                  height: pct(badgeBox.h - rim * 2, badgeBox.h),
                }}
                draggable={false}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
