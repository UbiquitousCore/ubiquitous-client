import { describe, expect, it } from 'vitest';

import { networkTwinNetworkIdFor } from '../src/app/helpers/npc/networkTwin';

describe('networkTwinNetworkIdFor', () => {
  it('returns first nearby same-kind same-entry twin with network id', () => {
    const me = {
      id: 1,
      kind: 'static',
      entry: 40,
      position: [0, 0, 0] as [number, number, number],
    };
    const others = [
      { id: 2, kind: 'static', entry: 40, position: [20, 0, 0] as [number, number, number] },
      { id: 3, kind: 'static', entry: 40, position: [2, 0, 0] as [number, number, number] },
    ];
    const out = networkTwinNetworkIdFor(me, [me, ...others], id => (id === 3 ? 88 : undefined));
    expect(out).toBe(88);
  });

  it('ignores different kind/entry and far entities', () => {
    const me = {
      id: 1,
      kind: 'static',
      entry: 40,
      position: [0, 0, 0] as [number, number, number],
    };
    const others = [
      { id: 2, kind: 'creature', entry: 40, position: [1, 0, 0] as [number, number, number] },
      { id: 3, kind: 'static', entry: 41, position: [1, 0, 0] as [number, number, number] },
      { id: 4, kind: 'static', entry: 40, position: [5, 0, 0] as [number, number, number] },
    ];
    const out = networkTwinNetworkIdFor(me, [me, ...others], () => 77);
    expect(out).toBeUndefined();
  });
});
