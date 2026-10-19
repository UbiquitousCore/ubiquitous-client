import type { JSX } from 'preact';

/** Why the server refused, in red across the top of the screen it was refused on. */
export function MailRefusal({ text }: { text: string }): JSX.Element {
  return (
    <p
      role="alert"
      data-mail-refusal
      className="absolute inset-x-0 top-0 m-0 bg-parchment-100 px-2 py-1 text-center text-tiny text-ink-danger"
    >
      {text}
    </p>
  );
}
