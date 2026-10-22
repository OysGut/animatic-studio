/** B-098 (N3): lisenstabellen er generert fra METADATA.pb i google/fonts og bygget inn i appen. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOOGLE_FONTS_COMMIT, GOOGLE_FONT_LICENSE_COUNTS, GOOGLE_FONT_LICENSES } from "@/core/typography/google-font-licenses.gen";
import { licenseOf } from "@/core";

describe("Google Fonts-lisenser fra METADATA.pb", () => {
  it("tabellen er generert fra en bestemt commit og tellingene stemmer", () => {
    expect(GOOGLE_FONTS_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    const counts = { O: 0, A: 0, U: 0 };
    for (const c of Object.values(GOOGLE_FONT_LICENSES)) counts[c]++;
    expect(counts).toEqual(GOOGLE_FONT_LICENSE_COUNTS);
    expect(Object.keys(GOOGLE_FONT_LICENSES).length).toBeGreaterThan(1500);
  });
  it("kjente familier får lisensen fra METADATA.pb", () => {
    expect(GOOGLE_FONT_LICENSES["ubuntu"]).toBe("U");
    expect(GOOGLE_FONT_LICENSES["open sans"]).toBe("O");
    expect(licenseOf(undefined, "Calligraffitti")).toBe("Apache-2.0");
    expect(licenseOf(undefined, "  UBUNTU  ")).toBe("UFL-1.0");
  });
  it("lisensen bestemmes uten nettverk og uten de gamle navnelistene", () => {
    const src = readFileSync("src/core/typography/google-catalog.ts", "utf8");
    expect(src).not.toMatch(/const APACHE\s*=/);
    expect(src).not.toMatch(/const UFL\s*=/);
    expect(src).not.toMatch(/fetch\(/);
  });
});
