// @vitest-environment node
/**
 * Varighet og produksjonsstatus på prosjektoversikten (mandat 7.2–7.3, 27.1–27.2; REQ-0112–0114, REQ-0118,
 * REQ-0405, REQ-0406, REQ-0494).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  applyCommand,
  blocksOfVariant,
  snapshotDuration,
  snapshotFromState,
  compositionDuration,
  layerFieldsOf,
  translationStatus,
  estimateProduction,
  parsePlannedDuration,
  filmClips,
  filterStatusRows,
  isFilterActive,
  matchingScenes,
  framesToSeconds,
  mainProduction,
  orderedOccurrences,
  productionStatus,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const est = estimateProduction(s0, main.id);
const ov = productionStatus(s0, main.id, est);

describe("produksjonsstatus", () => {
  it("hver scene én gang, med beste tall: film → 2D-animatic → estimat", () => {
    const occs = orderedOccurrences(s0, main.id);
    expect(ov.rows.map((r) => r.occurrenceId)).toEqual(occs.map((o) => o.id));
    const clips = new Map<string, ReturnType<typeof filmClips>[number]>(
      filmClips(s0, main.id).map((c) => [c.occurrenceId, c]),
    );
    for (const r of ov.rows.filter((x) => x.active)) {
      const c = clips.get(r.occurrenceId)!;
      if (c.take) {
        expect(["film", "ai"]).toContain(r.source);
        expect(r.seconds).toBeCloseTo(framesToSeconds(c.durationFrames, s0.project.fps));
      } else if (c.durationKind === "set") expect(r.source).toBe("animatic");
      else {
        expect(r.source).toBe("estimate");
        expect(r.seconds).toBe(r.estimateSeconds);
      }
    }
    // Fixturen har både film og 2D-scene
    expect(ov.rows.some((r) => r.source === "film")).toBe(true);
    expect(ov.rows.some((r) => r.status === "animatic")).toBe(true);
  });

  it("summene: bekreftet + gjenstående = forventet; deaktiverte er ikke med; andelene stemmer", () => {
    const active = ov.rows.filter((r) => r.active);
    expect(ov.expectedSeconds).toBeCloseTo(
      active.reduce((t, r) => t + r.seconds, 0),
      6,
    );
    expect(ov.confirmedSeconds + ov.remainingEstimatedSeconds).toBeCloseTo(ov.expectedSeconds);
    expect(ov.estimatedSeconds).toBeCloseTo(est.activeSeconds);
    expect(ov.estimatedShare).toBeGreaterThan(0);
    expect(ov.doneShare + ov.estimatedShare).toBeLessThanOrEqual(1 + 1e-9);
    const counted = Object.values(ov.counts).reduce((a, b) => a + b, 0);
    expect(counted).toBe(ov.rows.length);
  });

  it("en deaktivert scene er med i listen, men ikke i summene", () => {
    const o = orderedOccurrences(s0, main.id).find((x) => x.active)!;
    const s = mustApply(s0, {
      type: "SetOccurrenceActive",
      occurrenceId: o.id,
      active: false,
    } as never);
    const ov2 = productionStatus(s, main.id, estimateProduction(s, main.id));
    const row = ov2.rows.find((r) => r.occurrenceId === o.id)!;
    expect(row.status).toBe("inactive");
    expect(ov2.counts.inactive).toBe(ov.counts.inactive + 1);
    expect(ov2.expectedSeconds).toBeLessThan(ov.expectedSeconds);
  });

  it("filter på status, ressurs, avvik og tekst", () => {
    const maja = Object.values(s0.assets).find((a) => a.name === "Maja")!;
    const withMaja = filterStatusRows(s0, ov.rows, { assetId: maja.id });
    expect(withMaja.length).toBeGreaterThan(0);
    expect(withMaja.every((r) => r.assetIds.includes(maja.id))).toBe(true);
    expect(
      filterStatusRows(s0, ov.rows, { status: "missing" }).every((r) => r.status === "missing"),
    ).toBe(true);
    expect(filterStatusRows(s0, ov.rows, { onlyDiscrepancies: true }).length).toBe(
      ov.rows.filter((r) => r.discrepancy).length,
    );
    const stua = filterStatusRows(s0, ov.rows, { text: "stua" });
    expect(stua.length).toBeGreaterThan(0);
    expect(stua.length).toBeLessThan(ov.rows.length);
  });
});

describe("planlagt lengde per scene (REQ-0111/0113)", () => {
  const occ = ov.rows.find((r) => r.active && r.source === "estimate")!;

  it("erstatter estimatet i oversikten og monteringen, kan angres, og er ikke «bekreftet»", () => {
    const r = applyCommand(
      s0,
      envelope({
        type: "SetPlannedDuration",
        occurrenceId: occ.occurrenceId as never,
        plannedMs: 60_000,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    const clip = filmClips(s, main.id).find((c) => c.occurrenceId === occ.occurrenceId)!;
    expect(clip.durationKind).toBe("planned");
    expect(framesToSeconds(clip.durationFrames, s.project.fps)).toBeCloseTo(60, 1);
    const ov2 = productionStatus(s, main.id, estimateProduction(s, main.id));
    const row = ov2.rows.find((x) => x.occurrenceId === occ.occurrenceId)!;
    expect(row.source).toBe("planned");
    expect(row.plannedSeconds).toBe(60);
    expect(ov2.confirmedSeconds).toBeCloseTo(ov.confirmedSeconds);
    expect(ov2.expectedSeconds).toBeCloseTo(ov.expectedSeconds - occ.seconds + row.seconds, 1);
    // Sceneeditoren bruker samme lengde for en 2D-scene uten satt lengde
    const comp = Object.values(s.compositions).find(
      (c) => !c.removed && c.variantId === s.occurrences[occ.occurrenceId]!.variantId,
    );
    if (comp && comp.durationFrames === 0)
      expect(compositionDuration(s, comp)).toBe(clip.durationFrames);
    // Angre fjerner planen igjen
    const back = mustApply(s, r.inverse as never);
    expect(back.occurrences[occ.occurrenceId]!.plannedMs).toBeUndefined();
  });

  it("ugyldige verdier avvises; tekst tolkes som m:ss eller sekunder", () => {
    for (const plannedMs of [0, 500, 1.5, 36_000_001])
      expect(
        applyCommand(
          s0,
          envelope({
            type: "SetPlannedDuration",
            occurrenceId: occ.occurrenceId as never,
            plannedMs,
          }),
        ).ok,
      ).toBe(false);
    expect(parsePlannedDuration("1:30")).toBe(90_000);
    expect(parsePlannedDuration("90")).toBe(90_000);
    expect(parsePlannedDuration("1,5")).toBe(1500);
    expect(parsePlannedDuration("")).toBe(null);
    expect(parsePlannedDuration("0")).toBe(undefined);
    expect(parsePlannedDuration("1:75")).toBe(undefined);
    expect(parsePlannedDuration("1:02:03")).toBe(3_723_000);
    expect(parsePlannedDuration("abc")).toBe(undefined);
  });
});

describe("planlagt lengde i sceneeditoren", () => {
  it("en 2D-scene uten satt lengde følger planen", () => {
    const comp = Object.values(s0.compositions).find((c) => !c.removed)!;
    const occ = Object.values(s0.occurrences).find(
      (o) => o.variantId === comp.variantId && o.productionId === main.id,
    )!;
    const unset = {
      ...s0,
      compositions: { ...s0.compositions, [comp.id]: { ...comp, durationFrames: 0 } },
    };
    const s = mustApply(unset as never, {
      type: "SetPlannedDuration",
      occurrenceId: occ.id,
      plannedMs: 45_000,
    });
    expect(compositionDuration(s, s.compositions[comp.id]!)).toBeGreaterThanOrEqual(
      Math.round(45 * (s.project.fps.num / s.project.fps.den)),
    );
  });
});

describe("filter på ressursendring og språk (REQ-0406)", () => {
  it("ressursendring: scener der 2D-scenen viser et eldre bilde enn det godkjente", () => {
    expect(filterStatusRows(s0, ov.rows, { onlyResourceChanges: true })).toEqual(
      ov.rows.filter((r) => r.outdatedLayers > 0),
    );
    // Et lag med en ressurs som har en godkjent versjon og en eldre versjon
    let pick: { layerId: string; variantId: string; olderId: string } | null = null;
    for (const l of Object.values(s0.layers)) {
      if (l.removed || !l.assetId) continue;
      for (const va of Object.values(s0.assetVariants)) {
        if (va.assetId !== l.assetId || !va.approvedVersionId) continue;
        const approved = s0.assetVersions[va.approvedVersionId]!;
        const older = Object.values(s0.assetVersions).find(
          (v) => v.variantId === va.id && v.number < approved.number,
        );
        if (older) pick = { layerId: l.id, variantId: va.id, olderId: older.id };
      }
      if (pick) break;
    }
    expect(pick).not.toBe(null);
    const layer = s0.layers[pick!.layerId]!;
    const older = { id: pick!.olderId };
    const s = mustApply(s0, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: layer.id,
          fields: {
            ...layerFieldsOf(layer),
            assetVariantId: pick!.variantId as never,
            versionId: older.id as never,
          },
        },
      ],
    });
    const ov2 = productionStatus(s, main.id, estimateProduction(s, main.id));
    const hit = filterStatusRows(s, ov2.rows, { onlyResourceChanges: true });
    expect(hit.length).toBeGreaterThan(0);
    const comp = s.compositions[layer.compositionId]!;
    expect(hit.map((r) => s.occurrences[r.occurrenceId]!.variantId)).toContain(comp.variantId);
  });

  it("språk: bare aktive scener med linjer som ikke er ferdig oversatt", () => {
    const all = filterStatusRows(s0, ov.rows, { language: "en" });
    expect(all.every((r) => r.active)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    // Oversett alle linjene i en scene som bare mangler oversettelser: den forsvinner fra listen
    const st = translationStatus(s0, main.id, "en");
    const row = all.find((r) => {
      const bs = blocksOfVariant(s0, s0.occurrences[r.occurrenceId]!.variantId);
      return (
        bs.some((b) => st.missingIds.has(b.id)) &&
        !bs.some((b) => st.uncertainIds.has(b.id) || st.reviewIds.has(b.id))
      );
    })!;
    expect(row).toBeTruthy();
    const o = s0.occurrences[row.occurrenceId]!;
    const blocks = blocksOfVariant(s0, o.variantId).filter((b) => st.missingIds.has(b.id));
    const s = mustApply(s0, {
      type: "AddTranslations",
      items: blocks.map((b) => ({
        translationId: tid(),
        fields: {
          blockId: b.id,
          variantId: null,
          language: "en",
          text: "x",
          basedOnRev: b.currentRev,
          status: "approved",
        },
      })),
    } as never);
    const ov2 = productionStatus(s, main.id, estimateProduction(s, main.id));
    const after = filterStatusRows(s, ov2.rows, { language: "en" });
    const shared = Object.values(s.occurrences).filter(
      (x) => x.variantId === o.variantId && x.productionId === main.id,
    );
    expect(after.some((r) => shared.some((x) => x.id === r.occurrenceId))).toBe(false);
  });
});

describe("utvikling over tid (mandat 7.4, REQ-0120)", () => {
  it("en manusversjon gir samme estimat som tilstanden den ble laget fra, og film teller med filmens lengde", () => {
    const snap = snapshotFromState(s0, main.id);
    const p = snapshotDuration(snap, "v1", "2026-10-01T00:00:00Z", () => null);
    expect(p.estimatedSeconds).toBe(est.activeSeconds);
    expect(p.expectedSeconds).toBe(p.estimatedSeconds);
    expect(p.scenes).toBe(ov.rows.length - ov.counts.inactive);
    // Med film for alle scener som har en aktiv filmversjon
    const withFilm = snapshotDuration(snap, "v1", "x", () => 1);
    const filmScenes = snap.scenes.filter((x) => x.active && x.activeTakeId).length;
    if (filmScenes > 0) expect(withFilm.expectedSeconds).toBeLessThan(p.expectedSeconds);
    // Antakelsene brukes
    const slow = snapshotDuration(snap, "v1", "x", () => null, {
      ...DEFAULT_DURATION_ASSUMPTIONS,
      dialogueWordsPerMinute: 50,
    });
    expect(slow.estimatedSeconds).toBeGreaterThan(p.estimatedSeconds);
  });
});

describe("manusfilter på ressurs, status og manusendringer (REQ-0073)", () => {
  it("hvert kriterium gir bare scenene som matcher, og kan kombineres med tekst", () => {
    const all = orderedOccurrences(s0, main.id).map((o) => o.id);
    expect([...matchingScenes(s0, main.id, {})]).toEqual(all);
    const missing = matchingScenes(s0, main.id, { status: "missing" });
    expect([...missing]).toEqual(
      ov.rows.filter((r) => r.status === "missing").map((r) => r.occurrenceId),
    );
    const disc = matchingScenes(s0, main.id, { discrepancy: true });
    expect([...disc]).toEqual(ov.rows.filter((r) => r.discrepancy).map((r) => r.occurrenceId));
    const vase = Object.values(s0.assets).find((a) => a.name === "vase")!;
    const withVase = matchingScenes(s0, main.id, { assetId: vase.id });
    expect(withVase.size).toBeGreaterThan(0);
    expect(withVase.size).toBeLessThan(all.length);
    const both = matchingScenes(s0, main.id, { assetId: vase.id, text: "stua" });
    for (const id of both) expect(withVase.has(id)).toBe(true);
    expect(isFilterActive({ status: "done" })).toBe(true);
    expect(isFilterActive({})).toBe(false);
  });
});
