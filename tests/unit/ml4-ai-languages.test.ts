// @vitest-environment node
/**
 * ML4 (B-049): B-048 og B-050 med N språkversjoner. Målspråket og scenen er eksplisitte, kostnadsporten
 * (overslag → bekreftelse med fingeravtrykk) holder for hvert språk, og AI-en er mocket. Ingen betalte kall.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scriptView, type ProjectState, type Translation, type TranslationLine } from "@/core";
import { fixture } from "../visual/fixture-state";

const h = vi.hoisted(() => ({
  state: null as unknown,
  role: "editor" as string | null,
  calls: [] as { task: string; system: string; user: string }[],
  reply: "" as string,
}));

vi.mock("@tanstack/react-start", async () => {
  const { serverFnStub } = await import("../helpers/verifisering3-db");
  return { createServerFn: serverFnStub(), createMiddleware: () => ({ server: () => ({}) }) };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/adapters/ai/ai-gate.server", () => ({
  ROLE_RANK: { viewer: 1, commenter: 2, editor: 3, owner: 4 },
  memberRole: async () => h.role,
}));
vi.mock("@/adapters/storage/project-rows", () => ({ loadProjectState: async () => h.state }));
vi.mock("@/adapters/ai/service-ai.server", () => ({
  runServiceAi: async (x: { task: string; system: string; user: string }) => {
    h.calls.push({ task: x.task, system: x.system, user: x.user });
    return { ok: true, text: h.reply };
  },
}));

type Fn = (a: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>;
const ctx = { supabase: {}, userId: "00000000-0000-7000-8000-a11ce0000001" };
const LANGS = ["de", "pt-BR", "sr-Latn"] as const;

const base = fixture.state;
const main = Object.values(base.productions).find((p) => p.kind === "main")!.id;
const scenes = scriptView(base, main).filter((sc) => sc.blocks.filter((b) => b.kind !== "heading").length >= 2);
const [sceneA, sceneB] = [scenes[0]!, scenes[1]!];
const variantOf = (sc: (typeof scenes)[number]) => base.occurrences[sc.occurrenceId as never]!.variantId as string;

/** Usikre oversettelser og en ukoblet importert linje per språk og scene. */
function state(): ProjectState {
  const translations: Record<string, Translation> = { ...base.translations };
  const translationLines: Record<string, TranslationLine> = {};
  let n = 0;
  const nid = () => `00000000-0000-7000-8000-0000000f${String(n++).padStart(4, "0")}`;
  for (const lang of LANGS)
    for (const sc of [sceneA, sceneB]) {
      for (const b of sc.blocks.filter((x) => x.kind !== "heading").slice(0, 2)) {
        const id = nid();
        translations[id] = { id, revision: 1, blockId: b.id, variantId: null, language: lang, text: `${lang}:${b.id}`, basedOnRev: base.blocks[b.id as never]!.currentRev, status: "uncertain", removed: false } as Translation;
      }
      const id = nid();
      translationLines[id] = { id, revision: 1, variantId: variantOf(sc), language: lang, ord: 1, kind: "action", text: `${lang}:unpaired:${sc.occurrenceId}`, removed: false } as TranslationLine;
    }
  return { ...base, translations, translationLines, translationLineLinks: {} };
}

async function lineAlign(): Promise<Fn> {
  return (await import("@/adapters/ai/line-align.functions")).alignTranslationLines as unknown as Fn;
}
async function sceneAlign(): Promise<Fn> {
  return (await import("@/adapters/ai/translation-align.functions")).alignTranslationWithAi as unknown as Fn;
}

beforeEach(() => {
  h.state = state();
  h.role = "editor";
  h.calls = [];
  h.reply = JSON.stringify({ links: [] });
});

