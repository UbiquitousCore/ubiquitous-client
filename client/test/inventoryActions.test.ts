import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installInventoryActions, type ItemSounds } from '../src/app/features/inventory/inventory';
import type { GameConnection, InventoryItem, StorageSlot } from '../src/net/GameConnection';
import { inventoryActions, setInventory, setInventoryActions } from '../src/ui/inventoryStore';

const INERT = inventoryActions();

const bag = (index: number): StorageSlot => ({ area: 'bag', index });
const item = (id: string, slot: StorageSlot | null, extra: Partial<InventoryItem> = {}) =>
  ({ id, slot, entry: 11, itemClass: 0, subClass: 1, count: 3, ...extra }) as InventoryItem;

function setup(opts: { target?: number | undefined; vendor?: number | null } = {}) {
  const connection = {
    sendInventoryMove: vi.fn(),
    sendInventoryEquip: vi.fn(),
    sendInventoryUse: vi.fn(),
    sendInventoryDestroy: vi.fn(),
    sendVendorSell: vi.fn(),
    sendInventorySort: vi.fn(),
    sendUpgradeStorage: vi.fn(),
  };
  const played: string[] = [];
  const byKind: Array<{ entry: number; sound: string }> = [];
  const sounds: ItemSounds = {
    play: name => played.push(name),
    byKind: (entry, pick) =>
      byKind.push({ entry, sound: pick({ itemClass: 4, subClass: 1, inventoryType: 1 }) }),
  };
  installInventoryActions(
    connection as unknown as GameConnection,
    { targetNetworkId: () => opts.target },
    sounds,
    () => opts.vendor ?? null,
  );
  return { connection, played, byKind, run: inventoryActions() };
}

beforeEach(() => {
  setInventory(10, 20, []);
  setInventoryActions(INERT);
});

describe('installInventoryActions', () => {
  it('moves an item and sounds it being set down, when the slot holds one', () => {
    setInventory(10, 20, [item('a', bag(2), { itemClass: 4, subClass: 1 })]);
    const { connection, played, run } = setup();
    run.move(bag(2), bag(5));
    expect(connection.sendInventoryMove).toHaveBeenCalledWith(bag(2), bag(5));
    expect(played).toEqual(['sfx_ui_drop_equipment']);
    run.move(bag(7), bag(8));
    expect(played).toHaveLength(1);
  });

  it('puts an item on and takes it off, by the item’s kind', () => {
    const { connection, byKind, run } = setup();
    const worn = item('a', bag(1));
    run.equip(worn, bag(4));
    run.unequip(worn);
    expect(connection.sendInventoryEquip.mock.calls).toEqual([
      [bag(1), 'a', true, bag(4)],
      [bag(1), 'a', false, undefined],
    ]);
    expect(byKind).toEqual([
      { entry: 11, sound: 'sfx_ui_menu_equip_helmet' },
      { entry: 11, sound: 'sfx_ui_menu_unequip_helmet' },
    ]);
  });

  it('still sounds an equip for an item between places, but asks nothing', () => {
    const { connection, byKind, run } = setup();
    run.equip(item('a', null));
    expect(connection.sendInventoryEquip).not.toHaveBeenCalled();
    expect(byKind).toHaveLength(1);
  });

  it('uses an item on the HUD’s target, or on none', () => {
    const targeted = setup({ target: 77 });
    targeted.run.use(item('a', bag(1)));
    expect(targeted.connection.sendInventoryUse).toHaveBeenCalledWith(bag(1), 'a', 77);

    const alone = setup();
    alone.run.use(item('a', bag(1)));
    expect(alone.connection.sendInventoryUse).toHaveBeenCalledWith(bag(1), 'a', undefined);

    alone.run.use(item('b', null));
    expect(alone.connection.sendInventoryUse).toHaveBeenCalledTimes(1);
  });

  it('destroys the whole stack and sounds it', () => {
    const { connection, played, run } = setup();
    run.destroy(item('a', bag(1), { count: 9 }));
    expect(connection.sendInventoryDestroy).toHaveBeenCalledWith(bag(1), 'a', 9);
    expect(played).toEqual(['sfx_ui_drop_potion']);
  });

  it('sells only into an open shop', () => {
    const closed = setup({ vendor: null });
    closed.run.sell(item('a', bag(1)));
    expect(closed.connection.sendVendorSell).not.toHaveBeenCalled();

    const open = setup({ vendor: 42 });
    open.run.sell(item('a', bag(1)));
    expect(open.connection.sendVendorSell).toHaveBeenCalledWith(42, bag(1), 'a');
    open.run.sell(item('b', null));
    expect(open.connection.sendVendorSell).toHaveBeenCalledTimes(1);
  });

  it('sorts and upgrades storage through the connection', () => {
    const { connection, run } = setup();
    run.sort('bank');
    run.upgrade('bag', 30);
    expect(connection.sendInventorySort).toHaveBeenCalledWith('bank');
    expect(connection.sendUpgradeStorage).toHaveBeenCalledWith('bag', 30);
  });
});
