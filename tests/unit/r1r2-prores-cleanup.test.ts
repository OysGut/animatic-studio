// @vitest-environment node
/** R1 («Endelig» foreslår ProRes) og R2 (opprydding av foreldreløse AI-filer, valg C). Ingen ekte lagring. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommand, defaultQualityProfiles, proresOfferProfile, proresSpecOf, type Command, type ProjectState } from "@/core";
import { collectProjectPaths, isOrphanAiFile, ORPHAN_MIN_AGE_MS, protectedFolders } from "@/core/generation/orphan-files";
import { envelope, seedProject, tid } from "../helpers/fixtures";

const h = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@tanstack/react-start", async () => {
  const { serverFnStub } = await import("../helpers/verifisering3-db");
  return { createServerFn: serverFnStub() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return h.admin; } }));
import { previewOrphanCleanup, confirmOrphanCleanup } from "@/adapters/ai/orphan-cleanup.functions";

function apply(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r;
}

describe("R1 ProRes i «Endelig»", () => {
  it("nye prosjekters standardprofil «Endelig» foreslår ProRes", () => {
    expect(defaultQualityProfiles().find((p) => p.name === "Endelig")?.spec.export?.format).toBe("prores");
  });
  it("eksisterende «Endelig» med MP4 får tilbud; godtatt tilbud kan angres og gjøres om", () => {
    const id = tid<"quality_profile">();
    let s = apply(seedProject(0).state, { type: "AddQualityProfile", profileId: id, name: "Endelig", spec: { effort: "premium", export: { format: "mp4", bitrateKbps: 16000, alpha: "straight" } } }).state;
    expect(proresOfferProfile(s)?.id).toBe(id);
    const offer = proresOfferProfile(s)!;
    const r = apply(s, { type: "UpdateQualityProfile", profileId: id, spec: proresSpecOf(offer.spec) });
    s = r.state;
    expect(s.qualityProfiles[id]!.spec.export).toEqual({ format: "prores", alpha: "straight" });
    expect(s.qualityProfiles[id]!.spec.effort).toBe("premium");
    expect(proresOfferProfile(s)).toBeNull();
    const undone = apply(s, r.inverse);
    expect(undone.state.qualityProfiles[id]!.spec.export).toEqual({ format: "mp4", bitrateKbps: 16000, alpha: "straight" });
    expect(apply(undone.state, undone.inverse).state.qualityProfiles[id]!.spec.export?.format).toBe("prores");
  });
  it("ingen tilbud for profiler brukeren har valgt noe annet i, eller med annet navn", () => {
    let s = seedProject(0).state;
    s = apply(s, { type: "AddQualityProfile", profileId: tid(), name: "Endelig", spec: { export: { format: "png-seq" } } }).state;
    s = apply(s, { type: "AddQualityProfile", profileId: tid(), name: "Final", spec: { export: { format: "mp4" } } }).state;
    expect(proresOfferProfile(s)).toBeNull();
  });
});

const P = "00000000-0000-7000-8000-000000006701";
const OTHER = "00000000-0000-7000-8000-000000006702";
const USER = "00000000-0000-7000-8000-000000006703";
const NOW = Date.parse("2026-10-21T12:00:00Z");
const OLD = new Date(NOW - ORPHAN_MIN_AGE_MS - 1000).toISOString();

describe("R2 regler", () => {
  const prot = new Set<string>();
  it("bare gamle filer i prosjektets generated-mappe", () => {
    const f = protectedFolders(prot);
    expect(isOrphanAiFile(P, { path: `${P}/generated/a/v/ai.png`, createdAt: OLD }, prot, f, NOW)).toBe(true);
    expect(isOrphanAiFile(P, { path: `${P}/source/a/v/upload.png`, createdAt: OLD }, prot, f, NOW)).toBe(false);
    expect(isOrphanAiFile(P, { path: `${P}/temp/ai-source/x.mp4`, createdAt: OLD }, prot, f, NOW)).toBe(false);
    expect(isOrphanAiFile(P, { path: `${OTHER}/generated/a/v/ai.png`, createdAt: OLD }, prot, f, NOW)).toBe(false);
    expect(isOrphanAiFile(P, { path: `global/w/a/ai.png`, createdAt: OLD }, prot, f, NOW)).toBe(false);
    expect(isOrphanAiFile(P, { path: `${P}/generated/../source/x.png`, createdAt: OLD }, prot, f, NOW)).toBe(false);
    expect(isOrphanAiFile(P, { path: `${P}/generated/a/v/ai.png`, createdAt: new Date(NOW - 3600_000).toISOString() }, prot, f, NOW)).toBe(false);
    expect(isOrphanAiFile(P, { path: `${P}/generated/a/v/ai.png`, createdAt: null }, prot, f, NOW)).toBe(false);
  });
  it("stier i tekst og JSON beskytter filen og mappen dens", () => {
    const paths = new Set<string>();
    collectProjectPaths(P, { command: { type: "X", url: `https://x/obj/${P}/generated/a/v/ai.png?token=1` }, list: [`${P}/generated/films/t/film.mp4`] }, paths);
    expect([...paths].sort()).toEqual([`${P}/generated/a/v/ai.png`, `${P}/generated/films/t/film.mp4`]);
    const f = protectedFolders(paths);
    expect(isOrphanAiFile(P, { path: `${P}/generated/films/t/last-frame.png`, createdAt: OLD }, paths, f, NOW)).toBe(false);
    expect(isOrphanAiFile(P, { path: `${P}/generated/a/v2/ai.png`, createdAt: OLD }, paths, f, NOW)).toBe(true);
  });
});

type Row = Record<string, unknown>;
function setup(opts: { role?: string; tables?: Record<string, Row[]>; files?: { name: string; created_at: string; size: number }[] } = {}) {
  const tables: Record<string, Row[]> = opts.tables ?? {};
  const removed = vi.fn(async (_paths: string[]) => ({ error: null }));
  const inserts: { table: string; row: Row }[] = [];
  const files = opts.files ?? [{ name: "ai.png", created_at: OLD, size: 1_000_000 }, { name: "keep.png", created_at: OLD, size: 5 }];
  const user = { from: () => {
    const q = { select: () => q, eq: () => q, is: () => q, maybeSingle: async () => ({ data: { role: opts.role ?? "owner" }, error: null }) };
    return q;
  } };
  h.admin = {
    from: (table: string) => {
      const q = { select: () => q, eq: () => q, order: () => q, range: async () => ({ data: tables[table] ?? [], error: null }), insert: async (row: Row) => { inserts.push({ table, row }); return { error: null }; } };
      return q;
    },
    storage: { from: () => ({
      remove: removed,
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })), error: null }),
      list: async (folder: string) => {
        if (folder === `${P}/generated`) return { data: [{ id: null, name: "a", created_at: null }], error: null };
        if (folder === `${P}/generated/a`) return { data: [{ id: null, name: "v1", created_at: null }, { id: null, name: "v2", created_at: null }], error: null };
        if (folder === `${P}/generated/a/v1`) return { data: [{ id: "f1", name: files[0]!.name, created_at: files[0]!.created_at, metadata: { size: files[0]!.size, mimetype: "image/png" } }], error: null };
        if (folder === `${P}/generated/a/v2`) return { data: [{ id: "f2", name: files[1]!.name, created_at: files[1]!.created_at, metadata: { size: files[1]!.size, mimetype: "image/png" } }], error: null };
        return { data: [], error: null };
      },
    }) },
  };
  const context = { supabase: user, userId: USER };
  type Call = (input: { data: unknown; context: unknown }) => Promise<unknown>;
  return {
    tables, removed, inserts,
    preview: () => (previewOrphanCleanup as unknown as Call)({ data: { projectId: P }, context }) as Promise<{ files: { path: string; thumbUrl: string | null }[]; totalBytes: number }>,
    confirm: (paths: string[], confirmed = true) => (confirmOrphanCleanup as unknown as Call)({ data: { projectId: P, paths, confirmed }, context }) as Promise<{ deleted: number; skipped: number }>,
  };
}
const ORPHAN = `${P}/generated/a/v1/ai.png`;
const KEPT = `${P}/generated/a/v2/keep.png`;

describe("R2 server", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  it("forhåndsvisning sletter ingenting, gir antall, størrelse og miniatyrer; versjoner (også fjernede) beskytter", async () => {
    const s = setup({ tables: { asset_versions: [{ id: "v2", removed: true, media_path: KEPT }] } });
    const r = await s.preview();
    expect(r.files.map((f) => f.path)).toEqual([ORPHAN]);
    expect(r.totalBytes).toBe(1_000_000);
    expect(r.files[0]!.thumbUrl).toContain(ORPHAN);
    expect(s.removed).not.toHaveBeenCalled();
  });
  it("bare eieren", async () => {
    await expect(setup({ role: "editor" }).preview()).rejects.toThrow();
    await expect(setup({ role: "editor" }).confirm([ORPHAN])).rejects.toThrow();
  });
  it("angrehistorikken beskytter (kommando eller invers), jobber gjør det ikke", async () => {
    const s = setup({ tables: { change_log: [{ id: "c", command: { type: "X" }, inverse: { path: ORPHAN } }], generation_jobs: [{ id: "j", status: "done", result_path: KEPT }] } });
    expect((await s.preview()).files.map((f) => f.path)).toEqual([KEPT]);
  });
  it("en jobb eller massejobb som ikke er ferdig, sperrer alt", async () => {
    expect((await setup({ tables: { generation_jobs: [{ id: "j", status: "running" }] } }).preview()).files).toEqual([]);
    expect((await setup({ tables: { harmonize_batch_items: [{ id: "i", status: "ready" }] } }).preview()).files).toEqual([]);
    expect((await setup({ tables: { dialogue_batches: [{ id: "b", status: "paused" }] } }).preview()).files).toEqual([]);
  });
  it("filer nyere enn 24 timer vises ikke", async () => {
    const fresh = new Date(NOW - 60_000).toISOString();
    expect((await setup({ files: [{ name: "ai.png", created_at: fresh, size: 1 }, { name: "keep.png", created_at: fresh, size: 1 }] }).preview()).files).toEqual([]);
  });
  it("ingen sletting uten bekreftelse; ny beregning sletter bare filer som fortsatt er foreldreløse, og logger", async () => {
    const s = setup();
    await expect(s.confirm([ORPHAN, KEPT], false)).rejects.toThrow();
    expect(s.removed).not.toHaveBeenCalled();
    s.tables["posters"] = [{ id: "p", image_path: KEPT }];
    const r = await s.confirm([ORPHAN, KEPT, `${P}/source/a/v/upload.png`]);
    expect(s.removed).toHaveBeenCalledWith([ORPHAN]);
    expect(r).toMatchObject({ deleted: 1, skipped: 2 });
    expect(s.inserts).toEqual([{ table: "storage_cleanups", row: expect.objectContaining({ project_id: P, actor: USER, file_count: 1, skipped_count: 2, total_bytes: 1_000_000, paths: [ORPHAN] }) }]);
  });
});
