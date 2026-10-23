// @vitest-environment node
/** ID-merket i vinduene (Øystein 23.10): alle dialoger, popuper, paneler og sider har ett unikt nummer i registeret. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error – rent JavaScript-skript uten typer
import { DOC, ROOT, readRegistry, renderDoc, routeFiles, routeIdOf, scanCode, sourceFiles } from "../../scripts/ui-ids/ui-ids.mjs";

interface Hit { file: string; tag: string; id: string | null }
interface Entry { id: string; file: string; route?: string; status: string }
const hits = scanCode() as Hit[];
const entries = readRegistry() as Entry[];
const byId = new Map(entries.map((e) => [e.id, e]));

describe("ID-merker i vinduene", () => {
  it("hver dialog, bekreftelse, sheet og popup har et ID-nummer", () => {
    expect(hits.filter((h) => !h.id).map((h) => `${h.file} <${h.tag}>`)).toEqual([]);
  });
  it("ingen to vinduer deler ID", () => {
    const seen = new Map<string, string>(); const dup: string[] = [];
    for (const h of hits) { if (!h.id) continue; if (seen.has(h.id)) dup.push(`${h.id}: ${seen.get(h.id)} og ${h.file}`); seen.set(h.id, h.file); }
    expect(dup).toEqual([]);
  });
  it("alle ID-er i koden står som aktive i registeret, med riktig fil", () => {
    const bad = hits.filter((h) => h.id && (byId.get(h.id)?.status !== "aktiv" || byId.get(h.id)?.file !== h.file)).map((h) => `${h.id} ${h.file}`);
    expect(bad).toEqual([]);
  });
  it("registeret har unike numre i stigende rekkefølge, og aktive vinduer finnes i koden", () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    const inCode = new Set(hits.map((h) => h.id));
    expect(entries.filter((e) => e.status === "aktiv" && !e.route && !inCode.has(e.id)).map((e) => e.id)).toEqual([]);
  });
  it("hver side har en ID, og rutene finnes i rutetreet", () => {
    const tree = readFileSync(join(ROOT, "src/routeTree.gen.ts"), "utf8");
    for (const file of routeFiles() as string[]) {
      const route = routeIdOf(file);
      expect(entries.find((e) => e.route === route && e.status === "aktiv")?.file, file).toBe(file);
      expect(tree.includes(`'${route}': {`), route).toBe(true);
    }
  });
  it("egne flytende vinduer (role=dialog) viser merket", () => {
    const missing = (sourceFiles() as string[]).filter((f) => {
      const src = readFileSync(join(ROOT, f), "utf8");
      return /role="(dialog|alertdialog)"/.test(src) && !/<UiId\s+id="V-\d{3}"/.test(src) && !/uiId="V-\d{3}"/.test(src);
    });
    expect(missing).toEqual([]);
  });
  it("oversikten i docs er generert fra registeret", () => {
    expect(readFileSync(join(ROOT, DOC), "utf8")).toBe(renderDoc(entries));
  });
});
