/** The inspect panel: the target's worn equipment from the copy `Game` keeps, no round trip. */

import { signal } from '@preact/signals';

export interface Inspecting {
  unitId: string;
  name: string;
  /** Item entry ids by worn slot, 0 meaning empty — the same shape the
   * character sheet's own equipment array already carries. */
  equipment: number[];
  /** Their class, counted from one, where it is known. */
  classId?: number;
  /** Their gender, where their body was described with one. */
  gender?: number;
}

export const inspecting = signal<Inspecting | null>(null);

export function openInspect(next: Inspecting): void {
  inspecting.value = next;
}

export function closeInspect(): void {
  inspecting.value = null;
}

export interface InspectActions {
  /** Open the panel for the HUD's current target. */
  openTarget(): void;
}

const NOTHING: InspectActions = {
  openTarget: () => {},
};

let actions: InspectActions = NOTHING;

export function setInspectActions(next: InspectActions): void {
  actions = next;
}

export function inspectActions(): InspectActions {
  return actions;
}
