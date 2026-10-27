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
];

export const UNSUPPORTED_VERSIONS_NOTE =
  'Other builds may work, but are not yet supported and may show missing or wrong data. Support for every build is the aim, and will come later.';
