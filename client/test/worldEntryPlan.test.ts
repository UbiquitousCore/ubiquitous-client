import { describe, expect, it } from 'vitest';
import { worldEntryPlan } from '../src/app/helpers/world/worldEntryPlan';

describe('worldEntryPlan', () => {
  it('at login, distrusts the old team and finishes the sign-in, without arriving by teleport', () => {
    expect(worldEntryPlan(false)).toEqual({
      resetParty: true,
      arriveByTeleport: false,
      finishSignIn: true,
    });
  });

  it('on a map crossing, keeps the team and replaces the zone by arriving', () => {
    expect(worldEntryPlan(true)).toEqual({
      resetParty: false,
      arriveByTeleport: true,
      finishSignIn: false,
    });
  });
});
