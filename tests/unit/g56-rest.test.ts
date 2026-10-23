/** Rest G-5/G-6: adminfelt, rydderegel, lokal karaktertilstand, innstillingsnivå og globalt snapshot i sikkerhetskopi. */
import { describe, expect, it } from "vitest";
import { BYTES_PER_GB, gigabytesText, parseGigabytes, parseLimit, rateLimitError } from "@/core/admin-limits";
import { PRUNE_INTERVAL_MS, pruneDue } from "@/adapters/storage/change-log-prune.server";
import { settingLevelFrom, resolveSettings } from "@/core/settings/resolve";
import { globalAssetIdsOf, makeBackup, parseBackup } from "@/core/backup";
import { localCharacterState, planCharacterPull, pullPlanHasChanges, type CharacterBundle } from "@/core/global/character-bundle";
import { seedProject, mustApply, tid } from "../helpers/fixtures";

describe("G-5 adminfelt", () => {
  it("tomt felt er ingen grense, bare hele tall godtas", () => {
    expect(parseLimit("")).toEqual({ ok: true, value: null });
    expect(parseLimit(" 42 ")).toEqual({ ok: true, value: 42 });
    expect(parseLimit("-1").ok).toBe(false);
    expect(parseLimit("1.5").ok).toBe(false);
    expect(parseLimit("50", { min: 100 }).ok).toBe(false);
  });
  it("lagring i GB lagres i byte og vises tilbake", () => {
    expect(parseGigabytes("2,5")).toEqual({ ok: true, value: Math.round(2.5 * BYTES_PER_GB) });
    expect(parseGigabytes("")).toEqual({ ok: true, value: null });
    expect(parseGigabytes("x").ok).toBe(false);
    expect(gigabytesText(10 * BYTES_PER_GB)).toBe("10");
    expect(gigabytesText(null)).toBe("");
  });
  it("hastighetsgrenser følger databasens grenser", () => {
    expect(rateLimitError({ windowSeconds: 600, perKey: 400, perIp: 800 })).toBe(false);
    expect(rateLimitError({ windowSeconds: 0, perKey: 400, perIp: 800 })).toBe(true);
    expect(rateLimitError({ windowSeconds: 86401, perKey: 1, perIp: 1 })).toBe(true);
    expect(rateLimitError({ windowSeconds: 60, perKey: 0, perIp: 1 })).toBe(true);
  });
});

describe("G-5 rydding fra cron", () => {
  it("kjører første gang og deretter høyst én gang per intervall (20 timer)", () => {
    const now = Date.parse("2026-10-23T12:00:00Z");
    expect(pruneDue(null, now)).toBe(true);
    expect(pruneDue(new Date(now - PRUNE_INTERVAL_MS + 1000).toISOString(), now)).toBe(false);
    expect(pruneDue(new Date(now - PRUNE_INTERVAL_MS).toISOString(), now)).toBe(true);
    expect(PRUNE_INTERVAL_MS).toBe(20 * 60 * 60 * 1000);
    expect(pruneDue("ugyldig", now)).toBe(true);
  });
});

describe("G-6 innstillinger fra arbeidsgruppen", () => {
  it("gyldige verdier arves, ugyldige hoppes over", () => {
    const lvl = settingLevelFrom({ paper: "Letter", currency: "eur", units: "imperial", language: "ja" }, "Asia/Tokyo");
    expect(lvl).toEqual({ paper: "Letter", units: "imperial", language: "ja", timeZone: "Asia/Tokyo" });
    const r = resolveSettings({ workspace: lvl });
    expect(r.paper).toEqual({ value: "Letter", source: "workspace" });
    expect(r.currency.source).toBe("default");
    expect(settingLevelFrom(null, "Ikke/En_Sone")).toEqual({});
  });
});

describe("G-6 lokal karaktertilstand og innhenting", () => {
  it("første innhenting tar inn stemme og tekstversjoner; andre gang er alt oppdatert", () => {
    let s = seedProject(1).state;
    const id = tid<"asset">();
    s = mustApply(s, { type: "CreateAssets", assets: [{ assetId: id, fields: { kind: "character", name: "Mira", names: [], description: "", category: "", tags: [] } }] });
    const local = localCharacterState(s, id)!;
    expect(local.globalBundleNumber).toBeUndefined();
    const latest: CharacterBundle = {
      number: 2,
      voice: null,
      briefVersions: [{ id: tid(), text: "Ten years old", createdAt: "2026-10-23T00:00:00Z" } as never],
      activeBriefId: null,
      mouthSets: [],
      rigSetup: null,
      approvedVersionIds: [],
    };
    const plan = planCharacterPull(local, null, latest);
    expect(plan.briefVersionsToAppend).toHaveLength(1);
    expect(pullPlanHasChanges(plan)).toBe(true);
    expect(planCharacterPull({ ...local, globalBundleNumber: 2 }, latest, latest).upToDate).toBe(true);
    expect(localCharacterState(s, tid<"asset">())).toBeNull();
  });
});

describe("G-6 pkt 4: sikkerhetskopi med snapshot av globale ressurser", () => {
  it("finner globale kilder og tar snapshot med i filen", () => {
    const base: Record<string, unknown> = {
      project: { id: "p" },
      productions: [{ id: "m", kind: "main" }],
      assets: [{ id: "a1", source_global_asset_id: "g2" }, { id: "a2", source_global_asset_id: null }],
      asset_versions: [{ id: "v1", source_global_asset_id: "g1" }, { id: "v2", source_global_asset_id: "g2" }],
    };
    // Øvrige tabeller er tomme
    const rows = new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : []) }) as never;
    expect(globalAssetIdsOf(rows)).toEqual(["g1", "g2"]);
    const snap = [{ globalAssetId: "g2", name: "Mira", kind: "character", description: "", bundle: { number: 3 } }];
    const b = makeBackup({ rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion: 101, createdAt: "2026-10-23T00:00:00Z", include: new Set(), globalSnapshot: snap });
    expect(b.globalSnapshot).toEqual(snap);
    expect(parseBackup(JSON.parse(JSON.stringify(b)), 101).globalSnapshot).toEqual(snap);
    const none = makeBackup({ rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion: 101, createdAt: "x", include: new Set() });
    expect(none.globalSnapshot).toBeUndefined();
  });
});
