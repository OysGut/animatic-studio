/**
 * Opphavet til en ressursversjon (REQ-0121, DEC-0078): lastet opp, laget med AI, frilagt eller harmonisert.
 *
 * Versjonen har ikke eget felt for opphav (AssetVersion i model.ts). Opphavet utledes fra det som finnes:
 * 1. AI-jobben som laget filen (`generation_jobs.result_path` = versjonens `mediaPath`, som i arbeidslisten),
 *    med leverandør og modell fra jobben;
 * 2. merknaden programmet skriver på versjonen («Generert med AI (modell)», «Frilagt fra v2», «Lest inn med
 *    AI …», «Erstatter v3 (lastet opp på nytt)»);
 * 3. filnavnet AI-tjenestene gir resultatet («ai-2026-10-11.png», «ai-lyd-….mp3»).
 * Alt annet regnes som lastet opp. Harmonisering (REQ-0153, fase 8) finnes ikke ennå; en versjon med merknaden
 * «Harmonisert …» eller en jobb med `params.operation = "harmonize"` vises som harmonisert.
 */
import { L, localized } from "../i18n";
import type { AssetVersion, ProjectState } from "../model";
import type { GenerationJob } from "../generation/cost";

export type VersionOrigin = "upload" | "ai" | "cutout" | "harmonized";

export const VERSION_ORIGINS: readonly VersionOrigin[] = ["upload", "ai", "cutout", "harmonized"];

export const VERSION_ORIGIN_LABEL: Record<VersionOrigin, string> = localized({
  upload: ["Lastet opp", "Uploaded"],
  ai: ["Laget med AI", "Made with AI"],
  cutout: ["Frilagt", "Cut out"],
  harmonized: ["Harmonisert", "Harmonised"],
});

export interface VersionProvenance {
  readonly origin: VersionOrigin;
  /** Leverandør (f.eks. «lovable», «elevenlabs»), om den er kjent. */
  readonly provider: string | null;
  /** Modellen, om den er kjent. */
  readonly model: string | null;
  /** AI-jobben som laget filen, om den er funnet. */
  readonly jobId: string | null;
  /** Versjonsnummeret bildet er frilagt fra / erstatter (samme variant). */
  readonly fromNumber: number | null;
  /** Lastet opp på nytt etter nedlasting (DEC-0064). */
  readonly reupload: boolean;
  /** Hvordan opphavet er funnet: jobben, merknaden, filnavnet eller ingenting (= lastet opp). */
  readonly basis: "job" | "note" | "file_name" | "none";
}

const AI_NOTE = /^(?:Generert|Lest inn) med AI(?:-stemmen)?(?:\s*\(([^)]+)\))?/i;
const CUTOUT_NOTE = /^Frilagt fra v(\d+)/i;
const HARMONIZED_NOTE = /^Harmonisert/i;
const REUPLOAD_NOTE = /^(?:Erstatter|Endret fra) v(\d+)/i;
const AI_FILE = /\/ai-(?:lyd-)?\d{4}-\d{2}-\d{2}[^/]*$/;

/** «leverandør/modell» deles opp; ellers er alt modellen. */
function splitModel(m: string): { provider: string | null; model: string } {
  const t = m.trim();
  const i = t.indexOf("/");
  // «openai/gpt-image-1» er modellnavnet hos Lovable; bare «elevenlabs/…» o.l. har leverandøren først
  if (i > 0 && /^(elevenlabs|lovable|fal|replicate|runway|luma|kling)$/i.test(t.slice(0, i)))
    return { provider: t.slice(0, i).toLowerCase(), model: t.slice(i + 1) };
  return { provider: null, model: t };
}

/** AI-jobbene per resultatfil (bare ferdige jobber med fil). */
export function jobsByResultPath(
  jobs: readonly GenerationJob[] | undefined,
): ReadonlyMap<string, GenerationJob> {
  const m = new Map<string, GenerationJob>();
  for (const j of jobs ?? []) if (j.resultPath && j.status !== "failed") m.set(j.resultPath, j);
  return m;
}

