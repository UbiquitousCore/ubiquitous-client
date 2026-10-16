import { logger } from '../core/log';
import { forgetIpa, pickIpa } from '../assets/vfs/ipaHandle';
import { PROTOCOL_FEATURES } from '../net/messages';
import { particleOptions } from '../renderer/EffectFactory';
import { modelOptions } from '../renderer/ModelFactory';
import { floatingNumbers } from '../gameplay/SpellBook';
import { lootWindow } from '../ui/lootStore';
import type { ResourceSystem } from '../assets/ResourceSystem';
import type { World } from '../world/World';
import type { Renderer } from '../renderer/Renderer';
import type { NetworkBodies } from '../gameplay/NetworkBodies';
import type { NavigationGround } from '../world/NavigationGround';

const log = logger('debug');

/** How long `ubiquitous.nav()` waits before treating silence as a refusal. */
export const NAVIGATION_ANSWER_TIMEOUT_MS = 5000;

/** How many combat events `ubiquitous.combat()` keeps. Enough for one exchange. */
const COMBAT_LOG_DEPTH = 40;

/** How many attempts `ubiquitous.loot()` keeps. */
const LOOT_ATTEMPT_DEPTH = 8;

/** One try at opening a body, as `ubiquitous.loot()` reports it. */
export interface LootAttempt {
  at: number;
  networkId: number;
  entry: number;
  distance: number | null;
  why: string;
  sent: boolean;
}

/** What the console needs from the game beyond what `DebugTools` already holds. */
export interface ConsoleHooks {
  selfNetworkId(): number | null;
  /** Give the session a game file, for maps not yet extracted. */
  attachSource(file: File): Promise<void>;
  /** What the loot rules recorded for each body, and who is fighting or has died. */
  lootSnapshot(): {
    states: Array<{ networkId: number; state: unknown; resident: boolean }>;
    fighting: number[];
    died: unknown[];
  };
  teleport(x: number, y: number, z: number): Record<string, unknown>;
  /** Ask the server to spawn stress-test bots; dev/operator only. */
  sendStressTest(count: number): void;
}

/** What a developer can ask the running game, from the console or the admin panel. */
export class DebugTools {
  private collisionShown = false;
  private navigationShown = false;
  /** Whether `ubiquitous.damage()` has asked for every blow to be logged. */
  damageLogOn = false;
  private readonly combatLog: Array<Record<string, unknown>> = [];
  private readonly lootAttempts: LootAttempt[] = [];

  /**
   * The last frame's cost of the passes that walk the world, in ms: the
   * network step, the clip selection, the renderer's sync, and the HUD's last publish. Read with
   * `ubiquitous.inspect()`, next to the renderer's own `preMs` and `drawMs`.
   */
  readonly frameMs = { network: 0, sync: 0, hud: 0, clips: 0 };

  constructor(
    private readonly world: World,
    private readonly renderer: Renderer,
    private readonly bodies: NetworkBodies,
    private readonly resources: ResourceSystem,
    private readonly status: () => string,
    private readonly askNavigationGround: (radius?: number) => Promise<NavigationGround | null>,
  ) {}

  /**
   * Keep a combat event for `ubiquitous.combat()`: it tells apart the four causes of
   * missing damage numbers (not sent, zero, not about the player, not drawn).
   */
  recordCombat(row: Record<string, unknown>): void {
    this.combatLog.push({ at: Math.round(performance.now()), ...row });
    if (this.combatLog.length > COMBAT_LOG_DEPTH) this.combatLog.shift();
  }

  /** Keep a try at opening a body for `ubiquitous.loot()`, which names the condition that stopped it. */
  recordLootAttempt(attempt: Omit<LootAttempt, 'at'>): void {
    this.lootAttempts.push({
      at: Math.round(performance.now()),
      ...attempt,
      distance: attempt.distance === null ? null : Math.round(attempt.distance * 10) / 10,
    });
    if (this.lootAttempts.length > LOOT_ATTEMPT_DEPTH) this.lootAttempts.shift();
  }

