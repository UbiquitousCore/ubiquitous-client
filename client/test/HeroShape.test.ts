import { describe, expect, it, vi } from 'vitest';
import { HeroShape } from '../src/gameplay/HeroShape';
import type { ShapedLook } from '../src/gameplay/HeroShape';
import type { Entity } from '../src/world/World';

function setup(looks: Record<number, ShapedLook | null>) {
  const hero = { model: 'human.m2', scale: [1, 1, 1], version: 0 } as unknown as Entity;
  const setAppearance = vi.fn();
  const refresh = vi.fn();
  const shape = new HeroShape({
    look: async display => looks[display] ?? null,
    hero: () => hero,
    setAppearance,
    refresh,
  });
  return { hero, shape, setAppearance, refresh };
}

const DEMON: ShapedLook = {
  model: 'demon.m2',
  scale: 2,
  appearance: { skin: 'demon.tga', meshes: [], skinReplacesAll: true, key: 'skin:demon.tga' },
};

describe('HeroShape', () => {
  it('turns the hero into the shape and back to its own look', async () => {
    const own: ShapedLook = { model: 'human.m2', scale: 1 };
    const { hero, shape, setAppearance, refresh } = setup({ 1962: DEMON, 0: own });

    await shape.set(1962);
    expect(hero.model).toBe('demon.m2');
    expect(hero.scale).toEqual([2, 2, 2]);
    expect(setAppearance).toHaveBeenCalledWith(hero, DEMON.appearance);
    expect(refresh).toHaveBeenCalledTimes(1);

    await shape.set(0);
    expect(hero.model).toBe('human.m2');
    expect(hero.scale).toEqual([1, 1, 1]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('builds one body for the same shape asked twice', async () => {
    const { shape, refresh } = setup({ 1962: DEMON });

    await Promise.all([shape.set(1962), shape.set(1962)]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('leaves the hero as it is when the shape cannot be resolved', async () => {
    const { hero, shape, refresh } = setup({});

    await shape.set(9999);

    expect(hero.model).toBe('human.m2');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('lets the later ask win when an earlier one resolves after it', async () => {
    const resolvers: Array<(look: ShapedLook) => void> = [];
    const hero = { model: 'human.m2', scale: [1, 1, 1], version: 0 } as unknown as Entity;
    const refresh = vi.fn();
    const shape = new HeroShape({
      look: () => new Promise(resolve => resolvers.push(resolve)),
      hero: () => hero,
      setAppearance: vi.fn(),
      refresh,
    });

    const first = shape.set(1);
    const second = shape.set(2);
    resolvers[1]({ model: 'two.m2', scale: 1 });
    await second;
    resolvers[0]({ model: 'one.m2', scale: 1 });
    await first;

    expect(hero.model).toBe('two.m2');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
