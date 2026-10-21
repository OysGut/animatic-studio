/**
 * Story Lab (SL1): turmaskinen for samtaler (intervju, karaktersamtale, gruppe, scene-improvisasjon).
 * Ren funksjon (state, action) → state. ID-er og tidspunkt kommer inn med handlingene, så maskinen er
 * deterministisk. AI kalles aldri her: klienten ber om neste replikk via generateText og legger den inn
 * med «appendLine».
 */
export type Speaker = string; // assetId | "director" | "analyst"
export const DIRECTOR = "director";
export const ANALYST = "analyst";

export type TurnKind = "line" | "question" | "direction" | "analysis";
export interface Turn {
  readonly id: string;
  readonly speaker: Speaker;
  readonly text: string;
  readonly kind: TurnKind;
  readonly at: string;
  /** Spørsmålet ble rettet til denne karakteren. */
  readonly to?: string | null;
}

export type DirectionScope = "next" | "scene" | "session";
export interface Direction {
  readonly id: string;
  readonly text: string;
  /** null = alle. */
  readonly target: string | null;
  readonly scope: DirectionScope;
  /** Antall turer da regien ble gitt (bare til visning). */
  readonly fromTurn: number;
  /**
   * Turen regien ble gitt etter (REQ-0037): permanent ID, null = før første tur. Mangler i eldre tilstand; da
   * gjelder `fromTurn`.
   */
  readonly afterTurnId?: string | null;
}

export type EngineMode = "qa" | "improv";
export type EngineStatus = "idle" | "running" | "paused" | "stopped";

export interface EngineState {
  readonly participants: readonly string[];
  readonly mode: EngineMode;
  readonly status: EngineStatus;
  readonly turns: readonly Turn[];
  readonly directions: readonly Direction[];
  readonly seed: number;
  readonly maxTurnsPerRun: number;
  readonly turnsThisRun: number;
  /** Valgt neste taler (null = foreslå). */
  readonly nextSpeaker: string | null;
  /** Karakteren regissøren har bedt analytikeren forklare (null = ingen). */
  readonly explainFor: string | null;
}

export const DEFAULT_MAX_TURNS_PER_RUN = 8;
export const MAX_ENGINE_TEXT = 8000;

export type EngineAction =
  | { readonly type: "start" }
  | {
      readonly type: "ask";
      readonly id: string;
      readonly text: string;
      readonly to: string | null;
      readonly at: string;
    }
  | {
      readonly type: "direct";
      readonly id: string;
      readonly text: string;
      readonly target: string | null;
      readonly scope: DirectionScope;
      readonly at: string;
    }
  | { readonly type: "removeDirection"; readonly id: string }
  | { readonly type: "nextSpeaker"; readonly assetId: string | null }
  | {
      readonly type: "appendLine";
      readonly id: string;
      readonly speaker: Speaker;
      readonly text: string;
      readonly at: string;
    }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "stop" }
  /** Forgren etter turen med ID-en (REQ-0037); null = fra start (ingen turer beholdes). */
  | { readonly type: "branchFrom"; readonly turnId: string | null }
  | { readonly type: "explain"; readonly assetId: string };

export function newEngineState(input: {
  readonly participants: readonly string[];
  readonly mode: EngineMode;
  readonly seed: number;
  readonly maxTurnsPerRun?: number;
}): EngineState {
  return {
    participants: [...new Set(input.participants)],
    mode: input.mode,
    status: "idle",
    turns: [],
    directions: [],
    seed: Math.floor(Math.abs(input.seed)) >>> 0,
    maxTurnsPerRun: Math.max(
      1,
      Math.min(100, Math.floor(input.maxTurnsPerRun ?? DEFAULT_MAX_TURNS_PER_RUN)),
    ),
    turnsThisRun: 0,
    nextSpeaker: null,
    explainFor: null,
  };
}

const clip = (t: string) => t.slice(0, MAX_ENGINE_TEXT);

