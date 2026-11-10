/**
 * A table's columns by name. The files carry no column names, only one
 * format letter per column, and columns move between builds: so a layout
 * names each column at its place in a reference format, and says for every
 * other known format which reference columns it lacks and where it adds
 * columns of its own.
 */

/** One column, or a run of columns read together, at its reference place. */
export interface ColumnSpec {
  readonly at: number | readonly number[];
  /** The format letters the column may hold. */
  readonly types: string;
  /** A table without this column cannot be read at all. */
  readonly required: boolean;
}

export const must = (at: number, types: string): ColumnSpec & { at: number } => ({
  at,
  types,
  required: true,
});

export const may = (at: number, types: string): ColumnSpec & { at: number } => ({
  at,
  types,
  required: false,
});

export const run = (
  at: readonly number[],
  types: string,
): ColumnSpec & { at: readonly number[] } => ({ at, types, required: false });

/** How a format differs from the reference, in reference column numbers. */
export type LayoutEdit =
  | { readonly lacks: number; readonly count?: number }
  | { readonly addsBefore: number; readonly count?: number };

export interface LayoutRevision<C> {
  readonly format: string;
  readonly edits?: readonly LayoutEdit[];
  /** Columns this format holds differently, placed in its own column numbers. */
  readonly own?: { readonly [K in keyof C]?: ColumnSpec };
}

export interface ColumnLayout<C extends Record<string, ColumnSpec>> {
  readonly table: string;
  readonly reference: string;
  readonly columns: C;
  readonly revisions: readonly LayoutRevision<C>[];
}

/** Where each named column sits in the format read: -1 when absent, a run empty. */
export type Resolved<C extends Record<string, ColumnSpec>> = {
  readonly [K in keyof C]: C[K]['at'] extends number ? number : readonly number[];
};

export interface ResolvedLayout<C extends Record<string, ColumnSpec>> {
  readonly columns: Resolved<C>;
  /** Whether the format is one the layout was measured against. */
  readonly known: boolean;
  /** One line per column left unread, and why. */
  readonly notes: readonly string[];
}

export class LayoutError extends Error {}

export function defineLayout<C extends Record<string, ColumnSpec>>(
  table: string,
  reference: string,
  columns: C,
  revisions: readonly LayoutRevision<C>[] = [],
): ColumnLayout<C> {
  return { table, reference, columns, revisions };
}

/** Where a reference column sits under a revision's edits, or -1. */
export function locate(edits: readonly LayoutEdit[], referenceIndex: number): number {
  let at = referenceIndex;
  for (const edit of edits) {
    const count = edit.count ?? 1;
    if ('lacks' in edit) {
      if (referenceIndex >= edit.lacks + count) at -= count;
      else if (referenceIndex >= edit.lacks) return -1;
    } else if (referenceIndex >= edit.addsBefore) {
      at += count;
    }
  }
  return at;
}

function mismatch(format: string, place: number, types: string): string | null {
  if (place < 0) return 'is not in this layout';
  if (place >= format.length) return `would sit at ${place}, past the last column`;
  const got = format[place]!;
  return types.includes(got) ? null : `is '${got}' at ${place}, not one of "${types}"`;
}

/**
 * The layout's columns in `format`. A known format is read as measured; one
 * that only extends a known format keeps that format's places; any other
 * keeps each column whose type still agrees at its reference place.
 */
export function resolveLayout<C extends Record<string, ColumnSpec>>(
  layout: ColumnLayout<C>,
  format: string,
): ResolvedLayout<C> {
  const known: LayoutRevision<C>[] = [{ format: layout.reference }, ...layout.revisions];
  const exact = known.find(revision => revision.format === format);
  const extended = known
    .filter(revision => format.startsWith(revision.format))
    .sort((a, b) => b.format.length - a.format.length)[0];
  const revision = exact ?? extended ?? known[0]!;
  const notes: string[] = [];
  if (!exact) {
    notes.push(
      extended
        ? `${layout.table}: ${format.length - extended.format.length} column(s) past the known layout are not read`
        : `${layout.table}: format ${JSON.stringify(format)} matches no known layout; columns are read where the reference has them`,
    );
  }

  const out: Record<string, number | readonly number[]> = {};
  for (const [name, declared] of Object.entries(layout.columns)) {
    const held = revision.own?.[name];
    const spec = held ?? declared;
    const wanted = typeof spec.at === 'number' ? [spec.at] : spec.at;
    const places = held ? [...wanted] : wanted.map(at => locate(revision.edits ?? [], at));
    const problem = places.map(place => mismatch(format, place, spec.types)).find(p => p !== null);
    const single = typeof declared.at === 'number';
    if (!problem) {
      out[name] = single ? places[0]! : places;
      continue;
    }
    if (declared.required) {
      throw new LayoutError(
        `${layout.table}: required column '${name}' ${problem} (format ${JSON.stringify(format)})`,
      );
    }
    out[name] = single ? -1 : [];
    notes.push(`${layout.table}: column '${name}' ${problem}; left unread`);
  }
  return { columns: out as Resolved<C>, known: exact !== undefined, notes };
}
