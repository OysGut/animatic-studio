import { sourceLanguageOf } from "../dialogue/languages";
import { convertFrames, fpsToNumber, secondsToFrames, type Rational } from "../time";
import type { InterchangeDoc, Shot } from "./types";
import type { ProjectState } from "../model";
import { buildInterchange } from "./index";

/** Import compares with the planned shot including handles, not the imported take's duration. */
export function dragonframeImportDocument(state: ProjectState, productionId: string): InterchangeDoc {
  return buildInterchange({ ...state,
    occurrences: Object.fromEntries(Object.entries(state.occurrences).map(([id,o]) => [id, { ...o, activeTakeId: null }])), clipParts: {},
  }, { productionId, language: sourceLanguageOf(state) });
}

export interface DragonframeEntry { readonly vframe: number; readonly file: number }
export interface DragonframeTimeline {
  readonly files: readonly string[];
  readonly hidden: number;
  readonly deleted: number;
  readonly missing: number;
  readonly repeats: number;
}
/** EDL frame positions and disk file numbers are distinct. Hidden/color bits are not positions.
 * https://www.dragonframe.com/ufaqs/how-does-dragonframe-store-timeline-frame-edits-edit-decision-list/
 */
export function dragonframeTimeline(paths: readonly string[], entries: readonly DragonframeEntry[] | null): DragonframeTimeline {
  const images = paths.filter(p => /_X1_\d+\.(jpe?g|png|tiff?|webp)$/i.test(p));
  const byNumber = new Map<number, string[]>();
  for (const p of images) {
    const n = Number(/_X1_(\d+)\./i.exec(p)?.[1]);
    byNumber.set(n, [...(byNumber.get(n) ?? []), p]);
  }
  const selected: string[] = []; let hidden = 0, missing = 0;
  const used = new Set<number>();
  if (entries !== null) {
    for (const e of [...entries].sort((a,b) => (a.vframe & 0x00ffffff) - (b.vframe & 0x00ffffff))) {
      if (!Number.isSafeInteger(e.vframe) || e.vframe < 0 || e.vframe > 0xffffffff || !Number.isSafeInteger(e.file) || e.file < 0) { missing++; continue; }
      used.add(e.file);
      if ((e.vframe & 0x40000000) !== 0) { hidden++; continue; }
      const matches = byNumber.get(e.file);
      if (matches?.length !== 1) { missing++; continue; }
      const path = matches[0]; if (path) selected.push(path);
    }
  } else {
    for (const [n, matches] of [...byNumber].sort((a,b) => a[0] - b[0])) {
      used.add(n);
      const path = matches[0];
      if (matches.length !== 1 || !path) missing++; else selected.push(path);
    }
  }
  return { files: selected, hidden, missing, deleted: entries === null ? 0 : [...byNumber.keys()].filter(n => !used.has(n)).length,
    repeats: selected.reduce((n,p,i) => n + (i > 0 && p === selected[i-1] ? 1 : 0), 0) };
}

export interface PtgShotName { readonly code: string; readonly scene: string; readonly shot: number; readonly version: number; readonly name: string }
export function parsePtgShotName(value: string): PtgShotName | null {
  const m = /(?:^|[\/\\])([A-Z0-9-]{1,32})_(SC\d{3,}[A-Z]*)_SH(\d{3,})_v(\d{3,})(?=$|[_.\/\\])/i.exec(value);
  if (!m) return null;
  return { code: (m[1] ?? "").toUpperCase(), scene: (m[2] ?? "").toUpperCase(), shot: Number(m[3]), version: Number(m[4]), name: `${m[1]}_${m[2]}_SH${m[3]}_v${m[4]}` };
}
/** Names are suggestions only; return no match for multiple takes/shots or another project. */
export function recognizeDragonframeShot(names: readonly string[], doc: InterchangeDoc): { shot: Shot; version: number; name: string } | null {
  const refs = names.map(parsePtgShotName).filter((n): n is PtgShotName => n !== null);
  const unique = new Map(refs.map(n => [n.name.toUpperCase(), n]));
  if (unique.size !== 1) return null;
  const ref = [...unique.values()][0]; if (!ref || ref.code !== doc.project.code.toUpperCase()) return null;
  const matches = doc.shots.filter(s => { const n = parsePtgShotName(s.name); return n?.scene === ref.scene && n.shot === ref.shot; });
  const shot = matches[0];
  return matches.length === 1 && shot ? { shot, version: ref.version, name: ref.name } : null;
}

export type DragonframeWarning = "twos" | "short" | "long" | "partial" | "hidden" | "deleted" | "fps" | "no-edl";
export function dragonframeWarnings(input: { timeline?: DragonframeTimeline; frames: number; fps: Rational; expectedFps: Rational; shot: Shot; hasEdl?: boolean }): DragonframeWarning[] {
  const out: DragonframeWarning[] = [];
  const frames = convertFrames(input.frames, input.fps, input.expectedFps);
  const expected = input.shot.lengthFrames + input.shot.handleIn + input.shot.handleOut;
  if (input.timeline?.repeats) out.push("twos");
  if (frames < expected) out.push("short", "partial");
  if (frames > expected) out.push("long");
  if (input.timeline?.missing && !out.includes("partial")) out.push("partial");
  if (input.timeline?.hidden) out.push("hidden");
  if (input.timeline?.deleted) out.push("deleted");
  if (Math.abs(fpsToNumber(input.fps) - fpsToNumber(input.expectedFps)) > 0.01) out.push("fps");
  if (input.timeline && !input.hasEdl) out.push("no-edl");
  return out;
}
export function dragonframeFilmFrames(seconds: number, fps: Rational): number { return secondsToFrames(seconds, fps); }