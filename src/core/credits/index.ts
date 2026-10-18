/**
 * Rulletekst (MTS MT7, §16–26): deltakerregisteret er adskilt fra malen, og lagene for deltakerne lagres
 * ikke – renderFrame lager dem virtuelt fra sekvensen, deltakerne og tiden (§63), så 2000 deltakere ikke
 * gir 2000 lag. Alt skrives via kommandoer (angre/gjør om), og rekkefølge og skjuling endrer aldri malen.
 */
import { L } from "../i18n";
import { compareKeys } from "../order-key";
import {
  CREDIT_PARTICIPANTS_MAX,
  CREDIT_PRESENTATIONS,
  occurrenceKind,
  type CreditParticipant,
  type CreditSequence,
  type ProjectState,
} from "../model";
import type { CreditParticipantId, CreditSequenceId, OccurrenceId } from "../ids";

/** Feltnøklene som brukes i standardoppsettet (malen kan ha flere; deltakerens `fields` følger malen). */
export const CREDIT_FIELD_KEYS = ["navn", "rolle"] as const;

/** Synlige deltakere i rekkefølge (skjulte tas aldri med; rekkefølgen endrer ikke malen). */
export function creditParticipantsOf(
  s: ProjectState,
  occurrenceId?: string,
): CreditParticipant[] {
  const seq = occurrenceId ? creditSequenceOf(s, occurrenceId) : null;
  void seq;
  return Object.values(s.creditParticipants)
    .filter((p) => !p.removed && !p.hidden)
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey) || (a.id < b.id ? -1 : 1));
}

/** Rulletekstsekvensen for en forekomst (én per forekomst), eller null. */
export function creditSequenceOf(s: ProjectState, occurrenceId: string): CreditSequence | null {
  return (
    Object.values(s.creditSequences).find(
      (q) => q.occurrenceId === occurrenceId && !q.removed,
    ) ?? null
  );
}

/** Validering av en deltaker (brukes av kommandoene). Gir en feilmelding, eller null. */
export function creditParticipantError(
  f: Pick<CreditParticipant, "orderKey" | "groupKey" | "fields">,
): string | null {
  if (!f.orderKey) return L("Ugyldig rekkefølge", "Invalid order");
  if (f.groupKey.length > 200) return L("Gruppenavnet er for langt", "The group name is too long");
  const keys = Object.keys(f.fields);
  if (keys.length > 20) return L("For mange felt (maks 20)", "Too many fields (max 20)");
  for (const k of keys) {
    if (k.length > 100) return L("Feltnavnet er for langt", "The field name is too long");
    const v = f.fields[k]!;
    if (typeof v !== "string" || v.length > 500)
      return L("Feltet er for langt (maks 500 tegn)", "The field is too long (max 500 characters)");
  }
  return null;
}

/** Validering av sekvensen. Gir en feilmelding, eller null. */
export function creditSequenceError(
  f: Pick<CreditSequence, "presentation" | "durationFrames" | "pauseFrames" | "speed" | "direction">,
): string | null {
  if (!CREDIT_PRESENTATIONS.includes(f.presentation))
    return L("Ugyldig presentasjonsform", "Invalid presentation");
  if (!Number.isInteger(f.durationFrames) || f.durationFrames < 1 || f.durationFrames > 1_000_000)
    return L("Ugyldig varighet per deltaker", "Invalid duration per participant");
  if (!Number.isInteger(f.pauseFrames) || f.pauseFrames < 0 || f.pauseFrames > 100_000)
    return L("Ugyldig pause", "Invalid pause");
  if (!Number.isFinite(f.speed) || f.speed <= 0 || f.speed > 1000)
    return L("Ugyldig hastighet", "Invalid speed");
  if (f.direction !== "up" && f.direction !== "down") return L("Ugyldig retning", "Invalid direction");
  return null;
}

/** Standardsekvensen for en ny rulletekst. */
export function defaultCreditSequence(
  id: CreditSequenceId,
  occurrenceId: OccurrenceId,
): Omit<CreditSequence, "revision"> {
  return {
    id,
    occurrenceId,
    presentation: "roll",
    durationFrames: 96,
    pauseFrames: 12,
    transition: null,
    speed: 4,
    direction: "up",
    removed: false,
  };
}

// ---------- Virtuell tegning (§63) ----------

export interface CreditLine {
  readonly participantId: CreditParticipantId;
  readonly groupKey: string;
  /** Tekstlinjene (feltverdiene i feltrekkefølge). */
  readonly lines: readonly string[];
}

