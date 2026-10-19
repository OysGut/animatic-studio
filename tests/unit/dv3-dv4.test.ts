// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCommand, groupDialogueTracks, suggestedDialogueCharacter, dialogueTrackLabel, assetVoiceError, speechSettingsError, speechLanguageError, versionsOfClip, type Command } from "@/core";
import { ADAPTERS } from "@/adapters/ai/providers.server";
import { envelope } from "../helpers/fixtures";
import { dvBase, dvId } from "../helpers/dialogue-fixture";

describe("DV3 confirmed character tracks", () => {
  it("keeps legacy identity unlinked until confirmed and supports undo/redo", () => {
    const { s, clipId } = dvBase();
    const clip = s.audioClips[clipId]; if (!clip) throw new Error("fixture");
    const character = suggestedDialogueCharacter(s, clip.occurrenceId, clip.blockId);
    expect(character).not.toBeNull(); if (!character) return;
    expect(clip.characterAssetId ?? null).toBeNull();
    const c: Command = { type: "SetDialogueCharacter", clipIds: [clip.id], characterAssetId: character.id };
    const changed = applyCommand(s, envelope(c)); if (!changed.ok) throw new Error(changed.error.message);
    expect(changed.state.audioClips[clipId]?.characterAssetId).toBe(character.id);
    expect(dialogueTrackLabel(changed.state, changed.state.audioClips[clipId] ?? clip)).toBe(character.name);
    expect(changed.state.dialogueVersions).toEqual(s.dialogueVersions);
    const undo = applyCommand(changed.state, envelope(changed.inverse)); if (!undo.ok) throw new Error(undo.error.message);
    expect(undo.state.audioClips[clipId]?.characterAssetId).toBeNull();
    const redo = applyCommand(undo.state, envelope(undo.inverse)); if (!redo.ok) throw new Error(redo.error.message);
    expect(redo.state.audioClips[clipId]?.characterAssetId).toBe(character.id);
  });
  it("projects two lines on one character row, not a row per version", () => {
    const { s, clipId } = dvBase(); const clip = s.audioClips[clipId]; if (!clip) throw new Error("fixture");
    const other = { ...clip, id: dvId(99) as typeof clip.id, offsetMs: 9000 };
    const groups = groupDialogueTracks(s, [{ clip }, { clip: other }]);
    expect(groups).toHaveLength(1); expect(groups[0]?.items).toHaveLength(2);
    expect(groups[0]?.label).not.toBe(clip.name);
    expect(versionsOfClip(s, clipId).length).toBeGreaterThan(0);
  });
});

describe("DV4 voice defaults and live capabilities", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("validates exact provider setting limits", () => {
    expect(speechSettingsError({ speed: 0.7, stability: 0, similarity_boost: 1, style: 1, use_speaker_boost: true })).toBeNull();
    expect(speechSettingsError({ speed: 1.2 })).toBeNull();
    expect(speechSettingsError({ speed: 1.21 })).not.toBeNull();
    expect(speechSettingsError({ unexpected: 1 })).not.toBeNull();
    expect(assetVoiceError({ provider: "elevenlabs", voiceId: "abc", label: "Own voice", modelId: "eleven_v3", language: "es", settings: { speed: 1 } })).toBeNull();
  });
  it("changing the default preserves all previous audio and undo restores every setting", () => {
    const { s } = dvBase(); const character = Object.values(s.assets).find(a => a.kind === "character"); if (!character) throw new Error("fixture");
    const c: Command = { type: "SetAssetVoice", assetId: character.id, voice: { provider: "elevenlabs", voiceId: "custom", label: "Own voice", modelId: "model_live", language: "es", settings: { speed: 1.2, stability: 0.5 } } };
    const changed = applyCommand(s, envelope(c)); if (!changed.ok) throw new Error(changed.error.message);
    expect(changed.state.assets[character.id]?.voice).toEqual(c.voice);
    expect(changed.state.dialogueVersions).toEqual(s.dialogueVersions);
    expect(changed.state.assetVersions).toEqual(s.assetVersions);
    const undo = applyCommand(changed.state, envelope(changed.inverse)); if (!undo.ok) throw new Error(undo.error.message);
    expect(undo.state.assets[character.id]?.voice ?? null).toEqual(character.voice ?? null);
  });
  it("reads provider models/languages and sends local settings without language fallback", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.endsWith("/models")) return new Response(JSON.stringify([{ model_id: "live_model", name: "Live", can_do_text_to_speech: true, languages: [{ language_id: "es", name: "Spanish" }], maximum_text_length_per_request: 1234, character_cost_multiplier: 0.5 }, { model_id: "no_tts", can_do_text_to_speech: false }]));
      return new Response(new Uint8Array([1, 2]));
    }));
    const models = await ADAPTERS.elevenlabs.speechModels("mock"); expect(models).toHaveLength(1);
    const model = models[0]; if (!model) throw new Error("model");
    expect(model.maxCharacters).toBe(1234); expect(model.costMultiplier).toBe(0.5);
    expect(speechLanguageError(model, "es")).toBeNull(); expect(speechLanguageError(model, "no")).not.toBeNull();
    await ADAPTERS.elevenlabs.speech({ key: "mock", model: "live_model", voiceId: "custom", language: "es", text: "Hola", settings: { speed: 1.2 } });
    expect(calls.at(-1)?.body).toEqual({ text: "Hola", model_id: "live_model", language_code: "es", voice_settings: { speed: 1.2 } });
  });
});