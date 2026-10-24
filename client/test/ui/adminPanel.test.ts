// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SPEEDS, AdminPanel, type AdminControls } from '../../src/ui/AdminPanel';

const zones = [
  { id: 2, name: 'Harbour', mapName: 'Coast' },
  { id: 1, name: 'Square', mapName: 'City' },
] as unknown as Awaited<ReturnType<AdminControls['getZoneList']>>;

function controls(over: Partial<AdminControls> = {}) {
  let collision = false;
  const c: AdminControls = {
    debug: {
      collisionVisible: () => collision,
      toggleCollision: vi.fn((on: boolean) => (collision = on)),
      toggleFog: vi.fn((on: boolean) => on),
    },
    flying: () => false,
    toggleFly: vi.fn((on: boolean) => on),
    getWalkSpeed: () => 20,
    setWalkSpeed: vi.fn(),
    drawDistance: () => 300.4,
    setDrawDistance: vi.fn(),
    teleportToZone: vi.fn(async () => undefined),
    toggleHud: vi.fn(),
    getZoneList: async () => zones,
    searchItems: vi.fn(async () => [
      { entry: 7, name: 'Iron Sword' },
      { entry: 9, name: 'Sword of Dawn' },
    ]),
    giveItem: vi.fn(),
    giveGold: vi.fn(),
    setLevel: vi.fn(),
    learnSpells: vi.fn(),
    ...over,
  };
  return c;
}

const panels: AdminPanel[] = [];
async function open(over: Partial<AdminControls> = {}) {
  const game = controls(over);
  const panel = new AdminPanel(game);
  panels.push(panel);
  await panel.refreshZones();
  return game;
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = () => $('adm-status').textContent;
const speedRadios = () => [
  ...document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="adm-speed"]'),
];

afterEach(() => {
  for (const p of panels.splice(0)) p.dispose();
});

