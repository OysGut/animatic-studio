// @vitest-environment node
/** MTS MT4/MT5: lower thirds, maler, «Bruk samme design», ny malversjon og sikkerhetskopi. */
import { describe, expect, it } from "vitest";
import {
  COLLECTION_TABLES,
  FPS_25,
  MAX_TEMPLATE_JSON,
  applyCommand,
  backupIdMap,
  emptyProjectState,
  instanceLayers,
  lowerThirdStarter,
  makeBackup,
  newerTemplateVersion,
  parseBackup,
  planApplyTemplate,
  planTemplateVersionUpdate,
  planUpdateTemplateValues,
  restoredState,
  templateError,
  templateFromLayers,
  toRow,
  type BackupData,
  type CollectionName,
  type ProjectRows,
  type ProjectState,
  type Row,
  type TemplateDefinition,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const comps = Object.values(fixture.state.compositions).filter((c) => !c.removed);
const A = comps[0]!;
const B = comps[1] ?? comps[0]!;

function media(s: ProjectState, assetId: string, versionId: string) {
  return {
    path: `${s.project.id}/${assetId}/${versionId}/mal.png`,
    mimeType: "image/png",
    width: 480,
    height: 270,
    byteSize: 100,
    sha256: "b".repeat(64),
    durationMs: null,
  };
}

/** Lower third i scene A, lagret som mal (versjon 1). */
function setup() {
  let s = fixture.state;
  const layers = lowerThirdStarter(A, {
    newLayerId: () => tid<"composition_layer">(),
    groupName: "Lower third",
    nameLabel: "Navn",
    roleLabel: "Rolle",
    name: "Anita Killi",
    role: "Regi",
  });
  s = mustApply(s, { type: "AddLayers", layers });
  const groupId = layers[0]!.layerId;
  const def = templateFromLayers(s, A.id, [groupId], { category: "lower_third" });
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  const v1 = tid<"asset_version">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [{ assetId, fields: { kind: "template", name: "LT", names: [], description: "", category: "lower_third", tags: [] } }],
  });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Standard", style: "other", appearance: "" } });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v1, variantId, media: media(s, assetId, v1), note: "", template: def });
  return { s, def, assetId, variantId, v1 };
}

function apply(s: ProjectState, compositionId: string, versionId: string, values?: Record<string, { text: string }>) {
  const instanceId = tid<"template_instance">();
  const plan = planApplyTemplate(s, {
    instanceId,
    compositionId,
    versionId,
    ...(values ? { values } : {}),
    newLayerId: () => tid<"composition_layer">(),
  });
  if (!plan.ok) throw new Error(plan.reason);
  return { s: mustApply(s, plan.command), instanceId };
}

describe("MT4 maldefinisjon", () => {
  it("tekstlagene blir felt med navnet fra laget", () => {
    const { def } = setup();
    expect(def.slots.map((x) => [x.key, x.kind])).toEqual([
      ["navn", "text"],
      ["rolle", "text"],
    ]);
    expect(templateError(def)).toBeNull();
  });
  it("en mal over 256 kB avvises", () => {
    const { def } = setup();
    expect(MAX_TEMPLATE_JSON).toBe(256 * 1024);
    const big: TemplateDefinition = {
      ...def,
      slots: [...def.slots, { key: "stor", label: "x".repeat(80), kind: "text" }],
      elements: def.elements.map((e) => ({ ...e, fields: { ...e.fields, name: "x".repeat(3000) } })).concat(
        Array.from({ length: 90 }, (_, i) => ({ ...def.elements[2]!, key: `z${i}`, fields: { ...def.elements[2]!.fields, name: "y".repeat(3000) } })),
      ),
    };
    expect(templateError(big)).toMatch(/for stor/);
  });
});

