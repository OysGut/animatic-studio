/** M8 kvalitetsprofiler (REQ-0854–0862): kommandoer, validering, modellvalg, budsjett og øyeblikksbilde. */
import { describe, expect, it } from "vitest";
import {
  activeQualityProfile,
  applyCommand,
  BACKUP_STATE_TABLES,
  defaultQualityProfiles,
  emptyProjectState,
  jobQualityProfile,
  profileBudgetRemaining,
  profileChoice,
  qualityProfileError,
  qualityProfileSnapshot,
  qualityProfilesOf,
  type Command,
  type ProjectState,
  type QualityProfileSpec,
} from "@/core";
import { envelope, tid } from "../helpers/fixtures";

function apply(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r;
}
function refused(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r;
}
const SPEC: QualityProfileSpec = { effort: "premium", variants: 2, resolution: "4K" };

function withProfile(s: ProjectState, name = "Endelig", spec: QualityProfileSpec = SPEC) {
  const id = tid<"quality_profile">();
  const r = apply(s, { type: "AddQualityProfile", profileId: id, name, spec });
  return { s: r.state, id, inverse: r.inverse };
}

describe("M8 quality profiles – commands", () => {
  it("AddQualityProfile adds the profile; undo removes it exactly", () => {
    const s0 = emptyProjectState();
    const { s, id, inverse } = withProfile(s0);
    expect(s.qualityProfiles[id]!.name).toBe("Endelig");
    expect(s.qualityProfiles[id]!.spec.effort).toBe("premium");
    const undone = apply(s, inverse);
    expect(undone.state.qualityProfiles[id]).toBeUndefined();
    // Gjør om: samme profil tilbake
    const redone = apply(undone.state, undone.inverse);
    expect(redone.state.qualityProfiles[id]!.name).toBe("Endelig");
  });
  it("rejects invalid names and specs", () => {
    const s = emptyProjectState();
    refused(s, { type: "AddQualityProfile", profileId: tid(), name: "  ", spec: {} });
    refused(s, { type: "AddQualityProfile", profileId: tid(), name: "X", spec: { variants: 0 } });
    refused(s, { type: "AddQualityProfile", profileId: tid(), name: "X", spec: { variants: 99 } });
    refused(s, { type: "AddQualityProfile", profileId: tid(), name: "X", spec: { budgetLimit: -1 } });
    refused(s, { type: "AddQualityProfile", profileId: tid(), name: "X", spec: { effort: "ultra" as never } });
  });
  it("UpdateQualityProfile changes name and spec; undo restores both", () => {
    const { s, id } = withProfile(emptyProjectState());
    const r = apply(s, { type: "UpdateQualityProfile", profileId: id, name: "Final 4K", spec: { effort: "fast" } });
    expect(r.state.qualityProfiles[id]!.name).toBe("Final 4K");
    expect(r.state.qualityProfiles[id]!.spec).toEqual({ effort: "fast" });
    const undone = apply(r.state, r.inverse);
    expect(undone.state.qualityProfiles[id]!.name).toBe("Endelig");
    expect(undone.state.qualityProfiles[id]!.spec).toEqual(SPEC);
  });
  it("SetActiveQualityProfile sets and clears the active profile with revision check", () => {
    const { s, id } = withProfile(emptyProjectState());
    const r = apply(s, { type: "SetActiveQualityProfile", profileId: id });
    expect(r.state.project.activeQualityProfileId).toBe(id);
    expect(activeQualityProfile(r.state)?.id).toBe(id);
    const undone = apply(r.state, r.inverse);
    expect(undone.state.project.activeQualityProfileId ?? null).toBeNull();
    expect(activeQualityProfile(undone.state)).toBeNull();
  });
  it("a removed profile cannot be active; removing the active profile clears the choice", () => {
    const { s, id } = withProfile(emptyProjectState());
    const active = apply(s, { type: "SetActiveQualityProfile", profileId: id }).state;
    const removed = apply(active, { type: "SetQualityProfileRemoved", profileId: id, removed: true });
    expect(removed.state.qualityProfiles[id]!.removed).toBe(true);
    expect(removed.state.project.activeQualityProfileId ?? null).toBeNull();
    refused(removed.state, { type: "SetActiveQualityProfile", profileId: id });
    // Angring av fjerningen gjenoppretter profilen (aktivvalget var en egen kommando)
    const undone = apply(removed.state, removed.inverse);
    expect(undone.state.qualityProfiles[id]!.removed).toBe(false);
  });
  it("undoing the creation of an active profile clears the active choice in the same undo", () => {
    const { s, id } = withProfile(emptyProjectState());
    const active = apply(s, { type: "SetActiveQualityProfile", profileId: id }).state;
    const undone = apply(active, { type: "UndoAddQualityProfile", profileId: id });
    expect(undone.state.qualityProfiles[id]).toBeUndefined();
    expect(undone.state.project.activeQualityProfileId ?? null).toBeNull();
  });
});

