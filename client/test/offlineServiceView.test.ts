import { describe, expect, it } from 'vitest';

import { offlineServiceView } from '../src/app/helpers/npc/offlineServiceView';

describe('offlineServiceView', () => {
  it('warns when storage/mail have no network twin', () => {
    const out = offlineServiceView({
      service: 'storage',
      entityId: 10,
      vendorName: 'n/a',
      balance: 0,
    });
    expect(out).toEqual({
      kind: 'warn',
      message:
        'storage: entity 10 has no networked twin, so there is nothing to ask the server about',
    });
  });

  it('returns shop fallback for offline vendors', () => {
    const out = offlineServiceView({
      service: 'shop',
      entityId: 8,
      vendorName: 'Ivy',
      balance: 33,
    });
    expect(out?.kind).toBe('shop');
    if (out?.kind === 'shop') {
      expect(out.interaction.vendorName).toBe('Ivy');
      expect(out.interaction.balance).toBe(33);
    }
  });

  it('returns debug overlays for auction/talk offline', () => {
    const auction = offlineServiceView({
      service: 'auction',
      entityId: 8,
      vendorName: 'n/a',
      balance: 0,
    });
    expect(auction?.kind).toBe('debug');
    const talk = offlineServiceView({
      service: 'talk',
      entityId: 9,
      vendorName: 'n/a',
      balance: 0,
    });
    expect(talk?.kind).toBe('debug');
  });
});
