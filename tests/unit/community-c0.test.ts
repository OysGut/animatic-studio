// @vitest-environment node
/** B-114 C0: modellen i src/core/community speiler databasereglene i 0080. */
import { describe, expect, it } from "vitest";
import {
  FEATURE_KEYS, assetRightsValid, canComment, commentError, effectiveAssetRights, featureEnabled, handleValid,
  normalizeHandle, parseMyFeatures, publicationError, publicationMediaKeyValid, publicationOpen,
  DEFAULT_PUBLICATION_RIGHTS,
} from "@/core/community";

const P = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-10-22T12:00:00Z");

describe("funksjonsbrytere", () => {
  it("har de fem nøklene fra start", () => {
    expect([...FEATURE_KEYS]).toEqual(["community.sharing", "community.review", "community.abtest", "community.profiles", "community.public"]);
  });
  it("av gir ingen, beta bare innloggede testere, på alle", () => {
    expect(featureEnabled("off", true, true)).toBe(false);
    expect(featureEnabled("beta", true, false)).toBe(false);
    expect(featureEnabled("beta", false, true)).toBe(false);
    expect(featureEnabled("beta", true, true)).toBe(true);
    expect(featureEnabled("on", false, false)).toBe(true);
  });
  it("my_features: alt som mangler eller er ukjent, er av", () => {
    const f = parseMyFeatures({ "community.review": true, "community.sharing": "yes", "other.x": true });
    expect(f["community.review"]).toBe(true);
    expect(f["community.sharing"]).toBe(false);
    expect(Object.keys(f)).toHaveLength(5);
    expect(parseMyFeatures(null)["community.public"]).toBe(false);
  });
});

describe("publiseringer", () => {
  const base = { status: "live" as const, publishAt: null, expiresAt: null };
  it("utkast, lukket og tilbaketrukket er aldri åpne", () => {
    for (const status of ["draft", "closed", "revoked"] as const) expect(publicationOpen({ ...base, status }, now)).toBe(false);
  });
  it("planlagt slipp og utløp følger tiden", () => {
    expect(publicationOpen({ ...base, status: "scheduled", publishAt: "2026-10-23T00:00:00Z" }, now)).toBe(false);
    expect(publicationOpen({ ...base, status: "scheduled", publishAt: "2026-10-21T00:00:00Z" }, now)).toBe(true);
    expect(publicationOpen({ ...base, expiresAt: "2026-10-22T12:00:00Z" }, now)).toBe(false);
    expect(publicationOpen({ ...base, expiresAt: "2026-10-22T12:00:01Z" }, now)).toBe(true);
  });
  it("validerer omfang, publikum, tittel og tidsvindu", () => {
    const d = { scopeKind: "range", audience: "selected", title: "Scene 4", description: "", publishAt: null, expiresAt: null };
    expect(publicationError(d)).toBeNull();
    expect(publicationError({ ...d, scopeKind: "scene" })).toBe("community.error.scope");
    expect(publicationError({ ...d, audience: "everyone" })).toBe("community.error.audience");
    expect(publicationError({ ...d, title: "  " })).toBe("community.error.title");
    expect(publicationError({ ...d, publishAt: "2026-10-23T00:00:00Z", expiresAt: "2026-10-22T00:00:00Z" })).toBe("community.error.window");
  });
  it("standard rettighet er bare visning", () => {
    expect(DEFAULT_PUBLICATION_RIGHTS).toEqual({ view: true, comment: false, download: false, remix: false });
  });
  it("mediefiler ligger under <prosjekt>/shares/", () => {
    expect(publicationMediaKeyValid(P, `${P}/shares/a/film.mp4`)).toBe(true);
    expect(publicationMediaKeyValid(P, `${P}/source/x.png`)).toBe(false);
    expect(publicationMediaKeyValid(P, `${P}/shares/../source/x.png`)).toBe(false);
    expect(publicationMediaKeyValid(P, `22222222-2222-4222-8222-222222222222/shares/x.mp4`)).toBe(false);
  });
});

