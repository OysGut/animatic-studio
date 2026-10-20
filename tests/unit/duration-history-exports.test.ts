// @vitest-environment node
/**
 * DEC-0078 (migrasjon 0028): lagrede varighetsestimater (REQ-0120), antakelser per prosjekt (KI-28) og
 * eksportloggen (REQ-0037 «eksportversjon»).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  applyCommand,
  diffStates,
  estimateProduction,
  formatDurationAssumptions,
  mainProduction,
  normalizeDurationAssumptions,
  productionStatus,
  projectDurationAssumptions,
  snapshotDuration,
  snapshotFromState,
  stateFromRows,
  type ProjectState,
} from "@/core";
import {
  DURATION_BASIS_LABEL,
  durationHistory,
  durationSnapshot,
  parseDurationSnapshot,
  storedEstimateFromRow,
  type StoredDurationEstimate,
} from "@/core/screenplay/duration-snapshot";
import {
  EXPORT_KINDS,
  describeExportSettings,
  exportRecordFromRow,
  normalizeExportRecord,
} from "@/core/export-records";
import { needsSchema28 } from "@/adapters/storage/commands.functions";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const FAST = {
  dialogueWordsPerMinute: 200,
  actionSecondsPerLine: 1.5,
  headingSeconds: 1,
  minSceneSeconds: 3,
};

function run(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000d028" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

describe("antakelser for varighetsestimatet per prosjekt (KI-28)", () => {
  it("kontrollerer og runder antakelsene; ugyldige gir null", () => {
    expect(normalizeDurationAssumptions(FAST)).toEqual(FAST);
    expect(normalizeDurationAssumptions({ ...FAST, headingSeconds: 1.23456 })!.headingSeconds).toBe(
      1.23,
    );
    expect(normalizeDurationAssumptions({ ...FAST, dialogueWordsPerMinute: 0 })).toBeNull();
    expect(normalizeDurationAssumptions({ ...FAST, minSceneSeconds: Number.NaN })).toBeNull();
    expect(normalizeDurationAssumptions({ dialogueWordsPerMinute: 150 })).toBeNull();
    expect(normalizeDurationAssumptions(null)).toBeNull();
    expect(normalizeDurationAssumptions([1, 2, 3, 4])).toBeNull();
  });

  it("lagres på prosjektet med kommando, kan angres og leses tilbake fra databaseraden", () => {
    expect(projectDurationAssumptions(s0.project)).toEqual(DEFAULT_DURATION_ASSUMPTIONS);
    const r = run(s0, { type: "SetDurationAssumptions", assumptions: FAST });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.project.durationAssumptions).toEqual(FAST);
    expect(r.state.project.revision).toBe(s0.project.revision + 1);
    expect(r.inverse).toEqual({ type: "SetDurationAssumptions", assumptions: null });
    // Endringssettet til databasen har kolonnen, og bare når den er endret
    const changes = diffStates(s0, r.state);
    const row = changes.updates["projects"]![0]!;
    expect(row["duration_assumptions"]).toEqual(FAST);
    const other = mustApply(s0, {
      type: "SetAiBudget",
      monthLimit: 5,
      pricePerImage: null,
    } as never);
    expect(diffStates(s0, other).updates["projects"]![0]!).not.toHaveProperty(
      "duration_assumptions",
    );
    // Tilbake fra raden (felles for alle medlemmer etter ny innlasting)
    const back = stateFromRows({
      ...rowsOf(s0),
      project: { ...rowsOf(s0).project, duration_assumptions: FAST },
    });
    expect(back.project.durationAssumptions).toEqual(FAST);
    const none = stateFromRows({
      ...rowsOf(s0),
      project: { ...rowsOf(s0).project, duration_assumptions: { tull: 1 } },
    });
    expect(none.project.durationAssumptions).toBeUndefined();
    // Angre gir standardverdiene igjen
    const undone = mustApply(r.state, r.inverse as never);
    expect(undone.project.durationAssumptions).toBeUndefined();
    expect(diffStates(r.state, undone).updates["projects"]![0]!["duration_assumptions"]).toBeNull();
  });

  it("avviser ugyldige verdier og endringer som ikke endrer noe", () => {
    expect(
      run(s0, { type: "SetDurationAssumptions", assumptions: { ...FAST, headingSeconds: -1 } }).ok,
    ).toBe(false);
    expect(run(s0, { type: "SetDurationAssumptions", assumptions: null }).ok).toBe(false);
    const s = mustApply(s0, { type: "SetDurationAssumptions", assumptions: FAST } as never);
    expect(run(s, { type: "SetDurationAssumptions", assumptions: { ...FAST } }).ok).toBe(false);
  });

  it("krever migrasjon 0028 på serveren", () => {
    expect(needsSchema28({ type: "SetDurationAssumptions" })).toBe(true);
    expect(needsSchema28({ type: "SetExportSettings" })).toBe(false);
  });

  it("antakelsene vises som kort tekst", () => {
    expect(formatDurationAssumptions(FAST)).toBe(
      "200 ord/min · 1,5 s per handlingslinje · 1 s per scene · minst 3 s",
    );
  });
});

/** Radene for prosjektet slik databasen ville gitt dem (for rundtur gjennom stateFromRows). */
function rowsOf(s: ProjectState) {
  const p = s.project;
  return {
    project: {
      id: p.id,
      revision: p.revision,
      name: p.name,
      fps_num: p.fps.num,
      fps_den: p.fps.den,
      frame_width: p.frameWidth,
      frame_height: p.frameHeight,
    } as Record<string, unknown>,
    productions: [],
    scenes: [],
    scene_variants: [],
    script_blocks: [],
    script_block_revisions: [],
    scene_occurrences: [],
    production_segments: [],
    takes: [],
    assets: [],
    asset_variants: [],
    asset_versions: [],
    script_annotations: [],
    compositions: [],
    composition_layers: [],
    audio_clips: [],
    clip_parts: [],
    time_links: [],
    generation_prompts: [],
    continuity_events: [],
    translations: [],
    asset_relations: [],
    posters: [],
    style_profiles: [],
  };
}

