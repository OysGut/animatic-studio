// @vitest-environment node
/**
 * B-105a arkitekturvakt: Story Lab- og tekstpromptene bygges bare på serveren. Klientkoden (src/app,
 * src/routes, src/components) skal verken importere promptbyggerne, sende ferdig `system:`-tekst eller
 * kalle det rå tekstinngangspunktet. Byggeren ligger i en *.server.ts-fil som aldri når klientbunten.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const CLIENT_DIRS = ["src/app", "src/routes", "src/components"].map((d) => join(ROOT, d));
const BUILDERS = [
  "characterSystemPrompt",
  "analystSystemPrompt",
  "sceneAnalysisPrompt",
  "lineCheckPrompt",
  "profileGeneratorPrompt",
  "interviewSystemPrompt",
  "interviewToNodesPrompt",
  "contextLinkPrompt",
  "materialUpdatePrompt",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(p) && !/\.server\.tsx?$/.test(p) ? [p] : [];
  });
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const files = CLIENT_DIRS.flatMap(walk).map((f) => ({ f: relative(ROOT, f), src: strip(readFileSync(f, "utf8")) }));

describe("B-105a – promptene bygges på serveren", () => {
  it("fant klientkode å kontrollere", () => {
    expect(files.length).toBeGreaterThan(100);
  });
  it("ingen klientfil bruker promptbyggerne", () => {
    const hits = files.flatMap(({ f, src }) =>
      BUILDERS.filter((b) => new RegExp(`\\b${b}\\b`).test(src)).map((b) => `${f}: ${b}`),
    );
    expect(hits).toEqual([]);
  });
  it("ingen klientfil sender ferdig systemtekst (`system:`)", () => {
    const hits = files.filter(({ src }) => /\bsystem\s*:/.test(src)).map(({ f }) => f);
    expect(hits).toEqual([]);
  });
  it("ingen klientfil kaller det rå tekstinngangspunktet eller importerer serverbyggeren", () => {
    const hits = files
      .filter(({ src }) => /\bgenerateText\b|story-prompts\.server|text-run\.server/.test(src))
      .map(({ f }) => f);
    expect(hits).toEqual([]);
  });
  it("serverfunksjonen bygger prompten fra en zod-validert forespørsel og leser prosjektet med brukerens tilgang", () => {
    const fn = readFileSync(join(ROOT, "src/adapters/ai/story-text.functions.ts"), "utf8");
    expect(fn).toMatch(/requireSupabaseAuth/);
    expect(fn).toMatch(/storyPromptRequest\.safeParse/);
    expect(fn).toMatch(/loadProjectState\(context\.supabase/);
    expect(fn).toMatch(/runTextGeneration\(context/);
    expect(fn).not.toMatch(/console\./);
    const builder = readFileSync(join(ROOT, "src/adapters/ai/story-prompts.server.ts"), "utf8");
    expect(builder).toMatch(/from "zod"/);
    expect(builder).not.toMatch(/console\./);
  });
});
