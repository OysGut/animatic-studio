// @vitest-environment node
/** Sidebryting (ADR-0007, KI-08). Syntetisk tekst. */
import { describe, expect, it } from "vitest";
import { paginate, splitForPageBreak, wrapText, type PaginationScene } from "@/core/screenplay";

const words = (n: number, w = "ord") => Array.from({ length: n }, () => w).join(" ");

function scene(
  id: string,
  blocks: PaginationScene["blocks"],
  number: string | null = "1",
): PaginationScene {
  return { occurrenceId: id, number, headingText: "INT. KJØKKEN - DAG", blocks };
}

describe("wrapText", () => {
  it("bryter grådig ved mellomrom og etter bindestrek, og bevarer manuelle linjeskift", () => {
    expect(wrapText("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("fjøs-dresser er fine", 8)).toEqual(["fjøs-", "dresser", "er fine"]);
    expect(wrapText("Hei!\nHvordan går det?", 35)).toEqual(["Hei!", "Hvordan går det?"]);
    expect(wrapText("\nTekst", 35)).toEqual(["", "Tekst"]);
    expect(wrapText("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
});

describe("splitForPageBreak", () => {
  it("deler bare ved setningsslutt og respekterer minste antall linjer", () => {
    const text = `${words(10)}. ${words(10)}. ${words(10)}.`;
    const r = splitForPageBreak(text, 30, 3, 2, "sentence");
    expect(r).not.toBeNull();
    expect(r!.first.at(-1)!.endsWith(".")).toBe(true);
    expect(splitForPageBreak(words(40), 30, 3, 2, "sentence")).toBeNull();
  });
});

describe("paginate", () => {
  it("54 linjer per side, scenestart registreres og overskrifter står aldri alene nederst", () => {
    const fill = Array.from({ length: 25 }, (_, i) => ({
      id: `a${i}`,
      kind: "action" as const,
      text: "Kort linje.",
    }));
    const r = paginate([
      scene("s1", fill),
      scene("s2", [{ id: "b", kind: "action", text: "Neste scene." }], "2"),
    ]);
    for (const p of r.pages) for (const l of p.lines) expect(l.row).toBeLessThan(54);
    const p1 = r.pages[0]!;
    // Overskrift s2 får ikke plass med minst én linje etter seg på side 2? Sjekk at den aldri er siste linje.
    for (const p of r.pages) expect(p.lines.at(-1)!.kind).not.toBe("heading");
    expect(r.sceneStartPage["s1"]).toBe(1);
    expect(p1.lines[0]!.kind).toBe("heading");
    expect(p1.lines[0]!.sceneNumber).toBe("1");
  });

  it("deler lange replikker med (MORE) og NAVN (CONT'D) i toppmargen", () => {
    const filler = Array.from({ length: 23 }, (_, i) => ({
      id: `a${i}`,
      kind: "action" as const,
      text: "Linje.",
    }));
    const speech = Array.from({ length: 14 }, () => "Dette er en setning.").join(" ");
    const r = paginate([
      scene("s1", [
        ...filler,
        { id: "c", kind: "character", text: "MAJA" },
        { id: "d", kind: "dialogue", text: speech },
      ]),
    ]);
    expect(r.pages.length).toBe(2);
    expect(r.pages[0]!.lines.at(-1)!.kind).toBe("more");
    const top = r.pages[1]!.lines[0]!;
    expect(top).toMatchObject({ kind: "contd", text: "MAJA (CONT'D)", row: -1 });
  });

  it("dropper tomme linjer øverst på en side", () => {
    const filler = Array.from({ length: 26 }, (_, i) => ({
      id: `a${i}`,
      kind: "action" as const,
      text: "Linje.",
    }));
    const r = paginate([
      scene("s1", [...filler, { id: "x", kind: "action", text: "\n\nEtter tomrom." }]),
    ]);
    const last = r.pages.at(-1)!;
    expect(last.lines[0]!.text).toBe("Etter tomrom.");
    expect(last.lines[0]!.row).toBe(0);
  });

  it("låste sider: hint om neste side gir sideskift, men aldri hopp over flere sider", () => {
    const r = paginate([
      scene("s1", [{ id: "a", kind: "action", text: "En." }], "1"),
      { ...scene("s2", [{ id: "b", kind: "action", text: "To." }], "2"), lockedPage: 2 },
      { ...scene("s3", [{ id: "c", kind: "action", text: "Tre." }], "3"), lockedPage: 40 },
    ]);
    expect(r.sceneStartPage).toEqual({ s1: 1, s2: 2, s3: 2 });
  });
});
