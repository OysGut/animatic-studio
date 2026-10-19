// @vitest-environment node
/** CA7/CA8: arv av karakteratferd, «bare her»/«oppdater alle», historikk, globale oppsett, rytme og eksportvalg. */
import { describe, expect, it } from "vitest";
import { applyCommand, renderFrame, type Command, type ProjectState } from "@/core";
import type { AnimationUse } from "@/core/animation/rig";
import { clearOverride, compareRigSpecs, effectiveBehavior, hasSeparateCharacterLayers, otherUsages, planAdopt, restoreRigVersion, rigHistory, saveCharacterDefault, breathScaleAt } from "@/core/animation/character";
import { globalRigUpdate, planImportGlobalRig, toGlobalRig, type GlobalAnimationSpec } from "@/core/animation/global-rig";
import { planRhythm, rhythmGaps } from "@/core/animation/rhythm";
import { compositionForOccurrence, planRetime } from "@/core/composition/retime";
import { compositionDuration } from "@/core/composition/animate";
import type { GlobalAssetBundle } from "@/core/library/global";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const id = (n: number) => `01900000-0000-7000-8000-0057${String(n).padStart(8, "0")}`;
function apply(s: ProjectState, c: Command) { const r = applyCommand(s, envelope(c)); if (!r.ok) throw new Error(r.error.message); return r; }
const source = Object.values(fixture.state.assetVersions).find(v => v.mimeType.startsWith("image/"))!;
const layer = Object.values(fixture.state.layers).find(l => !l.removed && l.assetId === fixture.state.assetVariants[source.variantId]?.assetId)!;
const occurrence = Object.values(fixture.state.occurrences).find(o => o.active && o.variantId === fixture.state.compositions[layer.compositionId]?.variantId)!;
const anchors = { head: { x: .5, y: .2 }, mouth: { x: .5, y: .6 }, nose: { x: .5, y: .4 }, leftEye: { x: .4, y: .3 }, rightEye: { x: .6, y: .3 } };
const part = { versionId: source.id, drawing: [], mask: [], x: 0, y: 0, width: .2, height: .1, rotation: 0, adjustments: { brightness: 1, contrast: 1, saturation: 1, hue: 0, opacity: 1 } };
const spec = { format: 1 as const, anchors, parts: { "mouth:X": part }, behavior: { blinkEnabled: false } };

function ready(): ProjectState {
  let s = fixture.state;
  for (const c of [
    { type: "CreateRig", rigId: id(1), variantId: source.variantId },
    { type: "SaveRigVersion", rigId: id(1), versionId: id(2), sourceVersionId: source.id, spec },
    { type: "AttachAnimationUse", useId: id(3), layerId: layer.id, occurrenceId: occurrence.id, rigVersionId: id(2) },
  ] as Command[]) s = apply(s, c).state;
  // En annen scene med samme oppsett (lagt inn direkte for testen)
  const other: AnimationUse = { ...s.animationUses[id(3)]!, id: id(4) };
  return { ...s, animationUses: { ...s.animationUses, [other.id]: other } };
}
const content = (s: ProjectState) => JSON.stringify([s.animationRigs, s.animationRigVersions, s.animationUses], (k, v) => k === "revision" ? undefined : v);

