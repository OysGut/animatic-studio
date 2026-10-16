// @vitest-environment node
/** Fase 2, bolk A (DEC-0090): mobilbroens regler og opplastingskøen på mobilen. */
import { describe, expect, it } from "vitest";
import {
  MOBILE_VIDEO_MAX_BYTES,
  checkMobileFile,
  cleanContributorName,
  mediaKindOf,
  mediaKindsFor,
  mobileFilePath,
  parseUploadContext,
  sniffMatches,
  targetAssetOf,
} from "@/core";
import { UploadQueue, Uploader, type UploadApi } from "@/app/mobile/upload-queue";

const U1 = "00000000-0000-7000-8000-000000000101";
const U2 = "00000000-0000-7000-8000-000000000102";
const bytes = (...xs: (number | string)[]) => {
  const out: number[] = [];
  for (const x of xs) {
    if (typeof x === "string") out.push(...[...x].map((c) => c.charCodeAt(0)));
    else out.push(x);
  }
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
};

describe("filtyper og grenser", () => {
  it("kjenner igjen bilder, video og lyd", () => {
    expect(mediaKindOf("image/jpeg")).toBe("image");
    expect(mediaKindOf("video/quicktime")).toBe("video");
    expect(mediaKindOf("audio/mp4; codecs=mp4a")).toBe("audio");
    expect(mediaKindOf("application/pdf")).toBeNull();
    expect(mediaKindOf("image/heic")).toBeNull();
  });

  it("video over 500 MB avvises (grensen fjernes i desktopversjonen)", () => {
    expect(checkMobileFile("video/mp4", MOBILE_VIDEO_MAX_BYTES, ["video"])).toBeNull();
    expect(checkMobileFile("video/mp4", MOBILE_VIDEO_MAX_BYTES + 1, ["video"])).toMatch(/500 MB/);
    expect(checkMobileFile("video/mp4", 10, ["image"])).toMatch(/video/i);
    expect(checkMobileFile("image/png", 0, ["image"])).toMatch(/tom|empty/i);
  });

  it("filinnholdet må stemme med filtypen", () => {
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, "PNG"))).toBe(true);
    expect(sniffMatches("image/png", bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(sniffMatches("image/webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(sniffMatches("video/mp4", bytes(0, 0, 0, 0x20, "ftypisom"))).toBe(true);
    expect(sniffMatches("video/quicktime", bytes(0, 0, 0, 0x14, "ftypqt  "))).toBe(true);
    expect(sniffMatches("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
    expect(sniffMatches("audio/wav", bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe(true);
    expect(sniffMatches("audio/mpeg", bytes("ID3"))).toBe(true);
    expect(sniffMatches("image/jpeg", bytes("<html>"))).toBe(false);
  });
});

describe("kontekst og lagringssti", () => {
  it("bare kjente felt og gyldige ID-er godtas", () => {
    expect(parseUploadContext({ type: "project", extra: 1 })).toEqual({ type: "project" });
    expect(parseUploadContext({ type: "asset", assetId: U1 })).toEqual({
      type: "asset",
      assetId: U1,
    });
    expect(parseUploadContext({ type: "asset", assetId: "x" })).toBeNull();
    expect(parseUploadContext({ type: "asset", assetId: U1, variantId: "nei" })).toBeNull();
    expect(parseUploadContext({ type: "occurrence", occurrenceId: U2 })).toEqual({
      type: "occurrence",
      occurrenceId: U2,
    });
    expect(parseUploadContext({ type: "draft", draftKey: U1, assetKind: "character" })).toEqual({
      type: "draft",
      draftKey: U1,
      assetKind: "character",
    });
    expect(parseUploadContext({ type: "hack" })).toBeNull();
    expect(parseUploadContext(null)).toBeNull();
  });

  it("hver kontekst sier hvor bildene skal (og ulike scener gir ulike mål)", () => {
    expect(targetAssetOf({ type: "asset", assetId: U1 })).toEqual({ assetId: U1 });
    expect(targetAssetOf({ type: "layer", layerId: U2, assetId: U1, variantId: U2 })).toEqual({
      assetId: U1,
      variantId: U2,
    });
    expect(targetAssetOf({ type: "draft", draftKey: U1 })).toBeNull();
    expect(targetAssetOf({ type: "draft", draftKey: U1 }, U2)).toEqual({ assetId: U2 });
    expect(targetAssetOf({ type: "occurrence", occurrenceId: U1 })).toBeNull();
    expect(mediaKindsFor({ type: "asset", assetId: U1 })).toEqual(["image", "video"]);
    expect(mediaKindsFor({ type: "occurrence", occurrenceId: U1 })).toContain("audio");
  });

  it("stien ligger under prosjektets source/mobile", () => {
    expect(mobileFilePath(U1, U2, U1, "image/jpeg")).toBe(`${U1}/source/mobile/${U2}/${U1}.jpg`);
    expect(mobileFilePath(U1, U2, U1, "video/quicktime")).toMatch(/\.mov$/);
  });

  it("navnet fra en bidragsyter renses", () => {
    expect(cleanContributorName("  Kari\u0000 Nordmann\n ")).toBe("Kari Nordmann");
    expect(cleanContributorName(42)).toBe("");
    expect(cleanContributorName("x".repeat(300))).toHaveLength(100);
  });
});

describe("opplastingskøen på mobilen", () => {
  const blob = (n = 4) => new Blob([new Uint8Array(n)], { type: "image/jpeg" });
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it("sender filene, og en fil som allerede er mottatt, lastes ikke opp igjen", async () => {
    const q = new UploadQueue("t");
    const puts: string[] = [];
    const api: UploadApi = {
      ticket: async (it) =>
        it.name === "gammel.jpg"
          ? { ok: true, message: "", path: "p", done: true }
          : { ok: true, message: "", path: `p/${it.id}`, uploadToken: "tok" },
      put: async (path) => {
        puts.push(path);
        return null;
      },
      confirm: async () => ({ ok: true, message: "" }),
    };
    const up = new Uploader(q, api);
    q.add(blob(), "a.jpg");
    q.add(blob(), "gammel.jpg");
    q.add(blob(), "b.jpg");
    up.pump();
    await settle();
    expect(q.list().every((x) => x.status === "sent")).toBe(true);
    expect(puts).toHaveLength(2);
    expect(q.unsent()).toBe(0);
  });

  it("avvist fil merkes som feilet og kan prøves igjen", async () => {
    const q = new UploadQueue("t");
    let refuse = true;
    const api: UploadApi = {
      ticket: async () => ({ ok: true, message: "", path: "p", uploadToken: "tok" }),
      put: async () => null,
      confirm: async () =>
        refuse ? { ok: false, message: "Feil filtype" } : { ok: true, message: "" },
    };
    const up = new Uploader(q, api);
    const it = q.add(blob(), "x.jpg");
    up.pump();
    await settle();
    expect(q.list()[0]!.status).toBe("failed");
    expect(q.list()[0]!.error).toBe("Feil filtype");
    refuse = false;
    up.retry(it.id);
    await settle();
    expect(q.list()[0]!.status).toBe("sent");
  });
});
