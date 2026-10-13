import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation } from '../src/app/features/npc/conversation';
import type { GossipMenu } from '../src/assets/types';
import type { CharacterSummary } from '../src/net/GameConnection';
import { closeGossip, gossip } from '../src/ui/hudStore';

const open = (tag: string): string => `\x12${tag}\x13`;
const close = (tag: string): string => `\x12/${tag}\x13`;
const link = (attrs: string, label: string): string =>
  open(`link_menu=${attrs}`) + label + close('link_menu');

const NONE = [0, 0, 0, 0, 0, 0];
const menus: Record<number, GossipMenu> = {
  1: {
    id: 1,
    text: `Hello, ${open('name')}. ${link('1,icon=a.png', 'Tell me more')} ${link(
      '-1,icon=a.png,script=2',
      'Pull the lever',
    )}`,
    subMenus: [2, 0, 0, 0, 0, 0],
    scripts: NONE,
  },
  2: { id: 2, text: 'More words.', subMenus: NONE, scripts: NONE },
};

function setup(over: { greeting?: () => Promise<GossipMenu>; named?: boolean } = {}) {
  const connection = { sendNpcPickOption: vi.fn(), sendNpcPreviousPage: vi.fn() };
  const resources = {
    npcGreeting: vi.fn(over.greeting ?? (async () => menus[1]!)),
    gossipMenu: vi.fn(async (id: number) => menus[id]!),
    playableKinds: async () => ({ races: [], classes: [] }),
  };
  const said: Array<string | null> = [];
  const conversation = new Conversation(
    connection,
    resources as never,
    {
      networkName: () => (over.named === false ? null : 'Old Tom'),
      selfNetworkId: () => 1,
    },
    () => ({ name: 'Ayla', class: 2, race: 1 }) as CharacterSummary,
    text => said.push(text),
  );
  return { conversation, h: conversation.handlers(), connection, resources, said };
}

const shown = () => gossip.value!;
const words = () =>
  shown()
    .text.map(span => span.text)
    .join('');
const pick = (label: string) =>
  shown()
    .choices.find(choice => choice.label === label)!
    .onPick();

beforeEach(() => closeGossip());

describe('Conversation', () => {
  it('greets with the giver’s first page, under its name, speaking to the hero', async () => {
    const { conversation, resources } = setup();
    conversation.open(5, 42);
    expect(resources.npcGreeting).toHaveBeenCalledWith(42);
    await vi.waitFor(() => expect(gossip.value).not.toBeNull());
    expect(shown().title).toBe('Old Tom');
    expect(words()).toContain('Hello, Ayla.');
    expect(shown().choices.map(c => c.label)).toEqual(['Tell me more', 'Pull the lever']);
  });

  it('calls a body with no name "NPC"', async () => {
    const { conversation } = setup({ named: false });
    conversation.open(5, 42);
    await vi.waitFor(() => expect(gossip.value?.title).toBe('NPC'));
  });

  it('walks to a page under the greeting from the local tables, and back up', async () => {
    const { conversation, resources, connection } = setup();
    conversation.open(5, 42);
    await vi.waitFor(() => expect(gossip.value).not.toBeNull());
    pick('Tell me more');
    expect(resources.gossipMenu).toHaveBeenCalledWith(2);
    await vi.waitFor(() => expect(words()).toBe('More words.'));
    shown().onBack();
    expect(words()).toContain('Hello, Ayla.');
    expect(connection.sendNpcPickOption).not.toHaveBeenCalled();
  });

  it('leaves the NPC on Back from the greeting', async () => {
    const { conversation } = setup();
    conversation.open(5, 42);
    await vi.waitFor(() => expect(gossip.value).not.toBeNull());
    shown().onBack();
    expect(gossip.value).toBeNull();
  });

  it('asks the server to run a choice’s script, and says what it answered', async () => {
    const { conversation, h, connection, said } = setup();
    conversation.open(5, 42);
    await vi.waitFor(() => expect(gossip.value).not.toBeNull());
    pick('Pull the lever');
    expect(connection.sendNpcPickOption).toHaveBeenCalledWith(5, 1, 2);

    h.onNpcChoiceResult!(5, 1, 2, 'nothingHappens');
    expect(said).toEqual(['Nothing happens.']);
    expect(gossip.value).toBeNull();
  });

  it('keeps the page open when a price was not met', async () => {
    const { conversation, h, said } = setup();
    conversation.open(5, 42);
    await vi.waitFor(() => expect(gossip.value).not.toBeNull());
    pick('Pull the lever');
    h.onNpcChoiceResult!(5, 1, 2, 'notEnoughMoney');
    expect(gossip.value).not.toBeNull();
    expect(said[0]).toBeTruthy();
  });

  it('says nothing for a teleport, which shows itself', () => {
    const { h, said } = setup();
    h.onNpcChoiceResult!(5, 1, 2, 'teleported');
    expect(said).toEqual([null]);
  });

  it('shows a page that failed to load as such, whose Back asks the server for the page before', async () => {
    const { conversation, connection } = setup({
      greeting: () => Promise.reject(new Error('no table')),
    });
    conversation.open(5, 42);
    await vi.waitFor(() => expect(gossip.value).not.toBeNull());
    expect(words()).toBe('Unable to load this conversation.');
    shown().onBack();
    expect(connection.sendNpcPreviousPage).toHaveBeenCalledWith(5);
  });
});
