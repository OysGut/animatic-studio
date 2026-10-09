// @vitest-environment node
/** Forslag til ressursbiblioteket fra manuset (REQ-0128, DEC-0034). */
import { describe, expect, it } from "vitest";
import {
  OBJECT_MIN_SCENES,
  SOURCE_NOTE_LABEL,
  cleanLocation,
  cleanSpeaker,
  editDistance,
  librarySuggestions,
  parseScreenplayLines,
  planImport,
  suggestionAliases,
  type AssetFields,
  type LibrarySuggestion,
  type ProductionId,
  type ProjectState,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

interface SceneSpec {
  /** Overskrift uten scenenummer, f.eks. «INT. STUA - DAG». Nummer settes på foran og bak. */
  heading: string;
  action?: string[];
  speakers?: [name: string, line: string][];
}

const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });

/** Bygger et manus fra scener med stigende radnummer. Scene n får nummer n. */
function project(scenes: SceneSpec[], extra?: (s: ProjectState) => ProjectState) {
  const { state, mainId } = seedProject(0);
  const lines: ReturnType<typeof L>[] = [];
  let row = 0;
  scenes.forEach((sc, i) => {
    const n = i + 1;
    lines.push(L(row, 54, `${n} ${sc.heading} ${n}`));
    row += 2;
    for (const a of sc.action ?? []) {
      lines.push(L(row, 108, a));
      row += 2;
    }
    for (const [name, line] of sc.speakers ?? []) {
      lines.push(L(row, 252, name));
      lines.push(L(row + 1, 180, line));
      row += 3;
    }
    row += 1;
  });
  const parsed = parseScreenplayLines(lines, { format: "pdf" });
  const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
  const s = mustApply(state, cmd);
  const out = extra ? extra(s) : s;
  return { s: out, mainId: mainId as ProductionId };
}

function suggest(scenes: SceneSpec[], extra?: (s: ProjectState) => ProjectState) {
  const { s, mainId } = project(scenes, extra);
  // Sjekk at fixturen er tolket som tenkt: like mange scener som oppgitt
  const all = librarySuggestions(s, mainId);
  return { s, mainId, all };
}

const find = (all: LibrarySuggestion[], kind: string, name: string) =>
  all.find((x) => x.kind === kind && x.name === name);

const INT = "INT. STUA - DAG";
const say = (name: string): [string, string] => [name, "Hei."];

function fields(over: Partial<AssetFields> = {}): AssetFields {
  return {
    kind: "character",
    name: "Laurits",
    names: [],
    description: "",
    category: "",
    tags: [],
    ...over,
  };
}

describe("fixturen", () => {
  it("gir like mange scener som oppgitt, med nummer 1..n", () => {
    const { s, mainId } = project([
      { heading: INT, speakers: [say("MAJA")] },
      { heading: "EXT. TUNET - DAG", action: ["Det snør."] },
      { heading: INT, speakers: [say("ROLF")] },
    ]);
    const all = librarySuggestions(s, mainId);
    const maja = find(all, "character", "MAJA");
    expect(maja?.sceneNumbers).toEqual(["1"]);
    expect(find(all, "character", "ROLF")?.sceneNumbers).toEqual(["3"]);
    expect(find(all, "location", "TUNET")?.sceneNumbers).toEqual(["2"]);
    expect(find(all, "location", "STUA")?.scenes).toBe(2);
  });
});

describe("cleanSpeaker", () => {
  it("fjerner tall: «MARTIN 9» → MARTIN", () => {
    expect(cleanSpeaker("MARTIN 9")).toEqual({ names: ["MARTIN"], note: "number" });
  });
  it("deler grupper: «LAURITS OG ROLF»", () => {
    expect(cleanSpeaker("LAURITS OG ROLF")).toEqual({
      names: ["LAURITS", "ROLF"],
      note: "group",
    });
  });
  it("tar første ved «MALIN TIL MAJA»", () => {
    expect(cleanSpeaker("MALIN TIL MAJA")).toEqual({ names: ["MALIN"], note: "addressed" });
  });
  it("fjerner beskrivelse: «OLA SMILENDE»", () => {
    expect(cleanSpeaker("OLA SMILENDE")).toEqual({ names: ["OLA"], note: "descriptor" });
  });
  it("lar et rent navn være uendret", () => {
    expect(cleanSpeaker("MAJA")).toEqual({ names: ["MAJA"], note: null });
  });
  it("beholder «BESTEMOR ANNE» som ett navn", () => {
    expect(cleanSpeaker("BESTEMOR ANNE")).toEqual({ names: ["BESTEMOR ANNE"], note: null });
  });
  it("fjerner også ledende tall og kjente beskrivelsesord", () => {
    expect(cleanSpeaker("12 MAJA").names).toEqual(["MAJA"]);
    expect(cleanSpeaker("MAJA HVISKER")).toEqual({ names: ["MAJA"], note: "descriptor" });
  });
  it("deler på & og skråstrek", () => {
    expect(cleanSpeaker("MAJA & ROLF").names).toEqual(["MAJA", "ROLF"]);
    expect(cleanSpeaker("MAJA/ROLF").names).toEqual(["MAJA", "ROLF"]);
  });
});

