import { describe, expect, it } from 'vitest';

import type { GossipMenu } from '../src/assets/types';
import {
  NOTHING_HAPPENS,
  backFrom,
  choiceNotice,
  classWord,
  closesAfter,
  readGossip,
} from '../src/ui/npcGossip';
import type { GossipContext, GossipPage } from '../src/ui/npcGossip';

/** A tag as the tables write it: opened by 0x12, closed by 0x13. */
const open = (tag: string): string => `\x12${tag}\x13`;
const close = (tag: string): string => `\x12/${tag}\x13`;
const wrap = (tag: string, inner: string): string => open(tag) + inner + close(tag.split('=')[0]!);
const link = (attrs: string, label: string): string => wrap(`link_menu=${attrs}`, label);

const NONE = [0, 0, 0, 0, 0, 0];

function menu(text: string, subMenus: number[] = NONE, scripts: number[] = NONE): GossipMenu {
  return { id: 7, text, scripts, subMenus };
}

function player(overrides: Partial<GossipContext> = {}): GossipContext {
  return {
    holdsQuest: () => false,
    hasAura: () => false,
    name: 'Sample Hero',
    className: 'Sample Class',
    raceName: 'Sample Race',
    random: () => 0,
    ...overrides,
  };
}

const words = (page: GossipPage): string => page.text.map(span => span.text).join('');

describe('reading a conversation page', () => {
  it('turns the markup into words and labelled choices', () => {
    const page = readGossip(
      menu(
        `Welcome, traveller.\n\n${link('1,icon=a.png', 'Tell me more')}\n${link('-1,icon=a.png', 'Goodbye')}`,
        [40, 0, 0, 0, 0, 0],
      ),
      player(),
    );

    expect(words(page)).toBe('Welcome, traveller.');
    expect(page.choices.map(choice => choice.label)).toEqual(['Tell me more', 'Goodbye']);
    expect(page.choices[0]!.action).toEqual({ kind: 'open', menuId: 40 });
    expect(page.choices[1]!.action).toEqual({ kind: 'close' });
  });

  it('leaves no markup behind, and keeps text that only looks like a tag as words', () => {
    const page = readGossip(
      menu(`${open('')}Hello${close('stray')}.${open('Oh no, not again!')} Fine.\x13`),
      player(),
    );

    expect(words(page)).toBe('Hello.Oh no, not again! Fine.');
    expect(words(page)).not.toMatch(/[\x12\x13]/);
  });

  it('says the player’s name, class and race where the page asks', () => {
    const page = readGossip(
      menu(`Hi, ${open('name')}, a ${open('race')} ${open('class')}.${open('br /')}Next line.`),
      player(),
    );

    expect(words(page)).toBe('Hi, Sample Hero, a Sample Race Sample Class.\nNext line.');
  });

  it('marks coloured words in the alert tone, and the rest plain', () => {
    const page = readGossip(menu(`Hi, ${wrap('color=red', 'friend')}!`), player());

    expect(page.text).toEqual([
      { text: 'Hi, ', tone: 'plain' },
      { text: 'friend', tone: 'alert' },
      { text: '!', tone: 'plain' },
    ]);
  });

  it('shows what a quest held or not held unlocks, and only that', () => {
    const text =
      wrap('has_quest=12', `Ready? ${link('-1,icon=a.png,script=1', 'Yes')}`) +
      wrap('not_has_quest=12', 'Go away.');

    const holding = readGossip(
      menu(text, NONE, [5, 0, 0, 0, 0, 0]),
      player({ holdsQuest: id => id === 12 }),
    );
    expect(words(holding)).toBe('Ready?');
    expect(holding.choices.map(choice => choice.label)).toEqual(['Yes']);

    const without = readGossip(menu(text), player());
    expect(words(without)).toBe('Go away.');
    expect(without.choices).toEqual([]);
  });

  it('reads the in-log form of a held quest the same way', () => {
    const page = readGossip(
      menu(wrap('has_quest=12,inlog=1', 'In the log.')),
      player({ holdsQuest: id => id === 12 }),
    );
    expect(words(page)).toBe('In the log.');
  });

  it('shows what an aura worn or not worn unlocks', () => {
    const text = wrap('has_aura=30', 'Blessed.') + wrap('not_has_aura=30', 'Unblessed.');
    expect(words(readGossip(menu(text), player({ hasAura: id => id === 30 })))).toBe('Blessed.');
    expect(words(readGossip(menu(text), player()))).toBe('Unblessed.');
  });

  it('says one of several lines, not all of them', () => {
    const lines = ['First sample line.', 'Second sample line.', 'Third sample line.'];
    const text = wrap('random', lines.map(line => wrap('randomtext', line)).join('\n'));

    expect(words(readGossip(menu(text), player({ random: () => 0 })))).toBe(lines[0]);
    expect(words(readGossip(menu(text), player({ random: () => 0.5 })))).toBe(lines[1]);
    expect(words(readGossip(menu(text), player({ random: () => 0.9 })))).toBe(lines[2]);
  });

  it('keeps ordinary prose that happens to say random', () => {
    const page = readGossip(menu('A random thug loiters here, acting randomly.'), player());
    expect(words(page)).toBe('A random thug loiters here, acting randomly.');
  });

  it('takes out the layout whitespace between tags', () => {
    const page = readGossip(
      menu(`\n\n${wrap('not_has_quest=1', '\n\nFirst.  \n \n\n\n')}\n\nSecond.\r\n\r\n\r\n`),
      player(),
    );
    expect(words(page)).toBe('First.\n\nSecond.');
  });

  it('runs an unclosed choice to the end of the page', () => {
    const page = readGossip(
      menu(`Words. ${open('link_menu=-1,icon=a.png,script=1')}Any news?`),
      player(),
    );
    expect(page.choices.map(choice => choice.label)).toEqual(['Any news?']);
  });

  it('drops a choice with no words, which has nothing to click', () => {
    const page = readGossip(menu(`Hello. ${link('1,', '')}`, [9, 0, 0, 0, 0, 0]), player());
    expect(page.choices).toEqual([]);
  });

  it('shows the choices without filler when a page is only choices', () => {
    const page = readGossip(menu(link('-1,icon=a.png,script=1', 'Pull the lever')), player());
    expect(page.text).toEqual([]);
    expect(page.choices.map(choice => choice.label)).toEqual(['Pull the lever']);
  });
});

