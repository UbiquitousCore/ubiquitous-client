import { describe, expect, it } from 'vitest';

import { parseAreaLinks } from '../src/assets/providers/PackAssetProvider';

/**
 * The shape of the shipped file, written out by hand rather than copied: the
 * point is to pin what the parser accepts, and the user's file is not ours
 * to commit.
 */
const SAMPLE = [
  '///// comment lines start with a slash',
  'Type = AreaZone',
  '//// a comment naming the columns',
  '{0},\t {btn01}, \t//an area this build does not ship',
  '{409},\t {btn02}, \t//sample region A',
  '{324},\t {btn05},\t\t//sample region B',
  '',
  'Type = ZoneRelation',
  '//// another comment',
  '{324} { 0  ,317,0  ,0,  },\t//sample region B',
  '{317} { 324,320,0  ,0,  },',
  '{0  } { 0  ,0  ,0  ,0,  },',
  '',
  'Type = ZoneSubArea',
  '{403} {471, 498, -27, 133}, //sample region C, its sub-area',
].join('\n');

describe('parseAreaLinks', () => {
  it('names each shipped region button, and skips the blanks', () => {
    expect(parseAreaLinks(SAMPLE).buttons).toEqual({ 409: 'btn02', 324: 'btn05' });
  });

  it('keeps the button order, blanks included', () => {
    // A zero is a region drawn on the picture that this build has no zone
    // for. Dropping it silently would shift every later button.
    expect(parseAreaLinks(SAMPLE).regions).toEqual([0, 409, 324]);
  });

  it('reads the four directions in the order the file documents', () => {
    const { neighbours } = parseAreaLinks(SAMPLE);
    expect(neighbours[324]).toEqual([0, 317, 0, 0]);
    expect(neighbours[317]).toEqual([324, 320, 0, 0]);
    // Zone 0 is not a zone, so it gets no entry to look up.
    expect(neighbours[0]).toBeUndefined();
  });

  it('keeps both ids from a sub-area row', () => {
    // One says where the gateway is drawn -- a town's indicator on its
    // region's map -- and the other says which region it leads to,
    // which is where that place's bus stop actually lives. The pixel offsets
    // that follow belong to the drawing and are dropped.
    expect(parseAreaLinks(SAMPLE).subAreas[403]).toEqual([{ topZoneId: 471, zoneId: 498 }]);
  });

  it('survives CRLF, which is what the shipped file uses', () => {
    expect(parseAreaLinks(SAMPLE.split('\n').join('\r\n')).regions).toEqual([0, 409, 324]);
  });

  it('ignores a line that is only a comment or only one group', () => {
    expect(parseAreaLinks('Type = AreaZone\n// {99}, {btn01}\n{99}\n').regions).toEqual([]);
  });
});
