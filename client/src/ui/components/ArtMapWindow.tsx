/**
 * The full map: the movie's frame over our picture (region art with places,
 * the player, markers and, while travelling, the network), and the world
 * map's per-region press areas.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { WornPiece } from '../art/WornPiece';
import type { PiecePart } from '../art/piecePlan';
import type { PieceSpec, ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import type { Worn } from '../art/useWorn';
import { wornLettering } from '../art/wornFont';
import { closeMap, mapOpen } from '../hudStore';
import type { MapState } from '../hudStore';
import type { MapDirection, MapMarker, MapPlace, MapRegion } from '../mapModel';
import { cx } from './cx';
import { MapSurface } from './MapSurface';
import type { ViewChange } from './MapSurface';
import { arrowTurn } from './minimapMarks';
import {
  FITTED_VIEW,
  areaMapFrame,
  fittedWidth,
  markerShown,
  onPicture,
  regionDrawing,
  regionSpot,
  routeLine,
} from './mapView';
import type { MapView } from './mapView';

/** How long the region's banner stands before it slides away, in milliseconds. */
const BANNER_MS = 2000;

/** Our names for these screens. The specs say which dialog wears each. */
export const AREA_MAP_SCREEN = 'areaMap';
export const WORLD_MAP_SCREEN = 'worldMap';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtMapWindowProps extends MapState {
  /** True while the map is open to pick a teleport destination. */
  teleporting?: boolean;
  onSelectRegion?: (zoneId: number) => void;
  onTeleport?: (marker: MapMarker) => void;
}

/** Null where there is no movie to wear, which means there is no map. */
export function ArtMapWindow(props: ArtMapWindowProps): JSX.Element | null {
  const area = useWornScreen(AREA_MAP_SCREEN);
  const world = useWornScreen(WORLD_MAP_SCREEN);
  const [showing, setShowing] = useState<'area' | 'world'>('area');
  const [view, setView] = useState<MapView>(FITTED_VIEW);
  const open = mapOpen.value;

  // Closing the map puts it back on the player's own region, so reopening
  // it never lands somewhere the player was only browsing.
  useEffect(() => {
    if (!open) {
      setShowing('area');
      setView(FITTED_VIEW);
    }
  }, [open]);

  if (!open || !area) return null;

  const show = (next: 'area' | 'world'): void => {
    setShowing(next);
    setView(FITTED_VIEW);
  };
  const goTo = (zoneId: number): void => {
    props.onSelectRegion?.(zoneId);
    show('area');
  };

  return (
    // Opaque enough that the page behind is a backdrop and not a distraction,
    // and below every dialog on purpose: a teleport confirm opens over the
    // map that asked for it.
    <div
      role="dialog"
      aria-label={showing === 'world' ? 'World map' : 'Full map'}
      className="pointer-events-auto fixed inset-0 z-map flex items-center justify-center bg-black/75 p-4"
    >
      {showing === 'world' && world ? (
        <WorldMap
          spec={world}
          back={world.pieces?.back}
          regions={props.regions ?? []}
          pictureUrl={props.worldMapUrl}
          pictureSize={props.worldMapSize}
          view={view}
          onView={setView}
          onBack={() => show('area')}
          onPick={goTo}
        />
      ) : (
        <AreaMap
          spec={area}
          {...props}
          hasWorld={world !== null}
          view={view}
          onView={setView}
          onWorld={() => show('world')}
          onPick={goTo}
        />
      )}
    </div>
  );
}

/** The name the table gives an element, found by what it is for. */
function elementFor(spec: ScreenSpec, role: string): string | undefined {
  return Object.entries(spec.actions ?? {}).find(([, name]) => name === role)?.[0];
}

/** One part of the movie by its path, whether or not the screen shows it. */
function wholePart(worn: Worn, path: string | undefined): PiecePart | undefined {
  return path ? worn.whole.find(part => part.path === path) : undefined;
}

/** A length in the movie's units as a share of the window's width or height. */
function share(units: number, of: number): string {
  return `${(units / of) * 100}%`;
}

