/**
 * CA6 (§34–§44, §54–§70): blinking, overlegg og navngitte minianimasjonsmønstre.
 * Alt er seed-basert og deterministisk (§63, §66): samme seed og innstillinger gir samme resultat
 * i forhåndsvisning, etter gjenåpning og ved eksport. Algoritmen er versjonert.
 */
import { L } from "../i18n";
import { isUuid } from "../ids";

export const PATTERN_ALGORITHM_VERSION = 1;
export const PATTERN_NAME_MAX = 100;
export const MAX_PATTERN_EVENTS = 10_000;

/** Deterministisk tilfeldig tallgenerator (mulberry32) – stabil på tvers av maskiner (§66). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type PatternTarget = "eye:left" | "eye:right" | "eyes" | "overlay";
export const PATTERN_TARGETS: readonly PatternTarget[] = ["eye:left", "eye:right", "eyes", "overlay"];

/** Hva som kan varieres (§64). Låste egenskaper varieres ikke. */
export interface PatternVariation {
  readonly interval: boolean;
  readonly duration: boolean;
  readonly intensity: boolean;
}

export interface PatternSpec {
  readonly format: 1;
  readonly target: PatternTarget;
  /** Intervall mellom hendelser (ms), min–maks (§65). */
  readonly intervalMinMs: number;
  readonly intervalMaxMs: number;
  /** Varighet per hendelse (frames), min–maks. Kort = blink, langt = lukket øye (§37). */
  readonly durationMinFrames: number;
  readonly durationMaxFrames: number;
  /** Hendelsens styrke 0–1 (1 = helt lukket, 0.5 = halvlukket). */
  readonly intensity: number;
  readonly seed: number;
  readonly vary: PatternVariation;
  readonly algorithmVersion: number;
}

export interface AnimationPattern {
  readonly id: string;
  readonly revision: number;
  /** Riggen mønsteret tilhører, eller null for prosjektdelt mønster (§60–§61). */
  readonly rigId: string | null;
  readonly name: string;
  /** Markørfarge, ikke en filmfarge (§61). */
  readonly color: string;
  readonly spec: PatternSpec;
  readonly removed: boolean;
}

/** Én planlagt hendelse (blink, røykstøt …) i frames. */
export interface PatternEvent {
  readonly frame: number;
  readonly endFrame: number;
  readonly intensity: number;
}

export function patternSpecError(spec: PatternSpec): string | null {
  if (!spec || spec.format !== 1 || !PATTERN_TARGETS.includes(spec.target)) return L("Ugyldig mønster", "Invalid pattern");
  const nums = [spec.intervalMinMs, spec.intervalMaxMs, spec.durationMinFrames, spec.durationMaxFrames, spec.intensity, spec.seed];
  if (!nums.every(Number.isFinite)) return L("Ugyldig mønster", "Invalid pattern");
  if (spec.intervalMinMs < 100 || spec.intervalMaxMs > 600_000 || spec.intervalMinMs > spec.intervalMaxMs)
    return L("Ugyldig intervall", "Invalid interval");
  if (spec.durationMinFrames < 1 || spec.durationMaxFrames > 10_000 || spec.durationMinFrames > spec.durationMaxFrames)
    return L("Ugyldig varighet", "Invalid duration");
  if (spec.intensity < 0 || spec.intensity > 1) return L("Ugyldig intensitet", "Invalid intensity");
  if (!Number.isInteger(spec.seed) || spec.seed < 0 || spec.seed > 0xffffffff) return L("Ugyldig seed", "Invalid seed");
  if (spec.algorithmVersion !== PATTERN_ALGORITHM_VERSION) return L("Ugyldig algoritmeversjon", "Invalid algorithm version");
  if (!spec.vary || typeof spec.vary !== "object") return L("Ugyldig variasjon", "Invalid variation");
  return null;
}

export function patternError(p: AnimationPattern): string | null {
  if (!p || !isUuid(p.id) || (p.rigId !== null && !isUuid(p.rigId))) return L("Ugyldig mønster", "Invalid pattern");
  const name = p.name?.trim() ?? "";
  if (!name || name.length > PATTERN_NAME_MAX) return L("Mønsteret må ha et navn", "The pattern needs a name");
  if (typeof p.color !== "string" || !/^#[0-9a-f]{6}$/i.test(p.color)) return L("Ugyldig markørfarge", "Invalid marker color");
  return patternSpecError(p.spec);
}

/**
 * Planlegger hendelser i [fromFrame, toFrame) – deterministisk fra seed og innstillinger (§63).
 * Planleggingen er uavhengig av utsnittet: hendelsene genereres fra frame 0 og filtreres,
 * slik at samme scene gir samme blink uansett hvor avspillingen starter.
 */
export function planPatternEvents(spec: PatternSpec, fromFrame: number, toFrame: number, fps: number): PatternEvent[] {
  const rand = mulberry32(spec.seed);
  const pick = (min: number, max: number, vary: boolean) => (vary && max > min ? min + rand() * (max - min) : (min + max) / 2);
  const events: PatternEvent[] = [];
  let t = 0;
  while (t < toFrame && events.length < MAX_PATTERN_EVENTS) {
    const duration = Math.max(1, Math.round(pick(spec.durationMinFrames, spec.durationMaxFrames, spec.vary.duration)));
    const intensity = spec.vary.intensity ? Math.max(0, Math.min(1, spec.intensity * (0.7 + rand() * 0.6))) : spec.intensity;
    if (t + duration > fromFrame) events.push({ frame: Math.round(t), endFrame: Math.round(t + duration), intensity });
    const intervalMs = pick(spec.intervalMinMs, spec.intervalMaxMs, spec.vary.interval);
    t += duration + (intervalMs / 1000) * fps;
  }
  return events;
}

/** Hendelsen som dekker en frame, eller null. */
export function patternEventAt(events: readonly PatternEvent[], frame: number): PatternEvent | null {
  for (const e of events) if (frame >= e.frame && frame < e.endFrame) return e;
  return null;
}

export const DEFAULT_BLINK_SPEC: PatternSpec = {
  format: 1,
  target: "eyes",
  intervalMinMs: 3000,
  intervalMaxMs: 8000,
  durationMinFrames: 3,
  durationMaxFrames: 7,
  intensity: 1,
  seed: 18427,
  vary: { interval: true, duration: true, intensity: false },
  algorithmVersion: PATTERN_ALGORITHM_VERSION,
};
