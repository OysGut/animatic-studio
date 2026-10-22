// @vitest-environment node
/**
 * PTG2 (B-102, PTG-B1–B4): ren modell for «Send til Dragonframe». Eksponeringer og referansebilder
 * følger opptakets bildefrekvens (toere: hver eksponering to bilder), X-sheet har én rad per eksponering
 * med ord på bildet der de starter, lydstemmene er like lange som skuddet, og WAV er 48 kHz 24 bit.
 */
import { describe, expect, it } from "vitest";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { buildInterchange } from "@/core/interchange";
import {
  buildXsheets, dragonframePaths, referenceFrames, shotExposures, shotSamples, stemGroups, wav24, xsheetCsv, xsheetLayout,
} from "@/core/interchange/dragonframe";
import { orderedOccurrences, type FilmAudioItem, type ProjectState } from "@/core";

function scene() {
  const { state, mainId } = seedProject(1);
  let s: ProjectState = mustApply(state, { type: "SetProjectFormat", width: 1000, height: 600, fps: { num: 24, den: 1 } });
  const o = orderedOccurrences(s, mainId)[0]!;
  const compositionId = tid<"composition">();
  const fields = { name: "Stua", width: 1000, height: 600, durationFrames: 250, background: "#101114" };
  s = mustApply(s, { type: "CreateComposition", compositionId, variantId: o.variantId, fields });
  return { s, mainId };
}
const labels = { layerStart: (n: string) => `start: ${n}`, layerEnd: (n: string) => `end: ${n}` };

