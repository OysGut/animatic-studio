import { t } from "../i18n/keyed";
import type { InterchangeDoc } from "./types";

/** Both languages are always included, independently of the interface language. */
export function interchangeReadme(extra = ""): Uint8Array {
  return new TextEncoder().encode([
    "From Pen to Glass", "", t("ptg1.readme", {}, "nb"), "", t("ptg1.readme", {}, "en"), "", extra,
  ].join("\n"));
}

/**
 * PTG3: camera section of LESMEG for the AE and FBX packages, in nb and en: the two camera modes,
 * and for each shot without a camera, the shot name and the reason.
 */
export function cameraReadmeLines(doc: InterchangeDoc): string[] {
  const missing = doc.shots.filter(s => !s.camera);
  const out: string[] = [];
  for (const lang of ["nb", "en"] as const) {
    out.push("", t("ptg3.readme-modes", {}, lang));
    if (missing.length) {
      out.push("", t("ptg3.readme-missing-heading", {}, lang));
      for (const s of missing) out.push(`- ${t(`ptg3.missing.${s.cameraMissing ?? "no-rig"}`, { value1: s.name }, lang)}`);
    }
  }
  return out;
}