/** The words of a field as it was authored, at the size the picture is drawn at. */
function lettering(worn: Worn, field: PiecePart | undefined): JSX.CSSProperties {
  const text = field?.text;
  return {
    fontFamily: wornLettering(text?.face),
    fontSize: `${((text?.sizePx ?? 12) * worn.scale).toFixed(1)}px`,
    color: text?.color ?? INK,
    lineHeight: 1.1,
  };
}

type AreaProps = ArtMapWindowProps & {
  spec: ScreenSpec;
  hasWorld: boolean;
  view: MapView;
  onView(change: ViewChange): void;
  onWorld(): void;
  onPick(zoneId: number): void;
};

function AreaMap(props: AreaProps): JSX.Element | null {
  const { spec, view, onView, teleporting = false, onTeleport } = props;
  // Names are off until the eye is pressed; the place the player is in is
  // always written along the bottom.
  const [names, setNames] = useState(false);
  const neighbours = props.neighbours ?? [];
  const directions: MapDirection[] = ['up', 'down', 'left', 'right'];
  const absent = directions
    .filter(direction => !neighbours.some(one => one.direction === direction))
    .map(direction => elementFor(spec, direction))
    .filter((name): name is string => name !== undefined);
  const banner = spec.groups?.banner;
  const worn = useWorn(spec.dialog, spec.frame, {
    hidden: [
      ...(spec.hidden ?? []),
      ...absent,
      ...(props.hasWorld ? [] : [elementFor(spec, 'world') ?? '']),
      // Travelling always writes the names, so there is no eye to press.
      ...(teleporting && spec.groups?.names ? [spec.groups.names] : []),
    ],
    // The banner is drawn on its own, so it can slide away; the field the
    // name is written in stays where the movie puts it.
    withoutArt: banner ? [banner] : [],
  });
  // The banner stands for a moment each time a region comes up, then slides
  // out of the way of the picture.
  const [bannerUp, setBannerUp] = useState(true);
  useEffect(() => {
    setBannerUp(true);
    const away = setTimeout(() => setBannerUp(false), BANNER_MS);
    return () => clearTimeout(away);
  }, [props.zoneName]);
  const frame = worn.frame;
  if (!frame || !worn.image) return null;

  const { imageUrl, lines } = regionDrawing({
    travelling: teleporting,
    imageUrl: props.imageUrl,
    routeImageUrl: props.routeImageUrl,
    routes: props.routes,
  });
  // Where the world lies on the picture. A region with no bounds is a square
  // of ground about the player, which is better than no map.
  const world = areaMapFrame(
    props.bounds ?? [
      props.playerPosition[0] - 256,
      props.playerPosition[2] - 256,
      props.playerPosition[0] + 256,
      props.playerPosition[2] + 256,
    ],
  );

  const at = (position: readonly [number, number, number]): JSX.CSSProperties => {
    const spot = onPicture(position, world);
    return { left: `${spot.left}%`, top: `${spot.top}%` };
  };
  const slot = wholePart(worn, 'zoneindicator01');
  const nameField = wholePart(worn, 'zoneindicator01/zonename');
  const markSize = (path: string): { w: number; h: number } => {
    const part = wholePart(worn, path);
    return { w: part?.box.w ?? 0, h: part?.box.h ?? 0 };
  };
  const arrow = spec.groups?.player;
  const arrowSize = arrow ? markSize(arrow) : { w: 0, h: 0 };

  const title = worn.fieldOf(worn.find(spec.values?.title));
  const here = worn.fieldOf(wholePart(worn, spec.values?.place));

  const controls: Array<[string, string, () => void]> = [
    ['world', 'World map', props.onWorld],
    ...neighbours.map(({ direction, region }): [string, string, () => void] => [
      direction,
      `${direction} to ${region.name}`,
      () => props.onPick(region.id),
    ]),
    ['close', 'Close map', closeMap],
  ];

  return (
    <div
      data-map="window"
      className="relative"
      style={{ width: fittedWidth(frame.w / frame.h), aspectRatio: `${frame.w} / ${frame.h}` }}
    >
      <MapSurface pictureUrl={imageUrl} view={view} onView={onView}>
        {lines.length > 0 && (
          <svg
            data-map="routes"
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {lines.map(leg => (
              <line
                key={leg.id}
                className="stroke-map-travel opacity-85"
                stroke-width={2}
                stroke-linecap="round"
                vector-effect="non-scaling-stroke"
                {...routeLine(leg, world)}
              />
            ))}
          </svg>
        )}
        {(props.places ?? []).map(place => (
          <Place
            key={place.id}
            place={place}
            worn={worn}
            style={at(place.position)}
            slot={slot}
            travel={teleporting && place.teleport ? place.teleport : null}
            onTeleport={onTeleport}
          />
        ))}
        {props.markers
          .filter(marker => markerShown(marker.kind, view.zoom))
          .map(marker => {
            const quest = spec.pieces?.quest;
            const size = markSize(quest?.part ?? '');
            if (marker.kind === 'quest' && quest) {
              return (
                <WornPiece
                  key={marker.id}
                  dialog={quest.dialog ?? spec.dialog}
                  part={quest.part}
                  alt={marker.label}
                  box={{
                    position: 'absolute',
                    ...at(marker.position),
                    width: share(size.w, frame.w),
                    height: share(size.h, frame.h),
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                  }}
                />
              );
            }
            return (
              <span
                key={marker.id}
                data-marker={marker.kind}
                title={marker.label}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ ...at(marker.position), width: share(10, frame.w), aspectRatio: '1' }}
              >
                {marker.iconUrl && (
                  <img src={marker.iconUrl} alt="" className="size-full object-contain" />
                )}
              </span>
            );
          })}
        {arrow && (
          <WornPiece
            dialog={spec.dialog}
            part={arrow}
            alt="You"
            box={{
              position: 'absolute',
              ...at(props.playerPosition),
              width: share(arrowSize.w, frame.w),
              height: share(arrowSize.h, frame.h),
              transform: `translate(-50%, -50%) rotate(${arrowTurn(props.playerYaw)}rad)`,
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Written over everything on the picture, the quest marks and the
            player's arrow included. */}
        {(names || teleporting) &&
          (props.places ?? []).map(place => (
            <PlaceName
              key={place.id}
              place={place}
              worn={worn}
              style={at(place.position)}
              nameField={nameField}
            />
          ))}
      </MapSurface>

      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          data-map="banner"
          data-shown={bannerUp ? '' : undefined}
          className={cx(
            'absolute inset-0 transition-transform duration-1000 ease-in',
            !bannerUp && '-translate-y-full',
          )}
        >
          {banner && <WornPiece dialog={spec.dialog} part={banner} alone within={frame} />}
          {title && (
            <span data-map="title" style={{ ...worn.words(title, INK), ...lettering(worn, title) }}>
              {props.zoneName}
            </span>
          )}
        </div>
      </div>
      {here && props.placeName && (
        <span data-map="here" style={{ ...worn.words(here, INK), ...lettering(worn, here) }}>
          {props.placeName}
        </span>
      )}
      {controls.map(([role, label, onPress]) => {
        const part = worn.find(role === 'close' ? spec.close : elementFor(spec, role));
        return part ? (
          <button
            key={role}
            type="button"
            data-map={role}
            aria-label={label}
            title={label}
            onClick={onPress}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}
      {(() => {
        const toggle = worn.find(spec.groups?.names);
        return toggle ? (
          <button
            type="button"
            data-map="names"
            aria-label="Show place names"
            title="Show place names"
            aria-pressed={names}
            onClick={() => setNames(value => !value)}
            style={worn.box(toggle)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}

/** The colour of a name by how the zone regards the player: 2 friendly, 0 hostile. */
const TINTS: Record<number, string> = {
  2: 'var(--color-place-friendly)',
  0: 'var(--color-place-hostile)',
};

/**
 * A place's name, just under the mark the picture already carries at the
 * place's centre. Friendly and hostile places are told apart by the colour of
 * the name; a neutral one keeps the colour the movie writes names in.
 */
function PlaceName({
  place,
  worn,
  style,
  nameField,
}: {
  place: MapPlace;
  worn: Worn;
  style: JSX.CSSProperties;
  nameField: PiecePart | undefined;
}): JSX.Element {
  const tint = TINTS[place.friendly ?? 1];
  return (
    <span
      data-map="place-name"
      className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-shadow-halo"
      style={{
        ...style,
        ...lettering(worn, nameField),
        ...(tint ? { color: tint } : {}),
        // A margin is a share of the width of the picture, so a fixed share of
        // the picture's own units down from the place's centre.
        marginTop: share(4, worn.frame!.w),
      }}
    >
      {place.name}
    </span>
  );
}

/**
 * A place: a press area over the picture's own mark, sized against the
 * picture. Only a stop is a button, and only while travelling.
 */
function Place({
  place,
  worn,
  style,
  slot,
  travel,
  onTeleport,
}: {
  place: MapPlace;
  worn: Worn;
  style: JSX.CSSProperties;
  slot: PiecePart | undefined;
  travel: MapMarker | null;
  onTeleport?: (marker: MapMarker) => void;
}): JSX.Element {
  const frame = worn.frame!;
  const size = slot?.box ?? { w: 38, h: 38 };
  const shared =
    'absolute -translate-x-1/2 -translate-y-1/2 border-0 bg-transparent p-0 text-inherit';
  const box = { ...style, width: share(size.w, frame.w), aspectRatio: '1' };
  return travel ? (
    <button
      type="button"
      className={`${shared} cursor-pointer`}
      style={box}
      aria-label={`Teleport to ${place.name}`}
      title={`Teleport to ${place.name}`}
      onClick={() => onTeleport?.(travel)}
    />
  ) : (
    <span className={shared} style={box} aria-label={place.name} title={place.name} />
  );
}

function WorldMap({
  spec,
  back,
  regions,
  pictureUrl,
  pictureSize,
  view,
  onView,
  onBack,
  onPick,
}: {
  spec: ScreenSpec;
  /** The part worn for the way back, which the movie draws no art for here. */
  back: PieceSpec | undefined;
  regions: readonly MapRegion[];
  pictureUrl?: string | null;
  pictureSize?: { width: number; height: number } | null;
  view: MapView;
  onView(change: ViewChange): void;
  onBack(): void;
  onPick(zoneId: number): void;
}): JSX.Element | null {
  const worn = useWorn(spec.dialog, spec.frame, { hidden: spec.hidden ?? [] });
  const frame = worn.frame;
  if (!frame || !worn.image) return null;
  const nameField = wholePart(worn, spec.values?.regionName);
  const close = worn.find(spec.close);

  return (
    <div
      data-map="window"
      className="relative"
      style={{ width: fittedWidth(frame.w / frame.h), aspectRatio: `${frame.w} / ${frame.h}` }}
    >
      <MapSurface pictureUrl={pictureUrl} view={view} onView={onView}>
        {regions.map(region => {
          const area = worn.find(`${spec.groups?.regions}/${region.button}`);
          if (!area || !pictureSize) return null;
          const spot = regionSpot(area.box, pictureSize);
          return (
            <button
              key={region.id}
              type="button"
              data-map="region"
              aria-label={region.name}
              title={region.name}
              onClick={() => onPick(region.id)}
              className="absolute flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 hover:bg-parchment-100/10"
              style={{
                left: `${spot.left}%`,
                top: `${spot.top}%`,
                width: `${spot.width}%`,
                height: `${spot.height}%`,
              }}
            >
              <span
                className="pointer-events-none px-1.5 py-0.5 text-shadow-world"
                style={{ ...lettering(worn, nameField), color: nameField?.text?.color ?? LIGHT }}
              >
                {region.name}
              </span>
            </button>
          );
        })}
      </MapSurface>
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
        draggable={false}
      />
      {close && back && (
        <WornPiece
          dialog={back.dialog ?? spec.dialog}
          part={back.part}
          box={{ ...worn.box(close), pointerEvents: 'none' }}
        />
      )}
      {close && (
        <button
          type="button"
          data-map="close"
          aria-label="Back to the region"
          title="Back to the region"
          onClick={onBack}
          style={worn.box(close)}
          className={HIT}
        />
      )}
    </div>
  );
}
