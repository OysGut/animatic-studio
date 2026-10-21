/**
 * B-105a: Story Lab- og tekstpromptene bygges BARE PÅ SERVEREN. Klienten sender oppgavetype og
 * parametere (ID-er, språk, situasjon, regi); systemteksten lages her fra faste maler og prosjektdata
 * som serveren selv har lest med brukerens tilgang. Prompter logges aldri.
 */
import { z } from "zod";
import {
  analystSystemPrompt,
  characterLines,
  characterSystemPrompt,
  canvasSummary,
  contextLinkPrompt,
  emptyStoryProfile,
  factsUntil,
  interviewSystemPrompt,
  interviewToNodesPrompt,
  knowledgeAt,
  lineCheckPrompt,
  materialUpdatePrompt,
  materialUpdateTargets,
  mergeProfile,
  profileAt,
  profileError,
  profileGeneratorPrompt,
  sceneAnalysisPrompt,
  sceneLabData,
  type ContextLinkSuggestion,
  type ProjectState,
  type ScriptChange,
  type StoryProfile,
} from "@/core";

const id = z.string().min(1).max(100);
const lang = z.string().min(2).max(20);
const text = (max: number) => z.string().max(max);
const msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20_000) });
/** Profilen valideres med kjernens profileError etter utfylling. */
const profile = z.unknown();

export const storyPromptRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("character"),
    assetId: id,
    sceneId: id.nullable(),
    situation: text(8000),
    directions: z.array(text(2000)).max(20),
    /** undefined: prosjektets profil på tidspunktet; null: tom profil; objekt: øktens lagrede profil. */
    profile: profile.optional(),
    language: lang,
  }),
  z.object({
    kind: z.literal("analyst"),
    characters: z.array(z.object({ assetId: id, profile: profile.nullable() })).min(1).max(6),
    sceneId: id.nullable(),
    sceneContext: text(8000),
    language: lang,
    focusId: id.optional(),
    explain: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("sceneAnalysis"), sceneId: id, language: lang }),
  z.object({ kind: z.literal("lineCheck"), sceneId: id, blockId: id, language: lang }),
  z.object({
    kind: z.literal("profileGenerator"),
    assetId: id,
    description: text(8000),
    useLines: z.boolean(),
    language: lang,
  }),
  z.object({ kind: z.literal("interview"), language: lang }),
  z.object({ kind: z.literal("interviewNodes"), language: lang, transcript: z.array(msg).max(200) }),
  z.object({
    kind: z.literal("contextLink"),
    items: z
      .array(
        z.object({
          key: text(300),
          occurrenceId: id,
          blockId: id,
          word: text(200),
          assetId: id,
          confidence: z.string().max(20),
          rule: z.string().max(40),
          candidates: z.array(id).max(50),
        }),
      )
      .min(1)
      .max(200),
  }),
  z.object({
    kind: z.literal("materialUpdate"),
    occurrenceId: id,
    changes: z
      .array(
        z.object({
          blockId: id,
          kind: z.string().max(40),
          blockKind: z.string().max(40),
          oldText: text(20_000).nullable(),
          newText: text(20_000).nullable(),
        }),
      )
      .min(1)
      .max(200),
  }),
]);
export type StoryPromptRequest = z.infer<typeof storyPromptRequest>;

export type BuiltPrompt = { readonly system: string; readonly user?: string };

/** Ugyldig eller ukjent profil fra klienten avvises; ingen fritekst går rett inn i systemteksten. */
function checkedProfile(p: unknown): StoryProfile {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("invalid profile");
  const merged = mergeProfile(emptyStoryProfile(), p as never);
  if (profileError(merged)) throw new Error("invalid profile");
  return merged;
}

function assetName(state: ProjectState, assetId: string): string {
  const a = state.assets[assetId];
  if (!a || a.removed) throw new Error("unknown asset");
  return a.name;
}

const nameMap = (s: ProjectState): Record<string, string> =>
  Object.fromEntries(Object.values(s.assets).map((a) => [a.id, a.name]));

