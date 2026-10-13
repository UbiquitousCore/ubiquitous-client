import { describe, expect, it } from 'vitest';

import { VOICE_RULES, VoiceGate } from '../src/gameplay/voiceGate';

describe('VoiceGate', () => {
  it('takes a limited line only as often as its chance allows', () => {
    const rule = VOICE_RULES.attack!;
    expect(new VoiceGate(() => rule.chance - 0.01).allows(1, 'attack', 0)).toBe(true);
    expect(new VoiceGate(() => rule.chance).allows(1, 'attack', 0)).toBe(false);
  });

  it('keeps one body quiet on one kind of line for a while, but not others', () => {
    const gate = new VoiceGate(() => 0);
    const quiet = VOICE_RULES.hurt!.quietS;
    expect(gate.allows(1, 'hurt', 0)).toBe(true);
    expect(gate.allows(1, 'hurt', quiet - 0.1)).toBe(false);
    expect(gate.allows(1, 'attack', quiet - 0.1)).toBe(true);
    expect(gate.allows(2, 'hurt', quiet - 0.1)).toBe(true);
    expect(gate.allows(1, 'hurt', quiet)).toBe(true);
  });

  it('never limits the lines it has no rule for', () => {
    const gate = new VoiceGate(() => 0.999);
    expect(gate.allows(1, 'dead', 0)).toBe(true);
    expect(gate.allows(1, 'dead', 0)).toBe(true);
    expect(gate.allows(1, 'jump', 0)).toBe(true);
  });

  it('forgets a body that has gone', () => {
    const gate = new VoiceGate(() => 0);
    gate.allows(1, 'idle', 0);
    gate.forget(1);
    expect(gate.allows(1, 'idle', 1)).toBe(true);
  });
});

describe('a sure voice', () => {
  it('skips the chance but keeps the quiet spell', () => {
    const gate = new VoiceGate(() => 0.999);
    expect(gate.allows(1, 'hurt', 0, true)).toBe(true);
    expect(gate.allows(1, 'hurt', 1, true)).toBe(false);
    expect(gate.allows(2, 'hurt', 0)).toBe(false);
  });
});
