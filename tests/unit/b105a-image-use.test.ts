// @vitest-environment node
/**
 * B-105a: proxy i visning, original i eksport, rigg-PDF/kontur og zoom over 100 %. Rene valg testes
 * direkte; kallstedene kontrolleres statisk (eksportene laster bare `mediaPath`, så kompositoren faller
 * tilbake til originalen der).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { derivedFilesError, versionImagePath } from "@/core";

const ROOT = join(__dirname, "../..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const file = (path: string, w = 100) => ({ path, width: w, height: w, byteSize: 10, sha256: "a".repeat(64) });
const v = {
  mediaPath: "p/a/v/original.png",
  derivedFiles: { working: file("p/a/v/working.png"), proxy: file("p/a/v/proxy.webp"), thumbnail: file("p/a/v/thumb.webp", 256) },
};

describe("versionImagePath", () => {
  it("visning og forhåndsvisning bruker proxy; miniatyr bruker miniatyrfila", () => {
    expect(versionImagePath(v, "playback")).toBe("p/a/v/proxy.webp");
    expect(versionImagePath(v, "preview")).toBe("p/a/v/proxy.webp");
    expect(versionImagePath(v, "thumbnail")).toBe("p/a/v/thumb.webp");
  });
  it("eksport, rigg-PDF og zoom over 100 % bruker originalen", () => {
    expect(versionImagePath(v, "export")).toBe(v.mediaPath);
    expect(versionImagePath(v, "rig-pdf")).toBe(v.mediaPath);
    expect(versionImagePath(v, "zoom", 2)).toBe(v.mediaPath);
    expect(versionImagePath(v, "zoom", 1)).toBe("p/a/v/proxy.webp");
  });
  it("eldre versjoner uten avledede filer bruker alltid originalen", () => {
    for (const use of ["playback", "thumbnail", "export"] as const)
      expect(versionImagePath({ mediaPath: "old.png" }, use)).toBe("old.png");
  });
});

describe("derivedFilesError", () => {
  it("godtar gyldige filer og avviser ukjente nøkler, feil hash og størrelse", () => {
    expect(derivedFilesError(v.derivedFiles)).toBeNull();
    expect(derivedFilesError({ other: file("x") })).not.toBeNull();
    expect(derivedFilesError({ proxy: { ...file("x"), sha256: "nope" } })).not.toBeNull();
    expect(derivedFilesError({ proxy: { ...file("x"), byteSize: 0 } })).not.toBeNull();
    expect(derivedFilesError([])).not.toBeNull();
  });
});

describe("kallstedene", () => {
  it("eksportene (video/ProRes/PNG og alfa) laster bare originalene", () => {
    for (const f of ["src/app/assembly/ExportAnimaticDialog.tsx", "src/app/assembly/AlphaExportDialog.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/\.mediaPath/);
      expect(src, f).not.toMatch(/versionImagePath/);
    }
  });
  it("kontur og rigg-utskrift bruker originalen; inspeksjonen bytter til originalen over 100 %", () => {
    expect(read("src/app/rig/ContourPreview.tsx")).toMatch(/useImageUrls\(version \? \[version\.mediaPath\]/);
    expect(read("src/app/rig/InspectionWindow.tsx")).toMatch(/zoom>1\?version\.mediaPath:playbackPath/);
  });
  it("visningen (kompositor, film, scene, miniatyr) ber om proxy med originalen som reserve", () => {
    const canvas = read("src/engine/compositor/canvas.ts");
    expect(canvas).toMatch(/versionImagePath\(it\.version, "playback"\)\) \?\?\s*opts\.images\.get\(it\.version\.mediaPath\)/);
    expect(read("src/app/assembly/film-images.ts")).toMatch(/versionImagePath\(v, "playback"\)/);
    expect(read("src/app/library/AssetThumb.tsx")).toMatch(/versionImagePath\(v, "thumbnail"\)/);
  });
  it("opplastingene går gjennom én felles inngang (ingestImage)", () => {
    expect(read("src/app/library/asset-images.ts")).toMatch(/ingestImage\(/);
    expect(read("src/app/library/derived-backfill.ts")).toMatch(/SetAssetVersionDerived/);
  });
});
