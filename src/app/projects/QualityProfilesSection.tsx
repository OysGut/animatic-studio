/**
 * M8 (REQ-0854–0862): administrasjon av kvalitetsprofiler på prosjektsiden. Profilene er prosjektdata og
 * skrives via kommandoer (apply_changes) med angring. Standardprofilene «Utkast», «Gjennomgang» og «Endelig»
 * opprettes for nye prosjekter; eksisterende prosjekter tilbys dem her – ingenting endres i stillhet.
 */
import { useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import {
  L,
  defaultQualityProfiles,
  newId,
  qualityProfileError,
  qualityProfilesOf,
  EFFORT_LABEL,
  IMAGE_SIZE_LABEL,
  providersFor,
  type EffortLevel,
  type ImageSize,
  type ProjectState,
  type QualityProfile,
  type QualityProfileModelKind,
  type QualityProfileSpec,
  QUALITY_PROFILE_MODEL_KINDS,
  QUALITY_PROFILE_MODEL_KIND_LABEL,
} from "@/core";
import { useCommands } from "@/app/project/use-commands";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EFFORTS: readonly (EffortLevel | "")[] = ["", "fast", "balanced", "premium"];
const SIZES: readonly (ImageSize | "")[] = ["", "1K", "2K", "4K"];

export function QualityProfilesSection({
  state,
  projectId,
  userId,
  editable,
}: {
  state: ProjectState;
  projectId: string;
  userId: string;
  editable: boolean;
}) {
  const cmds = useCommands(projectId, userId, editable);
  const profiles = qualityProfilesOf(state);
  const activeId = state.project.activeQualityProfileId ?? null;
  const [editing, setEditing] = useState<QualityProfile | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addDefaults() {
    for (const d of defaultQualityProfiles()) {
      const e = cmds.run(
        { type: "AddQualityProfile", profileId: newId(), name: d.name, spec: d.spec },
        L(`Ny kvalitetsprofil «${d.name}»`, `New quality profile "${d.name}"`),
      );
      if (e) {
        setError(e);
        return;
      }
    }
  }

  return (
    <section aria-labelledby="qp-title" className="mt-8" data-testid="quality-profiles-section">
      <PanelHeader title={L("Kvalitetsprofiler", "Quality profiles")} count={profiles.length} />
      <p className="mb-2 text-xs text-text-tertiary">
        {L(
          "En profil samler modellvalg, oppløsning, innsatsnivå, antall varianter og eksportinnstillinger. Den aktive profilen brukes som standard ved generering og eksport, og kan overstyres hver gang. Å bytte profil endrer aldri eksisterende resultater.",
          "A profile gathers model choices, resolution, effort level, number of variants and export settings. The active profile is the default for generation and export, and can be overridden each time. Switching profile never changes existing results.",
        )}
      </p>
      {profiles.length === 0 ? (
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>{L("Prosjektet har ingen profiler ennå.", "The project has no profiles yet.")}</span>
          {editable ? (
            <Button size="sm" variant="secondary" data-testid="quality-profile-add-defaults" onClick={addDefaults}>
              {L("Legg til standardprofilene", "Add the default profiles")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border text-xs">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-2 py-1.5" data-testid="quality-profile-row">
              <button
                type="button"
                data-testid={`quality-profile-active-${p.id}`}
                disabled={!editable}
                onClick={() =>
                  setError(
                    cmds.run(
                      { type: "SetActiveQualityProfile", profileId: activeId === p.id ? null : p.id },
                      activeId === p.id
                        ? L("Fjern aktiv profil", "Clear active profile")
                        : L(`Sett «${p.name}» som aktiv profil`, `Set "${p.name}" as the active profile`),
                    ),
                  )
                }
                title={
                  activeId === p.id
                    ? L("Aktiv profil – klikk for å fjerne valget", "Active profile – click to clear")
                    : L("Sett som aktiv profil", "Set as the active profile")
                }
                aria-label={
                  activeId === p.id
                    ? L("Aktiv profil – klikk for å fjerne valget", "Active profile – click to clear")
                    : L("Sett som aktiv profil", "Set as the active profile")
                }
                className={activeId === p.id ? "text-accent-warm" : "text-text-tertiary hover:text-text-primary"}
              >
                <Star className="size-3.5" fill={activeId === p.id ? "currentColor" : "none"} aria-hidden />
              </button>
              <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{p.name}</span>
              <span className="text-text-tertiary">
                {[
                  p.spec.effort ? EFFORT_LABEL[p.spec.effort] : null,
                  p.spec.resolution ? IMAGE_SIZE_LABEL[p.spec.resolution] : null,
                  p.spec.variants ? L(`${p.spec.variants} varianter`, `${p.spec.variants} variants`) : null,
                  p.spec.budgetLimit != null
                    ? L(`høyst ${p.spec.budgetLimit}/mnd`, `max ${p.spec.budgetLimit}/mo`)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || L("Ingen valg lagret", "No settings saved")}
              </span>
              {editable ? (
                <>
                  <Button size="sm" variant="ghost" data-testid={`quality-profile-edit-${p.id}`} onClick={() => setEditing(p)}>
                    {L("Endre", "Edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`quality-profile-remove-${p.id}`}
                    aria-label={L(`Fjern «${p.name}»`, `Remove "${p.name}"`)}
                    onClick={() =>
                      setError(
                        cmds.run(
                          { type: "SetQualityProfileRemoved", profileId: p.id, removed: true },
                          L(`Fjern kvalitetsprofilen «${p.name}»`, `Remove the quality profile "${p.name}"`),
                        ),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable && profiles.length > 0 ? (
        <Button size="sm" variant="secondary" className="mt-2" data-testid="quality-profile-add" onClick={() => setEditing("new")}>
          <Plus /> {L("Ny profil", "New profile")}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      {editing ? (
        <ProfileDialog
          state={state}
          projectId={projectId}
          profile={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(name, spec) => {
            const err = qualityProfileError(name, spec);
            if (err) {
              setError(err);
              return false;
            }
            const e =
              editing === "new"
                ? cmds.run(
                    { type: "AddQualityProfile", profileId: newId(), name, spec },
                    L(`Ny kvalitetsprofil «${name}»`, `New quality profile "${name}"`),
                  )
                : cmds.run(
                    { type: "UpdateQualityProfile", profileId: editing.id, name, spec },
                    L(`Endre kvalitetsprofilen «${name}»`, `Edit the quality profile "${name}"`),
                  );
            if (e) {
              setError(e);
              return false;
            }
            setError(null);
            setEditing(null);
            return true;
          }}
        />
      ) : null}
    </section>
  );
}

function ProfileDialog({
  state,
  projectId,
  profile,
  onClose,
  onSave,
}: {
  state: ProjectState;
  projectId: string;
  profile: QualityProfile | null;
  onClose: () => void;
  onSave: (name: string, spec: QualityProfileSpec) => boolean;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [effort, setEffort] = useState<EffortLevel | "">(profile?.spec.effort ?? "");
  const [variants, setVariants] = useState(profile?.spec.variants?.toString() ?? "");
  const [resolution, setResolution] = useState<ImageSize | "">(profile?.spec.resolution ?? "");
  const [budget, setBudget] = useState(profile?.spec.budgetLimit?.toString() ?? "");
  const [models, setModels] = useState<Partial<Record<QualityProfileModelKind, string>>>(
    profile?.spec.models ?? {},
  );
  const connected = useProjectProviders(projectId, true);

  const sel = "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
  return (
    <div
      role="dialog"
      aria-label={profile ? L("Endre kvalitetsprofil", "Edit quality profile") : L("Ny kvalitetsprofil", "New quality profile")}
      className="mt-3 flex flex-col gap-2 border border-border bg-surface-2 p-3 text-xs"
      data-testid="quality-profile-dialog"
    >
      <label className="flex items-center gap-2 text-text-secondary">
        {L("Navn", "Name")}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 w-56 bg-surface-3"
          aria-label={L("Profilnavn", "Profile name")}
          data-testid="quality-profile-name"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-text-secondary">
          {L("Innsatsnivå", "Effort level")}
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value as EffortLevel | "")}
            className={sel}
            aria-label={L("Innsatsnivå", "Effort level")}
            data-testid="quality-profile-effort"
          >
            {EFFORTS.map((e) => (
              <option key={e} value={e}>
                {e === "" ? L("Ikke valgt", "Not chosen") : EFFORT_LABEL[e]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          {L("Oppløsning", "Resolution")}
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as ImageSize | "")}
            className={sel}
            aria-label={L("Oppløsning", "Resolution")}
          >
            {SIZES.map((z) => (
              <option key={z} value={z}>
                {z === "" ? L("Ikke valgt", "Not chosen") : IMAGE_SIZE_LABEL[z]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          {L("Varianter", "Variants")}
          <Input
            value={variants}
            onChange={(e) => setVariants(e.target.value)}
            className="h-7 w-16 bg-surface-3"
            inputMode="numeric"
            aria-label={L("Antall varianter", "Number of variants")}
          />
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          {L("Budsjettgrense per måned", "Budget limit per month")}
          <Input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-7 w-20 bg-surface-3"
            inputMode="numeric"
            aria-label={L("Budsjettgrense per måned", "Budget limit per month")}
            placeholder={L("ingen", "none")}
          />
        </label>
      </div>
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">{L("Modeller per AI-type", "Models per AI type")}</legend>
        {QUALITY_PROFILE_MODEL_KINDS.map((kind) => {
          const options = providersFor(
            kind === "speech" ? "speech" : kind === "sound" ? "sound" : kind,
            new Set(connected.data?.providers ?? []),
          ).flatMap((o) => o.models.map((m) => ({ id: m.id, label: `${o.provider.name} – ${m.label}` })));
          const seen = new Set<string>();
          const unique = options.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
          return (
            <label key={kind} className="flex items-center gap-1.5 text-text-secondary">
              {QUALITY_PROFILE_MODEL_KIND_LABEL[kind]}
              <select
                value={models[kind] ?? ""}
                onChange={(e) =>
                  setModels((m) => {
                    const next = { ...m };
                    if (e.target.value) next[kind] = e.target.value;
                    else delete next[kind];
                    return next;
                  })
                }
                className={sel}
                aria-label={L(`Modell for ${QUALITY_PROFILE_MODEL_KIND_LABEL[kind]}`, `Model for ${QUALITY_PROFILE_MODEL_KIND_LABEL[kind]}`)}
                data-testid={`quality-profile-model-${kind}`}
              >
                <option value="">{L("Fra innsatsnivået", "From the effort level")}</option>
                {unique.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </fieldset>
      <div className="flex gap-2">
        <Button
          size="sm"
          data-testid="quality-profile-save"
          onClick={() => {
            const spec: QualityProfileSpec = {
              ...(effort ? { effort } : {}),
              ...(resolution ? { resolution } : {}),
              ...(variants.trim() ? { variants: Number(variants) } : {}),
              ...(budget.trim() ? { budgetLimit: Number(budget) } : {}),
              ...(Object.keys(models).length ? { models } : {}),
              ...(profile?.spec.export ? { export: profile.spec.export } : {}),
            };
            onSave(name, spec);
          }}
        >
          {L("Lagre", "Save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {L("Avbryt", "Cancel")}
        </Button>
      </div>
    </div>
  );
}
