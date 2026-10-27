/**
 * A long press on the interface belongs to the game, not the browser.
 *
 * On a phone the browser answers a held finger with a menu to save, share or
 * search whatever image is under it, and the interface is drawn from images,
 * so holding a button mid-fight covered the screen. Fields you type in keep
 * the menu, for paste; a mouse keeps its right-click menu.
 */

const TYPED_IN = 'input, textarea, [contenteditable=""], [contenteditable="true"]';

export function keepsBrowserMenu(target: EventTarget | null, pointerType: string): boolean {
  if (pointerType !== 'touch') return true;
  return target instanceof Element && target.closest(TYPED_IN) !== null;
}

export function installTouchMenuGuard(): () => void {
  let pointerType = 'mouse';
  const onDown = (e: PointerEvent): void => {
    pointerType = e.pointerType;
  };
  const onMenu = (e: Event): void => {
    if (!keepsBrowserMenu(e.target, pointerType)) e.preventDefault();
  };
  document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  document.addEventListener('contextmenu', onMenu, { capture: true });
  return () => {
    document.removeEventListener('pointerdown', onDown, { capture: true });
    document.removeEventListener('contextmenu', onMenu, { capture: true });
  };
}