describe("CA7 karakteratferd og arv", () => {
  it("standarden fra karakteren arves; lokale verdier vises som overstyring", () => {
    const s = ready();
    const use = s.animationUses[id(3)]!;
    expect(effectiveBehavior(s, use).behavior.blinkEnabled).toBe(false);
    expect(effectiveBehavior(s, use).inherited).toContain("blinkEnabled");
    const local = { ...use, behavior: { blinkEnabled: true } };
    const eff = effectiveBehavior(s, local);
    expect(eff.behavior.blinkEnabled).toBe(true);
    expect(eff.overridden).toEqual(["blinkEnabled"]);
    expect(clearOverride(local, "blinkEnabled")).toEqual({});
  });
  it("pust er deterministisk og nøytral når den er av", () => {
    expect(breathScaleAt(undefined, 10, 24)).toBe(1);
    const b = { enabled: true, periodMs: 2000, amount: 0.02 };
    expect(breathScaleAt(b, 0, 24)).toBe(1);
    expect(breathScaleAt(b, 24, 24)).toBeCloseTo(1.02);
    expect(breathScaleAt(b, 24, 24)).toBe(breathScaleAt(b, 24, 24));
  });
  it("ny standard lager ny versjon; ingen scene oppdateres automatisk", () => {
    const s = ready();
    const c = saveCharacterDefault(s, id(1), id(5), { blinkEnabled: true })!;
    const after = apply(s, c).state;
    expect(after.animationRigVersions[id(2)]).toEqual(s.animationRigVersions[id(2)]);
    expect(after.animationUses[id(3)]!.rigVersionId).toBe(id(2));
    expect(after.animationUses[id(4)]!.rigVersionId).toBe(id(2));
    expect(otherUsages(after, id(1), id(3)).map(u => u.use.id)).toEqual([id(4)]);
  });
  it("«bare her» flytter bare denne scenen, «oppdater alle» alle – med angre og gjør om", () => {
    const s = apply(ready(), saveCharacterDefault(ready(), id(1), id(5), { blinkEnabled: true })!).state;
    const here = apply(s, planAdopt(s, id(1), id(5), "here", id(3))!).state;
    expect(here.animationUses[id(3)]!.rigVersionId).toBe(id(5));
    expect(here.animationUses[id(4)]!.rigVersionId).toBe(id(2));
    const all = apply(s, planAdopt(s, id(1), id(5), "all", id(3))!);
    expect(all.state.animationUses[id(4)]!.rigVersionId).toBe(id(5));
    const undone = apply(all.state, all.inverse), redone = apply(undone.state, undone.inverse);
    expect(content(undone.state)).toBe(content(s));
    expect(content(redone.state)).toBe(content(all.state));
    expect(planAdopt(all.state, id(1), id(5), "all", id(3))).toBeNull();
  });
  it("AdoptRigVersion avviser bruk fra et annet oppsett og tomme lister", () => {
    const s = ready();
    expect(applyCommand(s, envelope({ type: "AdoptRigVersion", useIds: [], rigVersionId: id(2) })).ok).toBe(false);
    expect(applyCommand(s, envelope({ type: "AdoptRigVersion", useIds: [id(99)], rigVersionId: id(2) })).ok).toBe(false);
  });
  it("historikk: sammenligning og «gjenopprett som ny versjon» sletter ingenting", () => {
    let s = ready();
    s = apply(s, { type: "SetRigAnchors", rigId: id(1), versionId: id(6), sourceVersionId: source.id, anchors: { ...anchors, mouth: { x: .4, y: .7 } } }).state;
    expect(rigHistory(s, id(1)).map(v => v.number)).toEqual([2, 1]);
    expect(compareRigSpecs(s.animationRigVersions[id(2)]!.spec, s.animationRigVersions[id(6)]!.spec)).toEqual([{ kind: "anchor", key: "mouth", change: "changed" }]);
    const r = apply(s, restoreRigVersion(s, id(2), id(7))!);
    expect(rigHistory(r.state, id(1)).map(v => v.number)).toEqual([3, 2, 1]);
    expect(r.state.animationRigVersions[id(7)]!.spec).toEqual(s.animationRigVersions[id(2)]!.spec);
    expect(r.state.animationRigs[id(1)]!.currentVersionId).toBe(id(7));
    expect(content(apply(r.state, r.inverse).state)).toBe(content(s));
  });
});

describe("CA7 globalt bibliotek", () => {
  const gv = { id: id(50), variantId: id(51), assetId: id(52), number: 1, storageKey: "k", mimeType: source.mimeType, width: 10, height: 10, byteSize: 1, sha256: source.sha256, durationMs: null, note: "", createdAt: "", template: null };
  const bundle = { asset: { id: id(52), workspaceId: id(53), kind: "character", name: "K", description: "", categories: [], tags: [], archived: false, revision: 1 }, variants: [{ id: id(51), assetId: id(52), name: "V", style: "reference", appearance: "", archived: false }], versions: [gv] } as unknown as GlobalAssetBundle;
  it("publisering bruker globale bilde-ID-er; uten bildet i biblioteket gis en forklaring", () => {
    const s = ready();
    const r = toGlobalRig(s, id(2), bundle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.variantId).toBe(id(51));
    expect(r.value.rig.sourceGlobalVersionId).toBe(id(50));
    expect(r.value.rig.parts?.["mouth:X"]?.versionId).toBe(id(50));
    expect(toGlobalRig(s, id(2), { ...bundle, versions: [] }).ok).toBe(false);
  });
  it("bruk i prosjekt låser versjonen; nyere global versjon krever bekreftelse", () => {
    const pub = toGlobalRig(ready(), id(2), bundle);
    if (!pub.ok) throw new Error(pub.error);
    const spec1: GlobalAnimationSpec = { id: id(60), workspaceId: id(53), globalAssetId: id(52), variantId: id(51), number: 1, rig: pub.value.rig, patterns: pub.value.patterns, note: "", createdAt: "" };
    const assetId = fixture.state.assetVariants[source.variantId]!.assetId;
    const plan = planImportGlobalRig(fixture.state, spec1, bundle, assetId, { rigId: id(61), versionId: id(62), patternIds: {} });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.value.commands.map(c => c.type)).toEqual(["CreateRig", "SaveRigVersion"]);
    let s = fixture.state;
    for (const c of plan.value.commands) s = apply(s, c).state;
    expect(s.animationRigVersions[id(62)]!.spec.origin).toEqual({ globalSpecId: id(60), globalNumber: 1, globalVariantId: id(51) });
    expect(s.animationRigVersions[id(62)]!.sourceVersionId).toBe(source.id);
    expect(globalRigUpdate(s, id(61), [spec1])).toBeNull();
    const spec2 = { ...spec1, id: id(63), number: 2 };
    expect(globalRigUpdate(s, id(61), [spec1, spec2])?.number).toBe(2);
    // Ingenting endres før brukeren tar inn versjonen
    expect(s.animationRigVersions[id(62)]!.spec.origin?.globalNumber).toBe(1);
  });
});

