/** Sign-in on the build's panel: real inputs over its fields, a hit area over its button; the built screen without a spec. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { ArtAbout } from './ArtAbout';
import { WornField, WornHit, WornPanel, useHeld } from './wornBits';
import { busy, frontEndActions, say } from './frontEndStore';
import { rememberAccount, rememberedAccount } from './rememberedAccount';

/** Our own name for this screen. The spec says which piece of the movie wears it. */
export const SIGN_IN_SCREEN = 'signIn';

/** What each of the two fields holds, in our own words for them. */
const ACCOUNT = 'account';
const PASSWORD = 'password';

export function ArtSignIn(): JSX.Element | null {
  const spec = useWornScreen(SIGN_IN_SCREEN);
  return spec ? <Worn spec={spec} /> : null;
}

function Worn({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const { hold, faces } = useHeld();
  const [remember, setRemember] = useState(() => rememberedAccount() !== null);
  /** The cross is only there while remembering is on. */
  const tick = remember ? [] : [spec.panels?.remembered ?? ''].filter(Boolean);
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: [...(spec.hidden ?? []), ...tick], frames: faces },
    { movie: spec.movie },
  );
  const [account, setAccount] = useState(() => rememberedAccount() ?? '');
  const [about, setAbout] = useState(false);
  const [password, setPassword] = useState('');
  const working = busy.value;

  if (!worn.image || !worn.frame) return null;

  const submit = (): void => {
    if (working) return;
    if (account === '') {
      say('An account name is needed.');
      return;
    }
    // Sent exactly as typed. How a credential is formed is the server's
    // business, and transforming it here would be inventing a scheme.
    rememberAccount(account, remember);
    void frontEndActions().signIn(account, password);
  };

  /** The control a field is typed into, by what that field holds. */
  const typedInto = (holds: string): string | undefined =>
    Object.entries(spec.edits ?? {}).find(([, edit]) => edit.holds === holds)?.[0];

  /** Where a field's words go, which is where the typing goes too. */
  const fieldAt = (holds: string) => {
    const control = typedInto(holds);
    return {
      part: worn.fieldOf(worn.find(spec.values?.[holds])) ?? worn.find(control),
      limit: control ? spec.edits?.[control]?.max : undefined,
    };
  };

  return (
    <WornPanel worn={worn} name="sign-in">
      {/* The words the panel is labelled with. Theirs, by number. */}
      <WornCaptions worn={worn} spec={spec} tone={INK} />

      <WornField
        worn={worn}
        {...fieldAt(ACCOUNT)}
        label={spec.captions?.textAccount ?? 'Account'}
        value={account}
        disabled={working}
        onChange={setAccount}
        onDone={submit}
      />
      <WornField
        worn={worn}
        {...fieldAt(PASSWORD)}
        label={spec.captions?.textPassword ?? 'Password'}
        secret
        value={password}
        disabled={working}
        onChange={setPassword}
        onDone={submit}
      />

      {/* What this client is, where the build says what it is. */}
      {Object.entries(spec.actions ?? {})
        .filter(([, what]) => what === 'about')
        .map(([where]) => (
          <WornHit
            key={where}
            worn={worn}
            part={worn.find(where)}
            label="About this client"
            onHold={hold(where)}
            onPress={() => setAbout(true)}
          />
        ))}
      {about && <ArtAbout onClose={() => setAbout(false)} />}

      {/* Whether the account name is kept for next time. */}
      {Object.entries(spec.actions ?? {})
        .filter(([, what]) => what === 'remember')
        .map(([where]) => (
          <WornHit
            key={where}
            worn={worn}
            part={worn.find(where)}
            label={spec.captions?.textRemember ?? 'Remember me'}
            pressed={remember}
            disabled={working}
            onPress={() => {
              const next = !remember;
              setRemember(next);
              if (!next) rememberAccount('', false);
            }}
          />
        ))}

      {/* Whatever the spec says signs in. Nothing here names a control. */}
      {Object.entries(spec.actions ?? {})
        .filter(([, what]) => what === 'signIn')
        .map(([where]) => {
          const part = worn.find(where);
          return (
            <WornHit
              key={where}
              worn={worn}
              part={part}
              label={spec.captions?.textLogin ?? 'Sign in'}
              disabled={working}
              onHold={hold(where)}
              onPress={submit}
            />
          );
        })}
    </WornPanel>
  );
}
