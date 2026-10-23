/**
 * Fast ID-merke i hvert vindu (Øystein 23.10), for feilsøking og presise referanser. Ikke klikkbart, ikke
 * markerbart, skjult for skjermleser. Alt + klikk på merket kopierer koden (useUiIdCopy i rotsiden).
 * Nummeret slås alltid opp i registeret src/app/ui-ids.ts.
 */
import { useEffect } from "react";
import { useMatches } from "@tanstack/react-router";
import { BUILD_SHA_SHORT } from "@/app/build-info";
import { uiIdEntry, uiIdForRoute } from "@/app/ui-ids";

export function uiIdLabel(id: string): string {
  return `${uiIdEntry(id) ? id : `${id}?`} · ${BUILD_SHA_SHORT}`;
}

export function UiId({ id, page = false }: { id: string; page?: boolean }) {
  return <span aria-hidden="true" data-ui-id={id} data-testid="ui-id"
    className={(page ? "fixed bottom-0.5 left-1 z-30" : "absolute bottom-0.5 right-1 z-10") + " pointer-events-none select-none whitespace-nowrap font-mono text-[11px] leading-none text-text-tertiary opacity-50"}
    style={{ userSelect: "none" }}>{uiIdLabel(id)}</span>;
}

/** Alt + klikk på et ID-merke kopierer koden. Merket slipper vanlige klikk gjennom, så treffet regnes ut fra punktet. */
export function useUiIdCopy(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!e.altKey || typeof document.elementsFromPoint !== "function") return;
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset["uiId"]);
      if (!(hit instanceof HTMLElement)) return;
      e.preventDefault(); e.stopPropagation();
      void navigator.clipboard?.writeText(hit.textContent ?? "").catch(() => undefined);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/** Sidens merke: den dypeste ruten som står i registeret (nede til venstre, påvirker ikke innloggingsboksen). */
export function RouteUiId() {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const entry = uiIdForRoute(matches[i]!.routeId);
    if (entry) return <UiId id={entry.id} page />;
  }
  return null;
}
