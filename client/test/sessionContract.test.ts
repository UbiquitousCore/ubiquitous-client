/**
 * The messages a session lives on, checked against the server's own bytes.
 *
 * `fixtures/sessionMessagesFromServer.json` is not hand-written. The server
 * serializes it from its own payload records, with invented ids, and commits
 * the same bytes at
 * `ubiquitous-server/tests/integration/fixtures/session-messages.json`
 * (`SessionWireShapeTests`). Regenerate there and copy the file here; do not
 * edit either copy by hand.
 *
 * Each message goes through the production reader, and where the value
 * reaches a screen, through the store or rule that screen draws from. A key
 * renamed on one side reads as a missing value here — a spell book with no
 * spells, a purse with no gold, an experience bar that reads full.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import fixture from './fixtures/sessionMessagesFromServer.json';
import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type {
  ActionBarRecord,
  CharacterSummary,
  CombatHit,
  ConnectionEvents,
  EntitySnapshot,
  HeldAura,
  LootContents,
  QuestGiverStatus,
  SharedQuestAnswer,
  SharedQuestOffer,
  QuestRecord,
  QuestUpdate,
  TalentRank,
} from '../src/net/GameConnection';
import type { PartyRoster } from '../src/net/GameConnection';
import type { Lootable } from '../src/gameplay/loot';
import { FIELD_IDS } from '../src/net/unitFields';
import { applyPlayerValues, player } from '../src/ui/hudStore';
import { heroFaces } from '../src/ui/components/ArtPlayerFrame';
import { actionBar, initSpells, shortcutSlots } from '../src/gameplay/SpellBook';
import { questLog, setQuestLog, upsertQuest } from '../src/ui/questStore';
import { guideTarget } from '../src/gameplay/questGuide';
import { FakeWebSocket } from './helpers/fakeWebSocket';
import {
  appliedFrom,
  auraKey,
  aurasFor,
  clearAuras,
  setAurasOf,
  timeLeft,
} from '../src/ui/auraStore';

const messages = fixture as unknown as Record<string, Record<string, unknown>>;

interface Seen {
  characters: CharacterSummary[] | null;
  entered: { map: number; self: number; auras: HeldAura[] } | null;
  spawned: EntitySnapshot | null;
  spells: { known: number[]; bar: ActionBarRecord[] } | null;
  slot: ActionBarRecord | null;
  values: Record<string, number> | null;
  expGained: { amount: number; levelUp: boolean } | null;
  meleeStart: { attacker: number; target: number } | null;
  swing: CombatHit | null;
  spell: { damage: number; finalHealth?: number; absorbed?: number } | null;
  inviteSent: string | null;
  invited: string | null;
  roster: PartyRoster | null;
  duelFrom: number | null;
  statuses: Array<{ networkId: number; status: QuestGiverStatus }> | null;
  details: QuestRecord | null;
  updated: QuestUpdate | null;
  log: QuestRecord[] | null;
  conversation: { networkId: number; entry: number } | null;
  choiceResult: { networkId: number; menuId: number; choice: number; result: string } | null;
  lootable: Lootable | null;
  loot: LootContents | null;
  died: { networkId: number; position?: [number, number, number] } | null;
  shareOffer: SharedQuestOffer | null;
  shareAnswer: SharedQuestAnswer | null;
  talents: { points: number; ranks: TalentRank[] } | null;
  talentRefused: { talentId: number; reason: string } | null;
}

async function replay(): Promise<Seen> {
  const socket = new FakeWebSocket();
  const seen: Seen = {
    characters: null,
    entered: null,
    spawned: null,
    spells: null,
    slot: null,
    values: null,
    expGained: null,
    meleeStart: null,
    swing: null,
    spell: null,
    inviteSent: null,
    invited: null,
    roster: null,
    duelFrom: null,
    statuses: null,
    details: null,
    updated: null,
    log: null,
    conversation: null,
    choiceResult: null,
    lootable: null,
    loot: null,
    died: null,
    shareOffer: null,
    shareAnswer: null,
    talents: null,
    talentRefused: null,
  };
  const events: ConnectionEvents = {
    onCharacters: characters => (seen.characters = characters),
    onWorldEntered: (map, _pos, self, auras) => (seen.entered = { map, self, auras }),
    onEntitiesAppeared: ([snapshot]) => (seen.spawned = snapshot ?? null),
    onSpellBook: (known, bar) => (seen.spells = { known, bar }),
    onActionBarAssigned: record => (seen.slot = record),
    onPlayerValuesChanged: values => (seen.values = values),
    onPlayerExpGained: (amount, levelUp) => (seen.expGained = { amount, levelUp }),
    onAttackMeleeStart: (attacker, target) => (seen.meleeStart = { attacker, target }),
    onSwingResult: hit => (seen.swing = hit),
    onSpellOutcome: (_caster, _target, _spell, _outcome, damage, finalHealth, absorbed) =>
      (seen.spell = { damage, finalHealth, absorbed }),
    onPartyInviteSent: (_id, name) => (seen.inviteSent = name),
    onPartyInvited: (_id, name) => (seen.invited = name),
    onPartyRoster: roster => (seen.roster = roster),
    onDuelRequested: from => (seen.duelFrom = from),
    onQuestStatuses: statuses => (seen.statuses = statuses),
    onQuestDetails: (_giver, quest) => (seen.details = quest),
    onQuestUpdated: quest => (seen.updated = quest),
    onQuestLog: quests => (seen.log = quests),
    onNpcConversation: (networkId, entry) => (seen.conversation = { networkId, entry }),
    onNpcChoiceResult: (networkId, menuId, choice, result) =>
      (seen.choiceResult = { networkId, menuId, choice, result }),
    onEntityLootable: (_id, state) => (seen.lootable = state),
    onLootContents: contents => (seen.loot = contents),
    onUnitDied: (networkId, position) => (seen.died = { networkId, position }),
    onQuestShareOffered: offer => (seen.shareOffer = offer),
    onQuestShareResult: answer => (seen.shareAnswer = answer),
    onTalentState: (points, ranks) => (seen.talents = { points, ranks }),
    onTalentRefused: (talentId, reason) => (seen.talentRefused = { talentId, reason }),
  };
  const conn = new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;
  for (const [type, payload] of Object.entries(messages)) socket.emit(type, payload);
  return seen;
}

describe('a session exactly as the server sends it', () => {
  beforeEach(() => {
    player.value = null;
    setQuestLog([]);
    clearAuras();
  });

  it('pins only messages this client reads', async () => {
    const seen = await replay();
    const unread = Object.entries(seen).filter(([, value]) => value === null);
    expect(unread.map(([key]) => key)).toEqual([]);
  });

  it('lists a character with how far through its level it is', async () => {
    const [character] = (await replay()).characters!;
    expect(character).toMatchObject({ name: 'Ayla', level: 3, xp: 120, xpToLevel: 400 });
  });

  it('knows which body is the player’s own', async () => {
    const { entered } = await replay();
    expect(entered!.map).toBe(1);
    expect(entered!.self).toBeGreaterThan(0);
  });

  it('reads what the hero wears as it arrives, and what a spawned body already wears', async () => {
    const { entered, spawned } = await replay();
    expect(entered!.auras).toEqual([
      {
        casterId: entered!.self,
        spellId: 90103,
        remaining: 4200,
        maxDuration: 30000,
        harmful: 0,
      },
    ]);
    const [slowed, lasting] = spawned!.auras!;
    expect(slowed).toMatchObject({
      spellId: 90102,
      remaining: 6500,
      maxDuration: 10000,
      harmful: 1,
    });
    expect(slowed!.casterId).toBeGreaterThan(0);
    expect(slowed!.casterId).not.toBe(entered!.self);
    expect(lasting).toMatchObject({ spellId: 90104, remaining: 0, maxDuration: 0, harmful: 0 });
    expect(lasting!.casterId).toBe(spawned!.networkId);
  });

  it('shows the icons of what a spawned body wears with the time the server said was left', async () => {
    const { spawned } = await replay();
    setAurasOf(auraKey(spawned!.networkId), spawned!.auras!.map(appliedFrom), 1_000);
    const worn = aurasFor(auraKey(spawned!.networkId), 1_000);
    // The buff that lasts until taken off stands before the debuff.
    expect(worn.map(aura => aura.spellId)).toEqual([90104, 90102]);
    expect(timeLeft(worn[1]!, 1_000)).toBe(6500);
    expect(worn[1]!.stacks).toBe(1);
    expect(timeLeft(worn[0]!, 1_000)).toBeNull();
  });

  it('puts the spell book and the saved bars on the action bar', async () => {
    const { spells, slot } = await replay();
    expect(spells!.known).toEqual([90101, 90102]);
    initSpells(spells!.known, spells!.bar);
    expect(actionBar.value[0]!.spellId).toBe(90101);
    expect(shortcutSlots.value[1]!.spellId).toBe(90102);
    expect(slot).toEqual({ bar: 'primary', slot: 2, id: 90102, type: 0 });
  });

  it('reads the purse and the experience under the names the HUD looks for', async () => {
    const values = (await replay()).values!;
    expect(values[FIELD_IDS.gold]).toBe(5000);
    expect(values[FIELD_IDS.xp]).toBe(120);
    expect(values[FIELD_IDS.xpToLevel]).toBe(400);
  });

  it('draws the experience bar as far along as the values say, not full', async () => {
    const values = (await replay()).values!;
    applyPlayerValues(values, { name: 'Ayla', level: 1, classId: 3 });
    const spec = { bars: { frames: 50, of: { exp: 'face/xp' } } };
    // 120 of 400 is 30% through, so 70% of the run is still to fill.
    expect(heroFaces(player.value!, spec).frames['face/xp']).toBe(35);
  });

  it('reads experience gained, a melee start and the swing that followed', async () => {
    const seen = await replay();
    expect(seen.expGained).toEqual({ amount: 35, levelUp: false });
    expect(seen.meleeStart!.attacker).toBe(seen.entered!.self);
    expect(seen.swing).toMatchObject({
      outcome: 'critical',
      damage: 42,
      finalHealth: 58,
      hand: 'off',
      absorbed: 0,
    });
  });

  it('reads a spell a shield took whole as no damage with what the shield took', async () => {
    const seen = await replay();
    expect(seen.spell).toEqual({ damage: 0, finalHealth: 181, absorbed: 20 });
  });

  it('reads the talent points left and every bought rank, and a refused learn', async () => {
    const seen = await replay();
    expect(seen.talents).toEqual({
      points: 3,
      ranks: [
        { talentId: 90701, rank: 2 },
        { talentId: 90702, rank: 1 },
      ],
    });
    expect(seen.talentRefused).toEqual({ talentId: 90703, reason: 'tierLocked' });
  });

  it('reads where a body died, so the corpse lies there', async () => {
    const { died } = await replay();
    expect(died!.position).toEqual([10.5, 2, -20.25]);
  });

  it('reads a shared quest offered, and a member’s answer to one', async () => {
    const seen = await replay();
    expect(seen.shareOffer).toMatchObject({
      sharerName: 'Kael',
      questId: 90601,
      titleStringId: 90602,
      detailsStringId: 90603,
      minLevel: 1,
    });
    expect(seen.shareAnswer).toMatchObject({
      memberName: 'Kael',
      questId: 90601,
      result: 'accepted',
    });
  });

  it('reads a party invite both ways, the roster and a duel challenge', async () => {
    const seen = await replay();
    expect(seen.inviteSent).toBe('Kael');
    expect(seen.invited).toBe('Ayla');
    expect(seen.roster!.members.map(member => [member.name, member.isLeader])).toEqual([
      ['Ayla', true],
      ['Kael', false],
    ]);
    expect(seen.duelFrom).toBe(seen.entered!.self);
  });

  it('reads the mark over a quest giver and what the giver offers', async () => {
    const seen = await replay();
    expect(seen.statuses!.map(row => row.status)).toEqual(['available']);
    expect(seen.details).toMatchObject({ id: 90601, status: 'available', rewardMoney: 250 });
    expect(seen.details!.objectives).toHaveLength(1);
  });

  it('fills the quest log, with where to go for each quest', async () => {
    const log = (await replay()).log!;
    expect(log.map(({ id, status, slot }) => [id, status, slot])).toEqual([
      [90601, 'incomplete', 0],
      [90611, 'finished', 1],
    ]);
    expect(log[0]!.guideZones).toHaveLength(1);
    expect(log[1]!.handInZone).toMatchObject({ id: 90302, mapId: 1 });
  });

  it('moves the guide arrow when a quest update says where to go next', async () => {
    const seen = await replay();
    setQuestLog([{ ...seen.log![0]!, guideZones: [] }]);
    upsertQuest(seen.updated!);
    const quest = questLog.value[0]!;
    expect(quest.objectives![0]).toMatchObject({ killed: 2 });
    expect(guideTarget(quest, 1, [0, 0, 0])).toMatchObject({ id: 90301 });
  });

  it('opens a conversation with the creature entry that says what the NPC says', async () => {
    const seen = await replay();
    // The same body the quest mark was for, and the entry whose greeting the
    // user's tables hold.
    expect(seen.conversation).toEqual({ networkId: seen.statuses![0]!.networkId, entry: 90701 });
  });

  it('reads what a picked conversation choice did, for the page and slot it was picked on', async () => {
    const seen = await replay();
    expect(seen.choiceResult).toEqual({
      networkId: seen.statuses![0]!.networkId,
      menuId: 90702,
      choice: 2,
      result: 'notEnoughMoney',
    });
  });

  it('reads a body with loot on it and what it holds', async () => {
    const seen = await replay();
    expect(seen.lootable).toBe('lootable');
    expect(seen.loot!.money).toBe(1234);
    expect(seen.loot!.items.map(row => [row.slot, row.entry, row.count])).toEqual([
      [0, 90001, 3],
      [1, 90002, 1],
    ]);
  });
});
