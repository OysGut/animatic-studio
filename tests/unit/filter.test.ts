// @vitest-environment node
/** Søk, karakterfilter og «vis kun valgt scene» (REQ-0073–0075, REQ-0531). */
import { describe, expect, it } from "vitest";
import {
  activeStructure,
  characterName,
  charactersInProduction,
  filterPages,
  matchingOccurrences,
  parseScreenplayLines,
  planImport,
  scriptPages,
  type ProductionId,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const L = (page: number, row: number, x: number, text: string) => ({
  page,
  x,
  y: 72 + row * 12,
  text,
});

function project() {
  const { state, mainId } = seedProject(0);
  const parsed = parseScreenplayLines(
    [
      L(1, 0, 54, "1 INT. KJØKKEN - DAG 1"),
      L(1, 2, 108, "Maja står ved vinduet."),
      L(1, 4, 252, "OLE (O.S.)"),
      L(1, 5, 180, "Hvor er nissen?"),
      L(1, 7, 54, "2 EXT. TUN - NATT 2"),
      L(1, 9, 108, "Snøen laver ned. Ingen er ute."),
      L(2, 0, 54, "3 INT. FJØS - NATT 3"),
      L(2, 2, 252, "MAJA"),
      L(2, 3, 180, "Hei, nisse!"),
    ],
    { format: "pdf" },
  );
  const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
  return { s: mustApply(state, cmd), mainId, cmd };
}

describe("Karakterer", () => {
  it("navn uten tillegg, og karakterliste med antall scener (replikk eller nevnt i handling)", () => {
    expect(characterName("MALIN (O.S.)")).toBe("MALIN");
    expect(characterName("Maja (CONT'D)")).toBe("MAJA");
    expect(characterName("ROLF.")).toBe("ROLF");
    const { s, mainId } = project();
    expect(charactersInProduction(s, mainId)).toEqual([
      { name: "MAJA", scenes: 2 },
      { name: "OLE", scenes: 1 },
    ]);
  });
});

describe("Navn som er vanlige ord", () => {
  it("FAR treffer «Far» og «FAR», men ikke «far» i vanlig tekst", async () => {
    const { sceneHasCharacter } = await import("@/core");
    const { state, mainId } = seedProject(0);
    const mk = (text: string) => {
      const parsed = parseScreenplayLines([L(1, 0, 54, "1 INT. A - DAG 1"), L(1, 2, 108, text)], {
        format: "pdf",
      });
      const s = mustApply(
        state,
        planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid }),
      );
      return sceneHasCharacter(s, Object.values(s.variants)[0]!.id, "FAR");
    };
    expect(mk("De går langt, så langt de kan.")).toBe(false);
    expect(mk("Han har en far som venter.")).toBe(false);
    expect(mk("Far kommer inn.")).toBe(true);
    expect(mk("FAR (50) kommer inn.")).toBe(true);
  });
});

describe("Filter", () => {
  it("karakterfilter gir nøyaktig scenene der karakteren opptrer (REQ-0074)", () => {
    const { s, mainId, cmd } = project();
    const m = matchingOccurrences(s, mainId, { character: "MAJA" });
    expect([...m]).toEqual([cmd.scenes[0]!.occurrenceId, cmd.scenes[2]!.occurrenceId]);
  });

  it("fritekst søker i overskrift, tekst og nummer, uten hensyn til store/små bokstaver", () => {
    const { s, mainId, cmd } = project();
    expect([...matchingOccurrences(s, mainId, { text: "nisse" })]).toEqual([
      cmd.scenes[0]!.occurrenceId,
      cmd.scenes[2]!.occurrenceId,
    ]);
    expect([...matchingOccurrences(s, mainId, { text: "tun" })]).toEqual([
      cmd.scenes[1]!.occurrenceId,
    ]);
  });

  it("filtrering endrer ikke produksjonens aktive innhold (REQ-0075)", () => {
    const { s, mainId } = project();
    const before = activeStructure(s, mainId).map((o) => o.id);
    matchingOccurrences(s, mainId, { character: "OLE" });
    expect(activeStructure(s, mainId).map((o) => o.id)).toEqual(before);
  });
});

describe("Vis kun valgt scene (REQ-0531)", () => {
  it("viser bare den valgte scenens linjer med samme sidetall som i hele manuset", () => {
    const { s, mainId, cmd } = project();
    const all = scriptPages(s, mainId, { lockedPages: true });
    const third = cmd.scenes[2]!.occurrenceId;
    const only = filterPages(all.pages, new Set([third]));
    expect(only).toHaveLength(1);
    expect(only[0]!.number).toBe(all.sceneStartPage[third]);
    expect(only[0]!.lines.every((l) => l.occurrenceId === third)).toBe(true);
    expect(only[0]!.lines[0]!.row).toBe(
      all.pages[only[0]!.number - 1]!.lines.find((l) => l.occurrenceId === third)!.row,
    );
  });
});
