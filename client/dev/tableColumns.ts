/**
 * Writes `docs/formats/table-columns.md`: every column of every table the
 * layouts know, with its place in each build. Nothing here reads a pack; the
 * places follow from `tableLayouts.ts` and the words from
 * `tableColumnNotes.ts`, so the page cannot drift from what the client reads.
 */

import type { ColumnLayout, ColumnSpec, LayoutEdit } from '../src/assets/formats/columnLayout';
import { TABLE_LAYOUTS } from '../src/assets/formats/tableLayouts';
import { COLUMN_NOTES, UNREAD_TABLES } from './tableColumnNotes';

type AnyLayout = ColumnLayout<Record<string, ColumnSpec>>;

/** A reference column, or the `n`th column a build adds ahead of reference column `before`. */
interface ReferenceColumn {
  readonly ref: number;
}

interface AddedColumn {
  readonly before: number;
  readonly n: number;
}

/** A reference column, or the `n`th column a build adds ahead of reference column `before`. */
export type ColumnId = ReferenceColumn | AddedColumn;

const REFERENCE_BUILD = '1.1.4';

const isRef = (id: ColumnId): id is ReferenceColumn => 'ref' in id;

const sameColumn = (a: ColumnId, b: ColumnId): boolean =>
  isRef(a) ? isRef(b) && a.ref === b.ref : !isRef(b) && a.before === b.before && a.n === b.n;

/** Reference order, with a build's own columns ahead of the one they are added before. */
function order(a: ColumnId, b: ColumnId): number {
  const place = (id: ColumnId): [number, number] =>
    isRef(id) ? [id.ref, Infinity] : [id.before, id.n];
  const [a0, a1] = place(a);
  const [b0, b1] = place(b);
  return a0 - b0 || a1 - b1;
}

/** The columns a format holds, in file order, under a revision's edits. */
export function columnsUnder(referenceLength: number, edits: readonly LayoutEdit[]): ColumnId[] {
  let columns: ColumnId[] = Array.from({ length: referenceLength }, (_, ref) => ({ ref }));
  for (const edit of edits) {
    const count = edit.count ?? 1;
    if ('lacks' in edit) {
      columns = columns.filter(
        id => !isRef(id) || id.ref < edit.lacks || id.ref >= edit.lacks + count,
      );
      continue;
    }
    const added = Array.from({ length: count }, (_, n) => ({ before: edit.addsBefore, n }));
    const at = columns.findIndex(id => isRef(id) && id.ref >= edit.addsBefore);
    columns.splice(at < 0 ? columns.length : at, 0, ...added);
  }
  return columns;
}

export interface Variant {
  readonly builds: string;
  readonly format: string;
  readonly columns: readonly ColumnId[];
}

export function variantsOf(layout: AnyLayout): Variant[] {
  const length = layout.reference.length;
  return [
    { builds: REFERENCE_BUILD, format: layout.reference, columns: columnsUnder(length, []) },
    ...layout.revisions.map(revision => ({
      builds: revision.builds,
      format: revision.format,
      columns: columnsUnder(length, revision.edits ?? []),
    })),
  ];
}

/** A note's key: `12`, `28-45`, `113+0` or `47+2-16`. */
export function columnsOfKey(key: string): ColumnId[] {
  const added = /^(\d+)\+(\d+)(?:-(\d+))?$/.exec(key);
  if (added) {
    const [before, first, last] = [
      Number(added[1]),
      Number(added[2]),
      Number(added[3] ?? added[2]),
    ];
    return Array.from({ length: last - first + 1 }, (_, i) => ({ before, n: first + i }));
  }
  const plain = /^(\d+)(?:-(\d+))?$/.exec(key);
  if (!plain) throw new Error(`column note key ${JSON.stringify(key)} is not a column or a run`);
  const [first, last] = [Number(plain[1]), Number(plain[2] ?? plain[1])];
  return Array.from({ length: last - first + 1 }, (_, i) => ({ ref: first + i }));
}

interface Row {
  readonly ids: ColumnId[];
  /** The note the row is written under, or null. */
  readonly noteKey: string | null;
  readonly names: string[];
}