  /**
   * Hang the console tools on `window.ubiquitous`, and say what is there.
   *
   * Questions about the running session a console answers faster than a
   * screenshot. Nothing in the game reads it.
   */
  install(hooks: ConsoleHooks, target?: Record<string, unknown>): void {
    const ubiquitous =
      target ??
      ((window as unknown as { ubiquitous?: Record<string, unknown> }).ubiquitous ??= {} as Record<
        string,
        unknown
      >);
    Object.assign(ubiquitous, {
      /** What this session asked for and could not have, and how often. */
      missing: () => this.resources.failureSummary(),
      /** Hand the session a game file, for maps not yet extracted. */
      useFile: async (): Promise<string> => {
        const files = await pickIpa();
        if (!files.length) return 'cancelled';
        await hooks.attachSource(files[0]);
        return `${files[0].name} attached`;
      },
      /** Forget the remembered game file. */
      forgetFile: async (): Promise<string> => {
        await forgetIpa();
        return 'forgotten';
      },
      inspect: () => this.inspect(),
      /** What is placed around the player — `ubiquitous.near()` or `.near(30)`. */
      near: (radius?: number) => this.nearby(radius),
      /** Streak particles: velocity-aligned or free quads, live. */
      particles: (aligned?: boolean) => {
        if (aligned !== undefined) particleOptions.streaksFollowVelocity = aligned;
        return { streaksFollowVelocity: particleOptions.streaksFollowVelocity };
      },
      /** Baked vertex lighting; applies to models built after the call. */
      vertexLight: (on?: boolean) => {
        if (on !== undefined) modelOptions.vertexLighting = on;
        return { vertexLighting: modelOptions.vertexLighting };
      },
      effects: (filter?: string) => this.effects(filter),
      /** Every effect placement in the zone, built or not. */
      findEffect: (filter?: string) => this.findEffect(filter),
      /** Poles at every live effect: an effect that emits nothing looks like one that is not there. */
      markEffects: (on = true) => this.renderer.markEffects(on),
      collision: () => this.collisionReport(),
      wireframe: (on = true) => this.toggleCollision(on),
      /**
       * `ubiquitous.nav(on, radius, everyStorey)`: the server's walkable ground.
       * Operator accounts only. Only the player's storey by default, since the
       * overlay has no depth test.
       */
      nav: (on = true, radius?: number, everyStorey = false) =>
        this.navigation(on, radius, everyStorey),
      fog: (on = true) => this.toggleFog(on),
      teleport: (x: number, y: number, z: number) => hooks.teleport(x, y, z),
      /** `ubiquitous.stressTest(100)`: dev/operator only. */
      stressTest: (count?: number) => {
        if (count === undefined || !Number.isFinite(count) || count <= 0)
          return 'usage: ubiquitous.stressTest(count)';
        hooks.sendStressTest(Math.floor(count));
        return `stress test requested: ${Math.floor(count)}`;
      },
      /** `ubiquitous.net()`: why a body shows the wrong animation. */
      net: () => this.bodies.report(),
      /** `ubiquitous.damage()` prints every blow as it lands; `ubiquitous.damage(false)` stops. */
      damage: (on = true) => {
        this.damageLogOn = on;
        return on ? 'damage log on' : 'damage log off';
      },
      /**
       * `ubiquitous.combat()`. A row marked `drawn` with `floats` stuck at zero is a
       * rendering problem, not a protocol one.
       */
      combat: () => ({
        self: hooks.selfNetworkId(),
        floats: floatingNumbers.value.length,
        events: [...this.combatLog],
      }),
      /** `ubiquitous.loot()`: which of the four silent conditions stopped a corpse opening. */
      loot: () => ({
        self: hooks.selfNetworkId(),
        open: lootWindow.value,
        ...hooks.lootSnapshot(),
        attempts: [...this.lootAttempts],
      }),
    });
    // Client and server move separately; a stale one looks like a bug in the other.
    log.info(`protocol: ${PROTOCOL_FEATURES.join(', ')}`);
    log.info(
      'debug: window.ubiquitous.inspect() / .collision() / .wireframe() / .nav() / .teleport(x,y,z)',
    );
    log.info('combat: window.ubiquitous.combat() / .net() - messages in, and what was drawn');
    log.info('loot: window.ubiquitous.loot() - what the server said about each body');
    log.info(
      'effects: window.ubiquitous.effects(name?) / .findEffect(name?) / .markEffects(bool) / .particles(bool) / .vertexLight(bool)',
    );
  }

