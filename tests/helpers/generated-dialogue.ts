import { suggestedDialogueCharacter, type Command } from "@/core";
import { dvBase, dvId } from "./dialogue-fixture";
export function generatedCommand(s: ReturnType<typeof dvBase>["s"], clipId: string, n = 100): Extract<Command, { type: "ApplyGeneratedDialogue" }> {
  const clip = s.audioClips[clipId]; if (!clip?.blockId) throw new Error("fixture");
  const character = suggestedDialogueCharacter(s, clip.occurrenceId, clip.blockId); if (!character) throw new Error("character");
  return { type: "ApplyGeneratedDialogue", occurrenceId: clip.occurrenceId, blockId: clip.blockId, characterId: character.id, assetId: dvId(n), variantId: dvId(n+1), versionId: dvId(n+2), clipId: dvId(n+3), dialogueVersionId: dvId(n+4), compositionId: dvId(n+5), language: "es-MX", media: { path: `${s.project.id}/${dvId(n)}/${dvId(n+2)}/speech.mp3`, mimeType: "audio/mpeg", width: null, height: null, byteSize: 1000, sha256: "a".repeat(64), durationMs: 2400 }, metadata: { source: "ai", provider: "elevenlabs", modelId: "eleven_v3", voiceId: "mock_voice", settings: { language: "es-MX" }, scriptRevision: s.blocks[clip.blockId]?.currentRev ?? 1, parentVersionId: null } };
}
