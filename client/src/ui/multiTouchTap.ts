/**
 * Taps on HUD buttons while another finger is down.
 *
 * A browser fires `click` for a lone tap, and drops it when the tap lands
 * during another touch — the thumb on the joystick or the look finger — so
 * "run and jump" and "run and open the spell bar" did nothing. This clicks
 * the button itself when such a tap lifts on the same button it landed on,
 * and swallows the browser's own click if one does arrive after all.
 */

const BUTTON = 'button, [role="button"]';
/** A browser click arriving this soon after ours is the same tap. */
const DUPLICATE_MS = 500;

export function installMultiTouchTap(): () => void {
  const down = new Set<number>();
  const armed = new Map<number, Element>();
  let ours = false;
  let last: { el: Element; at: number } | null = null;

  const buttonAt = (x: number, y: number): Element | null =>
    document.elementFromPoint(x, y)?.closest(BUTTON) ?? null;

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    if (down.size > 0) {
      const button = (e.target as Element | null)?.closest?.(BUTTON);
      if (button) armed.set(e.pointerId, button);
    }
    down.add(e.pointerId);
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    down.delete(e.pointerId);
    const button = armed.get(e.pointerId);
    armed.delete(e.pointerId);
    if (!button || buttonAt(e.clientX, e.clientY) !== button) return;
    if ((button as HTMLButtonElement).disabled) return;
    ours = true;
    try {
      (button as HTMLElement).click();
    } finally {
      ours = false;
    }
    last = { el: button, at: performance.now() };
  };

  const onCancel = (e: PointerEvent): void => {
    down.delete(e.pointerId);
    armed.delete(e.pointerId);
  };

  const onClick = (e: MouseEvent): void => {
    if (ours || !last || performance.now() - last.at > DUPLICATE_MS) return;
    if (!last.el.contains(e.target as Node)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('click', onClick, true);
  return () => {
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('click', onClick, true);
  };
}
