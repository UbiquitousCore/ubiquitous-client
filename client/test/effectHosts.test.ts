import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemEffectHost, placedEffectHosts } from '../src/renderer/attachPoints';

/** Twelve floats: identity rows, then a translation. */
const at = (x: number, y: number, z: number) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];

function named(name: string, scale = 1): THREE.Object3D {
  const node = new THREE.Group();
  node.name = name;
  node.scale.setScalar(scale);
  return node;
}

describe('where a placed effect’s emitters hang', () => {
  it('takes the effect’s own point before a drawn node of the same name', () => {
    const root = new THREE.Group();
    root.add(named('smoke', 40));
    const group = new THREE.Group();
    const { attach } = placedEffectHosts([{ attachPoints: { smoke: at(1, 2, 3) } }], [root], group);
    const host = attach('smoke')!;
    expect(host.parent).toBe(group);
    expect(host.position.toArray()).toEqual([1, 2, 3]);
    expect(host.scale.x).toBe(1);
    expect(attach('smoke')).toBe(host);
  });

  it('falls back to a drawn node, and to nothing, never to a holder at the origin', () => {
    const root = new THREE.Group();
    const flame = named('flame');
    root.add(flame);
    const group = new THREE.Group();
    const { attach, findDrawable } = placedEffectHosts([{ attachPoints: {} }], [root], group);
    expect(attach('flame')).toBe(flame);
    expect(attach('missing')).toBeNull();
    expect(findDrawable('flame')).toBe(flame);
    expect(group.children).toHaveLength(0);
  });
});

describe('where a worn item’s effect hangs', () => {
  it('makes a holder at the item’s stored point where the model drops the node', () => {
    const staff = new THREE.Group();
    const host = itemEffectHost(staff, 'Dummy_Tip', at(0, 1.4, 0))!;
    expect(host.parent).toBe(staff);
    expect(host.position.y).toBeCloseTo(1.4);
  });

  it('uses the node itself where the model has it, and nothing where neither is known', () => {
    const staff = new THREE.Group();
    const tip = named('Dummy_Tip');
    staff.add(tip);
    expect(itemEffectHost(staff, 'Dummy_Tip', at(0, 9, 0))).toBe(tip);
    expect(itemEffectHost(new THREE.Group(), 'Dummy_Tip', null)).toBeNull();
  });
});
