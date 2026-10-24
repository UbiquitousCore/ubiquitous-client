// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontEnd, type FrontEndHost } from '../src/app/features/frontEnd/FrontEnd';
import type { AccountSession } from '../src/app/features/frontEnd/AccountSession';
import type { GroundStage } from '../src/app/features/frontEnd/GroundStage';
import type { CharacterSummary } from '../src/net/GameConnection';
import {
  busy,
  characters,
  frontEndActions,
  justMade,
  kinds,
  notice,
  setCharacters,
  setFrontEndActions,
  setJustMade,
  setKinds,
  stage,
  setStage,
  working,
  type DraftCharacter,
  dialog,
  showDialog,
} from '../src/ui/frontend/frontEndStore';
import { player, setPlayer } from '../src/ui/hudStore';

const character = (name: string, over: Partial<CharacterSummary> = {}): CharacterSummary =>
  ({ guid: `g-${name}`, name, level: 4, race: 1, class: 1, ...over }) as CharacterSummary;

const draft = { name: '  Ayla ', race: 1, playerClass: 2, gender: 0 } as unknown as DraftCharacter;

function setup(over: { login?: { ok: boolean; code: number; reason: string | null } } = {}) {
  const roster = [character('Ayla')];
  const account = {
    characters: roster,
    offeredRaces: null as number[] | null,
    signIn: vi.fn(async () => over.login ?? { ok: true, code: 0, reason: null }),
    fetchCharacters: vi.fn(async () => roster),
    create: vi.fn(
      async () => ({ ok: true, reason: null }) as { ok: boolean; reason: string | null },
    ),
    remove: vi.fn(
      async () => ({ ok: true, reason: null }) as { ok: boolean; reason: string | null },
    ),
    find: vi.fn((name: string) => roster.find(one => one.name === name) ?? null),
    choose: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
  const ground = {
    celebrate: vi.fn(),
    show: vi.fn(async () => undefined),
    portrait: vi.fn(async () => undefined),
    canvas: vi.fn(),
    turnBy: vi.fn(),
    releaseTurn: vi.fn(),
    watch: vi.fn(),
    dispose: vi.fn(),
  };
  const connection = { askOutfit: vi.fn(), disconnect: vi.fn() };
  const boot = { show: vi.fn(), hide: vi.fn() };
  const host = {
    signingIn: vi.fn(),
    refused: vi.fn(),
    restart: vi.fn(),
    chose: vi.fn(),
    kinds: vi.fn(async () => ({
      races: [{ race: 1 }, { race: 2 }],
      classes: [],
    })) as unknown as FrontEndHost['kinds'],
  };
  const front = new FrontEnd(
    account as unknown as AccountSession,
    ground as unknown as GroundStage,
    connection,
    boot,
    host,
  );
  front.installActions();
  return { front, account, ground, connection, boot, host, run: frontEndActions() };
}

const roots = () => document.querySelectorAll('[data-screen="front-end-root"]');

beforeEach(() => {
  setStage('signIn');
  setCharacters([]);
  setKinds({ races: [], classes: [] });
  setJustMade(null);
  working(false);
  setPlayer(null as never);
  showDialog(null);
});

afterEach(() => {
  for (const root of roots()) root.remove();
  setFrontEndActions({});
});

describe('FrontEnd.open and close', () => {
  it('mounts the screens once, with the boot panel out of the way', () => {
    const { front, boot } = setup();
    void front.open();
    void front.open();
    expect(roots()).toHaveLength(1);
    expect(boot.hide).toHaveBeenCalledTimes(1);
  });

  it('puts the screens away, brings the boot panel back and drops the ground', () => {
    const { front, boot, ground } = setup();
    void front.open();
    front.close();
    expect(roots()).toHaveLength(0);
    expect(boot.show).toHaveBeenCalledWith('Entering the world...');
    expect(ground.dispose).toHaveBeenCalledTimes(1);
  });

  it('resolves once a character is chosen, and not before', async () => {
    const { front, run } = setup();
    let done = false;
    void front.open().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await run.choose('Ayla');
    await vi.waitFor(() => expect(done).toBe(true));
  });
});

describe('sign-in', () => {
  it('lists the characters and the races the server opened', async () => {
    const { run, account, host } = setup();
    account.offeredRaces = [2];
    await run.signIn('user', 'hash');
    expect(host.signingIn).toHaveBeenCalledTimes(1);
    expect(characters.value.map(one => one.name)).toEqual(['Ayla']);
    expect(kinds.value.races.map(one => one.race)).toEqual([2]);
    expect(stage.value).toBe('characters');
    expect(busy.value).toBe(false);
  });

  it('offers every race the build knows when the server named none', async () => {
    const { run } = setup();
    await run.signIn('user', 'hash');
    expect(kinds.value.races).toHaveLength(2);
  });

  it('carries on with no races at all when the tables cannot be read', async () => {
    const { run, host } = setup();
    (host.kinds as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('no tables'),
    );
    await run.signIn('user', 'hash');
    expect(kinds.value.races).toEqual([]);
    expect(stage.value).toBe('characters');
  });

  it('on a refusal says why, tells the host, and offers the form again', async () => {
    const { run, host } = setup({ login: { ok: false, code: 7, reason: 'bad password' } });
    await run.signIn('user', 'hash');
    expect(host.refused).toHaveBeenCalledWith('bad password');
    expect(notice.value).toBe(
      'Sign-in refused (bad password). Check the name and password and try again.',
    );
    expect(busy.value).toBe(false);
    expect(stage.value).toBe('signIn');
  });

  it('signs in on a second try after a refusal', async () => {
    const { run, account } = setup({ login: { ok: false, code: 7, reason: 'bad password' } });
    await run.signIn('user', 'wrong');
    account.signIn.mockResolvedValueOnce({ ok: true, code: 2, reason: null });
    await run.signIn('user', 'right');
    expect(account.signIn).toHaveBeenCalledTimes(2);
    expect(stage.value).toBe('characters');
    expect(busy.value).toBe(false);
  });

  it('names the code when the server gave no reason', async () => {
    const { run, host } = setup({ login: { ok: false, code: 7, reason: null } });
    await run.signIn('user', 'hash');
    expect(host.refused).toHaveBeenCalledWith('code 7');
  });
});

describe('the boxes over sign-in', () => {
  it('shows the connecting box while the server answers, and takes it down on success', async () => {
    let answer: (login: { ok: boolean; code: number; reason: string | null }) => void = () => {};
    const { run, account } = setup();
    account.signIn.mockImplementationOnce(
      () => new Promise(resolve => void (answer = resolve)) as never,
    );

    const signing = run.signIn('user', 'hash');
    expect(dialog.value).toEqual({ kind: 'connecting' });

    answer({ ok: true, code: 2, reason: null });
    await signing;
    expect(dialog.value).toBeNull();
  });

  it('swaps the connecting box for a message box saying why it was refused', async () => {
    const { run } = setup({ login: { ok: false, code: 1, reason: 'bad password' } });
    await run.signIn('user', 'hash');
    expect(dialog.value).toEqual({ kind: 'message', text: 'bad password' });
  });

  it('starts over with a fresh connection when the wait is cancelled', () => {
    const { run, host } = setup();
    run.cancelSignIn();
    expect(host.restart).toHaveBeenCalledTimes(1);
  });
});

describe('logging out', () => {
  it('goes back to the sign-in form on the same connection, without reloading', async () => {
    const { run, account, connection } = setup();
    await run.signIn('user', 'hash');
    expect(stage.value).toBe('characters');

    run.signOut();
    await vi.waitFor(() => expect(stage.value).toBe('signIn'));

    expect(account.signOut).toHaveBeenCalledTimes(1);
    expect(connection.disconnect).not.toHaveBeenCalled();
    expect(characters.value).toEqual([]);
    expect(busy.value).toBe(false);
  });
});

describe('making, deleting and choosing', () => {
  it('makes a character under its trimmed name, opens the list on it and celebrates', async () => {
    const { run, account, ground } = setup();
    await run.create(draft);
    expect(account.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ayla', class: 2 }),
    );
    expect(justMade.value).toBe('Ayla');
    expect(ground.celebrate).toHaveBeenCalled();
    expect(stage.value).toBe('characters');
    expect(busy.value).toBe(false);
  });

  it('says why a character could not be made, and stays where it was', async () => {
    const { run, account, ground } = setup();
    account.create.mockResolvedValueOnce({ ok: false, reason: 'name taken' });
    await run.create(draft);
    expect(notice.value).toBe('name taken');
    expect(ground.celebrate).not.toHaveBeenCalled();
    expect(busy.value).toBe(false);
    expect(stage.value).toBe('signIn');
  });

  it('clears the dais when a character is deleted', async () => {
    const { run, ground } = setup();
    await run.remove('Ayla');
    expect(ground.show).toHaveBeenCalledWith(null);
    expect(notice.value).toBe('');
  });

  it('says why a character could not be deleted', async () => {
    const { run, account, ground } = setup();
    account.remove.mockResolvedValueOnce({ ok: false, reason: 'in the world' });
    await run.remove('Ayla');
    expect(notice.value).toBe('in the world');
    expect(ground.show).not.toHaveBeenCalled();
  });

  it('tells the host who was chosen before asking to enter, and puts the hero in the HUD', async () => {
    const { run, account, host } = setup();
    const order: string[] = [];
    host.chose.mockImplementation(() => order.push('chose'));
    account.choose.mockImplementation(async () => void order.push('choose'));
    await run.choose('Ayla');
    expect(order).toEqual(['chose', 'choose']);
    expect(player.value).toMatchObject({ name: 'Ayla', level: 4, health: 0 });
    expect(stage.value).toBe('entering');
  });

  it('asks to enter even for a name nobody has, telling the host there was no one', async () => {
    const { run, account, host } = setup();
    await run.choose('Nobody');
    expect(host.chose).toHaveBeenCalledWith(null);
    expect(account.choose).toHaveBeenCalledWith('Nobody');
    expect(player.value).toBeNull();
  });
});

describe('the rest of the screens’ asks', () => {
  it('hands the ground’s asks to the ground', () => {
    const { run, ground } = setup();
    const look = { race: 1 } as never;
    run.preview(look);
    run.wantPortrait(look);
    run.stageCanvas(null);
    run.turnBody(0.25);
    run.releaseBody();
    run.watchGround('close');
    run.celebrate();
    expect(ground.show).toHaveBeenCalledWith(look);
    expect(ground.portrait).toHaveBeenCalledWith(look);
    expect(ground.canvas).toHaveBeenCalledWith(null);
    expect(ground.turnBy).toHaveBeenCalledWith(0.25);
    expect(ground.releaseTurn).toHaveBeenCalled();
    expect(ground.watch).toHaveBeenCalledWith('close');
    expect(ground.celebrate).toHaveBeenCalled();
  });

  it('asks the server what a race and class would wear', () => {
    const { run, connection } = setup();
    run.askOutfit(1, 2);
    expect(connection.askOutfit).toHaveBeenCalledWith(1, 2);
  });
});
