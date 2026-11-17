import {
  type ColumnLayout,
  type ColumnSpec,
  resolveLayout,
} from '../../src/assets/formats/columnLayout';
import { TABLE_LAYOUTS, type TableColumns } from '../../src/assets/formats/tableLayouts';

/** Every table's columns at their reference places, for a stand-in `WorldTables`. */
export function referenceColumns(): TableColumns {
  const found: Record<string, unknown> = {};
  for (const [key, layout] of Object.entries(TABLE_LAYOUTS)) {
    found[key] = resolveLayout(
      layout as ColumnLayout<Record<string, ColumnSpec>>,
      layout.reference,
    ).columns;
  }
  return found as TableColumns;
}