describe("B-050 med tre språkversjoner", () => {
  it("overslaget kaller aldri AI; bekreftet kall gjelder bare valgt språk og scene", async () => {
    const align = await lineAlign();
    const variant = variantOf(sceneA);
    for (const language of LANGS) {
      h.calls = [];
      const est = await align({ data: { projectId: base.project.id, variantId: variant, language }, context: ctx });
      expect(est).toMatchObject({ ok: true, estimate: true, servicePaid: true, lines: 3 });
      expect(h.calls).toHaveLength(0);
      const s = h.state as ProjectState;
      const mine = Object.values(s.translations).filter((t) => t.language === language && s.blocks[t.blockId as never]?.variantId === variant);
      h.reply = JSON.stringify({ links: [{ sourceBlockIds: [mine[0]!.blockId], targetTranslationIds: [mine[0]!.id, mine[1]!.id], confidence: 0.9, reason: "1:n" }] });
      const run = await align({ data: { projectId: base.project.id, variantId: variant, language, confirmed: true, fingerprint: est["fingerprint"] }, context: ctx });
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.task).toBe("translation_align");
      for (const other of LANGS.filter((l) => l !== language)) expect(h.calls[0]!.user).not.toContain(`${other}:`);
      expect(h.calls[0]!.user).not.toContain(`unpaired:${sceneB.occurrenceId}`);
      expect(run).toMatchObject({ ok: true, estimate: false, discarded: 0 });
      const links = run["links"] as { language: string; variantId: string; targetTranslationIds: string[] }[];
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ language, variantId: variant });
      expect(links[0]!.targetTranslationIds).toHaveLength(2);
    }
  });

  it("forslag med et annet språk eller fra en annen scene forkastes", async () => {
    const align = await lineAlign();
    const variant = variantOf(sceneA);
    const s = h.state as ProjectState;
    const deOther = Object.values(s.translations).find((t) => t.language === "pt-BR" && s.blocks[t.blockId as never]?.variantId === variant)!;
    const deB = Object.values(s.translations).find((t) => t.language === "de" && s.blocks[t.blockId as never]?.variantId === variantOf(sceneB))!;
    const est = await align({ data: { projectId: base.project.id, variantId: variant, language: "de" }, context: ctx });
    h.reply = JSON.stringify({ links: [
      { sourceBlockIds: [deOther.blockId], targetTranslationIds: [deOther.id], confidence: 0.9, reason: "" },
      { sourceBlockIds: [deB.blockId], targetTranslationIds: [deB.id], confidence: 0.9, reason: "" },
      { language: "pt-BR", sourceBlockIds: [deOther.blockId], targetTranslationIds: [deOther.id], confidence: 0.9, reason: "" },
    ] });
    const run = await align({ data: { projectId: base.project.id, variantId: variant, language: "de", confirmed: true, fingerprint: est["fingerprint"] }, context: ctx });
    expect(run).toMatchObject({ ok: true, links: [], discarded: 3 });
  });

  it("feil fingeravtrykk, norsk eller ikke-kanonisk kode og en leser gir ingen AI-kall", async () => {
    const align = await lineAlign();
    const variant = variantOf(sceneA);
    expect(await align({ data: { projectId: base.project.id, variantId: variant, language: "de", confirmed: true, fingerprint: "feil" }, context: ctx })).toMatchObject({ ok: false });
    expect(await align({ data: { projectId: base.project.id, variantId: variant, language: "nb" }, context: ctx })).toMatchObject({ ok: false });
    for (const language of ["sr-latn", "en-us"])
      await expect(align({ data: { projectId: base.project.id, variantId: variant, language }, context: ctx })).rejects.toThrow();
    h.role = "viewer";
    expect(await align({ data: { projectId: base.project.id, variantId: variant, language: "de" }, context: ctx })).toMatchObject({ ok: false });
    expect(h.calls).toHaveLength(0);
  });
});

describe("B-048 med tre språkversjoner", () => {
  it("målspråket står i prompten, og bare kandidatscenene fra prosjektet sendes", async () => {
    const align = await sceneAlign();
    for (const language of LANGS) {
      h.calls = [];
      const items = [{ index: 0, heading: "INT. STUA - DAG", lines: [`${language} linje`], candidateOccurrenceIds: [sceneA.occurrenceId, "00000000-0000-7000-8000-00000000ffff"] }];
      h.reply = JSON.stringify({ links: [{ index: 0, occurrenceId: sceneA.occurrenceId, confidence: 0.8, reason: "" }] });
      const r = await align({ data: { projectId: base.project.id, language, items }, context: ctx });
      expect(r["ok"]).toBe(true);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.system + h.calls[0]!.user).toContain(language);
      expect(h.calls[0]!.user).not.toContain("00000000-0000-7000-8000-00000000ffff");
      expect(h.calls[0]!.user).not.toContain(sceneB.occurrenceId);
    }
  });

  it("norsk eller ugyldig målspråk avvises før noe sendes", async () => {
    const align = await sceneAlign();
    const items = [{ index: 0, heading: "X", lines: ["y"], candidateOccurrenceIds: [sceneA.occurrenceId] }];
    expect(await align({ data: { projectId: base.project.id, language: "nb", items }, context: ctx })).toMatchObject({ ok: false });
    for (const language of ["zz-zz-zz-zz"])
      await expect(align({ data: { projectId: base.project.id, language, items }, context: ctx })).rejects.toThrow();
    expect(h.calls).toHaveLength(0);
  });
});
