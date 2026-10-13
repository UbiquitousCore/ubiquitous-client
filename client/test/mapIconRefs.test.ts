import { describe, expect, it } from 'vitest';

import { collectMapIconRefs, uncachedIconRefs } from '../src/app/helpers/map/mapIconRefs';

describe('collectMapIconRefs', () => {
  it('collects each service marker icon once, in marker order, skipping markers with none', () => {
    const serviceMarkers = [{ id: '1' }, { id: '2' }, { id: '9' }, { id: '3' }];
    const entities = new Map<number, { interactionIcon?: string }>([
      [1, { interactionIcon: 'icon/a' }],
      [2, {}],
      [3, { interactionIcon: 'icon/a' }],
    ]);
    expect(collectMapIconRefs(serviceMarkers, entities)).toEqual(['icon/a']);
  });
});

describe('uncachedIconRefs', () => {
  it('returns only refs not already in cache, preserving order', () => {
    const cache = new Map<string, string>([['icon/b', 'blob:b']]);
    expect(uncachedIconRefs(['icon/a', 'icon/b', 'icon/c'], cache)).toEqual(['icon/a', 'icon/c']);
  });
});
