/**
 * A screen's captions, read from the build by the spec's numbers. A field's
 * authored text ("asdasd") is never used as a fallback: gibberish is worse
 * than a blank.
 */

import type { JSX } from 'preact';

import type { ScreenSpec } from './uiSpec';
import type { Worn } from './useWorn';

export interface WornCaptionsProps {
  worn: Worn;
  spec: ScreenSpec;
  /** What captions are drawn in where the field names no colour. */
  tone?: string;
  /** A styling for one caption, by the part it is written on. */
  styleOf?(where: string): JSX.CSSProperties | undefined;
  /** Captions to leave out; a hidden part takes every caption inside it. */
  hidden?: readonly string[];
}

export function WornCaptions({
  worn,
  spec,
  tone,
  styleOf,
  hidden,
}: WornCaptionsProps): JSX.Element {
  return (
    <>
      {Object.entries(spec.captions ?? {}).map(([where, what]) => {
        const left = hidden?.some(entry => where === entry || where.startsWith(`${entry}/`));
        if (!what || left) return null;
        const part = worn.fieldOf(worn.find(where));
        if (!part) return null;
        return (
          <span key={`caption.${where}`} style={{ ...worn.words(part, tone), ...styleOf?.(where) }}>
            {what}
          </span>
        );
      })}
    </>
  );
}
