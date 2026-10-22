import type { ProjectState } from "../../model";
import { isUuid } from "../../ids";
import { t } from "../../i18n/keyed";
import { printJobError, type PrintJobElement, type PrintJobSettings } from "./index";

/** Lagret utskriftsjobb (0079, prosjektdata via apply_changes). */
export interface StoredPrintJob {
  readonly id: string;
  readonly name: string;
  readonly settings: PrintJobSettings;
  readonly revision: number;
  readonly removed: boolean;
  readonly createdAt?: string;
}
export interface StoredPrintJobElement extends PrintJobElement {
  readonly jobId: string;
  readonly position: number;
  readonly revision: number;
  readonly removed: boolean;
}
export interface PrintJobSnapshot {
  readonly job: StoredPrintJob | null;
  readonly elements: readonly StoredPrintJobElement[];
}

export type PrintJobCommand =
  | { type: "SavePrintJob"; job: { id: string; name: string; settings: PrintJobSettings }; elements: readonly PrintJobElement[] }
  | { type: "SetPrintJobRemoved"; id: string; removed: boolean }
  | { type: "RestorePrintJob"; id: string; snapshot: PrintJobSnapshot };

function snapshot(s: ProjectState, id: string): PrintJobSnapshot {
  return {
    job: s.printJobs?.[id] ?? null,
    elements: Object.values(s.printJobElements ?? {}).filter((e) => e.jobId === id),
  };
}

/** Ett steg, én angring: jobben og alle elementene lagres sammen. Elementer som tas ut, merkes som fjernet. */
export function applyPrintJobCommand(s: ProjectState, c: PrintJobCommand) {
  const id = c.type === "SavePrintJob" ? c.job.id : c.id;
  const invalid = (): never => {
    throw new Error(t("print-job.invalid"));
  };
  if (!isUuid(id)) invalid();
  const before = snapshot(s, id);
  const jobs = { ...s.printJobs };
  const els = { ...s.printJobElements };
  const affected: string[] = [id];
  if (c.type === "SavePrintJob") {
    const name = c.job.name.trim();
    if (!name || name.length > 120 || printJobError(c.job.settings, c.elements)) invalid();
    const old = before.job;
    jobs[id] = { id, name, settings: structuredClone(c.job.settings), revision: (old?.revision ?? 0) + 1, removed: false, ...(old?.createdAt ? { createdAt: old.createdAt } : {}) };
    const keep = new Set<string>();
    c.elements.forEach((e, position) => {
      const layer = s.layers[e.layerId];
      if (!isUuid(e.id) || !layer || !s.assetVersions[e.versionId] || !s.scenes[e.sceneId]) invalid();
      const prev = els[e.id];
      if (prev && prev.jobId !== id) invalid();
      keep.add(e.id);
      els[e.id] = { ...e, note: e.note.trim(), jobId: id, position, revision: (prev?.revision ?? 0) + 1, removed: false };
      affected.push(e.id);
    });
    for (const e of before.elements)
      if (!keep.has(e.id) && !e.removed) {
        els[e.id] = { ...e, removed: true, revision: e.revision + 1 };
        affected.push(e.id);
      }
  } else if (c.type === "SetPrintJobRemoved") {
    const old = before.job ?? invalid();
    jobs[id] = { ...old, removed: c.removed, revision: old.revision + 1 };
  } else {
    const snap = c.snapshot;
    if (snap.job) jobs[id] = { ...snap.job, revision: (before.job?.revision ?? 0) + 1 };
    else if (before.job) jobs[id] = { ...before.job, removed: true, revision: before.job.revision + 1 };
    const inSnap = new Map(snap.elements.map((e) => [e.id, e]));
    for (const e of before.elements) {
      const back = inSnap.get(e.id);
      els[e.id] = back ? { ...back, revision: e.revision + 1 } : { ...e, removed: true, revision: e.revision + 1 };
      affected.push(e.id);
    }
    for (const e of snap.elements)
      if (!els[e.id] || !before.elements.some((b) => b.id === e.id)) {
        els[e.id] = { ...e, revision: (s.printJobElements?.[e.id]?.revision ?? 0) + 1 };
        affected.push(e.id);
      }
  }
  return {
    state: { ...s, printJobs: jobs, printJobElements: els },
    inverse: { type: "RestorePrintJob", id, snapshot: before } as PrintJobCommand,
    affected,
  };
}
