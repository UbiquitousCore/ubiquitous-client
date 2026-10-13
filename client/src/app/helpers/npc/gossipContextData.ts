import type { CharacterSummary } from '../../../net/GameConnection';
import type { GossipContext } from '../../../ui/npcGossip';

interface PlayableKindsLike {
  races: Array<{ race: number; name: string | null }>;
  classes: Array<unknown>;
}

/** Build the player-context object used by gossip markup evaluation. */
export function buildGossipContextData(args: {
  character: CharacterSummary | null;
  kinds: PlayableKindsLike;
  classWord: (classId: number) => string;
  holdsQuest: (id: number) => boolean;
  hasAura: (id: number) => boolean;
  random: () => number;
}): GossipContext {
  const { character, kinds, classWord, holdsQuest, hasAura, random } = args;
  return {
    holdsQuest,
    hasAura,
    name: character?.name ?? '',
    className: classWord(character?.class ?? 0),
    raceName: kinds.races.find(one => one.race === character?.race)?.name ?? '',
    random,
  };
}
