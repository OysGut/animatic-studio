// @vitest-environment node
/**
 * REQ-0037 / REQ-0022 / REQ-0518 (ID_AUDIT.md, seks steder): en referanse peker alltid på det samme objektet,
 * også når rekkefølgen endres, noe slettes, settes inn eller nummereres om – og etter angre/gjør om, import og
 * sikkerhetskopi. Plass og nummer brukes bare til visning.
 */
import { describe, expect, it } from "vitest";
import {
  alignmentFromProvider,
  applyCommand,
  assignWordIds,
  backupIdMap,
  diffStates,
  emptyProjectState,
  identifyParsedScenes,
  makeBackup,
  orderedOccurrences,
  parsedSceneOf,
  partById,
  partKey,
  restoredState,
  scriptPaginationInput,
  scriptView,
  versionProvenance,
  wordIdAt,
  type Command,
  type ParsedScreenplay,
  type ProjectRows,
  type ProjectState,
  type WordAlignment,
} from "@/core";
import { pauseWordId, pauseWordIndex, unresolvedPauses } from "@/core/audio/pauses";
import { newEngineState, reduceEngine } from "@/core/storylab/engine";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { keyBetween } from "@/core/order-key";
import { fixture } from "../visual/fixture-state";

const apply = (s: ProjectState, c: Command) => {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(r.error.message);
  return r;
};

// ---------------------------------------------------------------- 1. ord i ordkoblinger
function provider(text: string, words: string[]) {
  return alignmentFromProvider(
    "00000000-0000-7000-8000-00000000b10c",
    text,
    words.map((w, i) => ({ text: w, start: i * 0.5, end: i * 0.5 + 0.4 })),
    "test",
    "m",
    null,
    "2026-10-22T09:00:00Z",
  );
}

describe("ord-ID-er (pauser og rettinger følger ordet)", () => {
  const before = (prev: WordAlignment | null, text: string) =>
    assignWordIds({ ...provider(text, text.split(" ")), at: `t-${text.length}` }, prev);

  const pause = (afterWord: number, afterWordId?: string) =>
    ({ id: tid(), afterWord, ...(afterWordId ? { afterWordId } : {}), deltaMs: 300, fill: { kind: "room" } }) as never;
  const comp = (...pauses: never[]) => ({ pauses }) as never;

  it("innsetting, sletting og ny analyse bytter aldri hvilket ord pausen gjelder", () => {
    const a = before(null, "Kari går ut nå");
    const target = wordIdAt(a, 1)!; // «går»
    const p = pause(1, target);
    expect(pauseWordId(p)).toBe(target);
    // Innsetting foran: «går» flytter til plass 2, pausen følger
    const b = before(a, "Nå Kari går ut nå");
    expect(pauseWordIndex(p, b)).toBe(2);
    // Sletting av et annet ord: fortsatt samme ord
    const d = before(b, "Kari går ut nå");
    expect(pauseWordIndex(p, d)).toBe(1);
    // Ordet selv slettes: pausen blir uavklart og flagges (ingen stille flytting til nabo-ordet)
    const e = before(d, "Kari ut nå");
    expect(pauseWordIndex(p, e)).toBe(-1);
    expect(unresolvedPauses(comp(p), e)).toHaveLength(1);
    // Angre (tilbake til forrige kobling): samme ord igjen
    expect(pauseWordIndex(p, d)).toBe(1);
    expect(unresolvedPauses(comp(p), d)).toHaveLength(0);
  });

  it("eldre pauser uten ord-ID leses uten tap; ny analyse beholder ordet", () => {
    const full = provider("Kari går ut", ["Kari", "går", "ut"]);
    const legacy: WordAlignment = { ...full, words: full.words.map(({ id: _id, ...w }) => w) };
    const old = pause(1);
    expect(pauseWordIndex(old, legacy)).toBe(1);
    // Ny analyse av en eldre kobling: uendrede ord beholder den utledede ID-en, så pausen følger ordet
    const next = assignWordIds({ ...provider("Ja Kari går ut", ["Ja", "Kari", "går", "ut"]), at: "x" }, legacy);
    expect(pauseWordIndex(old, next)).toBe(2);
  });
});