describe("PTG2 Dragonframe-modell", () => {
  it("enere: én eksponering og ett referansebilde per opptaksbilde", () => {
    const { s, mainId } = scene();
    const doc = buildInterchange(s, { productionId: mainId, language: "nb" });
    const shot = doc.shots[0]!;
    expect(shot.lengthFrames).toBe(250);
    expect(shotExposures(doc, shot)).toHaveLength(250);
    expect(referenceFrames(doc, shot)).toEqual(Array.from({ length: 250 }, (_, i) => i));
  });

  it("toere: 125 eksponeringer, og hver eksponering vises to bilder i referansefilmen", () => {
    const { s, mainId } = scene();
    const doc = buildInterchange(s, { productionId: mainId, language: "nb", capture: { mode: "twos", fps: { num: 12, den: 1 } } });
    const shot = doc.shots[0]!;
    expect(doc.fps).toEqual({ num: 24, den: 1 });
    const ex = shotExposures(doc, shot);
    expect(ex).toHaveLength(125);
    const ref = referenceFrames(doc, shot);
    expect(ref).toHaveLength(250);
    for (let i = 0; i < 250; i += 2) { expect(ref[i]).toBe(i); expect(ref[i + 1]).toBe(i); }
    expect(buildXsheets(s, doc, labels).get(shot.id)).toHaveLength(125);
  });

  it("annen opptaksfrekvens: omregning bare via modellen (25 bilder/s fra 24)", () => {
    const { s, mainId } = scene();
    const doc = buildInterchange(s, { productionId: mainId, language: "nb", captureFps: { num: 25, den: 1 } });
    const shot = doc.shots[0]!;
    const ref = referenceFrames(doc, shot);
    expect(ref).toHaveLength(shot.frameOut - shot.frameIn);
    expect(ref[25]).toBe(24); // 1 s opptak = 1 s montering
  });

  it("X-sheet: én rad per eksponering, ord på bildet der det starter, tom munn, lagbevegelse start/slutt", () => {
    const { s, mainId } = scene();
    const doc = buildInterchange(s, { productionId: mainId, language: "nb", capture: { mode: "twos", fps: { num: 12, den: 1 } } });
    const shot = doc.shots[0]!;
    (shot.dialogue as unknown[]).push({ id: "b1", sourceOccurrenceId: shot.id, text: "Hei der", character: "MAJA", characterAssetId: null,
      estimated: false, absoluteStartFrame: 10, absoluteEndFrame: 30, startFrame: 10, endFrame: 30, lengthFrames: 20, crossesCut: false });
    (shot.words as unknown[]).push(
      { id: "w1", blockId: "b1", audioId: "a1", text: "Hei", absoluteStartFrame: 11, absoluteEndFrame: 15, startFrame: 11, endFrame: 15, lengthFrames: 4, crossesCut: false },
      { id: "w2", blockId: "b1", audioId: "a1", text: "der", absoluteStartFrame: 16, absoluteEndFrame: 30, startFrame: 16, endFrame: 30, lengthFrames: 14, crossesCut: false });
    (shot.layers as unknown[]).push({ id: "l1", source: { name: "Maja" }, fileId: null, swaps: [], activeRange: null, path: null,
      keyframes: [{ frame: 20, property: "x", value: 0, easing: "linear" }, { frame: 40, property: "x", value: 100, easing: "linear" }] });
    const rows = buildXsheets(s, doc, labels).get(shot.id)!;
    expect(rows).toHaveLength(125);
    expect(rows[5]!.dialogue).toBe("Hei"); // bilde 11 ligger i eksponeringen 10–11
    expect(rows[5]!.character).toBe("MAJA");
    expect(rows[8]!.dialogue).toBe("der"); // bilde 16
    expect(rows.some(r => r.dialogue.includes("Hei der"))).toBe(false); // replikken med ordtider står ikke dobbelt
    expect(rows[10]!.layers).toBe("start: Maja");
    expect(rows[20]!.layers).toBe("end: Maja");
    expect(rows.every(r => r.mouth === "")).toBe(true);
    expect(rows[0]!.frame).toBe(1); expect(rows[1]!.frame).toBe(3); expect(rows[1]!.timecode).toBe("00:00:00:02");
    const csv = new TextDecoder().decode(xsheetCsv(rows, ["a", "b", "c", "d", "e", "f", "g", "h", "i"]));
    expect(csv.trim().split("\r\n")).toHaveLength(126);
  });

  it("PDF-oppsett A4 og Letter dekker alle rader", () => {
    for (const paper of ["a4", "letter"] as const) {
      const L = xsheetLayout(paper, 250);
      expect(L.pages[0]!.from).toBe(0);
      expect(L.pages[L.pages.length - 1]!.to).toBe(250);
      expect(L.pages.reduce((n, p) => n + p.to - p.from, 0)).toBe(250);
    }
    expect(xsheetLayout("a4", 1).width).toBe(210);
    expect(xsheetLayout("letter", 1).height).toBeCloseTo(279.4, 6);
  });

  it("lydstemmer: én per karakter, atmosfære, musikk, effekter hver for seg og samlet miks; dempet utelatt", () => {
    const it = (kind: string, characterAssetId: string | null, muted = false) =>
      ({ clip: { kind, characterAssetId, muted }, version: null, start: 0, length: 1, sourceIn: 0, gain: 1, fadeIn: 0, fadeOut: 0, keys: [], fullLength: 1 }) as unknown as FilmAudioItem;
    const items = [it("dialogue", "c1"), it("dialogue", "c2"), it("dialogue", "c1"), it("narration", null), it("music", null), it("ambience", null), it("sfx", null), it("sfx", null, true)];
    const g = stemGroups(items, id => (id === "c1" ? "Maja Ø." : "Anne"));
    expect(g.map(x => x.suffix)).toEqual(["DIA_MAJA_O", "DIA_ANNE", "DIA_FORTELLER", "AMB", "MUS", "SFX", "MIX"]);
    expect(g[0]!.items).toHaveLength(2);
    expect(g.find(x => x.suffix === "SFX")!.items).toHaveLength(1);
    expect(g.find(x => x.suffix === "MIX")!.items).toHaveLength(7);
  });

  it("lydfilen er like lang som skuddet med håndtak: WAV 48 kHz 24 bit", () => {
    const shot = { frameIn: 90, frameOut: 190 };
    const n = shotSamples({ fps: { num: 24, den: 1 } }, shot);
    expect(n).toBe(100 * 2000);
    expect(shotSamples({ fps: { num: 30000, den: 1001 } }, { frameIn: 0, frameOut: 30 })).toBe(Math.round(30 * 48000 * 1001 / 30000));
    const wav = wav24([new Float32Array([1, -1, 0.5]), new Float32Array([0, 0, 0])], 48000, n);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(24);
    expect(v.getUint32(40, true)).toBe(n * 2 * 3);
    expect(wav.length).toBe(44 + n * 6);
    expect([wav[44], wav[45], wav[46]]).toEqual([0xff, 0xff, 0x7f]); // +1 → 0x7fffff
    expect([wav[50], wav[51], wav[52]]).toEqual([0x00, 0x00, 0x80]); // −1 → −0x800000
  });

  it("én mappe per skudd navngitt etter PTG1", () => {
    const p = dragonframePaths({ name: "PTG_SC001_SH010_v001" });
    expect(p.video).toBe("PTG_SC001_SH010_v001/PTG_SC001_SH010_v001_ref.mp4");
    expect(p.png(0)).toBe("PTG_SC001_SH010_v001/png/PTG_SC001_SH010_v001_0001.png");
    expect(p.audio("MIX")).toBe("PTG_SC001_SH010_v001/audio/PTG_SC001_SH010_v001_MIX.wav");
  });
});

