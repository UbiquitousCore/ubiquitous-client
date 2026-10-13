/**
 * Every message name and named code this client uses, checked against the
 * list the server sends.
 *
 * `fixtures/wireVocabularyFromServer.json` is written by the server from its
 * own constants and committed on both sides — the server half is
 * `ubiquitous-server/tests/integration/fixtures/wire-vocabulary.json`, asserted by
 * `WireVocabularyTests`. Regenerate there and copy the file here; do not edit
 * either copy by hand. After a rename, the copy here is what turns a name
 * this client still spells the old way into a failing test rather than a
 * request the server answers with "unsupported" or a message nothing reads.
 */

import { describe, expect, it } from 'vitest';

import vocabulary from './fixtures/wireVocabularyFromServer.json';
import { INBOUND, OUTBOUND } from '../src/net/messages';
import { FIELD_IDS } from '../src/net/unitFields';
import { itemErrorMessage, itemResultOk } from '../src/net/itemErrors';
import { spellErrorMessage } from '../src/net/spellErrors';
import { talentErrorMessage } from '../src/net/talentErrors';
import {
  CHOICE_RESULTS,
  HANDS,
  LOOTABLE_CODES,
  QUEST_SHARE_RESULTS,
  readChoiceResult,
  readHand,
  readLootable,
  readOutcome,
  readQuestShareResult,
  readSummonResult,
  SUMMON_RESULTS,
} from '../src/net/wireCodes';
import { sharedQuestAnswerLine } from '../src/ui/questShareStore';
import { summonResultLine } from '../src/app/features/summon/summon';
import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { QuestGiverStatus } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

const serverTypes = new Set(vocabulary.messageTypes);

/**
 * Names this client sends that the server does not handle yet. A request
 * here is answered with `protocol.error` ("unsupported"), so the feature
 * behind it does nothing until the server learns it.
 */
const NOT_HANDLED_BY_THE_SERVER: readonly string[] = [];

/**
 * Names this client reads that the server does not send yet. Each has a
 * handler waiting for it, and nothing arrives.
 */
const NOT_SENT_BY_THE_SERVER: readonly string[] = [];

describe('message names', () => {
  it('sends only messages the server handles, apart from the ones listed as not yet handled', () => {
    const unknown = Object.values(OUTBOUND).filter(type => !serverTypes.has(type));
    expect(unknown.sort()).toEqual([...NOT_HANDLED_BY_THE_SERVER].sort());
  });

  it('reads only messages the server sends, apart from the ones listed as not yet sent', () => {
    const unknown = Object.values(INBOUND).filter(type => !serverTypes.has(type));
    expect(unknown.sort()).toEqual([...NOT_SENT_BY_THE_SERVER].sort());
  });
});

describe('named codes', () => {
  it('knows every outcome the server names', () => {
    for (const outcome of vocabulary.outcomes) expect(readOutcome(outcome)).toBe(outcome);
  });

  it('has a sentence for every cast refusal the server names', () => {
    for (const reason of vocabulary.spellRefusals) {
      expect(spellErrorMessage(reason)).not.toContain(`(${reason})`);
    }
  });

  it('has a sentence for every talent refusal the server names', () => {
    for (const reason of vocabulary.talentRefusals) {
      expect(talentErrorMessage(reason)).not.toContain(`(${reason})`);
    }
  });

  it('reads the item success code as success and has a sentence for every refusal', () => {
    for (const code of vocabulary.itemOutcomes) {
      if (itemResultOk(code)) continue;
      expect(itemErrorMessage(code)).not.toContain(`(${code})`);
    }
    expect(vocabulary.itemOutcomes.filter(itemResultOk)).toHaveLength(1);
  });

  it('turns every loot state the server names into a state of its own', () => {
    for (const state of vocabulary.lootStates) expect(readLootable(state)).toBe(state);
    expect([...LOOTABLE_CODES].sort()).toEqual([...vocabulary.lootStates].sort());
  });

  it('tells apart every hand the server names', () => {
    for (const hand of vocabulary.hands) expect(readHand(hand)).toBe(hand);
    expect([...HANDS].sort()).toEqual([...vocabulary.hands].sort());
  });

  it('knows every summon result the server names, and words the ones the summoner is told', () => {
    expect([...SUMMON_RESULTS].sort()).toEqual([...vocabulary.summonResults].sort());
    for (const result of vocabulary.summonResults) expect(readSummonResult(result)).toBe(result);
    const told = (result: string) =>
      summonResultLine({ memberId: 1, memberName: 'Kael', result: readSummonResult(result) });
    expect(told('refused')).not.toBeNull();
    expect(told('failed')).not.toBeNull();
    expect(told('refused')).not.toBe(told('failed'));
    expect(told('levelTooLow')).not.toBeNull();
    expect(told('asked')).toContain('Kael');
    expect(told('accepted')).toContain('Kael');
    expect(told('levelTooLow')).not.toContain('\n');
  });

  it('has a sentence of its own for every shared-quest result the server names', () => {
    expect([...QUEST_SHARE_RESULTS].sort()).toEqual([...vocabulary.questShareResults].sort());
    const unknown = sharedQuestAnswerLine(
      { memberId: 1, memberName: 'Kael', questId: 1, result: null },
      'the quest',
    );
    for (const result of vocabulary.questShareResults) {
      const read = readQuestShareResult(result);
      expect(read).toBe(result);
      const line = sharedQuestAnswerLine(
        { memberId: 1, memberName: 'Kael', questId: 1, result: read },
        'the quest',
      );
      expect(line).not.toBe(unknown);
    }
  });

  it('reads every conversation choice result the server names as itself', () => {
    for (const result of vocabulary.choiceResults) expect(readChoiceResult(result)).toBe(result);
    expect([...CHOICE_RESULTS].sort()).toEqual([...vocabulary.choiceResults].sort());
  });

  it('reads the unit values it draws under names the server sends', () => {
    const sent = new Set(vocabulary.unitValues);
    for (const name of Object.values(FIELD_IDS)) expect(sent).toContain(name);
  });

  it('keeps every quest mark the server names', async () => {
    const socket = new FakeWebSocket();
    const seen: QuestGiverStatus[] = [];
    const conn = new WebSocketConnection({
      url: 'ws://server.invalid:7020',
      createSocket: () => socket,
    });
    const connecting = conn.connect({
      onQuestStatuses: rows => seen.push(...rows.map(row => row.status)),
    });
    socket.accept();
    await connecting;
    socket.emit('quest.statuses', {
      statuses: vocabulary.questMarks.map((status, index) => ({
        networkId: `Creature:${index + 1}`,
        status,
      })),
    });
    // Every word the server names is one this client reads.
    expect(seen).toHaveLength(vocabulary.questMarks.length);
  });
});
