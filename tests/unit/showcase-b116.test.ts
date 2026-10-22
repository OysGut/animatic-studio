// @vitest-environment node
/** B-116: utstillingsvindu – modellen i src/core/community/showcase.ts speiler reglene i 0087. */
import { describe, expect, it } from "vitest";
import {
  SHOWCASE_KINDS,
  parseAdminShowcaseQueue,
  parseMyShowcaseItems,
  parseShowcaseComments,
  parseShowcaseFeed,
  showcaseCommentError,
  showcaseDefaultExpires,
  showcaseDisplayStatus,
  showcaseDraftError,
  showcaseMediaKeyValid,
} from "@/core/community";
import { ORPHAN_REFERENCE_TABLES } from "@/adapters/storage/orphan-cleanup.server";
import { showcaseCopyTarget } from "@/adapters/community/showcase.functions";

const P = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-10-22T12:00:00Z");
const base = { kind: "character", title: "Reven", text: "", lineIds: [], hasMedia: true, expiresAt: null };

describe("utkastvalidering (samme regler som create_showcase_item)", () => {
  it("gyldige utkast av hvert slag", () => {
    for (const kind of SHOWCASE_KINDS) {
      const d = kind === "script" ? { ...base, kind, hasMedia: false, lineIds: ["line-1"] } : { ...base, kind };
      expect(showcaseDraftError(d, now)).toBeNull();
    }
    expect(showcaseDraftError({ ...base, expiresAt: showcaseDefaultExpires(now) }, now)).toBeNull();
  });
  it("avviser ukjent slag, tom tittel, for lang tekst og manglende utdrag/media", () => {
    expect(showcaseDraftError({ ...base, kind: "film" }, now)).toBe("showcase.error.kind");
    expect(showcaseDraftError({ ...base, title: "  " }, now)).toBe("showcase.error.title");
    expect(showcaseDraftError({ ...base, title: "x".repeat(201) }, now)).toBe("showcase.error.title");
    expect(showcaseDraftError({ ...base, text: "x".repeat(281) }, now)).toBe("showcase.error.text");
    expect(showcaseDraftError({ ...base, kind: "script", hasMedia: false }, now)).toBe("showcase.error.excerpt");
    expect(showcaseDraftError({ ...base, kind: "script", hasMedia: false, lineIds: Array.from({length:13}, (_, i) => `line-${i}`) }, now)).toBe("showcase.error.excerpt");
    expect(showcaseDraftError({ ...base, hasMedia: false }, now)).toBe("showcase.error.media");
  });
  it("utløp: standard én uke, aldri i fortiden, maks 90 dager", () => {
    expect(Date.parse(showcaseDefaultExpires(now))).toBe(now + 7 * 86_400_000);
    expect(showcaseDraftError({ ...base, expiresAt: new Date(now).toISOString() }, now)).toBe("showcase.error.expires");
    expect(showcaseDraftError({ ...base, expiresAt: new Date(now + 90 * 86_400_000).toISOString() }, now)).toBeNull();
    expect(showcaseDraftError({ ...base, expiresAt: new Date(now + 91 * 86_400_000).toISOString() }, now)).toBe("showcase.error.expires");
    expect(showcaseDraftError({ ...base, expiresAt: "ikke-en-dato" }, now)).toBe("showcase.error.expires");
  });
});

