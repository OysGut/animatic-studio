/** C-9: kapabilitetsmodellen viser ærlig hva som virker; programmer uten bygget kobling får bare «Eksporter for …». */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTERS, CAPABILITIES, EXISTING_EXPORT_FORMATS, offerFor, validDescriptor, type AdapterDescriptor } from "@/core/connectors";

const C9 = ["toonboom-harmony", "davinci-resolve", "blackmagic-fusion", "clip-studio-paint", "procreate-dreams", "dragonframe", "reaper"];
const byId = (id: string) => ADAPTERS.find(a => a.id === id)!;

describe("C-9 kapabilitetsmodell", () => {
  it("alle sju programmene finnes som export-only uten kapabiliteter", () => {
    for (const id of C9) {
      const a = byId(id);
      expect(a, id).toBeTruthy();
      expect(a.connection).toBe("export");
      expect(a.capabilities).toEqual([]);
    }
  });
  it("export-only gir alltid «Eksporter for …», aldri en handling", () => {
    for (const id of C9) for (const c of CAPABILITIES) expect(offerFor(byId(id), c)).toEqual({ kind: "export", format: byId(id).exportFallback });
  });
  it("bygde koblinger tilbyr fortsatt handlingene sine", () => {
    expect(offerFor(byId("adobe-photoshop-uxp"), "layers")).toEqual({ kind: "action", capability: "layers" });
    expect(offerFor(byId("boords-api"), "audio")).toEqual({ kind: "export", format: "pdf" });
  });
  it("eksportformatene finnes i dag, og fallback er ett av dem", () => {
    for (const id of C9) {
      const a = byId(id);
      for (const f of a.exportFormats!) expect(EXISTING_EXPORT_FORMATS as readonly string[]).toContain(f);
      expect(a.exportFormats).toContain(a.exportFallback);
    }
  });
  it("alle adaptere er gyldige og unike; export-only med kapabiliteter avvises", () => {
    expect(ADAPTERS.every(validDescriptor)).toBe(true);
    expect(new Set(ADAPTERS.map(a => a.id)).size).toBe(ADAPTERS.length);
    const bad: AdapterDescriptor = { ...byId("reaper"), capabilities: ["audio"] };
    expect(validDescriptor(bad)).toBe(false);
    expect(validDescriptor({ ...byId("reaper"), exportFormats: [] })).toBe(false);
  });
  it("matrisen dekker alle sju programmene med koblingstype og offisielle kilder", () => {
    const md = readFileSync(join(__dirname, "../../docs/connectors/CAPABILITY_MATRIX.md"), "utf8");
    for (const id of C9) expect(md).toContain(`\`${id}\``);
    expect((md.match(/https:\/\//g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(md).toContain("## English");
  });
});
