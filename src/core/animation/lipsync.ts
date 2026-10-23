/**
 * CA5 (§29–§33): automatisk leppesynk per replikk og take. Resultatet er en varig rad med kilde
 * (rhubarb/regel), algoritmeversjon og hash av lyden, slik at endret lyd markeres som utdatert.
 * Manuelle rettelser er overstyringer som overlever ny generering (§32). Ingenting tas i bruk uten
 * brukerens bekreftelse – forslaget lever i minnet til «Bruk» lagrer det via kommandoene.
 */

import { isUuid } from "../ids";
import { VISEMES, type Viseme } from "./parts";
import { t as tk } from "@/core/i18n/keyed";

export const LIPSYNC_ALGORITHM_VERSION = 1;
export const LIPSYNC_MAX_FRAMES = 100_000;
export type LipsyncSource = "rhubarb" | "rule";
export const VISEME_ORDER: readonly Viseme[] = VISEMES;

/** Én munnform over et frame-intervall [frame, endFrame). */
export interface VisemeSpan {
  readonly frame: number;
  readonly endFrame: number;
  readonly viseme: Viseme;
}

export interface LipsyncResult {
  readonly id: string;
  readonly revision: number;
  /** Lydklippet (replikken) synken gjelder. */
  readonly clipId: string;
  /** Taket som ble analysert. */
  readonly takeId: string;
  /** Manuslinjen, for «synken må gjennomgås» når teksten endres (§31). */
  readonly blockId: string | null;
  readonly source: LipsyncSource;
  readonly algorithmVersion: number;
  /** Hash av lyddataene som ble analysert; endret lyd gir utdatert-markering. */
  readonly audioHash: string;
  /** Teksten slik den var ved analysen (normalisert). */
  readonly textHash: string;
  /** Genererte munnformer, sortert på frame. */
  readonly spans: readonly VisemeSpan[];
  /** Manuelle rettelser per frame; vinner alltid over spans (§32). */
  readonly overrides: readonly { readonly frame: number; readonly viseme: Viseme }[];
  /** Av/på per replikk (§33). Lyden blir værende. */
  readonly enabled: boolean;
  /**
   * DV2 (migrasjon 0060): lydversjonen som ble analysert. Er en annen versjon aktiv, er synken utdatert
   * (`lipsyncOutdated`). Mangler = eldre rad uten versjon (følger klippet som før).
   */
  readonly dialogueVersionId?: string | null;
  readonly removed: boolean;
}

/** FNV-1a 32-bit, hex. Rask, stabil hash av lyddata for utdatert-sjekk. */
export function audioHashOf(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + ":" + bytes.length.toString(16);
}

/** Enkel tekst-hash (samme algoritme) for å oppdage endret replikk. */
export function textHashOf(text: string): string {
  return audioHashOf(new TextEncoder().encode(text));
}

export function isViseme(v: unknown): v is Viseme {
  return typeof v === "string" && (VISEMES as readonly string[]).includes(v);
}

export function lipsyncError(r: LipsyncResult): string | null {
  if (!r || !isUuid(r.id) || !isUuid(r.clipId) || !isUuid(r.takeId)) return tk("core-animation-lipsync.lipsync-error.message.45f71f08f7fe");
  if (r.blockId !== null && !isUuid(r.blockId)) return tk("core-animation-lipsync.lipsync-error.message.45f71f08f7fe.2");
  if (r.source !== "rhubarb" && r.source !== "rule") return tk("core-animation-lipsync.lipsync-error.message.15a418c52981");
  if (!Number.isInteger(r.algorithmVersion) || r.algorithmVersion < 1) return tk("core-animation-lipsync.lipsync-error.message.89f1c471896c");
  if (typeof r.audioHash !== "string" || !r.audioHash || r.audioHash.length > 64) return tk("core-animation-lipsync.lipsync-error.message.757bc6ed5a92");
  if (typeof r.textHash !== "string" || r.textHash.length > 64) return tk("core-animation-lipsync.lipsync-error.message.0798edb28767");
  if (!Array.isArray(r.spans) || r.spans.length > LIPSYNC_MAX_FRAMES) return tk("core-animation-lipsync.lipsync-error.message.c6c59e3d66b4");
  let prev = -1;
  for (const s of r.spans) {
    if (!s || !Number.isInteger(s.frame) || !Number.isInteger(s.endFrame) || s.frame < 0 || s.endFrame <= s.frame || s.frame < prev || !isViseme(s.viseme))
      return tk("core-animation-lipsync.lipsync-error.message.6f61b1cd45ec");
    prev = s.frame;
  }
  if (!Array.isArray(r.overrides) || r.overrides.length > LIPSYNC_MAX_FRAMES) return tk("core-animation-lipsync.lipsync-error.message.b31655e7a023");
  const seen = new Set<number>();
  for (const o of r.overrides) {
    if (!o || !Number.isInteger(o.frame) || o.frame < 0 || !isViseme(o.viseme) || seen.has(o.frame)) return tk("core-animation-lipsync.lipsync-error.message.a29be9e1df83");
    seen.add(o.frame);
  }
  return null;
}

