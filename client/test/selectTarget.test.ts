import { describe, expect, it } from 'vitest';

import { pickTargetSelection } from '../src/app/helpers/combat/selectTarget';

describe('pickTargetSelection', () => {
  it('rejects missing entities and unsupported kinds', () => {
    expect(
      pickTargetSelection({
        localId: '3',
        entity: null,
        isOwnBody: false,
        onOwnSide: false,
        followId: null,
      }),
    ).toBeNull();
    expect(
      pickTargetSelection({
        localId: '3',
        entity: { kind: 'static', networkStealthed: false },
        isOwnBody: false,
        onOwnSide: false,
        followId: null,
      }),
    ).toBeNull();
  });

  it('rejects own body and hidden stealthed enemies', () => {
    expect(
      pickTargetSelection({
        localId: '3',
        entity: { kind: 'creature', networkStealthed: false },
        isOwnBody: true,
        onOwnSide: false,
        followId: null,
      }),
    ).toBeNull();
    expect(
      pickTargetSelection({
        localId: '3',
        entity: { kind: 'creature', networkStealthed: true },
        isOwnBody: false,
        onOwnSide: false,
        followId: null,
      }),
    ).toBeNull();
  });

  it('selects visible targets and marks when follow should stop', () => {
    expect(
      pickTargetSelection({
        localId: '3',
        entity: { kind: 'player', networkStealthed: true },
        isOwnBody: false,
        onOwnSide: true,
        followId: 3,
      }),
    ).toEqual({ id: 3, localId: '3', stopFollow: false });
    expect(
      pickTargetSelection({
        localId: '9',
        entity: { kind: 'creature', networkStealthed: false },
        isOwnBody: false,
        onOwnSide: false,
        followId: 3,
      }),
    ).toEqual({ id: 9, localId: '9', stopFollow: true });
  });
});
