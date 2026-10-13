import { describe, expect, it, vi } from 'vitest';

import { dispatchOnlineService } from '../src/app/helpers/npc/serviceDispatch';

describe('dispatchOnlineService', () => {
  it('routes each service to its matching handler', () => {
    const handlers = {
      storage: vi.fn(),
      mail: vi.fn(),
      summon: vi.fn(),
      quests: vi.fn(),
      shop: vi.fn(),
      auction: vi.fn(),
      talk: vi.fn(),
      use: vi.fn(),
    };

    dispatchOnlineService('storage', 1, handlers);
    dispatchOnlineService('mail', 2, handlers);
    dispatchOnlineService('quests', 3, handlers);
    dispatchOnlineService('shop', 4, handlers);
    dispatchOnlineService('auction', 5, handlers);
    dispatchOnlineService('talk', 6, handlers);
    dispatchOnlineService('use', 7, handlers);
    dispatchOnlineService('summon', 8, handlers);

    expect(handlers.storage).toHaveBeenCalledWith(1);
    expect(handlers.mail).toHaveBeenCalledWith(2);
    expect(handlers.quests).toHaveBeenCalledWith(3);
    expect(handlers.shop).toHaveBeenCalledWith(4);
    expect(handlers.auction).toHaveBeenCalledWith(5);
    expect(handlers.talk).toHaveBeenCalledWith(6);
    expect(handlers.use).toHaveBeenCalledWith(7);
    expect(handlers.summon).toHaveBeenCalledWith(8);
  });
});
