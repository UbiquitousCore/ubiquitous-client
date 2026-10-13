/** @vitest-environment happy-dom */
/**
 * The layer that puts words over a head.
 *
 * The one rule worth a test is about *when* it starts: the HUD is
 * mounted long before anybody says anything, so a layer that only
 * exists once there is something on it is a layer the painting loop is
 * never given. The boxes are then drawn and never placed, which on
 * screen is chat that does not appear at all.
 */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatBubbles } from '../../src/ui/components/ChatBubbles';
import { chatSaid, clearChat, noteChat } from '../../src/ui/chatStore';

afterEach(() => {
  cleanup();
  clearChat();
});

beforeEach(() => {
  clearChat();
});

/** Let the painting loop have one frame. */
const painted = (): Promise<void> =>
  new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));

describe('words over a head', () => {
  it('places one said after the layer was mounted', async () => {
    const { container } = render(<ChatBubbles />);

    // Mounted with nobody talking, which is how the HUD mounts it.
    expect(container.querySelector('[data-said]')).toBeNull();

    noteChat({ channel: 'say', sender: 'Someone', text: 'Well met.' }, 7);
    const one = chatSaid.value[0]!;
    one.x = 120;
    one.y = 80;
    one.onScreen = true;
    await painted();

    const node = container.querySelector<HTMLElement>('[data-said]');
    expect(node).not.toBeNull();
    expect(node?.style.visibility).toBe('visible');
    expect(node?.style.transform).toContain('120');
    expect(node?.style.transform).toContain('80');
  });

  it('keeps one out of sight while it is behind the camera', async () => {
    const { container } = render(<ChatBubbles />);

    noteChat({ channel: 'say', sender: 'Someone', text: 'Behind you.' }, 7);
    const one = chatSaid.value[0]!;
    one.onScreen = false;
    await painted();

    expect(container.querySelector<HTMLElement>('[data-said]')?.style.visibility).toBe('hidden');
  });
});
