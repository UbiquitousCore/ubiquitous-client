/** Join class names, dropping falsy ones (multi-line templates leak whitespace into `class`). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
