/** G-9: eksempelprosjektet – språkvalg, at alle kommandoene godtas av kjernen, og at hovedvisningene bygges. */
import { describe, expect, it } from "vitest";
import { FPS_25, orderedOccurrences, scriptView, sourceLanguageOf, emptyProjectState, type ProjectState } from "@/core";
import { pickDemoLanguage, planDemoProject, demoProjectName } from "@/core/demo/plan";
import { DEMO_LANGUAGES, DEMO_SCENES } from "@/core/demo/story";
import { mustApply, tid } from "../helpers/fixtures";

function newUserProject(lang: string): { s: ProjectState; mainId: string } {
  let s = emptyProjectState({
    id: tid<"project">(),
    revision: 1,
    name: "x",
    fps: FPS_25,
    frameWidth: 1920,
    frameHeight: 1080,
    sourceLanguage: lang,
  });
  const mainId = tid<"production">();
  s = mustApply(s, { type: "CreateProduction", productionId: mainId as never, kind: "main", name: "Main", parentProductionId: null });
  return { s, mainId };
}

describe("G-9 språkvalg", () => {
  it("bruker grensesnittspråket når eksempelet finnes på det", () => {
    expect(pickDemoLanguage("ja")).toBe("ja");
    expect(pickDemoLanguage("es-MX")).toBe("es");
    expect(pickDemoLanguage("nb")).toBe("nb");
    expect(pickDemoLanguage("no")).toBe("nb");
    expect(pickDemoLanguage("en-GB")).toBe("en");
  });
  it("faller tilbake til engelsk ellers", () => {
    expect(pickDemoLanguage("fr")).toBe("en");
    expect(pickDemoLanguage("ko")).toBe("en");
    expect(pickDemoLanguage("")).toBe("en");
    expect(pickDemoLanguage(undefined)).toBe("en");
  });
});

describe("G-9 oppretting for ny bruker", () => {
  for (const lang of DEMO_LANGUAGES) {
    it(`alle kommandoene godtas og hovedvisningene bygges (${lang})`, () => {
      let { s, mainId } = newUserProject(lang);
      for (const c of planDemoProject({ productionId: mainId as never, language: lang, fps: FPS_25, width: 1920, height: 1080 }))
        s = mustApply(s, c);
      expect(sourceLanguageOf(s)).toBe(lang);
      expect(demoProjectName(lang).length).toBeGreaterThan(0);
      // Manus: 5 scener, kilde på valgt språk
      const occ = orderedOccurrences(s, mainId as never);
      expect(occ).toHaveLength(5);
      expect(() => scriptView(s, mainId as never)).not.toThrow();
      // 2 karakterer + 3 steder
      const assets = Object.values(s.assets);
      expect(assets.filter((a) => a.kind === "character")).toHaveLength(2);
      expect(assets.filter((a) => a.kind === "location")).toHaveLength(3);
      // Tre andre språkversjoner, med oversettelse av hver linje og overskrift
      const versions = Object.values(s.languageVersions ?? {});
      expect(versions.map((v) => v.language).sort()).toEqual(DEMO_LANGUAGES.filter((x) => x !== lang).sort());
      const lines = DEMO_SCENES.reduce((n, sc) => n + sc.blocks.length + 1, 0);
      expect(Object.values(s.translations)).toHaveLength(lines * 3);
      // Én montering per scene, ett animert lag med bevegelsesbane
      expect(Object.values(s.compositions)).toHaveLength(5);
      const animated = Object.values(s.layers).filter((l) => l.path);
      expect(animated).toHaveLength(1);
      expect(animated[0]!.path!.points.length).toBeGreaterThanOrEqual(2);
    });
  }
});
