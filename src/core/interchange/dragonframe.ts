/**
 * PTG2 (B-102, PTG-B1–B4/B6): «Send til Dragonframe». Ren modell for pakken: eksponeringer, hvilke
 * monteringsbilder referansefilmen viser, X-sheet-rader, lydstemmer og WAV 24 bit. Ingen nettleser-API,
 * ingen AI. All tid kommer fra InterchangeDoc (PTG1); omregning av bildefrekvens skjer bare her.
 */
import type { FilmAudioItem } from "../audio";
import type { ProjectState } from "../model";
import { blockSpans, filmClips } from "../assembly/film";
import { languageState } from "../language";
import { translationOf } from "../translation";
import { annotationsOfVariant } from "../notes";
import { blocksOfVariant } from "../views";
import { formatTimecode, framesToSeconds, secondsToFrames, type Rational } from "../time";
import type { InterchangeDoc, Shot } from "./types";

/** Skuddets vindu på opptakstidslinjen, med håndtak: [frameIn, frameOut). */
export function shotWindow(shot: Pick<Shot, "frameIn" | "frameOut">): { readonly from: number; readonly to: number; readonly length: number } {
  return { from: shot.frameIn, to: shot.frameOut, length: Math.max(0, shot.frameOut - shot.frameIn) };
}

/** Eksponeringen et opptaksbilde viser: rutenettet følger skuddets klipp (samme som kamerasporet i PTG3). */
export function exposureOf(frame: number, shot: Pick<Shot, "startFrame">, step: number): number {
  const s = Math.max(1, step);
  return shot.startFrame + Math.floor((frame - shot.startFrame) / s) * s;
}

/** Eksponeringene (absolutte opptaksbilder) i skuddets vindu, i rekkefølge, én per eksponering. */
export function shotExposures(doc: Pick<InterchangeDoc, "exposureStep">, shot: Pick<Shot, "startFrame" | "frameIn" | "frameOut">): number[] {
  const w = shotWindow(shot);
  const out: number[] = [];
  for (let f = w.from; f < w.to; f++) {
    const e = exposureOf(f, shot, doc.exposureStep);
    if (out[out.length - 1] !== e) out.push(e);
  }
  return out;
}

/** Opptaksbilde → monteringens bilde (prosjektets bildefrekvens), samme regel som PTG1. */
export function sourceFrameOf(frame: number, fps: Rational, sourceFps: Rational): number {
  return secondsToFrames(framesToSeconds(frame, fps), sourceFps);
}

/**
 * Referansefilmen: ett videobilde per opptaksbilde i vinduet (opptakets bildefrekvens). På toere vises
 * hver eksponering to bilder. Verdien er monteringsbildet som tegnes.
 */
export function referenceFrames(doc: Pick<InterchangeDoc, "exposureStep" | "fps" | "sourceFps">, shot: Pick<Shot, "startFrame" | "frameIn" | "frameOut">): number[] {
  const w = shotWindow(shot);
  const out: number[] = [];
  for (let f = w.from; f < w.to; f++) out.push(sourceFrameOf(exposureOf(f, shot, doc.exposureStep), doc.fps, doc.sourceFps));
  return out;
}

export interface XsheetRow {
  /** Bildenummer i pakken (1 = første bilde i vinduet, også i håndtaket). */
  readonly frame: number;
  /** Bilde relativt til klippet (negativt i håndtaket foran). */
  readonly shotFrame: number;
  readonly timecode: string;
  readonly character: string;
  readonly dialogue: string;
  /** Munn: tom til PTG4 fyller den. */
  readonly mouth: string;
  readonly action: string;
  readonly layers: string;
  readonly notes: string;
}

export interface XsheetLabels {
  readonly layerStart: (name: string) => string;
  readonly layerEnd: (name: string) => string;
}

const join = (xs: readonly string[]) => [...new Set(xs.filter(Boolean))].join(" / ");

/** Bevegelsesintervaller per lag: der minst én egenskap endrer seg mellom to nøkkelbilder, pluss bane. */
function layerMoves(shot: Shot): { name: string; start: number; end: number }[] {
  const out: { name: string; start: number; end: number }[] = [];
  for (const l of shot.layers) {
    const spans: [number, number][] = [];
    const byProp = new Map<string, { frame: number; value: number }[]>();
    for (const k of l.keyframes) {
      const list = byProp.get(k.property) ?? [];
      list.push({ frame: k.frame, value: k.value });
      byProp.set(k.property, list);
    }
    for (const list of byProp.values()) {
      list.sort((a, b) => a.frame - b.frame);
      for (let i = 1; i < list.length; i++)
        if (list[i]!.value !== list[i - 1]!.value && list[i]!.frame > list[i - 1]!.frame) spans.push([list[i - 1]!.frame, list[i]!.frame]);
    }
    if (l.path && l.path.endFrame > l.path.startFrame) spans.push([l.path.startFrame, l.path.endFrame]);
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }
    for (const [a, b] of merged) out.push({ name: l.source.name, start: shot.startFrame + a, end: shot.startFrame + b });
  }
  return out;
}

