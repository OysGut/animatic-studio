// @vitest-environment node
/** Lyd med AI (DEC-0069, Mars: «og lyder?»). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSoundPrompt, estimateCostUsd, providersFor } from "@/core";
import { ADAPTERS } from "@/adapters/ai/providers.server";

describe("lyd med AI", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lydleverandør tilbys bare når en eier har koblet til ElevenLabs", () => {
    expect(providersFor("sound", new Set(["lovable", "openai"]))).toEqual([]);
    const opts = providersFor("sound", new Set(["elevenlabs"]));
    expect(opts.map((o) => o.provider.id)).toEqual(["elevenlabs"]);
    expect(opts[0]!.models.every((m) => m.capability === "sound")).toBe(true);
  });

  it("standardbeskrivelsen bygges av navn, beskrivelse og tilstand", () => {
    expect(
      defaultSoundPrompt({ name: "Dørknirk", description: "Gammel låvedør. " }, { appearance: "" }),
    ).toBe("Dørknirk. Gammel låvedør");
    expect(defaultSoundPrompt({ name: "Vind", description: "" }, null)).toBe("Vind");
    expect(
      defaultSoundPrompt({ name: "x".repeat(900), description: "y".repeat(900) }, null),
    ).toHaveLength(1000);
  });

  it("kostnadsanslaget følger lengden", () => {
    const m = providersFor("sound", new Set(["elevenlabs"]))[0]!.models[0]!;
    const ten = estimateCostUsd("elevenlabs", m.id, { seconds: 10 });
    const twenty = estimateCostUsd("elevenlabs", m.id, { seconds: 20 });
    expect(ten).not.toBe(null);
    expect(twenty!).toBeGreaterThanOrEqual(ten!);
  });

  it("ElevenLabs: lengde og løkke sendes med, og MP3 kommer tilbake", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toContain("/sound-generation");
        expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("el-key");
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(new Uint8Array([0xff, 0xfb, 1]), {
          headers: { "content-type": "audio/mpeg" },
        });
      }),
    );
    const out = await ADAPTERS.elevenlabs.sound({
      key: "el-key",
      model: "eleven_text_to_sound_v2",
      prompt: "Creaking barn door",
      seconds: 5,
      loop: true,
    });
    expect([...out.bytes]).toEqual([0xff, 0xfb, 1]);
    expect(bodies[0]).toMatchObject({
      text: "Creaking barn door",
      duration_seconds: 5,
      loop: true,
    });
    await ADAPTERS.elevenlabs.sound({
      key: "el-key",
      model: "eleven_text_to_sound_v2",
      prompt: "Wind",
      seconds: null,
      loop: false,
    });
    expect(bodies[1]).not.toHaveProperty("duration_seconds");
  });

  it("ElevenLabs: avvist nøkkel gir en feil, ikke en tom lyd", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: { message: "invalid" } }), { status: 401 }),
      ),
    );
    await expect(
      ADAPTERS.elevenlabs.sound({
        key: "x",
        model: "eleven_text_to_sound_v2",
        prompt: "a",
        seconds: null,
        loop: false,
      }),
    ).rejects.toThrow();
  });
});
