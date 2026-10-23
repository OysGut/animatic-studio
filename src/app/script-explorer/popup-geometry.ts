import { useEffect } from "react";
import { useUiPref } from "@/app/account/ui-prefs";
import { PREF_KEYS, validPopupPref, type PopupPref } from "./window-geometry";

/**
 * Popup-vinduet (festet manusutforsker) husker sin egen størrelse og plass per bruker, med samme lagring
 * som panelet (useUiPref). Lagres når brukeren slutter å endre størrelsen og når vinduet lukkes.
 */
export function usePopupGeometry(enabled: boolean): void {
  const [, setPref] = useUiPref<PopupPref | null>(PREF_KEYS.popup, null, validPopupPref);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => setPref({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight });
    const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(save, 400); };
    window.addEventListener("resize", later);
    window.addEventListener("beforeunload", save);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener("resize", later); window.removeEventListener("beforeunload", save); };
  }, [enabled, setPref]);
}
