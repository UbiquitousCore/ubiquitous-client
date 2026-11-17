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

export interface LayoutRevision {
  /** The builds that ship this format, as a reader would say them: `'1.0.0 to 1.0.3'`. */
  readonly builds: string;
  readonly format: string;
  readonly edits?: readonly LayoutEdit[];
}

export interface ColumnLayout<C extends Record<string, ColumnSpec>> {
  readonly table: string;
  readonly reference: string;
  readonly columns: C;
  readonly revisions: readonly LayoutRevision[];
  /**
   * Where a format no revision names holds some columns, found by their shape
   * (a run of strings, a pair side by side): a build not yet measured still
   * loads where its neighbouring columns give the place away.
   */
  readonly byShape?: (format: string) => { readonly [K in keyof C]?: number | readonly number[] };
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
  revisions: readonly LayoutRevision[] = [],
  byShape?: ColumnLayout<C>['byShape'],
): ColumnLayout<C> {
  return { table, reference, columns, revisions, ...(byShape ? { byShape } : {}) };
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
  const known: Pick<LayoutRevision, 'format' | 'edits'>[] = [
    { format: layout.reference },
    ...layout.revisions,
  ];
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
        : `${layout.table}: format ${JSON.stringify(format)} matches no known layout; columns are read by their shape where the layout says how, else where the reference has them`,
    );
  }

  const shaped: { readonly [name: string]: number | readonly number[] | undefined } =
    !exact && !extended && layout.byShape ? layout.byShape(format) : {};
  const out: Record<string, number | readonly number[]> = {};
  for (const [name, declared] of Object.entries(layout.columns)) {
    const found = shaped[name];
    const places =
      found !== undefined
        ? typeof found === 'number'
          ? [found]
          : [...found]
        : (typeof declared.at === 'number' ? [declared.at] : declared.at).map(at =>
            locate(revision.edits ?? [], at),
          );
    const problem = places
      .map(place => mismatch(format, place, declared.types))
      .find(p => p !== null);
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
