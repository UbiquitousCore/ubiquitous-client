import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerSummon,
  askSummon,
  closeSummonWindow,
  openSummonWindow,
  setSummonActions,
  summonMember,
  summonQuestion,
  summonWindow,
} from '../src/ui/summonStore';

describe('summon stone', () => {
  const request = vi.fn();
  const answer = vi.fn();

  beforeEach(() => {
    request.mockReset();
    answer.mockReset();
    setSummonActions({ request, answer });
    closeSummonWindow();
    summonQuestion.value = null;
  });

  it('calls the member picked to the stone the window was opened on, and closes', () => {
    openSummonWindow(40, [{ networkId: 7, name: 'Kael', canSummon: true }]);

    summonMember(7);

    expect(request).toHaveBeenCalledWith(40, 7);
    expect(summonWindow.value).toBeNull();
  });

  it('asks nothing once the window is shut', () => {
    summonMember(7);

    expect(request).not.toHaveBeenCalled();
  });

  it('answers a summon once, and puts the question away', () => {
    askSummon({ summonerName: 'Kael', place: 'High Forest' });

    answerSummon(false);
    answerSummon(true);

    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(false);
    expect(summonQuestion.value).toBeNull();
  });
});
