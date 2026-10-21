/**
 * M8 (REQ-0854–0862): administrasjon av kvalitetsprofiler på prosjektsiden. Profilene er prosjektdata og
 * skrives via kommandoer (apply_changes) med angring. Standardprofilene «Utkast», «Gjennomgang» og «Endelig»
 * opprettes for nye prosjekter; eksisterende prosjekter tilbys dem her – ingenting endres i stillhet.
 */
import { useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { defaultQualityProfiles, newId, proresOfferProfile, proresSpecOf, qualityProfileError, qualityProfilesOf, EFFORT_LABEL, IMAGE_SIZE_LABEL, providersFor, type EffortLevel, type ImageSize, type ProjectState, type QualityProfile, type QualityProfileModelKind, type QualityProfileSpec, QUALITY_PROFILE_MODEL_KINDS, QUALITY_PROFILE_MODEL_KIND_LABEL } from "@/core";
import { useCommands } from "@/app/project/use-commands";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/core/i18n/keyed";

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
  const [offerHidden, setOfferHidden] = useState(false);
  const offer = editable && !offerHidden ? proresOfferProfile(state) : null;

  function addDefaults() {
    for (const d of defaultQualityProfiles()) {
      const e = cmds.run(
        { type: "AddQualityProfile", profileId: newId(), name: d.name, spec: d.spec },
        t("app-projects-quality-profiles-section.e.cmds-run.5022869935d4", { name: String(d.name) }),
      );
      if (e) {
        setError(e);
        return;
      }
    }
  }

  return (
    <section aria-labelledby="qp-title" className="mt-8" data-testid="quality-profiles-section">
      <PanelHeader title={t("app-projects-quality-profiles-section.quality-profiles-section.title.86c66d620967")} count={profiles.length} />
      <p className="mb-2 text-xs text-text-tertiary">
        {t("app-projects-quality-profiles-section.quality-profiles-section.p.3d99683fa28f")}
      </p>
      {offer ? (
        <div role="status" data-testid="prores-offer" className="mb-2 flex flex-wrap items-center gap-2 rounded-sm border border-accent-warm/50 bg-surface-2 px-3 py-2 text-xs text-text-primary">
          <span className="flex-1">{t("r1-prores-offer.question", { name: offer.name })}</span>
          <Button size="sm" variant="secondary" data-testid="prores-offer-accept" onClick={() => setError(cmds.run(
            { type: "UpdateQualityProfile", profileId: offer.id, spec: proresSpecOf(offer.spec) },
            t("r1-prores-offer.undo-label", { name: offer.name }),
          ))}>{t("r1-prores-offer.accept")}</Button>
          <Button size="sm" variant="ghost" data-testid="prores-offer-dismiss" onClick={() => setOfferHidden(true)}>{t("r1-prores-offer.dismiss")}</Button>
        </div>
      ) : null}
      {profiles.length === 0 ? (
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>{t("app-projects-quality-profiles-section.quality-profiles-section.span.ad5dc4ee75b6")}</span>
          {editable ? (
            <Button size="sm" variant="secondary" data-testid="quality-profile-add-defaults" onClick={addDefaults}>
              {t("app-projects-quality-profiles-section.quality-profiles-section.button.96fe3b33278f")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border text-xs">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-2 py-1.5" data-testid="quality-profile-row">
              <Button
                size="icon" variant="ghost"
                data-testid={`quality-profile-active-${p.id}`}
                disabled={!editable}
                onClick={() =>
                  setError(
                    cmds.run(
                      { type: "SetActiveQualityProfile", profileId: activeId === p.id ? null : p.id },
                      activeId === p.id
                        ? t("app-projects-quality-profiles-section.quality-profiles-section.cmds-run.81c62df7f64d")
                        : t("app-projects-quality-profiles-section.quality-profiles-section.cmds-run.c227c9497432", { name: String(p.name) }),
                    ),
                  )
                }
                title={
                  activeId === p.id
                    ? t("app-projects-quality-profiles-section.quality-profiles-section.title.ca935bb26f57")
                    : t("app-projects-quality-profiles-section.quality-profiles-section.title.6d75ac0a8869")
                }
                aria-label={
                  activeId === p.id
                    ? t("app-projects-quality-profiles-section.quality-profiles-section.aria-label.ca935bb26f57")
                    : t("app-projects-quality-profiles-section.quality-profiles-section.aria-label.6d75ac0a8869")
                }
                className={activeId === p.id ? "text-accent-warm" : "text-text-tertiary hover:text-text-primary"}
              >
                <Star className="size-3.5" fill={activeId === p.id ? "currentColor" : "none"} aria-hidden />
              </Button>
              <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{p.name}</span>
              <span className="text-text-tertiary">
                {[
                  p.spec.effort ? EFFORT_LABEL[p.spec.effort] : null,
                  p.spec.resolution ? IMAGE_SIZE_LABEL[p.spec.resolution] : null,
                  p.spec.variants ? t("app-projects-quality-profiles-section.variants", { count: p.spec.variants }) : null,
                  p.spec.budgetLimit != null
                    ? t("app-projects-quality-profiles-section.quality-profiles-section.p-spec-effort-effort-label-p-spec-effort-null-p-spec-resolution-image-size-label-p-spec-resolution-null-p-spec-variants-l-p-spec-variants-p-spec-variants-1-variant-varianter-p-spec-variants-p-spec-variants-1-variant-variants-null-p-spec-budget-limit-null-l-h-yst-p-spec-budget-limit-mnd-max-p-spec-budget-limit-mo-null-filter.c97aefb7ce63", { budgetLimit: String(p.spec.budgetLimit) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("app-projects-quality-profiles-section.quality-profiles-section.span.a1357eca16bc")}
              </span>
              {editable ? (
                <>
                  <Button size="sm" variant="ghost" data-testid={`quality-profile-edit-${p.id}`} onClick={() => setEditing(p)}>
                    {t("app-projects-quality-profiles-section.quality-profiles-section.button.8c0bf4fd702a")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`quality-profile-remove-${p.id}`}
                    aria-label={t("app-projects-quality-profiles-section.quality-profiles-section.aria-label.9529252f2ce8", { name: String(p.name) })}
                    onClick={() =>
                      setError(
                        cmds.run(
                          { type: "SetQualityProfileRemoved", profileId: p.id, removed: true },
                          t("app-projects-quality-profiles-section.quality-profiles-section.cmds-run.a1323399cae1", { name: String(p.name) }),
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
          <Plus /> {t("app-projects-quality-profiles-section.quality-profiles-section.button.9fa8ff3da0f7")}
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
                    t("app-projects-quality-profiles-section.e.cmds-run.ff9506ab0ff0", { name: String(name) }),
                  )
                : cmds.run(
                    { type: "UpdateQualityProfile", profileId: editing.id, name, spec },
                    t("app-projects-quality-profiles-section.e.cmds-run.48f1f0f3eb47", { name: String(name) }),
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
  const [exportFormat, setExportFormat] = useState<"" | "mp4" | "webm" | "png-seq" | "prores">(profile?.spec.export?.format ?? "");
  const [exportAlpha, setExportAlpha] = useState<"" | "straight" | "premultiplied">(profile?.spec.export?.alpha ?? "");
  const [exportBitrate, setExportBitrate] = useState(profile?.spec.export?.bitrateKbps?.toString() ?? "");
  const [models, setModels] = useState<Partial<Record<QualityProfileModelKind, string>>>(
    profile?.spec.models ?? {},
  );
  const connected = useProjectProviders(projectId, true);

  const sel = "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
  return (
    <div
      role="dialog"
      aria-label={profile ? t("app-projects-quality-profiles-section.profile-dialog.aria-label.e563530ada2f") : t("app-projects-quality-profiles-section.profile-dialog.aria-label.c99e03632a03")}
      className="mt-3 flex flex-col gap-2 border border-border bg-surface-2 p-3 text-xs"
      data-testid="quality-profile-dialog"
    >
      <label className="flex items-center gap-2 text-text-secondary">
        {t("app-projects-quality-profiles-section.profile-dialog.label.87eb6b0f610e")}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 w-56 bg-surface-3"
          aria-label={t("app-projects-quality-profiles-section.profile-dialog.aria-label.8f2415ab9021")}
          data-testid="quality-profile-name"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-text-secondary">
          {t("app-projects-quality-profiles-section.profile-dialog.label.199cf4d2cacf")}
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value as EffortLevel | "")}
            className={sel}
            aria-label={t("app-projects-quality-profiles-section.profile-dialog.aria-label.199cf4d2cacf")}
            data-testid="quality-profile-effort"
          >
            {EFFORTS.map((e) => (
              <option key={e} value={e}>
                {e === "" ? t("app-projects-quality-profiles-section.profile-dialog.option.990dc7fab9ab") : EFFORT_LABEL[e]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          {t("app-projects-quality-profiles-section.profile-dialog.label.76031e8a6db6")}
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as ImageSize | "")}
            className={sel}
            aria-label={t("app-projects-quality-profiles-section.profile-dialog.aria-label.76031e8a6db6")}
          >
            {SIZES.map((z) => (
              <option key={z} value={z}>
                {z === "" ? t("app-projects-quality-profiles-section.profile-dialog.option.990dc7fab9ab.2") : IMAGE_SIZE_LABEL[z]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          {t("app-projects-quality-profiles-section.profile-dialog.label.f2f787c112cc")}
          <Input
            value={variants}
            onChange={(e) => setVariants(e.target.value)}
            className="h-7 w-16 bg-surface-3"
            inputMode="numeric"
            aria-label={t("app-projects-quality-profiles-section.profile-dialog.aria-label.270da238aa36")}
          />
        </label>
        <label className="flex items-center gap-1.5 text-text-secondary">
          {t("app-projects-quality-profiles-section.profile-dialog.label.b4a69d526434")}
          <Input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-7 w-20 bg-surface-3"
            inputMode="numeric"
            aria-label={t("app-projects-quality-profiles-section.profile-dialog.aria-label.b4a69d526434")}
            placeholder={t("app-projects-quality-profiles-section.profile-dialog.placeholder.4f87d8e17496")}
          />
        </label>
      </div>
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">{t("app-projects-quality-profiles-section.profile-dialog.legend.4b3045abb2ff")}</legend>
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
                aria-label={t("app-projects-quality-profiles-section.profile-dialog.aria-label.2f06acdd0ec3", { value1: String(QUALITY_PROFILE_MODEL_KIND_LABEL[kind]) })}
                data-testid={`quality-profile-model-${kind}`}
              >
                <option value="">{t("app-projects-quality-profiles-section.profile-dialog.option.4044f9d0b89b")}</option>
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
      <fieldset className="flex flex-wrap gap-3">
        <legend>{t("app-projects-quality-profiles-section.profile-dialog.legend.e04587b485b1")}</legend>
        <label>{t("app-projects-quality-profiles-section.profile-dialog.label.dba78363fe08")} <select className={sel} data-testid="quality-profile-export-format" value={exportFormat} onChange={e=>setExportFormat(e.target.value as typeof exportFormat)}><option value="">{t("app-projects-quality-profiles-section.profile-dialog.option.990dc7fab9ab.3")}</option><option value="mp4">MP4</option><option value="webm">WebM</option><option value="png-seq">{t("app-projects-quality-profiles-section.profile-dialog.option.648dc83932d1")}</option><option value="prores">{t("app-projects-quality-profiles-section.profile-dialog.option.a6dff85bdd6e")}</option></select></label>
        <label>{t("app-projects-quality-profiles-section.profile-dialog.label.73288b25da41")} <select className={sel} data-testid="quality-profile-export-alpha" value={exportAlpha} onChange={e=>setExportAlpha(e.target.value as typeof exportAlpha)}><option value="">{t("app-projects-quality-profiles-section.profile-dialog.option.990dc7fab9ab.4")}</option><option value="straight">{t("app-projects-quality-profiles-section.profile-dialog.option.ff806e7ac6e2")}</option><option value="premultiplied">{t("app-projects-quality-profiles-section.profile-dialog.option.5f17b52cdd08")}</option></select></label>
        <label>{t("app-projects-quality-profiles-section.profile-dialog.label.c3a245760f0d")} <Input type="number" min={100} max={100000} className="h-7 w-24" data-testid="quality-profile-export-bitrate" value={exportBitrate} onChange={e=>setExportBitrate(e.target.value)} /></label>
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
              ...(exportFormat || exportAlpha || exportBitrate ? { export: {
                ...(exportFormat ? { format: exportFormat } : {}),
                ...(exportAlpha ? { alpha: exportAlpha } : {}),
                ...(exportBitrate ? { bitrateKbps: Number(exportBitrate) } : {}),
              } } : {}),
            };
            onSave(name, spec);
          }}
        >
          {t("app-projects-quality-profiles-section.profile-dialog.button.7dd68c1dc880")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("app-projects-quality-profiles-section.profile-dialog.button.1ac177cba613")}
        </Button>
      </div>
    </div>
  );
}
