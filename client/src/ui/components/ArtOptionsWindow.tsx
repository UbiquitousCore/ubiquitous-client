/**
 * Settings on the shipped page: switches, the slider for ranges, and stepped
 * values written beside their control. The column is drawn apart and slid
 * under the window for smooth scrolling. The settings are this client's.
 */

import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';

import type { PieceBox } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import type { Worn } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornChevrons } from '../art/WornChevrons';
import { WornSlider } from '../art/WornSlider';
import {
  MAX_UI_SCALE,
  MAX_VIEW_DISTANCE,
  MIN_RENDER_SCALE,
  MIN_UI_SCALE,
  MIN_VIEW_DISTANCE,
  SHADOW_CHOICES,
  TONE_MAPPINGS,
  clampQuality,
  nearestAnchor,
} from '../../core/graphics';
import type { ShadowChoice } from '../../core/graphics';
import type { PiecePart } from '../art/piecePlan';
import { ACTIONS, ACTION_LABELS, keyLabel, keyOf, rebind } from '../../gameplay/keybinds';
import type { BindableAction } from '../../gameplay/keybinds';
import { options, setOptions } from '../optionsStore';
import { sessionActions } from '../sessionStore';
import { WornHit, useHeld } from '../frontend/wornBits';
import { ArtAskBox } from './ArtAskBox';
import type { OptionsState } from '../optionsStore';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const OPTIONS_SCREEN = 'options';

/** Our names for the two questions asked before leaving the world. */
const CHARACTER_LIST_ASK = 'characterListAsk';
const MAIN_MENU_ASK = 'mainMenuAsk';

/** The panel stands in a row beside the bar, not at a place on a stage. */
const ROW = { unplaced: true } as const;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

/** What a control on this page does about one setting. */
interface Setting {
  /** What it is called, in this client's own words. */
  label: string;
  /** Whether the switch is over, for the ones that are on or off. */
  on?(held: OptionsState): boolean;
  /** What it is set to, for the ones that are not simply on or off. */
  says?(held: OptionsState): string;
  /** What pressing it leaves the setting at. */
  next(held: OptionsState): Partial<OptionsState>;
  /** Where a range setting sits, worn on the page's slider clip. */
  at?(held: OptionsState): number;
  set?(at: number): Partial<OptionsState>;
  /** The action a key row binds: pressing it listens for the next key. */
  binds?: BindableAction;
}

/** A row for one action's keys. */
function keyRow(action: BindableAction): Setting {
  return {
    label: ACTION_LABELS[action],
    says: held => held.keybinds[action].map(keyLabel).join(', ') || 'Unbound',
    next: () => ({}),
    binds: action,
  };
}

/** On or off, which is what most of them are. */
function flag(key: keyof OptionsState, label: string): Setting {
  return {
    label,
    on: held => held[key] === true,
    next: held => ({ [key]: !held[key] }) as Partial<OptionsState>,
  };
}

/** The next value of a run, wrapping back to the first. */
function after<T>(run: readonly T[], now: T): T {
  const at = run.indexOf(now);
  return run[(at + 1) % run.length] ?? run[0]!;
}

const RENDER_SCALES = [MIN_RENDER_SCALE, 0.75, 1];
const UI_SCALES = Array.from(
  { length: MAX_UI_SCALE - MIN_UI_SCALE + 1 },
  (_, at) => MIN_UI_SCALE + at,
);
const FOGS = [0, 0.25, 0.5, 0.75, 1];
const VIEW_DISTANCES: ReadonlyArray<number | 'auto'> = [
  'auto',
  MIN_VIEW_DISTANCE,
  Math.round((MIN_VIEW_DISTANCE + MAX_VIEW_DISTANCE) / 2),
  MAX_VIEW_DISTANCE,
];

