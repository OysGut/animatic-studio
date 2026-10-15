/** Visning og rekkefølge for panelene i sceneeditoren, lagret på brukeren (se ScenePanels.tsx). */
import { useCallback, useMemo } from "react";
import { L } from "@/core";
import { useUiPref } from "@/app/account/ui-prefs";
import {
  DEFAULT_PANEL_PREFS,
  isPanelPrefs,
  normalizeOrder,
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
  return { mode: prefs.mode, order, setMode, setOrder };
}

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
  }
}
