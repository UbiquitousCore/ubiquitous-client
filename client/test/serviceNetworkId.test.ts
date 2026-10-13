import { describe, expect, it } from 'vitest';

import { serviceNetworkIdForInteraction } from '../src/app/helpers/npc/serviceNetworkId';

describe('serviceNetworkIdForInteraction', () => {
  it('uses direct network id for most services', () => {
    expect(
      serviceNetworkIdForInteraction({
        service: 'shop',
        entityKind: 'creature',
        directNetworkId: 10,
        twinNetworkId: 99,
      }),
    ).toBe(10);
  });

  it('falls back to network twin for static/mail/storage services', () => {
    expect(
      serviceNetworkIdForInteraction({
        service: 'mail',
        entityKind: 'creature',
        directNetworkId: undefined,
        twinNetworkId: 22,
      }),
    ).toBe(22);
    expect(
      serviceNetworkIdForInteraction({
        service: 'talk',
        entityKind: 'static',
        directNetworkId: undefined,
        twinNetworkId: 33,
      }),
    ).toBe(33);
  });

  it('returns undefined when neither direct nor twin ids exist', () => {
    expect(
      serviceNetworkIdForInteraction({
        service: 'storage',
        entityKind: 'static',
        directNetworkId: undefined,
        twinNetworkId: undefined,
      }),
    ).toBeUndefined();
  });
});
