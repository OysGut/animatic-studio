// @vitest-environment node
/**
 * P8 masseharmonisering: lease og idempotens som DV5. Bildegenereringen er mocket – ingen ekte AI-kall.
 * Reglene: et lagret resultat (kvittering) legges bare inn, aldri generert på nytt; en mulig fakturert feil
 * («lost») kan ikke gjentas; samme resultat to ganger avvises som dublett; lokal bruk endrer ikke biblioteket.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  emptyStyleGuide,
  harmonizeBatchCommand,
  harmonizeBatchSelectionError,
  type AssetMedia,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const run = vi.fn();
let state: ProjectState;
vi.mock("@/adapters/ai/image-run.server", () => ({ runImageGeneration: (...a: unknown[]) => run(...a) }));
vi.mock("@/adapters/storage/project-rows", () => ({ loadProjectState: async () => state, checkSchema: async () => ({ kind: "ok", version: 65 }) }));
vi.mock("@/adapters/ai/ai-gate.server", () => ({ memberRole: async () => "editor", ROLE_RANK: { viewer: 1, commenter: 2, editor: 3, owner: 4 } }));

const profileId = tid<"style_profile">();
const s0 = mustApply(fixture.state, { type: "CreateStyleProfile", profileId, fields: { name: "Filmens stil", isDefault: true, guide: { ...emptyStyleGuide(), visualStyle: "Watercolour", lighting: "Soft" } } });
const source = Object.values(s0.assetVersions).find((v) => v.mimeType.startsWith("image/"))!;
const assetId = s0.assetVariants[source.variantId]!.assetId;
const media: AssetMedia = { path: `${s0.project.id}/assets/generated/x/ai.png`, mimeType: "image/png", width: 10, height: 10, byteSize: 100, sha256: "b".repeat(64) };

/** En liten falsk database: holder jobb og elementer, og logger rpc-kallene. */
function fakeDb(item: Record<string, unknown>, jobStatus = "done") {
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const batch = { id: "b1", project_id: s0.project.id, created_by: "u1", style_profile_id: profileId, reference_version_id: null, provider: "lovable", model: "m", size: null, status: "running", lease_token: null as string | null };
  const chain = (table: string) => {
    let op = "select";
    let patch: Record<string, unknown> | null = null;
    const where: Record<string, unknown> = {};
    const q: Record<string, unknown> = {
      select: () => q, in: () => q, order: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { where[k] = v; return q; },
      update: (p: Record<string, unknown>) => { op = "update"; patch = p; return q; },
      maybeSingle: async () => ({ data: table === "harmonize_batches" ? batch : table === "generation_jobs" ? { params: {}, status: jobStatus } : null }),
      then: (res: (v: unknown) => void) => {
        // Oppdateringen gjelder bare når filtrene treffer (som i databasen)
        if (op === "update" && table === "harmonize_batches" && patch && Object.entries(where).every(([k, v]) => k === "id" || (batch as Record<string, unknown>)[k] === v)) Object.assign(batch, patch);
        return res(op === "update" ? { error: null } : table === "harmonize_batch_items" ? { data: ["waiting", "ready"].includes(String(item["status"])) ? [item] : [], count: ["waiting", "ready", "generating"].includes(String(item["status"])) ? 1 : 0, error: null } : { data: [], error: null });
      },
    };
    return q;
  };
  const db = {
    from: chain,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      if (name === "claim_harmonize_batch") { batch.lease_token = String(args["p_lease"]); return { data: batch, error: null }; }
      if (name === "transition_harmonize_batch_item") { Object.assign(item, args["p_patch"] as object); return { data: null, error: null }; }
      if (name === "complete_harmonize_batch_item") { item["status"] = "done"; return { data: { ok: true }, error: null }; }
      return { data: null, error: null };
    },
  };
  return { db, rpcs, batch };
}
const plan = () => ({ id: "i1", job_id: "j1", asset_id: assetId, source_version_id: source.id, variant_id: tid(), version_id: tid(), harmonization_id: tid(), command_id: tid(), attempts: 0 });

beforeEach(() => {
  run.mockReset();
  state = s0;
});

