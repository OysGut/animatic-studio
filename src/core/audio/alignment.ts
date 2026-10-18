/**
 * Ord-til-lyd (fase 2, bolk D, DEC-0095, REQ-0698–0704): hvert ord i replikken kobles til et tidsrom i et
 * opptak. Koblingen lagres på lydversjonen (migrasjon 0037) i et format som ikke avhenger av tjenesten som
 * laget den (ElevenLabs, senere f.eks. WhisperX, eller manuelt). Ord uten tid er «usikre»; manuell redigering
 * virker alltid, også uten analyse (REQ-0698).
 */
import type { ProjectState } from "../model";
import { audioVersion } from "./index";
import type { AudioComposition } from "./composition";
import { L } from "../i18n";
import { compareVersionCreation } from "../library";

export const ALIGNMENT_FORMAT = 1;
export const ALIGNMENT_MAX_WORDS = 2000;

export interface AlignedWord {
  /** Ordet slik det står i manuset (med tegnsetting). */
  readonly text: string;
  /** Tidsrommet i opptaket (ms), eller null når ordet ikke ble funnet. */
  readonly startMs: number | null;
  readonly endMs: number | null;
  /** Usikkerhet fra tjenesten (lavere er sikrere), eller null. */
  readonly loss: number | null;
  /** Rettet for hånd. */
  readonly manual?: boolean;
}

export interface WordAlignment {
  readonly format: typeof ALIGNMENT_FORMAT;
  /** Replikken koblingen gjelder. */
  readonly blockId: string;
  /** Manusteksten slik den var da koblingen ble laget (for å se om teksten er endret senere). */
  readonly text: string;
  /** Ett element per ord i `text`, i samme rekkefølge. */
  readonly words: readonly AlignedWord[];
  /** «elevenlabs», «manual» … og modellen med versjon. */
  readonly provider: string;
  readonly model: string;
  readonly loss: number | null;
  readonly at: string;
}

export interface LineToken {
  readonly text: string;
  /** Normalisert for sammenligning: små bokstaver, uten tegnsetting. */
  readonly norm: string;
  /** Plass i teksten (tegn). */
  readonly start: number;
  readonly end: number;
}

