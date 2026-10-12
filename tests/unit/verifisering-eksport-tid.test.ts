// @vitest-environment node
/**
 * Verifisering av krav (DEC-0073): manuseksport uten teknisk metadata (REQ-0104), produktnavnet (REQ-0479),
 * bildepresis tid (REQ-0106), varighetstyper og ingen dobbelttelling (REQ-0113, REQ-0114) og AI som valgfritt
 * lag over animatic-data (REQ-0215).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  convertFrames,
  estimateProduction,
  exportPaginationInput,
  filmClips,
  framesToSeconds,
  orderedOccurrences,
  paginate,
  parseScreenplayLines,
  productionStatus,
  scriptView,
  scriptPages,
  secondsToFrames,
  type ProjectState,
  type Rational,
  type TakeMedia,
} from "@/core";
import { screenplayPdf } from "@/engine/export/screenplay-pdf";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { pdfToLines } from "@/engine/import/pdf-lines";
import { docxToLines } from "@/engine/import/docx-lines";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const loadPdf = () => import("pdfjs-dist/legacy/build/pdf.mjs") as never;
const ROOT = join(__dirname, "../..");

const FILM: TakeMedia = {
  fileName: "film.mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 8000,
  videoCodec: "avc",
  hasAudio: true,
};

function addFilm(
  s: ProjectState,
  occurrenceId: string,
  kind: "imported_film" | "ai_video",
  durationFrames: number,
  status: "approved" | "in_progress" = "approved",
) {
  const takeId = tid<"take">();
  const next = mustApply(s, {
    type: "AddTake",
    takeId,
    occurrenceId: occurrenceId as never,
    segmentId: null,
    kind,
    status,
    durationFrames,
    mediaRef: `${s.project.id}/films/${takeId}/film.mp4`,
    media: { ...FILM, durationMs: (durationFrames / 25) * 1000 },
  });
  return { s: next, takeId };
}

function addComposition(s: ProjectState, variantId: string, durationFrames: number) {
  const compositionId = tid<"composition">();
  return {
    s: mustApply(s, {
      type: "CreateComposition",
      compositionId,
      variantId: variantId as never,
      fields: {
        name: "Scene",
        width: s.project.frameWidth,
        height: s.project.frameHeight,
        durationFrames,
        background: "#101114",
      },
    }),
    compositionId,
  };
}

describe("REQ-0104 – teknisk metadata kommer ikke med i eksportert manus", () => {
  it("REQ-0104: PDF og Word fra et prosjekt med film, tidskoblinger, notater, plan og usikkerhet inneholder bare manusteksten", async () => {
    const { state, mainId } = seedProject(4);
    const occ = orderedOccurrences(state, mainId);
    const o = occ[1]!;
    const blocks = blocksOfVariant(state, o.variantId);
    let s = addFilm(state, o.id, "imported_film", 200).s;
    const takeId = Object.values(s.takes).find((t) => t.occurrenceId === o.id)!.id;
    s = mustApply(s, { type: "SetActiveTake", occurrenceId: o.id, takeId });
    const NOTE = "PRODNOTAT-XYZ";
    const UNCERTAIN = "USIKKER-QQQ";
    s = mustApply(s, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: tid(),
          blockId: blocks[0]!.id,
          variantId: null,
          start: 0,
          end: 4,
          quote: blocks[0]!.text.slice(0, 4),
          text: NOTE,
          authorName: "Test",
        },
      ],
    });
    s = mustApply(s, {
      type: "SetUncertainty",
      productionId: mainId as never,
      targetId: blocks[2]!.id,
      uncertainty: UNCERTAIN,
    });
    s = mustApply(s, { type: "SetPlannedDuration", occurrenceId: occ[2]!.id, plannedMs: 61_000 });
    s = mustApply(s, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: tid(),
          fields: { occurrenceId: o.id, blockId: blocks[2]!.id, startMs: 3000, endMs: 4500 },
        },
      ],
    });

    const input = exportPaginationInput(s, mainId, {
      method: "production",
      includeInactive: false,
      fillMissing: "none",
    });
    const expectedTexts = scriptView(s, mainId).flatMap((x) => x.blocks.map((b) => b.text));
    // Inndataene til eksporten: bare overskrift, nummer og blokktekst
    expect(input.flatMap((x) => x.blocks.map((b) => b.text))).toEqual(expectedTexts);
    const json = JSON.stringify(input);
    for (const forbidden of [NOTE, UNCERTAIN, takeId, "61000", "00:00:"])
      expect(json).not.toContain(forbidden);

    const pdf = screenplayPdf(paginate(input).pages, { title: "Test" });
    const pdfLines = (await pdfToLines(pdf.slice(), loadPdf)).map((l) => l.text).join("\n");
    const docxLines = docxToLines(screenplayDocx(input, {}))
      .map((l) => l.text)
      .join("\n");
    for (const text of [pdfLines, docxLines]) {
      for (const forbidden of [NOTE, UNCERTAIN]) expect(text).not.toContain(forbidden);
      // Ingen tidskoder (TT:MM:SS:BB eller MM:SS)
      expect(text).not.toMatch(/\b\d{1,2}:\d{2}(:\d{2})?\b/);
    }
    const parsed = parseScreenplayLines(await pdfToLines(pdf.slice(), loadPdf), { format: "pdf" });
    expect(parsed.scenes.flatMap((x) => x.elements.map((e) => e.text))).toEqual(expectedTexts);
  });
});

describe("REQ-0479 – produktet heter Animatic Studio", () => {
  const WRONG = /AI[\s_-]*Animatic[\s_-]*Studio/i;
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  }

  it("REQ-0479: ingen UI-tekst, metadata eller kode i src/ og public/ bruker «AI Animatic Studio»", () => {
    const all = [...files(join(ROOT, "src")), ...files(join(ROOT, "public"))].filter((f) =>
      /\.(ts|tsx|js|jsx|css|html|json|txt|svg|webmanifest)$/.test(f),
    );
    expect(all.length).toBeGreaterThan(100);
    const hits = all.filter((f) => WRONG.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
    // Kontrollprøve: riktig navn finnes i sidetittelen
    expect(readFileSync(join(ROOT, "src/routes/__root.tsx"), "utf8")).toContain(
      '{ title: "Animatic Studio" }',
    );
  });

  it("REQ-0479: eksporterte manusfiler (PDF og Word) har produsent «Animatic Studio», aldri «AI Animatic Studio»", () => {
    const { state, mainId } = seedProject(2);
    const input = exportPaginationInput(state, mainId, {
      method: "continuous",
      includeInactive: false,
    });
    const pdf = new TextDecoder("latin1").decode(
      screenplayPdf(paginate(input).pages, { title: "T" }),
    );
    expect(pdf).toContain("/Producer (Animatic Studio)");
    expect(pdf).not.toMatch(WRONG);
    const docx = new TextDecoder("latin1").decode(screenplayDocx(input, { title: "T" }));
    expect(docx).not.toMatch(WRONG);
  });
});

describe("REQ-0106 – bildepresis tidsmodell", () => {
  const RATES: Rational[] = [
    { num: 24, den: 1 },
    { num: 25, den: 1 },
    { num: 30, den: 1 },
    { num: 24000, den: 1001 },
    { num: 30000, den: 1001 },
    { num: 60000, den: 1001 },
  ];

  it("REQ-0106: bilde → sekunder → bilde gir samme bilde for alle bildefrekvenser (også 23,976/29,97), opptil 10 timer", () => {
    for (const fps of RATES) {
      const tenHours = Math.ceil((10 * 3600 * fps.num) / fps.den);
      for (let n = 0; n <= tenHours; n += 997)
        expect(secondsToFrames(framesToSeconds(n, fps), fps), `${fps.num}/${fps.den} @ ${n}`).toBe(
          n,
        );
      expect(secondsToFrames(framesToSeconds(tenHours, fps), fps)).toBe(tenHours);
    }
  });

  it("REQ-0106: gjentatte konverteringer mellom bildefrekvenser gir ingen avrundingsdrift", () => {
    for (const a of RATES)
      for (const b of RATES) {
        for (const n0 of [0, 1, 7, 1001, 24_000, 123_457, 863_136]) {
          let n = convertFrames(convertFrames(n0, a, b), b, a);
          // Høyst ett bilde fra start etter første runde …
          expect(Math.abs(n - n0)).toBeLessThanOrEqual(1);
          const first = n;
          // … og deretter står tallet stille, uansett hvor mange runder
          for (let i = 0; i < 50; i++) n = convertFrames(convertFrames(n, a, b), b, a);
          expect(n, `${a.num}/${a.den} ↔ ${b.num}/${b.den} fra ${n0}`).toBe(first);
        }
      }
  });

  it("REQ-0106: lengder lagres som hele bilder – brøkdeler av bilder avvises", () => {
    const { state, mainId } = seedProject(1);
    const o = orderedOccurrences(state, mainId)[0]!;
    const r = applyCommand(
      state,
      envelope({
        type: "AddTake",
        takeId: tid(),
        occurrenceId: o.id,
        segmentId: null,
        kind: "composition2d",
        status: "approved",
        durationFrames: 12.5,
        mediaRef: null,
      }),
    );
    expect(r.ok).toBe(false);
    expect(Number.isInteger(state.project.fps.num) && Number.isInteger(state.project.fps.den)).toBe(
      true,
    );
  });
});

describe("REQ-0113 / REQ-0114 – varighetstyper og ingen dobbelttelling", () => {
  function sceneWithEverything() {
    const { state, mainId } = seedProject(3);
    const occ = orderedOccurrences(state, mainId);
    // Fixturen har en aktiv 2D-take på scene 0 og 2; bruk scene 1 (ingen materiale fra før)
    const o = occ[1]!;
    let s = mustApply(state, { type: "SetPlannedDuration", occurrenceId: o.id, plannedMs: 12_000 });
    s = addComposition(s, o.variantId, 250).s; // 10 s 2D-animatic
    const ai = addFilm(s, o.id, "ai_video", 150); // 6 s AI-video
    s = ai.s;
    const film = addFilm(s, o.id, "imported_film", 300); // 12 s ferdig film
    s = film.s;
    return { s, mainId, o, aiTake: ai.takeId, filmTake: film.takeId };
  }
  const row = (s: ProjectState, mainId: string, id: string) =>
    productionStatus(s, mainId, estimateProduction(s, mainId)).rows.find(
      (r) => r.occurrenceId === id,
    )!;

  it("REQ-0113: én scene lagrer estimat, plan, 2D-animatic, AI-video og ferdig film hver for seg", () => {
    const { s, mainId, o, aiTake, filmTake } = sceneWithEverything();
    const fps = s.project.fps;
    // Alle fem finnes samtidig, atskilt
    expect(s.occurrences[o.id]!.plannedMs).toBe(12_000);
    expect(
      Object.values(s.compositions).find((c) => c.variantId === o.variantId)!.durationFrames,
    ).toBe(250);
    expect(s.takes[aiTake]!.durationFrames).toBe(150);
    expect(s.takes[filmTake]!.durationFrames).toBe(300);
    const r0 = row(s, mainId, o.id);
    expect(r0.estimateSeconds).toBeGreaterThan(0);
    expect(r0.plannedSeconds).toBe(12);
    expect(r0.animaticSeconds).toBe(10);
    expect(r0.source).toBe("animatic");
    // Aktiv versjon avgjør hvilken av film-lengdene som brukes, og hvor tallet kommer fra
    const withAi = mustApply(s, { type: "SetActiveTake", occurrenceId: o.id, takeId: aiTake });
    const rAi = row(withAi, mainId, o.id);
    expect(rAi.source).toBe("ai");
    expect(rAi.filmSeconds).toBeCloseTo(framesToSeconds(150, fps));
    expect(rAi.animaticSeconds).toBe(10);
    expect(rAi.plannedSeconds).toBe(12);
    const withFilm = mustApply(s, { type: "SetActiveTake", occurrenceId: o.id, takeId: filmTake });
    const rFilm = row(withFilm, mainId, o.id);
    expect(rFilm.source).toBe("film");
    expect(rFilm.filmSeconds).toBeCloseTo(framesToSeconds(300, fps));
    expect(rFilm.estimateSeconds).toBe(r0.estimateSeconds);
  });

  it("REQ-0114: en scene med tre produksjonsversjoner telles én gang, med bare den aktive", () => {
    const { s, mainId, o, aiTake, filmTake } = sceneWithEverything();
    const third = addFilm(s, o.id, "imported_film", 500, "in_progress");
    let t = third.s;
    expect(Object.values(t.takes).filter((x) => x.occurrenceId === o.id)).toHaveLength(3);
    const total = (st: ProjectState) =>
      productionStatus(st, mainId, estimateProduction(st, mainId));
    for (const [active, frames] of [
      [aiTake, 150],
      [filmTake, 300],
      [third.takeId, 500],
    ] as const) {
      t = mustApply(t, { type: "SetActiveTake", occurrenceId: o.id, takeId: active });
      const st = total(t);
      expect(st.rows.filter((r) => r.occurrenceId === o.id)).toHaveLength(1);
      const others = st.rows
        .filter((r) => r.active && r.occurrenceId !== o.id)
        .reduce((sum, r) => sum + r.seconds, 0);
      expect(st.expectedSeconds).toBeCloseTo(others + framesToSeconds(frames, t.project.fps));
      // Filmen i monteringen har også bare den aktive versjonen
      const clips = filmClips(t, mainId).filter((c) => c.occurrenceId === o.id);
      expect(clips).toHaveLength(1);
      expect(clips[0]!.durationFrames).toBe(frames);
    }
  });
});

describe("REQ-0215 – AI er et valgfritt lag over animatic-strukturen", () => {
  it("REQ-0215: scenen spilles med bare 2D-data; en AI-video lagres som tilleggsversjon og kan velges bort igjen", () => {
    const { state, mainId } = seedProject(2);
    const o = orderedOccurrences(state, mainId)[1]!;
    const { s, compositionId } = addComposition(state, o.variantId, 125);
    const clip = (st: ProjectState) => filmClips(st, mainId).find((c) => c.occurrenceId === o.id)!;
    expect(clip(s).source).toBe("composition");
    expect(clip(s).compositionId).toBe(compositionId);
    expect(clip(s).durationFrames).toBe(125);

    const ai = addFilm(s, o.id, "ai_video", 200);
    // Lagt til, men ikke tatt i bruk: scenen spilles fortsatt som 2D-animatic
    expect(ai.s.takes[ai.takeId]!.occurrenceId).toBe(o.id);
    expect(clip(ai.s).source).toBe("composition");
    const used = mustApply(ai.s, { type: "SetActiveTake", occurrenceId: o.id, takeId: ai.takeId });
    expect(clip(used).source).toBe("film");
    expect(clip(used).take?.id).toBe(ai.takeId);
    // 2D-scenen er urørt, og scenen kan gå tilbake til animatic uten at AI-versjonen forsvinner
    expect(used.compositions[compositionId]).toEqual(s.compositions[compositionId]);
    const back = mustApply(used, { type: "SetActiveTake", occurrenceId: o.id, takeId: null });
    expect(clip(back).source).toBe("composition");
    expect(back.takes[ai.takeId]).toBeDefined();
  });
});

describe("REQ-0052 / REQ-0102 – manussidene ved redigering og uten teknisk metadata", () => {
  it("REQ-0052: en replikk som forlenges over sideskift, brytes med (MORE)/(CONT'D), og sidene etter flyttes", () => {
    const { state, mainId } = seedProject(4);
    const occ = orderedOccurrences(state, mainId);
    const before = scriptPages(state, mainId);
    expect(before.pages).toHaveLength(1);
    const dlg = blocksOfVariant(state, occ[1]!.variantId).find((b) => b.kind === "dialogue")!;
    const long = Array.from({ length: 70 }, () => "Dette er en lang setning.").join(" ");
    const s = mustApply(state, {
      type: "EditBlockText",
      productionId: mainId as never,
      blockId: dlg.id,
      text: long,
    });
    const after = scriptPages(s, mainId);
    expect(after.pages.length).toBeGreaterThan(1);
    const lines = after.pages.flatMap((p, i) => p.lines.map((l) => ({ ...l, page: i })));
    const more = lines.filter((l) => l.kind === "more");
    const contd = lines.filter((l) => l.kind === "contd");
    expect(more.length).toBeGreaterThan(0);
    expect(contd.length).toBe(more.length);
    for (const m of more) {
      // (MORE) nederst på siden, og «NAVN (CONT'D)» øverst på neste side for samme scene
      expect(m.text).toBe("(MORE)");
      const top = after.pages[m.page + 1]!.lines[0]!;
      expect(top).toMatchObject({ kind: "contd", occurrenceId: occ[1]!.id });
      expect(top.text).toMatch(/\(CONT'D\)$/);
    }
    // Hele replikkteksten er med, fordelt over sidene
    const dlgText = lines
      .filter((l) => l.blockId === dlg.id)
      .map((l) => l.text)
      .join(" ")
      .replace(/\s+/g, " ");
    expect(dlgText).toBe(long);
    // Scenene før står på samme side; scenene etter er flyttet til en senere side
    expect(after.sceneStartPage[occ[0]!.id]).toBe(before.sceneStartPage[occ[0]!.id]);
    expect(after.sceneStartPage[occ[3]!.id]).toBeGreaterThan(before.sceneStartPage[occ[3]!.id]!);
  });

  it("REQ-0102: film, tidskoblinger, notater, plan og usikkerhet endrer ikke manussidene", () => {
    const { state, mainId } = seedProject(4);
    const o = orderedOccurrences(state, mainId)[1]!;
    const blocks = blocksOfVariant(state, o.variantId);
    let s = addFilm(state, o.id, "imported_film", 200).s;
    s = mustApply(s, { type: "SetPlannedDuration", occurrenceId: o.id, plannedMs: 61_000 });
    s = mustApply(s, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: tid(),
          fields: { occurrenceId: o.id, blockId: blocks[2]!.id, startMs: 3000, endMs: 4500 },
        },
      ],
    });
    s = mustApply(s, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: tid(),
          blockId: blocks[0]!.id,
          variantId: null,
          start: 0,
          end: 4,
          quote: blocks[0]!.text.slice(0, 4),
          text: "PRODNOTAT",
          authorName: "Test",
        },
      ],
    });
    expect(scriptPages(s, mainId)).toEqual(scriptPages(state, mainId));
    const text = JSON.stringify(scriptPages(s, mainId));
    expect(text).not.toContain("PRODNOTAT");
    expect(text).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
