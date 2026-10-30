/** The chat in shipped controls: a chevron when shut, the log when open, a typing line when pressed again. */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { WornPiece } from '../art/WornPiece';
import { ArtChatPeek } from './ArtChatPeek';
import type { PieceSpec, ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { CHANNEL_TEXT, channelColour } from '../chatTones';
import { wornLettering } from '../art/wornFont';
import {
  CHANNELS,
  channelTag,
  EMOTES,
  WHISPER_CHANNEL,
  chatAsking,
  chatChannel,
  chatDraft,
  chatLastSaid,
  chatLines,
  chatOpen,
  shutChatAfterSaying,
  chatTyping,
  chatWhisperTarget,
  emote,
  say,
  stopWhispering,
  whisper,
} from '../chatStore';
import type { ChannelId } from '../chatStore';

/** Our name for this screen. The spec says which dialog wears it. */
export const CHAT_SCREEN = 'chat';
/** And for the line the player types into, which is another piece. */
export const CHAT_SAY_SCREEN = 'chatSay';

/** The panel's depth cap, about a third of the screen as the build keeps it. */
const DEEPEST = '38vh';

/** How big the controls above it are, between two sensible ends. */
const CONTROL = 'clamp(2.5rem, 8vh, 4.5rem)';

const HIT =
  'pointer-events-auto cursor-pointer border-0 bg-transparent p-0 ' +
  'active:brightness-125 focus-visible:outline-2 focus-visible:outline-brass-300';

/** Null where there is no movie to wear, which is the built panel's cue. */
export function ArtChatBar(): JSX.Element | null {
  const spec = useWornScreen(CHAT_SCREEN);
  return spec ? <Worn spec={spec} /> : null;
}

/** One part of the movie, drawn on its own where the spec names it. */
function Piece({
  spec,
  of,
  screen,
  box,
}: {
  spec: ScreenSpec;
  of: string;
  screen: string;
  /** Where it goes. Left out, it stands at the size the movie drew it. */
  box?: JSX.CSSProperties;
}): JSX.Element | null {
  const piece: PieceSpec | undefined = spec.pieces?.[of];
  if (!piece) return null;
  return (
    <WornPiece
      dialog={piece.dialog ?? screen}
      part={piece.part}
      without={piece.without}
      box={box}
    />
  );
}

/** What a control offers, by our own name for each choice and its word. */
function offered(
  which: 'channel' | 'emote' | 'more',
  spec: ScreenSpec,
): Array<{ id: string; name: string }> {
  if (which === 'channel') {
    return CHANNELS.map(one => ({ id: one.id, name: spec.calls?.[one.id] ?? one.name }));
  }
  if (which === 'emote') return EMOTES.map(one => ({ id: one, name: one }));
  // The build keeps three things behind this control. This client reaches
  // whispering from a target's own plus-menu instead, so this offers only
  // the last thing said again.
  return [{ id: 'again', name: spec.words?.again ?? 'Again' }];
}

function Worn({ spec }: { spec: ScreenSpec }): JSX.Element {
  return (
    <>
      {/* A press anywhere else puts the log away, which is what the
          build does. Only while it is open: shut, the world below has
          every press to itself. */}
      {chatOpen.value ? (
        <button
          type="button"
          aria-label="Hide chat"
          tabIndex={-1}
          onClick={() => {
            chatOpen.value = false;
            chatAsking.value = false;
            stopWhispering();
          }}
          className="pointer-events-auto fixed inset-0 z-window cursor-default border-0 bg-transparent p-0"
        />
      ) : null}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-window">
        {chatOpen.value ? (
          <OpenBar spec={spec} />
        ) : (
          <div className="relative flex justify-center pb-1">
            {/* Over the chevron, standing on it, so coming and going it
                moves nothing else. */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2">
              <ArtChatPeek tones={spec.tones} />
            </div>
            <Chevron spec={spec} />
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The control that shows the log and hides it again.
 *
 * Shut it points up and stands on its own in the middle of the bottom
 * edge; open it points down and sits on the panel it closes.
 */
function Chevron({ spec }: { spec: ScreenSpec }): JSX.Element {
  const open = chatOpen.value;
  return (
    <button
      type="button"
      aria-label={open ? 'Hide chat' : 'Show chat'}
      aria-expanded={open}
      onClick={() => {
        chatOpen.value = !open;
        if (open) {
          chatAsking.value = false;
          stopWhispering();
        }
      }}
      className={`${HIT} ${open ? 'rotate-180' : ''}`}
    >
      <Piece spec={spec} of="show" screen={spec.dialog} box={{ height: CONTROL, width: 'auto' }} />
    </button>
  );
}

function OpenBar({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const lines = chatLines.value;
  const channel = chatChannel.value;
  const asking = chatAsking.value;
  const [offering, setOffering] = useState<'none' | 'channel' | 'emote' | 'more'>('none');
  const log = useRef<HTMLDivElement>(null);

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [] },
    { unplaced: true },
  );

  // The newest line is the one worth seeing, so the log sits at the
  // bottom of itself unless somebody has scrolled back.
  useEffect(() => {
    const rail = log.current;
    if (!rail) return;
    const back = rail.scrollHeight - rail.clientHeight - rail.scrollTop;
    if (back < 40) rail.scrollTop = rail.scrollHeight;
  }, [lines.length, asking]);

  if (!worn.image || !worn.frame) return null;

  const body = worn.fieldOf(worn.find(spec.values?.body));
  const dismiss = worn.find(spec.close);
  const tone = (of: string): string =>
    spec.tones?.[of] ?? (of in CHANNEL_TEXT ? channelColour(of) : LIGHT);
  const called = (of: string): string => spec.calls?.[of] ?? of;

  return (
    <div className="relative flex flex-col items-stretch">
      {/* Above the panel: the channel at one
          end, the emotes at the other, and the control that offers the
          rest beside the channel. */}
      <div className="relative flex items-end justify-between px-6">
        <div className="flex items-end">
          <Labelled
            spec={spec}
            of="channel"
            label={called(channel)}
            tone={tone(channel)}
            expanded={offering === 'channel'}
            onPress={() => setOffering(was => (was === 'channel' ? 'none' : 'channel'))}
          />
          <Labelled
            spec={spec}
            of="more"
            label={spec.words?.more ?? ''}
            tone={LIGHT}
            expanded={offering === 'more'}
            onPress={() => setOffering(was => (was === 'more' ? 'none' : 'more'))}
          />
          {/* Beside the channel once the panel is up. */}
          <Chevron spec={spec} />
        </div>
        <Labelled
          spec={spec}
          of="emote"
          label={called('emote')}
          tone={tone('emote')}
          expanded={offering === 'emote'}
          onPress={() => setOffering(was => (was === 'emote' ? 'none' : 'emote'))}
        />
      </div>

      {/* What a control offers, in the same round buttons the control
          itself wears — a choice should look like the thing it is a
          choice of. Over the panel rather than under it: the panel is
          against the bottom edge and there is nowhere below it to go. */}
      {offering !== 'none' ? (
        <div
          className={
            'pointer-events-auto absolute bottom-full flex max-w-full flex-wrap items-end gap-1 px-3 pb-1 ' +
            // Under the control that opened it, which is at one end of
            // the strip or the other.
            (offering === 'emote' ? 'right-0 justify-end' : 'left-0')
          }
        >
          {offered(offering, spec).map(one => (
            <Labelled
              key={one.id}
              spec={spec}
              of={offering}
              label={one.name}
              tone={offering === 'channel' ? tone(one.id) : LIGHT}
              onPress={() => {
                if (offering === 'channel') chatChannel.value = one.id as ChannelId;
                else if (offering === 'emote') emote(one.id);
                else chatDraft.value = chatLastSaid.peek();
                setOffering('none');
              }}
            />
          ))}
        </div>
      ) : null}

      {/* The panel itself, right across the view. Pressing it is what
          brings up the line to type into — opening the log and asking to
          say something are two presses, not one. */}
      <div className="relative">
        <button
          type="button"
          aria-label="Say something"
          aria-expanded={asking}
          onClick={() => (chatAsking.value = true)}
          className="pointer-events-auto relative block w-full cursor-pointer border-0 bg-transparent p-0 text-left select-text focus-visible:outline-2 focus-visible:outline-brass-300"
          style={{ aspectRatio: `${worn.frame.w} / ${worn.frame.h}`, maxHeight: DEEPEST }}
        >
          <img
            ref={worn.pictureRef}
            src={worn.image.url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            draggable={false}
          />
          {body ? (
            <div
              ref={log}
              role="log"
              aria-label="Chat"
              className="absolute"
              // The placed-words style clips its text and lets the pointer
              // through; the log has to scroll and take the wheel.
              style={{
                ...worn.words(body, LIGHT, true),
                display: 'block',
                overflowY: 'auto',
                pointerEvents: 'auto',
              }}
            >
              {lines.map(line => (
                <p key={line.key} className="m-0" style={{ color: tone(line.channel) }}>
                  {channelTag(line.channel)}
                  {line.sender ? `[${line.sender}]: ` : ''}
                  {line.text}
                </p>
              ))}
            </div>
          ) : null}
        </button>

        {/* The build draws this one on the panel itself, at the right,
            and all this has to do is take the press. Beside the panel
            rather than inside it: one control cannot sit within another. */}
        {dismiss ? (
          <button
            type="button"
            aria-label="Hide chat"
            onClick={() => {
              chatOpen.value = false;
              chatAsking.value = false;
              stopWhispering();
            }}
            style={worn.box(dismiss)}
            className={HIT}
          />
        ) : null}
      </div>

      {asking ? <ArtChatSay /> : null}
    </div>
  );
}

/** A round control with a word written across it. */
function Labelled({
  spec,
  of,
  label,
  tone,
  expanded,
  onPress,
}: {
  spec: ScreenSpec;
  of: string;
  label: string;
  tone: string;
  /** Left out for a control that opens nothing — a choice, not a menu. */
  expanded?: boolean;
  onPress(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onPress}
      className={`${HIT} relative`}
    >
      <Piece spec={spec} of={of} screen={spec.dialog} box={{ width: CONTROL, height: CONTROL }} />
      <span
        className="absolute inset-1 flex items-center justify-center text-center text-tiny break-words"
        style={{ fontFamily: wornLettering(), color: tone }}
      >
        {label}
      </span>
    </button>
  );
}

/** The typing line, written in its channel's colour with the channel named beside it. */
function ArtChatSay(): JSX.Element {
  const channel = chatChannel.value;
  const typed = chatDraft.value;
  const target = chatWhisperTarget.value;
  const spec = useWornScreen(CHAT_SAY_SCREEN);
  const box = useRef<HTMLInputElement>(null);

  // Up with the keyboard: the press that asked for this box asked to
  // type in it, not to look at it.
  useEffect(() => box.current?.focus(), []);

  // Addressed at one player, the box says so instead of naming the
  // channel — a whisper does not go out on `chatChannel` at all.
  const called = target ? `To ${target.name}` : (spec?.calls?.[channel] ?? channel);
  const tone = target
    ? (spec?.tones?.[WHISPER_CHANNEL] ?? channelColour(WHISPER_CHANNEL))
    : (spec?.tones?.[channel] ?? channelColour(channel));

  return (
    <form
      className="pointer-events-auto flex w-full items-center gap-2 bg-chrome-950/90 px-2 py-1"
      onSubmit={event => {
        event.preventDefault();
        if (target) whisper(target.id, typed);
        else say(typed);
        chatDraft.value = '';
        shutChatAfterSaying();
      }}
    >
      <span
        className="shrink-0 text-sm"
        style={{ fontFamily: wornLettering(), color: tone }}
      >{`${called}:`}</span>
      <input
        ref={box}
        aria-label={target ? `Whisper to ${target.name}` : 'Say something'}
        value={typed}
        maxLength={255}
        onInput={event => (chatDraft.value = (event.currentTarget as HTMLInputElement).value)}
        // While the box has the keyboard, the game must not take the
        // keys as movement — that is what this says, and the game asks
        // it rather than guessing from what is focused.
        onFocus={() => (chatTyping.value = true)}
        onBlur={() => (chatTyping.value = false)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            chatAsking.value = false;
            stopWhispering();
          }
        }}
        className="min-w-0 flex-1 cursor-text border border-brass-600 bg-chrome-950 px-2 py-1 text-sm outline-none focus-visible:outline-2 focus-visible:outline-brass-300"
        style={{ fontFamily: wornLettering(), color: tone, caretColor: tone }}
      />
    </form>
  );
}
