import { t } from "../i18n/keyed";
import { getUiLanguage } from "../i18n";

/**
 * G-1b: LESMEG og meldinger i pakkene skrives på brukerens grensesnittspråk og på engelsk (fellesspråket i
 * produksjonsbransjen), ikke fast på norsk og engelsk.
 */
export function readmeLanguage(): string {
  return getUiLanguage();
}
/** To språkversjoner av samme melding, uten å gjenta den når grensesnittet er engelsk. */
export function bilingual(first: string, en: string, sep = "\n"): string {
  return first === en ? en : `${first}${sep}${en}`;
}
import type { InterchangeDoc } from "./types";

/** The interface language and English are included; when they are the same, each text appears once. */
export function interchangeReadme(extra = ""): Uint8Array {
  const lines = ["From Pen to Glass", "", t("ptg1.readme", {}, readmeLanguage()), "", t("ptg1.readme", {}, "en"), "", extra].join("\n").split("\n");
  const seen = new Set<string>();
  const out = readmeLanguage().toLowerCase().startsWith("en")
    ? lines.filter((l) => {
        if (!l.trim()) return true;
        if (seen.has(l)) return false;
        seen.add(l);
        return true;
      })
    : lines;
  return new TextEncoder().encode(out.join("\n"));
}

/**
 * PTG3: camera section of LESMEG for the AE and FBX packages, in nb and en: the two camera modes,
 * and for each shot without a camera, the shot name and the reason.
 */
export function cameraReadmeLines(doc: InterchangeDoc): string[] {
  const missing = doc.shots.filter(s => !s.camera);
  const out: string[] = [];
  for (const lang of [...new Set([readmeLanguage(), "en"])]) {
    out.push("", t("ptg3.readme-modes", {}, lang));
    if (missing.length) {
      out.push("", t("ptg3.readme-missing-heading", {}, lang));
      for (const s of missing) {
        const p = { value1: s.name };
        const line = s.cameraMissing === "no-composition" ? t("ptg3.missing.no-composition", p, lang)
          : s.cameraMissing === "invalid-rig" ? t("ptg3.missing.invalid-rig", p, lang)
          : t("ptg3.missing.no-rig", p, lang);
        out.push(`- ${line}`);
      }
    }
  }
  return out;
}