export function reduceEngine(s: EngineState, a: EngineAction): EngineState {
  if (s.status === "stopped" && a.type !== "branchFrom") return s;
  switch (a.type) {
    case "start":
      return s.status === "idle" ? { ...s, status: "running", turnsThisRun: 0 } : s;
    case "ask": {
      const to = a.to !== null && s.participants.includes(a.to) ? a.to : null;
      return {
        ...s,
        status: s.status === "idle" ? "running" : s.status,
        turns: [
          ...s.turns,
          { id: a.id, speaker: DIRECTOR, text: clip(a.text), kind: "question", at: a.at, to },
        ],
        nextSpeaker: to ?? s.nextSpeaker,
      };
    }
    case "direct": {
      if (a.target !== null && !s.participants.includes(a.target)) return s;
      return {
        ...s,
        turns: [
          ...s.turns,
          {
            id: a.id,
            speaker: DIRECTOR,
            text: clip(a.text),
            kind: "direction",
            at: a.at,
            to: a.target,
          },
        ],
        directions: [
          ...s.directions,
          {
            id: a.id,
            text: clip(a.text),
            target: a.target,
            scope: a.scope,
            fromTurn: s.turns.length,
            afterTurnId: s.turns.at(-1)?.id ?? null,
          },
        ],
      };
    }
    case "removeDirection":
      return { ...s, directions: s.directions.filter((d) => d.id !== a.id) };
    case "nextSpeaker":
      if (a.assetId !== null && !s.participants.includes(a.assetId)) return s;
      return { ...s, nextSpeaker: a.assetId };
    case "appendLine": {
      if (s.status !== "running") return s;
      const isAnalyst = a.speaker === ANALYST;
      if (!isAnalyst && !s.participants.includes(a.speaker)) return s;
      const turnsThisRun = s.turnsThisRun + 1;
      return {
        ...s,
        turns: [
          ...s.turns,
          {
            id: a.id,
            speaker: a.speaker,
            text: clip(a.text),
            kind: isAnalyst ? "analysis" : "line",
            at: a.at,
          },
        ],
        // «next»: bare talerens neste tur (eller alles, når målet er alle), så forsvinner den
        directions: isAnalyst
          ? s.directions
          : s.directions.filter(
              (d) => !(d.scope === "next" && (d.target === null || d.target === a.speaker)),
            ),
        nextSpeaker: null,
        explainFor: isAnalyst ? null : s.explainFor,
        turnsThisRun,
        status: turnsThisRun >= s.maxTurnsPerRun ? "paused" : "running",
      };
    }
    case "pause":
      return s.status === "running" ? { ...s, status: "paused" } : s;
    case "resume":
      return s.status === "paused" || s.status === "idle"
        ? { ...s, status: "running", turnsThisRun: 0 }
        : s;
    case "stop":
      return { ...s, status: "stopped" };
    case "branchFrom": {
      const at = a.turnId === null ? -1 : s.turns.findIndex((t) => t.id === a.turnId);
      if (a.turnId !== null && at < 0) return s;
      const turns = s.turns.slice(0, at + 1);
      const pos = new Map(turns.map((t, i) => [t.id, i] as const));
      return {
        ...s,
        turns,
        // Regi som ble gitt før en tur som beholdes (slått opp på turens ID; eldre regi uten ID: antallet)
        directions: s.directions.filter((d) => {
          if (d.afterTurnId === undefined) return d.fromTurn < turns.length;
          const i = d.afterTurnId === null ? -1 : (pos.get(d.afterTurnId) ?? Number.POSITIVE_INFINITY);
          return i < turns.length - 1;
        }),
        status: "paused",
        turnsThisRun: 0,
        nextSpeaker: null,
        explainFor: null,
      };
    }
    case "explain":
      return s.participants.includes(a.assetId) ? { ...s, explainFor: a.assetId } : s;
  }
}

/** Regien som gjelder for karakteren nå (målrettet eller til alle). */
export function activeDirections(s: EngineState, assetId: string): Direction[] {
  return s.directions.filter((d) => d.target === null || d.target === assetId);
}

/** Karakterer som ikke kan tale nå (har hatt de to siste replikkene). */
function blocked(s: EngineState): string | null {
  const lines = s.turns.filter((t) => t.kind === "line");
  const a = lines[lines.length - 1];
  const b = lines[lines.length - 2];
  return a && b && a.speaker === b.speaker ? a.speaker : null;
}

/** Enkel, deterministisk tallfølge (mulberry32). */
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function mentioned(text: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(
    text.toLowerCase(),
  );
}

/**
 * Forslag til neste taler: valgt taler, ellers den som ble tiltalt eller nevnt sist, ellers et deterministisk
 * valg ut fra `seed`. Samme taler kommer aldri tre ganger på rad. null = ingen kan tale.
 */
export function suggestSpeaker(
  s: EngineState,
  names: Readonly<Record<string, string>> = {},
): string | null {
  const no = blocked(s);
  const ok = (id: string | null | undefined): id is string =>
    !!id && s.participants.includes(id) && id !== no;
  if (ok(s.nextSpeaker)) return s.nextSpeaker;
  for (let i = s.turns.length - 1; i >= 0; i--) {
    const t = s.turns[i]!;
    if (t.kind === "question" && ok(t.to)) return t.to;
    const hit = s.participants.find(
      (p) => p !== t.speaker && ok(p) && mentioned(t.text, names[p] ?? ""),
    );
    if (hit) return hit;
    if (t.kind === "line") break; // bare den siste replikken (og det som kom etter) teller
  }
  const lastLine = [...s.turns].reverse().find((t) => t.kind === "line");
  let pool = s.participants.filter((p) => p !== no);
  if (pool.length > 1 && lastLine) pool = pool.filter((p) => p !== lastLine.speaker);
  if (!pool.length) return null;
  const i = Math.floor(
    rand((s.seed ^ Math.imul(s.turns.length + 1, 2654435761)) >>> 0) * pool.length,
  );
  return pool[Math.min(i, pool.length - 1)]!;
}
