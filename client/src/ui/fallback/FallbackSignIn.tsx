/**
 * Signing in without the build's own panel: a plain account form standing
 * where the worn screen would. Used only when the mounted build has no
 * sign-in panel of its own; marked so it is never mistaken for the game's
 * own art. Hands the game exactly what the worn screen would.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { busy, frontEndActions, say } from '../frontend/frontEndStore';
import { rememberAccount, rememberedAccount } from '../frontend/rememberedAccount';

export function FallbackSignIn(): JSX.Element {
  const [account, setAccount] = useState(() => rememberedAccount() ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => rememberedAccount() !== null);
  const working = busy.value;

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

  const onKey = (event: JSX.TargetedKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') submit();
  };

  return (
    <form
      data-fallback
      data-screen="sign-in"
      className="flex w-full max-w-80 flex-col gap-2 rounded border border-parchment-700 bg-ink-900/90 p-4"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="m-0 text-center text-tiny text-ink-400">
        This build carries no sign-in panel, so a plain one stands in.
      </p>
      <label className="flex flex-col gap-1 text-tiny">
        Account
        <input
          aria-label="Account"
          className="bg-ink-950 rounded border border-parchment-700 px-2 py-1"
          value={account}
          disabled={working}
          onInput={event => setAccount(event.currentTarget.value)}
          onKeyDown={onKey}
        />
      </label>
      <label className="flex flex-col gap-1 text-tiny">
        Password
        <input
          aria-label="Password"
          type="password"
          className="bg-ink-950 rounded border border-parchment-700 px-2 py-1"
          value={password}
          disabled={working}
          onInput={event => setPassword(event.currentTarget.value)}
          onKeyDown={onKey}
        />
      </label>
      <label className="flex items-center gap-2 text-tiny">
        <input
          aria-label="Remember account"
          type="checkbox"
          checked={remember}
          disabled={working}
          onChange={event => setRemember(event.currentTarget.checked)}
        />
        Remember account
      </label>
      <button
        type="submit"
        className="rounded border border-parchment-700 px-2 py-1"
        disabled={working}
      >
        {working ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
