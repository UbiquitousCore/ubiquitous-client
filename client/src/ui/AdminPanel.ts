/**
 * AdminPanel — a floating panel for debug/admin actions.
 *
 * Teleport to zones, change speed and draw distance, and the debug toggles. Only created when
 * admin=true in config.txt.
 */

import type { DebugTools } from '../app/DebugTools';
import type { ZoneInfo } from '../assets/types';
import { SHORTEST_ITEM_SEARCH } from './itemSearch';
import type { ItemHit } from './itemSearch';
import { BUTTON_BASE, BUTTON_CENTRED, BUTTON_SIZE, BUTTON_VARIANT } from './components/Button';

/* Debug chrome in the shared design system; monospaced, not differently coloured. */

/** Pinned to the usable top-right corner, and never taller than half the screen. */
const ADMIN_PANEL =
  'fixed top-safe-t right-safe-r z-admin m-2 max-h-1/2 min-w-60 max-w-80 overflow-y-auto ' +
  'rounded-chrome border border-brass-600 bg-chrome-950/85 p-3 font-mono text-tiny ' +
  'text-parchment-200 shadow-frame select-none';

const HEADER =
  'm-0 mb-2 flex cursor-pointer items-center justify-between gap-2 text-xs text-status-info';
const TOGGLE = 'text-tiny text-ink-400';
const LABEL = 'mt-1 block text-tiny text-ink-400';
/** Its own string rather than `LABEL` plus overrides: two `display` utilities
 *  in one class list is resolved by Tailwind's ordering, not by the author. */
const CHECK = 'flex items-center gap-2 text-tiny text-ink-400';
const HINT = 'mt-0.5 text-micro text-ink-400';
const ROW = 'flex items-center gap-1.5';

/** Every text, number and search field, and every select. */
const FIELD =
  'w-full min-w-0 rounded-chrome-sm border border-brass-600 bg-chrome-950 px-1.5 py-1 ' +
  'font-mono text-tiny text-parchment-200 shadow-recess ' +
  'focus-visible:border-brass-400 focus-visible:outline-none';

/* Capped rather than left to the `size="8"` default: on a short phone screen
   an eight-row list can grow the whole panel tall enough to sit over the boot
   screen's file picker underneath it. Scrolls inside its own box instead. */
const SELECT = `${FIELD} h-auto max-h-32 overflow-y-auto`;

const BUTTON = `${BUTTON_BASE} ${BUTTON_CENTRED} ${BUTTON_VARIANT.secondary} ${BUTTON_SIZE.sm} mt-1 font-mono`;

/** The speeds the panel offers, units per second. Own choice: walking pace up to crossing a map. */
export const ADMIN_SPEEDS = [6, 20, 100, 300] as const;

/** Everything the panel asks of the running game. */
export interface AdminControls {
  debug: Pick<DebugTools, 'collisionVisible' | 'toggleCollision' | 'toggleFog'>;
  flying(): boolean;
  toggleFly(on: boolean): boolean;
  getWalkSpeed(): number;
  setWalkSpeed(speed: number): void;
  drawDistance(): number;
  setDrawDistance(units: number): void;
  teleportToZone(zoneId: number): Promise<void>;
  toggleHud(visible: boolean): void;
  getZoneList(): Promise<ZoneInfo[]>;
  /** Items whose name or entry matches; the build's own names, so empty before it is mounted. */
  searchItems(query: string): Promise<ItemHit[]>;
  /** Ask the server for items. It refuses anyone who is not a GM. */
  giveItem(entry: number, count: number): void;
  /** Ask the server for whole gold. It refuses anyone who is not a GM. */
  giveGold(gold: number): void;
  /** Ask the server to set the character's level. It refuses anyone who is not a GM. */
  setLevel(level: number): void;
  /** Ask the server to teach every rank of the class's spells. It refuses anyone who is not a GM. */
  learnSpells(): void;
}

export class AdminPanel {
  private zonesLoaded = false;
  /** Every zone, sorted by map then name; the select shows a filter of these. */
  private zones: ZoneInfo[] = [];
  private zoneQuery = '';

  private readonly root: HTMLElement;
  private readonly teardown: Array<() => void> = [];