describe("cleanLocation", () => {
  it("fjerner «PÅ»", () => {
    expect(cleanLocation("PÅ TUNET")).toEqual({ name: "TUNET", note: "preposition" });
  });
  it("fjerner «INNE I»", () => {
    expect(cleanLocation("INNE I LÅVEN").name).toBe("LÅVEN");
  });
  it("store bokstaver og ingen merknad når det ikke er preposisjon", () => {
    expect(cleanLocation("tunet")).toEqual({ name: "TUNET", note: null });
    expect(cleanLocation("TUNET").note).toBeNull();
  });
});

describe("editDistance og merkelapper", () => {
  it("teller endringer", () => {
    expect(editDistance("LAURIT", "LAURITS")).toBe(1);
    expect(editDistance("MAJA", "MAJA")).toBe(0);
    expect(editDistance("KATT", "HUND")).toBe(4);
  });
  it("har en norsk merkelapp for hver kildemerknad", () => {
    expect(SOURCE_NOTE_LABEL.typo).toBe("mulig skrivefeil");
    expect(Object.keys(SOURCE_NOTE_LABEL)).toHaveLength(8);
  });
});

describe("karakterforslag", () => {
  it("slår en skrivefeil i én scene sammen med navnet i flere scener", () => {
    const { all } = suggest([
      { heading: INT, speakers: [say("LAURITS")] },
      { heading: INT, speakers: [say("LAURITS")] },
      { heading: INT, speakers: [say("LAURIT")] },
    ]);
    expect(find(all, "character", "LAURIT")).toBeUndefined();
    const l = find(all, "character", "LAURITS")!;
    expect(l.reason).toBe("speaker");
    expect(l.scenes).toBe(3);
    // Sammenslått skrivefeil må bekreftes av brukeren
    expect(l.uncertain).toBe(true);
    expect(l.sources).toEqual([{ name: "LAURIT", scenes: 1, note: "typo" }]);
    expect(l.sceneNumbers).toEqual(["1", "2", "3"]);
  });

  it("«LAURITS OG ROLF» teller for begge", () => {
    const { all } = suggest([
      { heading: INT, speakers: [say("LAURITS OG ROLF")] },
      { heading: INT, speakers: [say("LAURITS")] },
      { heading: INT, speakers: [say("ROLF")] },
    ]);
    expect(find(all, "character", "LAURITS OG ROLF")).toBeUndefined();
    const l = find(all, "character", "LAURITS")!;
    const r = find(all, "character", "ROLF")!;
    expect(l.scenes).toBe(2);
    expect(l.sceneNumbers).toEqual(["1", "2"]);
    expect(r.scenes).toBe(2);
    expect(r.sceneNumbers).toEqual(["1", "3"]);
    expect(l.sources).toEqual([{ name: "LAURITS OG ROLF", scenes: 1, note: "group" }]);
  });

  it("en karakter i bare én scene er usikker, i to scener er den sikker", () => {
    const { all } = suggest([
      { heading: INT, speakers: [say("DYNAMITT"), say("MAJA")] },
      { heading: INT, speakers: [say("MAJA")] },
    ]);
    expect(find(all, "character", "DYNAMITT")!.uncertain).toBe(true);
    expect(find(all, "character", "MAJA")!.uncertain).toBe(false);
  });

  it("scenenumre er begrenset til de seks første", () => {
    const scenes: SceneSpec[] = Array.from({ length: 8 }, () => ({
      heading: INT,
      speakers: [say("MAJA")],
    }));
    const { all } = suggest(scenes);
    const m = find(all, "character", "MAJA")!;
    expect(m.scenes).toBe(8);
    expect(m.sceneNumbers).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("«MARTIN 9» og «MARTIN» blir ett forslag med kilde «number»", () => {
    const { all } = suggest([
      { heading: INT, speakers: [say("MARTIN 9")] },
      { heading: INT, speakers: [say("MARTIN")] },
    ]);
    const m = find(all, "character", "MARTIN")!;
    expect(m.scenes).toBe(2);
    expect(m.sources).toEqual([{ name: "MARTIN 9", scenes: 1, note: "number" }]);
  });
});

describe("navngitte ting", () => {
  it("«Svarten» midt i setning i to scener foreslås som usikker type", () => {
    const { all } = suggest([
      { heading: INT, action: ["Maja klapper Svarten."], speakers: [say("MAJA")] },
      { heading: INT, action: ["Rolf mater Svarten."], speakers: [say("MAJA")] },
    ]);
    const x = all.find((y) => y.reason === "named" && y.name === "Svarten")!;
    expect(x).toBeDefined();
    expect(x.kindUncertain).toBe(true);
    expect(x.uncertain).toBe(true);
    expect(x.scenes).toBe(2);
    expect(x.sceneNumbers).toEqual(["1", "2"]);
  });

  it("et ord med stor forbokstav bare i setningsstart foreslås ikke", () => {
    const { all } = suggest([
      { heading: INT, action: ["Svarten løper. Kaldt."], speakers: [say("MAJA")] },
      { heading: INT, action: ["Svarten sover."], speakers: [say("MAJA")] },
    ]);
    expect(all.some((x) => x.reason === "named")).toBe(false);
  });

  it("eieform av en replikkkarakter («Majas») foreslås ikke", () => {
    const { all } = suggest([
      { heading: INT, action: ["Rolf tar Majas lue."], speakers: [say("MAJA")] },
      { heading: INT, action: ["Rolf finner Majas sekk."], speakers: [say("MAJA")] },
    ]);
    expect(all.some((x) => x.reason === "named")).toBe(false);
  });

  it("ord som står i stoppordlisten («Gud») foreslås ikke", () => {
    const { all } = suggest([
      { heading: INT, action: ["Rolf roper til Gud."], speakers: [say("MAJA")] },
      { heading: INT, action: ["Rolf ber til Gud."], speakers: [say("MAJA")] },
    ]);
    expect(all.some((x) => x.reason === "named")).toBe(false);
  });
});

describe("lokasjonsforslag", () => {
  it("«KJØKKEN» og «KJØKKENET» slås sammen (annen bøyning)", () => {
    const { all } = suggest([
      { heading: "INT. KJØKKEN - DAG" },
      { heading: "INT. KJØKKEN - KVELD" },
      { heading: "INT. KJØKKENET - NATT" },
    ]);
    expect(find(all, "location", "KJØKKENET")).toBeUndefined();
    const k = find(all, "location", "KJØKKEN")!;
    expect(k.scenes).toBe(3);
    expect(k.sources).toEqual([{ name: "KJØKKENET", scenes: 1, note: "form" }]);
  });

  it("«GÅRD, TUNET» slås sammen med «TUNET»", () => {
    const { all } = suggest([
      { heading: "EXT. TUNET - DAG" },
      { heading: "EXT. GÅRD, TUNET - DAG" },
    ]);
    expect(find(all, "location", "GÅRD, TUNET")).toBeUndefined();
    const t = find(all, "location", "TUNET")!;
    expect(t.scenes).toBe(2);
    expect(t.sources).toEqual([{ name: "GÅRD, TUNET", scenes: 1, note: "compound" }]);
  });

  it("ulike første deler (FOKSTUGU, TUNET og GÅRDEN, TUNET) slås ikke sammen", () => {
    const { all } = suggest([
      { heading: "EXT. TUNET - DAG" },
      { heading: "EXT. FOKSTUGU, TUNET - DAG" },
      { heading: "EXT. GÅRDEN, TUNET - DAG" },
    ]);
    expect(find(all, "location", "TUNET")!.scenes).toBe(1);
    expect(find(all, "location", "FOKSTUGU, TUNET")).toBeDefined();
    expect(find(all, "location", "GÅRDEN, TUNET")).toBeDefined();
  });

  it("«PÅ TUNET» slås sammen med «TUNET» med preposisjonsmerknad", () => {
    const { all } = suggest([
      { heading: "EXT. TUNET - DAG" },
      { heading: "EXT. PÅ TUNET - KVELD" },
    ]);
    expect(find(all, "location", "PÅ TUNET")).toBeUndefined();
    const t = find(all, "location", "TUNET")!;
    expect(t.scenes).toBe(2);
    expect(t.reason).toBe("heading");
    expect(t.uncertain).toBe(false);
    expect(t.sources).toEqual([{ name: "PÅ TUNET", scenes: 1, note: "preposition" }]);
  });
});

describe("objektforslag", () => {
  it("«en sekk» i én scene og «sekken» i to til gir objektet «sekk» i tre scener", () => {
    const { all } = suggest([
      { heading: INT, action: ["Maja finner en sekk."] },
      { heading: INT, action: ["Sekken ligger på bordet."] },
      { heading: INT, action: ["Hun løfter sekken."] },
    ]);
    const o = find(all, "object", "sekk")!;
    expect(o).toBeDefined();
    expect(o.scenes).toBe(3);
    expect(o.reason).toBe("object");
    expect(o.uncertain).toBe(true);
    expect(o.kindUncertain).toBe(false);
    expect(o.sceneNumbers).toEqual(["1", "2", "3"]);
  });

  it("samme ord i bare to scener foreslås ikke (OBJECT_MIN_SCENES)", () => {
    expect(OBJECT_MIN_SCENES).toBe(3);
    const { all } = suggest([
      { heading: INT, action: ["Maja finner en sekk."] },
      { heading: INT, action: ["Hun løfter sekken."] },
    ]);
    expect(find(all, "object", "sekk")).toBeUndefined();
  });

  it("funksjonsord og adjektiver («en liten …», «en gang») foreslås ikke", () => {
    const sc = (a: string): SceneSpec => ({ heading: INT, action: [a] });
    const { all } = suggest([
      sc("Det var en gang. Hun ser en liten gutt."),
      sc("Nok en gang. En liten stund."),
      sc("En gang til. Han tar en liten pause."),
      sc("Enda en gang."),
    ]);
    expect(all.filter((x) => x.kind === "object")).toEqual([]);
  });

  it("et ord foran «sin» i bestemt form blir kandidat («sekken sin»)", () => {
    const { all } = suggest([
      { heading: INT, action: ["Maja tar sekken sin."] },
      { heading: INT, action: ["Sekken ligger der."] },
      { heading: INT, action: ["Hun savner sekken."] },
    ]);
    expect(find(all, "object", "sekk")?.scenes).toBe(3);
  });
});

describe("kjente ressurser", () => {
  const trio: SceneSpec[] = [
    { heading: INT, speakers: [say("LAURITS")] },
    { heading: INT, speakers: [say("LAURITS")] },
    { heading: INT, speakers: [say("LAURIT")] },
  ];
  const withLaurits = (s: ProjectState) =>
    mustApply(s, {
      type: "CreateAssets",
      assets: [{ assetId: tid<"asset">(), fields: fields({ name: "Laurits" }) }],
    });

  it("etter at «Laurits» er opprettet, foreslås ikke «LAURITS», og «LAURIT» er mulig treff", () => {
    const { s, all } = suggest(trio, withLaurits);
    expect(find(all, "character", "LAURITS")).toBeUndefined();
    const typo = find(all, "character", "LAURIT")!;
    expect(typo).toBeDefined(); // ikke slått sammen
    const asset = Object.values(s.assets).find((a) => a.name === "Laurits")!;
    expect(typo.possibleMatch).toEqual({ assetId: asset.id, assetName: "Laurits" });
    expect(typo.uncertain).toBe(true);
  });

  it("et alternativt navn på ressursen regnes også som kjent", () => {
    const { all } = suggest(trio, (s) =>
      mustApply(s, {
        type: "CreateAssets",
        assets: [
          {
            assetId: tid<"asset">(),
            fields: fields({
              name: "Lars",
              names: [{ name: "Laurits", kind: "alias", language: null }],
            }),
          },
        ],
      }),
    );
    expect(find(all, "character", "LAURITS")).toBeUndefined();
  });
});

describe("suggestionAliases", () => {
  const x = (sources: LibrarySuggestion["sources"]): LibrarySuggestion => ({
    kind: "character",
    name: "LAURITS",
    scenes: 3,
    possibleMatch: null,
    reason: "speaker",
    sources,
    uncertain: false,
    kindUncertain: false,
    sceneNumbers: [],
  });

  it("returnerer skrivemåtene fra manuset, men ikke gruppelinjer («X OG Y»)", () => {
    const sug = x([
      { name: "LAURIT", scenes: 1, note: "typo" },
      { name: "LAURITS OG ROLF", scenes: 1, note: "group" },
    ]);
    expect(suggestionAliases(sug, "Laurits")).toEqual(["LAURIT"]);
  });

  it("hopper over skrivemåten som tilsvarer foretrukket navn (etter navnenøkkel)", () => {
    const sug = x([
      { name: "LAURIT", scenes: 1, note: "typo" },
      { name: "LAURITS", scenes: 1, note: "number" },
    ]);
    expect(suggestionAliases(sug, "Laurits")).toEqual(["LAURIT"]);
  });

  it("gir ingen dubletter", () => {
    const sug = x([
      { name: "LAURIT", scenes: 1, note: "typo" },
      { name: "Laurit", scenes: 1, note: "typo" },
    ]);
    expect(suggestionAliases(sug, "Laurits")).toEqual(["LAURIT"]);
  });
});
