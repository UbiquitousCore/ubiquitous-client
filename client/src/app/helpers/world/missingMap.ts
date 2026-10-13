/** Whether a zone failed to load because its map pack was never extracted. */
export function isMissingMapFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /never been extracted/.test(message);
}

/** What to ask the player when a map is missing: reconnect the remembered game file, or choose one. */
export function missingMapOffer(stored: { name: string } | null): {
  prompt: string;
  label: string;
  skipLabel: string;
} {
  return stored
    ? {
        prompt: `This map has not been extracted yet.\n\nReconnect to ${stored.name} to load it.`,
        label: `Continue with ${stored.name}`,
        skipLabel: 'Cancel',
      }
    : {
        prompt: 'This map has not been extracted yet.\n\nChoose your .ipa to load it.',
        label: 'Choose game file...',
        skipLabel: 'Cancel',
      };
}
