/**
 * K-1: visning av tilstedeværelse (DEC-0010, REQ-0526) der den hindrer kollisjoner: hvem andre som står i
 * en sceneforekomst, og teksten for merket. Rene funksjoner, så de kan testes uten nettleser.
 */
import { collation, locale } from "@/core";
import { t } from "@/core/i18n/keyed";
import type { PresentUser } from "./use-presence";

/** Navnene på de andre per sceneforekomst, sortert. */
export function presenceByOccurrence(others: readonly PresentUser[]): ReadonlyMap<string, readonly string[]> {
  const m = new Map<string, string[]>();
  for (const o of others) {
    if (!o.occurrenceId) continue;
    const list = m.get(o.occurrenceId) ?? [];
    if (!list.includes(o.name)) list.push(o.name);
    m.set(o.occurrenceId, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.localeCompare(b, collation()));
  return m;
}

/** «Ada og Bo» / «Ada, Bo and Cy» etter språket brukeren har valgt. */
export function joinNames(names: readonly string[]): string {
  try {
    return new Intl.ListFormat(locale(), { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** Teksten i merket øverst ved scenen, eller null når ingen andre står i den. */
export function alsoEditingText(names: readonly string[] | undefined): string | null {
  if (!names || names.length === 0) return null;
  return names.length === 1
    ? t("k1.presence.one", { name: names[0]! })
    : t("k1.presence.many", { names: joinNames(names) });
}
