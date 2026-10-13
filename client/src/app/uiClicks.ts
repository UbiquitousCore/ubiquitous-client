/** Which click an interface press makes, read from the page: tabs, buttons, or none (canvas, text fields). */

export type UiClick = 'tab' | 'button';

export function clickOf(target: EventTarget | null): UiClick | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('[data-jump]')) return null;
  if (target.closest('[role="tab"], [data-tab]')) return 'tab';
  const button = target.closest('button, [role="button"]');
  if (!button) return null;
  if (button instanceof HTMLButtonElement && button.disabled) return null;
  return 'button';
}
