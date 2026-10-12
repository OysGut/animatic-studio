// @vitest-environment node
/** Sammenligning av manusversjoner: karakterer og objekter (DEC-0075, REQ-0078). */
import { describe, expect, it } from "vitest";
import {
  CHANGE_LABEL,
  charactersOf,
  diffSnapshots,
  objectsOf,
  type ScriptLibraryAsset,
  type ScriptSnapshot,
  type SnapshotBlock,
} from "@/core";

const b = (id: string, kind: SnapshotBlock["kind"], text: string): SnapshotBlock => ({
  id,
  kind,
  text,
  rev: 1,
});

function snap(blocks: SnapshotBlock[]): ScriptSnapshot {
  return {
    format: 1,
    productionId: "p",
    scenes: [
      {
        occurrenceId: "o1",
        sceneId: "s1",
        variantId: "v1",
        number: "1",
        active: true,
        activeTakeId: null,
        heading: { intExt: "INT.", location: "STUA", time: "KVELD" },
        blocks,
      },
    ],
  };
}

const LIB: ScriptLibraryAsset[] = [
  { kind: "character", name: "Maja", names: [] },
  {
    kind: "character",
    name: "Bestefar",
    names: [{ name: "Laurits", kind: "alias", language: null }],
  },
  {
    kind: "object",
    name: "Lykt",
    names: [{ name: "parafinlampe", kind: "alias", language: null }],
  },
  { kind: "object", name: "Vase", names: [] },
  { kind: "object", name: "Kiste", names: [], archived: true },
];

describe("karakterer i scenen", () => {
  it("replikk og navn i handlingen (fra biblioteket) teller; alias gir foretrukket navn", () => {
    const sc = snap([
      b("a", "action", "Laurits sitter ved bordet. Maja kommer inn."),
      b("c", "character", "OLE (O.S.)"),
      b("d", "dialogue", "Hei, Maja!"),
    ]).scenes[0]!;
    expect([...charactersOf(sc, LIB)].sort()).toEqual(["BESTEFAR", "MAJA", "OLE"]);
    // Uten bibliotek: bare de som har replikk (som før)
    expect([...charactersOf(sc)]).toEqual(["OLE"]);
  });

  it("navn med små bokstaver regnes ikke som karakteren («maja» i en setning)", () => {
    const sc = snap([b("a", "action", "Han ser på maja-blomsten.")]).scenes[0]!;
    expect(charactersOf(sc, LIB).size).toBe(0);
  });
});

describe("objekter i scenen", () => {
  it("objekter fra biblioteket kjennes igjen i handling og replikk, også bøyd og under alias", () => {
    const sc = snap([
      b("a", "action", "Vasen står på bordet."),
      b("c", "character", "MAJA"),
      b("d", "dialogue", "Tenn parafinlampen!"),
    ]).scenes[0]!;
    expect([...objectsOf(sc, LIB)].sort()).toEqual(["Lykt", "Vase"]);
  });

  it("arkiverte objekter tas ikke med", () => {
    const sc = snap([b("a", "action", "En kiste i hjørnet.")]).scenes[0]!;
    expect(objectsOf(sc, LIB).size).toBe(0);
  });
});

describe("sammenligning av versjoner (REQ-0078)", () => {
  it("rapporterer karakterer og objekter som er kommet til eller borte, per scene", () => {
    const older = snap([
      b("a", "action", "Maja tenner lykta."),
      b("c", "character", "OLE"),
      b("d", "dialogue", "Fint."),
    ]);
    const newer = snap([
      b("a", "action", "Laurits setter vasen på bordet."),
      b("c", "character", "OLE"),
      b("d", "dialogue", "Fint."),
    ]);
    const changes = diffSnapshots(older, newer, LIB);
    const chars = changes.find((c) => c.type === "characters")!;
    expect(chars.names).toEqual({ added: ["BESTEFAR"], removed: ["MAJA"] });
    expect(chars.detail).toBe("+ BESTEFAR  − MAJA");
    const objs = changes.find((c) => c.type === "objects")!;
    expect(objs.names).toEqual({ added: ["Vase"], removed: ["Lykt"] });
    expect(objs.occurrenceId).toBe("o1");
    expect(CHANGE_LABEL.objects).toBe("Endrede objekter");
    // Handlingen er også endret
    expect(changes.some((c) => c.type === "action")).toBe(true);
  });

  it("uten bibliotek: bare karakterer med replikk, ingen objekter (samme som før)", () => {
    const older = snap([b("c", "character", "OLE"), b("d", "dialogue", "Ja.")]);
    const newer = snap([b("c", "character", "MAJA"), b("d", "dialogue", "Ja.")]);
    const changes = diffSnapshots(older, newer);
    expect(changes.find((c) => c.type === "characters")!.names).toEqual({
      added: ["MAJA"],
      removed: ["OLE"],
    });
    expect(changes.some((c) => c.type === "objects")).toBe(false);
  });

  it("ingen endring i karakterer eller objekter gir ingen slike endringer", () => {
    const s1 = snap([b("a", "action", "Maja og vasen.")]);
    const s2 = snap([b("a", "action", "Maja og vasen.")]);
    expect(diffSnapshots(s1, s2, LIB)).toEqual([]);
  });
});

describe("byttet taler er en replikkendring (kodegjennomgang DEC-0075)", () => {
  const two = (w1: string, w2: string) =>
    snap([
      b("c1", "character", w1),
      b("d1", "dialogue", "Hei."),
      b("c2", "character", w2),
      b("d2", "dialogue", "Hallo."),
    ]);

  it("to replikker bytter taler", () => {
    const changes = diffSnapshots(two("ANNA", "PER"), two("PER", "ANNA"));
    const d = changes.find((c) => c.type === "dialogue")!;
    expect(d.lines).toHaveLength(2);
    expect(d.lines![0]).toMatchObject({ op: "changed", before: "ANNA: Hei.", after: "PER: Hei." });
  });

  it("ANNA → ANNA (V.O.) er en endring", () => {
    const changes = diffSnapshots(two("ANNA", "PER"), two("ANNA (V.O.)", "PER"));
    expect(changes.find((c) => c.type === "dialogue")!.lines).toHaveLength(1);
  });

  it("uendret gir ingenting", () => {
    expect(diffSnapshots(two("ANNA", "PER"), two("ANNA", "PER"))).toEqual([]);
  });
});