// ---------------------------------------------------------------- 2. versjonsopphav
describe("versjonsopphav som permanent ID", () => {
  const img = Object.values(fixture.state.assetVersions).find((v) => v.mimeType.startsWith("image/"))!;
  const add = (s: ProjectState, id: string, note: string, from?: string): Command => ({
    type: "AddAssetVersion",
    versionId: id as never,
    variantId: img.variantId,
    media: { path: `${s.project.id}/x/${id}/a.png`, mimeType: "image/png", width: 10, height: 10, byteSize: 10, sha256: "a".repeat(64) },
    note,
    ...(from ? { derivedFromVersionId: from as never } : {}),
  });

  it("kilden følger ID-en gjennom omnummerering, angre/gjør om og sikkerhetskopi", async () => {
    const id = tid();
    const r = apply(fixture.state, add(fixture.state, id, "Frilagt fra v1", img.id));
    expect(r.state.assetVersions[id as never]!.derivedFromVersionId).toBe(img.id);
    const undone = apply(r.state, r.inverse);
    expect(undone.state.assetVersions[id as never]).toBeUndefined();
    const redone = apply(undone.state, undone.inverse).state;
    expect(redone.assetVersions[id as never]!.derivedFromVersionId).toBe(img.id);
    // Omnummerering: merknaden sier «v1», men kilden er ID-en – nummeret som vises er kildens nåværende
    const renumbered = { ...redone, assetVersions: { ...redone.assetVersions, [img.id]: { ...img, number: 7 } } };
    const p = versionProvenance(renumbered.assetVersions[id as never]!, new Map(), renumbered);
    expect(p).toMatchObject({ fromVersionId: img.id, fromNumber: 7, sourceUnresolved: false });
    // Sikkerhetskopi: ID-en byttes sammen med kilden
    const patch = diffStates(emptyProjectState(redone.project), redone);
    const rows = { ...fixture.rows, project: fixture.project, ...patch.inserts, script_block_revisions: patch.blockRevisions } as unknown as ProjectRows;
    const b = makeBackup({ rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion: 69, createdAt: "2026-10-22T09:00:00Z", include: new Set() });
    const P = "00000000-0000-7000-8000-0000000000a0", M = "00000000-0000-7000-8000-0000000000a1";
    const map = await backupIdMap(b, P, M);
    const main = Object.values(redone.productions).find((x) => x.kind === "main")!;
    const back = restoredState(b, map, { ...emptyProjectState({ ...redone.project, id: P as never }), productions: { [M]: { ...main, id: M as never } } }, "00000000-0000-7000-8000-0000000000a2");
    expect(back.assetVersions[map.get(id) as never]!.derivedFromVersionId).toBe(map.get(img.id));
  });

  it("kilde utenfor ressursen avvises", () => {
    expect(() => apply(fixture.state, add(fixture.state, tid(), "", tid()))).toThrow();
  });

  it("eldre merknad: nummeret slås opp i samme variant ved lesing; uklart flagges, merknaden skrives ikke om", () => {
    const s = fixture.state;
    const legacy = { ...img, id: tid() as never, number: 99, note: `Frilagt fra v${img.number}` };
    expect(versionProvenance(legacy, new Map(), s)).toMatchObject({ fromVersionId: img.id, sourceUnresolved: false });
    const gone = { ...legacy, note: "Frilagt fra v42" };
    expect(versionProvenance(gone, new Map(), s)).toMatchObject({ fromVersionId: null, sourceUnresolved: true });
    expect(gone.note).toBe("Frilagt fra v42");
  });
});

// ---------------------------------------------------------------- 3. klipp- og delindekser
describe("deler i klipp slås opp på ID", () => {
  const part = (id: string | null, startFrame: number) => ({ id, startFrame, durationFrames: 10 }) as never;
  it("innsetting og ombytting av deler bytter ikke hvilken del en referanse peker på", () => {
    const a = tid(), b = tid();
    const clip = { occurrenceId: "o", parts: [part(a, 0), part(b, 10)] } as never;
    const moved = { occurrenceId: "o", parts: [part(tid(), 0), part(b, 10), part(a, 20)] } as never;
    expect(partById(moved, a)).toMatchObject({ id: a, startFrame: 20 });
    expect(partById(moved, partKey(clip, (clip as { parts: { id: string }[] }).parts[1]! as never))).toMatchObject({ id: b });
    expect(partById({ occurrenceId: "o", parts: [part(b, 0)] } as never, a)).toBeUndefined();
    // Klipp uten lagrede deler: nøkkelen følger scenen, ikke plassen
    expect(partKey({ occurrenceId: "o" as never }, { id: null })).toBe("whole:o");
  });
});

