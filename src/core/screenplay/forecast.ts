/**
 * Varighetsprognose fra historikk (M6, DEC-0028/KI-28, REQ-0871–0873). Bygger videre på manusanslaget
 * (`estimateBlocks`) med det prosjektet faktisk har:
 * - replikklyd som følger gjeldende manus gir talehastighet per karakter og språk;
 * - ferdige scener (film eller satt lengde) gir forholdet mellom faktisk lengde og anslaget.
 * Prognosen er bare beregnet. Den lagres aldri og endrer aldri manus eller scenelengder.
 */
import { countWords as segCount } from "../language/text-metrics";
import { sourceLanguageOf } from "../dialogue/languages";
import type { ProjectState } from "../model";
import { blocksOfVariant, isScriptOccurrence, orderedOccurrences, sceneNumberOf } from "../views";
import { filmClips } from "../assembly/film";
import { activeDialogueVersion } from "../dialogue/versions";
import { assetNames, nameKey } from "../library";
import { framesToSeconds } from "../time";
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  estimateBlocks,
  estimateUncertainty,
  type DurationAssumptions,
} from "./duration";

/** Minste antall ferdige scener før forholdet faktisk/anslått brukes. */
export const FORECAST_MIN_FINISHED_SCENES = 3;
/** Minste antall replikker med lyd før en karakters (eller prosjektets) talehastighet brukes. */
export const FORECAST_MIN_LINES_PER_SPEAKER = 2;
export const FORECAST_MIN_LINES_TOTAL = 5;
const MIN_WPM = 60;
const MAX_WPM = 350;

export interface SpeechSample {
  readonly characterId: string | null;
  readonly language: string;
  readonly words: number;
  readonly seconds: number;
}

export interface SpeechRate {
  readonly wordsPerMinute: number;
  readonly lines: number;
}

function countWords(text: string): number {
  return segCount(text);
}

/** Talerens ressurs ut fra karakterlinjen foran replikken (entydig navn), ellers null. */
function speakerIndex(s: ProjectState): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const a of Object.values(s.assets)) {
    if (a.removed || a.archived || !["character", "animal", "other"].includes(a.kind)) continue;
    for (const n of assetNames(a)) {
      const k = nameKey(n);
      if (!k) continue;
      m.set(k, m.has(k) && m.get(k) !== a.id ? null : a.id);
    }
  }
  return m;
}

/**
 * Talehastigheten i prosjektet: replikklyd (opptak og genererte versjoner) der lyden følger gjeldende manus.
 * Lengden er klippets spilletid (lengde delt på hastighet).
 */
export function speechSamples(s: ProjectState): SpeechSample[] {
  const out: SpeechSample[] = [];
  const seen = new Set<string>();
  for (const clip of Object.values(s.audioClips)) {
    if (clip.removed || clip.kind !== "dialogue" || !clip.blockId) continue;
    const block = s.blocks[clip.blockId];
    if (!block || block.kind !== "dialogue") continue;
    const v = activeDialogueVersion(s, clip);
    // Lyd laget for en eldre tekst sier ikke noe om dagens replikk
    if (v && v.scriptRevision !== null && v.scriptRevision !== block.currentRev) continue;
    const key = `${clip.occurrenceId}:${clip.blockId}`;
    if (seen.has(key)) continue;
    const lengthMs = v ? v.lengthMs : clip.lengthMs;
    const speed = (v ? v.speed : clip.speed) || 1;
    const seconds = lengthMs / speed / 1000;
    const words = countWords(block.text);
    if (words < 2 || !(seconds >= 0.5)) continue;
    seen.add(key);
    out.push({
      characterId: clip.characterAssetId ?? null,
      language: clip.speechLanguage || clip.language || sourceLanguageOf(s),
      words,
      seconds,
    });
  }
  return out;
}

function rateOf(samples: readonly SpeechSample[]): SpeechRate {
  const words = samples.reduce((t, x) => t + x.words, 0);
  const seconds = samples.reduce((t, x) => t + x.seconds, 0);
  const wpm = seconds > 0 ? (words / seconds) * 60 : 0;
  return { wordsPerMinute: Math.min(MAX_WPM, Math.max(MIN_WPM, wpm)), lines: samples.length };
}

/** Talehastighet per karakter og språk («id|språk»), og for hele prosjektet per språk («*|språk»). */
export function speechRates(samples: readonly SpeechSample[]): ReadonlyMap<string, SpeechRate> {
  const groups = new Map<string, SpeechSample[]>();
  for (const x of samples) {
    for (const k of [`${x.characterId ?? "?"}|${x.language}`, `*|${x.language}`]) {
      const g = groups.get(k);
      if (g) g.push(x);
      else groups.set(k, [x]);
    }
  }
  const out = new Map<string, SpeechRate>();
  for (const [k, g] of groups) {
    const min = k.startsWith("*|") ? FORECAST_MIN_LINES_TOTAL : FORECAST_MIN_LINES_PER_SPEAKER;
    if (g.length >= min) out.set(k, rateOf(g));
  }
  return out;
}