describe("karusell og «Mine delinger»", () => {
  const item = {
    id: "a", kind: "character", title: "Reven", text: "", excerpt: null,
    storage_key: `${P}/shares/showcase/x.png`, mime: "image/png", duration_ms: null,
    width: 100, height: 100, created_at: "2026-10-20T00:00:00Z", author_name: "Anita",
  };
  it("parser bare gyldige rader og dropper ukjente", () => {
    const feed = parseShowcaseFeed([item, { id: "b", kind: "film", title: "x" }, null, 42]);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ id: "a", kind: "character", authorName: "Anita", url: null });
    expect(parseShowcaseFeed("x")).toEqual([]);
  });
  it("status: utløpt regnes fra tiden, ukjente statuser vises som ventende", () => {
    expect(showcaseDisplayStatus({ status: "live", expiresAt: "2026-10-21T00:00:00Z" }, now)).toBe("expired");
    expect(showcaseDisplayStatus({ status: "live", expiresAt: "2026-10-23T00:00:00Z" }, now)).toBe("live");
    expect(showcaseDisplayStatus({ status: "revoked", expiresAt: null }, now)).toBe("revoked");
    expect(showcaseDisplayStatus({ status: "rejected", expiresAt: null }, now)).toBe("rejected");
    expect(showcaseDisplayStatus({ status: "hva", expiresAt: null }, now)).toBe("pending");
  });
  it("mine delinger tåler alle statuser", () => {
    const rows = ["pending", "live", "rejected", "revoked"].map((status, i) => ({
      ...item, id: String(i), status, project_id: P, project_name: "Filmen", expires_at: null,
    }));
    const mine = parseMyShowcaseItems(rows, now);
    expect(mine.map((m) => m.status)).toEqual(["pending", "live", "rejected", "revoked"]);
    expect(mine[0]).toMatchObject({ projectId: P, projectName: "Filmen" });
  });
});

describe("kommentarer og rapportering", () => {
  it("kommentaren er 1–2000 tegn", () => {
    expect(showcaseCommentError("Fint!")).toBeNull();
    expect(showcaseCommentError(" ")).toBe("showcase.error.comment");
    expect(showcaseCommentError("x".repeat(2001))).toBe("showcase.error.comment");
  });
  it("parser kommentarer med eier-flagg, dropper ugyldige", () => {
    const c = parseShowcaseComments([
      { id: "1", text: "Hei", created_at: "2026-10-22T00:00:00Z", author_name: "Bo", mine: true },
      { id: 2, text: "x" },
    ]);
    expect(c).toEqual([{ id: "1", text: "Hei", createdAt: "2026-10-22T00:00:00Z", authorName: "Bo", mine: true }]);
  });
});

describe("admin og filnøkler", () => {
  it("køen: standard er godkjenningskrav på, ukjent svar gir tom kø", () => {
    expect(parseAdminShowcaseQueue(null)).toEqual({ requireApproval: true, items: [] });
    const q = parseAdminShowcaseQueue({ require_approval: false, items: [{ id: "a", kind: "audio", title: "Lyd", project_name: "F" }] });
    expect(q.requireApproval).toBe(false);
    expect(q.items[0]).toMatchObject({ id: "a", kind: "audio", projectName: "F" });
  });
  it("bidragsfiler ligger alltid under <prosjekt>/shares/", () => {
    expect(showcaseMediaKeyValid(P, `${P}/shares/showcase/a.png`)).toBe(true);
    expect(showcaseMediaKeyValid(P, `${P}/source/a.png`)).toBe(false);
    expect(showcaseMediaKeyValid(P, `${P}/shares/../x.png`)).toBe(false);
    expect(showcaseCopyTarget(P, `${P}/shares/showcase/a.png`)).toBe(`${P}/shares/showcase/a.png`);
    expect(showcaseCopyTarget(P, `${P}/source/a.png`)).toBeNull();
  });
});

it("reservasjoner er med i filreferansekontrollen", () => {
  expect(ORPHAN_REFERENCE_TABLES).toContain("showcase_reservations");
});
it("beskrivelse tillater 280 tegn og avviser 281", () => {
  expect(showcaseDraftError({...base, text: "x".repeat(280)}, now)).toBeNull();
  expect(showcaseDraftError({...base, text: "x".repeat(281)}, now)).toBe("showcase.error.text");
});
it("12 ulike replikker tillates, duplikater og 13 avvises", () => {
  const draft = {...base, kind:"script", hasMedia:false, lineIds:Array.from({length:12},(_,i)=>String(i))};
  expect(showcaseDraftError(draft, now)).toBeNull();
  expect(showcaseDraftError({...draft,lineIds:[...draft.lineIds,"13"]},now)).toBe("showcase.error.excerpt");
  expect(showcaseDraftError({...draft,lineIds:["a","a"]},now)).toBe("showcase.error.excerpt");
});