/**
 * X-sheet: én rad per eksponering i skuddets vindu. Hvert ord står på eksponeringen der det starter;
 * replikker uten ordtider står på replikkens start. Handling og notater fra manus står der blokken
 * starter; lagbevegelser markeres ved start og slutt.
 */
export function buildXsheets(state: ProjectState, doc: InterchangeDoc, labels: XsheetLabels): Map<string, XsheetRow[]> {
  const s = languageState(state, doc.language.dialogue);
  const lang = doc.language.dialogue;
  const ids = new Set(doc.shots.map(x => x.id));
  const clips = filmClips(s, doc.production.id).filter(c => ids.has(c.occurrenceId));
  const toCapture = (sourceFrame: number) => secondsToFrames(framesToSeconds(sourceFrame, doc.sourceFps), doc.fps);
  const actions: { at: number; text: string }[] = [];
  const notes: { at: number; text: string }[] = [];
  for (const c of clips) {
    const spans = new Map(blockSpans(s, c).map(x => [x.blockId, x]));
    for (const b of blocksOfVariant(s, c.variantId)) {
      if (b.kind !== "action") continue;
      const text = lang === "nb" ? b.text : translationOf(s, b.id, lang)?.text ?? "";
      if (text) actions.push({ at: toCapture(spans.get(b.id)?.startFrame ?? c.startFrame), text });
    }
    for (const a of annotationsOfVariant(s, c.variantId)) {
      if (a.resolved) continue;
      const at = a.blockId ? spans.get(a.blockId)?.startFrame ?? c.startFrame : c.startFrame;
      notes.push({ at: toCapture(at), text: a.authorName ? `${a.authorName}: ${a.text}` : a.text });
    }
  }
  const words = doc.shots.flatMap(x => x.words);
  const lines = doc.shots.flatMap(x => x.dialogue);
  const characterOfBlock = new Map(lines.map(l => [l.id, l.character]));
  const withWords = new Set(words.map(w => w.blockId));
  const moves = doc.shots.flatMap(layerMoves);
  const out = new Map<string, XsheetRow[]>();
  for (const shot of doc.shots) {
    const exposures = shotExposures(doc, shot);
    const rows: XsheetRow[] = exposures.map((e, i) => {
      const next = exposures[i + 1] ?? shot.frameOut;
      const inside = (f: number) => f >= e && f < next;
      const ws = words.filter(w => inside(w.absoluteStartFrame));
      const ls = lines.filter(l => !withWords.has(l.id) && inside(l.absoluteStartFrame));
      return {
        frame: e - shot.frameIn + 1,
        shotFrame: e - shot.startFrame,
        timecode: formatTimecode(e, doc.fps),
        character: join([...ws.map(w => characterOfBlock.get(w.blockId) ?? ""), ...ls.map(l => l.character)]),
        dialogue: [...ws.map(w => w.text), ...ls.map(l => l.text)].join(" "),
        mouth: "",
        action: join(actions.filter(a => inside(a.at)).map(a => a.text)),
        layers: join([...moves.filter(m => inside(m.start)).map(m => labels.layerStart(m.name)),
          ...moves.filter(m => inside(m.end)).map(m => labels.layerEnd(m.name))]),
        notes: join(notes.filter(n => inside(n.at)).map(n => n.text)),
      };
    });
    out.set(shot.id, rows);
  }
  return out;
}

