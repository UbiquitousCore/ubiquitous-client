/** A zone's packed colours keep red in the low byte and blue in the third. */

import { describe, expect, it } from 'vitest';

import type { ZoneRow } from '../src/assets/formats/tables';
import { atmosphereFrom } from '../src/assets/providers/localZone';

const bytes = (rgb: readonly number[] | undefined) => rgb?.map(v => Math.round(v * 255));

describe('a zone’s colours', () => {
  it('reads red from the low byte and blue from the third', () => {
    const row = { fogColor: 0xd1a89d, fogNear: 25, fogFar: 90 } as ZoneRow;
    expect(bytes(atmosphereFrom(row).fogColor)).toEqual([0x9d, 0xa8, 0xd1]);
  });

  it('reads the ground’s sun and shade the same way', () => {
    const row = { fogColor: 0xe4e9cd, sunColor: 0xb1fbf2, shadeColor: 0xe4966b } as ZoneRow;
    const atmos = atmosphereFrom(row);
    expect(bytes(atmos.sunColor)).toEqual([0xf2, 0xfb, 0xb1]);
    expect(bytes(atmos.shadeColor)).toEqual([0x6b, 0x96, 0xe4]);
  });

  it('leaves the ground’s own light where the zone sets none', () => {
    const atmos = atmosphereFrom({ fogColor: 0xd1a89d, sunColor: 0, shadeColor: 0 } as ZoneRow);
    expect(atmos.sunColor).toBeUndefined();
    expect(atmos.shadeColor).toBeUndefined();
  });
});
