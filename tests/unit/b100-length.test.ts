import { describe, expect, it } from "vitest";
import { followRangeLength, followWindowLength } from "@/core/animation/time-format";

describe("B-100: lengden følger omtiming", () => {
  it("vindu over hele scenen utvides når scenen blir lengre", () => {
    expect(followWindowLength({ from: 0, span: 120 }, 120, 180)).toEqual({ from: 0, span: 180 });
  });
  it("vindu over hele scenen krymper når scenen blir kortere", () => {
    expect(followWindowLength({ from: 0, span: 120 }, 120, 60)).toEqual({ from: 0, span: 60 });
  });
  it("innzoomet vindu beholdes, men klemmes", () => {
    expect(followWindowLength({ from: 20, span: 40 }, 120, 180)).toEqual({ from: 20, span: 40 });
    expect(followWindowLength({ from: 80, span: 40 }, 120, 100)).toEqual({ from: 60, span: 40 });
  });
  it("avspillingsområde til gammel slutt følger ny slutt", () => {
    expect(followRangeLength({ from: 10, to: 119 }, 120, 180)).toEqual({ from: 10, to: 179 });
  });
  it("delområde klemmes og hele scenen blir null", () => {
    expect(followRangeLength({ from: 10, to: 50 }, 120, 30)).toEqual({ from: 10, to: 29 });
    expect(followRangeLength({ from: 0, to: 50 }, 120, 51)).toBeNull();
    expect(followRangeLength(null, 120, 180)).toBeNull();
  });
});
