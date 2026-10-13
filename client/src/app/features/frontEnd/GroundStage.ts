import { logger } from '../../../core/log';
import type { ResourceSystem } from '../../../assets/ResourceSystem';
import type { SelectionScene, SelectionView } from '../../../renderer/SelectionScene';
import {
  lookKey,
  NO_HAIR_CHOSEN,
  portraits,
  setLooks,
  setPortrait,
  startingHairStyle,
} from '../../../ui/frontend/frontEndStore';
import type { PreviewLook } from '../../../ui/frontend/frontEndStore';
import { previewAppearanceFor } from './previewAppearance';

const log = logger('ground');

const SELECTION_MAP = 'human_selection';

/** What the screens ask of the ground behind them. */
export type Ground = Pick<
  SelectionScene,
  'open' | 'watch' | 'showBody' | 'portrait' | 'celebrate' | 'turnBy' | 'releaseTurn' | 'dispose'
>;

/**
 * The ground the screens before the world stand on, alive only while they
 * are. A screen's children mount before the canvas holder, so the first ask
 * for a body or a portrait always predates the ground; those asks wait here
 * for it.
 */
export class GroundStage {
  private ground: Ground | null = null;
  /** The view the screens last asked for, for a ground built afterwards. */
  private view: SelectionView = 'wide';
  private wantedLook: PreviewLook | null = null;
  /** Portraits asked for before the ground exists. */
  private readonly wantedPortraits = new Map<string, PreviewLook>();

  constructor(
    private readonly resources: Pick<ResourceSystem, 'networkAppearance' | 'lookOptions'>,
    private readonly makeGround: (canvas: HTMLCanvasElement) => Ground,
  ) {}

  /** Adopt the canvas the screens mounted for the ground, or drop it. */
  canvas(canvas: HTMLCanvasElement | null): void {
    if (canvas === null) {
      this.dispose();
      return;
    }
    if (this.ground) return;
    const ground = this.makeGround(canvas);
    this.ground = ground;
    ground.watch(this.view);
    void ground.open(SELECTION_MAP);
    if (this.wantedLook) void this.show(this.wantedLook);
    const waiting = [...this.wantedPortraits.values()];
    this.wantedPortraits.clear();
    for (const look of waiting) void this.portrait(look);
  }

  /** Photograph a look for a screen's circle, resolved as it would stand on the dais. */
  async portrait(look: PreviewLook): Promise<void> {
    const ground = this.ground;
    if (portraits.value.has(lookKey(look))) return;
    if (!ground) {
      this.wantedPortraits.set(lookKey(look), look);
      return;
    }
    try {
      const resolved = await this.resources.networkAppearance(
        previewAppearanceFor(await this.withStartingHair(look)),
      );
      const url = await ground.portrait({
        model: resolved.model,
        appearance: resolved.appearance,
        scale: resolved.scale,
      });
      if (url) setPortrait(look, url);
    } catch (error) {
      log.warn(`could not take a picture of that look: ${String(error)}`);
    }
  }

  /** Stand a body behind the screens, resolved as in the world; also learns which looks it offers. */
  async show(look: PreviewLook | null): Promise<void> {
    this.wantedLook = look;
    const ground = this.ground;
    if (!ground) return;
    if (look === null) {
      await ground.showBody(null);
      return;
    }
    try {
      const resolved = await this.resources.networkAppearance(
        previewAppearanceFor(await this.withStartingHair(look)),
      );
      // A body asked for since has its own list coming, and this one's
      // numbers can mean a bare scalp on it.
      if (this.wantedLook !== look) return;
      await ground.showBody({
        model: resolved.model,
        appearance: resolved.appearance,
        scale: resolved.scale,
      });
      const offered = await this.resources.lookOptions(resolved.model);
      if (this.wantedLook === look) setLooks(offered);
    } catch (error) {
      log.warn(`could not stand that body on the selection ground: ${String(error)}`);
    }
  }

  /** Which way the camera looks: close on the body, or wide on the dais. */
  watch(view: SelectionView): void {
    this.view = view;
    this.ground?.watch(view);
  }

  celebrate(): void {
    void this.ground?.celebrate();
  }

  turnBy(radians: number): void {
    this.ground?.turnBy(radians);
  }

  releaseTurn(): void {
    this.ground?.releaseTurn();
  }

  /** Drop the ground; the screens that stood on it are gone. */
  dispose(): void {
    this.ground?.dispose();
    this.ground = null;
  }

  /**
   * A look whose hair nobody has picked yet, with the style its body
   * starts on — the same one the draft settles on once the body's list
   * of looks arrives.
   */
  private async withStartingHair(look: PreviewLook): Promise<PreviewLook> {
    if (look.hairStyle !== NO_HAIR_CHOSEN) return look;
    const { model } = await this.resources.networkAppearance(previewAppearanceFor(look));
    return { ...look, hairStyle: startingHairStyle(await this.resources.lookOptions(model)) };
  }
}
