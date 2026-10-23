/** G-1b punkt 5: Noto-skriftsystem per tegn, og at bare fontene teksten trenger lastes. */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { hanFontFor, notoScriptsNeeded, notoUncovered, scriptRuns } from "@/core/typography/pdf-scripts";
import { scriptExportFontCheck } from "@/core";

describe("Noto per skriftsystem", () => {
  it("velger font ut fra innholdet", () => {
    expect(notoScriptsNeeded(["INT. KJØKKEN – DAG"])).toEqual(["latin"]);
    expect(notoScriptsNeeded(["台所 – 昼", "さくら"])).toEqual(["latin", "jp"]);
    expect(notoScriptsNeeded(["厨房"], "zh-Hans")).toEqual(["latin", "sc"]);
    expect(notoScriptsNeeded(["부엌"])).toEqual(["latin", "kr"]);
    expect(notoScriptsNeeded(["مطبخ", "מטבח", "रसोई", "ครัว", "Кухня", "Κουζίνα"])).toEqual([
      "latin", "arabic", "hebrew", "devanagari", "thai",
    ]);
  });
  it("deler blandet tekst i løp uten å miste tegn", () => {
    const text = "SAKURA: こんにちは, Ola!";
    const runs = scriptRuns(text);
    expect(runs.map((r) => r.text).join("")).toBe(text);
    expect(runs.map((r) => r.script)).toEqual(["latin", "jp", "latin"]);
  });
  it("Han-tegn følger språket når teksten ikke har kana", () => {
    expect(hanFontFor("厨房", "zh")).toBe("sc");
    expect(hanFontFor("厨房", "ja")).toBe("jp");
    expect(hanFontFor("台所です")).toBe("jp");
  });
  it("japansk manus-PDF stoppes ikke, og bygger inn JP-fonten", () => {
    expect(scriptExportFontCheck(["さくら", "台所 – 昼"], "pdf")).toMatchObject({ blocking: false, font: "Noto Sans", embedded: ["latin", "jp"] });
    expect(notoUncovered(["ok 🎬"])).toEqual(["🎬"]);
  });
  it("fontfilene finnes og OFL-lisensen ligger ved", () => {
    for (const f of ["NotoSans-Regular", "NotoSansJP", "NotoSansKR", "NotoSansArabic-Regular", "NotoSansHebrew-Regular", "NotoSansDevanagari-Regular", "NotoSansThai-Regular"])
      expect(existsSync(`public/fonts/pdf/${f}.ttf`)).toBe(true);
    expect(readFileSync("public/fonts/pdf/OFL.txt", "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
    expect(JSON.parse(readFileSync("src/assets/fonts/NotoSansSC.ttf.asset.json", "utf8")).url).toMatch(/NotoSansSC\.ttf$/);
  });
});
