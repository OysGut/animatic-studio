/**
 * M8 (REQ-0854–0862): valg av kvalitetsprofil i genererings- og eksportdialoger. Standard er prosjektets
 * aktive profil; brukeren kan overstyre per generering eller eksport, eller velge «Ingen profil»
 * (oppførselen er da som før profilene fantes). Viser ingenting når prosjektet ikke har profiler.
 */
import { qualityProfileUsage, qualityProfileBudgetError, qualityProfilesOf, type ProjectState, type QualityProfile } from "@/core";
import { useState } from "react";
import { useAiJobs } from "./use-ai-jobs";
import { t } from "@/core/i18n/keyed";

/** «active» = prosjektets aktive profil, «none» = ingen profil, ellers profilens ID. */
export type QualityProfileChoice = "active" | "none" | string;

/** Profilen valget peker på (den aktive ved «active»), eller null. */
export function chosenQualityProfile(
  s: Pick<ProjectState, "project" | "qualityProfiles">,
  choice: QualityProfileChoice,
): QualityProfile | null {
  if (choice === "none") return null;
  if (choice === "active") {
    const id = s.project.activeQualityProfileId;
    const p = id ? s.qualityProfiles[id] : null;
    return p && !p.removed ? p : null;
  }
  const p = s.qualityProfiles[choice];
  return p && !p.removed ? p : null;
}

export function QualityProfilePicker({
  state,
  value,
  onChange,
  disabled,
  stacked = false,
}: {
  state: Pick<ProjectState, "project" | "qualityProfiles">;
  value: QualityProfileChoice;
  onChange: (v: QualityProfileChoice) => void;
  disabled?: boolean;
  stacked?: boolean;
}) {
  const profiles = qualityProfilesOf(state);
  if (profiles.length === 0) return null;
  const activeId = state.project.activeQualityProfileId ?? null;
  const active = activeId ? state.qualityProfiles[activeId] : null;
  return (
    <label className={stacked ? "flex flex-col gap-2 text-xs text-text-secondary" : "flex items-center gap-1.5 text-xs text-text-secondary"}>
      {t("app-ai-quality-profile-picker.quality-profile-picker.label.722c4d3ff42e")}
      <select
        data-testid="quality-profile-picker"
        aria-label={t("app-ai-quality-profile-picker.quality-profile-picker.aria-label.722c4d3ff42e")}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
      >
        <option value="active">
          {active && !active.removed
            ? t("app-ai-quality-profile-picker.quality-profile-picker.option.9f23e80fdb62", { name: String(active.name) })
            : t("app-ai-quality-profile-picker.quality-profile-picker.option.804b180e1838")}
        </option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="none">{t("app-ai-quality-profile-picker.quality-profile-picker.option.162993b5715d")}</option>
      </select>
    </label>
  );
}

/** One shared profile choice and fail-closed budget display for paid dialogs. */
export function useQualityProfile(state: ProjectState | null, requested = 1) {
  const [choice, setChoice] = useState<QualityProfileChoice>("active");
  const profile = state ? chosenQualityProfile(state, choice) : null;
  const jobs = useAiJobs(state?.project.id ?? "", !!state && profile?.spec.budgetLimit != null);
  const used = profile && jobs.data ? qualityProfileUsage(profile.id, jobs.data.jobs, new Date()) : 0;
  const budgetError = profile?.spec.budgetLimit != null
    ? !jobs.data || jobs.isError || jobs.data.monthCount === null
      ? t("app-ai-quality-profile-picker.budget-error.message.9c44e228cc9d")
      : qualityProfileBudgetError(profile.spec.budgetLimit, jobs.data.jobs.length >= 300 ? Math.max(used, jobs.data.monthCount) : used, requested)
    : null;
  return { choice, setChoice, profile, budgetError };
}
export function QualityProfileBudget({ error }: { error: string | null }) {
  return error ? <p role="alert" data-testid="quality-profile-budget" className="text-xs text-status-danger">{error}</p> : null;
}