describe("masseharmonisering – lease og idempotens (krav 6)", () => {
  it("et lagret resultat legges inn uten ny generering", async () => {
    const item: Record<string, unknown> = { ...plan(), status: "ready", result: { media, model: "m" } };
    const { db, rpcs } = fakeDb(item);
    const { processHarmonizeBatch } = await import("@/adapters/storage/harmonize-batch.server");
    await processHarmonizeBatch(db as never, "b1");
    expect(run).not.toHaveBeenCalled();
    const done = rpcs.find((r) => r.name === "complete_harmonize_batch_item")!;
    expect(done.args["p_command"]).toMatchObject({ type: "ApplyHarmonizedImage", versionId: item["version_id"], fields: { use: "variant", sourceVersionId: source.id } });
  });

  it("ny generering bruker den reserverte jobben og lagrer kvitteringen før prosjektet endres", async () => {
    run.mockResolvedValue({ ok: true, versionId: "x", media, model: "m", jobId: "j1" });
    const item: Record<string, unknown> = { ...plan(), status: "waiting", result: null };
    const { db, rpcs } = fakeDb(item);
    const { processHarmonizeBatch } = await import("@/adapters/storage/harmonize-batch.server");
    await processHarmonizeBatch(db as never, "b1");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![2]).toEqual({ existingJobId: "j1" });
    expect(run.mock.calls[0]![0]).toMatchObject({ approved: true, identityFirst: true });
    const order = rpcs.map((r) => r.name);
    const receipt = rpcs.findIndex((r) => r.name === "transition_harmonize_batch_item" && (r.args["p_patch"] as { status?: string }).status === "ready");
    expect(receipt).toBeGreaterThan(-1);
    expect(receipt).toBeLessThan(order.indexOf("complete_harmonize_batch_item"));
  });

  it("en mulig fakturert feil («lost») merkes som ikke-gjentakbar og jobben settes på pause", async () => {
    run.mockResolvedValue({ ok: false, message: "Lagring feilet" });
    const item: Record<string, unknown> = { ...plan(), status: "waiting", result: null };
    const { db, batch } = fakeDb(item, "lost");
    const { processHarmonizeBatch } = await import("@/adapters/storage/harmonize-batch.server");
    await processHarmonizeBatch(db as never, "b1");
    expect(item["status"]).toBe("failed");
    expect(item["retryable"]).toBe(false);
    expect(batch.status).toBe("paused");
  });

  it("samme resultat kan ikke legges inn to ganger (forhåndstildelte ID-er)", () => {
    const p = { assetId, sourceVersionId: source.id, variantId: tid(), versionId: tid(), harmonizationId: tid() };
    const cmd = harmonizeBatchCommand(s0, p, { media, model: "m" }, { styleProfileId: profileId, referenceVersionId: null, qualityProfile: null });
    const once = mustApply(s0, cmd as never);
    expect(once.assetVersions[source.id]).toEqual(s0.assetVersions[source.id]);
    expect(applyCommand(once, envelope(cmd as never)).ok).toBe(false);
  });

  it("valget krever stilkilde og avviser dubletter", () => {
    expect(harmonizeBatchSelectionError(s0, [{ assetId, sourceVersionId: source.id }], null, null)).toMatch(/stilprofil/);
    expect(harmonizeBatchSelectionError(s0, [{ assetId, sourceVersionId: source.id }, { assetId, sourceVersionId: source.id }], profileId, null)).toMatch(/to ganger/);
    expect(harmonizeBatchSelectionError(s0, [{ assetId, sourceVersionId: source.id }], profileId, null)).toBe(null);
  });
});

describe("bruksvalg (REQ-0141–0143)", () => {
  it("«bare her» legger bildet i en arkivert variant, så bibliotekets aktive varianter er uendret", () => {
    const p = { assetId, sourceVersionId: source.id, variantId: tid(), versionId: tid(), harmonizationId: tid() };
    const base = harmonizeBatchCommand(s0, p, { media, model: "m" }, { styleProfileId: profileId, referenceVersionId: null, qualityProfile: null });
    const local = { ...base, fields: { ...base.fields, use: "local" as const }, newVariant: { ...base.newVariant, archived: true } };
    const t = mustApply(s0, local as never);
    const active = (s: ProjectState) => Object.values(s.assetVariants).filter((v) => v.assetId === assetId && !v.archived).map((v) => v.id).sort();
    expect(active(t)).toEqual(active(s0));
    expect(t.assetVariants[p.variantId]!.archived).toBe(true);
    // Variant: synlig i biblioteket som ny variant
    const v = mustApply(s0, base as never);
    expect(active(v)).toContain(p.variantId);
    // Publisering er aldri automatisk: resultatet starter som «variant»
    expect(v.styleHarmonizations[p.harmonizationId]!.use).toBe("variant");
  });
});
