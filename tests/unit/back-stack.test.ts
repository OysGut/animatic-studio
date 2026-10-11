// @vitest-environment node
/** «Tilbake til …»: historikken over flatene (DEC-0063, REQ-0587). */
import { describe, expect, it } from "vitest";
import { pageLabel, recordVisit, type Entry } from "@/app/shell/back-stack";

const P = "/prosjekt/abc";
const go = (list: Entry[], href: string, back = false) =>
  recordVisit(list, href.split("?")[0]!, href, back);

describe("tilbake til forrige flate", () => {
  it("nye flater legges på, valg inne i samme flate gir ikke nytt steg", () => {
    let s: Entry[] = [];
    s = go(s, `${P}/manus`);
    s = go(s, `${P}/manus?scene=1`);
    s = go(s, `${P}/bibliotek?asset=x`);
    expect(s.map((e) => e.href)).toEqual([`${P}/manus?scene=1`, `${P}/bibliotek?asset=x`]);
    expect(pageLabel(s.at(-2)!.path)).toBe("Manus");
  });

  it("tilbake fjerner flaten man forlot, også med nettleserens tilbake-knapp", () => {
    let s: Entry[] = [];
    s = go(s, P);
    s = go(s, `${P}/manus`);
    s = go(s, `${P}/scene`);
    s = go(s, `${P}/manus`, true);
    expect(s.map((e) => e.path)).toEqual([P, `${P}/manus`]);
    // Nettleserens tilbake (uten knappen): samme flate som nest øverst
    s = go(s, P);
    expect(s.map((e) => e.path)).toEqual([P]);
  });

  it("navnene på flatene", () => {
    expect(pageLabel("/")).toBe("Prosjekter");
    expect(pageLabel(P)).toBe("Prosjektoversikt");
    expect(pageLabel(`${P}/montering`)).toBe("Montering");
    expect(pageLabel(`${P}/utgivelse`)).toBe("Utgivelse");
  });
});