export function buildStoryPrompt(state: ProjectState, r: StoryPromptRequest): BuiltPrompt {
  switch (r.kind) {
    case "character": {
      const name = assetName(state, r.assetId);
      const prof =
        r.profile === undefined
          ? (profileAt(state, r.assetId, r.sceneId as never) ?? emptyStoryProfile())
          : r.profile === null
            ? emptyStoryProfile()
            : checkedProfile(r.profile);
      return {
        system: characterSystemPrompt({
          name,
          profile: prof,
          knowledge: knowledgeAt(state, r.assetId, r.sceneId as never),
          situation: r.situation,
          directions: r.directions.filter((d) => d.trim()).map((d) => ({ text: d })),
          language: r.language,
          names: nameMap(state),
        }),
      };
    }
    case "analyst": {
      const names = nameMap(state);
      const focus = r.focusId ? assetName(state, r.focusId) : undefined;
      const system = analystSystemPrompt({
        characters: r.characters.map((c) => ({
          name: assetName(state, c.assetId),
          profile: c.profile === null ? null : checkedProfile(c.profile),
        })),
        facts: factsUntil(state, r.sceneId).map((f) => ({
          text: f.text,
          kind: f.kind,
          knownBy: f.knownBy.map((k) => names[k.assetId] ?? "?"),
        })),
        sceneContext: r.sceneContext,
        language: r.language,
        ...(focus ? { focus } : {}),
      });
      return {
        system:
          system +
          (focus && r.explain
            ? "\nExplain this character's motivation from the profile, in the third person. Separate interpretation from established facts."
            : ""),
      };
    }
    case "sceneAnalysis": {
      const data = sceneLabData(state, r.sceneId);
      return sceneAnalysisPrompt({
        heading: data.heading,
        blocks: data.blocks,
        characters: data.participants.map((a) => {
          const k = knowledgeAt(state, a.id, r.sceneId as never);
          return {
            name: a.name,
            profile: profileAt(state, a.id, r.sceneId as never),
            knows: [...k.facts, ...k.ownSecrets].map((f) => f.text),
          };
        }),
        language: r.language,
      });
    }
    case "lineCheck": {
      const data = sceneLabData(state, r.sceneId);
      const at = data.blocks.findIndex((b) => b.id === r.blockId);
      const block = data.blocks[at];
      const speakerId = block ? data.speakers.get(block.id) : undefined;
      const speaker = speakerId ? state.assets[speakerId] : undefined;
      if (!block || !speaker) throw new Error("unknown line");
      return lineCheckPrompt({
        name: speaker.name,
        profile: profileAt(state, speaker.id, r.sceneId as never),
        knowledge: knowledgeAt(state, speaker.id, r.sceneId as never),
        sceneHeading: data.heading,
        before: data.blocks
          .slice(0, at)
          .filter((b) => b.kind === "dialogue")
          .slice(-12)
          .map((b) => b.text),
        line: block.text,
        language: r.language,
      });
    }
    case "profileGenerator": {
      const asset = state.assets[r.assetId];
      if (!asset || asset.removed) throw new Error("unknown asset");
      return profileGeneratorPrompt({
        name: asset.name,
        description: r.description,
        lines: r.useLines ? characterLines(state, asset) : [],
        language: r.language,
      });
    }
    case "interview":
      return {
        system: interviewSystemPrompt({
          language: r.language,
          canvasSummary: canvasSummary(state),
          projectTitle: state.project.name,
        }),
      };
    case "interviewNodes":
      return interviewToNodesPrompt({
        language: r.language,
        canvasSummary: canvasSummary(state),
        transcript: r.transcript,
      });
    case "contextLink":
      return contextLinkPrompt(state, r.items as unknown as ContextLinkSuggestion[]);
    case "materialUpdate": {
      const changes = r.changes as unknown as ScriptChange[];
      return materialUpdatePrompt(state, materialUpdateTargets(state, r.occurrenceId, changes), changes);
    }
  }
}