describe('AdminPanel against AdminControls', () => {
  it('starts collapsed, and the header opens it', async () => {
    await open();
    expect($('adm-body').hidden).toBe(true);
    $('adm-header').click();
    expect($('adm-body').hidden).toBe(false);
  });

  it('shows what the game reports for speed and draw distance', async () => {
    await open();
    expect(speedRadios().map(r => [Number(r.value), r.checked])).toEqual(
      ADMIN_SPEEDS.map(speed => [speed, speed === 20]),
    );
    expect($<HTMLInputElement>('adm-draw').value).toBe('300');
  });

  it('offers speeds as radio buttons, and sets the one picked', async () => {
    const game = await open();
    expect(ADMIN_SPEEDS).toEqual([6, 20, 100, 300]);
    const fast = speedRadios().find(r => r.value === '300')!;
    fast.checked = true;
    fast.dispatchEvent(new Event('change', { bubbles: true }));
    expect(game.setWalkSpeed).toHaveBeenCalledWith(300);
    expect(status()).toBe('speed = 300');
    expect(
      speedRadios()
        .filter(r => r.checked)
        .map(r => r.value),
    ).toEqual(['300']);
  });

  it('sets draw distance, and ignores nonsense', async () => {
    const game = await open();
    $<HTMLInputElement>('adm-draw').value = '900';
    $('adm-draw-set').click();
    expect(game.setDrawDistance).toHaveBeenCalledWith(900);
    $<HTMLInputElement>('adm-draw').value = 'x';
    $('adm-draw-set').click();
    expect(game.setDrawDistance).toHaveBeenCalledTimes(1);
  });

  it('lists zones by map and teleports to the selected one', async () => {
    const game = await open();
    const select = $<HTMLSelectElement>('adm-zones');
    expect([...select.options].map(o => o.textContent)).toEqual(['Square  #1', 'Harbour  #2']);
    $('adm-teleport').click();
    await vi.waitFor(() => expect(status()).toBe('done'));
    expect(game.teleportToZone).toHaveBeenCalledWith(1);
  });

  it('says why a teleport failed and frees the button', async () => {
    await open({ teleportToZone: vi.fn(async () => Promise.reject(new Error('no map'))) });
    $('adm-teleport').click();
    await vi.waitFor(() => expect(status()).toBe('error: no map'));
    expect($<HTMLButtonElement>('adm-teleport').disabled).toBe(false);
  });

  it('filters zones by every word of the query', async () => {
    await open();
    const filter = $<HTMLInputElement>('adm-zone-filter');
    filter.value = 'coast harb';
    filter.dispatchEvent(new Event('input'));
    expect($('adm-zone-count').textContent).toBe('1 of 2 zones');
  });

  it('drives the debug toggles', async () => {
    const game = await open();
    const check = (id: string, on: boolean) => {
      const box = $<HTMLInputElement>(id);
      box.checked = on;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    };
    check('adm-hud-toggle', true);
    expect(game.toggleHud).toHaveBeenCalledWith(true);

    check('adm-fly-toggle', true);
    expect(game.toggleFly).toHaveBeenCalledWith(true);
    expect(status()).toBe('flying: space up, shift down, no collision');
    check('adm-fly-toggle', false);
    expect(status()).toBe('landed');

    // "Disable fog" is checked when there is no fog.
    check('adm-fog-toggle', true);
    expect(game.debug.toggleFog).toHaveBeenLastCalledWith(false);
    expect(status()).toBe('fog off');
    check('adm-fog-toggle', false);
    expect(game.debug.toggleFog).toHaveBeenLastCalledWith(true);

    check('adm-collision-toggle', true);
    expect(game.debug.toggleCollision).toHaveBeenLastCalledWith(true);
    expect($<HTMLInputElement>('adm-collision-toggle').checked).toBe(true);
  });

  it('unticks collision when the zone has none to show', async () => {
    await open({
      debug: {
        collisionVisible: () => false,
        toggleCollision: () => false,
        toggleFog: () => true,
      },
    });
    const box = $<HTMLInputElement>('adm-collision-toggle');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.checked).toBe(false);
    expect(status()).toBe('collision wireframe off');
  });

  it('says "not loaded yet" until the zone list arrives, then retries on focus', async () => {
    const getZoneList = vi
      .fn()
      .mockRejectedValueOnce(new Error('no data'))
      .mockResolvedValue(zones);
    // The constructor makes the first, failing attempt itself.
    panels.push(new AdminPanel(controls({ getZoneList })));
    const select = $<HTMLSelectElement>('adm-zones');
    await vi.waitFor(() => expect(select.textContent).toBe('not loaded yet'));
    select.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(select.options.length).toBe(2));
  });

  describe('gifts', () => {
    async function search(text: string): Promise<void> {
      const filter = $<HTMLInputElement>('adm-item-filter');
      filter.value = text;
      filter.dispatchEvent(new Event('input'));
      await vi.waitFor(() =>
        expect($<HTMLSelectElement>('adm-items').options.length).toBeGreaterThan(0),
      );
    }

    it('lists the items a search finds and gives the chosen one in the quantity typed', async () => {
      const game = await open();
      await search('sword');
      $<HTMLSelectElement>('adm-items').selectedIndex = 1;
      $<HTMLInputElement>('adm-item-qty').value = '3';
      $<HTMLButtonElement>('adm-item-give').click();

      expect(game.searchItems).toHaveBeenCalledWith('sword');
      expect($<HTMLSelectElement>('adm-items').options[0]!.textContent).toBe('Iron Sword (7)');
      expect(game.giveItem).toHaveBeenCalledWith(9, 3);
    });

    it('gives nothing for a quantity that is not a whole number above zero', async () => {
      const game = await open();
      await search('sword');
      for (const bad of ['0', '-2', '']) {
        $<HTMLInputElement>('adm-item-qty').value = bad;
        $<HTMLButtonElement>('adm-item-give').click();
      }
      expect(game.giveItem).not.toHaveBeenCalled();
    });

    it('gives the gold typed, and nothing for a bad amount', async () => {
      const game = await open();
      $<HTMLInputElement>('adm-gold').value = '250';
      $<HTMLButtonElement>('adm-gold-give').click();
      $<HTMLInputElement>('adm-gold').value = '0';
      $<HTMLButtonElement>('adm-gold-give').click();

      expect(game.giveGold).toHaveBeenCalledTimes(1);
      expect(game.giveGold).toHaveBeenCalledWith(250);
    });

    it('sets the level typed, and nothing for a bad one', async () => {
      const game = await open();
      $<HTMLInputElement>('adm-level').value = '35';
      $<HTMLButtonElement>('adm-level-set').click();
      $<HTMLInputElement>('adm-level').value = '0';
      $<HTMLButtonElement>('adm-level-set').click();

      expect(game.setLevel).toHaveBeenCalledTimes(1);
      expect(game.setLevel).toHaveBeenCalledWith(35);
    });

    it('asks to learn every spell', async () => {
      const game = await open();
      $<HTMLButtonElement>('adm-learn').click();
      expect(game.learnSpells).toHaveBeenCalledTimes(1);
    });

    it('says so when a search finds nothing', async () => {
      await open({ searchItems: vi.fn(async () => []) });
      const filter = $<HTMLInputElement>('adm-item-filter');
      filter.value = 'zzzz';
      filter.dispatchEvent(new Event('input'));
      await vi.waitFor(() => expect($('adm-item-count').textContent).toBe('No items found.'));
    });
  });
});
