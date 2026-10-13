import { describe, expect, it } from 'vitest';
import { BUTTON_VARIANT } from '../../src/ui/components/Button';
import { colour, colours, themeSource } from '../helpers/themeTokens';

/**
 * The contrast ratios components rely on, asserted against the token file,
 * so re-tinting a token fails the build. Every pair is one `src/ui/` really
 * renders; a pair no longer rendered comes out, and its tokens with it.
 */

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function ratio(foreground: string, background: string): number {
  return contrast(colour(foreground), colour(background));
}

/** Text drawn straight onto the rendered world sits on its own drop shadow. */
const SHADOW = '#000000';

describe('theme tokens', () => {
  it('defines every token a component names', () => {
    // A missing token renders as an unstyled element rather than an error, so
    // the set is pinned here.
    for (const required of [
      'chrome-950',
      'chrome-900',
      'chrome-800',
      'brass-300',
      'brass-400',
      'brass-500',
      'brass-600',
      'parchment-50',
      'parchment-100',
      'parchment-200',
      'parchment-300',
      'parchment-500',
      'parchment-700',
      'ink-900',
      'ink-700',
      'ink-400',
      'ink-success',
      'ink-danger',
      'steel-400',
      'selected-lit',
      'selected-shade',
      'title',
      'row-ready',
      'row-active',
      'row-blocked',
      'channel-exp',
      'map-ground',
      'map-travel',
      'place-friendly',
      'place-hostile',
      'status-info',
      'status-success',
      'status-warning',
      'status-error',
      'ask-pick',
      'quality-poor',
      'quality-common',
      'quality-fine',
      'quality-rare',
      'quality-epic',
      'quality-artifact',
      'chat-general',
      'chat-party',
      'chat-whisper',
      'notice',
      'quest-trivial',
      'quest-easy',
      'quest-hard',
      'alert',
      'asked-name',
    ]) {
      expect(colours.get(required), `missing --color-${required}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps the palette small enough to hold in your head', () => {
    // A working limit: past it people reach for the token they remember,
    // and near-duplicates breed. Two materials (chrome and parchment) each
    // need their own surfaces and ink. Raise it only for a colour nothing
    // else expresses (item qualities, chat channels), never a near-copy.
    expect(colours.size).toBeLessThanOrEqual(57);
  });

  /**
   * Body text: WCAG 2.2 AA wants 4.5:1. The button faces are gradients, so
   * each is asserted against every stop its label can end up over.
   */
  describe.each([
    ['parchment-100', 'chrome-950', 'bright label on the page'],
    ['parchment-200', 'chrome-950', 'body text on the page'],
    ['ink-400', 'chrome-950', 'muted aside on the page'],
    ['parchment-200', 'chrome-900', 'body text on a raised face'],
    ['parchment-100', 'chrome-800', 'an unpicked tab'],
    ['parchment-100', 'chrome-950', 'the money along a screen’s footer'],
    ['brass-300', 'chrome-950', 'panel title'],
    ['chrome-950', 'brass-300', 'primary button label, upper stop'],
    ['chrome-950', 'brass-400', 'primary button label, lower stop'],
    ['chrome-950', 'brass-500', 'primary button label, hovered'],
    ['status-info', 'chrome-950', 'info note'],
    ['status-success', 'chrome-950', 'success note'],
    ['status-warning', 'chrome-950', 'warning note'],
    ['status-error', 'chrome-950', 'error note'],
    ['quality-poor', 'chrome-950', 'a worthless item’s name'],
    ['quality-common', 'chrome-950', 'an ordinary item’s name'],
    ['quality-fine', 'chrome-950', 'a fine item’s name'],
    ['quality-rare', 'chrome-950', 'a rare item’s name'],
    ['quality-epic', 'chrome-950', 'an epic item’s name'],
    ['quality-artifact', 'chrome-950', 'an artifact’s name'],
    ['quality-common', 'chrome-950', 'a line said aloud'],
    ['chat-general', 'chrome-950', 'a line on the general channel'],
    ['brass-300', 'chrome-950', 'a line on the trade channel'],
    ['chat-party', 'chrome-950', 'a line to the party'],
    ['chat-whisper', 'chrome-950', 'a whisper, and who it is to'],
    ['notice', 'chrome-950', 'a notice in the log'],

    // The character screens: ink on paper, and labels on the faces a list row
    // wears. A colour tuned for chrome washes out on parchment and the other
    // way round, which is why both halves of the palette exist.
    ['ink-900', 'parchment-50', 'body text on a screen'],
    ['ink-900', 'parchment-300', 'body text on a table row'],
    ['ink-900', 'parchment-500', 'a plaque label, upper stop'],
    ['ink-700', 'parchment-50', 'a muted aside on a screen'],
    ['ink-700', 'parchment-300', 'a muted aside on a table row'],
    ['ink-success', 'parchment-300', 'someone online in a roster'],
    ['ink-success', 'parchment-50', 'an objective you have finished'],
    ['ink-danger', 'parchment-300', 'a negative note on parchment'],
    ['ink-danger', 'parchment-50', 'why a piece of loot cannot be taken'],
    ['title', 'parchment-50', 'a screen’s own title, and the picked letter'],
    ['title', 'parchment-300', 'a column header'],
    ['row-ready', 'steel-400', 'a quest waiting to be handed in'],
    ['row-active', 'steel-400', 'a quest under way'],
    ['row-blocked', 'steel-400', 'a quest out of reach'],
    // The five difficulty tints are read on a `ListRow`, which is
    // `surface-btn-dark` — `steel-400`, not the `chrome-950` page. The whole
    // ladder is therefore held against the row, not against the page.
    ['quest-trivial', 'steel-400', 'a quest far below your level'],
    ['quest-easy', 'steel-400', 'a quest below your level'],
    ['notice', 'steel-400', 'a quest at your level'],
    ['quest-hard', 'steel-400', 'a quest above your level'],
    ['row-blocked', 'steel-400', 'a quest far above your level'],
    ['ink-400', 'steel-400', 'a muted aside on a roster row, upper stop'],
    ['parchment-100', 'steel-400', 'a party member’s name'],
    ['parchment-100', 'mailbox-lit', 'a mailbox message, upper stop'],
    ['parchment-100', 'mailbox-shade', 'a mailbox message, lower stop'],
    ['parchment-50', 'selected-lit', 'the open screen’s button, upper stop'],
    ['parchment-50', 'selected-shade', 'the open screen’s button, lower stop'],
    ['parchment-100', 'chrome-950', 'a spell’s name over the empty bar'],
    ['ask-pick', 'chrome-950', 'the place and the sum picked out of a question'],
  ])('%s on %s (%s)', (fg, bg, _what) => {
    it('meets the 4.5:1 floor for body text', () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * Words on printed map art are drawn on art whose lightness is not ours to
   * know, so they are held against the shadow they carry. That shadow is the
   * mechanism: `text-shadow-world` is not decoration.
   */
  describe.each([['map-travel', 'a destination you can travel to']])(
    '%s over map art (%s)',
    (fg, _what) => {
      it('meets the 4.5:1 floor against its own drop shadow', () => {
        expect(contrast(colour(fg), SHADOW)).toBeGreaterThanOrEqual(4.5);
      });
    },
  );

  it('writes the banner over the world legibly against its own drop shadow', () => {
    expect(contrast(colour('alert'), SHADOW)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * Non-text UI — borders, gauge fills, map markers — needs 3:1 against what
   * sits behind it.
   */
  describe.each([
    ['brass-600', 'chrome-950', 'component border on the page'],
    ['brass-600', 'chrome-900', 'slot border on its own face'],
    // A unit frame's gauges sit in channels cut into the art, whose recess is
    // near-black — so each is held against that rather than against the metal.
    ['channel-exp', 'chrome-950', 'experience in its channel'],
    // The fill is too near the track to show its length alone; the bright
    // edge it carries does that.
    ['brass-300', 'chrome-950', 'where a cast has reached, against the empty bar'],
    ['brass-600', 'parchment-50', 'a screen’s own frame'],
    ['brass-600', 'parchment-300', 'a rule between table rows'],
    ['parchment-700', 'parchment-50', 'a plaque’s edge against the paper'],
  ])('%s on %s (%s)', (fg, bg, _what) => {
    it('meets the 3:1 floor for non-text UI', () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * The buttons, read out of `BUTTON_VARIANT` itself rather than copied here.
   *
   * A copy drifts: pairs naming a face the variant no longer wears keep
   * passing while the pair on screen fails its floor.
   * Deriving the pair from the variant string means a retint, a new variant or
   * a swapped face is checked on the next run, with nothing to remember.
   */
  describe('the button variants', () => {
    /** The tint under each material, read out of the utility that applies it. */
    const materials = new Map(
      [
        ...themeSource.matchAll(
          /@utility (surface-[a-z-]+) \{[^}]*?background-color:\s*var\(--color-([a-z0-9-]+)\)/g,
        ),
      ].map(([, name, token]) => [name, token]),
    );

    /**
     * What a label ends up over: the variant's own material, else the flat
     * colour it paints, else — for `ghost`, which paints nothing — the chrome
     * every window and dialog in the client puts behind it.
     */
    function face(classes: string): string {
      const material = classes.match(/(?:^|\s)(surface-[a-z-]+)/)?.[1];
      if (material) {
        const tint = materials.get(material);
        expect(tint, `theme.css has no background-color for ${material}`).toBeTruthy();
        return tint!;
      }
      return classes.match(/(?:^|\s)bg-([a-z0-9-]+)(?:\s|$)/)?.[1] ?? 'chrome-950';
    }

    /** The resting label colour, ignoring any `hover:`-prefixed one. */
    function label(classes: string): string {
      const found = classes.match(/(?:^|\s)text-([a-z0-9-]+)(?:\s|$)/)?.[1];
      expect(found, `no resting text colour in "${classes}"`).toBeTruthy();
      return found!;
    }

    it.each(Object.entries(BUTTON_VARIANT))('reads at 4.5:1 or better: %s', (_variant, classes) => {
      expect(ratio(label(classes), face(classes))).toBeGreaterThanOrEqual(4.5);
    });

    it('checks a face it can actually resolve, rather than passing vacuously', () => {
      // `face` falls back to `chrome-950` for a variant with no material. If a
      // typo made that the answer for every variant the suite above would
      // still pass, so the fallback is pinned to the one variant that means it.
      const faces = Object.fromEntries(
        Object.entries(BUTTON_VARIANT).map(([name, classes]) => [name, face(classes)]),
      );
      expect(faces).toMatchObject({
        primary: 'parchment-500',
        secondary: 'steel-400',
        danger: 'steel-400',
        ghost: 'chrome-950',
      });
    });
  });

  it('keeps the six item qualities distinguishable from one another', () => {
    // A rank read at a glance: two ranks sharing a hue would make the whole
    // scale useless, and one of them is always the one you were looking for.
    const ranks = [
      'quality-poor',
      'quality-common',
      'quality-fine',
      'quality-rare',
      'quality-epic',
      'quality-artifact',
    ].map(colour);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('holds no two tokens at the same value', () => {
    // Two names for one colour make a choice look meaningful when it is not:
    // a caller picks between them and nothing changes on screen.
    const byValue = new Map<string, string[]>();
    for (const [name, hex] of colours) byValue.set(hex, [...(byValue.get(hex) ?? []), name]);
    const shared = [...byValue].filter(([, names]) => names.length > 1);
    expect(shared).toEqual([]);
  });

  it('writes every colour as a token, never inline in a shadow recipe', () => {
    // Shadows and bevels are where a raw hex hides best: nobody reads the
    // fourth line of a box-shadow. Greys and transparent blacks are allowed
    // there — a shadow is black — but a hue has to come from a token.
    const shadows = themeSource.match(/--(?:shadow|text-shadow)-[a-z-]+:[^;]+;/g) ?? [];
    for (const shadow of shadows) {
      for (const hex of shadow.match(/#[0-9a-fA-F]{3,8}/g) ?? []) {
        throw new Error(`${hex} is written into a shadow recipe; name a token instead`);
      }
    }
    expect(shadows.length).toBeGreaterThan(0);
  });
});