/** Linjene som tegnes, i rekkefølge (skjulte og slettede deltakere er ikke med). */
export function creditLines(s: ProjectState): CreditLine[] {
  return creditParticipantsOf(s).map((p) => ({
    participantId: p.id,
    groupKey: p.groupKey,
    lines: Object.values(p.fields).filter((v) => v.trim() !== ""),
  }));
}

const LINE_HEIGHT = 64;
const GROUP_GAP = 48;

/**
 * Høyden på hele rulleteksten i piksler (virtuell – ingen lag lagres). Grupper får et lite mellomrom.
 * Ren funksjon av deltakerne, så resultatet er forutsigbart.
 */
export function creditContentHeight(lines: readonly CreditLine[]): number {
  let h = 0;
  let prevGroup: string | null = null;
  for (const l of lines) {
    if (prevGroup !== null && l.groupKey !== prevGroup) h += GROUP_GAP;
    h += Math.max(1, l.lines.length) * LINE_HEIGHT;
    prevGroup = l.groupKey;
  }
  return h;
}

export interface CreditDrawText {
  readonly participantId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly size: number;
  readonly groupKey: string;
}

/**
 * Tekstelementene som er synlige på et bilde av rulleteksten – bare de som er i bildet (virtuell tegning,
 * §63). `frame` er bildet i 2D-scenen; `width`/`height` er formatet. Ren funksjon av tiden.
 *
 * - `roll`: hele listen ruller (opp eller ned) med `speed` piksler per bilde.
 * - `one_at_a_time`: én deltaker om gangen, `durationFrames` per deltaker med `pauseFrames` pause.
 * - `positions`: deltakerne står på faste plasser, én om gangen som `one_at_a_time`.
 */
export function creditDrawTexts(
  s: ProjectState,
  seq: CreditSequence,
  frame: number,
  width: number,
  height: number,
): CreditDrawText[] {
  const lines = creditLines(s);
  const out: CreditDrawText[] = [];
  const cx = width / 2;
  if (seq.presentation === "roll") {
    const total = creditContentHeight(lines);
    const travel = height + total;
    const raw = seq.direction === "up" ? frame * seq.speed : travel - frame * seq.speed;
    const offset = height - raw;
    let y = offset;
    let prevGroup: string | null = null;
    for (const l of lines) {
      if (prevGroup !== null && l.groupKey !== prevGroup) y += GROUP_GAP;
      prevGroup = l.groupKey;
      const texts = l.lines.length ? l.lines : [""];
      for (const text of texts) {
        // Bare det som er synlig i bildet, lages (2000 deltakere uten treghet, §63)
        if (y > -LINE_HEIGHT && y < height + LINE_HEIGHT)
          out.push({
            participantId: l.participantId,
            text,
            x: cx,
            y,
            opacity: 1,
            size: 40,
            groupKey: l.groupKey,
          });
        y += LINE_HEIGHT;
      }
    }
    return out;
  }
  // one_at_a_time / positions: én deltaker om gangen
  const per = seq.durationFrames + seq.pauseFrames;
  const idx = Math.floor(frame / per);
  const into = frame - idx * per;
  const cur = lines[idx];
  if (!cur || into >= seq.durationFrames) return out;
  // Overgangen inn (og ut) toner teksten
  const tFrames = seq.transition && seq.transition.frames > 0 ? seq.transition.frames : 0;
  let opacity = 1;
  if (tFrames > 0) {
    if (into < tFrames) opacity = (into + 1) / tFrames;
    const left = seq.durationFrames - into;
    if (left < tFrames) opacity = Math.min(opacity, (left + 1) / tFrames);
  }
  const texts = cur.lines.length ? cur.lines : [""];
  const blockH = texts.length * LINE_HEIGHT;
  let y = height / 2 - blockH / 2;
  for (const text of texts) {
    out.push({
      participantId: cur.participantId,
      text,
      x: cx,
      y,
      opacity,
      size: 40,
      groupKey: cur.groupKey,
    });
    y += LINE_HEIGHT;
  }
  return out;
}

/** Total varighet i bilder for one_at_a_time/positions (roll: nok til å rulle hele listen). */
export function creditDurationFrames(
  s: ProjectState,
  seq: CreditSequence,
  height: number,
): number {
  const lines = creditLines(s);
  if (seq.presentation === "roll") {
    const total = creditContentHeight(lines);
    return Math.max(1, Math.ceil((height + total) / seq.speed));
  }
  return Math.max(1, lines.length * (seq.durationFrames + seq.pauseFrames));
}

/** Er forekomsten en rulletekstscene med sekvens? */
export function isCreditsOccurrence(s: ProjectState, occurrenceId: string): boolean {
  const o = s.occurrences[occurrenceId];
  return !!o && occurrenceKind(o) === "credits";
}

export { CREDIT_PARTICIPANTS_MAX };
