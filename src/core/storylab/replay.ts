/** Story Lab: gjenskaper turmaskinen fra lagrede turer, også eldre regi-ID-er. */
import { ANALYST, newEngineState, reduceEngine, type DirectionScope, type EngineMode, type EngineState, type Turn } from "./engine";

export interface ReplayOptions {
  readonly participants: readonly string[];
  readonly mode: EngineMode;
  readonly seed: number;
  readonly maxTurnsPerRun?: number;
}

/** En enkelt deltaker beholder SL3s signatur og tak; grupper bruker standardtaket på åtte. */
export function replayTurns(input: string | ReplayOptions, turns: readonly Turn[]): EngineState {
  const options = typeof input === "string"
    ? { participants: [input], mode: "qa" as const, seed: 1, maxTurnsPerRun: 100 }
    : input;
  let s = reduceEngine(newEngineState(options), { type: "start" });
  for (const t of turns) {
    if (s.status === "paused") s = reduceEngine(s, { type: "resume" });
    if (t.kind === "question") {
      s = reduceEngine(s, { type: "ask", id: t.id, text: t.text, to: t.to ?? (typeof input === "string" ? input : null), at: t.at });
    } else if (t.kind === "direction") {
      if (t.id.startsWith("r:")) s = reduceEngine(s, { type: "removeDirection", id: t.id.slice(2) });
      else {
        const match = /^d:(next|scene|session):(.+)$/.exec(t.id);
        const scope = (match?.[1] ?? "session") as DirectionScope;
        const rest = match?.[2] ?? "";
        const separator = rest.indexOf(":");
        const encodedTarget = separator >= 0 ? rest.slice(0, separator) : undefined;
        const target = encodedTarget === "all" ? null : encodedTarget ?? t.to ?? (typeof input === "string" ? input : null);
        s = reduceEngine(s, { type: "direct", id: t.id, text: t.text, target, scope, at: t.at });
      }
    } else {
      s = reduceEngine(s, { type: "appendLine", id: t.id, speaker: t.kind === "analysis" ? ANALYST : t.speaker, text: t.text, at: t.at });
    }
  }
  if (typeof input === "string" && s.status === "paused") s = reduceEngine(s, { type: "resume" });
  return s;
}