/** One dialog drawn exactly as the movie has it, fitted to its space; shows which parts a screen must drive. */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { drawPiece } from './pieceCanvas';
import type { PieceImage } from './pieceCanvas';
import { planPiece } from './piecePlan';
import type { PlanStates } from './piecePlan';
import type { UiSkinArt, UiSkinData } from '../../assets/types';

export interface MovieDialogProps {
  skin: UiSkinData;
  /** The dialog's instance name, as the movie names it. */
  name: string;
  art: ReadonlyMap<string, UiSkinArt>;
  /** Pixels per movie unit. Two keeps it sharp on a retina display. */
  scale?: number;
  /** Which of the dialog's alternate states to draw. */
  states?: PlanStates;
  className?: string;
}

/**
 * Drawing a large dialog costs a canvas the size of the dialog, so it
 * happens once per dialog rather than once per render, and off the render
 * path — a dialog the size of a screen takes long enough to see.
 */
export function MovieDialog({
  skin,
  name,
  art,
  scale = 2,
  states,
  className,
}: MovieDialogProps): JSX.Element {
  const [image, setImage] = useState<PieceImage | null>(null);
  const [drawing, setDrawing] = useState(true);
  // Which draw the state belongs to: an earlier dialog finishing after a
  // later one would otherwise replace it.
  const wanted = useRef(0);

  useEffect(() => {
    const ticket = ++wanted.current;
    setDrawing(true);
    setImage(null);
    const handle = window.setTimeout(() => {
      const plan = planPiece(skin, name, states);
      const drawn = plan ? drawPiece(plan, art, scale) : null;
      if (wanted.current !== ticket) return;
      setImage(drawn);
      setDrawing(false);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [skin, name, art, scale, states]);

  if (drawing) {
    return (
      <div className={className} role="status">
        Drawing {name}…
      </div>
    );
  }
  if (!image) {
    return (
      <div className={className} role="status">
        {name} draws nothing on its own — its contents are filled in at run time.
      </div>
    );
  }
  return (
    <img
      src={image.url}
      alt={`The ${name} dialog, as the interface draws it`}
      width={image.width}
      height={image.height}
      className={className}
      draggable={false}
    />
  );
}