function namesAt(layout: AnyLayout, id: ColumnId): string[] {
  if (!isRef(id)) return [];
  return Object.entries(layout.columns)
    .filter(([, spec]) =>
      typeof spec.at === 'number' ? spec.at === id.ref : spec.at.includes(id.ref),
    )
    .map(([name]) => name);
}

function rowsOf(layout: AnyLayout, variants: readonly Variant[]): Row[] {
  const notes = COLUMN_NOTES[layout.table] ?? {};
  const all: ColumnId[] = [];
  for (const variant of variants) {
    for (const id of variant.columns) if (!all.some(seen => sameColumn(seen, id))) all.push(id);
  }
  all.sort(order);

  const noteOf = (id: ColumnId): string | null =>
    Object.keys(notes).find(key => columnsOfKey(key).some(noted => sameColumn(noted, id))) ?? null;
  const present = (id: ColumnId): string =>
    variants.map(v => (v.columns.some(held => sameColumn(held, id)) ? '1' : '0')).join('');

  const rows: Row[] = [];
  for (const id of all) {
    const noteKey = noteOf(id);
    const names = namesAt(layout, id);
    const last = rows.at(-1);
    const joins =
      last !== undefined &&
      last.noteKey === noteKey &&
      present(last.ids[0]!) === present(id) &&
      (noteKey !== null || names.join() === last.names.join());
    if (joins) {
      last.ids.push(id);
      for (const name of names) if (!last.names.includes(name)) last.names.push(name);
    } else {
      rows.push({ ids: [id], noteKey, names: [...names] });
    }
  }
  return rows;
}

function span(variant: Variant, ids: readonly ColumnId[]): string {
  const first = variant.columns.findIndex(held => sameColumn(held, ids[0]!));
  if (first < 0) return '';
  return ids.length === 1 ? String(first) : `${first}-${first + ids.length - 1}`;
}

function letters(variants: readonly Variant[], ids: readonly ColumnId[]): string {
  const seen: string[] = [];
  for (const variant of variants) {
    for (const id of ids) {
      const at = variant.columns.findIndex(held => sameColumn(held, id));
      const letter = at < 0 ? undefined : variant.format[at];
      if (letter !== undefined && !seen.includes(letter)) seen.push(letter);
    }
  }
  return seen.join(' ');
}

function section(layout: AnyLayout): string {
  const variants = variantsOf(layout);
  const notes = COLUMN_NOTES[layout.table] ?? {};
  const lines = [
    `## \`${layout.table}\``,
    '',
    variants.map(v => `${v.builds}: ${v.format.length} columns`).join('; ') + '.',
    '',
    `| ${variants.map(v => v.builds).join(' | ')} | Type | Read as | Holds |`,
    `| ${variants.map(() => '---').join(' | ')} | --- | --- | --- |`,
  ];
  for (const row of rowsOf(layout, variants)) {
    const names = row.names.map(name => `\`${name}\``).join(', ');
    lines.push(
      `| ${variants.map(v => span(v, row.ids)).join(' | ')} | ${letters(variants, row.ids)} | ${names} | ${row.noteKey === null ? '' : notes[row.noteKey]} |`,
    );
  }
  return lines.join('\n');
}

export function allLayouts(): AnyLayout[] {
  return [...(Object.values(TABLE_LAYOUTS) as AnyLayout[]), ...UNREAD_TABLES].sort((a, b) =>
    a.table.toLowerCase().localeCompare(b.table.toLowerCase()),
  );
}

const PREAMBLE = `# Table columns, build by build

Generated from \`client/src/assets/formats/tableLayouts.ts\` and
\`client/dev/tableColumnNotes.ts\`; do not edit by hand. To write it again:

\`\`\`bash
UPDATE_DOCS=1 npx vitest run test/tableColumnsDoc.test.ts
\`\`\`

One section per table, one row per column or run of columns. The leading
cells give the column's number in each build's own format; an empty cell
means that build does not have it. A build no heading names has the
${REFERENCE_BUILD} arrangement. **Type** is the format letter
(\`ftable.md\`). **Read as** is the name the client reads the column under,
and is empty for a column it does not read. **Holds** says what the rows
show; "not settled" marks a column whose values are described but whose
meaning is not known. A row with neither is a column nobody has looked at,
or one that is empty in every build on hand.`;

export function renderTableColumns(): string {
  return [PREAMBLE, ...allLayouts().map(section)].join('\n\n') + '\n';
}
