import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestMarks } from '../src/app/features/quest/questMarks';
import type { NetworkBodies } from '../src/gameplay/NetworkBodies';
import { questGiverStatuses, setQuestGiverStatuses } from '../src/ui/questStore';
import type { World } from '../src/world/World';

function setup() {
  const entities = new Map<number, { id: number; questMark?: string }>([[10, { id: 10 }]]);
  const network = new Map<number, number>([[100, 10]]);
  const world = {
    entities,
    setQuestStatus: (entity: { questMark?: string }, status: string) => {
      entity.questMark = status;
    },
  };
  const changed = vi.fn();
  const marks = new QuestMarks(
    { localIdOf: (id: number) => network.get(id) } as unknown as NetworkBodies,
    world as unknown as World,
    changed,
  );
  return { marks, h: marks.handlers(), entities, network, changed };
}

beforeEach(() => setQuestGiverStatuses([]));

describe('QuestMarks', () => {
  it('marks a giver whose body is here, and tells the HUD', () => {
    const { h, entities, changed, marks } = setup();
    h.onQuestStatuses!([{ networkId: 100, status: 'available' }]);
    expect(entities.get(10)!.questMark).toBe('available');
    expect(questGiverStatuses.value.get(100)).toBe('available');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(marks.waiting).toBe(false);
  });

  it('holds a status for a body that has not arrived, and applies it once it has', () => {
    const { h, marks, entities, network } = setup();
    h.onQuestStatuses!([{ networkId: 200, status: 'finished' }]);
    expect(marks.waiting).toBe(true);
    marks.settle();
    expect(marks.waiting).toBe(true);

    entities.set(20, { id: 20 });
    network.set(200, 20);
    marks.settle();
    expect(entities.get(20)!.questMark).toBe('finished');
    expect(marks.waiting).toBe(false);
  });

  it('keeps holding for a body known to the server but gone from the world', () => {
    const { h, marks, network } = setup();
    network.set(300, 30);
    h.onQuestStatuses!([{ networkId: 300, status: 'available' }]);
    expect(marks.waiting).toBe(true);
  });

  it('forgets what was waiting when asked', () => {
    const { h, marks } = setup();
    h.onQuestStatuses!([{ networkId: 200, status: 'finished' }]);
    marks.clear();
    expect(marks.waiting).toBe(false);
  });
});
