/**
 * G-4 punkt 2: felles fold (NFKC, diakritiske tegn, små bokstaver) for klientsøk, og foldMatch som
 * returnerer posisjon i originalteksten. Dekker aksenter, ligaturer, CJK og markering i exploreren.
 */
import { describe, expect, it } from "vitest";
import { foldSearch, foldMatch } from "@/core/search-fold";
import { filterGlobalAssets, EMPTY_GLOBAL_FILTER, type GlobalAsset } from "@/core/library/global";

describe("foldSearch", () => {
  it("fjerner diakritiske tegn og gjør om til små bokstaver", () => {
    expect(foldSearch("Café ÁRBOL piñón")).toBe("cafe arbol pinon");
  });

  it("bruker NFKC: ligaturer og fullbreddetegn foldes", () => {
    expect(foldSearch("ﬁlm")).toBe("film");
    expect(foldSearch("ＦＩＬＭ")).toBe("film"); // fullbredde latinsk
  });

  it("lar CJK-tegn være uendret", () => {
    expect(foldSearch("映画のテスト")).toBe("映画のテスト");
    expect(foldSearch("中文字幕")).toBe("中文字幕");
  });
});

describe("foldMatch", () => {
  it("finner aksentfritt søk i aksentert tekst, med posisjon i originalen", () => {
    const m = foldMatch("En café i Træna", "cafe");
    expect(m).not.toBeNull();
    expect("En café i Træna".slice(m!.index, m!.index + m!.length)).toBe("café");
  });

  it("finner aksentert søk i aksentfri tekst", () => {
    expect(foldMatch("el arbol grande", "árbol")).toEqual({ index: 3, length: 5 });
  });

  it("håndterer ligaturer (foldet lengde ≠ opprinnelig lengde)", () => {
    const m = foldMatch("en ﬁlm om livet", "film");
    expect(m).not.toBeNull();
    expect("en ﬁlm om livet".slice(m!.index, m!.index + m!.length)).toBe("ﬁlm");
  });

  it("gir null ved ikke-treff og ved tom nål", () => {
    expect(foldMatch("heisann", "xyz")).toBeNull();
    expect(foldMatch("heisann", "")).toBeNull();
  });

  it("CJK: delstreng treffer", () => {
    const m = foldMatch("日本語のテキスト", "語の");
    expect(m).toEqual({ index: 2, length: 2 });
  });
});

describe("biblioteksøket bruker felles fold", () => {
  const asset = (name: string): GlobalAsset => ({
    id: "g1",
    workspaceId: "w1",
    kind: "character",
    name,
    description: "",
    categories: [],
    tags: [],
    archived: false,
    revision: 1,
  });

  it("«cafe» treffer ressursen «Café»", () => {
    const hits = filterGlobalAssets([asset("Café Dovre")], { ...EMPTY_GLOBAL_FILTER, query: "cafe" });
    expect(hits).toHaveLength(1);
  });
});
