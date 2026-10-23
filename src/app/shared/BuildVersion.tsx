import { BUILD_SHA, BUILD_TIME } from "@/app/build-info";
import { t } from "@/core/i18n/keyed";

/** Full versjon av bygget (commit og tidspunkt) i Konto og på adminsiden (Øystein 23.10). */
export function BuildVersion() {
  return <p data-testid="build-version" className="select-text pb-2 text-xs text-text-tertiary">{t("build.version", { sha: BUILD_SHA, time: BUILD_TIME })}</p>;
}
