import { describe, expect, it, vi } from 'vitest';

import { friendActions } from '../src/ui/components/ArtSocialWindow';
import { chatWhisperTarget, networkIdOfWhisperTarget } from '../src/ui/chatStore';
import { setPartyActions } from '../src/ui/partyStore';
import { setSocialListActions } from '../src/ui/socialListStore';

const WORDS = { words: { whisper: 'Whisper', teamInvite: 'Invite', remove: 'Remove' } };

describe('a friend row', () => {
  it('offers a word, an invitation and removal while the friend is in the world', () => {
    const invite = vi.fn();
    setPartyActions({
      inviteTarget: () => {},
      invite,
      inviteNamed: () => {},
      kickTarget: () => {},
      accept: () => {},
      decline: () => {},
      leave: () => {},
      kick: () => {},
      voteKick: () => {},
      answerVoteKick: () => {},
    });
    const done = vi.fn();

    const actions = friendActions({ id: 42, name: 'Kael', away: false }, WORDS, done);

    expect(actions.map(action => action.label)).toEqual(['Whisper', 'Invite', 'Remove']);
    actions[0]!.onPick();
    expect(networkIdOfWhisperTarget(chatWhisperTarget.value!.id)).toBe(42);
    expect(chatWhisperTarget.value!.name).toBe('Kael');
    actions[1]!.onPick();
    expect(invite).toHaveBeenCalledWith(42);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('offers only removal while the friend is away', () => {
    const removeFriend = vi.fn();
    setSocialListActions({
      addFriend: () => {},
      addFriendNamed: () => {},
      removeFriend,
      addIgnore: () => {},
      removeIgnore: () => {},
      refresh: () => {},
    });

    const actions = friendActions({ id: 9, name: 'Mira', away: true }, WORDS, () => {});

    expect(actions.map(action => action.label)).toEqual(['Remove']);
    actions[0]!.onPick();
    expect(removeFriend).toHaveBeenCalledWith(9);
  });
});

describe('a whisper target', () => {
  it('tells a network id from a body in sight', () => {
    expect(networkIdOfWhisperTarget('17')).toBeUndefined();
  });
});
