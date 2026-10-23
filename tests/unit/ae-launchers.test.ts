import { describe, expect, it } from "vitest";
import { AE_LAUNCHER_MAC, AE_LAUNCHER_MAC_MODE, AE_LAUNCHER_WINDOWS, aeMacLauncher, aeWindowsLauncher } from "@/core/interchange/ae-launchers";
import { writeZip } from "@/engine/export/zip";
import { t } from "@/core/i18n/keyed";

const notFound = ["Fant ikke Adobe After Effects (prøv selv).", "Could not find Adobe After Effects."];

describe("PTG3 startfiler", () => {
  it("Windows: finner AfterFX.exe via miljøvariabel eller nyeste 20xx-mappe og kjører -r med full sti", () => {
    const bat = aeWindowsLauncher(notFound);
    expect(AE_LAUNCHER_WINDOWS).toBe("Åpne i After Effects (Windows).bat");
    expect(bat).toContain('set "JSX=%~dp0bygg-after-effects.jsx"');
    expect(bat).toContain("PTG_AFTERFX");
    expect(bat).toMatch(/for \/L %%Y in \(2035,-1,2018\)/);
    expect(bat).toContain("Adobe After Effects %%Y\\Support Files\\AfterFX.exe");
    expect(bat).toContain('start "" "%AE%" -r "%JSX%"');
    expect(bat).toContain("echo Fant ikke Adobe After Effects prøv selv.");
    expect(bat).toContain("\r\n");
  });

  it("Mac: finner nyeste «Adobe After Effects 20xx» og kjører DoScriptFile via osascript", () => {
    const sh = aeMacLauncher(notFound);
    expect(AE_LAUNCHER_MAC).toBe("Åpne i After Effects (Mac).command");
    expect(sh.startsWith("#!/bin/bash\n")).toBe(true);
    expect(sh).toContain('"/Applications/Adobe After Effects 20"*');
    expect(sh).toContain("sort | tail -n 1");
    expect(sh).toContain("DoScriptFile");
    expect(sh).toContain("display alert");
    expect(sh).toContain("Could not find Adobe After Effects.");
  });

  it("Mac-startfilen får unix-modus 0755 i sentralkatalogen", async () => {
    const chunks: Uint8Array[] = [];
    await writeZip({ write: async b => { chunks.push(b); }, close: async () => {}, abort: async () => {} }, [], {}, {
      extra: [{ path: AE_LAUNCHER_MAC, data: new TextEncoder().encode(aeMacLauncher(notFound)), unixMode: AE_LAUNCHER_MAC_MODE }, { path: "bygg-after-effects.jsx", data: new TextEncoder().encode("//") }],
    });
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    // Finn sentralkatalogpostene og les «laget av» og eksterne attributter
    const v = new DataView(all.buffer); const found: Record<string, { madeBy: number; ext: number }> = {};
    for (let i = 0; i + 46 < all.length; i++) {
      if (v.getUint32(i, true) !== 0x02014b50) continue;
      const n = v.getUint16(i + 28, true); const name = new TextDecoder().decode(all.subarray(i + 46, i + 46 + n));
      found[name] = { madeBy: v.getUint16(i + 4, true), ext: v.getUint32(i + 38, true) };
    }
    expect(found[AE_LAUNCHER_MAC]!.madeBy >> 8).toBe(3);
    expect((found[AE_LAUNCHER_MAC]!.ext >>> 16) & 0o777).toBe(0o755);
    expect(found["bygg-after-effects.jsx"]!.ext).toBe(0);
  });

  it("LESMEG forklarer de tre veiene, .aep-navnet og hva som ikke gjenskapes, på nb og en", () => {
    const nb = t("ptg3.readme-ae-open", { value1: "TEST.aep" }, "nb");
    const en = t("ptg3.readme-ae-open", { value1: "TEST.aep" }, "en");
    for (const s of [nb, en]) {
      expect(s).toContain(AE_LAUNCHER_WINDOWS); expect(s).toContain(AE_LAUNCHER_MAC);
      expect(s).toContain("Run Script File"); expect(s).toContain("TEST.aep");
      expect(s).toContain("Allow Scripts to Write Files and Access Network");
    }
    expect(nb).toMatch(/tekstlag gjenskapes ikke/); expect(nb).toMatch(/formatet er lukket/);
    expect(en).toMatch(/text layers are not recreated/); expect(en).toMatch(/format is closed/);
  });
});

describe("PTG3 skriptnavn og rekkefølge (Øystein 23.10)", () => {
  it("skriptet heter bygg-after-effects.jsx, og begge startfilene kjører det", async () => {
    const { AE_JSX_FILE } = await import("@/core/interchange/ae-launchers");
    expect(AE_JSX_FILE).toBe("bygg-after-effects.jsx");
    expect(aeWindowsLauncher(notFound)).toContain('set "JSX=%~dp0bygg-after-effects.jsx"');
    expect(aeMacLauncher(notFound)).toContain('JSX="$DIR/bygg-after-effects.jsx"');
  });

  it("startfilene skrives først i ZIP-en, før skriptet og LESMEG", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/engine/export/ae-export.ts", "utf8");
    const mac = src.indexOf("path: AE_LAUNCHER_MAC"), win = src.indexOf("path: AE_LAUNCHER_WINDOWS"), jsx = src.indexOf("path: AE_JSX_FILE"), readme = src.indexOf('path: "LESMEG.txt"');
    expect(mac).toBeGreaterThan(0);
    expect(mac).toBeLessThan(jsx); expect(win).toBeLessThan(jsx); expect(jsx).toBeLessThan(readme);
    expect(src).not.toMatch(/path: "bygg\.jsx"/);
  });

  it("LESMEG forklarer at .jsx kan åpne et annet Adobe-program, på nb og en", () => {
    const nb = t("ptg3.readme-ae-other-app", {}, "nb"); const en = t("ptg3.readme-ae-other-app", {}, "en");
    expect(nb).toContain("Audition"); expect(nb).toContain("Åpne med"); expect(nb).toContain("Vis info");
    expect(en).toContain("Audition"); expect(en).toContain("Open With"); expect(en).toContain("Get Info");
    for (const l of ["nb", "en"] as const) {
      for (const s of [t("ptg3.readme-ae", {}, l), t("ptg3.ae-not-found", {}, l), t("ptg3.readme-ae-open", { value1: "X.aep" }, l)]) {
        expect(s).toContain("bygg-after-effects.jsx");
        expect(s).not.toMatch(/(^|[^-])bygg\.jsx/);
      }
    }
  });
});
