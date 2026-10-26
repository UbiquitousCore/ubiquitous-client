/** Death dialog: one button (free cemetery revive). Paid revive is not drawn;
 * this project has no rune stones or store. Killer name and penalty come from
 * `player.death` when present; the penalty line draws even for zero. */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { Button } from './components/Button';
import { Dialog } from './components/Dialog';
import { ArtDeathPrompt, DEATH_SCREEN } from './components/ArtDeathPrompt';
import { useWornScreen } from './art/useWorn';
import { deathActions, deathToll, playerDead } from './deathStore';
import { LINES, say } from './gameLines';
import { formatMoney } from './money';
import { fill } from './art/wornWords';

/**
 * How long the client sits on the death animation before the dialog
 * appears.
 */
export const DEATH_PROMPT_DELAY_MS = 2000;

/** The body line: who killed the player when that is known. */
export function deathLine(killerName?: string): string {
  return killerName ? fill(say(LINES.killedBy), killerName) : say(LINES.dead);
}

/** The penalty line, filled from the server's copper figure. */
export function deathCostLine(deathCost: number): string {
  return fill(say(LINES.deathPenalty), formatMoney(deathCost));
}

export function DeathPromptContainer(): JSX.Element | null {
  const dead = playerDead.value;
  const toll = deathToll.value;
  const [raised, setRaised] = useState(false);
  const spec = useWornScreen(DEATH_SCREEN);

  /* Revival dialog status: delay accumulates only while not yet showing dead
   * (never restarted/re-raised; only a revive puts it back). */
  useEffect(() => {
    if (!dead) {
      setRaised(false);
      return;
    }
    if (raised) return;
    const timer = window.setTimeout(() => setRaised(true), DEATH_PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dead, raised]);

  if (!dead || !raised) return null;

  const lines = [deathLine(toll?.killerName)];
  if (toll) lines.push(deathCostLine(toll.deathCost));
  lines.push('You will revive at the nearest cemetery.');
  if (spec)
    return (
      <ArtDeathPrompt
        lines={lines}
        reviveLabel={say(LINES.reviveAtGraveyard)}
        onRevive={() => deathActions().reviveAtCemetery()}
      />
    );

  return (
    <Dialog label={say(LINES.dead)} size="md">
      <h2 className="m-0 text-center font-title text-sm text-parchment-100">
        {deathLine(toll?.killerName)}
      </h2>
      {/* Drawn whatever the figure is, zero included. Absent only until
          the server has said, which is the gap between the body falling and
          `player.death` landing. */}
      {toll && (
        <p className="m-0 pt-2 text-center text-tiny text-ink-400">
          {deathCostLine(toll.deathCost)}
        </p>
      )}
      <p className="m-0 pt-2 text-center text-tiny text-ink-400">
        You will revive at the nearest cemetery.
      </p>
      <div className="flex justify-center pt-4">
        {/* Nothing closes here. Reviving is a request; the dialog goes when
            the server answers `player.revived`, which is what clears the dead
            flag. */}
        <Button size="lg" variant="danger" onClick={() => deathActions().reviveAtCemetery()}>
          {say(LINES.reviveAtGraveyard)}
        </Button>
      </div>
    </Dialog>
  );
}
