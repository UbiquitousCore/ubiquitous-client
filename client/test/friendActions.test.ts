import { describe, expect, it, vi } from 'vitest';

import { friendActions, ignoredActions } from '../src/ui/components/ArtSocialWindow';
import { chatWhisperTarget, networkIdOfWhisperTarget } from '../src/ui/chatStore';
import { setPartyActions } from '../src/ui/partyStore';
import { reportTarget } from '../src/ui/reportStore';
import { setSocialListActions } from '../src/ui/socialListStore';

const WORDS = {
  words: {
    whisper: 'Whisper',
    teamInvite: 'Invite',
    ignore: 'Ignore',
    delete: 'Delete',
    befriend: 'Add as friend',
    relieve: 'Relieve',
    report: 'Report to GM',
  },
};

function lists() {
  const actions = {
    addFriend: vi.fn(),
    addFriendNamed: vi.fn(),
    removeFriend: vi.fn(),
    addIgnore: vi.fn(),
    addIgnoreNamed: vi.fn(),
    removeIgnore: vi.fn(),
    refresh: vi.fn(),
  };
  setSocialListActions(actions);
  return actions;
}

/** Answers every question yes, and keeps what was asked. */
function sayingYes() {
  const asked: { screen: string; name: string }[] = [];
  return {
    asked,
    askFirst: (screen: string, name: string, then: () => void) => {
      asked.push({ screen, name });
      then();
    },
  };
}

describe('a friend row', () => {
  it('offers a word, an invitation, ignoring and deletion while the friend is in the world', () => {
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

    const actions = friendActions({ id: 42, name: 'Kael', away: false }, WORDS, done, () => {});

    expect(actions.map(action => action.label)).toEqual(['Whisper', 'Invite', 'Ignore', 'Delete']);
    actions[0]!.onPick();
    expect(networkIdOfWhisperTarget(chatWhisperTarget.value!.id)).toBe(42);
    expect(chatWhisperTarget.value!.name).toBe('Kael');
    actions[1]!.onPick();
    expect(invite).toHaveBeenCalledWith(42);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('offers ignoring and deletion while the friend is away', () => {
    lists();
    const actions = friendActions(
      { id: 9, name: 'Mira', away: true },
      WORDS,
      () => {},
      () => {},
    );
    expect(actions.map(action => action.label)).toEqual(['Ignore', 'Delete']);
  });

  it('ignores the friend by the id their row carries', () => {
    const social = lists();
    friendActions(
      { id: 9, name: 'Mira', away: true },
      WORDS,
      () => {},
      () => {},
    )[0]!.onPick();
    expect(networkIdOfWhisperTarget(social.addIgnore.mock.calls[0]![0])).toBe(9);
  });

  it('deletes the friend only once the question is answered yes', () => {
    const social = lists();
    const unanswered = friendActions(
      { id: 9, name: 'Mira', away: true },
      WORDS,
      () => {},
      () => {},
    );
    unanswered[1]!.onPick();
    expect(social.removeFriend).not.toHaveBeenCalled();

    const yes = sayingYes();
    friendActions({ id: 9, name: 'Mira', away: true }, WORDS, () => {}, yes.askFirst)[1]!.onPick();
    expect(yes.asked).toEqual([{ screen: 'friendDeleteAsk', name: 'Mira' }]);
    expect(social.removeFriend).toHaveBeenCalledWith(9);
  });
});

describe('an ignored row', () => {
  it('offers friendship, relief and a report to a GM', () => {
    lists();
    const actions = ignoredActions(
      { id: 5, name: 'Pest' },
      WORDS,
      () => {},
      () => {},
    );
    expect(actions.map(action => action.label)).toEqual([
      'Add as friend',
      'Relieve',
      'Report to GM',
    ]);
  });

  it('befriends them off the ignored list only once the question is answered yes', () => {
    const social = lists();
    ignoredActions(
      { id: 5, name: 'Pest' },
      WORDS,
      () => {},
      () => {},
    )[0]!.onPick();
    expect(social.addFriendNamed).not.toHaveBeenCalled();

    const yes = sayingYes();
    ignoredActions({ id: 5, name: 'Pest' }, WORDS, () => {}, yes.askFirst)[0]!.onPick();
    expect(yes.asked).toEqual([{ screen: 'ignoredBefriendAsk', name: 'Pest' }]);
    expect(social.removeIgnore).toHaveBeenCalledWith(5);
    expect(social.addFriendNamed).toHaveBeenCalledWith('Pest');
  });

  it('relieves them at once', () => {
    const social = lists();
    ignoredActions(
      { id: 5, name: 'Pest' },
      WORDS,
      () => {},
      () => {},
    )[1]!.onPick();
    expect(social.removeIgnore).toHaveBeenCalledWith(5);
  });

  it('opens a report to a GM addressed to them', () => {
    lists();
    ignoredActions(
      { id: 5, name: 'Pest' },
      WORDS,
      () => {},
      () => {},
    )[2]!.onPick();
    expect(reportTarget.value?.name).toBe('Pest');
    expect(networkIdOfWhisperTarget(reportTarget.value!.id)).toBe(5);
  });
});

describe('a whisper target', () => {
  it('tells a network id from a body in sight', () => {
    expect(networkIdOfWhisperTarget('17')).toBeUndefined();
  });
});
