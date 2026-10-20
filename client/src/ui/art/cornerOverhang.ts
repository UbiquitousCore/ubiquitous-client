import type { PieceBox } from './piecePlan';

/**
 * How far past the screen's edges the movie stands a corner piece, in movie
 * units: the HUD hangs its hero frame and minimap a little off-screen, so the
 * screen's edge cuts their outer rims. Drawn flush instead, each showed its
 * whole rim and read as standing off the edge. Never pulls a piece inwards.
 */
export function cornerOverhang(
  onStage: PieceBox | null,
  stage: { w: number; h: number } | null,
  corner: 'left' | 'right',
): { x: number; y: number } {
  if (!onStage || !stage) return { x: 0, y: 0 };
  const y = Math.min(0, onStage.y);
  const x =
    corner === 'left' ? Math.min(0, onStage.x) : Math.max(0, onStage.x + onStage.w - stage.w);
  return { x, y };
}
