import type { PiecePart } from './piecePlan';

/**
 * A part as the full plan has it — every state showing, each control on its
 * first face — placed on the drawn picture's grid. The full plan measures from
 * another origin, so the part is moved by however far a part both share
 * stands apart in the two. For a part the picture leaves out (the waiting
 * letter beside the hero's frame), or one whose face changes its size (a lit
 * button's glow), where what sits on it must not move.
 */
export function onPictureGrid(
  worn: { parts: readonly PiecePart[]; whole: readonly PiecePart[] },
  path: string,
  framed: string | readonly string[] | undefined,
): PiecePart | undefined {
  const target = worn.whole.find(part => part.path === path);
  const inBoth = (name: string): boolean =>
    name !== path &&
    worn.parts.some(part => part.path === name) &&
    worn.whole.some(part => part.path === name);
  // The frame where the screen names one, else any other top-level part both hold.
  const shared =
    [framed ?? []].flat().find(inBoth) ??
    worn.parts.find(part => !part.path.includes('/') && inBoth(part.path))?.path;
  const inPicture = worn.parts.find(part => part.path === shared);
  const inWhole = worn.whole.find(part => part.path === shared);
  if (!target || !inPicture || !inWhole) return undefined;
  const dx = inPicture.box.x - inWhole.box.x;
  const dy = inPicture.box.y - inWhole.box.y;
  return { ...target, box: { ...target.box, x: target.box.x + dx, y: target.box.y + dy } };
}
