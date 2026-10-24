import { framesToSeconds } from "../time";
import type { InterchangeDoc } from "./types";

export type ShotlistProfile = "standard" | "flow" | "ftrack" | "kitsu";
// i18n-ignore: external interchange field names, not interface copy
export const SHOTLIST_COLUMNS = ["Sequence", "Shot (code)", "Description", "Frame In", "Frame Out", "Cut In", "Cut Out", "NB Frames", "Handle In", "Handle Out", "Duration (tid)", "Characters", "Sets", "Props", "Dialogue", "Status", "Thumbnail", "Transition", "Transition Frames"] as const;
const aliases: Record<ShotlistProfile, Readonly<Record<string, string>>> = {
  standard: {}, flow: { "Sequence": "sg_sequence", "Shot (code)": "code", "Cut In": "sg_cut_in", "Cut Out": "sg_cut_out" },
  ftrack: { "Shot (code)": "Name", "Frame In": "Frame IN" }, kitsu: { "Shot (code)": "Name", "Frame In": "Frame IN" },
};
export type StoryboardShotRow = Readonly<Record<string,string|number>>;
export function shotlistRows(doc: InterchangeDoc, profile: ShotlistProfile = "standard", panels: readonly StoryboardShotRow[] = []): Record<string, string | number>[] {
  return doc.shots.map(s => {
    const values = [doc.production.name, s.name, s.description, s.frameIn, s.frameOut, s.startFrame, s.startFrame + s.lengthFrames,
      s.lengthFrames, s.handleIn, s.handleOut, framesToSeconds(s.lengthFrames, doc.fps), s.characters.join("; "), s.sets.join("; "), s.props.join("; "),
      s.dialogue.map(d => `${d.character}: ${d.text}`).join("\n"), s.status, s.thumbnail.path, s.transition.type, s.transition.lengthFrames];
    const row:Record<string,string|number> = Object.fromEntries(SHOTLIST_COLUMNS.map((c, i) => [aliases[profile][c] ?? c, values[i] ?? ""]));
    if(panels.length){const matching=panels.filter(p=>p["occurrenceId"]===s.id);const keys=[...new Set(panels.flatMap(p=>Object.keys(p)))].filter(k=>k!=="occurrenceId"&&k!=="panelId");for(const key of keys)row[`Storyboard ${key}`]=matching.map(p=>p[key]??"").join("\n");}
    return row;
  });
}
export function shotlistCsv(doc: InterchangeDoc, profile: ShotlistProfile = "standard", panels: readonly StoryboardShotRow[] = []): Uint8Array {
  const rows = shotlistRows(doc, profile,panels);
  const columns = [...SHOTLIST_COLUMNS.map(c => aliases[profile][c] ?? c),...Object.keys(rows[0]??{}).filter(k=>k.startsWith("Storyboard "))];
  const cell = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
  return new TextEncoder().encode("\uFEFF" + [columns.map(cell).join(","), ...rows.map(r => columns.map(c => cell(r[c] ?? "")).join(","))].join("\r\n") + "\r\n");
}
export function shotlistJson(doc: InterchangeDoc, profile: ShotlistProfile = "standard", panels: readonly StoryboardShotRow[] = []): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ namingVersion: doc.namingVersion, fps: doc.fps, captureFps: doc.captureFps,
    exposureStep: doc.exposureStep, lengthFrames: doc.lengthFrames, shots: shotlistRows(doc, profile,panels) }, null, 2));
}