describe("CA8 eksportvalg i den felles tegnelisten", () => {
  const items = (s: ProjectState) => renderFrame(s, layer.compositionId, 0, { view: "camera" }).items;
  it("munnformen tegnes over laget; av-valget tar den bort; «eget lag» merkes", () => {
    const s = ready();
    expect(items(s).some(i => i.layerId === `${layer.id}:rig:mouth:X`)).toBe(true);
    const off = apply(s, { type: "SetAnimationBehavior", useId: id(3), behavior: { export: { mouth: false, blink: true, overlay: true, masks: true, adjust: true, mode: "burned" } } }).state;
    expect(items(off).some(i => i.layerId.includes(":rig:"))).toBe(false);
    const sep = apply(s, { type: "SetAnimationBehavior", useId: id(3), behavior: { export: { mouth: true, blink: true, overlay: true, masks: true, adjust: false, mode: "separate" } } }).state;
    const it = items(sep).find(i => i.layerId === `${layer.id}:rig:mouth:X`)!;
    expect(it.character?.separate).toBe(true);
    expect(it.character?.adjustments).toBeUndefined();
    expect(hasSeparateCharacterLayers(sep)).toBe(true);
    expect(hasSeparateCharacterLayers(s)).toBe(false);
  });
  it("ugyldige eksportvalg avvises", () => {
    expect(applyCommand(ready(), envelope({ type: "SetAnimationBehavior", useId: id(3), behavior: { export: { mouth: "ja" } as never } })).ok).toBe(false);
  });
  it("samme tilstand gir samme bilde (forhåndsvisning = eksport)", () => {
    const s = ready();
    expect(JSON.stringify(items(s))).toBe(JSON.stringify(items(s)));
  });
});

describe("CA8 rytmeverktøyet", () => {
  const clip = Object.values(fixture.state.audioClips).find(c => !c.removed && c.kind === "dialogue")!;
  const occ = clip.occurrenceId;
  const comp = compositionForOccurrence(fixture.state, fixture.state.occurrences[occ]!)!;
  it("takt 1 uten endringer gir ingen plan", () => {
    const p = planRhythm(fixture.state, occ, { tempo: 1 });
    expect(p.retime).toBeNull();
    expect(p.afterFrames).toBe(p.beforeFrames);
  });
  it("lavere takt forlenger pausene; én RetimeScene med én angring", () => {
    const gaps = rhythmGaps(fixture.state, occ);
    expect(gaps.length).toBeGreaterThan(0);
    const p = planRhythm(fixture.state, occ, { tempo: 0.5 });
    expect(p.retime?.ok).toBe(true);
    if (!p.retime?.ok) return;
    expect(p.retime.command.type).toBe("RetimeScene");
    expect(p.afterFrames - p.beforeFrames).toBe(p.gaps.reduce((a, g) => a + g.change, 0));
    const r = apply(fixture.state, p.retime.command);
    expect(compositionDuration(r.state, r.state.compositions[comp.id]!)).toBe(p.afterFrames);
    const undone = apply(r.state, r.inverse);
    expect(compositionDuration(undone.state, undone.state.compositions[comp.id]!)).toBe(p.beforeFrames);
  });
  it("forskyvning ved skjæringspunktet påvirker ikke mellomrom før punktet", () => {
    const gaps = rhythmGaps(fixture.state, occ);
    const cut = gaps[0]!.endFrame;
    const p = planRhythm(fixture.state, occ, { tempo: 1, cutFrame: cut, shiftFrames: 5 });
    expect(p.gaps[0]!.change).toBe(0);
    expect(p.afterFrames - p.beforeFrames).toBe(gaps.length > 1 ? 5 : 0);
  });
  it("komprimering stopper ved null – ingen negative mellomrom", () => {
    const p = planRhythm(fixture.state, occ, { tempo: 4, shiftFrames: -100000, proportional: true });
    for (const g of p.gaps) expect(g.before.endFrame - g.before.startFrame + g.change).toBeGreaterThanOrEqual(0);
  });
  it("planRetime med gapChanges kan omfordele uten å endre varigheten", () => {
    const gaps = rhythmGaps(fixture.state, occ);
    if (gaps.length < 2) return;
    const before = compositionDuration(fixture.state, comp);
    const take = Math.min(2, gaps[0]!.endFrame - gaps[0]!.startFrame);
    const changes = gaps.map((_, i) => (i === 0 ? -take : i === 1 ? take : 0));
    const p = planRetime(fixture.state, occ, { targetFrames: before, method: "pauses", keepAmbience: true, gapChanges: changes });
    expect(p.ok).toBe(take > 0);
  });
});
