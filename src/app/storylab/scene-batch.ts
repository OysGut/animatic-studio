/** SL5: variantbolker bruker SL4-motoren og lagrer hver tur før neste kall. */
import { activeDirections, groupTurnMessages, newId, replayTurns, suggestSpeaker, type ProjectState, type StoryProfile } from "@/core";
import type { StoredTurn, StorySession } from "@/adapters/storylab/sessions.functions";

/** Parameterne for én replikk i rollen; systemteksten bygges på serveren (B-105a). */
export interface StoryCharacterRequest {
  readonly kind: "character";
  readonly assetId: string;
  readonly sceneId: string | null;
  readonly situation: string;
  readonly profile: StoryProfile | null;
  readonly directions: readonly string[];
  readonly language: string;
}

export async function runSceneBatch({ state, session, language, generate, save, shouldStop = () => false }: {
  state: ProjectState; session: StorySession; language: string;
  generate: (input: { request: StoryCharacterRequest; messages: { role: "user" | "assistant"; content: string }[] }) => Promise<{ text: string; costUsd: number; usedFallback: boolean }>;
  save: (turn: StoredTurn, costUsd: number) => Promise<void>;
  shouldStop?: () => boolean;
}) {
  const participants = (session.context["participants"] as string[]) ?? [];
  const profiles = (session.context["profiles"] ?? {}) as Record<string, StoryProfile | null>;
  const sceneId = typeof session.context["sceneId"] === "string" ? session.context["sceneId"] : null;
  const names = Object.fromEntries(participants.map((id) => [id, state.assets[id]?.name ?? "?"]));
  const turns = [...session.turns];
  for (let i = 0; i < 8 && !shouldStop(); i++) {
    const engine = replayTurns({ participants, mode: "improv", seed: Number(session.context["seed"] ?? 1) }, turns);
    const speaker = suggestSpeaker(engine, names);
    if (!speaker) throw new Error("No speaker");
    const result = await generate({
      // B-105a: serveren bygger systemteksten; vi sender bare parametere.
      request: { kind: "character", assetId: speaker, sceneId, situation: String(session.context["situation"] ?? ""),
        profile: profiles[speaker] ?? null, directions: activeDirections(engine, speaker).map((d) => d.text), language },
      messages: groupTurnMessages(engine, speaker, names).messages,
    });
    const turn: StoredTurn = { id: newId<"turn">(), speaker, text: result.text, kind: "line", at: new Date().toISOString() };
    await save(turn, result.costUsd);
    turns.push(turn);
  }
  return turns;
}