describe("MT5 lower thirds (X–AB)", () => {
  it("«Bruk samme design som i scene …» lager en ny forekomst med eget innhold (Z)", () => {
    const { s: s0, v1 } = setup();
    const a = apply(s0, A.id, v1);
    const b = apply(a.s, B.id, v1, { navn: { text: "Øystein Gutu" } });
    const s = b.s;
    expect(a.instanceId).not.toBe(b.instanceId);
    const textOf = (id: string) => instanceLayers(s, id).flatMap((l) => (l.text ? [l.text.content] : []));
    expect(textOf(a.instanceId)).toEqual(["Anita Killi", "Regi"]);
    expect(textOf(b.instanceId)).toEqual(["Øystein Gutu", "Regi"]);
    expect(s.templateInstances[b.instanceId]!.templateVersionId).toBe(v1);
  });

  it("nytt innhold endrer ikke malen eller andre forekomster (AA, AB, M3)", () => {
    const { s: s0, v1, def } = setup();
    const a = apply(s0, A.id, v1);
    const b = apply(a.s, B.id, v1);
    const plan = planUpdateTemplateValues(b.s, b.instanceId, { rolle: { text: "Produsent" } });
    if (!plan.ok) throw new Error(plan.reason);
    const s = mustApply(b.s, plan.command);
    expect(s.assetVersions[v1]!.template).toEqual(def);
    expect(instanceLayers(s, a.instanceId).some((l) => l.text?.content === "Produsent")).toBe(false);
    expect(instanceLayers(s, b.instanceId).some((l) => l.text?.content === "Produsent")).toBe(true);
  });

  it("bygging av lag fra mal: én kommando, én revisjon per rad, kan angres og gjøres om", () => {
    const { s: s0, v1 } = setup();
    const instanceId = tid<"template_instance">();
    const plan = planApplyTemplate(s0, { instanceId, compositionId: A.id, versionId: v1, newLayerId: () => tid<"composition_layer">() });
    if (!plan.ok) throw new Error(plan.reason);
    const r = applyCommand(s0, envelope(plan.command));
    if (!r.ok) throw new Error(r.error.message);
    for (const l of instanceLayers(r.state, instanceId)) expect(l.revision).toBe(1);
    const undo = applyCommand(r.state, envelope(r.inverse));
    if (!undo.ok) throw new Error(undo.error.message);
    expect(instanceLayers(undo.state, instanceId)).toEqual([]);
    const redo = applyCommand(undo.state, envelope(undo.inverse));
    if (!redo.ok) throw new Error(redo.error.message);
    expect(instanceLayers(redo.state, instanceId)).toHaveLength(4);
  });
});

describe("MT4 ny malversjon (AI–AJ, M5)", () => {
  function withV2() {
    const x = setup();
    const a = apply(x.s, A.id, x.v1);
    let s = a.s;
    // Lokal justering i forekomsten: navnet flyttes
    const nameLayer = instanceLayers(s, a.instanceId).find((l) => l.template?.slot === "navn")!;
    s = mustApply(s, {
      type: "UpdateLayers",
      layers: [{ layerId: nameLayer.id, fields: { ...(lf(nameLayer) as object), transform: { ...nameLayer.transform, x: nameLayer.transform.x + 33 } } as never }],
    });
    // Ny versjon av malen: annen farge på rollen
    const v2 = tid<"asset_version">();
    const def2: TemplateDefinition = {
      ...x.def,
      elements: x.def.elements.map((e) =>
        e.slot === "rolle" && e.fields.text ? { ...e, fields: { ...e.fields, text: { ...e.fields.text, color: "#ff0000" } } } : e,
      ),
    };
    s = mustApply(s, { type: "AddAssetVersion", versionId: v2, variantId: x.variantId, media: media(s, x.assetId, v2), note: "", template: def2 });
    return { ...x, s, instanceId: a.instanceId, v2, nameLayer };
  }
  const lf = (l: ProjectState["layers"][string]) => {
    const { id: _i, revision: _r, compositionId: _c, orderKey: _o, removed: _rm, ...f } = l as never as Record<string, unknown>;
    return f as never;
  };

  it("ny versjon endrer ingenting før brukeren ber om det, men varsles (AI)", () => {
    const { s, instanceId, v1, v2 } = withV2();
    expect(s.templateInstances[instanceId]!.templateVersionId).toBe(v1);
    expect(newerTemplateVersion(s, instanceId)).toBe(v2);
    expect(instanceLayers(s, instanceId).find((l) => l.template?.slot === "rolle")!.text!.color).not.toBe("#ff0000");
  });

  it("oppdatering tar den nye malen og beholder lokale justeringer (AJ)", () => {
    const { s, instanceId, v2, nameLayer } = withV2();
    const plan = planTemplateVersionUpdate(s, instanceId, v2, () => tid<"composition_layer">());
    if (!plan.ok) throw new Error(plan.reason);
    const n = mustApply(s, plan.command);
    const layers = instanceLayers(n, instanceId);
    expect(layers.find((l) => l.template?.slot === "rolle")!.text!.color).toBe("#ff0000");
    expect(layers.find((l) => l.template?.slot === "navn")!.transform.x).toBe(nameLayer.transform.x + 33);
    expect(n.templateInstances[instanceId]!.templateVersionId).toBe(v2);
    expect(newerTemplateVersion(n, instanceId)).toBeNull();
  });
});

