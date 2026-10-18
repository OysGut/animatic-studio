/** Field-level scene edits. Objects are merged recursively; ordered arrays are single fields. */
import type { Command } from "./types";
import type { ProjectState } from "../model";

type Fields = Record<string, unknown>;
const object = (v: unknown): v is Fields => !!v && typeof v === "object" && !Array.isArray(v);
export const sameDraftValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function changedDraftFields(before: Fields, after: Fields): Fields {
  const out: Fields = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (sameDraftValue(before[key], after[key])) continue;
    out[key] = object(before[key]) && object(after[key])
      ? changedDraftFields(before[key], after[key]) : after[key] ?? null;
  }
  return out;
}

export function mergeDraftFields(base: Fields, patch: Fields): Fields {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch))
    out[key] = object(value) && object(base[key]) ? mergeDraftFields(base[key], value) : value;
  return out;
}

export function draftRow(s: ProjectState, id: string): Fields | undefined {
  return (s.layers[id as never] ?? s.audioClips[id as never] ?? s.compositions[id]) as unknown as Fields | undefined;
}

/** Only these commands are permitted in a scene draft. Full commands remain compatible. */
export function mapDraftFields(cmd: Command, map: (id: string, fields: Fields) => Fields): Command {
  if (cmd.type === "UpdateLayers") return { ...cmd, layers: cmd.layers.map((u) => ({ ...u, fields: map(u.layerId, u.fields as unknown as Fields) })) } as unknown as Command;
  if (cmd.type === "UpdateAudioClips") return { ...cmd, clips: cmd.clips.map((u) => ({ ...u, fields: map(u.clipId, u.fields as unknown as Fields) })) } as unknown as Command;
  if (cmd.type === "UpdateComposition") {
    const fields = map(cmd.compositionId, { ...cmd.fields, ...(cmd.camera !== undefined ? { camera: cmd.camera } : {}), ...(cmd.timing !== undefined ? { timing: cmd.timing } : {}) });
    const { camera, timing, ...rest } = fields;
    return { ...cmd, fields: rest, ...(camera !== undefined ? { camera } : {}), ...(timing !== undefined ? { timing } : {}) } as unknown as Command;
  }
  return cmd;
}

export function materializeDraftStep(s: ProjectState, cmd: Command): Command {
  return mapDraftFields(cmd, (id, fields) => mergeDraftFields(draftRow(s, id) ?? {}, fields));
}

export function sparseDraftStep(before: ProjectState, after: ProjectState, cmd: Command): Command {
  return mapDraftFields(cmd, (id, fields) => {
    const a = draftRow(before, id) ?? {};
    const b = draftRow(after, id) ?? {};
    // Compare normalized results, but carry only the editable fields in this command.
    return changedDraftFields(
      Object.fromEntries(Object.keys(fields).map((key) => [key, a[key] ?? null])),
      Object.fromEntries(Object.keys(fields).map((key) => [key, b[key] ?? null])),
    );
  });
}

export function draftFieldPaths(fields: Fields, prefix: string[] = []): string[][] {
  return Object.entries(fields).flatMap(([key, value]) => object(value)
    ? draftFieldPaths(value, [...prefix, key]) : [[...prefix, key]]);
}

export function draftValueAt(row: Fields | undefined, path: readonly string[]): unknown {
  let value: unknown = row;
  for (const key of path) value = object(value) ? value[key] : undefined;
  return value ?? null;
}