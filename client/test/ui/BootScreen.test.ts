/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BootScreen } from '../../src/ui/Hud';
import { BUTTON_VARIANT } from '../../src/ui/components/Button';

/**
 * The boot screen is the first thing anyone sees, and the only screen built
 * with `createElement` rather than rendered — so it is the easiest place for
 * the chrome to drift away from the rest of the client. What is pinned here
 * is that it wears the design system's own button, and that its states
 * (message, progress, choice) are actually mutually exclusive.
 */

let root: HTMLElement;
let boot: BootScreen;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'boot';
  document.body.append(root);
  boot = new BootScreen(root);
});

afterEach(() => {
  root.remove();
});

function bar(): HTMLElement {
  return root.querySelector<HTMLElement>('div[class*="rounded-chrome"]')!;
}

function fill(): HTMLElement {
  return bar().firstElementChild as HTMLElement;
}

describe('BootScreen', () => {
  it('covers the viewport above the game and below signing in', () => {
    expect(root.className).toContain('z-boot');
    expect(root.className).toContain('fixed');
    expect(root.className).toContain('inset-0');
  });

  it('shows a message with no bar and no choices', () => {
    boot.show('Reading the pack...');

    expect(root.textContent).toContain('Reading the pack...');
    expect(bar().style.display).toBe('none');
    expect(root.querySelectorAll('button')).toHaveLength(0);
  });

  it('fills the bar to the fraction it is given', () => {
    boot.progress('Extracting', 0.42);

    expect(bar().style.display).toBe('block');
    expect(fill().style.width).toBe('42%');
    expect(fill().className).not.toContain('animate-boot-slide');
  });

  it('clamps a fraction that arrives out of range', () => {
    // These come from byte counts against a total the pack reported, and a
    // total that is wrong by a byte must not push the fill past the track.
    boot.progress('Extracting', 1.4);
    expect(fill().style.width).toBe('100%');

    boot.progress('Extracting', -0.2);
    expect(fill().style.width).toBe('0%');
  });

  it('shows movement without a completion point when there is nothing to count', () => {
    boot.progress('Waiting for the server', null);

    expect(fill().className).toContain('animate-boot-slide');
    expect(fill().style.width).toBe('30%');
  });

  it('stops claiming movement once a real fraction arrives', () => {
    boot.progress('Waiting', null);
    boot.progress('Extracting', 0.5);

    expect(fill().className).not.toContain('animate-boot-slide');
  });

  it('names the percentage in the message for a byte count', () => {
    boot.progressBytes('Extracting', 327, 654);

    expect(root.textContent).toContain('Extracting 50%');
  });

  it('offers choices as the design system’s own buttons, and resolves the pick', async () => {
    const chosen = boot.choose('Where from?', [
      { id: 'local', label: 'A file on this device' },
      { id: 'remote', label: 'The server' },
    ]);

    const buttons = [...root.querySelectorAll('button')];
    expect(buttons.map(b => b.textContent)).toEqual(['A file on this device', 'The server']);
    // The same string the `Button` component's secondary variant uses, rather
    // than a lookalike kept in step by eye.
    expect(buttons[0]!.className).toContain(BUTTON_VARIANT.secondary.split(' ')[0]);
    expect(buttons[0]!.type).toBe('button');

    buttons[1]!.click();
    await expect(chosen).resolves.toBe('remote');
  });

  it('replaces the previous state rather than stacking on it', () => {
    void boot.choose('Where from?', [{ id: 'local', label: 'A file' }]);
    boot.show('Loading');

    expect(root.querySelectorAll('button')).toHaveLength(0);
    expect(root.textContent).toContain('Loading');
  });

  it('offers a way past the file picker only when carrying on is a real choice', () => {
    void boot.pickFile('Choose your copy', async () => [], {});
    expect(root.querySelectorAll('button')).toHaveLength(1);

    boot.show('reset');
    void boot.pickFile('Choose your copy', async () => [], { skipLabel: 'Use what is cached' });
    expect([...root.querySelectorAll('button')].map(b => b.textContent)).toEqual([
      'Choose game file(s)...',
      'Use what is cached',
    ]);
  });

  it('paints splash art behind a scrim, so the text stays readable over it', () => {
    boot.setSplashUrl('blob:zone-art');

    const background = root.style.backgroundImage;
    expect(background).toContain('blob:zone-art');
    expect(background).toContain('linear-gradient');
  });

  it('ignores splash art from a teleport that has already been overtaken', () => {
    const stale = boot.nextSplash();
    boot.nextSplash();
    boot.setSplashUrl('blob:old-zone', stale);

    expect(root.style.backgroundImage).toBe('');
  });

  it('takes the splash off again', () => {
    boot.setSplashUrl('blob:zone-art');
    boot.clearSplash();

    expect(root.style.backgroundImage).toBe('');
  });

  it('hides itself when the game is ready', () => {
    boot.show('Loading');
    boot.hide();

    expect(root.style.display).toBe('none');
  });
});

describe('BootScreen supported versions', () => {
  it('offers a link that opens the version notes and closes again', async () => {
    void boot.pickFile('Choose', async () => [], { versions: true });
    const link = root.querySelector<HTMLElement>('[data-boot-versions="link"]')!;
    expect(link.textContent).toBe('Supported versions');

    link.click();
    const dialog = root.querySelector<HTMLElement>('[data-boot-versions="dialog"]')!;
    expect(dialog.textContent).toContain('2.2.0');
    expect(dialog.textContent).toContain('1.1.4');

    dialog.querySelector('button')!.click();
    expect(root.querySelector('[data-boot-versions="dialog"]')).toBeNull();
  });

  it('shows no link unless asked', () => {
    void boot.pickFile('Choose', async () => []);
    expect(root.querySelector('[data-boot-versions="link"]')).toBeNull();
  });
});
