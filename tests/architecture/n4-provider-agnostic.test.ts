// N4 / REQ-0269: et nytt leverandøradapter skal kunne legges til uten endring i
// kjerne-, manus- eller tidslinjemoduler. Leverandørnavn og leverandørkode skal
// bare finnes i generation-laget og adapterne, aldri i manus, montering, kommandoer
// eller datamodell.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROVIDERS } from "@/core/generation/providers";

const NEUTRAL = ["src/core/screenplay", "src/core/assembly", "src/core/commands", "src/core/continuity", "src/core/model.ts", "src/core/time.ts"];

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name))).filter((f) => /\.(ts|tsx)$/.test(f));
}

describe("REQ-0269 leverandøruavhengig AI-arkitektur", () => {
  const sources = NEUTRAL.flatMap(files).map((f) => [f, readFileSync(f, "utf8")] as const);

  it("manus, montering, kommandoer og datamodell importerer verken leverandørkatalogen, leverandørkode eller adaptere", () => {
    const bad = sources.filter(([, src]) => /from\s+["'](@\/adapters|[./@a-z]*generation\/(providers|speech|model-settings))["']/.test(src)).map(([f]) => f);
    expect(bad).toEqual([]);
  });

  it("ingen leverandør-ID står i de nøytrale modulene", () => {
    const ids = PROVIDERS.map((p) => p.id).filter((id) => id.length > 3);
    expect(ids.length).toBeGreaterThan(2);
    const hits = sources.flatMap(([f, src]) => ids.filter((id) => new RegExp(`["'\`]${id}["'\`]`).test(src)).map((id) => `${f}: ${id}`));
    // N5: avviket i AssetVoice.provider er rettet; listen skal være tom.
    expect(hits).toEqual([]);
  });
});

describe("REQ-0269 stemmeleverandør fra katalogen (N5)", () => {
  it("eksisterende «elevenlabs»-stemmer godtas uendret; ukjente eller ikke-tale-leverandører avvises", async () => {
    const { assetVoiceError } = await import("@/core/dialogue/voice");
    expect(assetVoiceError({ provider: "elevenlabs", voiceId: "abc_1", label: "Mor" })).toBeNull();
    expect(assetVoiceError({ provider: "ukjent", voiceId: "abc_1", label: "Mor" })).not.toBeNull();
    const nonSpeech = PROVIDERS.find((p) => !p.capabilities.includes("speech"))!;
    expect(assetVoiceError({ provider: nonSpeech.id, voiceId: "abc_1", label: "Mor" })).not.toBeNull();
  });
});