describe("MT4 sikkerhetskopi", () => {
  it("maldefinisjonen og forekomstene følger med gjennom kopi og gjenoppretting", async () => {
    const x = setup();
    const a = apply(x.s, A.id, x.v1, { navn: { text: "Æ Ø Å" } });
    const s = a.s;
    const rows: Record<string, unknown> = { project: fixture.project, ...fixture.rows };
    for (const coll of ["assets", "assetVariants", "assetVersions", "layers", "templateInstances"] as const)
      rows[COLLECTION_TABLES[coll]] = Object.values(s[coll] as Record<string, never>).map((e) =>
        toRow(coll as CollectionName, e, s.project.id),
      );
    const b = parseBackup(
      JSON.parse(
        JSON.stringify(
          makeBackup({
            rows: rows as unknown as ProjectRows,
            scriptVersions: [],
            importedDocuments: [],
            changeLog: [],
            generationJobs: [],
            schemaVersion: 49,
            createdAt: "2026-10-18T12:00:00Z",
            include: new Set() as unknown as ReadonlySet<never>,
          }),
        ),
      ) as BackupData,
      49,
    );
    expect((b.tables["asset_versions"] as Row[]).some((r) => r["template_spec"])).toBe(true);
    expect(b.tables["template_instances"]).toHaveLength(1);
    const NEW_PROJECT = "01900000-0000-7000-8000-00000049aaaa";
    const NEW_MAIN = "01900000-0000-7000-8000-00000049bbbb";
    const base0 = emptyProjectState({
      id: NEW_PROJECT as never,
      revision: 1,
      name: "Gjenopprettet",
      fps: FPS_25,
      frameWidth: 1920,
      frameHeight: 1080,
      primaryLanguage: "nb",
    });
    const base = {
      ...base0,
      productions: {
        [NEW_MAIN]: { id: NEW_MAIN as never, revision: 1, kind: "main" as const, name: "Hovedfilm", parentProductionId: null, fps: FPS_25 },
      },
    };
    const map = await backupIdMap(b, NEW_PROJECT, NEW_MAIN);
    const r = restoredState(b, map, base, "01900000-0000-7000-8000-00000049cccc");
    const v = r.assetVersions[map.get(x.v1)!]!;
    expect(v.template).toEqual(x.def);
    const inst = r.templateInstances[map.get(a.instanceId)!]!;
    expect(inst.templateVersionId).toBe(map.get(x.v1));
    expect(inst.values["navn"]).toEqual({ text: "Æ Ø Å" });
    const layers = instanceLayers(r, inst.id);
    expect(layers).toHaveLength(4);
    expect(layers.find((l) => l.template?.slot === "navn")!.text!.content).toBe("Æ Ø Å");
  });
});
