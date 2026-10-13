/**
 * Visuelle stilprofiler i ressursbiblioteket (REQ-0121, mandat kap. 8 og 9.4, DEC-0078). Profilene lagres og
 * redigeres som før (generation/style.ts, kommandoene CreateStyleProfile/UpdateStyleProfile); her er bare
 * oversikten biblioteket viser: hvilken som er standard, hva hver gjelder for og hvor utfylt den er.
 */
import type { ProjectState, StyleProfile, StyleUse } from "../model";
import {
  STYLE_TEXT_FIELDS,
  STYLE_USE_LABEL,
  STYLE_USES,
  defaultStyleProfile,
} from "../generation/style";

export interface LibraryStyleProfile {
  readonly profile: StyleProfile;
  /** Profilen som gjelder der ingen annen er valgt (standardprofilen). */
  readonly isDefault: boolean;
  /** Det profilen gjelder for, i fast rekkefølge. Tom for standardprofilen = alt annet. */
  readonly uses: readonly StyleUse[];
  /** «Karakterer, Plakater» / «Alt annet» / «Ikke i bruk». */
  readonly usesLabel: string;
  /** Antall tekstfelt som er fylt ut, av `fieldCount`. */
  readonly filled: number;
  readonly fieldCount: number;
  /** Kort beskrivelse (handling, visuell stil eller verden). */
  readonly summary: string;
}

/** Stilprofilene som ikke er fjernet: standardprofilen først, så etter navn. */
export function libraryStyleProfiles(s: ProjectState): LibraryStyleProfile[] {
  const def = defaultStyleProfile(s);
  return Object.values(s.styleProfiles)
    .filter((p) => !p.removed)
    .map((p): LibraryStyleProfile => {
      const g = p.guide;
      const uses = STYLE_USES.filter((u) => (p.appliesTo ?? []).includes(u));
      const isDefault = p.id === def?.id;
      return {
        profile: p,
        isDefault,
        uses,
        usesLabel: uses.length
          ? uses.map((u) => STYLE_USE_LABEL[u]).join(", ")
          : isDefault
            ? "Alt annet"
            : "Ikke i bruk",
        filled: STYLE_TEXT_FIELDS.filter((k) => (g?.[k] ?? "").trim()).length,
        fieldCount: STYLE_TEXT_FIELDS.length,
        summary: (g?.premise || g?.visualStyle || g?.world || "").trim(),
      };
    })
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.profile.name.localeCompare(b.profile.name, "nb"),
    );
}

/** Søket i biblioteket treffer navnet, beskrivelsen og hva profilen gjelder for. */
export function styleProfileMatches(p: LibraryStyleProfile, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("nb");
  if (!q) return true;
  const g = p.profile.guide;
  return [p.profile.name, p.usesLabel, ...STYLE_TEXT_FIELDS.map((k) => g?.[k] ?? "")].some((x) =>
    x.toLocaleLowerCase("nb").includes(q),
  );
}
