// @vitest-environment node
/** Innsatsnivå og kvalitetsmekanismer (mandat 19.3–19.4, REQ-0275–0278, DEC-0070). */
import { describe, expect, it } from "vitest";
import {
  effortDisclaimer,
  PROVIDERS,
  effortChoice,
  effortOf,
  qualityMechanisms,
  providerModel,
} from "@/core";

describe("innsatsnivå", () => {
  it("hver modell med egen nøkkel har et nivå og en grense for beskrivelsen", () => {
    for (const p of PROVIDERS)
      for (const m of p.models) {
        expect(m.tier, `${p.id}/${m.id}`).toBeDefined();
        expect(m.maxPromptChars, `${p.id}/${m.id}`).toBeGreaterThan(100);
      }
  });

  it("nivået velger modell blant det som er koblet til – billigst ved rask, dyrest ved premium", () => {
    const all = new Set(["openai", "google", "fal", "runway"]);
    expect(effortChoice("video", "fast", all)?.model.id).toBe("gen4_turbo");
    const premium = effortChoice("video", "premium", all)!;
    expect(premium.model.tier).toBe("premium");
    expect(premium.model.priceUsd).toBeGreaterThanOrEqual(0.4);
    expect(effortChoice("video", "balanced", all)?.model.id).toBe("sora-2");
    // Bare én videomodell: alle nivåer gir den (nærmeste)
    const only = new Set(["runway"]);
    expect(effortChoice("video", "premium", only)?.model.id).toBe("gen4_turbo");
    expect(effortChoice("video", "fast", new Set())).toBe(null);
    // Innebygd leverandør regnes som én modell (den velger selv etter formålet)
    expect(effortChoice("image", "premium", new Set())?.provider.id).toBe("lovable");
    expect(effortChoice("image", "premium", new Set())?.model.id).toBe("openai/gpt-image-2");
  });

  it("viser bare mekanismene modellen faktisk har, og lover ikke bedre resultat for pris", () => {
    const veo = providerModel("google", "veo-3.1-generate-preview")!;
    const mech = qualityMechanisms(veo);
    expect(mech).toContain("Startbilde");
    expect(mech.some((x) => x.startsWith("Lengde 4, 6 eller 8"))).toBe(true);
    expect(mech).toContain("Lyd i videoen");
    expect(mech).not.toContain("Gjennomsiktig bakgrunn");
    const kling = qualityMechanisms(
      providerModel("fal", "fal-ai/kling-video/v3/4k/image-to-video")!,
    );
    expect(kling).toContain("Lengde 3–15 s");
    const sun = qualityMechanisms(providerModel("openai", "gpt-image-2.5-sunburst")!);
    expect(sun).toContain("Gjennomsiktig bakgrunn");
    expect(sun.some((x) => x.startsWith("Flere kandidater"))).toBe(true);
    expect(effortOf(providerModel("runway", "gen4_turbo"))).toBe("fast");
    expect(effortDisclaimer()).toMatch(/ingen garanti/);
  });
});
