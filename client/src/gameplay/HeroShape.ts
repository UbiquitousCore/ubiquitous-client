import type { Appearance } from '../assets/types';
import type { Entity } from '../world/World';

export interface ShapedLook {
  model: string;
  scale: number;
  appearance?: Appearance;
}

export interface HeroShapeDeps {
  /** The hero's look as `shape` (0 for its own); null when it cannot be resolved. */
  look(shape: number): Promise<ShapedLook | null>;
  hero(): Entity | undefined;
  setAppearance(entity: Entity, appearance: Appearance): void;
  refresh(entity: Entity): void;
}

/** The local player's body turned into another creature's by an aura, and back. */
export class HeroShape {
  private shape = 0;

  constructor(private readonly deps: HeroShapeDeps) {}

  get current(): number {
    return this.shape;
  }

  async set(display: number): Promise<void> {
    if (display === this.shape) return;
    this.shape = display;
    const look = await this.deps.look(display);
    // A later ask, or the world rebuilt meanwhile, wins.
    if (!look || this.shape !== display) return;
    const hero = this.deps.hero();
    if (!hero) return;
    hero.model = look.model;
    hero.scale = [look.scale, look.scale, look.scale];
    if (look.appearance) this.deps.setAppearance(hero, look.appearance);
    else hero.version++;
    this.deps.refresh(hero);
  }
}
