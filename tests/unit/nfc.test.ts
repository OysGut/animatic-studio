/**
 * G-4 punkt 3: all tekst lagres som NFC (kanonisk sammensatt form). Testene sjekker dyb normalisering,
 * importveiene (Fountain og PDF/DOCX-linjer) og at klientveien mot apply_changes (use-commands) kaller nfcDeep.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nfc, nfcDeep } from "@/core/nfc";
import { parseFountain } from "@/core/screenplay/fountain";
import { parseScreenplayLines } from "@/core/screenplay/parse";

const NFD_E = "é"; // e + kombinerende aksent
const NFC_E = "é"; // U+00E9

describe("nfc", () => {
  it("gjør NFD om til NFC", () => {
    expect(nfc(NFD_E)).toBe(NFC_E);
  });

  it("lar ASCII og ID-er være uendret", () => {
    expect(nfc("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});

describe("nfcDeep", () => {
  it("normaliserer strenger i nestede objekter og lister", () => {
    const cmd = { type: "EditBlockText", blockId: "b1", text: `Caf${NFD_E}`, tags: [`na${"ı̈"}ve`] };
    const out = nfcDeep(cmd);
    expect(out.text).toBe(`Caf${NFC_E}`);
    expect(out.tags[0]).toBe(`na${"ï"}ve`);
    expect(out.blockId).toBe("b1");
  });

  it("lar tall, null og udefinerte verdier være i fred", () => {
    const cmd = { n: 42, x: null, u: undefined, ok: true };
    expect(nfcDeep(cmd)).toEqual(cmd);
  });

  it("gir samme referanse tilbake når ingenting endres (ingen unødvendig omskriving)", () => {
    const cmd = { type: "EditBlockText", text: "vanlig tekst" };
    expect(nfcDeep(cmd)).toBe(cmd);
  });
});

describe("import normaliserer til NFC", () => {
  it("Fountain: handlingslinje med NFD lagres som NFC", () => {
    const result = parseFountain(`INT. HUS – DAG\n\nSara går inn i caf${NFD_E}en.\n`);
    const texts = result.parsed.scenes.flatMap((s) => s.blocks.map((b) => b.text));
    expect(texts.some((t) => t.includes(`caf${NFC_E}en`))).toBe(true);
    expect(texts.some((t) => t.includes(NFD_E))).toBe(false);
  });

  it("PDF/DOCX-linjer: NFD blir NFC", () => {
    const result = parseScreenplayLines(
      [{ page: 1, x: 108, y: 72, text: `En caf${NFD_E} i byen.` }],
      { format: "pdf" },
    );
    const texts = result.scenes.flatMap((s) => s.blocks.map((b) => b.text));
    expect(texts.some((t) => t.includes(NFD_E))).toBe(false);
  });
});

describe("klientveien mot apply_changes", () => {
  it("use-commands normaliserer kommandoen med nfcDeep før lokal kjøring og lagring", () => {
    const src = readFileSync("src/app/project/use-commands.ts", "utf8");
    expect(src).toContain('import { nfcDeep } from "@/core/nfc"');
    // Normaliseringen skjer før applyCommand og før runCommand kalles
    const iNfc = src.indexOf("nfcDeep(rawCommand)");
    const iApply = src.indexOf("applyCommand(before");
    const iRun = src.indexOf("runCommand({");
    expect(iNfc).toBeGreaterThan(-1);
    expect(iNfc).toBeLessThan(iApply);
    expect(iNfc).toBeLessThan(iRun);
  });
});
