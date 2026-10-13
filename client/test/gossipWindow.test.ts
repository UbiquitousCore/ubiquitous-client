import { describe, expect, it, vi } from 'vitest';

import { buildGossipWindow } from '../src/app/helpers/npc/gossipWindow';

describe('buildGossipWindow', () => {
  it('uses fallback text when page has no text and no choices', () => {
    const ui = buildGossipWindow({
      title: 'NPC',
      page: { text: [], choices: [] },
      trailMenuIds: [10],
      onOpen: () => {},
      onClose: () => {},
      onRun: () => {},
      onBackUp: () => {},
      onBackOut: () => {},
    });
    expect(ui.text).toEqual([{ text: 'The NPC has nothing to say.', tone: 'plain' }]);
  });

  it('routes choice actions to open/close/run callbacks', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onRun = vi.fn();
    const ui = buildGossipWindow({
      title: 'NPC',
      page: {
        text: [{ text: 'Hi', tone: 'plain' }],
        choices: [
          {
            label: 'Open',
            subMenuId: 2,
            scriptSlot: 0,
            teleport: null,
            action: { kind: 'open', menuId: 2 },
          },
          {
            label: 'Close',
            subMenuId: 0,
            scriptSlot: 0,
            teleport: null,
            action: { kind: 'close' },
          },
          {
            label: 'Run',
            subMenuId: 0,
            scriptSlot: 1,
            teleport: null,
            action: { kind: 'run', slot: 1 },
          },
        ],
      },
      trailMenuIds: [10],
      onOpen,
      onClose,
      onRun,
      onBackUp: () => {},
      onBackOut: () => {},
    });

    ui.choices[0]!.onPick();
    ui.choices[1]!.onPick();
    ui.choices[2]!.onPick();

    expect(onOpen).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onRun).toHaveBeenCalledWith(1, expect.objectContaining({ label: 'Run' }));
  });

  it('backs out from greeting and up from deeper trail', () => {
    const out = vi.fn();
    const up = vi.fn();

    const root = buildGossipWindow({
      title: 'NPC',
      page: { text: [], choices: [] },
      trailMenuIds: [10],
      onOpen: () => {},
      onClose: () => {},
      onRun: () => {},
      onBackUp: up,
      onBackOut: out,
    });
    root.onBack();
    expect(out).toHaveBeenCalledOnce();

    const nested = buildGossipWindow({
      title: 'NPC',
      page: { text: [], choices: [] },
      trailMenuIds: [10, 20],
      onOpen: () => {},
      onClose: () => {},
      onRun: () => {},
      onBackUp: up,
      onBackOut: out,
    });
    nested.onBack();
    expect(up).toHaveBeenCalledOnce();
  });
});
