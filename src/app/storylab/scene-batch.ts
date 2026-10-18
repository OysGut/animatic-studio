/** SL5: variantbolker bruker SL4-motoren og lagrer hver tur før neste kall. */
import { activeDirections, characterSystemPrompt, emptyStoryProfile, groupTurnMessages, knowledgeAt, newId, replayTurns, suggestSpeaker, type ProjectState, type StoryProfile } from "@/core";
import type { StoredTurn, StorySession } from "@/adapters/storylab/sessions.functions";

export async function runSceneBatch({ state, session, language, generate, save, shouldStop = () => false }: {
  state: ProjectState; session: StorySession; language: string;
  generate: (input: { system: string; messages: { role: "user" | "assistant"; content: string }[] }) => Promise<{ text: string; costUsd: number; usedFallback: boolean }>;
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
      system: characterSystemPrompt({ name: names[speaker] ?? "?", profile: profiles[speaker] ?? emptyStoryProfile(),
        knowledge: knowledgeAt(state, speaker, sceneId as never), situation: String(session.context["situation"] ?? ""),
        directions: activeDirections(engine, speaker), language, names }),
      messages: groupTurnMessages(engine, speaker, names).messages,
    });
    const turn: StoredTurn = { id: newId<"turn">(), speaker, text: result.text, kind: "line", at: new Date().toISOString() };
    await save(turn, result.costUsd);
    turns.push(turn);
  }
  return turns;
}