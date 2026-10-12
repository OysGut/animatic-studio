/** REQ-0273 (DEC-0075): katalogen beskriver modellenes faktiske muligheter strukturert. */
import { describe, expect, it } from "vitest";
import { PROVIDERS, estimateCostUsd, modelCapabilities, providerModel } from "@/core";

describe("modelCapabilities", () => {
  it("alle modeller har oppgave, kostnadsmodell og innsatsnivå; video har lengder og oppløsning", () => {
    for (const p of PROVIDERS)
      for (const m of p.models) {
        const c = modelCapabilities(m);
        expect(c.task).toBe(m.capability);
        expect(c.costModel.priceUsd).toBeGreaterThan(0);
        if (m.capability === "video") {
          expect(c.maxVideoSeconds).toBeGreaterThan(0);
          expect(c.resolution).not.toBeNull();
          expect(c.timeLimits.length).toBeGreaterThan(0);
        }
        if (m.capability === "sound" || m.capability === "speech")
          expect(c.audio.length).toBeGreaterThan(0);
      }
  });

  it("startbilde-modeller kan ikke lage video fra tekst alene", () => {
    const runway = modelCapabilities(providerModel("runway", "gen4_turbo")!);
    expect(runway.textToVideo).toBe(false);
    expect(runway.imageToVideo).toBe(true);
    expect(runway.limits).toContain("Må ha startbilde");
    expect(modelCapabilities(providerModel("openai", "sora-2")!).textToVideo).toBe(true);
  });

  it("lyd har tidsbegrensning", () => {
    const s = modelCapabilities(providerModel("elevenlabs", "eleven_text_to_sound_v2")!);
    expect(s.timeLimits).toEqual(["Lydlengde 0,5–30 s"]);
  });
});

describe("estimateCostUsd med ugyldige tall (DEC-0075, kodegjennomgang)", () => {
  it("NaN og uendelig gir ukjent pris, ikke NaN", () => {
    expect(estimateCostUsd("elevenlabs", "eleven_text_to_sound_v2", { seconds: NaN })).toBeNull();
    expect(estimateCostUsd("runway", "gen4_turbo", { seconds: Infinity })).toBeNull();
    expect(estimateCostUsd("runway", "gen4_turbo", { seconds: 5 })).toBeGreaterThan(0);
  });
});
