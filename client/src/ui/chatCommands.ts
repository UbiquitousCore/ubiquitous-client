/** Lines typed into chat that ask the game for something instead of being said. */

export type ChatCommand =
  | { kind: 'who' }
  | { kind: 'invite'; name: string }
  | { kind: 'friend'; name: string }
  | { kind: 'stress'; count: number }
  | { kind: 'help' };

interface ChatCommandDef {
  /** The word after the slash, and its short forms. */
  words: readonly [string, ...string[]];
  /** One line for `/help`: the shape and what it does. */
  usage: string;
  parse(rest: string): ChatCommand | null;
}

/**
 * Every slash command with its usage: `/help` is built from this table.
 */
const COMMANDS: readonly ChatCommandDef[] = [
  {
    words: ['who'],
    usage: '/who — list players online',
    parse: () => ({ kind: 'who' }),
  },
  {
    words: ['invite', 'inv'],
    usage: '/invite <name> — invite a player to your party',
    parse: rest => (rest ? { kind: 'invite', name: rest } : null),
  },
  {
    words: ['friend', 'addfriend'],
    usage: '/friend <name> — add a player as a friend',
    parse: rest => (rest ? { kind: 'friend', name: rest } : null),
  },
  {
    // Own choice: `/stress 100` spawns the pack around the nearest training dummy in sight.
    words: ['stress'],
    usage: '/stress <count> — spawn a stress-test crowd at the nearest dummy (1–200)',
    parse: rest => {
      const count = Math.floor(Number(rest.split(/\s+/)[0]));
      return Number.isFinite(count) && count > 0 ? { kind: 'stress', count } : null;
    },
  },
  {
    words: ['help'],
    usage: '/help — list these commands',
    parse: () => ({ kind: 'help' }),
  },
];

/** The command a line asks for, or null for a line to be said as typed. */
export function readChatCommand(text: string): ChatCommand | null {
  const match = /^\/(\S+)\s*(.*)$/.exec(text.trim());
  if (!match) return null;
  const word = match[1]!.toLowerCase();
  const rest = match[2]!.trim();
  return COMMANDS.find(def => def.words.includes(word))?.parse(rest) ?? null;
}

/**
 * `Here are the commands you can use`, then each command and its usage.
 * The bot lines mirror the server's `BotCommand` table.
 */
export function chatCommandHelp(): string[] {
  return [
    'Here are the commands you can use:',
    ...COMMANDS.map(def => def.usage),
    'Said to a bot in party chat or a whisper, as the group leader:',
    'follow (follow the leader), stay (stand still), free (play on your own again), ' +
      "attack (attack the leader's target), leave (leave the group), " +
      'report (say level, health and quest count), help (list these commands)',
  ];
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