  constructor(private readonly game: AdminControls) {
    this.root = document.createElement('div');
    this.root.id = 'admin';
    this.root.className = ADMIN_PANEL;
    this.root.innerHTML = `
      <h3 id="adm-header" class="${HEADER}">
        Admin <span class="${TOGGLE}" id="adm-toggle-icon">▾</span>
      </h3>

      <div id="adm-body" class="flex flex-col gap-1">
        <span class="${LABEL}">Speed (units/s)</span>
        <div class="${ROW} gap-3" role="radiogroup" aria-label="Speed">
          ${ADMIN_SPEEDS.map(
            speed => `
          <label class="${CHECK}"><input type="radio" name="adm-speed" value="${speed}"> ${speed}</label>`,
          ).join('')}
        </div>

        <label class="${LABEL}">Draw distance (units)</label>
        <div class="${ROW}">
          <input type="number" id="adm-draw" step="10" class="${FIELD}">
          <button id="adm-draw-set" class="${BUTTON}">Set</button>
        </div>
        <div class="${HINT}">No cap, unlike the settings screen. Changing any setting puts it back.</div>

        <label class="${LABEL}">Teleport to zone</label>
        <input type="search" id="adm-zone-filter" placeholder="search zones..."
               autocomplete="off" spellcheck="false" class="${FIELD}">
        <select id="adm-zones" size="8" class="${SELECT}"><option>loading...</option></select>
        <div class="${HINT}" id="adm-zone-count"></div>
        <button id="adm-teleport" class="${BUTTON}">Teleport</button>

        <label class="${LABEL}">Give item</label>
        <input type="search" id="adm-item-filter" placeholder="search items by name or id..."
               autocomplete="off" spellcheck="false" class="${FIELD}">
        <select id="adm-items" size="8" class="${SELECT}"></select>
        <div class="${HINT}" id="adm-item-count">Type ${SHORTEST_ITEM_SEARCH} letters or an item id.</div>
        <div class="${ROW}">
          <input type="number" id="adm-item-qty" min="1" max="1000" value="1" class="${FIELD}">
          <button id="adm-item-give" class="${BUTTON}">Give</button>
        </div>

        <label class="${LABEL}">Level</label>
        <div class="${ROW}">
          <input type="number" id="adm-level" min="1" max="60" value="60" class="${FIELD}">
          <button id="adm-level-set" class="${BUTTON}">Set</button>
        </div>
        <button id="adm-learn" class="${BUTTON}">Learn all spells</button>
        <div class="${HINT}">Every rank of your class's spells, whatever the level.</div>

        <label class="${LABEL}">Give gold</label>
        <div class="${ROW}">
          <input type="number" id="adm-gold" min="1" max="100000" value="100" class="${FIELD}">
          <button id="adm-gold-give" class="${BUTTON}">Give</button>
        </div>

        <div class="mt-2 flex flex-col gap-1">
          <label class="${CHECK}"><input type="checkbox" id="adm-hud-toggle"> Show debug HUD</label>
          <label class="${CHECK}"><input type="checkbox" id="adm-collision-toggle"> Show collision wireframe</label>
          <label class="${CHECK}"><input type="checkbox" id="adm-fog-toggle"> Disable fog</label>
          <label class="${CHECK}"><input type="checkbox" id="adm-fly-toggle"> Fly (space up, shift down, uses Speed above)</label>
        </div>

        <div class="mt-2 min-h-4 text-tiny text-status-success" id="adm-status"></div>
      </div>
    `;
    // Large panel, small screen: start collapsed to a title bar so it isn't
    // most of the viewport. Still just as reachable — tap the header.
    this.collapse(true);
    document.body.append(this.root);
    this.init();
  }

  private async init(): Promise<void> {
    const header = this.$<HTMLElement>('adm-header');
    this.on(header, 'click', () => this.collapse(!this.body().hidden));

    const zoneSelect = this.$<HTMLSelectElement>('adm-zones');
    const teleportBtn = this.$<HTMLButtonElement>('adm-teleport');
    const hudToggle = this.$<HTMLInputElement>('adm-hud-toggle');
    const collisionToggle = this.$<HTMLInputElement>('adm-collision-toggle');
    const fogToggle = this.$<HTMLInputElement>('adm-fog-toggle');
    const status = this.$<HTMLElement>('adm-status');

    const flyToggle = this.$<HTMLInputElement>('adm-fly-toggle');
    hudToggle.checked = false;
    collisionToggle.checked = this.game.debug.collisionVisible();
    flyToggle.checked = this.game.flying();

    const speeds = [...this.root.querySelectorAll<HTMLInputElement>('input[name="adm-speed"]')];
    const current = this.game.getWalkSpeed();
    for (const radio of speeds) radio.checked = parseFloat(radio.value) === current;

    const draw = this.$<HTMLInputElement>('adm-draw');
    const drawBtn = this.$<HTMLButtonElement>('adm-draw-set');
    draw.value = String(Math.round(this.game.drawDistance()));
    this.on(drawBtn, 'click', () => {
      const units = parseFloat(draw.value);
      if (!Number.isFinite(units) || units <= 0) return;
      this.game.setDrawDistance(units);
      status.textContent = `draw distance = ${units}`;
    });
    this.on(draw, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') drawBtn.click();
    });