/** Every setting this page shows, by our own name for it. */
const SETTINGS: Record<string, Setting> = {
  music: flag('music', 'Music'),
  sound: flag('sound', 'Sound effects'),
  damageNumbers: flag('damageNumbers', 'Combat numbers'),
  touchStick: flag('touchStick', 'On-screen stick'),
  antialias: flag('antialias', 'Anti-aliasing (needs reload)'),
  fog: {
    label: 'Fog',
    says: held => `${Math.round(held.fog * 100)}%`,
    next: held => ({ fog: after(FOGS, Math.round(held.fog * 4) / 4) }),
    at: held => held.fog,
    set: at => ({ fog: Math.round(at * 20) / 20 }),
  },
  toneMapping: {
    label: 'Tone mapping',
    says: held =>
      TONE_MAPPINGS.find(choice => choice.value === held.toneMapping)?.label ?? held.toneMapping,
    next: held => ({
      toneMapping: after(
        TONE_MAPPINGS.map(choice => choice.value),
        held.toneMapping,
      ),
    }),
  },
  diagnostics: flag('diagnostics', 'Diagnostics overlay'),
  renderScale: {
    label: 'Render scale',
    says: held => `${Math.round(held.renderScale * 100)}%`,
    next: held => ({ renderScale: after(RENDER_SCALES, held.renderScale) }),
    at: held => (held.renderScale - MIN_RENDER_SCALE) / (1 - MIN_RENDER_SCALE),
    set: at => ({
      renderScale: Math.round((MIN_RENDER_SCALE + at * (1 - MIN_RENDER_SCALE)) * 20) / 20,
    }),
  },
  uiScale: {
    label: 'Interface detail',
    says: held => `${held.uiScale}×`,
    next: held => ({ uiScale: after(UI_SCALES, held.uiScale) }),
    at: held => (held.uiScale - MIN_UI_SCALE) / (MAX_UI_SCALE - MIN_UI_SCALE),
    set: at => ({ uiScale: Math.round(MIN_UI_SCALE + at * (MAX_UI_SCALE - MIN_UI_SCALE)) }),
  },
  shadowMode: {
    label: 'Shadows',
    says: held =>
      SHADOW_CHOICES.find(choice => choice.value === held.shadowMode)?.label ?? held.shadowMode,
    next: held => ({
      shadowMode: after(
        SHADOW_CHOICES.map(choice => choice.value),
        held.shadowMode,
      ) as ShadowChoice,
    }),
  },
  viewDistance: {
    label: 'View distance',
    says: held => (held.viewDistance === 'auto' ? 'Auto' : `${Math.round(held.viewDistance)}`),
    next: held => ({ viewDistance: after(VIEW_DISTANCES, held.viewDistance) }),
    at: held =>
      held.viewDistance === 'auto'
        ? 0
        : (held.viewDistance - MIN_VIEW_DISTANCE) / (MAX_VIEW_DISTANCE - MIN_VIEW_DISTANCE),
    // Hard against the near end is the setting left to the quality
    // slider, which is what the screen it came from called Auto.
    set: at => ({
      viewDistance:
        at < 0.02
          ? 'auto'
          : Math.round((MIN_VIEW_DISTANCE + at * (MAX_VIEW_DISTANCE - MIN_VIEW_DISTANCE)) / 10) *
            10,
    }),
  },
  ...Object.fromEntries(ACTIONS.map(action => [`key:${action}`, keyRow(action)])),
};

/**
 * Settings the page has no switch for (1.1.4 has eleven) get rows built from
 * its own art, below the last: the four of this client's own, then a row for
 * each action's keys.
 */
const EXTRA_ROWS: readonly string[] = [
  'fog',
  'toneMapping',
  ...ACTIONS.map(action => `key:${action}`),
];

/** A part moved down by `dy` movie units. */
function shifted(part: PiecePart, dy: number): PiecePart {
  return { ...part, box: { ...part.box, y: part.box.y + dy } };
}

/**
 * Where to put a whole picture, `frame` in size, inside a box that clips it,
 * so that its `from` part is what fills the box.
 */
function cutFrom(frame: PieceBox, from: PieceBox): JSX.CSSProperties {
  return {
    position: 'absolute',
    left: `${(-from.x / from.w) * 100}%`,
    top: `${(-from.y / from.h) * 100}%`,
    width: `${(frame.w / from.w) * 100}%`,
    height: `${(frame.h / from.h) * 100}%`,
    maxWidth: 'none',
  };
}

/** What the slider at the top of the page stands for, and its steps. */
const RANGE = { key: 'quality', label: 'Quality', steps: [0, 0.25, 0.5, 0.75, 1] } as const;

export interface ArtOptionsWindowProps {
  onClose(): void;
}