describe("PTG2-svar: PNG per eksponering og PDF-fonter", () => {
  it("PNG-sekvensen på toere har én fil per eksponering, lik X-sheet-radene", async () => {
    const { pngExposureIndices } = await import("@/core/interchange/dragonframe");
    const shot = { startFrame: 10, frameIn: 7, frameOut: 20 };
    const idx = pngExposureIndices({ exposureStep: 2 }, shot);
    expect(idx.length).toBe(shotExposures({ exposureStep: 2 }, shot).length);
    // Håndtaket foran: 7 (eksp. 6), 8–9 (eksp. 8), 10–11 (eksp. 10) …
    expect(idx).toEqual([0, 1, 3, 5, 7, 9, 11]);
    expect(pngExposureIndices({ exposureStep: 1 }, shot)).toHaveLength(13);
  });
  it("velger Noto Sans, JP eller KR etter tegnsett", async () => {
    const { pdfScriptOf, pdfScriptsNeeded } = await import("@/core/interchange/dragonframe");
    expect(pdfScriptOf("Jula på Dovre")).toBe("latin");
    expect(pdfScriptOf("Привет")).toBe("latin");
    expect(pdfScriptOf("こんにちは")).toBe("jp");
    expect(pdfScriptOf("日本")).toBe("jp");
    expect(pdfScriptOf("안녕하세요")).toBe("kr");
    expect(pdfScriptsNeeded(["Hei", "안녕"])).toEqual(["latin", "kr"]);
  });
});

describe("PTG2-svar: X-sheet-PDF med innebygde fonter", () => {
  it("bygger inn Noto Sans og Noto Sans JP/KR når teksten trenger dem", async () => {
    const fs = await import("node:fs");
    const { xsheetPdf } = await import("@/engine/export/dragonframe");
    const b64 = (f: string) => fs.readFileSync(`public/fonts/pdf/${f}`).toString("base64");
    const row = (dialogue: string) => ({ frame: 1, shotFrame: 0, timecode: "00:00:00:00", character: "Ola", dialogue, mouth: "", action: "", layers: "", notes: "" });
    const pdf = xsheetPdf({ name: "PTG_SC001_SH010_v001" } as never, [row("Привет æøå"), row("こんにちは"), row("안녕하세요")], "a4", "Jula",
      { latin: b64("NotoSans-Regular.ttf"), jp: b64("NotoSansJP.ttf"), kr: b64("NotoSansKR.ttf") });
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.match(/\/FontFile2/g)?.length).toBe(3);
    for (const n of ["PTG-latin", "PTG-jp", "PTG-kr"]) expect(text).toContain(n);
    expect(pdf.length).toBeLessThan(3_000_000); // delsett, ikke hele CJK-fontene (≈ 20 MB)
  }, 60_000);
});