    for (const radio of speeds) {
      this.on(radio, 'change', () => {
        if (!radio.checked) return;
        const v = parseFloat(radio.value);
        this.game.setWalkSpeed(v);
        status.textContent = `speed = ${v}`;
      });
    }

    // The panel is built before any game data is mounted, which in local mode
    // is before the player has even chosen a file — so the first attempt is
    // expected to fail, and it retries rather than staying broken for the
    // session.
    void this.refreshZones();
    this.on(zoneSelect, 'focus', () => {
      if (!this.zonesLoaded) void this.refreshZones();
    });

    const zoneFilter = this.$<HTMLInputElement>('adm-zone-filter');
    this.on(zoneFilter, 'input', () => {
      this.zoneQuery = zoneFilter.value;
      this.renderZones();
    });
    // Enter in the search box teleports to the top match, so finding a zone
    // and going there is one gesture.
    this.on(zoneFilter, 'keydown', e => {
      if ((e as KeyboardEvent).key === 'Enter') teleportBtn.click();
    });
    this.on(zoneSelect, 'dblclick', () => teleportBtn.click());

    this.on(teleportBtn, 'click', async () => {
      const id = parseInt(zoneSelect.value, 10);
      if (!Number.isFinite(id)) return;
      status.textContent = 'loading zone...';
      teleportBtn.disabled = true;
      try {
        await this.game.teleportToZone(id);
        status.textContent = 'done';
      } catch (e) {
        status.textContent = `error: ${e instanceof Error ? e.message : e}`;
      }
      teleportBtn.disabled = false;
    });

    this.wireGifts(status);

    this.on(hudToggle, 'change', () => {
      this.game.toggleHud(hudToggle.checked);
    });

    this.on(flyToggle, 'change', () => {
      this.game.toggleFly(flyToggle.checked);
      status.textContent = flyToggle.checked
        ? 'flying: space up, shift down, no collision'
        : 'landed';
    });

    this.on(fogToggle, 'change', () => {
      // The box says "disable", so it is checked when there is no fog.
      this.game.debug.toggleFog(!fogToggle.checked);
      status.textContent = fogToggle.checked ? 'fog off' : 'fog back on';
    });

    this.on(collisionToggle, 'change', () => {
      const shown = this.game.debug.toggleCollision(collisionToggle.checked);
      collisionToggle.checked = shown;
      status.textContent = collisionToggle.checked
        ? 'collision: green floor, red wall, yellow neither'
        : 'collision wireframe off';
    });