export function ArtOptionsWindow(props: ArtOptionsWindowProps): JSX.Element | null {
  const spec = useWornScreen(OPTIONS_SCREEN);
  const [settings, setSettings] = useState(false);
  if (!spec) return null;
  // The window opens on its main page, where the build has one, and the
  // settings are a page off it.
  return spec.panels?.main && !settings ? (
    <MainPage {...props} spec={spec} onSettings={() => setSettings(true)} />
  ) : (
    <Worn {...props} spec={spec} />
  );
}

/** What each control on the main page does, by our name for it. */
type MainChoice = 'gameSettings' | 'characterList' | 'mainMenu';

/** Which message box asks before a way out of the world is taken. */
const ASKS: Partial<Record<MainChoice, { screen: string; label: string }>> = {
  characterList: { screen: CHARACTER_LIST_ASK, label: 'Back to the character list' },
  mainMenu: { screen: MAIN_MENU_ASK, label: 'Back to the main menu' },
};

/**
 * The page the window opens on: a column of buttons, of which this client
 * has the settings, the character list and the main menu. Leaving the
 * world is asked about first, in the build's own words.
 */
function MainPage({
  onClose,
  onSettings,
  spec,
}: ArtOptionsWindowProps & { spec: ScreenSpec; onSettings(): void }): JSX.Element | null {
  const { hold, faces } = useHeld();
  const [asking, setAsking] = useState<MainChoice | null>(null);
  // Asked in the build's own box where it has one; without it, the
  // choice is taken as pressed rather than left with no way to agree.
  const asks: Partial<Record<MainChoice, ScreenSpec | null>> = {
    characterList: useWornScreen(CHARACTER_LIST_ASK),
    mainMenu: useWornScreen(MAIN_MENU_ASK),
  };
  const pages = [spec.panels?.settings ?? '', spec.panels?.scroll ?? '', spec.panels?.bar ?? ''];
  const hidden = [...(spec.hidden ?? []), ...pages.filter(Boolean)];
  const worn = useWorn(spec.dialog, spec.frame, { hidden, frames: faces }, ROW);
  if (!worn.image || !worn.frame) return null;

  const leave = (what: MainChoice): void => {
    setAsking(null);
    onClose();
    if (what === 'characterList') sessionActions().backToCharacterList();
    else if (what === 'mainMenu') sessionActions().backToMainMenu();
  };
  const choose = (what: MainChoice): void => {
    if (what === 'gameSettings') onSettings();
    else if (asks[what]) setAsking(what);
    else leave(what);
  };
  const ask = asking ? ASKS[asking] : undefined;

  return (
    <div role="dialog" aria-modal="false" aria-label="Options" style={worn.placed}>
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="relative block h-full w-auto"
        draggable={false}
      />
      <WornCaptions worn={worn} spec={spec} tone={INK} hidden={hidden} />
      {Object.entries(spec.actions ?? {})
        .filter((entry): entry is [string, MainChoice] =>
          ['gameSettings', 'characterList', 'mainMenu'].includes(entry[1]),
        )
        .map(([where, what]) => (
          <WornHit
            key={where}
            worn={worn}
            part={worn.find(where)}
            label={spec.captions?.[`${where}/text`] ?? what}
            onHold={hold(where)}
            onPress={() => choose(what)}
          />
        ))}
      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close options"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
      {asking && ask ? (
        <ArtAskBox
          screen={ask.screen}
          label={ask.label}
          acceptLabel="Yes"
          onAccept={() => leave(asking)}
          onDecline={() => setAsking(null)}
        />
      ) : null}
    </div>
  );
}

/** Two things under one key, without a wrapper the layout would see. */
function Fragmentish({ children }: { children: (JSX.Element | null)[] }): JSX.Element {
  return <>{children}</>;
}

/** A box on a picture, as a fraction of the picture it is drawn on. */
function boxIn(worn: Worn, box: PieceBox): JSX.CSSProperties {
  const frame = worn.frame;
  if (!frame) return {};
  return {
    position: 'absolute',
    left: `${(box.x / frame.w) * 100}%`,
    top: `${(box.y / frame.h) * 100}%`,
    width: `${(box.w / frame.w) * 100}%`,
    height: `${(box.h / frame.h) * 100}%`,
  };
}

