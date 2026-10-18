/** Visning og rekkefølge for panelene i sceneeditoren, lagret på brukeren (se ScenePanels.tsx). */
import { useCallback, useMemo } from "react";
import { L } from "@/core";
import { useUiPref } from "@/app/account/ui-prefs";
import {
  DEFAULT_PANEL_PREFS,
  isCollapsedPanels,
  isPanelPrefs,
  normalizeOrder,
  toggleCollapsed,
  type PanelId,
  type PanelMode,
} from "./panel-layout";

/** Visning og rekkefølge for panelene, lagret på brukeren. */
export function useScenePanels() {
  const [prefs, setPrefs] = useUiPref("sceneEditor.panels", DEFAULT_PANEL_PREFS, isPanelPrefs);
  const order = useMemo(() => normalizeOrder(prefs.order), [prefs.order]);
  const setMode = useCallback((mode: PanelMode) => setPrefs({ mode, order }), [setPrefs, order]);
  const setOrder = useCallback(
    (next: readonly PanelId[]) => setPrefs({ mode: prefs.mode, order: next }),
    [setPrefs, prefs.mode],
  );
  // Lukkede paneler (DEC-0089), også lagret på brukeren
  const [collapsedList, setCollapsedList] = useUiPref<readonly string[]>(
    "sceneEditor.collapsedPanels",
    NONE,
    isCollapsedPanels,
  );
  const collapsed = useMemo(() => new Set<string>(collapsedList), [collapsedList]);
  const toggle = useCallback(
    (id: PanelId) => setCollapsedList(toggleCollapsed(collapsedList, id)),
    [setCollapsedList, collapsedList],
  );
  return { mode: prefs.mode, order, setMode, setOrder, collapsed, toggle };
}

const NONE: readonly string[] = [];

/** Navnet på panelet i overskriften og i knappetekster. */
export function panelTitle(id: PanelId): string {
  switch (id) {
    case "assets":
      return L("I denne scenen", "In this scene");
    case "nearbyAudio":
      return L("Lyd i scenene rundt", "Audio in the surrounding scenes");
    case "layers":
      return L("Lag", "Layers");
    case "properties":
      return L("Egenskaper", "Properties");
    case "script":
      return L("Manus", "Script");
    case "pages":
      return L("Sider", "Pages");
    case "credits":
      return L("Rulletekst", "Credits");
  }
}