describe("tidskodede kommentarer", () => {
  const c = { atMs: 1200, frame: 30, region: null, category: "timing", text: "For kort pause" };
  it("gyldig kommentar", () => expect(commentError(c)).toBeNull());
  it("avviser negativ tid, ukjent kategori, tom tekst og region utenfor bildet", () => {
    expect(commentError({ ...c, atMs: -1 })).toBe("community.error.time");
    expect(commentError({ ...c, category: "x" })).toBe("community.error.category");
    expect(commentError({ ...c, text: " " })).toBe("community.error.text");
    expect(commentError({ ...c, region: { x: 0.8, y: 0, width: 0.5, height: 0.1 } })).toBe("community.error.region");
  });
  it("kommentar krever comment-rettighet eller redaktør, aldri når blokkert", () => {
    const r = DEFAULT_PUBLICATION_RIGHTS;
    expect(canComment({ isEditor: false, canSee: true, rights: r, blocked: false })).toBe(false);
    expect(canComment({ isEditor: false, canSee: true, rights: { ...r, comment: true }, blocked: false })).toBe(true);
    expect(canComment({ isEditor: true, canSee: true, rights: r, blocked: false })).toBe(true);
    expect(canComment({ isEditor: false, canSee: true, rights: { ...r, comment: true }, blocked: true })).toBe(false);
    expect(canComment({ isEditor: true, canSee: false, rights: r, blocked: false })).toBe(false);
  });
});

describe("profil og rettigheter", () => {
  it("handle følger ^[a-z0-9_]{3,30}$", () => {
    expect(handleValid("anita_k")).toBe(true);
    expect(handleValid("ab")).toBe(false);
    expect(handleValid("Anita")).toBe(false);
    expect(handleValid("a".repeat(31))).toBe(false);
    expect(normalizeHandle(" @Anita_K ")).toBe("anita_k");
  });
  it("null rettigheter betyr alt forbeholdt", () => {
    expect(assetRightsValid(null)).toBe(true);
    expect(effectiveAssetRights(null)).toEqual({ shareable: false, adaptable: false });
    expect(effectiveAssetRights({ license: "CC BY 4.0", shareable: true })).toEqual({ shareable: true, adaptable: false });
  });
  it("avviser ukjente felt og feil typer", () => {
    expect(assetRightsValid({ license: "CC0", shareable: true })).toBe(true);
    expect(assetRightsValid({ owner: "x" })).toBe(false);
    expect(assetRightsValid({ shareable: "ja" })).toBe(false);
    expect(assetRightsValid({ license: "x".repeat(501) })).toBe(false);
    expect(assetRightsValid([])).toBe(false);
  });
});

import { toRow } from "@/core/patch";
import { shareKeyAllowed, PUBLICATION_SIGNED_SECONDS } from "@/adapters/community/publication.functions";
import { ORPHAN_REFERENCE_TABLES } from "@/adapters/storage/orphan-cleanup.server";

describe("C0: rettigheter, delingsfiler og opprydding", () => {
  it("rettighetene på en versjon skrives til raden; mangler = null (privat)", () => {
    const base = { id: "v", variantId: "a", number: 1, mediaPath: "p/o.png", mimeType: "image/png", byteSize: 1, sha256: "x", createdAt: "2026-01-01", createdBy: "u", revision: 1 } as never;
    expect(toRow("assetVersions" as never, base, "p")["rights"]).toBeNull();
    const withRights = { ...(base as object), rights: { license: "CC BY 4.0", shareable: true } } as never;
    expect(toRow("assetVersions" as never, withRights, "p")["rights"]).toEqual({ license: "CC BY 4.0", shareable: true });
  });
  it("bare filer under <prosjekt>/shares/ signeres, og lenkene varer 600 sekunder", () => {
    const p = "11111111-1111-7111-8111-111111111111";
    expect(shareKeyAllowed(`${p}/shares/x/film.mp4`)).toBe(true);
    expect(shareKeyAllowed(`${p}/source/film.mp4`)).toBe(false);
    expect(shareKeyAllowed(`${p}/shares/../film.mp4`)).toBe(false);
    expect(PUBLICATION_SIGNED_SECONDS).toBe(600);
  });
  it("publication_media er med i oppryddingens referansetabeller (regel 36)", () => {
    expect(ORPHAN_REFERENCE_TABLES).toContain("publication_media");
  });
});
