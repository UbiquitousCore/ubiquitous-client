/**
 * Whether this session is inside a private instance copy of a map.
 *
 * Nothing on the wire says so. The flag is inferred: it is set because this
 * client asked for an instance and the world entry that followed was the
 * answer to that request, and it is cleared by any world entry this client did
 * not ask for that way — a teleport, a bus ride and a relog all leave an
 * instance and none of them announces it either. The request is spent once it
 * is answered, so the same map arriving twice ends up outside.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyWorldEntered,
  dungeonMode,
  inInstance,
  instanceActions,
  instanceMapId,
  noteInstanceRequested,
  resetInstance,
  setInstanceActions,
} from '../src/ui/instanceStore';

const INERT = instanceActions();
const DUNGEON = 7;
const ELSEWHERE = 9;

beforeEach(() => {
  resetInstance();
  setInstanceActions(INERT);
});

describe('entering the world', () => {
  it('is the open world when nothing asked for an instance', () => {
    applyWorldEntered(DUNGEON);
    expect(inInstance.value).toBe(false);
    expect(instanceMapId.value).toBeNull();
  });

  it('is an instance when it answers the request this client made', () => {
    noteInstanceRequested(DUNGEON);
    applyWorldEntered(DUNGEON);
    expect(inInstance.value).toBe(true);
    expect(instanceMapId.value).toBe(DUNGEON);
  });

  it('is not an instance when a different map arrives than was asked for', () => {
    noteInstanceRequested(DUNGEON);
    applyWorldEntered(ELSEWHERE);
    expect(inInstance.value).toBe(false);
    expect(instanceMapId.value).toBeNull();
  });
});

describe('leaving one', () => {
  it('is inferred from the next unasked-for world entry, wherever it goes', () => {
    noteInstanceRequested(DUNGEON);
    applyWorldEntered(DUNGEON);
    applyWorldEntered(ELSEWHERE);
    expect(inInstance.value).toBe(false);
  });

  it('spends the request, so the same map entered again lands outside', () => {
    noteInstanceRequested(DUNGEON);
    applyWorldEntered(DUNGEON);
    expect(inInstance.value).toBe(true);
    applyWorldEntered(DUNGEON);
    expect(inInstance.value).toBe(false);
    expect(instanceMapId.value).toBeNull();
  });

  it('needs a fresh request to go back in', () => {
    noteInstanceRequested(DUNGEON);
    applyWorldEntered(DUNGEON);
    applyWorldEntered(ELSEWHERE);
    noteInstanceRequested(DUNGEON);
    applyWorldEntered(DUNGEON);
    expect(instanceMapId.value).toBe(DUNGEON);
  });
});

describe('resetting', () => {
  it('puts the dungeon mode back to Normal', () => {
    dungeonMode.value = 'legend';
    resetInstance();
    expect(dungeonMode.value).toBe('normal');
  });

  it('forgets the instance, the notice, the window and the pending request', () => {
    noteInstanceRequested(DUNGEON);
    applyWorldEntered(DUNGEON);
    resetInstance();
    expect(inInstance.value).toBe(false);
    expect(instanceMapId.value).toBeNull();

    applyWorldEntered(DUNGEON);
    expect(inInstance.value).toBe(false);
  });
});

describe('what the window asks the game to do', () => {
  it('is inert before `Game` installs anything behind it', () => {
    expect(() => instanceActions().enter(DUNGEON)).not.toThrow();
  });

  it('hands back the handler `Game` installed', () => {
    const asked: number[] = [];
    setInstanceActions({
      enter: mapId => asked.push(mapId),
      resetDungeons: () => {},
      chooseDungeonMode: () => {},
    });
    instanceActions().enter(DUNGEON);
    expect(asked).toEqual([DUNGEON]);
  });
});
