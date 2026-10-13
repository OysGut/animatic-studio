// @vitest-environment node
/**
 * DEC-0078 bølge 2 (kjernen): tittelsiden lagres ved import (KI-20), ny bildefrekvens regner om overganger,
 * utdrag og filmlengde (KI-48), notater følger med til egen versjon (KI-33) og ressursversjonene i
 * grunnlaget (REQ-0022).
 */
import { describe, expect, it } from "vitest";
import {
  COLLECTION_TABLES,
  TITLE_PAGE_MAX_BYTES,
  TITLE_PAGE_MAX_LINES,
  applyCommand,
  contentSyncByScene,
  diffStates,
  filmClips,
  fitTitlePage,
  isUuid,
  layerFieldsOf,
  mainProduction,
  orderedOccurrences,
  ownCopyCommands,
  stateFromRows,
  toRow,
  variantsOf,
  versionsOf,
  type CollectionName,
  type Command,
  type ProjectState,
} from "@/core";
import { derivedUuid } from "@/core/commands/apply";
import { savedTitlePage, titlePageCommand } from "@/core/commands/export-settings";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function apply(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type} feilet: ${r.error.message}`);
  return r;
}

/** Hele tilstanden som databaserader og tilbake (slik den lagres og leses). */
function roundTrip(s: ProjectState): ProjectState {
  const rows: Record<string, unknown> = {
    project: {
      id: s.project.id,
      revision: s.project.revision,
      name: s.project.name,
      fps_num: s.project.fps.num,
      fps_den: s.project.fps.den,
      frame_width: s.project.frameWidth,
      frame_height: s.project.frameHeight,
    },
    script_block_revisions: [],
  };
  for (const [name, table] of Object.entries(COLLECTION_TABLES))
    rows[table] = Object.values(s[name as CollectionName] as Record<string, never>).map((e) =>
      JSON.parse(JSON.stringify(toRow(name as CollectionName, e, s.project.id))),
    );
  return stateFromRows(rows as never);
}

// ---------------------------------------------------------------------------------------------------
describe("KI-20 – tittelsiden fra importen lagres i eksportinnstillingene", () => {
  const { state: s0, mainId } = seedProject(3);

  it("kortes pent til lagringsgrensen og sier fra", () => {
    expect(fitTitlePage(["  JULA PÅ DOVRE ", "", "av Anita Killi"])).toEqual({
      lines: ["JULA PÅ DOVRE", "av Anita Killi"],
      truncated: false,
    });
    const many = fitTitlePage(Array.from({ length: 60 }, (_, i) => `Linje ${i}`));
    expect(many.truncated).toBe(true);
    expect(many.lines.length).toBe(TITLE_PAGE_MAX_LINES);
    // Lange linjer med flerbyte-tegn holdes under grensen i byte (jsonb ≤ 4096)
    const big = fitTitlePage(Array.from({ length: 30 }, () => "æøå🎬".repeat(80)));
    expect(big.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(big.lines)).byteLength).toBeLessThanOrEqual(
      TITLE_PAGE_MAX_BYTES,
    );
    expect(big.lines.every((l) => !/[\uD800-\uDBFF]$/.test(l))).toBe(true);
  });

  it("lagres, beholdes når animatic-eksporten lagrer sine valg, og angres nøyaktig", () => {
    const tp = titlePageCommand(s0, mainId, ["JULA PÅ DOVRE", "Manus: Anita Killi"])!;
    expect(tp.truncated).toBe(false);
    const r1 = apply(s0, tp.command);
    expect(savedTitlePage(r1.state, mainId)).toEqual(["JULA PÅ DOVRE", "Manus: Anita Killi"]);
    expect(r1.state.productions[mainId]!.exportSettings).toMatchObject({
      size: "full",
      monochrome: false,
      output: "video",
    });
    // Eksportdialogen for animatic sender ikke tittelsiden: den beholdes
    const r2 = apply(r1.state, {
      type: "SetExportSettings",
      productionId: mainId as never,
      settings: { size: "half", monochrome: true, output: "video" },
    });
    expect(r2.state.productions[mainId]!.exportSettings).toEqual({
      size: "half",
      monochrome: true,
      output: "video",
      titlePage: ["JULA PÅ DOVRE", "Manus: Anita Killi"],
    });
    expect(mustApply(r2.state, r2.inverse).productions[mainId]!.exportSettings).toEqual(
      r1.state.productions[mainId]!.exportSettings,
    );
    // Angre importens tittelside: ingen innstillinger igjen
    expect(mustApply(r1.state, r1.inverse).productions[mainId]!.exportSettings ?? null).toBe(null);
    // Samme tittelside igjen = ingen kommando
    expect(titlePageCommand(r1.state, mainId, ["JULA PÅ DOVRE", "Manus: Anita Killi"])).toBe(null);
    // Lagres i databasen og leses tilbake
    expect(roundTrip(r2.state).productions[mainId]!.exportSettings).toEqual(
      r2.state.productions[mainId]!.exportSettings,
    );
  });

  it("tom tittelside lagres som «ingen tittelside»; for lang avvises", () => {
    const empty = apply(s0, titlePageCommand(s0, mainId, [])!.command).state;
    expect(savedTitlePage(empty, mainId)).toEqual([]);
    const r = applyCommand(
      s0,
      envelope({
        type: "SetExportSettings",
        productionId: mainId as never,
        settings: {
          size: "full",
          monochrome: false,
          output: "video",
          titlePage: Array.from({ length: 30 }, () => "x".repeat(200)),
        },
      }),
    );
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("KI-48 – ny bildefrekvens regner om overganger, utdrag og filmlengde", () => {
  function setup() {
    const { state, mainId } = seedProject(3);
    let s = state;
    const occ = orderedOccurrences(s, mainId);
    s = mustApply(s, {
      type: "SetTransition",
      occurrenceId: occ[1]!.id,
      transition: { kind: "dissolve", frames: 13 },
    } as never);
    s = mustApply(s, {
      type: "SetDefaultTransition",
      transition: { kind: "dip", frames: 25 },
    } as never);
    // Utdrag (settes ikke av noen kommando ennå): lagt rett inn i tilstanden
    s = {
      ...s,
      occurrences: {
        ...s.occurrences,
        [occ[2]!.id]: { ...s.occurrences[occ[2]!.id]!, excerpt: { inFrame: 12, outFrame: 62 } },
      },
    };
    const filmId = tid<"take">();
    s = mustApply(s, {
      type: "AddTake",
      takeId: filmId,
      occurrenceId: occ[1]!.id,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 50,
      mediaRef: `${s.project.id}/films/${filmId}/film.mp4`,
      media: {
        fileName: "film.mp4",
        mimeType: "video/mp4",
        byteSize: 1,
        width: 1280,
        height: 720,
        fps: 25,
        durationMs: 2000,
        videoCodec: null,
        hasAudio: false,
      },
    } as never);
    s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ[1]!.id, takeId: filmId } as never);
    const take2d = s.occurrences[occ[0]!.id]!.activeTakeId!;
    return { s, mainId, occ, filmId, take2d };
  }
  const to = (s: ProjectState, num: number): Command => ({
    type: "SetProjectFormat",
    width: s.project.frameWidth,
    height: s.project.frameHeight,
    fps: { num, den: 1 },
  });

  it("25 → 24: overganger, utdrag og versjonenes lengde følger med; filmen regnes fra filen", () => {
    const { s, mainId, occ, filmId, take2d } = setup();
    const t = mustApply(s, to(s, 24));
    expect(t.occurrences[occ[1]!.id]!.transition).toEqual({ kind: "dissolve", frames: 12 });
    expect(t.project.defaultTransition).toEqual({ kind: "dip", frames: 24 });
    expect(t.occurrences[occ[2]!.id]!.excerpt).toEqual({ inFrame: 12, outFrame: 60 });
    expect(t.takes[take2d]!.durationFrames).toBe(240);
    expect(t.takes[filmId]!.durationFrames).toBe(48);
    const clip = filmClips(t, mainId).find((c) => c.occurrenceId === occ[1]!.id)!;
    expect(clip.durationFrames).toBe(48);
    // Endringene skrives som vanlige rader (forekomster, versjoner, prosjekt)
    const d = diffStates(s, t);
    expect(d.updates["scene_occurrences"]?.length).toBe(2);
    expect(d.updates["takes"]?.length).toBe(Object.keys(s.takes).length);
  });

  it("filmlengden regnes fra filen også for eldre data (Take.durationFrames ikke omregnet)", () => {
    const { s, mainId, occ, filmId } = setup();
    const t = mustApply(s, to(s, 24));
    const old = {
      ...t,
      takes: { ...t.takes, [filmId]: { ...t.takes[filmId]!, durationFrames: 50 } },
    };
    expect(filmClips(old, mainId).find((c) => c.occurrenceId === occ[1]!.id)!.durationFrames).toBe(
      48,
    );
  });

  it("angre er nøyaktig, og 25 → 24 → 25 gir samme lengder tilbake", () => {
    const { s, occ, filmId, take2d } = setup();
    const r = apply(s, to(s, 24));
    const back = mustApply(r.state, r.inverse);
    expect(back.occurrences[occ[1]!.id]!.transition).toEqual(s.occurrences[occ[1]!.id]!.transition);
    expect(back.occurrences[occ[2]!.id]!.excerpt).toEqual({ inFrame: 12, outFrame: 62 });
    expect(back.project.defaultTransition).toEqual(s.project.defaultTransition);
    for (const id of Object.keys(s.takes))
      expect(back.takes[id]!.durationFrames).toBe(s.takes[id]!.durationFrames);
    for (const id of Object.keys(s.occurrences)) {
      const { revision: _a, ...x } = back.occurrences[id]!;
      const { revision: _b, ...y } = s.occurrences[id]!;
      expect(x).toEqual(y);
    }
    // Fram og tilbake med to vanlige endringer
    const rt = mustApply(r.state, to(r.state, 25));
    expect(rt.takes[filmId]!.durationFrames).toBe(50);
    expect(rt.takes[take2d]!.durationFrames).toBe(250);
    expect(rt.project.defaultTransition).toEqual({ kind: "dip", frames: 25 });
    expect(rt.occurrences[occ[1]!.id]!.transition!.frames).toBeGreaterThanOrEqual(12);
    expect(rt.occurrences[occ[1]!.id]!.transition!.frames).toBeLessThanOrEqual(14);
    expect(rt.occurrences[occ[2]!.id]!.excerpt).toEqual({ inFrame: 13, outFrame: 63 });
  });

  it("angre overskriver ikke endringer gjort etter formatendringen: de regnes om tilbake", () => {
    const { s, occ, take2d, filmId } = setup();
    const r = apply(s, to(s, 24));
    // Etter formatendringen: ny overgang, ny standardovergang og kortere versjon
    let t = mustApply(r.state, {
      type: "SetTransition",
      occurrenceId: occ[1]!.id,
      transition: { kind: "dissolve", frames: 20 },
    } as never);
    t = mustApply(t, {
      type: "SetDefaultTransition",
      transition: { kind: "dissolve", frames: 30 },
    } as never);
    t = {
      ...t,
      takes: { ...t.takes, [take2d]: { ...t.takes[take2d]!, durationFrames: 120 } },
    };
    const back = mustApply(t, r.inverse);
    // Endret etterpå: den nåværende verdien regnes om tilbake til 25 bilde/s
    expect(back.occurrences[occ[1]!.id]!.transition).toEqual({ kind: "dissolve", frames: 21 });
    expect(back.project.defaultTransition).toEqual({ kind: "dissolve", frames: 31 });
    expect(back.takes[take2d]!.durationFrames).toBe(125);
    // Ikke endret etterpå: settes tilbake nøyaktig
    expect(back.occurrences[occ[2]!.id]!.excerpt).toEqual({ inFrame: 12, outFrame: 62 });
    expect(back.takes[filmId]!.durationFrames).toBe(s.takes[filmId]!.durationFrames);
  });

  it("bare nytt format (samme bildefrekvens) rører ikke overganger og versjoner", () => {
    const { s, occ, take2d } = setup();
    const t = mustApply(s, { ...(to(s, 25) as object), width: 1080, height: 1080 } as Command);
    expect(t.occurrences[occ[1]!.id]).toBe(s.occurrences[occ[1]!.id]);
    expect(t.takes[take2d]).toBe(s.takes[take2d]);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("KI-33 – notatene følger med til egen versjon av scenen", () => {
  function setup() {
    const { state, spinoffId } = seedProject(8);
    const occ = orderedOccurrences(state, spinoffId)[0]!;
    const block = Object.values(state.blocks).find(
      (b) => b.variantId === occ.variantId && b.kind === "dialogue",
    )!;
    const onText = tid<"annotation">();
    const onScene = tid<"annotation">();
    const gone = tid<"annotation">();
    let s = mustApply(state, {
      type: "AddAnnotations",
      imported: true,
      annotations: [
        {
          annotationId: onText,
          blockId: block.id,
          variantId: null,
          start: 0,
          end: 7,
          quote: "Replikk",
          text: "Sjekk tonen",
          authorName: "Anita",
          stampAt: "2026-10-01T10:00:00.000Z",
        },
        {
          annotationId: onScene,
          blockId: null,
          variantId: occ.variantId,
          start: 0,
          end: 0,
          quote: "",
          text: "Lyset må være kaldere",
          authorName: "Mars",
          stampAt: "2026-10-02T10:00:00.000Z",
        },
        {
          annotationId: gone,
          blockId: block.id,
          variantId: null,
          start: 0,
          end: 3,
          quote: "Rep",
          text: "Slettet",
          authorName: "Mars",
          stampAt: "2026-10-03T10:00:00.000Z",
        },
      ],
    } as never);
    s = mustApply(s, { type: "SetAnnotationRemoved", annotationId: gone, removed: true } as never);
    const fork = ownCopyCommands(s, occ.id)![0]!;
    return { s, occ, block, onText, onScene, gone, fork };
  }

  it("synlige notater kopieres til de nye blokkene og den nye varianten; originalene står", () => {
    const { s, occ, block, onText, onScene, fork } = setup();
    const r = apply(s, fork);
    const nv = r.state.occurrences[occ.id]!.variantId;
    expect(nv).not.toBe(occ.variantId);
    const copies = Object.values(r.state.annotations).filter(
      (a) => !s.annotations[a.id] && !a.removed,
    );
    expect(copies.map((a) => a.text).sort()).toEqual(["Lyset må være kaldere", "Sjekk tonen"]);
    const text = copies.find((a) => a.text === "Sjekk tonen")!;
    expect(r.state.blocks[text.blockId!]!.variantId).toBe(nv);
    expect(text).toMatchObject({ start: 0, end: 7, authorName: "Anita", revision: 1 });
    expect(copies.find((a) => a.text === "Lyset må være kaldere")!.variantId).toBe(nv);
    expect(r.state.annotations[onText]!.blockId).toBe(block.id);
    expect(r.state.annotations[onScene]!.variantId).toBe(occ.variantId);
    expect(copies.every((a) => isUuid(a.id))).toBe(true);
    expect(Object.values(r.state.annotations).filter((a) => a.removed).length).toBe(1);
    // Notatene lagres som nye rader
    expect(diffStates(s, r.state).inserts["script_annotations"]?.length).toBe(2);
  });

  it("angre fjerner kopiene, og gjør om gir de samme ID-ene", () => {
    const { s, fork } = setup();
    const r = apply(s, fork);
    const undo = apply(r.state, r.inverse);
    expect(Object.keys(undo.state.annotations).sort()).toEqual(Object.keys(s.annotations).sort());
    const redo = mustApply(undo.state, undo.inverse);
    expect(Object.keys(redo.annotations).sort()).toEqual(Object.keys(r.state.annotations).sort());
  });

  it("angre stoppes når et kopiert notat er endret i den egne versjonen", () => {
    const { s, fork } = setup();
    const r = apply(s, fork);
    const copy = Object.values(r.state.annotations).find(
      (a) => !s.annotations[a.id] && a.text === "Sjekk tonen",
    )!;
    const edited = mustApply(r.state, {
      type: "EditAnnotation",
      annotationId: copy.id,
      text: "Endret",
      editedByName: "Mars",
    } as never);
    const u = applyCommand(edited, envelope(r.inverse));
    expect(u.ok).toBe(false);
  });

  it("angre virker selv om originalen er endret etter kopieringen, og like notater slås ikke sammen", () => {
    const { s, occ, block, onText, fork } = setup();
    // Et notat til med nøyaktig samme innhold som «Sjekk tonen»
    const twin = tid<"annotation">();
    const base = s.annotations[onText]!;
    const s2 = mustApply(s, {
      type: "AddAnnotations",
      imported: true,
      annotations: [
        {
          annotationId: twin,
          blockId: block.id,
          variantId: null,
          start: base.start,
          end: base.end,
          quote: "Replikk",
          text: base.text,
          authorName: base.authorName,
          stampAt: base.stampAt,
        },
      ],
    } as never);
    const r = apply(s2, fork);
    const nv = r.state.occurrences[occ.id]!.variantId;
    const copies = Object.values(r.state.annotations).filter((a) => !s2.annotations[a.id]);
    expect(copies).toHaveLength(3);
    // Originalen endres i hovedversjonen etter kopieringen
    const edited = mustApply(r.state, {
      type: "EditAnnotation",
      annotationId: onText,
      text: "Endret i originalen",
      editedByName: "Mars",
    } as never);
    const undo = apply(edited, r.inverse);
    expect(Object.keys(undo.state.annotations).sort()).toEqual(Object.keys(s2.annotations).sort());
    // Hver kopi er koblet til sin egen original (gjør om gir de samme ID-ene)
    const inv = undo.inverse as Extract<Command, { type: "ForkVariant" }>;
    expect(inv.annotationIdMap![onText]).toBe(derivedUuid(nv, onText));
    expect(inv.annotationIdMap![twin]).toBe(derivedUuid(nv, twin));
    const redo = mustApply(undo.state, inv);
    expect(Object.keys(redo.annotations).sort()).toEqual(Object.keys(r.state.annotations).sort());
  });

  it("avledet ID er en gyldig UUID og avhenger av begge ID-ene", () => {
    const a = derivedUuid("v1", "n1");
    expect(isUuid(a)).toBe(true);
    expect(derivedUuid("v1", "n1")).toBe(a);
    expect(derivedUuid("v2", "n1")).not.toBe(a);
    expect(derivedUuid("v1", "n2")).not.toBe(a);
  });
});

// ---------------------------------------------------------------------------------------------------
describe("REQ-0022 – ressursversjonene i grunnlaget (producedFrom.assetVersions)", () => {
  const s0 = fixture.state;
  const main = mainProduction(s0)!;

  /** Et lag som følger varianten (ikke låst), og scenen det står i. */
  function setup() {
    const layer = Object.values(s0.layers).find(
      (l) =>
        !l.removed &&
        l.assetId &&
        variantsOf(s0, l.assetId).some((v) => versionsOf(s0, v.id).length > 0) &&
        orderedOccurrences(s0, main.id).some(
          (o) => o.variantId === s0.compositions[l.compositionId]?.variantId,
        ),
    )!;
    const variantId = variantsOf(s0, layer.assetId!).find((v) => versionsOf(s0, v.id).length)!.id;
    const s = mustApply(s0, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: layer.id,
          fields: { ...layerFieldsOf(layer), assetVariantId: variantId, versionId: null },
        },
      ],
    } as never);
    const comp = s.compositions[layer.compositionId]!;
    const occ = orderedOccurrences(s, main.id).find((o) => o.variantId === comp.variantId)!;
    const shown = versionsOf(s, variantId).find(
      (v) => v.id === (s.assetVariants[variantId]!.approvedVersionId ?? v.id),
    )!;
    return { s, layer, comp, occ, variantId, shown };
  }

  function newApproved(s: ProjectState, variantId: string, assetId: string) {
    const id = tid<"asset_version">();
    let t = mustApply(s, {
      type: "AddAssetVersion",
      versionId: id,
      variantId,
      media: {
        path: `${s.project.id}/${assetId}/${id}/ny.png`,
        mimeType: "image/png",
        width: 100,
        height: 100,
        byteSize: 10,
        sha256: "c".repeat(64),
      },
      note: "",
    } as never);
    t = mustApply(t, { type: "ApproveAssetVersion", variantId, versionId: id } as never);
    return { t, id };
  }

  it("godkjenning lagrer versjonene scenen viser; et lag som følger varianten flagges ved ny versjon", () => {
    const { s, layer, comp, occ, variantId } = setup();
    const before = contentSyncByScene(s, main.id, { assetId: layer.assetId! });
    const accepted = apply(s, {
      type: "AcceptScriptChanges",
      occurrenceId: occ.id,
      compositionIds: [comp.id],
      takeIds: [],
    } as never);
    const av = accepted.state.compositions[comp.id]!.producedFrom!.assetVersions!;
    const shownNow = Object.values(s.assetVersions).find((v) => v.id === av[layer.assetId!])!;
    expect(shownNow.variantId).toBe(variantId);
    // Uten ny versjon: ingen nye flagg
    expect(contentSyncByScene(accepted.state, main.id, { assetId: layer.assetId! }).size).toBe(
      before.size,
    );
    const { t, id } = newApproved(accepted.state, variantId, layer.assetId!);
    const flag = contentSyncByScene(t, main.id, { assetId: layer.assetId! }).get(occ.id)!;
    expect(flag.items.some((i) => i.kind === "basis" && i.newVersionId === id)).toBe(true);
    // Angre godkjenningen setter grunnlaget tilbake nøyaktig
    const back = mustApply(accepted.state, accepted.inverse);
    expect(back.compositions[comp.id]!.producedFrom).toEqual(s.compositions[comp.id]!.producedFrom);
    // Lagres og leses tilbake fra databasen
    expect(roundTrip(accepted.state).compositions[comp.id]!.producedFrom).toEqual(
      accepted.state.compositions[comp.id]!.producedFrom,
    );
  });

  it("SetProducedFrom beholder godkjenningen for en versjon med bare ressursversjoner (ingen manuslinjer)", () => {
    const { state } = seedProject(2);
    const take = Object.values(state.takes)[0]!;
    const assetId = tid<"asset">();
    const versionId = tid<"asset_version">();
    const r = apply(state, {
      type: "SetProducedFrom",
      compositions: [],
      takes: [{ takeId: take.id, blockRevisions: {}, assetVersions: { [assetId]: versionId } }],
    } as never);
    expect(r.state.takes[take.id]!.acceptedFrom).toEqual({
      blockRevisions: {},
      assetVersions: { [assetId]: versionId },
    });
    // Angre fjerner godkjenningen igjen (den fantes ikke før)
    const back = mustApply(r.state, r.inverse);
    expect(back.takes[take.id]!.acceptedFrom).toBeUndefined();
    // Uten både manuslinjer og ressursversjoner fjernes godkjenningen
    const none = mustApply(r.state, {
      type: "SetProducedFrom",
      compositions: [],
      takes: [{ takeId: take.id, blockRevisions: {}, assetVersions: null }],
    } as never);
    expect(none.takes[take.id]!.acceptedFrom).toBeUndefined();
  });

  it("importert film lagrer scenens ressursversjoner og flagges når ressursen er oppdatert", () => {
    const { s, layer, occ, variantId } = setup();
    const filmId = tid<"take">();
    let t = mustApply(s, {
      type: "AddTake",
      takeId: filmId,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 50,
      mediaRef: `${s.project.id}/films/${filmId}/film.mp4`,
      media: {
        fileName: "film.mp4",
        mimeType: "video/mp4",
        byteSize: 1,
        width: 1280,
        height: 720,
        fps: 25,
        durationMs: 2000,
        videoCodec: null,
        hasAudio: false,
      },
    } as never);
    t = mustApply(t, { type: "SetActiveTake", occurrenceId: occ.id, takeId: filmId } as never);
    const pf = t.takes[filmId]!.producedFrom;
    expect(pf.assetVersions?.[layer.assetId!]).toBeTruthy();
    expect(roundTrip(t).takes[filmId]!.producedFrom).toEqual(pf);
    const { t: u, id } = newApproved(t, variantId, layer.assetId!);
    const items = contentSyncByScene(u, main.id, { assetId: layer.assetId! }).get(occ.id)!.items;
    expect(
      items.some((i) => i.kind === "basis" && i.targetId === filmId && i.newVersionId === id),
    ).toBe(true);
    // Godkjenn versjonen på nytt: grunnlaget fornyes, og flagget for filmen forsvinner
    const ok = mustApply(u, {
      type: "AcceptScriptChanges",
      occurrenceId: occ.id,
      compositionIds: [],
      takeIds: [filmId],
    } as never);
    expect(ok.takes[filmId]!.producedFrom).toEqual(pf);
    expect(
      (contentSyncByScene(ok, main.id, { assetId: layer.assetId! }).get(occ.id)?.items ?? []).some(
        (i) => i.targetId === filmId,
      ),
    ).toBe(false);
  });

  it("SetProducedFrom avviser ugyldige ressursversjoner; utelatt = ukjent", () => {
    const { s, comp } = setup();
    const bad = applyCommand(
      s,
      envelope({
        type: "SetProducedFrom",
        compositions: [{ compositionId: comp.id, blockRevisions: {}, assetVersions: { x: "y" } }],
        takes: [],
      } as never),
    );
    expect(bad.ok).toBe(false);
    const a = tid<"asset">();
    const v = tid<"asset_version">();
    const t = mustApply(s, {
      type: "SetProducedFrom",
      compositions: [{ compositionId: comp.id, blockRevisions: {}, assetVersions: { [a]: v } }],
      takes: [],
    } as never);
    expect(t.compositions[comp.id]!.producedFrom).toEqual({
      blockRevisions: {},
      assetVersions: { [a]: v },
    });
  });
});
