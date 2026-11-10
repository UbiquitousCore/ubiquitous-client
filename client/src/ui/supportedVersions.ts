/** One build the client knows how to read, and what that means for the player. */
export interface SupportedVersion {
  version: string;
  note: string;
}

export const SUPPORTED_VERSIONS: readonly SupportedVersion[] = [
  {
    version: '1.1.4',
    note: 'The build this client was made with; the character and inventory screens are drawn to match it.',
  },
  {
    version: '2.2.0',
    note: 'Its tables and models read too.\nThe first run unpacks about 1.5 GB into your browser, once.',
  },
  {
    version: '1.0.0 to 1.1.1',
    note: 'Their tables read: spells, talents, items, zones and what is placed in them.\nTheir models and screens are not yet checked; a screen a build lacks falls back to a plain one.',
  },
];

export const UNSUPPORTED_VERSIONS_NOTE =
  'Other builds may work, but are not yet supported and may show missing or wrong data. The tables of 1.1.5, 2.5.0 and 4.2.21 read as well; the rest of those builds is not yet checked.';
