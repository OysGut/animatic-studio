import type { ProjectState } from '../../model';
import { isUuid } from '../../ids';
import { t } from '../../i18n/keyed';
import { measureSetError, type MeasureSet } from './index';
export interface StoredMeasureSet extends MeasureSet { readonly revision: number; readonly removed: boolean }
export type MeasureSetCommand =
  | { type: 'SaveMeasureSet'; set: MeasureSet }
  | { type: 'SetMeasureSetRemoved'; id: string; removed: boolean }
  | { type: 'RestoreMeasureSet'; id: string; set: StoredMeasureSet | null };
export function applyMeasureSetCommand(s: ProjectState, c: MeasureSetCommand) {
  const id = c.type === 'SaveMeasureSet' ? c.set.id : c.id;
  const old = s.measureSets?.[id] ?? null;
  const invalid = () => { throw new Error(t('app-inspect.invalid')); };
  if (!isUuid(id)) invalid();
  let next: StoredMeasureSet;
  if (c.type === 'SaveMeasureSet') {
    const layer = s.layers[c.set.layerId];
    if (measureSetError(c.set) || !layer || layer.removed || c.set.name.length > 80 || (old && old.layerId !== c.set.layerId)) invalid();
    next = { ...structuredClone(c.set), name: c.set.name.trim(), revision: (old?.revision ?? 0) + 1, removed: false };
  } else if (c.type === 'SetMeasureSetRemoved') {
    if (!old) return invalid();
    next = { ...old, removed: c.removed, revision: old.revision + 1 };
  } else {
    if (!c.set && !old) return invalid();
    next = { ...(c.set ?? old!), removed: c.set?.removed ?? true, revision: (old?.revision ?? 0) + 1 };
  }
  return { state: { ...s, measureSets: { ...s.measureSets, [id]: next } }, inverse: { type: 'RestoreMeasureSet', id, set: old } as MeasureSetCommand, affected: [id] };
}
