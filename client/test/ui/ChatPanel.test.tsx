/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatPanel } from '../../src/ui/components/ChatPanel';
import {
  beginWhisper,
  chatWhisperTarget,
  clearChat,
  setChatSink,
  setWhisperSink,
} from '../../src/ui/chatStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { clearMovies } from '../helpers/stores';

// No shipped screen in hand in this file, so `ChatPanel` renders its own
// fallback panel — the one built and tested here — rather than `ArtChatBar`.
beforeEach(() => {
  uiSpec.value = null;
  clearMovies();
  clearChat();
});

afterEach(cleanup);

describe('ChatPanel, addressed at one player', () => {
  it('shows who it is addressed to instead of the channel picker', () => {
    beginWhisper('mob-1', 'Rock Elemental');
    const { getByText, queryByLabelText } = render(<ChatPanel />);

    expect(getByText('To Rock Elemental')).toBeTruthy();
    expect(queryByLabelText('Channel')).toBeNull();
    expect(queryByLabelText('Whisper to Rock Elemental')).toBeTruthy();
  });

  it('sends what was typed to that player, not the open channel', () => {
    beginWhisper('mob-1', 'Rock Elemental');
    const whispered: Array<[string, string]> = [];
    const said: Array<[string, string]> = [];
    setWhisperSink((targetId, text) => whispered.push([targetId, text]));
    setChatSink((channel, text) => said.push([channel, text]));
    const { getByLabelText } = render(<ChatPanel />);

    fireEvent.input(getByLabelText('Whisper to Rock Elemental'), {
      target: { value: 'hello there' },
    });
    fireEvent.submit(getByLabelText('Whisper to Rock Elemental').closest('form')!);

    expect(whispered).toEqual([['mob-1', 'hello there']]);
    expect(said).toEqual([]);
  });

  it('stops addressing the box once the whisper is sent', () => {
    beginWhisper('mob-1', 'Rock Elemental');
    setWhisperSink(() => {});
    const { getByLabelText } = render(<ChatPanel />);

    fireEvent.input(getByLabelText('Whisper to Rock Elemental'), { target: { value: 'hi' } });
    fireEvent.submit(getByLabelText('Whisper to Rock Elemental').closest('form')!);

    expect(chatWhisperTarget.value).toBeNull();
  });

  it('can be cancelled from its own close control, without sending anything', () => {
    beginWhisper('mob-1', 'Rock Elemental');
    const whispered: string[] = [];
    setWhisperSink((_targetId, text) => whispered.push(text));
    const { getByLabelText } = render(<ChatPanel />);

    fireEvent.click(getByLabelText('Cancel whisper'));

    expect(chatWhisperTarget.value).toBeNull();
    expect(whispered).toEqual([]);
  });
});
