/**
 * CA5: leppesynkanalyse i nettleseren. Rhubarb Lip Sync (MIT) som WASM er primær; den lastes lazy
 * og bare på klienten (aldri under SSR). Feiler lasting eller analyse, brukes den regelbaserte
 * reserven fra kjernen (energi + ordkobling). Alt er ikke-destruktivt: resultatet er et forslag
 * til brukeren trykker «Bruk».
 */
import {
  audioHashOf,
  ruleLipsync,
  spansFromRhubarb,
  textHashOf,
  type LipsyncResult,
  type LipsyncSource,
  type VisemeSpan,
} from "@/core/animation/lipsync";
import { LIPSYNC_ALGORITHM_VERSION } from "@/core/animation/lipsync";

export interface AnalyzeInput {
  readonly audioBytes: Uint8Array;
  readonly fps: number;
  readonly words: readonly { readonly startMs: number | null; readonly endMs: number | null; readonly text: string }[];
  readonly dialogText: string;
}

export interface AnalyzeOutput {
  readonly spans: VisemeSpan[];
  readonly source: LipsyncSource;
  readonly audioHash: string;
  readonly textHash: string;
}

/** Dekoder lydfilen og mikser ned til 16 kHz mono 16-bit PCM (Rhubarbs format). */
async function toPcm16(audioBytes: Uint8Array): Promise<{ pcm: Int16Array; sampleRate: number; durationMs: number }> {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const copy = audioBytes.slice().buffer as ArrayBuffer;
  const decoded = await ctx.decodeAudioData(copy);
  const target = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = target.createBufferSource();
  src.buffer = decoded;
  src.connect(target.destination);
  src.start(0);
  const rendered = await target.startRendering();
  const data = rendered.getChannelData(0);
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(data[i]! * 32767)));
  return { pcm, sampleRate: 16000, durationMs: decoded.duration * 1000 };
}

/** RMS-energi per frame, til den regelbaserte reserven. */
export function frameEnergies(pcm: Int16Array, sampleRate: number, fps: number): number[] {
  const perFrame = Math.max(1, Math.floor(sampleRate / fps));
  const out: number[] = [];
  for (let i = 0; i < pcm.length; i += perFrame) {
    let sum = 0;
    const end = Math.min(pcm.length, i + perFrame);
    for (let j = i; j < end; j++) sum += (pcm[j]! / 32768) ** 2;
    out.push(Math.sqrt(sum / (end - i)));
  }
  return out;
}

let rhubarbPromise: Promise<typeof import("rhubarb-lip-sync-wasm")> | null = null;

/** Laster Rhubarb WASM lazy. Returnerer null hvis pakken eller WASM-en ikke kan lastes. */
async function loadRhubarb(): Promise<typeof import("rhubarb-lip-sync-wasm") | null> {
  try {
    rhubarbPromise ??= import("rhubarb-lip-sync-wasm");
    return await rhubarbPromise;
  } catch {
    return null;
  }
}

/** Analyserer lyden. Prøver Rhubarb først; faller tilbake til den regelbaserte motoren. */
export async function analyzeLipsync(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const audioHash = audioHashOf(input.audioBytes);
  const textHash = textHashOf(input.dialogText);
  const { pcm, durationMs } = await toPcm16(input.audioBytes);
  const rhubarb = await loadRhubarb();
  if (rhubarb) {
    try {
      const result = await rhubarb.Rhubarb.getLipSync(Buffer.from(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer), { dialogText: input.dialogText || undefined });
      const spans = spansFromRhubarb(result.mouthCues, input.fps);
      if (spans.length > 0) return { spans, source: "rhubarb", audioHash, textHash };
    } catch {
      // Regelbasert reserve under
    }
  }
  const energies = frameEnergies(pcm, 16000, input.fps);
  void durationMs;
  return { spans: ruleLipsync(energies, input.words, input.fps), source: "rule", audioHash, textHash };
}

/** Bygger et komplett resultat-utkast (uten id/revisjon – det setter kallet som lagrer). */
export function lipsyncDraft(
  id: string,
  clipId: string,
  takeId: string,
  blockId: string | null,
  out: AnalyzeOutput,
  previous: LipsyncResult | null,
): LipsyncResult {
  return {
    id,
    revision: (previous?.revision ?? 0) + 1,
    clipId,
    takeId,
    blockId,
    source: out.source,
    algorithmVersion: LIPSYNC_ALGORITHM_VERSION,
    audioHash: out.audioHash,
    textHash: out.textHash,
    spans: out.spans,
    // Manuelle rettelser overlever ny generering (§32)
    overrides: previous?.overrides ?? [],
    enabled: previous?.enabled ?? true,
    removed: false,
  };
}
