/**
 * Faktaarket brukes alltid (Øystein 23.10): «Skriv med AI» og «Skriv på nytt med AI» bygger på manusets
 * beskrivelse av ressursen. Mangler faktaarket, lages studien først (samme som VisualBriefEditor), lagres
 * på ressursen og brukes deretter. Finnes det, legges det alltid inn som egen, autoritativ seksjon – uansett
 * hva som står i tekstfeltet. Samme regel gjelder bildegenereringen.
 *
 * Ren TypeScript: kallene (språkmodell, lagring) gis inn av adapteren, så rekkefølgen kan prøves uten nett.
 */
import { mainProduction, type Asset, type ProjectState } from "../model";
import { ASSET_KIND_LABEL, coverVersion } from "../library/index";
import { visualBriefUserText } from "./style-analysis";
import { scriptMentions, visualBriefFacts } from "./image-prompt";

export const FACT_SHEET_HEADING =
  "VISUAL FACT SHEET (authoritative for appearance; the text after it may refine details but never contradict or remove these facts):";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Inneholder teksten allerede alle fakta i arket (som linjer, eventuelt omformatert)? */
export function containsFactSheet(text: string, sheet: string | undefined): boolean {
  const facts = visualBriefFacts(sheet);
  if (!facts.length) return true;
  const t = norm(text);
  return facts.every((f) => t.includes(norm(f)));
}

/**
 * Teksten med faktaarket først (bare når det mangler i teksten). Blir det for langt, kortes brukerens tekst,
 * aldri faktaarket.
 */
export function withFactSheet(text: string, sheet: string | undefined, maxChars = Infinity): string {
  const s = (sheet ?? "").trim();
  if (!s || containsFactSheet(text, s)) return text;
  const head = `${FACT_SHEET_HEADING}\n${s}\n\n`;
  const rest = text.trim();
  return (head + rest).slice(0, Math.max(head.length, maxChars));
}

/** Studien av manuset: brukermeldingen og omslagsbildet (samme grunnlag som VisualBriefEditor). */
export function factSheetStudy(
  state: ProjectState,
  asset: Asset,
): { readonly text: string; readonly images: readonly { readonly path: string; readonly label: string }[] } {
  const main = mainProduction(state);
  const mentions = main
    ? scriptMentions(state, main.id, asset, 10, 2500).map((m) =>
        m.dialogue ? `${m.speaker}: "${m.text}"` : m.text,
      )
    : [];
  const cover = coverVersion(state, asset.id);
  const img = cover && cover.mimeType.startsWith("image/") ? cover : null;
  const variant = img ? state.assetVariants[img.variantId] : undefined;
  return {
    text: visualBriefUserText({
      name: asset.name,
      kind: ASSET_KIND_LABEL[asset.kind],
      description: asset.description,
      appearance: variant?.appearance ?? "",
      mentions,
      imageLabels: img ? [`the current design of ${asset.name} (v${img.number})`] : [],
    }),
    images: img ? [{ path: img.mediaPath, label: `the current design of ${asset.name}` }] : [],
  };
}

/** Kallene «Skriv med AI» gjør: studien først når faktaarket mangler, så selve teksten. */
export function writeWithAiCalls(asset: Pick<Asset, "visualBrief">): readonly ("study" | "prompt")[] {
  return (asset.visualBrief ?? "").trim() ? ["prompt"] : ["study", "prompt"];
}

export interface FactSheetRef {
  /** Ressursens revisjon med dette faktaarket. */
  readonly assetRevision: number;
  /** SHA-256 av faktaarkets tekst (sporbarhet uten å lagre teksten på nytt). */
  readonly digest: string;
  readonly studyJobId: string | null;
}

export type StudyOutcome =
  | { readonly ok: true; readonly text: string; readonly jobId: string }
  | { readonly ok: false; readonly message: string };
export type SaveOutcome<S> =
  | { readonly ok: true; readonly ref: Omit<FactSheetRef, "studyJobId">; readonly saved: S }
  | { readonly ok: false; readonly message: string };

/**
 * Rekkefølgen: finnes faktaarket, brukes det; ellers studie → lagring → tekst. Feiler studien eller
 * lagringen, skrives ingen tekst (ingen stille fortsettelse uten faktaark).
 */
export async function promptWithFactSheet<R, S>(input: {
  readonly existing: { readonly text: string; readonly ref: Omit<FactSheetRef, "studyJobId"> } | null;
  readonly study: () => Promise<StudyOutcome>;
  readonly save: (text: string, studyJobId: string) => Promise<SaveOutcome<S>>;
  readonly write: (sheet: string, ref: FactSheetRef) => Promise<R>;
}): Promise<
  | { readonly ok: true; readonly result: R; readonly saved: S | null }
  | { readonly ok: false; readonly stage: "study" | "save"; readonly message: string }
> {
  if (input.existing && input.existing.text.trim())
    return {
      ok: true,
      result: await input.write(input.existing.text, { ...input.existing.ref, studyJobId: null }),
      saved: null,
    };
  const study = await input.study();
  if (!study.ok) return { ok: false, stage: "study", message: study.message };
  const saved = await input.save(study.text, study.jobId);
  if (!saved.ok) return { ok: false, stage: "save", message: saved.message };
  return {
    ok: true,
    result: await input.write(study.text, { ...saved.ref, studyJobId: study.jobId }),
    saved: saved.saved,
  };
}
