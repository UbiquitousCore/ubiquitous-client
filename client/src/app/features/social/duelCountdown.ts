/** Own choice: the countdown names the last three seconds, not the whole wait. */
const COUNT_FROM = 3;

/** What to say, and how long after the duel is announced, from the numbers to the start word. */
export function duelCountdown(
  startsInS: number,
  startWord: string,
): Array<{ afterMs: number; text: string }> {
  const steps: Array<{ afterMs: number; text: string }> = [];
  for (let left = Math.min(COUNT_FROM, startsInS); left >= 1; left--) {
    steps.push({ afterMs: (startsInS - left) * 1000, text: String(left) });
  }
  steps.push({ afterMs: startsInS * 1000, text: startWord });
  return steps;
}
