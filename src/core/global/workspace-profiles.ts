/**
 * G-6 pkt 2: stilprofiler, kvalitetsprofiler, fonter og maler definert på arbeidsgruppen
 * (public.workspace_profiles, migrasjon 0098) og arvet av prosjektene. Oppløsningen følger samme
 * forrangsprinsipp som resolveSettings (G-3): prosjektet vinner over arbeidsgruppen, og en lokal
 * overstyring faller aldri tilbake stille. Plattformnøytralt, ingen sideeffekter.
 */

export const WORKSPACE_PROFILE_KINDS = ["style", "quality", "font", "template"] as const;
export type WorkspaceProfileKind = (typeof WORKSPACE_PROFILE_KINDS)[number];

export interface WorkspaceProfile {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: WorkspaceProfileKind;
  readonly name: string;
  readonly spec: Readonly<Record<string, unknown>>;
  readonly isDefault: boolean;
  readonly archived: boolean;
  readonly revision: number;
}

/** Validering på adaptergrensen (RLS-rad → kjerne). Returnerer feilkode eller null. */
export function workspaceProfileError(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "profile";
  const o = raw as Record<string, unknown>;
  if (typeof o["id"] !== "string" || !o["id"]) return "id";
  if (typeof o["workspaceId"] !== "string" || !o["workspaceId"]) return "workspace";
  if (!WORKSPACE_PROFILE_KINDS.includes(o["kind"] as WorkspaceProfileKind)) return "kind";
  if (typeof o["name"] !== "string" || !o["name"].trim() || o["name"].length > 120) return "name";
  if (typeof o["spec"] !== "object" || o["spec"] === null || Array.isArray(o["spec"])) return "spec";
  return null;
}

export type ProfileSource = "project" | "workspace";
export interface ResolvedProfile<P> {
  readonly profile: P;
  readonly source: ProfileSource;
}

interface NamedProfile {
  readonly name: string;
  readonly isDefault?: boolean;
}

/**
 * Oppløser hvilken profil av en type som gjelder for et prosjekt.
 * Forrang: prosjektets standardprofil → prosjektets øvrige (alfabetisk) → gruppens standardprofil →
 * gruppens øvrige (alfabetisk). En profil i prosjektet er altså alltid en overstyring av gruppens, slik
 * kravet om lokale overstyringer er ivaretatt; arven gjelder bare når prosjektet ikke har noen selv.
 */
export function resolveWorkspaceProfile<P extends NamedProfile>(
  kind: WorkspaceProfileKind,
  projectProfiles: readonly P[],
  workspaceProfiles: readonly WorkspaceProfile[],
): ResolvedProfile<P | WorkspaceProfile> | null {
  const byName = <T extends NamedProfile>(a: T, b: T) => a.name.localeCompare(b.name);
  const project = [...projectProfiles].sort(byName);
  const workspace = workspaceProfiles
    .filter((p) => p.kind === kind && !p.archived)
    .sort(byName);
  const pick = <T extends NamedProfile>(list: readonly T[]): T | null =>
    list.find((p) => p.isDefault) ?? list[0] ?? null;
  const p = pick(project);
  if (p) return { profile: p, source: "project" };
  const w = pick(workspace);
  return w ? { profile: w, source: "workspace" } : null;
}
