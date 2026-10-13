/** «Skjul» i kontinuitetsanalysen huskes per prosjekt (KI-105). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readHiddenFindings, writeHiddenFindings } from "@/app/continuity/hidden-findings";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("skjulte kontinuitetsfunn (KI-105)", () => {
  it("lagres og leses per prosjekt", () => {
    writeHiddenFindings("p1", new Set(["name:MAJA", "intro:a1"]));
    expect(readHiddenFindings("p1")).toEqual(["name:MAJA", "intro:a1"]);
    expect(readHiddenFindings("p2")).toEqual([]);
    writeHiddenFindings("p1", []);
    expect(readHiddenFindings("p1")).toEqual([]);
  });

  it("tåler ødelagt innhold og blokkert lagring", () => {
    window.localStorage.setItem("animatic:hidden-continuity:p1", "{ikke json");
    expect(readHiddenFindings("p1")).toEqual([]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blokkert");
    });
    expect(() => writeHiddenFindings("p1", ["x"])).not.toThrow();
  });
});
