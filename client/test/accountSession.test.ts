import { describe, expect, it, vi } from 'vitest';
import { AccountSession } from '../src/app/features/frontEnd/AccountSession';
import type { CharacterSummary, NewCharacter } from '../src/net/GameConnection';

const hero = (name: string): CharacterSummary => ({ name, guid: `g-${name}` }) as CharacterSummary;

function setup(patienceMs = 1000) {
  const sent: string[] = [];
  const noFresh = vi.fn();
  const session = new AccountSession(
    {
      login: (user: string) => void sent.push(`login ${user}`),
      logout: () => void sent.push('logout'),
      listCharacters: () => void sent.push('list'),
      createCharacter: (c: NewCharacter) => void sent.push(`create ${c.name}`),
      deleteCharacter: (n: string) => void sent.push(`delete ${n}`),
      chooseCharacter: (n: string) => void sent.push(`choose ${n}`),
      returnToCharacterList: () => void sent.push('return'),
    },
    patienceMs,
    noFresh,
  );
  return { session, sent, noFresh };
}

describe('AccountSession', () => {
  it('turns a login into its answer', async () => {
    const { session, sent } = setup();
    const answer = session.signIn('ann', 'hash');
    session.loginAnswered(false, 7, undefined);
    expect(sent).toEqual(['login ann']);
    await expect(answer).resolves.toEqual({ ok: false, code: 7, reason: null });
  });

  it('fetches the list and keeps the races the server opened with', async () => {
    const { session } = setup();
    const fetched = session.fetchCharacters();
    session.listed([hero('Ann')], [1, 2]);
    await expect(fetched).resolves.toEqual([hero('Ann')]);
    expect(session.offeredRaces).toEqual([1, 2]);
  });

  it('rejects a wait for the list when the socket goes', async () => {
    const { session } = setup();
    const fetched = session.fetchCharacters();
    session.disconnected('gone');
    await expect(fetched).rejects.toThrow('disconnected: gone');
  });

  it('has made a character only once the fresh list is in', async () => {
    const { session } = setup();
    const made = session.create({ name: 'Bo' } as NewCharacter);
    session.createAnswered(true, 0, undefined);
    // The list lands in the same breath as the answer.
    session.listed([hero('Ann'), hero('Bo')], null);
    await expect(made).resolves.toEqual({ ok: true, reason: null });
    expect(session.characters.map(one => one.name)).toEqual(['Ann', 'Bo']);
  });

  it('gives the reason, or the code, for a refused creation, without waiting for a list', async () => {
    const { session } = setup();
    const refused = session.create({ name: 'Bo' } as NewCharacter);
    session.createAnswered(false, 9, 'Name taken.');
    await expect(refused).resolves.toEqual({ ok: false, reason: 'Name taken.' });

    const bare = session.create({ name: 'Cy' } as NewCharacter);
    session.createAnswered(false, 9, undefined);
    await expect(bare).resolves.toEqual({ ok: false, reason: 'code 9' });
  });

  it('hands a protocol refusal to whoever is making or deleting a character', async () => {
    const { session } = setup();
    const made = session.create({ name: 'Bo' } as NewCharacter);
    session.refuse('Nope.');
    await expect(made).resolves.toEqual({ ok: false, reason: 'Nope.' });
  });

  it('knows the account is a GM only while a GM is signed in', async () => {
    const { session } = setup();
    const answer = session.signIn('ann', 'hash');
    session.loginAnswered(true, 2, undefined, true);
    await answer;
    expect(session.isAdmin).toBe(true);

    const out = session.signOut();
    session.loggedOut();
    await out;
    expect(session.isAdmin).toBe(false);
  });

  it('is not a GM after a refused sign-in, whatever was claimed', async () => {
    const { session } = setup();
    const answer = session.signIn('ann', 'hash');
    session.loginAnswered(false, 1, 'no', true);
    await answer;
    expect(session.isAdmin).toBe(false);
  });

  it('signs out on the same connection, forgetting the characters', async () => {
    const { session, sent } = setup();
    session.listed([hero('Ann')], [1]);

    const out = session.signOut();
    session.loggedOut();
    await out;

    expect(sent).toEqual(['logout']);
    expect(session.characters).toEqual([]);
    expect(session.offeredRaces).toBeNull();
  });

  it('fails a sign-out when the connection goes', async () => {
    const { session } = setup();
    const out = session.signOut();
    session.disconnected('gone');
    await expect(out).rejects.toThrow('disconnected: gone');
  });

  it('lets a second sign-in follow a refused one', async () => {
    const { session, sent } = setup();
    const first = session.signIn('ann', 'wrong');
    session.loginAnswered(false, 1, 'Invalid credentials.');
    await first;
    const second = session.signIn('ann', 'right');
    session.loginAnswered(true, 2, undefined);
    expect(sent).toEqual(['login ann', 'login ann']);
    await expect(second).resolves.toEqual({ ok: true, code: 2, reason: null });
  });

  it('turns a protocol refusal of a sign-in into a refused answer rather than a hang', async () => {
    const { session } = setup();
    const answer = session.signIn('ann', 'hash');
    session.refuse('Too many failed sign-ins on this connection; reload the page.');
    await expect(answer).resolves.toEqual({
      ok: false,
      code: 0,
      reason: 'Too many failed sign-ins on this connection; reload the page.',
    });
  });

  it('carries on with the last list when a fresh one never comes', async () => {
    vi.useFakeTimers();
    const { session, noFresh } = setup(50);
    session.listed([hero('Ann')], null);
    const done = session.remove('Ann');
    session.deleteAnswered(true, 0, undefined);
    await vi.advanceTimersByTimeAsync(60);
    await expect(done).resolves.toEqual({ ok: true, reason: null });
    expect(noFresh).toHaveBeenCalled();
    expect(session.characters).toHaveLength(1);
    vi.useRealTimers();
  });

  it('enters the world when told, and fails if the server refuses the character', async () => {
    const { session, sent } = setup();
    const entering = session.choose('Ann');
    session.worldEntered();
    await expect(entering).resolves.toBeUndefined();
    expect(sent).toEqual(['choose Ann']);

    const refused = session.choose('Bo');
    session.chooseRefused(4, null);
    await expect(refused).rejects.toThrow('the server refused that character (code 4)');
  });

  it('finds a character by name or guid', () => {
    const { session } = setup();
    session.listed([hero('Ann')], null);
    expect(session.find('Ann')?.name).toBe('Ann');
    expect(session.find('g-Ann')?.name).toBe('Ann');
    expect(session.find('Zed')).toBeNull();
  });

  it('goes back to the list when the server has taken the hero out', async () => {
    const { session, sent } = setup();
    const back = session.returnToList();
    session.returnedToList();
    await expect(back).resolves.toBeUndefined();
    expect(sent).toEqual(['return']);
  });
});
