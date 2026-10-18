// @vitest-environment jsdom
/** GP4: idéen fra «Utvikle nytt prosjekt med skriveassistent» følger med til intervjuet én gang. */
import { describe, expect, it } from "vitest";
import { rememberIdea, takeIdea } from "@/app/storylab/new-project-idea";

describe("GP4 idé til intervjuet", () => {
  it("hentes én gang for riktig prosjekt", () => {
    rememberIdea("p1", "  En nisse mister lua  ");
    expect(takeIdea("p2")).toBe("");
    expect(takeIdea("p1")).toBe("En nisse mister lua");
    expect(takeIdea("p1")).toBe("");
  });
  it("tom idé lagres ikke", () => {
    rememberIdea("p3", "   ");
    expect(takeIdea("p3")).toBe("");
  });
});