  effects(filter?: string): Array<Record<string, unknown>> {
    const rows = this.renderer.effectReport();
    if (!filter) return rows;
    const needle = filter.toLowerCase();
    return rows.filter(r => String(r.path).toLowerCase().includes(needle));
  }

  /** Every effect placement in the zone, built or not, read from the world. */
  findEffect(filter?: string): Array<Record<string, unknown>> {
    const player = this.world.player?.position ?? [0, 0, 0];
    const needle = filter?.toLowerCase();
    const out: Array<Record<string, unknown>> = [];
    for (const entity of this.world.entities.values()) {
      if (entity.kind !== 'effect') continue;
      if (needle && !entity.model.toLowerCase().includes(needle)) continue;
      const [x, y, z] = entity.position;
      const d = Math.hypot(x - player[0], y - player[1], z - player[2]);
      out.push({
        path: entity.model,
        position: [Number(x.toFixed(1)), Number(y.toFixed(1)), Number(z.toFixed(1))],
        scale: Number(entity.scale[0].toFixed(2)),
        distance: Number(d.toFixed(1)),
        built: this.renderer.hasView(entity.id),
      });
    }
    return out.sort((a, b) => (a.distance as number) - (b.distance as number));
  }

  inspect(): Record<string, unknown> {
    const stats = this.renderer.stats();
    return {
      zone: this.world.zone?.name ?? null,
      zoneId: this.world.zone?.id ?? null,
      tiles: { window: this.world.blockSize, ...this.world.tileReport() },
      graphics: this.renderer.graphicsProfile,
      terrainTiles: stats.terrainTiles,
      pendingTiles: this.world.pendingTiles,
      entities: this.world.entities.size,
      entityViews: stats.entityViews,
      pendingAttachments: stats.pendingAttachments,
      animatedEntities: stats.animatedEntities,
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      staticBatches: stats.staticBatches,
      foliageCompanions: stats.foliageCompanions,
      hideMs: Number(stats.hideMs.toFixed(2)),
      preMs: Number(stats.preMs.toFixed(2)),
      drawMs: Number(stats.drawMs.toFixed(2)),
      networkMs: Number(this.frameMs.network.toFixed(2)),
      syncMs: Number(this.frameMs.sync.toFixed(2)),
      hudMs: Number(this.frameMs.hud.toFixed(2)),
      clipsMs: Number(this.frameMs.clips.toFixed(2)),
      effectsMs: Number(stats.effectsMs.toFixed(2)),
      postMs: Number(stats.postMs.toFixed(2)),
      movers: this.world.movers.size,
      distantMovers: this.world.distantMovers(this.renderer.graphicsProfile.animationDistance),
      weaponStripes: stats.weaponStripes,
      texturesUploaded: stats.texturesUploaded,
      waterfall: this.renderer.waterfallStatus,
      player: this.world.player?.position ?? null,
      camera: this.renderer.rig.camera.position.toArray(),
      source: this.resources.currentSource()?.label ?? null,
      // Prefer the dev server's per-request stamp: the define is fixed at boot.
      build:
        (globalThis as { __UBIQUITOUS_STAMP__?: string }).__UBIQUITOUS_STAMP__ ?? __BUILD_STAMP__,
      status: this.status(),
    };
  }

