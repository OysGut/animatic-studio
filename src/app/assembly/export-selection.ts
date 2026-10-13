/**
 * Utvalget i animatic-eksporten (KI-85): «valgt scene», «fra–til» og «valgte scener» går alle gjennom
 * `filmSelection`, så lyd og undertekster følger scenen sin (og ikke lekker inn fra scenen før i overlappen).
 * Bare «hele filmen» bruker filmen som den er.
 */
import { filmRange, filmSelection, type FilmClip, type FilmRange } from "@/core";

export type ExportScope = "film" | "selected" | "range" | "pick";

export type ExportSelection = ReturnType<typeof filmSelection>;

/** Utvalget for eksporten, eller `null` for hele filmen (lyd og undertekster brukes da uendret). */
export function exportSelection(
  clips: readonly FilmClip[],
  scope: ExportScope,
  opts: {
    readonly selectedId: string | null;
    readonly fromId: string;
    readonly toId: string;
    readonly picked: ReadonlySet<string>;
  },
): ExportSelection | null {
  if (scope === "film") return null;
  if (scope === "pick") return filmSelection(clips, opts.picked);
  const range: FilmRange =
    scope === "selected"
      ? {
          kind: "scenes",
          fromOccurrenceId: opts.selectedId ?? "",
          toOccurrenceId: opts.selectedId ?? "",
        }
      : { kind: "scenes", fromOccurrenceId: opts.fromId, toOccurrenceId: opts.toId };
  const ids = new Set(filmRange(clips, range).clips.map((c) => c.occurrenceId));
  return filmSelection(clips, ids);
}