/** Anslag for én scene med kjent talehastighet der den finnes (ellers antakelsene). */
function sceneBase(
  s: ProjectState,
  variantId: string,
  rates: ReadonlyMap<string, SpeechRate>,
  speakers: ReadonlyMap<string, string | null>,
  language: string,
  a: DurationAssumptions,
): { seconds: number; dialogueWords: number; actionLines: number } {
  const blocks = blocksOfVariant(s, variantId);
  const plain = estimateBlocks(blocks, a);
  if (rates.size === 0) return plain;
  let speaker: string | null = null;
  let dialogueSeconds = 0;
  for (const b of blocks) {
    if (b.kind === "character") speaker = speakers.get(nameKey(b.text)) ?? null;
    else if (b.kind === "dialogue") {
      const r = (speaker ? rates.get(`${speaker}|${language}`) : undefined) ?? rates.get(`*|${language}`);
      const wpm = r?.wordsPerMinute ?? a.dialogueWordsPerMinute;
      dialogueSeconds += (countWords(b.text) / Math.max(1, wpm)) * 60;
    }
  }
  const seconds = Math.max(
    a.minSceneSeconds,
    a.headingSeconds + dialogueSeconds + plain.actionLines * a.actionSecondsPerLine,
  );
  return { seconds, dialogueWords: plain.dialogueWords, actionLines: plain.actionLines };
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 1;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export interface SceneForecast {
  readonly occurrenceId: string;
  readonly productionNumber: string | null;
  readonly active: boolean;
  /** Lengden er faktisk (ferdig film eller satt lengde), ikke en prognose. */
  readonly actual: boolean;
  readonly seconds: number;
  readonly lowSeconds: number;
  readonly highSeconds: number;
}

export interface DurationForecast {
  readonly scenes: readonly SceneForecast[];
  /** Sum for aktive scener. */
  readonly seconds: number;
  readonly lowSeconds: number;
  readonly highSeconds: number;
  /** Ferdige scener forholdet faktisk/anslått bygger på. */
  readonly basedOnScenes: number;
  /** Replikker med lyd talehastigheten bygger på. */
  readonly basedOnLines: number;
  /** For lite historikk: standardantakelsene er brukt. */
  readonly fallback: boolean;
  /** Forholdet faktisk/anslått som er brukt (1 når det ikke er nok data). */
  readonly ratio: number;
}

export function durationForecast(
  s: ProjectState,
  productionId: string,
  assumptions: DurationAssumptions = DEFAULT_DURATION_ASSUMPTIONS,
): DurationForecast {
  const samples = speechSamples(s);
  const rates = speechRates(samples);
  const usedLines = [...rates.entries()]
    .filter(([k]) => k.startsWith("*|"))
    .reduce((t, [, r]) => t + r.lines, 0);
  const speakers = speakerIndex(s);
  const language = sourceLanguageOf(s);
  const clips = new Map(filmClips(s, productionId).map((c) => [c.occurrenceId as string, c]));
  const occs = orderedOccurrences(s, productionId).filter(isScriptOccurrence);
  const base = new Map<string, ReturnType<typeof sceneBase>>();
  const actual = new Map<string, number>();
  for (const o of occs) {
    base.set(o.id, sceneBase(s, o.variantId, rates, speakers, language, assumptions));
    const c = clips.get(o.id);
    if (c && (c.durationKind === "film" || c.durationKind === "set") && c.durationFrames > 0)
      actual.set(o.id, framesToSeconds(c.durationFrames, s.project.fps));
  }
  const ratios = occs
    .filter((o) => o.active && actual.has(o.id) && (base.get(o.id)?.seconds ?? 0) > 0)
    .map((o) => actual.get(o.id)! / base.get(o.id)!.seconds)
    .sort((a, b) => a - b);
  const enoughScenes = ratios.length >= FORECAST_MIN_FINISHED_SCENES;
  const ratio = enoughScenes ? quantile(ratios, 0.5) : 1;
  const lo = enoughScenes ? quantile(ratios, 0.2) : 1;
  const hi = enoughScenes ? quantile(ratios, 0.8) : 1;
  const fallback = !enoughScenes && usedLines === 0;

  const scenes: SceneForecast[] = occs.map((o) => {
    const b = base.get(o.id)!;
    const known = actual.get(o.id);
    if (known !== undefined)
      return {
        occurrenceId: o.id,
        productionNumber: sceneNumberOf(s, o),
        active: o.active,
        actual: true,
        seconds: Math.round(known),
        lowSeconds: Math.round(known),
        highSeconds: Math.round(known),
      };
    const seconds = Math.round(b.seconds * ratio);
    let low: number;
    let high: number;
    if (enoughScenes) {
      // Spennet fra de ferdige scenene, men aldri smalere enn ±10 %
      low = Math.min(b.seconds * lo, seconds * 0.9);
      high = Math.max(b.seconds * hi, seconds * 1.1);
    } else {
      const u = estimateUncertainty({ ...b, seconds }, assumptions);
      low = u.uncertain ? u.lowSeconds : seconds * 0.85;
      high = u.uncertain ? u.highSeconds : seconds * 1.15;
    }
    return {
      occurrenceId: o.id,
      productionNumber: sceneNumberOf(s, o),
      active: o.active,
      actual: false,
      seconds,
      lowSeconds: Math.max(1, Math.round(Math.min(low, seconds))),
      highSeconds: Math.round(Math.max(high, seconds)),
    };
  });
  const active = scenes.filter((x) => x.active);
  return {
    scenes,
    seconds: active.reduce((t, x) => t + x.seconds, 0),
    lowSeconds: active.reduce((t, x) => t + x.lowSeconds, 0),
    highSeconds: active.reduce((t, x) => t + x.highSeconds, 0),
    basedOnScenes: ratios.length,
    basedOnLines: usedLines,
    fallback,
    ratio,
  };
}
