/**
 * Sporbarhet per generering (DEC-0072, REQ-0257): det som trengs for å vite nøyaktig hva en AI-jobb ble laget
 * av – systeminstruks, beskrivelse (i jobben), modell og parametere, referanser med ressursversjon,
 * manusversjon og manuslinjenes revisjoner, kostnad, resultat, tid og status (i jobben). Lagres i
 * `generation_jobs.params.trace` av serveren når jobben registreres.
 */
import { PROMPT_WRITER_SYSTEM } from "./prompt-writer";
import { L, localized } from "../i18n";

export interface TraceReference {
  readonly path: string;
  readonly versionId: string | null;
  readonly assetId: string | null;
  readonly assetName: string | null;
  readonly variantName: string | null;
  readonly number: number | null;
}

export interface GenerationTrace {
  readonly v: 1;
  /**
   * Systeminstruksen modellen fikk, som nøkkel (teksten ligger i programmet, se SYSTEM_INSTRUCTIONS), eller null
   * når bare beskrivelsen ble sendt. Lagres som nøkkel og kontrollsum for å holde jobben innenfor databasens
   * grense for parametere.
   */
  readonly systemInstruction: string | null;
  /** Kontrollsum av teksten da jobben ble laget (viser om instruksen er endret siden). */
  readonly systemInstructionHash?: string;
  /** Linjenes revisjoner ble utelatt fordi scenen var for lang til å lagres i jobben. */
  readonly blockRevisionsOmitted?: boolean;
  /** Modellparametere (lengde, format, antall …). */
  readonly modelParams: Readonly<Record<string, string | number | boolean | null>>;
  readonly references: readonly TraceReference[];
  /** Siste lagrede manusversjon da jobben ble registrert. */
  readonly scriptVersion: {
    readonly id: string;
    readonly number: number;
    readonly name: string;
  } | null;
  /** Revisjonen av hver manuslinje i scenen (når jobben gjelder en scene). */
  readonly blockRevisions: Readonly<Record<string, number>>;
  readonly occurrenceId: string | null;
  readonly segmentId: string | null;
}

/** Systeminstruksene programmet bruker, per nøkkel. */
export const SYSTEM_INSTRUCTIONS: Readonly<Record<string, { label: () => string; text: string }>> =
  {
    "prompt-writer": {
      label: () => L("Beskrivelsesskriveren (Lovable AI)", "Description writer (Lovable AI)"),
      text: PROMPT_WRITER_SYSTEM,
    },
  };

/** Kort kontrollsum (FNV-1a, 32 bit) – bare for å se om en tekst er endret. */
export function textHash(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Største sporet (JSON-tegn) som lagres; jobbens parametere har en grense i databasen (4000 byte). */
export const TRACE_MAX_CHARS = 3000;

/**
 * Gjør sporet lite nok til å lagres: først utelates linjenes revisjoner, så referansenes navn. Sporet skal
 * aldri stoppe en jobb.
 */
export function fitTrace(t: GenerationTrace, max = TRACE_MAX_CHARS): GenerationTrace {
  const size = (x: GenerationTrace) => new TextEncoder().encode(JSON.stringify(x)).length;
  if (size(t) <= max) return t;
  let out: GenerationTrace = { ...t, blockRevisions: {}, blockRevisionsOmitted: true };
  if (size(out) <= max) return out;
  out = {
    ...out,
    references: out.references.map((r) => ({ ...r, assetName: null, variantName: null })),
  };
  if (size(out) <= max) return out;
  return { ...out, references: out.references.slice(0, 3) };
}

/** Leser sporet fra en jobbs parametere; null for eldre jobber uten spor. */
export function traceOf(params: unknown): GenerationTrace | null {
  if (!params || typeof params !== "object") return null;
  const t = (params as { trace?: unknown }).trace;
  if (!t || typeof t !== "object" || (t as { v?: unknown }).v !== 1) return null;
  return t as GenerationTrace;
}

/** Korte linjer til visning av sporet. */
export function traceLines(t: GenerationTrace): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  const sys = t.systemInstruction ? SYSTEM_INSTRUCTIONS[t.systemInstruction] : undefined;
  out.push({
    label: L("Systeminstruks", "System instruction"),
    text: !t.systemInstruction
      ? L("Ingen – bare beskrivelsen ble sendt", "None – only the description was sent")
      : sys
        ? `${sys.label()}${t.systemInstructionHash && textHash(sys.text) !== t.systemInstructionHash ? L(" (teksten er endret siden)", " (the text has changed since)") : ""}`
        : t.systemInstruction,
  });
  const params = Object.entries(t.modelParams)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${PARAM_LABEL[k] ?? k}: ${String(v)}`);
  out.push({
    label: L("Parametere", "Parameters"),
    text: params.length ? params.join(" · ") : L("Standard", "Default"),
  });
  out.push({
    label: L("Referanser", "References"),
    text: t.references.length
      ? t.references
          .map((r) =>
            r.assetName
              ? `${r.assetName}${r.variantName ? ` – ${r.variantName}` : ""}${r.number ? ` v${r.number}` : ""}`
              : r.path.split("/").pop()!,
          )
          .join(", ")
      : L("Ingen", "None"),
  });
  out.push({
    label: L("Manusversjon", "Script version"),
    text: t.scriptVersion
      ? `${t.scriptVersion.number}: ${t.scriptVersion.name}`
      : L("Ingen lagret manusversjon", "No saved script version"),
  });
  const n = Object.keys(t.blockRevisions).length;
  if (n)
    out.push({
      label: L("Manuslinjer", "Script lines"),
      text: L(
        `${n} linjer i scenen med revisjon lagret`,
        `${n} lines in the scene with revision saved`,
      ),
    });
  else if (t.blockRevisionsOmitted)
    out.push({
      label: L("Manuslinjer", "Script lines"),
      text: L(
        "Scenen var for lang til at revisjonene ble lagret",
        "The scene was too long for the revisions to be saved",
      ),
    });
  return out;
}

const PARAM_LABEL: Record<string, string> = localized({
  seconds: ["Sekunder", "Seconds"],
  aspect: ["Format", "Format"],
  loop: ["Sløyfe", "Loop"],
  voiceId: ["Stemme", "Voice"],
  purpose: ["Bruk", "Use"],
  identityFirst: ["Identitet først", "Identity first"],
  candidates: ["Kandidater", "Candidates"],
  images: ["Bilder", "Images"],
});