// ---------------------------------------------------------------- 4. scener ved manusimport
describe("importerte scener har midlertidig ID", () => {
  const scene = (h: string) => ({ number: null, rawHeading: h, heading: { intExt: "INT.", location: h, time: "DAY" }, source: { page: 1, y: 0 }, warnings: [], elements: [] });
  const doc = { format: "fountain", pageCount: 1, titlePage: [], warnings: [], stats: {}, scenes: [scene("A"), scene("B"), scene("C")] } as unknown as ParsedScreenplay;

  it("sortering, filtrering og innsetting bytter ikke hvilken scene koblingen peker på", () => {
    const d = identifyParsedScenes(doc);
    const link = { parsedId: d.scenes[1]!.id! };
    expect(parsedSceneOf(d, link)!.rawHeading).toBe("B");
    const reversed = { ...d, scenes: [...d.scenes].reverse() };
    expect(parsedSceneOf(reversed, link)!.rawHeading).toBe("B");
    const filtered = { ...d, scenes: d.scenes.filter((s) => s.rawHeading !== "A") };
    expect(parsedSceneOf(filtered, link)!.rawHeading).toBe("B");
    const inserted = identifyParsedScenes({ ...d, scenes: [scene("Ny") as never, ...d.scenes] });
    expect(parsedSceneOf(inserted, link)!.rawHeading).toBe("B");
    expect(new Set(inserted.scenes.map((s) => s.id)).size).toBe(4);
  });

  it("eldre kobling uten ID (bare plass) oversettes én gang til ID", () => {
    expect(parsedSceneOf(doc, { parsedIndex: 2 })!.rawHeading).toBe("C");
  });
});

// ---------------------------------------------------------------- 5. Story Lab-forgreining
describe("Story Lab forgrener etter turens ID", () => {
  const line = (id: string) => ({ type: "appendLine" as const, id, speaker: "a", text: id, at: "2026-10-22T09:00:00Z" });
  it("samme tur uavhengig av plass; ukjent tur endrer ingenting", () => {
    let s = reduceEngine(newEngineState({ participants: ["a"], mode: "improv", seed: 1 }), { type: "start" });
    for (const id of ["t1", "t2", "t3"]) s = reduceEngine(s, line(id));
    const b = reduceEngine(s, { type: "branchFrom", turnId: "t2" });
    expect(b.turns.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(reduceEngine(s, { type: "branchFrom", turnId: "borte" })).toBe(s);
    expect(reduceEngine(s, { type: "branchFrom", turnId: null }).turns).toEqual([]);
  });
});

// ---------------------------------------------------------------- 6. låste manussider
describe("låste sider følger blokkens side i originalen", () => {
  it("ombytting, deaktivering og innsetting av scener flytter ikke låste sider", () => {
    const seed = seedProject(3);
    let s: ProjectState = seed.state;
    const view = scriptView(s, seed.mainId);
    // Gi blokkene kildesider (importert manus side 3, 4, 5)
    const blocks = { ...s.blocks };
    view.forEach((sc, i) => sc.blocks.forEach((b) => (blocks[b.id] = { ...blocks[b.id]!, sourceRef: { page: 3 + i, y: 0 } })));
    s = { ...s, blocks };
    const locks = (st: ProjectState) =>
      Object.fromEntries(scriptPaginationInput(st, seed.mainId, { lockedPages: true }).map((p) => [p.occurrenceId, p.lockedPage]));
    const first = locks(s);
    expect(Object.values(first)).toEqual([1, 2, 3]);
    const occs = orderedOccurrences(s, seed.mainId);
    // Deaktiver første scene
    const off = mustApply(s, { type: "SetOccurrenceActive", occurrenceId: occs[0]!.id, active: false });
    expect(locks(off)[occs[1]!.id]).toBe(2);
    // Flytt siste scene først
    const moved = mustApply(s, { type: "MoveOccurrence", occurrenceId: occs[2]!.id, orderKey: keyBetween(null, occs[0]!.orderKey) });
    expect(locks(moved)[occs[2]!.id]).toBe(3);
    expect(locks(moved)[occs[0]!.id]).toBe(1);
  });
});
