/** The sell page: bag and tray, nothing sold until the sell control is pressed. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornSlot } from '../art/WornSlot';
import { unavailableFaces } from '../art/wornState';
import { pageLabel, pagesFor, slotsOf } from '../art/wornSlots';
import type { GridSpec } from '../art/uiSpec';
import { inventory, itemIcons, itemName } from '../inventoryStore';
import type { InventoryItem } from '../inventoryStore';
import { purseOf } from '../money';

/** Our name for this screen. The spec says which dialog wears it. */
export const SELL_SCREEN = 'sell';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtSellWindowProps {
  vendorName: string;
  balance: number;
  /** One thing sold. The server answers, and the bag catches up. */
  onSell(item: InventoryItem): void;
  /** Back to what the vendor has for sale. */
  onBuy(): void;
  onClose(): void;
}

export function ArtSellWindow(props: ArtSellWindowProps): JSX.Element | null {
  const spec = useWornScreen(SELL_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  vendorName,
  balance,
  onSell,
  onBuy,
  onClose,
  spec,
}: ArtSellWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const [page, setPage] = useState(0);
  const [staged, setStaged] = useState<readonly string[]>([]);
  const bagGrid = spec.grids?.bag;
  const trayGrid = spec.grids?.tray;

  const held = inventory.value.items.filter(item => item.slot?.area === 'bag');
  const tray = staged
    .map(id => held.find(item => item.id === id))
    .filter((item): item is InventoryItem => item !== undefined);

  const faces = unavailableFaces(spec, { sell: tray.length > 0 });

  const worn = useWorn(spec.dialog, spec.frame, whole => {
    const bag = bagGrid ? slotsOf(whole, { ...bagGrid, driven: true }) : [];
    const perPage = bag.length || 1;
    const showing = held.slice(page * perPage, page * perPage + perPage);
    const trayed = trayGrid ? slotsOf(whole, { ...trayGrid, driven: true }) : [];
    return {
      // The tab whose page is showing wears its lit face.
      frames: Object.fromEntries(
        (spec.tabs ?? []).map(tab => [
          tab.control,
          tab.panel === 'sell' ? (spec.faces?.[tab.control] ?? 1) : 0,
        ]),
      ),
      shown: [...(spec.shown ?? []), ...faces.shown],
      hidden: [
        ...(spec.hidden ?? []),
        ...faces.hidden,
        // A slot with nothing in it is not drawn: an empty plinth reads
        // as somewhere a thing could be put, and neither run takes one.
        ...bag.slice(showing.length).map(slot => slot.path),
        ...trayed.slice(tray.length).map(slot => slot.path),
      ],
    };
  });

  if (!worn.image || !worn.frame || !bagGrid || !trayGrid) return null;

  /** A slot's picture box, built from the point the screen draws it at. */
  const boxOf = (slot: PiecePart, grid: GridSpec): PiecePart => {
    const size = grid.size;
    if (!size) return slot;
    const at = worn.parts.find(part => part.path === `${slot.path}/${grid.face ?? ''}`) ?? slot;
    return {
      ...slot,
      box: { x: at.box.x + (size.dx ?? 0), y: at.box.y + (size.dy ?? 0), w: size.w, h: size.h },
    };
  };

  const bag = slotsOf(worn.parts, { ...bagGrid, driven: true });
  const perPage = slotsOf(worn.whole, { ...bagGrid, driven: true }).length || 1;
  const pages = pagesFor(held.length, perPage);
  const showing = held.slice(page * perPage, page * perPage + perPage);
  const trayed = slotsOf(worn.parts, { ...trayGrid, driven: true });
  const purse = purseOf(balance);

  /** One thing in a run, drawn the way every slot in this interface is. */
  const thing = (
    slot: PiecePart,
    grid: GridSpec,
    item: InventoryItem,
    label: string,
    press: () => void,
  ): JSX.Element => (
    <div key={slot.path}>
      <button
        type="button"
        aria-label={`${label}: ${itemName(item)}`}
        onClick={press}
        style={worn.box(slot)}
        className={HIT}
      />
      <WornSlot
        worn={worn}
        slot={boxOf(slot, grid)}
        icon={itemIcons.value.get(item.entry) ?? null}
        name={itemIcons.value.get(item.entry) ? undefined : itemName(item)}
        count={item.count}
      />
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={vendorName}
      className="overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block h-full w-full"
        draggable={false}
      />

      <WornCaptions
        worn={worn}
        spec={spec}
        tone={LIGHT}
        hidden={spec.hidden}
        styleOf={where => {
          const tab = (spec.tabs ?? []).find(one => one.text === where);
          if (!tab || tab.panel !== 'sell') return undefined;
          return tab.openTone ? { color: tab.openTone } : undefined;
        }}
      />

      {/* How much of the bag is taken, where the screen says so. */}
      {(() => {
        const field = worn.fieldOf(worn.find(spec.values?.held));
        return field ? (
          <span
            style={worn.words(field, LIGHT)}
          >{`${held.length} / ${inventory.value.bagSlotCount}`}</span>
        ) : null;
      })()}

      {/* What you are carrying. */}
      {showing.map((item, at) => {
        const slot = bag[at];
        return slot
          ? thing(slot, bagGrid, item, 'Offer', () =>
              setStaged(now => (now.includes(item.id) ? now : [...now, item.id])),
            )
          : null;
      })}

      {/* What you have offered, which is not gone until it is sold. */}
      {tray.map((item, at) => {
        const slot = trayed[at];
        return slot
          ? thing(slot, trayGrid, item, 'Take back', () =>
              setStaged(now => now.filter(id => id !== item.id)),
            )
          : null;
      })}

      {/* What you are carrying, in the screen's own row of coins. */}
      {Object.entries(spec.purse ?? {}).map(([what, where]) => {
        const field = worn.fieldOf(worn.find(where));
        const said = purse[what as keyof typeof purse];
        return field && said ? (
          <span key={`purse.${what}`} style={worn.words(field, LIGHT)}>
            {said}
          </span>
        ) : null;
      })}

      {/* The pages of the bag, and which one is showing. */}
      {(['back', 'on'] as const).map(way => {
        const part = worn.find(spec.paging?.[way]);
        if (!part) return null;
        const at = way === 'back' ? page - 1 : page + 1;
        return (
          <button
            key={`page.${way}`}
            type="button"
            aria-label={way === 'back' ? 'Earlier page' : 'Later page'}
            disabled={at < 0 || at >= pages}
            onClick={() => setPage(Math.max(0, Math.min(at, pages - 1)))}
            style={worn.box(part)}
            className={HIT}
          />
        );
      })}
      {(() => {
        const field = worn.fieldOf(worn.find(spec.paging?.page));
        return field ? (
          <span style={worn.words(field, LIGHT)}>{pageLabel(page, pages)}</span>
        ) : null;
      })()}

      {/* Selling what is in the tray. */}
      {Object.entries(spec.actions ?? {})
        .filter(([, what]) => what === 'sell')
        .map(([where]) => {
          const part = worn.find(where);
          return part ? (
            <button
              key={where}
              type="button"
              aria-label="sell"
              disabled={tray.length === 0}
              onClick={() => {
                for (const item of tray) onSell(item);
                setStaged([]);
              }}
              style={worn.box(part)}
              className={HIT}
            />
          ) : null;
        })}

      {/* The other page. The one you are on is not a way anywhere. */}
      {(spec.tabs ?? []).map(tab => {
        const part = worn.find(tab.control);
        return part && tab.panel !== 'sell' ? (
          <button
            key={tab.control}
            type="button"
            aria-label={tab.caption || tab.panel}
            onClick={onBuy}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}
