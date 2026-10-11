/**
 * Eksport av separate dialogspor (M7 del 3, DEC-0059, REQ-0350): dialog og forteller i ett språk, mikset til
 * én WAV-fil (16 bit PCM, stereo) med samme plassering som avspillingen. Musikk, atmosfære, effekter og lyden
 * i importert film er ikke med. Bare på klienten (OfflineAudioContext).
 */
import { isVoiceKind, type FilmAudioItem } from "@/core";
import { type AudioBank, renderAudio } from "../audio/mixer";

/** Lydklippene som hører til dialogsporet: tale (dialog og forteller), ikke lyden i importert film. */
export function dialogueItems(items: readonly FilmAudioItem[]): FilmAudioItem[] {
  return items.filter((it) => !it.film && !it.clip.muted && isVoiceKind(it.clip.kind));
}

/** Lager en WAV-fil (16 bit PCM) av kanaldata. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const n = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * n * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, n, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * n * 2, true);
  v.setUint16(32, n * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < n; c++) {
      const x = Math.max(-1, Math.min(1, channels[c]![i]!));
      v.setInt16(o, x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff), true);
      o += 2;
    }
  return new Uint8Array(buf);
}

/** Lengste dialogspor som lages i én fil (minnet i nettleseren): 60 minutter (ca. 1,4 GB underveis). */
export const STEM_MAX_SECONDS = 60 * 60;

/**
 * Mikser dialogsporet for tidsrommet [from, from + seconds) i biter og lager én WAV-fil. `onProgress` får
 * sekunder ferdig og totalt.
 */
export async function exportDialogueStem(o: {
  readonly items: readonly FilmAudioItem[];
  readonly bank: AudioBank;
  readonly from: number;
  readonly seconds: number;
  readonly sampleRate?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}): Promise<Uint8Array> {
  const rate = o.sampleRate ?? 48000;
  const seconds = Math.min(o.seconds, STEM_MAX_SECONDS);
  const total = Math.max(1, Math.ceil(seconds * rate));
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const items = dialogueItems(o.items);
  const CHUNK = 30;
  for (let t = 0; t < seconds - 1e-9; t += CHUNK) {
    if (o.signal?.aborted) throw new DOMException("Avbrutt", "AbortError");
    const len = Math.min(CHUNK, seconds - t);
    const buf = await renderAudio(items, o.bank, o.from + t, len, rate);
    const at = Math.round(t * rate);
    const l = buf.getChannelData(0);
    const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
    left.set(l.subarray(0, Math.min(l.length, total - at)), at);
    right.set(r.subarray(0, Math.min(r.length, total - at)), at);
    o.onProgress?.(t + len, seconds);
    await new Promise((res) => setTimeout(res, 0));
  }
  return encodeWav([left, right], rate);
}