describe("M8 quality profiles – rules", () => {
  it("defaultQualityProfiles: Utkast, Gjennomgang and Endelig are valid", () => {
    const d = defaultQualityProfiles();
    expect(d.map((p) => p.name)).toEqual(["Utkast", "Gjennomgang", "Endelig"]);
    for (const p of d) expect(qualityProfileError(p.name, p.spec)).toBeNull();
  });
  it("qualityProfilesOf sorts by name and hides removed profiles", () => {
    let s = emptyProjectState();
    const a = withProfile(s, "B-profil"); s = a.s;
    const b = withProfile(s, "A-profil"); s = b.s;
    const c = withProfile(s, "C-profil"); s = c.s;
    s = apply(s, { type: "SetQualityProfileRemoved", profileId: c.id, removed: true }).state;
    expect(qualityProfilesOf(s).map((p) => p.name)).toEqual(["A-profil", "B-profil"]);
  });
  it("the snapshot is frozen in time: changing the profile never changes old results", () => {
    const { s, id } = withProfile(emptyProjectState());
    const snap = qualityProfileSnapshot(s.qualityProfiles[id]!);
    const changed = apply(s, { type: "UpdateQualityProfile", profileId: id, spec: { effort: "fast" } }).state;
    expect(changed.qualityProfiles[id]!.spec.effort).toBe("fast");
    expect(snap.spec.effort).toBe("premium");
    // Jobben leser øyeblikksbildet fra metadataen, ikke profilen
    const job = { params: { qualityProfile: snap } };
    expect(jobQualityProfile(job)!.spec.effort).toBe("premium");
    expect(jobQualityProfile({ params: {} })).toBeNull();
  });
  it("profileChoice: explicit model wins, otherwise the profile's effort decides; null without a profile", () => {
    const connected = new Set<string>();
    expect(profileChoice("image", null, connected)).toBeNull();
    const byEffort = profileChoice("image", { spec: { effort: "fast" } }, connected);
    expect(byEffort).not.toBeNull();
    expect(byEffort!.model.tier ?? "balanced").toBe("fast");
    const explicit = profileChoice("image", { spec: { models: { image: byEffort!.model.id } } }, connected);
    expect(explicit!.model.id).toBe(byEffort!.model.id);
    // En modell som ikke finnes lenger, faller tilbake på innsatsnivået
    const gone = profileChoice("image", { spec: { models: { image: "finnes-ikke" }, effort: "premium" } }, connected);
    expect(gone!.model.tier ?? "balanced").toBe("premium");
  });
  it("profile budget: remaining count, or null without a limit", () => {
    expect(profileBudgetRemaining(null, 5)).toBeNull();
    expect(profileBudgetRemaining({ spec: {} }, 5)).toBeNull();
    expect(profileBudgetRemaining({ spec: { budgetLimit: 10 } }, 4)).toBe(6);
    expect(profileBudgetRemaining({ spec: { budgetLimit: 10 } }, 12)).toBe(0);
  });
  it("the backup includes the profiles", () => {
    expect(BACKUP_STATE_TABLES).toContain("quality_profiles");
  });
});
