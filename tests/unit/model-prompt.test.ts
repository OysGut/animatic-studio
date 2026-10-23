// @vitest-environment node
/** Modellspesifikk beskrivelse (REQ-0246, REQ-0261, REQ-0274, REQ-0489, DEC-0070). */
import { describe, expect, it } from "vitest";
import {
  adaptPromptForModel,
  buildScenePrompt,
  filmClips,
  mainProduction,
  modelHasSound,
  planSegments,
  providerModel,
} from "@/core";
import { fixture } from "../visual/fixture-state";

const runway = providerModel("runway", "gen4_turbo")!;
const veo = providerModel("google", "veo-3.1-generate-preview")!;

const sample = [
  'Animated film shot for "Jula på Dovre". Scene 1: INT. STUA - DAG.',
  "Length: 8.0 seconds.",
  "Style: 2D animation consistent with the approved designs.",
  "Film look: " + "warm painterly look ".repeat(20),
  "Colour palette: " + "deep blue, amber ".repeat(20),
  "Avoid: " + "photorealism, 3D ".repeat(20),
  "Setting: Stua (location).",
  "In this shot:",
  "- Maja (character) — ti år",
  "What happens (screenplay in Norwegian — show it visually):",
  "- Snøen ligger tung over tunet.",
  "Dialogue (Norwegian). Characters must say these lines word for word:",
  "- MAJA: «Hører du det?»",
  "Camera (from the animatic):",
  "- " + "slow push in ".repeat(30),
  "No on-screen text, subtitles, logos or watermarks.",
].join("\n");

describe("beskrivelsen tilpasses modellen", () => {
  it("modell uten lyd: replikkene blir munnbevegelser, ordrett", () => {
    expect(modelHasSound(runway)).toBe(false);
    expect(modelHasSound(veo)).toBe(true);
    const r = adaptPromptForModel(sample, runway);
    expect(r.text).toContain("no sound");
    expect(r.text).toContain("MAJA: «Hører du det?»");
    expect(r.notes.some((n) => /munnbevegelser/.test(n))).toBe(true);
    expect(adaptPromptForModel(sample, veo).text).toContain("must say these lines word for word");
  });

  it("for lang tekst: minst viktige deler tas bort først; handling og replikker beholdes", () => {
    const r = adaptPromptForModel(sample, runway);
    expect(r.text.length).toBeLessThanOrEqual(1000);
    expect(r.text).toContain("Snøen ligger tung");
    expect(r.text).toContain("Hører du det");
    expect(r.text).toContain("Setting: Stua");
    expect(r.text).not.toContain("Avoid:");
    expect(r.text).not.toContain("Colour palette");
    expect(r.notes.join(" ")).toMatch(/fargepalett/);
    // Uendret når den får plass
    const short = "Animated film shot.\nLength: 5.0 seconds.";
    expect(adaptPromptForModel(short, veo)).toEqual({
      text: short,
      notes: [],
      originalLength: short.length,
    });
  });

  it("selv tekst uten deler kortes ved et linjeskift og sier fra", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Linje ${i} med litt tekst.`).join("\n");
    const r = adaptPromptForModel(long, runway);
    expect(r.text.length).toBeLessThanOrEqual(1000);
    expect(r.notes.some((n) => /kortet ned/.test(n))).toBe(true);
  });

  it("ekte scenebeskrivelser fra prosjektet får plass hos alle videomodeller", () => {
    const s = fixture.state;
    const main = mainProduction(s)!;
    for (const clip of filmClips(s, main.id).slice(0, 5))
      for (const [i, seg] of planSegments(s, clip, 10).entries()) {
        const p = buildScenePrompt(s, {
          clip,
          productionId: main.id,
          segment: seg,
          index: i,
          count: 2,
        });
        for (const m of [
          runway,
          veo,
          providerModel("fal", "fal-ai/kling-video/v3/4k/image-to-video")!,
        ])
          expect(adaptPromptForModel(p, m).text.length).toBeLessThanOrEqual(m.maxPromptChars!);
      }
  });

  it("replikkene kuttes aldri: resten kortes; er replikkene alene for lange, stoppes sendingen", () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) => `- MAJA: «Replikk nummer ${i} som må stå ordrett.»`,
    );
    const text = [
      'Animated film shot for "X". Scene 1: INT. STUA - DAG.',
      "Length: 5.0 seconds.",
      "What happens (screenplay in Norwegian — show it visually):",
      ...Array.from({ length: 12 }, (_, i) => `- Handling ${i} ${"som er ganske lang ".repeat(6)}`),
      "Dialogue (Norwegian). Characters must say these lines word for word:",
      ...lines,
    ].join("\n");
    const r = adaptPromptForModel(text, runway);
    expect(r.blocked).toBeUndefined();
    expect(r.text.length).toBeLessThanOrEqual(1000);
    for (const l of lines) expect(r.text).toContain(l.slice(2));
    const huge = [
      "Animated film shot.",
      "Dialogue (Norwegian):",
      ...Array.from({ length: 30 }, (_, i) => `- MAJA: «${"Lang replikk ".repeat(4)}${i}»`),
    ].join("\n");
    const b = adaptPromptForModel(huge, runway);
    expect(b.blocked).toBe(true);
    expect(b.notes.join(" ")).toMatch(/for lange/);
  });
});
