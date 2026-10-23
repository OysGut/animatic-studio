// @vitest-environment node
/** G-1b: plakater og karakterkart på alle språk, med japansk manus og norsk/engelsk/tysk visning. */
import { describe, expect, it } from "vitest";
import { applyCommand, posterChecks, posterDraft, posterLanguageChoices, renderPoster, elementText, type Poster, type ProjectState } from "@/core";
import { needsUnicodeText, posterPdf } from "@/engine/export/poster-pdf";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function japanese(): ProjectState {
  const s0 = fixture.state;
  const r = applyCommand(s0, envelope({ type: "SetDialogueLanguage", target: "project", targetId: s0.project.id, language: "ja" }));
  if (!r.ok) throw new Error(r.error.message);
  return { ...r.state, project: { ...r.state.project, name: "雪の夜" } };
}
const main = (s: ProjectState) => Object.values(s.productions).find((p) => p.kind === "main")!;

function poster(s: ProjectState, language: string): Poster {
  const doc = posterDraft(s, main(s).id, "pitch", 700, 1000, language);
  const fields = { productionId: main(s).id, name: "Pitch", kind: "pitch" as const, language, widthMm: 700, heightMm: 1000, document: doc };
  const r = applyCommand(s, envelope({ type: "CreatePoster", posterId: "00000000-0000-4000-8000-0000000000aa" as never, fields }));
  if (!r.ok) throw new Error(r.error.message);
  return Object.values(r.state.posters)[0]!;
}

describe("G-1b plakatspråk", () => {
  it("kildespråket er manusets språk; tittelen lagres under «ja», ikke «nb»", () => {
    const s = japanese();
    const doc = posterDraft(s, main(s).id, "pitch", 700, 1000, "de");
    expect(doc.title).toEqual({ ja: "雪の夜" });
    expect(Object.keys(doc.genre).sort()).toEqual(["de", "ja"]);
    expect(Object.keys(doc.genre)).not.toContain("nb");
  });
  it("plakaten kan ha tysk, norsk og engelsk språk; ugyldige språkmerker avvises", () => {
    const s = japanese();
    for (const l of ["de", "nb", "en", "pt-BR"]) expect(poster(s, l).language).toBe(l);
    const doc = posterDraft(s, main(s).id, "pitch");
    const bad = applyCommand(s, envelope({ type: "CreatePoster", posterId: "00000000-0000-4000-8000-0000000000ab" as never, fields: { productionId: main(s).id, name: "X", kind: "pitch", language: "Norsk!", widthMm: 700, heightMm: 1000, document: doc } }));
    expect(bad.ok).toBe(false);
  });
  it("tekst som mangler på visningsspråket vises på kildespråket og meldes", () => {
    const s = japanese();
    const p = poster(s, "nb");
    const title = p.document.elements.find((e) => e.id === "title")!;
    expect(elementText(title, "en", "ja")).toEqual({ text: "雪の夜", fallback: true });
    const checks = posterChecks(s, p, "en");
    expect(checks.some((c) => c.elementIds?.includes("title") && c.level === "info")).toBe(true);
    // Kildespråket selv meldes ikke som manglende oversettelse
    expect(posterChecks(s, p, "ja").some((c) => c.elementIds?.includes("title") && c.level === "info")).toBe(false);
  });
  it("språkvalget har kildespråket først, så språkversjonene og grensesnittspråkene", () => {
    const s = japanese();
    expect(posterLanguageChoices(s, ["en", "nb"]).slice(0, 3)).toEqual(["ja", "en", "nb"]);
    expect(posterLanguageChoices(s, ["en"], "ko")).toContain("ko");
  });
  it("trykk-PDF: japansk tekst legges inn som tekstbilde, latinsk tekst er fortsatt ekte tekst", async () => {
    const s = japanese();
    const p = poster(s, "ja");
    const ops = renderPoster(s, p, "ja");
    const jp = ops.filter((o) => o.op === "text" && needsUnicodeText(o));
    expect(jp.length).toBeGreaterThan(0);
    const asked: string[] = [];
    const bytes = await posterPdf(ops, { widthMm: 700, heightMm: 1000, bleedMm: 0, cropMarks: false, title: "x" }, async () => null, async (b) => b, async (o) => {
      asked.push(o.id);
      return { image: { width: 2, height: 2, rgb: new Uint8Array(12), alpha: new Uint8Array(4).fill(255) }, x: o.x, y: o.y, w: o.w, h: o.h };
    });
    const pdf = new TextDecoder("latin1").decode(bytes);
    expect(asked.sort()).toEqual(jp.map((o) => o.id).sort());
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toMatch(/\/Im\d+ Do/);
  });
});
