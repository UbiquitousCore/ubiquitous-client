import { describe, expect, it } from 'vitest';

import { serviceMarkerKind } from '../src/app/helpers/map/serviceMarkerKind';

describe('serviceMarkerKind', () => {
  it('never marks a static object, whatever icon it carries', () => {
    expect(serviceMarkerKind({ kind: 'static' }, () => true)).toBeNull();
    expect(serviceMarkerKind({ kind: 'static', npcFlags: 7 }, () => true)).toBeNull();
  });

  it('marks creatures with npc flags only when those flags show on map', () => {
    expect(serviceMarkerKind({ kind: 'creature', npcFlags: 7 }, flags => flags === 7)).toBe(
      'service',
    );
    expect(serviceMarkerKind({ kind: 'creature', npcFlags: 3 }, flags => flags === 7)).toBeNull();
  });

  it('marks a creature with no flags to read as nothing', () => {
    expect(serviceMarkerKind({ kind: 'creature' }, () => true)).toBeNull();
  });

  it('never marks unrelated entity kinds', () => {
    expect(serviceMarkerKind({ kind: 'player', npcFlags: 7 }, () => true)).toBe(null);
  });
});
