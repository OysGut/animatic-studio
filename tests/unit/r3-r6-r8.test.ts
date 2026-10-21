// @vitest-environment node
import { describe, expect, it } from "vitest";
import { latestGlobalVersions, withdrawnInUse, linkedGlobalVariant, type GlobalVersion, type ProjectState } from "@/core";
import { t } from "@/core/i18n/keyed";
import { checkMobileFile, maxBytesFor, MOBILE_VIDEO_MAX_BYTES, videoMaxBytes } from "@/core/mobile";
// @ts-expect-error -- .mjs uten typer
import { coverageReport } from "../../scripts/i18n/release-check.mjs";

const gv = (id: string, number: number, withdrawn = false): GlobalVersion => ({
  id, variantId: "gvar", assetId: "gasset", number, storageKey: `k/${id}`, mimeType: "image/png", width: 1, height: 1,
  byteSize: 1, sha256: id.padEnd(64, "0"), durationMs: null, note: "", createdAt: "2026-10-20T00:00:00Z", withdrawn,
});

const state = {
  assetVariants: { pv: { id: "pv", assetId: "pa" } },
  assetVersions: {
    copy: { id: "copy", variantId: "pv", removed: false, globalSource: { assetId: "gasset", variantId: "gvar", versionId: "g3" } },
  },
} as unknown as ProjectState;

describe("R3: tilbaketrukne globale versjoner", () => {
  it("en tilbaketrukket versjon tilbys ikke for ny bruk; forrige versjon er gjeldende", () => {
    expect(latestGlobalVersions([gv("g2", 2), gv("g3", 3, true)]).get("gvar")?.id).toBe("g2");
  });
  it("«gjør om» (ikke tilbaketrukket) gjør versjonen gjeldende igjen", () => {
    expect(latestGlobalVersions([gv("g2", 2), gv("g3", 3)]).get("gvar")?.id).toBe("g3");
  });
  it("prosjekter som bruker en tilbaketrukket versjon, får bare et varsel om sin egen kopi", () => {
    const bundles = [{ versions: [gv("g3", 3, true)] }] as never;
    const hits = withdrawnInUse(state, bundles);
    expect(hits.map((h) => [h.projectVersionId, h.projectAssetId, h.version.number])).toEqual([["copy", "pa", 3]]);
    expect(state.assetVersions["copy" as never]).toMatchObject({ removed: false });
  });
  it("ingen varsel når versjonen ikke er trukket tilbake", () => {
    expect(withdrawnInUse(state, [{ versions: [gv("g3", 3)] }] as never)).toEqual([]);
  });
  it("prosjektvarianten er koblet til den globale varianten den er kopiert fra", () => {
    expect(linkedGlobalVariant(state, "pv", "gasset")).toBe("gvar");
    expect(linkedGlobalVariant(state, "pv", "annen")).toBeNull();
  });
});

describe("R6: plattformnavn og videogrense", () => {
  it("releasekontrollen stopper «Lovable» i brukertekster på begge språk", () => {
    const ok = coverageReport({ nb: { a: { text: "Innebygd AI" } }, en: { a: { text: "Built-in AI" } } });
    expect(ok.complete).toBe(true);
    const bad = coverageReport({ nb: { a: { text: "Innebygd AI" } }, en: { a: { text: "Lovable AI" } } });
    expect(bad.complete).toBe(false);
    expect(bad.problems.map((p: { problem: string }) => p.problem).join()).toMatch(/Lovable/);
  });
  it("de rettede tekstene nevner ikke plattformen på nb og en", () => {
    for (const lang of ["nb", "en"] as const) {
      for (const k of ["r6-brand.builtin-provider", "r6-brand.text-model", "r6-brand.provider-detail", "r6-brand.download-blocked"])
        expect(t(k, {}, lang)).not.toMatch(/lovable|Animatic Studio-arbeidsområdet|in Animatic Studio\./i);
      expect(t("r6-brand.cron-warning", { CRON_STALE_MINUTES: "10" }, lang)).toMatch(lang === "nb" ? /satt opp på serveren/ : /set up on the server/);
    }
  });
  it("500 MB-grensen gjelder bare nettversjonen", () => {
    expect(videoMaxBytes("web")).toBe(500 * 1024 * 1024);
    expect(videoMaxBytes("desktop")).toBeNull();
    expect(maxBytesFor("video", "desktop")).toBe(Number.POSITIVE_INFINITY);
    expect(checkMobileFile("video/mp4", MOBILE_VIDEO_MAX_BYTES + 1, ["video"], "web")).toMatch(/500 MB/);
    expect(checkMobileFile("video/mp4", 4 * 1024 ** 3, ["video"], "desktop")).toBeNull();
    expect(checkMobileFile("video/mp4", MOBILE_VIDEO_MAX_BYTES + 1, ["video"])).toMatch(/500 MB/);
  });
});

describe("R8: språknøytral import av oversatt manus", () => {
  it("knappen og målspråket på nb og en", () => {
    expect(t("r8-translation-import.button", {}, "nb")).toBe("Importer oversatt manus …");
    expect(t("r8-translation-import.target", { language: "Tysk", tag: "de" }, "nb")).toBe("Målspråk: Tysk (de)");
    expect(t("r8-translation-import.button", {}, "en")).toBe("Import translated script …");
    expect(t("r8-translation-import.target", { language: "German", tag: "de" }, "en")).toBe("Target language: German (de)");
  });
});
