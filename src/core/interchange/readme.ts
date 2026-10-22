import { t } from "../i18n/keyed";

/** Both languages are always included, independently of the interface language. */
export function interchangeReadme(extra = ""): Uint8Array {
  return new TextEncoder().encode([
    "From Pen to Glass", "", t("ptg1.readme", {}, "nb"), "", t("ptg1.readme", {}, "en"), "", extra,
  ].join("\n"));
}