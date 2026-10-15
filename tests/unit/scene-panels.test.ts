/** Panelene i sceneeditoren side om side og i brukerens rekkefølge (Mars 15.10.2026). */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_PREFS,
  PANEL_IDS,
  isPanelPrefs,
  movePanel,
  movePanelAmong,
  movePanelTo,
  normalizeOrder,
  type PanelId,
} from "@/app/scene-editor/panel-layout";

describe("rekkefølgen på panelene", () => {
  it("standard er alle panelene, stablet", () => {
    expect(DEFAULT_PANEL_PREFS.mode).toBe("stacked");
    expect(normalizeOrder(DEFAULT_PANEL_PREFS.order)).toEqual([...PANEL_IDS]);
  });

  it("ukjente og doble ID-er hoppes over; manglende paneler legges sist", () => {
    expect(normalizeOrder(["layers", "gammelt-panel", "layers", "assets"])).toEqual([
      "layers",
      "assets",
      "nearbyAudio",
      "properties",
    ]);
    expect(normalizeOrder([])).toEqual([...PANEL_IDS]);
  });

  it("et nytt panel i en senere versjon kommer sist hos brukere med lagret rekkefølge", () => {
    const known = [...PANEL_IDS, "notes" as PanelId];
    expect(normalizeOrder(["properties", "layers", "nearbyAudio", "assets"], known)).toEqual([
      "properties",
      "layers",
      "nearbyAudio",
      "assets",
      "notes",
    ]);
  });

  it("‹ › flytter ett steg, og ikke forbi kanten", () => {
    const o = normalizeOrder([]);
    expect(movePanel(o, "layers", -1)).toEqual(["assets", "layers", "nearbyAudio", "properties"]);
    expect(movePanel(o, "assets", -1)).toEqual(o);
    expect(movePanel(o, "properties", 1)).toEqual(o);
  });

  it("dra og slipp: foran eller etter et annet panel", () => {
    const o = normalizeOrder([]);
    expect(movePanelTo(o, "properties", "assets", "before")).toEqual([
      "properties",
      "assets",
      "nearbyAudio",
      "layers",
    ]);
    expect(movePanelTo(o, "assets", "layers", "after")).toEqual([
      "nearbyAudio",
      "layers",
      "assets",
      "properties",
    ]);
    expect(movePanelTo(o, "assets", "assets", "after")).toEqual(o);
  });

  it("‹ › hopper over paneler som ikke vises nå", () => {
    const o = normalizeOrder([]);
    // «Lyd i scenene rundt» vises ikke (scenen har ingen naboer): «Lag» flyttes forbi «I denne scenen»
    const shown: PanelId[] = ["assets", "layers", "properties"];
    expect(movePanelAmong(o, shown, "layers", -1)).toEqual([
      "layers",
      "assets",
      "nearbyAudio",
      "properties",
    ]);
    expect(movePanelAmong(o, shown, "assets", -1)).toEqual(o);
  });

  it("bare små, gyldige verdier godtas fra lagringen", () => {
    expect(isPanelPrefs({ mode: "side", order: ["layers"] })).toBe(true);
    expect(isPanelPrefs({ mode: "grid", order: [] })).toBe(false);
    expect(isPanelPrefs({ mode: "side", order: [1] })).toBe(false);
    expect(isPanelPrefs({ mode: "side", order: Array(40).fill("x") })).toBe(false);
    expect(isPanelPrefs(null)).toBe(false);
    expect(isPanelPrefs([])).toBe(false);
  });
});