const csvCell = (v: string | number) => {
  const t = String(v);
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const XSHEET_COLUMNS = ["frame", "shotFrame", "timecode", "character", "dialogue", "mouth", "action", "layers", "notes"] as const;

/** X-sheet som CSV (UTF-8 med BOM, komma, CRLF). Overskriftene er de faste kolonnenavnene. */
export function xsheetCsv(rows: readonly XsheetRow[], headers: readonly string[]): Uint8Array {
  const lines = [headers.map(csvCell).join(","), ...rows.map(r => XSHEET_COLUMNS.map(k => csvCell(r[k])).join(","))];
  return new TextEncoder().encode("\uFEFF" + lines.join("\r\n") + "\r\n");
}

export type XsheetPaper = "a4" | "letter";
export const XSHEET_PAPER: Record<XsheetPaper, { readonly width: number; readonly height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};
export const XSHEET_ROW_MM = 5;

/** Sideoppsett i mm: kolonnebredder (andeler) og rader per side. Ren beregning, uten PDF-bibliotek. */
export function xsheetLayout(paper: XsheetPaper, rowCount: number) {
  const p = XSHEET_PAPER[paper];
  const margin = 10, header = 18;
  const perPage = Math.max(1, Math.floor((p.height - 2 * margin - header) / XSHEET_ROW_MM));
  const share = [0.07, 0.07, 0.13, 0.12, 0.2, 0.07, 0.14, 0.11, 0.09];
  const inner = p.width - 2 * margin;
  let x = margin;
  const columns = share.map(f => { const c = { x, width: inner * f }; x += inner * f; return c; });
  const pages: { from: number; to: number }[] = [];
  for (let i = 0; i < Math.max(1, rowCount); i += perPage) pages.push({ from: i, to: Math.min(rowCount, i + perPage) });
  return { ...p, margin, header, perPage, columns, pages };
}

/** Kortnavn for filnavn: store bokstaver, bare A–Z, 0–9 og _. */
export function fileToken(name: string): string {
  const t = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return t || "X";
}

export interface StemGroup {
  readonly key: string;
  /** Filnavnets endelse, f.eks. DIA_MAJA, AMB, MUS, SFX, MIX. */
  readonly suffix: string;
  readonly items: readonly FilmAudioItem[];
}

/**
 * Lydstemmer: én per karakter (characterAssetId; tale uten karakter samles i DIA_FORTELLER), atmosfære,
 * musikk og effekter hver for seg, og en samlet miks. Dempede klipp er aldri med. Grupper uten klipp
 * utelates, unntatt miksen som alltid lages.
 */
export function stemGroups(items: readonly FilmAudioItem[], characterName: (assetId: string) => string): StemGroup[] {
  const live = items.filter(it => !it.clip.muted);
  const voice = live.filter(it => !it.film && (it.clip.kind === "dialogue" || it.clip.kind === "narration"));
  const groups: StemGroup[] = [];
  const byChar = new Map<string, FilmAudioItem[]>();
  for (const it of voice) {
    const k = it.clip.characterAssetId ?? "";
    byChar.set(k, [...(byChar.get(k) ?? []), it]);
  }
  const used = new Set<string>();
  for (const [id, list] of [...byChar.entries()].sort((a, b) => (a[0] === "" ? 1 : 0) - (b[0] === "" ? 1 : 0))) {
    let suffix = `DIA_${id ? fileToken(characterName(id)) : "FORTELLER"}`;
    while (used.has(suffix)) suffix += "_2";
    used.add(suffix);
    groups.push({ key: id || "narrator", suffix, items: list });
  }
  for (const [kind, suffix] of [["ambience", "AMB"], ["music", "MUS"], ["sfx", "SFX"]] as const) {
    const list = live.filter(it => !it.film && it.clip.kind === kind);
    if (list.length) groups.push({ key: kind, suffix, items: list });
  }
  groups.push({ key: "mix", suffix: "MIX", items: live });
  return groups;
}

/** Antall lydprøver i et skudd (med håndtak) – lik lengde i alle stemmene. */
export function shotSamples(doc: Pick<InterchangeDoc, "fps">, shot: Pick<Shot, "frameIn" | "frameOut">, sampleRate = 48000): number {
  return Math.round(shotWindow(shot).length * sampleRate * doc.fps.den / doc.fps.num);
}

/** WAV, PCM 24 bit, flettet. Kanalene kuttes eller fylles med stillhet til nøyaktig `frames` prøver. */
export function wav24(channels: readonly Float32Array[], sampleRate: number, frames: number): Uint8Array {
  const n = Math.max(1, channels.length);
  const dataBytes = frames * n * 3;
  const buf = new Uint8Array(44 + dataBytes);
  const v = new DataView(buf.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, n, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * n * 3, true);
  v.setUint16(32, n * 3, true); v.setUint16(34, 24, true); str(36, "data"); v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < n; c++) {
      const x = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0));
      let q = Math.round(x < 0 ? x * 0x800000 : x * 0x7fffff);
      if (q < 0) q += 0x1000000;
      buf[o] = q & 0xff; buf[o + 1] = (q >> 8) & 0xff; buf[o + 2] = (q >> 16) & 0xff;
      o += 3;
    }
  return buf;
}

/** Stiene i pakken: én mappe per skudd, navngitt etter PTG1. */
export const dragonframePaths = (shot: Pick<Shot, "name">) => ({
  folder: shot.name,
  video: `${shot.name}/${shot.name}_ref.mp4`,
  png: (i: number) => `${shot.name}/png/${shot.name}_${String(i + 1).padStart(4, "0")}.png`,
  audio: (suffix: string) => `${shot.name}/audio/${shot.name}_${suffix}.wav`,
  xsheetCsv: `${shot.name}/${shot.name}_xsheet.csv`,
  xsheetPdf: (paper: XsheetPaper) => `${shot.name}/${shot.name}_xsheet_${paper === "a4" ? "A4" : "Letter"}.pdf`,
  fbx: `${shot.name}/${shot.name}_camera.fbx`,
});
