/**
 * Sporbarhet per generering (DEC-0072, REQ-0257): det som trengs for å vite nøyaktig hva en AI-jobb ble laget
 * av – systeminstruks, beskrivelse (i jobben), modell og parametere, referanser med ressursversjon,
 * manusversjon og manuslinjenes revisjoner, kostnad, resultat, tid og status (i jobben). Lagres i
 * `generation_jobs.params.trace` av serveren når jobben registreres.
 */
import { PROMPT_WRITER_SYSTEM } from "./prompt-writer";

import { t as tk, tLocalized } from "@/core/i18n/keyed";

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
      label: () => tk("core-generation-trace.label.label.0ac98d6ad83c"),
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
    label: tk("core-generation-trace.label.label.38ef98b84350"),
    text: !t.systemInstruction
      ? tk("core-generation-trace.text.text.f30c93ef223a")
      : sys
        ? `${sys.label()}${t.systemInstructionHash && textHash(sys.text) !== t.systemInstructionHash ? tk("core-generation-trace.text.text.16d50bae50d1") : ""}`
        : t.systemInstruction,
  });
  const params = Object.entries(t.modelParams)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${PARAM_LABEL[k] ?? k}: ${String(v)}`);
  out.push({
    label: tk("core-generation-trace.label.label.0612058bf76e"),
    text: params.length ? params.join(" · ") : tk("core-generation-trace.text.text.a2626bdecaac"),
  });
  out.push({
    label: tk("core-generation-trace.label.label.660398861c5b"),
    text: t.references.length
      ? t.references
          .map((r) =>
            r.assetName
              ? `${r.assetName}${r.variantName ? ` – ${r.variantName}` : ""}${r.number ? ` v${r.number}` : ""}`
              : r.path.split("/").pop()!,
          )
          .join(", ")
      : tk("core-generation-trace.text.text.ad39b8b19a07"),
  });
  out.push({
    label: tk("core-generation-trace.label.label.3d4622c4a0d8"),
    text: t.scriptVersion
      ? `${t.scriptVersion.number}: ${t.scriptVersion.name}`
      : tk("core-generation-trace.text.text.d75dc2ff1d8b"),
  });
  const n = Object.keys(t.blockRevisions).length;
  if (n)
    out.push({
      label: tk("core-generation-trace.label.label.b68296b54f10"),
      text: tk("core-generation-trace.text.text.8b60ce566948", { n: String(n) }),
    });
  else if (t.blockRevisionsOmitted)
    out.push({
      label: tk("core-generation-trace.label.label.b68296b54f10.2"),
      text: tk("core-generation-trace.text.text.055111b41e2d"),
    });
  return out;
}

const PARAM_LABEL: Record<string, string> = tLocalized({ seconds: "core-generation-trace.param-label.seconds.830a425a4455", aspect: "core-generation-trace.param-label.aspect.ba45bc892764", loop: "core-generation-trace.param-label.loop.9eb135a61b23", voiceId: "core-generation-trace.param-label.voice-id.4eb3814d0a4c", purpose: "core-generation-trace.param-label.purpose.3c914b290620", identityFirst: "core-generation-trace.param-label.identity-first.c78748961219", candidates: "core-generation-trace.param-label.candidates.b84ffba72c72", images: "core-generation-trace.param-label.images.9ced865b0868" });
