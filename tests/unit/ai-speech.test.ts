// @vitest-environment node
/** Dialog med AI-stemmer (DEC-0071). */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blocksOfVariant,
  filmClips,
  mainProduction,
  sceneDialogueLines,
  SPEECH_MODEL,
  providerModel,
  speechCostUsd,
} from "@/core";
import { ADAPTERS } from "@/adapters/ai/providers.server";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;

describe("replikkene i en scene", () => {
  it("hvem som sier hva, karakteren i biblioteket, og når", () => {
    const clip = filmClips(s0, main.id).find((c) =>
      blocksOfVariant(s0, c.variantId).some((b) => b.kind === "dialogue"),
    )!;
    const lines = sceneDialogueLines(s0, clip);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.text.length > 0)).toBe(true);
    for (let i = 1; i < lines.length; i++)
      expect(lines[i]!.startMs).toBeGreaterThanOrEqual(lines[i - 1]!.startMs);
    const maja = lines.find((l) => /MAJA/i.test(l.speaker));
    if (maja) expect(maja.character?.name).toMatch(/Maja/);
    // En betegnelse i akkurat den linjen går foran (REQ-0127)
    const charBlock = blocksOfVariant(s0, clip.variantId).find((b) => b.kind === "character")!;
    const anne = Object.values(s0.assets).find((a) => a.name.startsWith("Bestemor"))!;
    const s = mustApply(s0, {
      type: "SetContextNames",
      assetId: anne.id,
      contextNames: [{ name: charBlock.text.trim(), blockIds: [charBlock.id] }],
    } as never);
    expect(sceneDialogueLines(s, clip)[0]!.character?.id).toBe(anne.id);
    // Pris per tegn
    expect(speechCostUsd([{ text: "x".repeat(1000) }])).toBeCloseTo(0.3);
  });
});

describe("ElevenLabs tale (falskt nettverk)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("henter stemmer og leser inn med valgt stemme", async () => {
    const calls: { url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.endsWith("/voices"))
          return new Response(
            JSON.stringify({
              voices: [
                {
                  voice_id: "abc123",
                  name: "Ingrid",
                  labels: { accent: "norsk" },
                  preview_url: "https://storage.googleapis.com/eleven/ingrid.mp3",
                },
                { voice_id: "def456", name: "Halvard", preview_url: "http://10.0.0.1/x.mp3" },
                { voice_id: "../ond", name: "x" },
              ],
            }),
          );
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/mpeg" },
        });
      }),
    );
    const v = await ADAPTERS.elevenlabs.voices("k");
    // Lydprøven følger med (bare trygge https-lenker)
    expect(v).toEqual([
      {
        voiceId: "abc123",
        name: "Ingrid",
        description: "norsk",
        previewUrl: "https://storage.googleapis.com/eleven/ingrid.mp3",
      },
      { voiceId: "def456", name: "Halvard", description: "", previewUrl: null },
    ]);
    const out = await ADAPTERS.elevenlabs.speech({
      key: "k",
      model: SPEECH_MODEL,
      voiceId: "abc123",
      text: "Hører du det?",
      language: "no", // regresjonsfixture: norsk sendes eksplisitt (Mars 2026-10-13)
    });
    expect([...out.bytes]).toEqual([1, 2, 3]);
    const last = calls[calls.length - 1]!;
    expect(last.url).toContain("/text-to-speech/abc123");
    // Norsk settes eksplisitt, ellers ble norsk lest som dansk (Mars 2026-10-13)
    expect(last.body).toEqual({
      text: "Hører du det?",
      model_id: "eleven_v3",
      language_code: "no",
    });
    expect(providerModel("elevenlabs", SPEECH_MODEL)?.label).toMatch(/norsk/);
    await expect(
      ADAPTERS.elevenlabs.speech({ key: "k", model: "m", voiceId: "../x", text: "a" }),
    ).rejects.toThrow();
  });
});
