// @vitest-environment node
/** Språkversjoner av manuset (M7 del 2, DEC-0058, REQ-0329–0339, REQ-0349/0351). */
import { describe, expect, it } from "vitest";
import {
  alignTranslation,
  applyCommand,
  blocksOfVariant,
  deriveProductionCommands,
  diffStates,
  forkPlan,
  formatHeading,
  mainProduction,
  needsReview,
  orderedOccurrences,
  scriptView,
  stateFromRows,
  subtitleCues,
  toSrt,
  toVtt,
  translatedState,
  translationItems,
  translationOf,
  translationStatus,
  type ParsedScreenplay,
  type TranslationFields,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function base() {
  const s = fixture.state;
  const main = mainProduction(s)!;
  const occs = orderedOccurrences(s, main.id);
  const o = occs[2]!;
  const dlg = blocksOfVariant(s, o.variantId).find((b) => b.kind === "dialogue")!;
  return { s, main, occs, o, dlg };
}

const fields = (blockId: string, text: string, basedOnRev: number): TranslationFields => ({
  blockId: blockId as never,
  variantId: null,
  language: "en",
  text,
  basedOnRev,
  status: "approved",
});

describe("oversettelser", () => {
  it("lagres som egen tekst for samme replikk; norsk endres ikke (REQ-0331/0339)", () => {
    const c = base();
    const id = tid<"translation">();
    const s = mustApply(c.s, {
      type: "AddTranslations",
      items: [
        { translationId: id, fields: fields(c.dlg.id, "Can you hear it?", c.dlg.currentRev) },
      ],
    });
    expect(s.blocks[c.dlg.id]!.text).toBe(c.dlg.text);
    expect(translationOf(s, c.dlg.id, "en")!.text).toBe("Can you hear it?");
    // Samme linje kan ikke få to gjeldende oversettelser til samme språk
    const dup = applyCommand(
      s,
      envelope({
        type: "AddTranslations",
        items: [{ translationId: tid(), fields: fields(c.dlg.id, "x", c.dlg.currentRev) }],
      }),
    );
    expect(dup.ok).toBe(false);
    // Norsk som språk avvises
    expect(
      applyCommand(
        c.s,
        envelope({
          type: "AddTranslations",
          items: [
            { translationId: tid(), fields: { ...fields(c.dlg.id, "x", 1), language: "nb" } },
          ],
        }),
      ).ok,
    ).toBe(false);
    // Radene leses tilbake likt
    const row = diffStates(c.s, s).inserts["translations"]![0]!;
    const back = stateFromRows({
      project: { id: s.project.id, revision: 1, name: "x", fps_num: 25, fps_den: 1 },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      translations: [row],
    });
    expect(back.translations[id]).toEqual(s.translations[id]);
  });

  it("endres norsk etterpå, må oversettelsen gjennomgås; endret tilbake er den i orden (REQ-0330)", () => {
    const c = base();
    let s = mustApply(c.s, {
      type: "AddTranslations",
      items: [
        { translationId: tid(), fields: fields(c.dlg.id, "Can you hear it?", c.dlg.currentRev) },
      ],
    });
    const t = () => translationOf(s, c.dlg.id, "en")!;
    expect(needsReview(s, t())).toBe(false);
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: c.main.id as never,
      blockId: c.dlg.id,
      text: "Hører du det nå?",
    });
    expect(needsReview(s, t())).toBe(true);
    expect(translationStatus(s, c.main.id, "en").reviewIds.has(c.dlg.id)).toBe(true);
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: c.main.id as never,
      blockId: c.dlg.id,
      text: c.dlg.text,
    });
    expect(needsReview(s, t())).toBe(false);
  });

  it("engelsk visning og eksport bruker oversettelsen, ellers norsk (REQ-0349)", () => {
    const c = base();
    const s = mustApply(c.s, {
      type: "AddTranslations",
      items: [
        { translationId: tid(), fields: fields(c.dlg.id, "Can you hear it?", c.dlg.currentRev) },
        {
          translationId: tid(),
          fields: {
            blockId: null,
            variantId: c.o.variantId,
            language: "en",
            text: "EXT. THE FARMYARD - EVENING",
            basedOnRev: 0,
            status: "approved",
          },
        },
      ],
    });
    const en = translatedState(s, "en");
    const view = scriptView(en, c.main.id as never).find((x) => x.occurrenceId === c.o.id)!;
    expect(view.blocks.map((b) => b.text)).toContain("Can you hear it?");
    expect(formatHeading(view.heading)).toBe("EXT. THE FARMYARD - EVENING");
    // Originalen er urørt
    expect(s.blocks[c.dlg.id]!.text).toBe(c.dlg.text);
    expect(translatedState(s, "nb")).toBe(s);
  });

  it("angring av en linje med gjeldende oversettelse avvises; fjernet oversettelse følger med", () => {
    const c = base();
    const occ = c.occs[4]!;
    const bid = tid<"script_block">();
    const blocks = blocksOfVariant(c.s, occ.variantId);
    let s = mustApply(c.s, {
      type: "InsertBlock",
      productionId: c.main.id as never,
      variantId: occ.variantId,
      block: {
        blockId: bid,
        kind: "action",
        text: "Ny linje.",
        orderKey: blocks.at(-1)!.orderKey + "m",
      },
    });
    const id = tid<"translation">();
    s = mustApply(s, {
      type: "AddTranslations",
      items: [{ translationId: id, fields: fields(bid, "New line.", 1) }],
    });
    expect(applyCommand(s, envelope({ type: "UndoInsertBlock", blockId: bid })).ok).toBe(false);
    s = mustApply(s, { type: "SetTranslationsRemoved", translationIds: [id], removed: true });
    const r = applyCommand(s, envelope({ type: "UndoInsertBlock", blockId: bid }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.translations[id]).toBeUndefined();
  });

  it("import: et oversatt manus kobles scene for scene og linje for linje (REQ-0332–0335)", () => {
    const c = base();
    const occs = c.occs.slice(0, 3);
    const parsed: ParsedScreenplay = {
      format: "docx",
      pageCount: 1,
      titlePage: [],
      warnings: [],
      stats: { numbered: 0, unnumbered: 3, uncertain: 0, duplicateNumbers: [] },
      scenes: occs.map((o) => {
        const v = c.s.variants[o.variantId]!;
        return {
          number: null,
          rawHeading: `${v.heading.intExt} ENGLISH ${v.heading.location}`,
          heading: { ...v.heading, location: `ENGLISH ${v.heading.location}` },
          source: { page: 1, y: 0 },
          warnings: [],
          elements: blocksOfVariant(c.s, o.variantId)
            .filter((b) => b.kind !== "heading")
            .map((b) => ({
              kind: b.kind,
              text: b.kind === "character" ? b.text : `EN: ${b.text}`,
              source: { page: 1, y: 0 },
            })),
        };
      }),
    };
    const links = alignTranslation(c.s, c.main.id, parsed);
    expect(links.map((l) => l.occurrenceId)).toEqual(occs.map((o) => o.id));
    expect(links.every((l) => l.certainty === "sure")).toBe(true);
    const items = translationItems(
      c.s,
      "en",
      links.map((link) => ({ link, approved: true })),
      parsed,
    );
    const f = (x: (typeof items)[number]) => ({
      blockId: x.blockId as never,
      variantId: x.variantId as never,
      language: "en",
      text: x.text,
      basedOnRev: x.basedOnRev,
      status: x.status,
    });
    let s = c.s;
    const add = items.filter((x) => !x.existingId);
    const upd = items.filter((x) => x.existingId);
    if (add.length)
      s = mustApply(s, {
        type: "AddTranslations",
        items: add.map((x) => ({ translationId: tid(), fields: f(x) })),
      });
    if (upd.length)
      s = mustApply(s, {
        type: "UpdateTranslations",
        items: upd.map((x) => ({ translationId: x.existingId as never, fields: f(x) })),
      });
    const dlg = blocksOfVariant(s, occs[0]!.variantId).find((b) => b.kind === "dialogue")!;
    expect(translationOf(s, dlg.id, "en")!.text).toBe(`EN: ${dlg.text}`);
    expect(translationOf(s, occs[0]!.variantId, "en")!.text).toContain("ENGLISH");
  });

  it("undertekster: replikkene med tid fra filmen, SRT og WebVTT (REQ-0351)", () => {
    const c = base();
    const { cues } = subtitleCues(c.s, c.main.id, "nb");
    expect(cues.length).toBeGreaterThan(5);
    for (let i = 1; i < cues.length; i++)
      expect(cues[i]!.startMs).toBeGreaterThanOrEqual(cues[i - 1]!.endMs);
    const srt = toSrt(cues.slice(0, 2));
    expect(srt).toMatch(/^1\n00:00:\d\d,\d{3} --> 00:00:\d\d,\d{3}\n/);
    expect(toVtt(cues.slice(0, 1))).toMatch(/^WEBVTT\n\n00:00:\d\d\.\d{3} --> /);
    const s = mustApply(c.s, {
      type: "AddTranslations",
      items: [
        { translationId: tid(), fields: fields(c.dlg.id, "Can you hear it?", c.dlg.currentRev) },
      ],
    });
    const en = subtitleCues(s, c.main.id, "en");
    expect(en.cues.filter((x) => x.text === "Can you hear it?")).toHaveLength(1);
    expect(en.missing).toBeGreaterThan(0);
  });

  it("gjennomgang: egen versjon i en spinoff tar med oversettelsene og kan angres", () => {
    const c = base();
    let s = mustApply(c.s, {
      type: "AddTranslations",
      items: [
        { translationId: tid(), fields: fields(c.dlg.id, "Can you hear it?", c.dlg.currentRev) },
      ],
    });
    const pid = tid<"production">();
    for (const cmd of deriveProductionCommands(s, {
      productionId: pid,
      name: "Spin",
      kind: "spinoff",
      parentProductionId: c.main.id,
      occurrenceIds: [c.o.id],
    }))
      s = mustApply(s, cmd);
    const own = orderedOccurrences(s, pid)[0]!;
    const plan = forkPlan(s, {
      type: "EditBlockText",
      productionId: pid as never,
      blockId: blocksOfVariant(s, own.variantId).find((b) => b.kind === "action")!.id,
      text: "Endret i spinoffen.",
    })!;
    const fork = applyCommand(s, envelope(plan.fork[0]!));
    expect(fork.ok).toBe(true);
    if (!fork.ok) return;
    const nv = fork.state.occurrences[own.id]!.variantId;
    const twin = blocksOfVariant(fork.state, nv).find((b) => b.kind === "dialogue")!;
    expect(translationOf(fork.state, twin.id, "en")!.text).toBe("Can you hear it?");
    expect(translationOf(fork.state, c.dlg.id, "en")!.text).toBe("Can you hear it?");
    const undo = applyCommand(fork.state, envelope(fork.inverse));
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(Object.keys(undo.state.translations)).toEqual(Object.keys(s.translations));
  });

  it("gjennomgang: tom oversettelse avvises; endret scenehode må gjennomgås", () => {
    const c = base();
    expect(
      applyCommand(
        c.s,
        envelope({
          type: "AddTranslations",
          items: [{ translationId: tid(), fields: fields(c.dlg.id, "   ", c.dlg.currentRev) }],
        }),
      ).ok,
    ).toBe(false);
    const v = c.s.variants[c.o.variantId]!;
    let s = mustApply(c.s, {
      type: "AddTranslations",
      items: [
        {
          translationId: tid(),
          fields: {
            blockId: null,
            variantId: v.id,
            language: "en",
            text: "EXT. YARD - DAY",
            basedOnRev: v.revision,
            status: "approved",
          },
        },
      ],
    });
    expect(needsReview(s, translationOf(s, v.id, "en")!)).toBe(false);
    s = mustApply(s, {
      type: "EditSceneHeading",
      productionId: c.main.id as never,
      variantId: v.id,
      heading: { ...v.heading, time: "NATT" },
    });
    expect(needsReview(s, translationOf(s, v.id, "en")!)).toBe(true);
  });
});
