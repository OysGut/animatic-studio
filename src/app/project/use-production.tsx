/**
 * Valgt produksjon (hovedfilm, spinoff, trailer …) – felles for manus, montering, sceneeditor og bibliotek
 * (DEC-0057). Valget huskes per prosjekt i nettleseren og følger med mellom arbeidsflatene.
 */
import { useCallback, useEffect, useState } from "react";
import { PRODUCTION_KIND_LABEL, sortedProductions, type ProjectState } from "@/core";
import { t } from "@/core/i18n/keyed";

const EVENT = "animatic-production-change";
const storeKey = (projectId: string) => `animatic:production:${projectId}`;

function read(projectId: string): string | null {
  try {
    return window.localStorage.getItem(storeKey(projectId));
  } catch {
    return null;
  }
}

/** Velg produksjonen før prosjektet åpnes (prosjektlisten, DEC-0082). */
export function rememberProduction(projectId: string, productionId: string): void {
  try {
    window.localStorage.setItem(storeKey(projectId), productionId);
  } catch {
    // Lagring i nettleseren er ikke tilgjengelig: prosjektet åpnes med hovedfilmen
  }
}

function fallback(state: ProjectState): string {
  return sortedProductions(state)[0]?.id ?? "";
}

/**
 * Produksjonen som vises. `preferOccurrenceId`: en scene som er åpnet med lenke – da vises produksjonen den
 * hører til (og blir valgt).
 */
export function useActiveProduction(
  projectId: string,
  state: ProjectState,
  preferOccurrenceId?: string | null,
): [string, (id: string) => void] {
  const [id, setId] = useState<string>(() => {
    const fromLink = preferOccurrenceId
      ? state.occurrences[preferOccurrenceId]?.productionId
      : null;
    if (fromLink) return fromLink;
    const stored = typeof window === "undefined" ? null : read(projectId);
    return stored && state.productions[stored] ? stored : fallback(state);
  });
  const set = useCallback(
    (next: string) => {
      setId(next);
      try {
        window.localStorage.setItem(storeKey(projectId), next);
      } catch {
        // Lagring i nettleseren er ikke tilgjengelig: valget gjelder bare denne visningen
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { projectId, id: next } }));
    },
    [projectId],
  );
  // Valg i en annen arbeidsflate (samme vindu)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ projectId: string; id: string }>).detail;
      if (d?.projectId === projectId) setId(d.id);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [projectId]);
  // Lenke til en scene i en annen produksjon: bytt til den produksjonen
  useEffect(() => {
    // Lagres også, så de andre arbeidsflatene følger etter
    const p = preferOccurrenceId ? state.occurrences[preferOccurrenceId]?.productionId : null;
    if (p && (p !== id || read(projectId) !== p)) set(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferOccurrenceId]);
  // Produksjonen finnes ikke lenger (angret, annen bruker)
  const valid = state.productions[id] ? id : fallback(state);
  return [valid, set];
}

/** Velger for produksjon i verktøylinjene (vises bare når prosjektet har flere produksjoner). */
export function ProductionPicker({
  state,
  value,
  onChange,
}: {
  state: ProjectState;
  value: string;
  onChange: (id: string) => void;
}) {
  const list = sortedProductions(state);
  if (list.length < 2) return null;
  return (
    <select
      aria-label={t("app-project-use-production.production-picker.aria-label.0d558dc6641a")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={t("app-project-use-production.production-picker.title.dad57cb9be2e")}
      className="h-7 max-w-[220px] rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
    >
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.kind === "main" ? "" : ` (${PRODUCTION_KIND_LABEL[p.kind].toLowerCase()})`}
        </option>
      ))}
    </select>
  );
}
