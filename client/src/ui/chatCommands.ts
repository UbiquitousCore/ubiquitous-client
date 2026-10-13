/** Lines typed into chat that ask the game for something instead of being said. */

export type ChatCommand =
  | { kind: 'who' }
  | { kind: 'invite'; name: string }
  | { kind: 'friend'; name: string }
  | { kind: 'stress'; count: number };

/** Own choice: the words, and their short forms, a player would reach for. */
const NAMED: Readonly<Record<string, 'invite' | 'friend'>> = {
  invite: 'invite',
  inv: 'invite',
  friend: 'friend',
  addfriend: 'friend',
};

/** The command a line asks for, or null for a line to be said as typed. */
export function readChatCommand(text: string): ChatCommand | null {
  const match = /^\/(\S+)\s*(.*)$/.exec(text.trim());
  if (!match) return null;
  const word = match[1]!.toLowerCase();
  const rest = match[2]!.trim();
  if (word === 'who') return { kind: 'who' };
  // Own choice: `/stress 100` spawns the pack around the nearest training dummy in sight.
  if (word === 'stress') {
    const count = Math.floor(Number(rest.split(/\s+/)[0]));
    if (!Number.isFinite(count) || count <= 0) return null;
    return { kind: 'stress', count };
  }
  const kind = NAMED[word];
  return kind && rest ? { kind, name: rest } : null;
}

let run: (command: ChatCommand) => void = () => {};

export function setChatCommandSink(sink: (command: ChatCommand) => void): void {
  run = sink;
}

/** Carry out a line if it is a command; false for a line to be said. */
export function runChatCommand(text: string): boolean {
  const command = readChatCommand(text);
  if (!command) return false;
  run(command);
  return true;
}