/** Ordene i en replikk (skilt med mellomrom). */
export function tokenizeLine(text: string): LineToken[] {
  const out: LineToken[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const norm = m[0]
      .normalize("NFC")
      .toLocaleLowerCase("nb")
      .replace(/[^\p{L}\p{N}]+/gu, "");
    out.push({ text: m[0], norm, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Normalisert tekst (for å se om replikken er endret). */
export function normalizedLine(text: string): string {
  return tokenizeLine(text)
    .map((t) => t.norm)
    .filter(Boolean)
    .join(" ");
}

/**
 * Parer ord fra tjenesten med manusets ord (lengste felles følge på normaliserte ord). Ord i manuset som ikke
 * ble funnet, får ingen tid (vises som usikre). Tjenestens tider er i sekunder.
 */
export function alignmentFromProvider(
  blockId: string,
  text: string,
  found: readonly { text: string; start: number; end: number; loss?: number | null }[],
  provider: string,
  model: string,
  loss: number | null,
  at: string,
): WordAlignment {
  const tokens = tokenizeLine(text).slice(0, ALIGNMENT_MAX_WORDS);
  const theirs = found
    .map((w) => ({
      ...w,
      norm: tokenizeLine(w.text)
        .map((t) => t.norm)
        .join(""),
    }))
    .filter((w) => w.norm);
  const n = tokens.length;
  const m = theirs.length;
  // LCS-tabell
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        tokens[i]!.norm && tokens[i]!.norm === theirs[j]!.norm
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const words: AlignedWord[] = tokens.map((t) => ({
    text: t.text,
    startMs: null,
    endMs: null,
    loss: null,
  }));
  for (let i = 0, j = 0; i < n && j < m;) {
    if (tokens[i]!.norm && tokens[i]!.norm === theirs[j]!.norm) {
      const w = theirs[j]!;
      const s = Math.max(0, Math.round(w.start * 1000));
      words[i] = {
        text: tokens[i]!.text,
        startMs: s,
        endMs: Math.max(s + 1, Math.round(w.end * 1000)),
        loss: typeof w.loss === "number" && Number.isFinite(w.loss) ? w.loss : null,
      };
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return { format: ALIGNMENT_FORMAT, blockId, text, words, provider, model, loss, at };
}

/** En tom kobling for manuell redigering (ingen ord har tid ennå). */
export function manualAlignment(blockId: string, text: string, at: string): WordAlignment {
  return alignmentFromProvider(blockId, text, [], "manual", "manual", null, at);
}

/**
 * Er ordet usikkert? (Ingen tid, urimelig kort, eller høy usikkerhet fra tjenesten.) Grensen for usikkerhet
 * er et anslag til tjenesten er prøvd på norsk (KI-245).
 */
export const UNCERTAIN_LOSS = 1.5;
export function wordUncertain(w: AlignedWord): boolean {
  if (w.startMs === null || w.endMs === null) return true;
  if (w.manual) return false;
  if (w.endMs - w.startMs < 40) return true;
  return w.loss !== null && w.loss >= UNCERTAIN_LOSS;
}

/** Det samlede tidsrommet for ordene from..to (begge med), eller null når ingen av dem har tid. */
export function rangeForWords(
  a: WordAlignment,
  from: number,
  to: number,
): { startMs: number; endMs: number } | null {
  let s = Number.POSITIVE_INFINITY;
  let e = Number.NEGATIVE_INFINITY;
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
    const w = a.words[i];
    if (!w || w.startMs === null || w.endMs === null) continue;
    s = Math.min(s, w.startMs);
    e = Math.max(e, w.endMs);
  }
  return Number.isFinite(s) && Number.isFinite(e) ? { startMs: s, endMs: e } : null;
}

/** Retter tiden for et ord for hånd (REQ-0700). */
export function setWordTiming(
  a: WordAlignment,
  index: number,
  startMs: number,
  endMs: number,
): WordAlignment {
  const s = Math.max(0, Math.round(Math.min(startMs, endMs)));
  const e = Math.max(s + 1, Math.round(Math.max(startMs, endMs)));
  return {
    ...a,
    words: a.words.map((w, i) => (i === index ? { ...w, startMs: s, endMs: e, manual: true } : w)),
  };
}

/** Kontroll av en kobling (fra nettleseren). Gir feilmelding eller null. */
export function alignmentError(a: unknown): string | null {
  const bad = L("Ugyldig ordkobling", "Invalid word alignment");
  if (!a || typeof a !== "object") return bad;
  const o = a as Record<string, unknown>;
  if (o["format"] !== ALIGNMENT_FORMAT) return bad;
  for (const k of ["blockId", "text", "provider", "model", "at"])
    if (typeof o[k] !== "string") return bad;
  if ((o["text"] as string).length > 20_000) return bad;
  if (!Array.isArray(o["words"]) || o["words"].length > ALIGNMENT_MAX_WORDS) return bad;
  if (o["loss"] !== null && typeof o["loss"] !== "number") return bad;
  const num = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 36_000_000);
  for (const w of o["words"] as unknown[]) {
    if (!w || typeof w !== "object") return bad;
    const x = w as Record<string, unknown>;
    if (typeof x["text"] !== "string" || x["text"].length > 200) return bad;
    if (!num(x["startMs"]) || !num(x["endMs"])) return bad;
    if ((x["startMs"] === null) !== (x["endMs"] === null)) return bad;
    if (x["startMs"] !== null && (x["endMs"] as number) < (x["startMs"] as number)) return bad;
    if (x["loss"] !== null && typeof x["loss"] !== "number") return bad;
    if (x["manual"] !== undefined && typeof x["manual"] !== "boolean") return bad;
  }
  if (tokenizeLine(o["text"] as string).length !== (o["words"] as unknown[]).length) return bad;
  return null;
}

// ---------------------------------------------------------------- tekst mot lyd

export type WordChange = "same" | "new";

/**
 * Hvilke ord i den nye teksten som er nye eller endret i forhold til teksten lyden bygger på (REQ-0704).
 * `oldIndex` peker på ordet i den gamle teksten for ord som er uendret.
 */
export function textChanges(
  oldText: string,
  newText: string,
): { readonly token: LineToken; readonly change: WordChange; readonly oldIndex: number | null }[] {
  const a = tokenizeLine(oldText);
  const b = tokenizeLine(newText);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] =
        a[i]!.norm === b[j]!.norm
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: { token: LineToken; change: WordChange; oldIndex: number | null }[] = [];
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i]!.norm === b[j]!.norm) {
      out.push({ token: b[j]!, change: "same", oldIndex: i });
      i++;
      j++;
    } else if (i < a.length && dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else {
      out.push({ token: b[j]!, change: "new", oldIndex: null });
      j++;
    }
  }
  return out;
}

/**
 * Foreslått plassering av et nytt opptak for nye ord i replikken (REQ-0704, §29): etter lyden når de nye
 * ordene kommer til slutt, før når de kommer først, ellers i stedet for tidsrommet mellom nabordene som har
 * lyd. Tider er i opptaket koblingen gjelder.
 */
export function suggestPlacement(
  a: WordAlignment,
  newText: string,
  selected: { from: number; to: number },
):
  | { readonly mode: "after" }
  | { readonly mode: "before" }
  | { readonly mode: "range"; readonly startMs: number; readonly endMs: number } {
  const ch = textChanges(a.text, newText);
  const lo = Math.min(selected.from, selected.to);
  const hi = Math.max(selected.from, selected.to);
  const timed = (k: number) => {
    const o = ch[k]?.oldIndex;
    const w = o === null || o === undefined ? undefined : a.words[o];
    return w && w.startMs !== null && w.endMs !== null ? w : null;
  };
  let prev: AlignedWord | null = null;
  for (let k = lo - 1; k >= 0 && !prev; k--) prev = timed(k);
  let next: AlignedWord | null = null;
  for (let k = hi + 1; k < ch.length && !next; k++) next = timed(k);
  if (!next) return { mode: "after" };
  if (!prev) return { mode: "before" };
  // Ord som er byttet ut (gamle ord mellom naboene), erstattes; ellers settes opptaket inn i pausen
  return { mode: "range", startMs: prev.endMs!, endMs: next.startMs! };
}

// ---------------------------------------------------------------- tid i komposisjonen

/** Hvor et tidspunkt i et kildeopptak havner i komposisjonen (første del som spiller det), eller null. */
export function sourceToComposition(
  c: AudioComposition,
  versionId: string,
  ms: number,
): number | null {
  for (const s of [...c.segments].sort((x, y) => x.track - y.track || x.atMs - y.atMs))
    if (s.versionId === versionId && ms >= s.sourceInMs && ms <= s.sourceInMs + s.lengthMs)
      return s.atMs + (ms - s.sourceInMs);
  return null;
}

/** Hvilket kildeopptak og tidspunkt et tidspunkt i komposisjonen spiller (dialogsporet først). */
export function compositionToSource(
  c: AudioComposition,
  ms: number,
): { versionId: string; ms: number } | null {
  for (const s of [...c.segments].sort((x, y) => x.track - y.track || x.atMs - y.atMs))
    if (ms >= s.atMs && ms <= s.atMs + s.lengthMs)
      return { versionId: s.versionId, ms: s.sourceInMs + (ms - s.atMs) };
  return null;
}

// ---------------------------------------------------------------- status (REQ-0703)

export type LineAudioStatus = "no_audio" | "changed_text" | "new_take" | "approved" | "synced";

export const LINE_STATUS_LABEL = {
  get no_audio() {
    return L("Ny tekst uten lyd", "New text without audio");
  },
  get changed_text() {
    return L("Endret tekst med gammel lyd", "Changed text with old audio");
  },
  get new_take() {
    return L("Nytt opptak til gjennomgang", "New recording to review");
  },
  get approved() {
    return L("Godkjent oppdatert tekst og lyd", "Approved updated text and audio");
  },
  get synced() {
    return L("Synkronisert", "In sync");
  },
} as const satisfies Record<LineAudioStatus, string>;

/** Tegnet som vises i tillegg til fargen (ikke bare farge). */
export const LINE_STATUS_MARK: Record<LineAudioStatus, string> = {
  no_audio: "○",
  changed_text: "△",
  new_take: "◆",
  approved: "✓",
  synced: "●",
};

/**
 * Status for tekst mot lyd for en replikk i en scene. Påvirker aldri manuseksporten. Uten ordkobling kan ikke
 * en endret tekst oppdages; da regnes lyden som synkronisert.
 */
export function lineAudioStatus(
  s: ProjectState,
  occurrenceId: string,
  blockId: string,
): LineAudioStatus {
  const block = s.blocks[blockId];
  const clip = Object.values(s.audioClips)
    .filter((a) => !a.removed && a.occurrenceId === occurrenceId && a.blockId === blockId)
    .sort((a, b) => a.offsetMs - b.offsetMs)[0];
  if (!block || !clip) return "no_audio";
  const v = audioVersion(s, clip);
  if (!v) return "no_audio";
  if (v.alignment && normalizedLine(v.alignment.text) !== normalizedLine(block.text))
    return "changed_text";
  const va = s.assetVariants[v.variantId];
  const newer = Object.values(s.assetVersions).some((x) => {
    if (x.removed || x.id === v.id) return false;
    const xa = s.assetVariants[x.variantId];
    return xa?.assetId === va?.assetId && compareVersionCreation(x, v) > 0;
  });
  if (newer) return "new_take";
  if (va?.approvedVersionId === v.id && v.alignment) return "approved";
  return "synced";
}