describe("lagrede varighetsestimater (REQ-0120)", () => {
  const status = productionStatus(s0, main.id, estimateProduction(s0, main.id));
  const snap = durationSnapshot(status);

  it("øyeblikksbildet har manusestimat, 2D-lengder, planer, bekreftet lengde og alle scener", () => {
    expect(snap.format).toBe(1);
    expect(snap.scenes.map((x) => x.occurrenceId)).toEqual(status.rows.map((r) => r.occurrenceId));
    expect(snap.expectedSeconds).toBeCloseTo(status.expectedSeconds, 2);
    expect(snap.confirmedSeconds).toBeCloseTo(status.confirmedSeconds, 2);
    expect(snap.estimatedSeconds).toBeCloseTo(status.estimatedSeconds, 2);
    expect(snap.activeScenes).toBe(status.rows.filter((r) => r.active).length);
    expect(snap.scenes.some((x) => x.animaticSeconds !== null)).toBe(true);
    expect(snap.animaticSeconds).toBeGreaterThan(0);
    // Gjennom JSON (jsonb) og tilbake uten tap
    expect(parseDurationSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(parseDurationSnapshot({ format: 2, scenes: [] })).toBeNull();
  });

  it("planlagt lengde tas med i øyeblikksbildet", () => {
    const o = status.rows.find((r) => r.active && r.source === "estimate")!;
    const s = mustApply(s0, {
      type: "SetPlannedDuration",
      occurrenceId: o.occurrenceId,
      plannedMs: 42_000,
    } as never);
    const snap2 = durationSnapshot(productionStatus(s, main.id, estimateProduction(s, main.id)));
    expect(snap2.scenes.find((x) => x.occurrenceId === o.occurrenceId)!.plannedSeconds).toBe(42);
    expect(snap2.plannedSeconds).toBeGreaterThanOrEqual(42);
  });

  it("lagrede estimater vises med egne antakelser og regnes aldri på nytt", () => {
    const versionSnap = snapshotFromState(s0, main.id);
    const film = () => null;
    const v1 = { id: "v1", number: 1, name: "Første", createdAt: "2026-01-01T10:00:00+00:00" };
    const v2 = { id: "v2", number: 2, name: "Andre", createdAt: "2026-02-01T10:00:00+00:00" };
    // Estimatet for v1 ble lagret med raske antakelser og et kjent tall
    const storedV1: StoredDurationEstimate = storedEstimateFromRow({
      id: "e1",
      production_id: main.id,
      script_version_id: "v1",
      assumptions: FAST,
      estimate: { ...snap, expectedSeconds: 1234, estimatedSeconds: 1000, confirmedSeconds: 234 },
      created_at: "2026-01-01T10:00:05+00:00",
      created_by: "u",
    })!;
    const loose = storedEstimateFromRow({
      id: "e2",
      production_id: main.id,
      script_version_id: null,
      assumptions: DEFAULT_DURATION_ASSUMPTIONS,
      estimate: { ...snap, expectedSeconds: 1500 },
      created_at: "2026-01-15T10:00:00.000Z",
      created_by: "u",
    })!;
    const recomputed: string[] = [];
    const rows = durationHistory({
      versions: [v1, v2],
      stored: [loose, storedV1],
      recompute: (id) => {
        recomputed.push(id);
        return snapshotDuration(versionSnap, id, "", film, DEFAULT_DURATION_ASSUMPTIONS);
      },
      todayAssumptions: DEFAULT_DURATION_ASSUMPTIONS,
      now: {
        at: "2026-03-01T00:00:00Z",
        estimatedSeconds: 1,
        expectedSeconds: 2,
        confirmedSeconds: 1,
        scenes: 3,
      },
    });
    // Bare v2 (uten lagret estimat) regnes på nytt
    expect(recomputed).toEqual(["v2"]);
    expect(rows.map((r) => [r.label, r.basis])).toEqual([
      ["v1 Første", "stored"],
      ["Lagret estimat", "stored"],
      ["v2 Andre", "recomputed"],
      ["Nå", "now"],
    ]);
    expect(rows[0]!.expectedSeconds).toBe(1234);
    expect(rows[0]!.confirmedSeconds).toBe(234);
    expect(rows[0]!.assumptions).toEqual(FAST);
    expect(rows[2]!.confirmedSeconds).toBeNull();
    expect(DURATION_BASIS_LABEL[rows[2]!.basis]).toBe("regnet på nytt med dagens antakelser");
  });

  it("en rad med ukjent format vises ikke; ugyldige antakelser vises som standard", () => {
    expect(storedEstimateFromRow({ id: "x", estimate: { format: 9 } })).toBeNull();
    const e = storedEstimateFromRow({ id: "x", estimate: snap, assumptions: { tull: 1 } })!;
    expect(e.assumptions).toEqual(DEFAULT_DURATION_ASSUMPTIONS);
  });
});

describe("eksportloggen (REQ-0037)", () => {
  const occ = Object.keys(s0.occurrences);

  it("kontrollerer type, filnavn, innstillinger og scener", () => {
    const r = normalizeExportRecord({
      productionId: main.id,
      kind: "script",
      fileName: "  Jula på Dovre – 2026-10-12.pdf ",
      settings: {
        format: "pdf",
        language: "nb",
        withNotes: true,
        nested: { a: 1 } as never,
        list: ["a", "b"],
      },
      occurrenceIds: [occ[0]!, occ[0]!, occ[1]!],
    });
    expect(r.fileName).toBe("Jula på Dovre – 2026-10-12.pdf");
    expect(r.settings).toEqual({
      format: "pdf",
      language: "nb",
      withNotes: true,
      list: ["a", "b"],
    });
    expect(r.occurrenceIds).toEqual([occ[0], occ[1]]);
    const base = { productionId: main.id, kind: "film" as const, settings: {}, occurrenceIds: [] };
    expect(() => normalizeExportRecord({ ...base, fileName: " " })).toThrow();
    expect(() => normalizeExportRecord({ ...base, fileName: "x", kind: "zip" as never })).toThrow();
    expect(() =>
      normalizeExportRecord({ ...base, fileName: "x", occurrenceIds: ["ikke-en-id"] }),
    ).toThrow();
    expect(() => normalizeExportRecord({ ...base, fileName: "x", productionId: "p" })).toThrow();
    expect(EXPORT_KINDS).toEqual(["film", "script", "audio", "subtitles", "poster"]);
  });

  it("leses fra databaseraden og beskrives kort", () => {
    const rec = exportRecordFromRow({
      id: "00000000-0000-7000-8000-00000000e001",
      production_id: main.id,
      kind: "film",
      file_name: "film.mp4",
      settings: { size: "half", width: 960, height: 540, monochrome: true, subtitles: true },
      occurrence_ids: [occ[0]],
      created_at: "2026-10-12T10:00:00+00:00",
      created_by: "u",
    })!;
    expect(rec.kind).toBe("film");
    expect(describeExportSettings(rec)).toBe(
      "halv størrelse · 960×540 · svart-hvitt · med undertekster · 1 scene",
    );
    expect(exportRecordFromRow({ id: "x", kind: "zip" })).toBeNull();
  });
});

it("M8 export record preserves the complete immutable profile snapshot", () => {
  const snapshot=JSON.stringify({id:main.id,name:"Final",spec:{models:{image:"model"},variants:2,resolution:"4K",export:{format:"mp4",bitrateKbps:16000}}});
  const record=normalizeExportRecord({productionId:main.id,kind:"film",fileName:"test.mp4",occurrenceIds:[],settings:{qualityProfileId:main.id,qualityProfileName:"Final",qualityProfileSnapshot:snapshot}});
  expect(record.settings["qualityProfileSnapshot"]).toBe(snapshot);
  expect(JSON.parse(String(record.settings["qualityProfileSnapshot"])).spec.export.bitrateKbps).toBe(16000);
});
