/**
 * Error types that cross subsystem boundaries.
 *
 * The point of naming these is that the UI can react to *why* something failed
 * without string-matching messages, and without knowing which provider was in
 * play (HTTP, cache, or a future WASM runtime).
 */

/** A resource could not be produced. `key` is the ResourceId key. */
export class ResourceError extends Error {
  constructor(
    readonly key: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ResourceError';
  }
}

/** The resource genuinely does not exist in the mounted game data. */
export class ResourceNotFoundError extends ResourceError {
  constructor(key: string, message = `not found: ${key}`) {
    super(key, message);
    this.name = 'ResourceNotFoundError';
  }
}

/** The provider is not usable yet — e.g. no game source has been selected. */
export class ProviderNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderNotReadyError';
  }
}
