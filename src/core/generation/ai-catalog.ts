/**
 * Katalogen slik administrator og serveren ser den (Mars 15.10.2026, DEC-0088): den innebygde katalogen
 * (PROVIDERS) slått sammen med administratorens innstillinger (ai_model_settings). Ren logikk.
 */
import { L, locale } from "../i18n";
import {
  PROVIDERS,
  builtInModel,
  customModelsOf,
  providerModel,
  qualityMechanisms,
  type Capability,
  type ProviderId,
  type ProviderModel,
} from "./providers";
import {
  ALL_MODELS,
  customRuleFor,
  disabledMessage,
  disabledReason,
  findSetting,
  isProviderEnabled,
  type ModelKind,
  type ModelSetting,
} from "./model-settings";

export interface CatalogModelRow {
  readonly provider: ProviderId;
  readonly id: string;
  readonly label: string;
  readonly capability: Capability | null;
  readonly priceUsd: number | null;
  readonly priceUnit: ProviderModel["priceUnit"] | null;
  /** Hva modellen kan (kvalitetsmekanismene), korte tekster. */
  readonly features: readonly string[];
  /** Modellens egen bryter (uavhengig av leverandøren). */
  readonly enabled: boolean;
  /** Kan brukes nå (både leverandøren og modellen er på). */
  readonly usable: boolean;
  readonly custom: boolean;
  readonly kind: ModelKind | null;
  readonly note: string;
  /** Egen modell som programmet ikke lenger kan bruke (ID-en passer ikke med noen familie). */
  readonly broken: boolean;
}

export interface CatalogProviderRow {
  readonly id: ProviderId;
  readonly name: string;
  readonly builtIn: boolean;
  readonly capabilities: readonly Capability[];
  readonly enabled: boolean;
  readonly models: readonly CatalogModelRow[];
}

/** Alle leverandører og modeller (innebygde, så egne) med av/på, pris og hva de kan. */
export function adminCatalog(settings: readonly ModelSetting[]): CatalogProviderRow[] {
  return PROVIDERS.map((p) => {
    const providerOn = isProviderEnabled(settings, p.id);
    const row = (m: ProviderModel, custom: boolean): CatalogModelRow => {
      const s = findSetting(settings, p.id, m.id);
      const enabled = s?.enabled !== false;
      return {
        provider: p.id,
        id: m.id,
        // Egne modeller: navnet administrator ga (merket vises for seg på adminsiden)
        label: custom ? s?.label || m.id : m.label,
        capability: m.capability,
        priceUsd: m.priceUsd,
        priceUnit: m.priceUnit,
        features: qualityMechanisms(m),
        enabled,
        usable: providerOn && enabled && !m.retired,
        custom,
        kind: s?.kind ?? null,
        note: s?.note ?? "",
        broken: false,
      };
    };
    const custom = customModelsOf(p.id, settings);
    const broken: CatalogModelRow[] = settings
      .filter(
        (s) =>
          s.provider === p.id &&
          s.custom &&
          s.model !== ALL_MODELS &&
          !builtInModel(p.id, s.model) &&
          !custom.some((m) => m.id === s.model),
      )
      .map((s) => ({
        provider: p.id,
        id: s.model,
        label: s.label || s.model,
        capability: null,
        priceUsd: s.priceUsd,
        priceUnit: null,
        features: [],
        enabled: s.enabled,
        usable: false,
        custom: true,
        kind: s.kind,
        note: s.note,
        broken: true,
      }));
    return {
      id: p.id,
      name: p.name,
      builtIn: p.builtIn,
      capabilities: p.capabilities,
      enabled: providerOn,
      models: [
        ...p.models.filter((m) => !m.retired).map((m) => row(m, false)),
        ...custom.map((m) => row(m, true)),
        ...broken,
      ],
    };
  });
}

/**
 * Kan modellen bestilles? Brukes av serveren før hvert betalte kall: modellen må finnes (innebygd eller lagt
 * til av administrator), være slått på (både leverandøren og modellen) og kunne oppgaven.
 */
export function modelAvailability(
  settings: readonly ModelSetting[],
  provider: string,
  model: string,
  capabilities?: readonly Capability[],
): { ok: true; model: ProviderModel } | { ok: false; message: string } {
  const why = disabledReason(settings, provider, model);
  if (why) return { ok: false, message: disabledMessage(why) };
  const m = providerModel(provider, model, settings);
  if (!m || m.retired || (capabilities && !capabilities.includes(m.capability)))
    return {
      ok: false,
      message: L(
        "Modellen finnes ikke hos leverandøren.",
        "The model does not exist at the provider.",
      ),
    };
  return { ok: true, model: m };
}

/** «0,04 USD per bilde» (anslag fra katalogen eller administrator). */
export function priceText(priceUsd: number | null, unit: string | null): string {
  if (priceUsd === null) return L("pris ikke oppgitt", "price not given");
  const n = priceUsd.toLocaleString(locale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  switch (unit) {
    case "image":
      return L(`${n} USD per bilde`, `${n} USD per image`);
    case "second":
      return L(`${n} USD per sekund`, `${n} USD per second`);
    case "character":
      return L(`${n} USD per tegn`, `${n} USD per character`);
    case "megapixel":
      return L(`${n} USD per megapiksel`, `${n} USD per megapixel`);
    case "call":
      return L(`${n} USD per kall`, `${n} USD per call`);
    default:
      return `${n} USD`;
  }
}

/** Er (leverandør, modell) en gyldig egen modell etter reglene? (For serverens kontroll av sletting.) */
export function isCustomCandidate(provider: string, kind: string, model: string): boolean {
  return !!customRuleFor(provider, kind, model) && !builtInModel(provider, model);
}
