/**
 * Innsatsnivå per oppgave (mandat 19.3–19.4, REQ-0275–0278, DEC-0070): «Rask / Økonomisk», «Balansert» eller
 * «Høy / Premium». Valget velger modellen som passer best blant leverandørene prosjektet har, og viser hvilke
 * kvalitetsmekanismer den modellen faktisk har. Modellen kan fortsatt velges direkte; da følger nivået med.
 * Programmet lover ikke at dyrere gir bedre resultat.
 */
import { effortDisclaimer, EFFORT_HELP, EFFORT_LABEL, effortChoice, effortOf, qualityMechanisms, type Capability, type EffortLevel, type ModelChoice } from "@/core";
import { t } from "@/core/i18n/keyed";

const LEVELS: readonly EffortLevel[] = ["fast", "balanced", "premium"];

export function EffortPicker({
  capability,
  connected,
  chosen,
  onChoose,
  disabled,
}: {
  capability: Capability;
  connected: ReadonlySet<string>;
  /** Modellen som er valgt nå. */
  chosen: ModelChoice | null;
  onChoose: (choice: ModelChoice, level: EffortLevel) => void;
  disabled?: boolean;
}) {
  const level = effortOf(chosen?.model);
  const mechanisms = chosen ? qualityMechanisms(chosen.model) : [];
  return (
    <div className="flex flex-col gap-1">
      <div
        role="radiogroup"
        aria-label={t("app-ai-effort-picker.effort-picker.aria-label.1963c68e41a4")}
        className="flex w-fit overflow-hidden rounded-sm border border-border-control"
      >
        {LEVELS.map((l) => {
          const pick = effortChoice(capability, l, connected);
          const active = chosen !== null && level === l;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || !pick}
              title={EFFORT_HELP[l]}
              onClick={() => pick && onChoose(pick, l)}
              className={
                "h-7 px-2.5 text-xs disabled:opacity-40 " +
                (active
                  ? "bg-accent-selection text-text-primary"
                  : "bg-surface-3 text-text-secondary hover:bg-surface-2")
              }
            >
              {EFFORT_LABEL[l]}
            </button>
          );
        })}
      </div>
      {chosen ? (
        <p className="text-[11px] text-text-tertiary">
          {chosen.provider.name} – {chosen.model.label}
          {mechanisms.length
            ? t("app-ai-effort-picker.effort-picker.p.172bf9c50173", { value1: String(mechanisms.join(", ")) })
            : ""}
          . {effortDisclaimer()}
        </p>
      ) : null}
    </div>
  );
}