/** Opphavet til én versjon. */
export function versionProvenance(
  v: Pick<AssetVersion, "mediaPath" | "note">,
  jobByPath: ReadonlyMap<string, GenerationJob> = new Map(),
): VersionProvenance {
  const none = { provider: null, model: null, jobId: null, fromNumber: null, reupload: false };
  const note = v.note.trim();
  const job = jobByPath.get(v.mediaPath);
  if (job) {
    const op = job.params?.["operation"];
    return {
      ...none,
      origin: op === "harmonize" || HARMONIZED_NOTE.test(note) ? "harmonized" : "ai",
      provider: job.provider || null,
      model: job.model || null,
      jobId: job.id,
      basis: "job",
    };
  }
  if (HARMONIZED_NOTE.test(note)) return { ...none, origin: "harmonized", basis: "note" };
  const cut = CUTOUT_NOTE.exec(note);
  if (cut) return { ...none, origin: "cutout", fromNumber: Number(cut[1]), basis: "note" };
  const ai = AI_NOTE.exec(note);
  if (ai) {
    const m = ai[1] ? splitModel(ai[1]) : null;
    return {
      ...none,
      origin: "ai",
      provider: m?.provider ?? null,
      model: m?.model ?? null,
      basis: "note",
    };
  }
  if (AI_FILE.test(v.mediaPath)) return { ...none, origin: "ai", basis: "file_name" };
  const re = REUPLOAD_NOTE.exec(note);
  if (re)
    return { ...none, origin: "upload", fromNumber: Number(re[1]), reupload: true, basis: "note" };
  return { ...none, origin: "upload", basis: "none" };
}

/** Opphavet til alle versjonene i prosjektet (nøkkel: versjons-ID). */
export function versionProvenances(
  s: ProjectState,
  jobs?: readonly GenerationJob[],
): ReadonlyMap<string, VersionProvenance> {
  const byPath = jobsByResultPath(jobs);
  return new Map(
    Object.values(s.assetVersions).map((v) => [v.id, versionProvenance(v, byPath)] as const),
  );
}

/** Kort tekst til merket på versjonen: «Laget med AI · gpt-image-1», «Frilagt fra v2» … */
export function provenanceLabel(p: VersionProvenance): string {
  if (p.origin === "ai") return p.model ? `AI · ${p.model}` : VERSION_ORIGIN_LABEL.ai;
  if (p.origin === "cutout")
    return p.fromNumber
      ? L(`Frilagt fra v${p.fromNumber}`, `Cut out from v${p.fromNumber}`)
      : VERSION_ORIGIN_LABEL.cutout;
  if (p.origin === "upload" && p.reupload)
    return p.fromNumber
      ? L(`Lastet opp på nytt (fra v${p.fromNumber})`, `Re-uploaded (from v${p.fromNumber})`)
      : L("Lastet opp på nytt", "Re-uploaded");
  return VERSION_ORIGIN_LABEL[p.origin];
}

/** Lengre forklaring (verktøytips). */
export function provenanceDetail(p: VersionProvenance): string {
  const parts: string[] = [VERSION_ORIGIN_LABEL[p.origin]];
  if (p.provider) parts.push(L(`leverandør: ${p.provider}`, `provider: ${p.provider}`));
  if (p.model) parts.push(L(`modell: ${p.model}`, `model: ${p.model}`));
  if (p.fromNumber && p.origin === "cutout")
    parts.push(L(`frilagt fra versjon ${p.fromNumber}`, `cut out from version ${p.fromNumber}`));
  if (p.reupload && p.fromNumber)
    parts.push(L(`endret fra versjon ${p.fromNumber}`, `changed from version ${p.fromNumber}`));
  parts.push(
    p.basis === "job"
      ? L("fra AI-jobben", "from the AI job")
      : p.basis === "note"
        ? L("fra merknaden på versjonen", "from the note on the version")
        : p.basis === "file_name"
          ? L("fra filnavnet (jobben er ikke funnet)", "from the file name (job not found)")
          : L("ingen AI-jobb eller merknad", "no AI job or note"),
  );
  return parts.join(" · ");
}

/** Opphavene versjonene av en ressurs har (for filteret i biblioteket). */
export function assetOrigins(
  s: ProjectState,
  assetId: string,
  provenance: ReadonlyMap<string, VersionProvenance>,
): ReadonlySet<VersionOrigin> {
  const out = new Set<VersionOrigin>();
  for (const v of Object.values(s.assetVersions)) {
    if (s.assetVariants[v.variantId]?.assetId !== assetId) continue;
    const p = provenance.get(v.id);
    if (p) out.add(p.origin);
  }
  return out;
}