describe('what a choice does', () => {
  it('asks the server to run a choice’s script slot, from the tag or from a script tag inside it', () => {
    const page = readGossip(
      menu(
        link('-1,icon=a.png,script=2', 'Named slot') +
          link('-1,icon=a.png', wrap('script=3', 'Inner slot')),
      ),
      player(),
    );
    expect(page.choices.map(choice => choice.action)).toEqual([
      { kind: 'run', slot: 2 },
      { kind: 'run', slot: 3 },
    ]);
    expect(page.choices.map(choice => choice.scriptSlot)).toEqual([2, 3]);
  });

  it('opens no sub-page for a link to 0, the same as -1', () => {
    const page = readGossip(
      menu(
        link('0,icon=a.png', 'Go on.') + link('0,icon=a.png,script=1', 'Tell me'),
        NONE,
        [7, 0, 0, 0, 0, 0],
      ),
      player(),
    );
    expect(page.choices.map(choice => choice.action)).toEqual([
      { kind: 'close' },
      { kind: 'run', slot: 1 },
    ]);
  });

  it('closes for a choice that opens nothing and runs nothing', () => {
    const page = readGossip(
      menu(link('1,icon=a.png', 'Thanks') + link('-1,icon=a.png', 'Bye')),
      player(),
    );
    expect(page.choices.map(choice => choice.action.kind)).toEqual(['close', 'close']);
  });

  it('opens the page under it before running anything', () => {
    const page = readGossip(
      menu(link('2,icon=a.png,script=1', 'Both'), [0, 50, 0, 0, 0, 0]),
      player(),
    );
    expect(page.choices[0]!.action).toEqual({ kind: 'open', menuId: 50 });
  });

  it('pairs each teleport with the choice whose script slot it names', () => {
    const page = readGossip(
      menu(
        open('teleport=1,topzone=40,x=-1,y=2,z=3,o=0,moneytype=0,moneycount=250') +
          close('teleport') +
          open('teleport=2,topzone=50,x=1,y=2,z=3,o=1') +
          close('teleport') +
          link('-1,icon=a.png,script=1', 'Harbour') +
          link('-1,icon=a.png,script=2', 'Hill') +
          link('-1,icon=a.png', 'Stay'),
      ),
      player(),
    );

    expect(page.text).toEqual([]);
    expect(page.choices.map(choice => [choice.label, choice.teleport])).toEqual([
      ['Harbour', { zoneId: 40, cost: 250 }],
      ['Hill', { zoneId: 50, cost: 0 }],
      ['Stay', null],
    ]);
    expect(page.choices[0]!.action).toEqual({ kind: 'run', slot: 1 });
  });
});

describe('what the server says back', () => {
  const harbour = readGossip(
    menu(
      open('teleport=1,topzone=40,x=0,y=0,z=0,o=0,moneytype=0,moneycount=250') +
        close('teleport') +
        link('-1,icon=a.png,script=1', 'Harbour'),
    ),
    player(),
  ).choices[0]!;

  it('closes the page after a journey or a choice with nothing behind it, and keeps it for a price not met', () => {
    expect(closesAfter('teleported')).toBe(true);
    expect(closesAfter('nothingHappens')).toBe(true);
    expect(closesAfter('notEnoughMoney')).toBe(false);
  });

  it('says nothing of a journey, says so of a choice with nothing behind it, and names a price not met', () => {
    expect(choiceNotice('teleported', harbour)).toBeNull();
    expect(choiceNotice('nothingHappens', harbour)).toBe(NOTHING_HAPPENS);
    expect(choiceNotice('notEnoughMoney', harbour)).toMatch(/It costs 2 silver 50 copper\.$/);
    expect(choiceNotice('notEnoughMoney', null)).not.toMatch(/costs/);
  });
});

describe('walking an NPC conversation', () => {
  it('backs up one menu, and has no menu above the greeting', () => {
    expect(backFrom([353, 9, 12])).toBe(9);
    expect(backFrom([353, 9])).toBe(353);
    expect(backFrom([353])).toBeNull();
  });

  it('has a word for each of the four classes and none for anything else', () => {
    expect([1, 2, 3, 4].map(classWord).every(word => word.length > 0)).toBe(true);
    expect(classWord(0)).toBe('');
  });
});