/** Munnformen på en frame: overstyring først, deretter generert span, ellers lukket (X). */
export function visemeAt(r: LipsyncResult, frame: number): Viseme {
  for (const o of r.overrides) if (o.frame === frame) return o.viseme;
  for (const s of r.spans) if (frame >= s.frame && frame < s.endFrame) return s.viseme;
  return "X";
}

/** Er resultatet utdatert fordi lyden eller teksten er endret? (§31) */
export function lipsyncStale(r: LipsyncResult, audioHash: string | null, textHash: string | null): boolean {
  return (audioHash !== null && audioHash !== r.audioHash) || (textHash !== null && textHash !== r.textHash);
}

/** Slår sammen nye genererte spans med de gamle overstyringene – overstyringene overlever alltid (§32). */
export function mergeRegenerated(old: LipsyncResult | null, next: Omit<LipsyncResult, "overrides" | "revision">): LipsyncResult {
  return { ...next, revision: (old?.revision ?? 0) + 1, overrides: old?.overrides ?? [] };
}

/**
 * Regelbasert reserve (§30): energi per frame + ordtidspunkter fra ordkoblingen → munnformer.
 * `energies`: RMS per frame (0–1). `words`: ord med tider i ms relativt til klippets start.
 * Vokal-/fonemregler er bevisst enkle og deterministiske; Rhubarb er primær når WASM er tilgjengelig.
 */
export function ruleLipsync(
  energies: readonly number[],
  words: readonly { readonly startMs: number | null; readonly endMs: number | null; readonly text: string }[],
  fps: number,
): VisemeSpan[] {
  const spans: VisemeSpan[] = [];
  const push = (frame: number, endFrame: number, viseme: Viseme) => {
    if (endFrame <= frame) return;
    const last = spans[spans.length - 1];
    if (last && last.viseme === viseme && last.endFrame === frame) spans[spans.length - 1] = { frame: last.frame, endFrame, viseme };
    else spans.push({ frame, endFrame, viseme });
  };
  const wordAt = (ms: number) => words.find(w => w.startMs !== null && w.endMs !== null && ms >= w.startMs && ms < w.endMs);
  for (let f = 0; f < energies.length; f++) {
    const e = energies[f]!;
    const ms = (f / fps) * 1000;
    const word = wordAt(ms);
    let viseme: Viseme = "X";
    if (e > 0.02 && word) {
      const t = word.text.toLocaleLowerCase("und");
      const ch = t[Math.min(t.length - 1, Math.floor(((ms - (word.startMs ?? 0)) / Math.max(1, (word.endMs ?? 0) - (word.startMs ?? 0))) * t.length))] ?? "";
      if (/[pbm]/.test(ch)) viseme = "A";
      else if (/[fv]/.test(ch)) viseme = "G";
      else if (/[l]/.test(ch)) viseme = "H";
      else if (/[uo]/.test(ch)) viseme = "F";
      else if (/[aå]/.test(ch)) viseme = "D";
      else if (/[eæ]/.test(ch)) viseme = "C";
      else if (/[i]/.test(ch)) viseme = "E";
      else viseme = e > 0.15 ? "D" : "B";
    }
    push(f, f + 1, viseme);
  }
  return spans;
}

/** Konverterer Rhubarb-munnhint (sekunder) til frame-spans. Ukjente verdier blir X. */
export function spansFromRhubarb(cues: readonly { start: number; end: number; value: string }[], fps: number): VisemeSpan[] {
  const spans: VisemeSpan[] = [];
  for (const c of cues) {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.end <= c.start) continue;
    const viseme = (c.value ?? "X").toUpperCase();
    spans.push({
      frame: Math.max(0, Math.round(c.start * fps)),
      endFrame: Math.max(1, Math.round(c.end * fps)),
      viseme: isViseme(viseme) ? viseme : "X",
    });
  }
  return spans.sort((a, b) => a.frame - b.frame);
}