function Worn({ onClose, spec }: ArtOptionsWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const held = options.value;
  const [down, setDown] = useState(0);
  /** The key row waiting for a key: the next one pressed becomes its binding, Escape leaves it. */
  const [listening, setListening] = useState<BindableAction | null>(null);
  const dragging = useRef<{ from: number; at: number; moved: boolean } | null>(null);
  /** The column itself, so sliding it does not redraw the whole page. */
  const column_ = useRef<HTMLDivElement>(null);
  /** Where it has been slid to, and where the screen last thought it was. */
  const held_ = useRef(0);
  const shown_ = useRef(0);

  /** A part's path inside the column's own picture, without the column's name. */
  const inside = (where: string | undefined): string | undefined => {
    const scroll = spec.panels?.scroll;
    return where && scroll && where.startsWith(`${scroll}/`)
      ? where.slice(scroll.length + 1)
      : where;
  };

  /** Which control shows which setting; the crossed disc (first face) is on. */
  const controls = Object.entries(spec.actions ?? {});
  const faces: Record<string, number> = {};
  for (const [where, what] of controls) {
    const setting = SETTINGS[what];
    const named = inside(where);
    if (!setting || !named) continue;
    // A setting that is neither on nor off wears the plain disc: the
    // crossed one would read as a switch that is over.
    faces[named] = setting.on ? (setting.on(held) ? 0 : (spec.faces?.[where] ?? 1)) : 1;
  }
  // The slider steps to the face that stands for how far along it is:
  // the first face is full, the last is empty.
  if (spec.bars) {
    for (const [what, where] of Object.entries(spec.bars.of)) {
      const full = what === RANGE.key ? clampQuality(held.quality) : 0;
      const named = inside(where);
      if (named) faces[named] = Math.max(0, Math.round((1 - full) * (spec.bars.frames - 1)));
    }
  }

  // The panel itself, without the column that scrolls: that is drawn on
  // its own below, so it can be slid under the window.
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: spec.shown ?? [],
      withoutArt: [spec.marks?.above ?? '', spec.marks?.below ?? ''].filter(Boolean),
      hidden: [
        ...(spec.hidden ?? []),
        spec.panels?.main ?? '',
        spec.panels?.scroll ?? '',
        spec.panels?.bar ?? '',
      ],
    },
    ROW,
  );
  /** The switches a slider is drawn over, which are not drawn at all. */
  const slid = controls
    .filter(([, what]) => SETTINGS[what]?.at)
    .map(([where]) => inside(where) ?? '')
    .filter(Boolean);

  /** The column of settings, as a picture of its own. */
  const column = useWorn(
    spec.panels?.scroll,
    spec.panels?.scroll,
    // Placed but not drawn: the row still says where its control
    // goes, and the slider is drawn across it in the switch's place.
    { frames: faces, withoutArt: slid },
    { floats: true },
  );

  /**
   * The column again with every switch showing one face: all crossed (on)
   * and all plain (off). An extra row is cut from these, so its disc says
   * its own setting's state rather than whichever row it was copied from.
   */
  const switches = controls.filter(([, what]) => SETTINGS[what]?.on && !SETTINGS[what]?.at);
  const allFaces = (on: boolean): Record<string, number> =>
    Object.fromEntries(
      switches
        .map(([where]) => [inside(where) ?? '', on ? 0 : (spec.faces?.[where] ?? 1)] as const)
        .filter(([named]) => named),
    );
  const allOn = useWorn(
    spec.panels?.scroll,
    spec.panels?.scroll,
    { frames: allFaces(true), withoutArt: slid },
    { floats: true },
  );
  const allOff = useWorn(
    spec.panels?.scroll,
    spec.panels?.scroll,
    { frames: allFaces(false), withoutArt: slid },
    { floats: true },
  );

  if (!worn.image || !worn.frame || !column.image || !column.frame) return null;

  const window_ = worn.find(spec.panels?.window);
  /**
   * Where the column stands inside its window at rest, as a share of the
   * window: the movie keeps it a little in from the window's corner.
   */
  const columnAt = worn.whole.find(part => part.path === spec.panels?.scroll)?.box;
  const inset =
    window_ && columnAt && window_.box.w > 0 && window_.box.h > 0
      ? {
          left: `${Math.round(((columnAt.x - window_.box.x) / window_.box.w) * 1000) / 10}%`,
          top: `${Math.round(((columnAt.y - window_.box.y) / window_.box.h) * 1000) / 10}%`,
        }
      : {};
  /** The column at the screen's scale, sized from movie units rather than stretched to the window. */
  const wide = column.frame.w * worn.scale;
  /** A clear run at the foot, so the last row is not against the edge. */
  const tall = column.frame.h * worn.scale + (window_ ? window_.box.h * worn.scale * 0.15 : 0);
  /** The clip every slider on this page is drawn from. */
  const slider = inside(Object.values(spec.bars?.of ?? {})[0]);

  /** Slide the column by transform; only a change in which controls are in sight re-renders. */
  const slide = (to: number): void => {
    held_.current = to;
    if (column_.current) column_.current.style.transform = `translateY(${-to}px)`;
    // Only when the window has moved on by a control's height does the
    // screen need to think again about which ones are in sight.
    if (Math.abs(to - shown_.current) > 24) {
      shown_.current = to;
      setDown(to);
    }
  };
  /**
   * The extra rows' place: one row-height apart, from below the last switch
   * row, which is the one they copy. A row-height is the commonest gap
   * between the column's rows.
   */
  const rows = switches
    .map(([where, what]) => ({
      part: column.find(inside(where)),
      field: column.fieldOf(column.find(inside(spec.values?.[what]))),
    }))
    .filter((row): row is { part: PiecePart; field: PiecePart } => !!row.part && !!row.field)
    .sort((a, b) => a.part.box.y - b.part.box.y);
  const template = rows[rows.length - 1];
  const gaps = rows
    .slice(1)
    .map((row, at) => row.part.box.y - rows[at]!.part.box.y)
    .filter(gap => gap > 0)
    .sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 0;
  const extras =
    template && pitch > 0 && allOn.image && allOff.image
      ? EXTRA_ROWS.filter(what => !controls.some(([, mapped]) => mapped === what))
      : [];
  /** Drawn pixels per movie unit down the column, as the picture is laid out. */
  const perUnitDown = tall / column.frame.h;
  /** How far past the column's own foot the last extra row reaches, in drawn pixels. */
  const below = template
    ? Math.max(
        0,
        (template.part.box.y + template.part.box.h + pitch * extras.length - column.frame.h) *
          perUnitDown,
      )
    : 0;
  /** How much of the column is out of sight, in drawn pixels. */
  const room = window_ ? window_.box.h * worn.scale : 0;
  const over = Math.max(0, tall + below - room);
  const at = Math.min(over, Math.max(0, down));
  const quality = `${RANGE.label}: ${nearestAnchor(held.quality).name}`;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Settings"
      className="touch-none overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="relative block h-full w-auto"
        draggable={false}
      />

      <WornCaptions
        worn={worn}
        spec={spec}
        tone={LIGHT}
        hidden={[...(spec.hidden ?? []), spec.panels?.main ?? ''].filter(Boolean)}
      />

      {/* The window the column scrolls under. */}
      {window_ ? (
        <div
          className="overflow-hidden"
          style={{ ...worn.box(window_), pointerEvents: 'auto' }}
          onWheel={(event: WheelEvent) => {
            event.stopPropagation();
            event.preventDefault();
            slide(Math.min(over, Math.max(0, held_.current + event.deltaY)));
          }}
          onPointerDown={(event: PointerEvent) => {
            // Noted, not captured: taking the pointer here would swallow
            // the press on every control in the column, which is what
            // made the whole page look dead.
            dragging.current = { from: event.clientY, at, moved: false };
          }}
          onPointerMove={(event: PointerEvent) => {
            const grab = dragging.current;
            if (!grab) return;
            const by = event.clientY - grab.from;
            // A press that has not moved far is a press, not a drag.
            if (!grab.moved && Math.abs(by) < 4) return;
            if (!grab.moved) {
              grab.moved = true;
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            }
            slide(Math.min(over, Math.max(0, grab.at - by)));
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
        >
          <div
            ref={column_}
            className="relative will-change-transform"
            style={{ ...inset, transform: `translateY(${-at}px)` }}
          >
            <img
              ref={column.pictureRef}
              src={column.image.url}
              alt=""
              aria-hidden="true"
              className="block"
              style={{ width: `${wide}px`, height: `${tall}px` }}
              draggable={false}
            />

            {/* The slider at the top of the page. */}
            {(() => {
              const part = column.find(inside(spec.panels?.quality));
              const field = column.fieldOf(column.find(inside(spec.values?.quality)));
              if (!part) return null;
              return (
                <>
                  <button
                    type="button"
                    aria-label={quality}
                    onClick={() =>
                      setOptions({
                        ...held,
                        quality:
                          RANGE.steps.find(step => step > clampQuality(held.quality) + 0.01) ??
                          RANGE.steps[0]!,
                      })
                    }
                    style={boxIn(column, part.box)}
                    className={HIT}
                  />
                  {field ? <span style={column.words(field, INK)}>{quality}</span> : null}
                </>
              );
            })()}

            {/* One control to a setting, and only the ones in sight: a
                control scrolled out of the window is not on the screen,
                and drawing it puts words outside the panel. */}
            {controls.map(([where, what]) => {
              const setting = SETTINGS[what];
              const part = column.find(inside(where));
              if (!setting || !part) return null;
              const top = part.box.y * column.scale;
              if (top + part.box.h * column.scale < at || top > at + room) return null;
              const field = column.fieldOf(column.find(inside(spec.values?.[what])));
              const says = setting.says ? `${setting.label}: ${setting.says(held)}` : setting.label;
              // A range wears a slider, drawn from the page's own clip and
              // laid across the row from its words to the far edge of its
              // switch — the room the row gives a control of any kind.
              const range = setting.at && setting.set && slider && field;
              return (
                <Fragmentish key={where}>
                  {range && setting.at && setting.set ? (
                    <WornSlider
                      dialog={spec.panels?.scroll ?? ''}
                      part={slider}
                      frames={spec.bars?.frames ?? 51}
                      at={setting.at(held)}
                      says={says}
                      label={setting.label}
                      box={boxIn(column, {
                        x: field.box.x,
                        y: part.box.y,
                        w: part.box.x + part.box.w - field.box.x,
                        h: part.box.h,
                      })}
                      onSet={to => setOptions({ ...held, ...setting.set!(to) })}
                    />
                  ) : (
                    <button
                      type="button"
                      {...(setting.on ? { role: 'switch', 'aria-checked': setting.on(held) } : {})}
                      aria-label={says}
                      onClick={() => setOptions({ ...held, ...setting.next(held) })}
                      style={boxIn(column, part.box)}
                      className={HIT}
                    />
                  )}
                  {field ? (
                    <span
                      style={{
                        ...column.words(field, INK),
                        // Over the slider it sits on, so the words still read.
                        ...(range ? { textShadow: '0 1px 2px rgba(0,0,0,0.65)' } : {}),
                      }}
                    >
                      {says}
                    </span>
                  ) : null}
                </Fragmentish>
              );
            })}

            {/* The rows the page has no switch for, below its last one:
                that row's backing, cut from the all-off copy of the
                column, and the crossed disc from the all-on copy where
                the setting is on. */}
            {extras.map((what, index) => {
              const setting = SETTINGS[what];
              const frame = column.frame;
              if (!setting || !template || !frame || !allOn.image || !allOff.image) return null;
              const dy = pitch * (index + 1);
              const stripTop = template.part.box.y + template.part.box.h / 2 - pitch / 2;
              const strip = { x: 0, y: stripTop, w: frame.w, h: pitch };
              const top = (stripTop + dy) * perUnitDown;
              if (top + pitch * perUnitDown < at || top > at + room + below) return null;
              const part = shifted(template.part, dy);
              const field = shifted(template.field, dy);
              const on = setting.on?.(held) === true;
              const waiting = setting.binds !== undefined && listening === setting.binds;
              const says = waiting
                ? `${setting.label}: Press a key…`
                : setting.says
                  ? `${setting.label}: ${setting.says(held)}`
                  : setting.label;
              // A range wears the page's slider across the row, as a row of
              // the page's own that is a range does.
              if (setting.at && setting.set && slider) {
                // The backing either side of the copied row's disc, which
                // the slider stands in place of.
                const sides = [
                  { ...strip, w: template.part.box.x },
                  {
                    ...strip,
                    x: template.part.box.x + template.part.box.w,
                    w: frame.w - template.part.box.x - template.part.box.w,
                  },
                ].filter(side => side.w > 0);
                const backing = allOff.image.url;
                return (
                  <Fragmentish key={what}>
                    <>
                      {sides.map(side => (
                        <div
                          key={side.x}
                          aria-hidden="true"
                          className="overflow-hidden"
                          style={boxIn(column, { ...side, y: side.y + dy })}
                        >
                          <img
                            src={backing}
                            alt=""
                            draggable={false}
                            style={cutFrom(frame, side)}
                          />
                        </div>
                      ))}
                    </>
                    <WornSlider
                      dialog={spec.panels?.scroll ?? ''}
                      part={slider}
                      frames={spec.bars?.frames ?? 51}
                      at={setting.at(held)}
                      says={says}
                      label={setting.label}
                      box={boxIn(column, {
                        x: field.box.x,
                        y: part.box.y,
                        w: part.box.x + part.box.w - field.box.x,
                        h: part.box.h,
                      })}
                      onSet={to => setOptions({ ...held, ...setting.set!(to) })}
                    />
                    <span
                      data-extra-setting={what}
                      style={{
                        ...column.words(field, INK),
                        textShadow: '0 1px 2px rgba(0,0,0,0.65)',
                      }}
                    >
                      {says}
                    </span>
                  </Fragmentish>
                );
              }
              return (
                <Fragmentish key={what}>
                  <div
                    aria-hidden="true"
                    className="overflow-hidden"
                    style={boxIn(column, { ...strip, y: strip.y + dy })}
                  >
                    <img
                      src={allOff.image.url}
                      alt=""
                      draggable={false}
                      style={cutFrom(frame, strip)}
                    />
                  </div>
                  {on ? (
                    <div
                      aria-hidden="true"
                      className="overflow-hidden"
                      style={boxIn(column, part.box)}
                    >
                      <img
                        src={allOn.image.url}
                        alt=""
                        draggable={false}
                        style={cutFrom(frame, template.part.box)}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    {...(setting.on ? { role: 'switch', 'aria-checked': on } : {})}
                    {...(setting.binds ? { 'aria-pressed': waiting } : {})}
                    aria-label={says}
                    data-extra-setting={what}
                    onClick={() =>
                      setting.binds
                        ? setListening(setting.binds)
                        : setOptions({ ...held, ...setting.next(held) })
                    }
                    onKeyDown={event => {
                      const action = setting.binds;
                      if (!action || listening !== action) return;
                      // Kept from the game, which would otherwise walk or
                      // cast on the key being bound.
                      event.preventDefault();
                      event.stopPropagation();
                      setListening(null);
                      if (event.key === 'Escape') return;
                      setOptions({
                        ...held,
                        keybinds: rebind(held.keybinds, action, keyOf(event)),
                      });
                    }}
                    onBlur={() => setListening(null)}
                    style={boxIn(column, part.box)}
                    className={HIT}
                  />
                  <span style={column.words(field, INK)}>{says}</span>
                </Fragmentish>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* The marks that say the page scrolls on, each sliding the way it
          points. */}
      <WornChevrons
        worn={worn}
        list={{ view: '', row: '', fields: {}, more: spec.marks }}
        slice={{
          roomFor: 0,
          from: at > 0 ? 1 : 0,
          furthest: (at > 0 ? 1 : 0) + (at < over ? 1 : 0),
          shown: [],
          keptRows: [],
          hidden: [],
          marks: [],
        }}
      />

      {/* How far down the column is, on the screen's own bar. */}
      {(() => {
        const track = worn.find(spec.panels?.bar);
        if (!track || over <= 0 || !window_ || !worn.frame) return null;
        const along = (at / over) * (window_.box.h - track.box.h);
        return (
          <div
            aria-hidden="true"
            style={{
              ...worn.box(track),
              top: `${((window_.box.y + along) / worn.frame.h) * 100}%`,
              background: 'var(--color-brass-500)',
              borderRadius: '9999px',
            }}
          />
        );
      })()}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}
