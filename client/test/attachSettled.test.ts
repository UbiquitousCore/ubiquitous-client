/**
 * When a zone has actually finished attaching, not merely finished queuing.
 *
 * `drainAttachQueue` pops an entity off `attachQueue` the instant it
 * dispatches `attach()` — the model fetch/decode behind that call is
 * asynchronous and can still be running once the queue itself reads empty.
 * A settle loop (`Game.loadZoneWithScreen`) that polled the queue alone would
 * call a zone "drained" the moment it emptied, which for a small zone (a
 * quest hub's handful of NPCs, not a dense streamed burst) is often the very
 * first pass — the screen would hide while every one of those bodies was
 * still an empty, unattached `THREE.Group`: visible-looking (the create
 * packet drew a nameplate/icon already) but with nothing in it for
 * `pickEntityObject`'s raycast to hit, so nothing is clickable or attackable
 * right at spawn until the in-flight attaches finish.
 */

import { describe, expect, it } from 'vitest';
import { pendingAttachmentCount } from '../src/renderer/picking';

describe('pendingAttachmentCount', () => {
  it('is zero once nothing is queued and nothing is still resolving', () => {
    expect(pendingAttachmentCount(0, 0)).toBe(0);
  });

  it('counts a dispatched-but-unresolved attach as still pending', () => {
    // The exact shape of the bug: `drainAttachQueue` already popped every
    // candidate (the queue reads 0), but their `attach()` calls have not
    // resolved a model yet.
    expect(pendingAttachmentCount(0, 3)).toBeGreaterThan(0);
  });

  it('adds the queue and the in-flight count rather than picking one', () => {
    expect(pendingAttachmentCount(2, 5)).toBe(7);
  });
});
