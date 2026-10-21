/** Visning og rekkefølge for panelene i sceneeditoren, lagret på brukeren (se ScenePanels.tsx). */
import { useCallback, useMemo } from "react";

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
import { t } from "@/core/i18n/keyed";

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
      return t("app-scene-editor-use-scene-panels.panel-title.message.80a17ac78069");
    case "nearbyAudio":
      return t("app-scene-editor-use-scene-panels.panel-title.message.3acec9d7eb4f");
    case "layers":
      return t("app-scene-editor-use-scene-panels.panel-title.message.7d584b8ff42e");
    case "properties":
      return t("app-scene-editor-use-scene-panels.panel-title.message.634d727d4eee");
    case "script":
      return t("app-scene-editor-use-scene-panels.panel-title.message.0a9cfc5643ea");
    case "pages":
      return t("app-scene-editor-use-scene-panels.panel-title.message.b8b718aaeaf2");
    case "credits":
      return t("app-scene-editor-use-scene-panels.panel-title.message.6e7ae7c45746");
  }
}
