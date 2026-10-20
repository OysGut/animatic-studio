/**
 * Tidsoppsett for en 2D-scene (SV1, B-041, migrasjon 0042): låste tidsrom og fyll i tid som er lagt til i
 * starten eller slutten av scenen. Rene funksjoner; samme regler i forhåndsvisning og eksport (renderFrame).
 */
import { L } from "../i18n";
import { t as tk } from "@/core/i18n/keyed";

/** Hva tid som er lagt til i starten eller slutten viser. */
export type PaddingFill = "freeze" | "background" | "black";

export interface CompositionPadding {
  readonly frames: number;
  readonly fill: PaddingFill;
}

/** Et tidsrom som ikke skal endres når scenen strekkes eller får tiden fordelt (metode 3–5). */
export interface LockedRange {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly label: string;
}

export interface CompositionTiming {
  readonly lockedRanges: readonly LockedRange[];
  readonly padding: {
    readonly start: CompositionPadding | null;
    readonly end: CompositionPadding | null;
  };
}

export const EMPTY_TIMING: CompositionTiming = {
  lockedRanges: [],
  padding: { start: null, end: null },
};

export const MAX_LOCKED_RANGES = 50;
const FILLS: readonly PaddingFill[] = ["freeze", "background", "black"];

export function timingOf(c: { readonly timing?: CompositionTiming }): CompositionTiming {
  return c.timing ?? EMPTY_TIMING;
}

export function isEmptyTiming(t: CompositionTiming): boolean {
  return t.lockedRanges.length === 0 && !t.padding.start && !t.padding.end;
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

function padding(v: unknown): CompositionPadding | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return undefined;
  const p = v as Record<string, unknown>;
  if (!int(p["frames"]) || !FILLS.includes(p["fill"] as PaddingFill)) return undefined;
  return p["frames"] === 0 ? null : { frames: p["frames"], fill: p["fill"] as PaddingFill };
}

/** Kontroll av tidsoppsettet (lagret som jsonb). */
export function normalizeTiming(
  v: unknown,
): { ok: true; value: CompositionTiming } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  if (v === null || v === undefined) return { ok: true, value: EMPTY_TIMING };
  if (typeof v !== "object") return bad(tk("core-composition-timing.normalize-timing.bad.143afa9c7d46"));
  const o = v as Record<string, unknown>;
  const list = Array.isArray(o["lockedRanges"]) ? (o["lockedRanges"] as unknown[]) : [];
  if (list.length > MAX_LOCKED_RANGES)
    return bad(tk("core-composition-timing.normalize-timing.bad.08d1fcd8892e"));
  const ranges: LockedRange[] = [];
  for (const r of list) {
    const x = (r ?? {}) as Record<string, unknown>;
    if (
      typeof x["id"] !== "string" ||
      x["id"].length < 1 ||
      x["id"].length > 64 ||
      !int(x["startFrame"]) ||
      !int(x["endFrame"]) ||
      x["endFrame"] <= x["startFrame"]
    )
      return bad(tk("core-composition-timing.normalize-timing.bad.6cd0c4eeb6a1"));
    ranges.push({
      id: x["id"],
      startFrame: x["startFrame"],
      endFrame: x["endFrame"],
      label: typeof x["label"] === "string" ? x["label"].slice(0, 200) : "",
    });
  }
  ranges.sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i]!.startFrame < ranges[i - 1]!.endFrame)
      return bad(tk("core-composition-timing.normalize-timing.bad.880c9770a7ec"));
  const p = (o["padding"] ?? {}) as Record<string, unknown>;
  const start = padding(p["start"]);
  const end = padding(p["end"]);
  if (start === undefined || end === undefined)
    return bad(tk("core-composition-timing.normalize-timing.bad.e01bdae2a50b"));
  return { ok: true, value: { lockedRanges: ranges, padding: { start, end } } };
}

/** Hva bildet viser: innhold (eventuelt et annet bilde ved frys), bare bakgrunnen, eller svart. */
export type PaddingView =
  | { readonly kind: "content"; readonly frame: number }
  | { readonly kind: "background"; readonly frame: number }
  | { readonly kind: "black" };

/**
 * Fyll i ny tid (B-041): frys holder første eller siste innholdsbilde, bakgrunn viser bare bakgrunnslagene,
 * svart er svart. Innholdet ligger mellom start- og sluttfyllet; tidene i scenen er ikke forskjøvet her.
 */
export function paddingAt(
  c: { readonly timing?: CompositionTiming; readonly durationFrames: number },
  frame: number,
): PaddingView {
  const t = timingOf(c);
  const start = t.padding.start;
  const end = c.durationFrames > 0 ? t.padding.end : null;
  const pick = (p: CompositionPadding, hold: number): PaddingView =>
    p.fill === "freeze"
      ? { kind: "content", frame: hold }
      : p.fill === "background"
        ? { kind: "background", frame: hold }
        : { kind: "black" };
  if (start && frame < start.frames) return pick(start, start.frames);
  if (end) {
    const first = c.durationFrames - end.frames;
    if (frame >= first) return pick(end, Math.max(0, first - 1));
  }
  return { kind: "content", frame };
}

/**
 * Fordeler `total` (heltall, kan være negativt) etter vektene med største-rest-metoden: summen blir alltid
 * eksakt `total`. Vekter ≤ 0 får 0. Uten positive vekter gis bare nuller (sum 0).
 */
export function distributeLargestRemainder(total: number, weights: readonly number[]): number[] {
  const w = weights.map((x) => (x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return w.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(total));
  const exact = w.map((x) => (abs * x) / sum);
  const out = exact.map((x) => Math.floor(x + 1e-9));
  let rest = abs - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, r: x - Math.floor(x + 1e-9) }))
    .filter((x) => w[x.i]! > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; rest > 0 && order.length > 0; k = (k + 1) % order.length, rest--)
    out[order[k]!.i]! += 1;
  return out.map((x) => x * sign);
}