  /** What is placed around the player, nearest first, so a report can name the asset. */
  nearby(radius = 12): Array<Record<string, unknown>> {
    const at = this.world.player?.position;
    if (!at) return [];
    const out: Array<Record<string, unknown>> = [];
    for (const e of this.world.entities.values()) {
      const dx = e.position[0] - at[0];
      const dy = e.position[1] - at[1];
      const dz = e.position[2] - at[2];
      const distance = Math.hypot(dx, dy, dz);
      if (distance > radius) continue;

      const [x, y, z, w] = e.rotation;
      const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x));
      const tilted = Math.abs(x) > 1e-3 || Math.abs(z) > 1e-3;
      out.push({
        model: e.model,
        kind: e.kind,
        distance: Number(distance.toFixed(2)),
        position: e.position.map(v => Number(v.toFixed(2))),
        yawDegrees: Number(((yaw * 180) / Math.PI).toFixed(1)),
        // Everything placed from a spawn table should be upright.
        tilted,
        scale: e.scale.map(v => Number(v.toFixed(2))),
        entry: e.entry || undefined,
        // What `interactWith` keys clickability off; a local spawn-table
        // entity never has a network id of its own.
        interactionIcon: e.interactionIcon,
        npcFlags: e.npcFlags,
        offersQuests: e.offersQuests,
        networkId: this.bodies.networkIdOf(e.id),
      });
    }
    return out.sort((a, b) => (a.distance as number) - (b.distance as number));
  }

  toggleCollision(on: boolean): boolean {
    this.collisionShown = on;
    const triangles = this.renderer.setCollisionDebug(this.world, on);
    if (on && triangles === 0) {
      log.warn('collision debug: this zone has no collision geometry');
      return false;
    }
    return on;
  }

  collisionVisible(): boolean {
    return this.collisionShown;
  }

  /** Show or hide distance fade; the zone's fog is kept for turning it back on. */
  toggleFog(on: boolean): boolean {
    this.renderer.setFogEnabled(on);
    return this.renderer.fogIsEnabled();
  }

  fogVisible(): boolean {
    return this.renderer.fogIsEnabled();
  }

  /** Debug: what the world thinks is underfoot, and everything stacked there. */
  collisionReport(): void {
    const p = this.world.player;
    if (!p) {
      console.log('no player');
      return;
    }
    const [px, py, pz] = p.position;
    const terrainY = this.world.terrain.heightAt(px, pz);
    const hit = this.world.collision.groundAt(px, pz, py);

    console.group(
      `%c collision @ (${px.toFixed(1)}, ${py.toFixed(1)}, ${pz.toFixed(1)})`,
      'color:#8cf',
    );
    console.log(`terrain:  ${terrainY === null ? 'none' : terrainY.toFixed(2)}`);
    console.log(`standing: ${this.world.groundHeight(px, pz, py).toFixed(2)}`);
    console.log(`collision underfoot: ${hit ? `${hit.y.toFixed(2)}  ${hit.path}` : 'none'}`);
    console.log(
      `loaded: ${this.world.collision.triangleCount()} triangles in ${this.world.collision.cellCount()} cells`,
    );
    if (this.world.collision.triangleCount() === 0) {
      // A build extracted without `model_phy.bin` mounts fine and has no
      // collision at all; this differs per machine.
      console.warn(
        'no collision anywhere. `model_phy.bin` is almost certainly missing from the ' +
          'mounted build — re-extract from the .ipa with ubiquitous.useFile(). Check the log ' +
          'for "no model_phy.bin".',
      );
    }

    const open = this.world.collision.openAreaList();
    if (open.length === 0) {
      console.log('open areas: none');
    } else {
      console.log(`open areas: ${open.length}`);
      console.table(
        open.map(a => ({
          name: a.name,
          x: `${a.minX}..${a.maxX}`,
          z: `${a.minZ}..${a.maxZ}`,
          // Whether the player is standing in it, which is the question worth
          // asking when a way that should be open still stops you.
          standingIn: px >= a.minX && px <= a.maxX && pz >= a.minZ && pz <= a.maxZ,
        })),
      );
    }

    const stack = this.world.collision.probe(px, pz);
    console.log(`triangles covering this point: ${stack.length}`);
    if (stack.length > 0) {
      console.table(
        stack.map(s => ({
          y: s.y.toFixed(2),
          kind: s.kind,
          normalY: s.normalY.toFixed(2),
          path: s.path.split('/').pop(),
        })),
      );
    }
    console.groupEnd();
  }

  /** Draw the server's walkable ground and summarise it at the player; operator-only, a snapshot. */
  async navigation(
    on = true,
    radius?: number,
    everyStorey = false,
  ): Promise<Record<string, unknown>> {
    if (!on) {
      this.navigationShown = false;
      this.renderer.setNavigationDebug(null, null);
      return { drawn: false };
    }

    const ground = await this.askNavigationGround(radius);
    if (!ground) {
      // Unknown message or refused; either way the refusal is in the log.
      console.warn(
        'no answer to navigation.request within ' +
          `${NAVIGATION_ANSWER_TIMEOUT_MS} ms. An operator account is required; ` +
          'check the log for a protocol error.',
      );
      return { drawn: false, answered: false };
    }

    const player = this.world.player;
    const [px, py, pz] = player?.position ?? [0, 0, 0];
    const summary = ground.summary(px, py, pz);

    this.navigationShown = true;
    // One storey by default: the overlay has no depth test. Centred on the
    // player, not the reported ground, which may be another floor.
    const stats = this.renderer.setNavigationDebug(
      ground,
      summary.standingOn,
      everyStorey ? null : py,
    );

    console.group(
      `%c walkable ground @ (${px.toFixed(1)}, ${py.toFixed(1)}, ${pz.toFixed(1)})`,
      'color:#8cf',
    );
    if (!summary.baked) {
      // An unbaked map: the server answers null to every ground question.
      console.warn(`map ${summary.mapId} has no bake on this server. Nothing to draw.`);
      console.groupEnd();
      return { ...summary, drawn: false };
    }
    console.log(
      `polygons: ${summary.drawn} drawn of ${summary.polygonCount} on the map` +
        `${summary.truncated ? ' (answer capped; ask for a smaller radius)' : ''}`,
    );
    console.log(`links drawn: ${stats.links}`);
    if (stats.otherStoreys > 0) {
      console.log(
        `${stats.otherStoreys} polygons on other storeys are not drawn — ` +
          'ubiquitous.nav(true, undefined, true) draws them too',
      );
    }
    if (summary.standingOn === null) {
      console.warn('standing on: nothing. The server would not stand a body here.');
      if (summary.nearestY !== null) {
        console.log(
          `nearest floor the bake has: ${summary.nearestY.toFixed(2)}, ` +
            `${Math.abs(summary.playerY - summary.nearestY).toFixed(2)} away ` +
            `${summary.nearestY < summary.playerY ? 'below' : 'above'} — ` +
            'the bake is missing the floor under the player, not holding it in the wrong place',
        );
      }
    } else {
      console.log(`standing on: polygon ${summary.standingOn}`);
      console.log(
        `height: bake says ${summary.groundY!.toFixed(2)}, player is at ${summary.playerY.toFixed(2)} ` +
          `(drift ${summary.drift!.toFixed(2)})`,
      );
      console.log(`links from it: ${summary.links.length > 0 ? summary.links.join(', ') : 'none'}`);
      if (summary.touchingWithoutLink.length > 0) {
        // Touching but unlinked: a ledge over a floor, or a closed doorway.
        console.log(
          `touching but not linked: ${summary.touchingWithoutLink.join(', ')} ` +
            '- a way the bake closed, or a ledge it was right to keep shut',
        );
      }
    }
    if (summary.parameters) console.table([summary.parameters]);
    console.groupEnd();
    return { ...summary, drawn: true, linksDrawn: stats.links };
  }

  navigationVisible(): boolean {
    return this.navigationShown;
  }
}