    // A focused checkbox, button or slider swallows WASD/space: Input defers
    // to form controls, so the game goes dead until focus moves. Hand
    // keyboard focus straight back after any non-text interaction. Text and
    // number fields keep focus — typing there is the point.
    const relinquish = (target: EventTarget | null): void => {
      if (!(target instanceof HTMLElement)) return;
      if (
        target instanceof HTMLInputElement &&
        (target.type === 'text' || target.type === 'number' || target.type === 'search')
      )
        return;
      if (target instanceof HTMLSelectElement) return;
      target.blur();
    };
    this.on(this.root, 'click', e => relinquish(e.target));
    this.on(this.root, 'change', e => relinquish(e.target));
  }

  /** Zones grouped by map and filtered; every query word must match the name, map or id. */
  private renderZones(): void {
    const select = this.$<HTMLSelectElement>('adm-zones');
    const count = this.$<HTMLElement>('adm-zone-count');
    if (!select) return;

    const terms = this.zoneQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = this.zones.filter(z => {
      if (!terms.length) return true;
      const hay = `${z.name} ${z.mapName} ${z.id}`.toLowerCase();
      return terms.every(t => hay.includes(t));
    });

    const keep = select.value;
    select.innerHTML = '';
    let group: HTMLOptGroupElement | null = null;
    let lastMap = '';
    for (const z of matches) {
      if (z.mapName !== lastMap) {
        lastMap = z.mapName;
        group = document.createElement('optgroup');
        group.label = z.mapName || 'unknown map';
        select.append(group);
      }
      const opt = document.createElement('option');
      opt.value = String(z.id);
      opt.textContent = `${z.name}  #${z.id}`;
      (group ?? select).append(opt);
    }

    // Keep the selection when it survived the filter; otherwise take the first
    // match, so Teleport always has something to act on.
    if (matches.some(z => String(z.id) === keep)) select.value = keep;
    else if (matches.length) select.selectedIndex = 0;

    if (count) {
      count.textContent =
        matches.length === this.zones.length
          ? `${this.zones.length} zones`
          : `${matches.length} of ${this.zones.length} zones`;
    }
  }

  /** Fill the zone picker. Safe to call before anything is mounted. */
  async refreshZones(): Promise<void> {
    const select = this.$<HTMLSelectElement>('adm-zones');
    if (!select) return;
    try {
      const zones = await this.game.getZoneList();
      if (!zones.length) throw new Error('no zones');
      this.zones = [...zones].sort(
        (a, b) => a.mapName.localeCompare(b.mapName) || a.name.localeCompare(b.name),
      );
      this.renderZones();
      this.zonesLoaded = true;
    } catch {
      select.innerHTML = '<option>not loaded yet</option>';
      this.zonesLoaded = false;
    }
  }

  /** Searching for an item and giving it, and giving gold. */
  private wireGifts(status: HTMLElement): void {
    const filter = this.$<HTMLInputElement>('adm-item-filter');
    const list = this.$<HTMLSelectElement>('adm-items');
    const count = this.$<HTMLElement>('adm-item-count');
    const quantity = this.$<HTMLInputElement>('adm-item-qty');
    const give = this.$<HTMLButtonElement>('adm-item-give');
    const gold = this.$<HTMLInputElement>('adm-gold');
    const giveGold = this.$<HTMLButtonElement>('adm-gold-give');

    // Only the newest search draws, so a slow early one cannot overwrite it.
    let asked = 0;
    this.on(filter, 'input', async () => {
      const ticket = ++asked;
      const hits = await this.game.searchItems(filter.value).catch(() => []);
      if (ticket !== asked) return;
      list.replaceChildren(
        ...hits.map(hit => {
          const option = document.createElement('option');
          option.value = String(hit.entry);
          option.textContent = `${hit.name} (${hit.entry})`;
          return option;
        }),
      );
      if (hits.length) list.selectedIndex = 0;
      count.textContent = hits.length
        ? `${hits.length} found`
        : filter.value.trim().length < SHORTEST_ITEM_SEARCH
          ? `Type ${SHORTEST_ITEM_SEARCH} letters or an item id.`
          : 'No items found.';
    });

    const giveSelected = (): void => {
      const entry = parseInt(list.value, 10);
      const amount = Math.floor(Number(quantity.value));
      if (!Number.isFinite(entry) || !Number.isFinite(amount) || amount < 1) return;
      this.game.giveItem(entry, amount);
      status.textContent = `asked for ${amount} of item ${entry}`;
    };
    this.on(give, 'click', giveSelected);
    this.on(list, 'dblclick', giveSelected);
    this.on(filter, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') giveSelected();
    });

    const level = this.$<HTMLInputElement>('adm-level');
    const setLevel = this.$<HTMLButtonElement>('adm-level-set');
    const setTheLevel = (): void => {
      const wanted = Math.floor(Number(level.value));
      if (!Number.isFinite(wanted) || wanted < 1) return;
      this.game.setLevel(wanted);
      status.textContent = `asked for level ${wanted}`;
    };
    this.on(setLevel, 'click', setTheLevel);
    this.on(level, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') setTheLevel();
    });
    this.on(this.$<HTMLButtonElement>('adm-learn'), 'click', () => {
      this.game.learnSpells();
      status.textContent = 'asked to learn every spell';
    });

    const giveTheGold = (): void => {
      const amount = Math.floor(Number(gold.value));
      if (!Number.isFinite(amount) || amount < 1) return;
      this.game.giveGold(amount);
      status.textContent = `asked for ${amount} gold`;
    };
    this.on(giveGold, 'click', giveTheGold);
    this.on(gold, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') giveTheGold();
    });
  }

  /** The panel's body, which collapsing hides. */
  private body(): HTMLElement {
    return this.$<HTMLElement>('adm-body');
  }

  /** Collapse to the title bar via `hidden`: one thing to hide, one glyph to turn. */
  private collapse(collapsed: boolean): void {
    this.body().hidden = collapsed;
    this.$<HTMLElement>('adm-toggle-icon').textContent = collapsed ? '▸' : '▾';
    // Collapsed, the panel is only as wide as the word "Admin".
    this.root.classList.toggle('min-w-60', !collapsed);
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector(`#${id}`) as T;
  }

  private on(el: HTMLElement, event: string, fn: (e: Event) => void): void {
    el.addEventListener(event, fn as EventListener);
    this.teardown.push(() => el.removeEventListener(event, fn as EventListener));
  }

  dispose(): void {
    for (const off of this.teardown) off();
    this.teardown.length = 0;
    this.root.remove();
  }
}
