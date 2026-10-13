/** Item card lines in game order (what it is/does/requires/is worth;
 * unmet requirements tinted as warnings). Tooltip draws, this decides. */

import type { JSX } from 'preact';
import type { InventoryItem } from '../../net/GameConnection';
import { bindingNote, isSoulbound, qualityName, qualityTextClass, wornAt } from '../items';
import { fill } from '../art/wornWords';
import { LINES, say } from '../gameLines';
import { formatMoney } from '../money';
import { Button } from './Button';
import { ItemTooltip } from './ItemTooltip';
import type { TooltipLine } from './ItemTooltip';

export interface ItemDetailsProps {
  item: InventoryItem;
  /** Resolved from game data; the entry id is a poor substitute but honest. */
  name: string;
  /** The item's own line of text — flavour, or what a recipe teaches. */
  description?: string;
  /** The character's level, for deciding whether a requirement is met. */
  playerLevel?: number;
  /** Whether this item is currently worn, which decides equip versus remove. */
  equipped?: boolean;
  /** Offered only while a vendor is open. */
  onSell?(): void;
  onUse?(): void;
  onEquip?(): void;
  onUnequip?(): void;
  onDestroy?(): void;
  onClose(): void;
  className?: string;
}

/** The damage bands a weapon rolls, as one line each. */
function damageLines(item: InventoryItem): TooltipLine[] {
  return item.prototype.damage
    .filter(band => band.max > 0)
    .map(band => ({
      text: `${Math.round(band.min)} – ${Math.round(band.max)} damage`,
      tone: 'plain' as const,
    }));
}

/**
 * What a prefix rolled onto this item.
 *
 * The type is a number this build has no table of names for, so each line
 * shows the value and says it came from the item's own enchantment. Naming
 * them is a separate job; showing "+12" is still worth more than nothing.
 */
function statLines(item: InventoryItem): TooltipLine[] {
  return item.stats
    .filter(stat => stat.value !== 0)
    .map(stat => ({
      text: `${stat.value > 0 ? '+' : ''}${stat.value} (attribute ${stat.type})`,
      tone: 'effect' as const,
    }));
}

/**
 * Everything worth saying about an item, in the order an item card reads it out.
 * Shared by the card a tap opens and the tooltip the mouse hovers.
 */
export function itemLines(
  item: InventoryItem,
  description: string | undefined,
  playerLevel: number | undefined,
): TooltipLine[] {
  const proto = item.prototype;
  const lines: TooltipLine[] = [];

  if (item.count > 1) lines.push({ text: `${item.count} of ${proto.maxStack}` });

  lines.push(...damageLines(item));
  if (proto.armour > 0) lines.push({ text: `${proto.armour} armour` });
  if (proto.delay > 0) lines.push({ text: `Speed ${(proto.delay / 1000).toFixed(1)}s` });
  lines.push(...statLines(item));
  if (description) lines.push({ text: description });

  if (item.maxDurability > 0) {
    lines.push({
      text: `Durability ${item.durability} / ${item.maxDurability}`,
      // A broken item still works as a label; a worn-out one is a warning.
      tone: item.durability === 0 ? 'warning' : 'plain',
    });
  }

  if (proto.requiredLevel > 0) {
    lines.push({
      text: fill(say(LINES.requiresLevel), proto.requiredLevel),
      tone:
        playerLevel !== undefined && playerLevel < proto.requiredLevel ? 'requirement' : 'plain',
    });
  }

  const binding = isSoulbound(item.flags) ? 'Soulbound' : bindingNote(proto.bonding);
  if (binding) lines.push({ text: binding, tone: 'warning' });

  // What a vendor pays, not what one charges: this is an item you already own.
  if (proto.sellPrice > 0) lines.push({ text: `Sells for ${formatMoney(proto.sellPrice)}` });
  return lines;
}

/** "Rare · Chest", or just the quality: the line under an item's name. */
export function itemSubtitle(item: InventoryItem): string {
  const worn = wornAt(item.prototype.inventoryType);
  return worn ? `${qualityName(item.quality)} · ${worn}` : qualityName(item.quality);
}

export function ItemDetails({
  item,
  name,
  description,
  playerLevel,
  equipped = false,
  onSell,
  onUse,
  onEquip,
  onUnequip,
  onDestroy,
  onClose,
  className,
}: ItemDetailsProps): JSX.Element {
  const lines = itemLines(item, description, playerLevel);
  const subtitle = itemSubtitle(item);

  return (
    <ItemTooltip
      title={name}
      titleClassName={qualityTextClass(item.quality)}
      subtitle={subtitle}
      lines={lines}
      onClose={onClose}
      className={className}
      actions={
        <>
          {onUse && (
            <Button size="sm" variant="primary" className="min-w-24" onClick={onUse}>
              Use
            </Button>
          )}
          {equipped
            ? onUnequip && (
                <Button size="sm" onClick={onUnequip}>
                  Remove
                </Button>
              )
            : onEquip && (
                <Button size="sm" variant="primary" onClick={onEquip}>
                  Equip
                </Button>
              )}
          {onSell && (
            <Button size="sm" onClick={onSell}>
              Sell
            </Button>
          )}
          {onDestroy && (
            <Button size="sm" variant="danger" onClick={onDestroy}>
              Destroy
            </Button>
          )}
        </>
      }
    />
  );
}
