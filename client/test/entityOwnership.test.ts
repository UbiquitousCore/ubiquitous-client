import { describe, expect, it } from 'vitest';

import { isOwnBodyId, onOwnSideId } from '../src/app/helpers/combat/entityOwnership';

describe('isOwnBodyId', () => {
  it('treats the world player id as own body', () => {
    expect(
      isOwnBodyId({ id: 10, playerId: 10, networkId: undefined, isSelfNetworkId: () => false }),
    ).toBe(true);
  });

  it('treats mapped self network id as own body', () => {
    expect(
      isOwnBodyId({ id: 10, playerId: 9, networkId: 77, isSelfNetworkId: id => id === 77 }),
    ).toBe(true);
  });

  it('rejects unrelated ids', () => {
    expect(isOwnBodyId({ id: 10, playerId: 9, networkId: 77, isSelfNetworkId: () => false })).toBe(
      false,
    );
  });
});

describe('onOwnSideId', () => {
  it('includes own body automatically', () => {
    expect(
      onOwnSideId({ id: 10, isOwnBody: true, networkId: undefined, partyNetworkIds: [] }),
    ).toBe(true);
  });

  it('includes party members by network id', () => {
    expect(
      onOwnSideId({ id: 11, isOwnBody: false, networkId: 55, partyNetworkIds: [12, 55, 99] }),
    ).toBe(true);
  });

  it('excludes entities with no party match', () => {
    expect(
      onOwnSideId({ id: 11, isOwnBody: false, networkId: 56, partyNetworkIds: [12, 55, 99] }),
    ).toBe(false);
  });
});
