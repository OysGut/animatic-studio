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

/** WAV-hode (44 byte) for 16 bit PCM. */
export function wavHeader(frames: number, channels: number, sampleRate: number): Uint8Array {
  const dataBytes = frames * channels * 2;
  const buf = new ArrayBuffer(44);
  const v = new DataView(buf);
  const str = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  return new Uint8Array(buf);
}

/** 16 bit PCM, flettet (venstre, høyre, …), for en bit av sporet. */
function pcm16(l: Float32Array, r: Float32Array, frames: number): Uint8Array {
  const out = new Uint8Array(frames * 4);
  const v = new DataView(out.buffer);
  for (let i = 0; i < frames; i++) {
    const a = Math.max(-1, Math.min(1, l[i] ?? 0));
    const b = Math.max(-1, Math.min(1, r[i] ?? 0));
    v.setInt16(i * 4, a < 0 ? Math.round(a * 0x8000) : Math.round(a * 0x7fff), true);
    v.setInt16(i * 4 + 2, b < 0 ? Math.round(b * 0x8000) : Math.round(b * 0x7fff), true);
  }
  return out;
}

/**
 * Lengste dialogspor i én fil: 3 timer (ca. 2 GB i 48 kHz stereo – det nettlesere klarer å holde). Sporet
 * lages i biter som kodes med en gang (KI-120), så nettleseren bare holder den ferdige filen (4 byte per
 * bilde i stedet for 12), og den kan legges som en Blob. WAV-formatet tåler uansett høyst 4 GB.
 */
export const STEM_MAX_SECONDS = 3 * 60 * 60;

/** Største datamengde i en WAV-fil (lengdefeltet er 32 bit). */
const WAV_MAX_DATA_BYTES = 0xffffffff - 44;

/**
 * Mikser dialogsporet for tidsrommet [from, from + seconds) i biter og gir WAV-filen som deler (hode +
 * biter), klare for en Blob. `onProgress` får sekunder ferdig og totalt.
 */
export async function exportDialogueStemParts(o: {
  readonly items: readonly FilmAudioItem[];
  readonly bank: AudioBank;
  readonly from: number;
  readonly seconds: number;
  readonly sampleRate?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}): Promise<{ readonly parts: readonly Uint8Array[]; readonly bytes: number }> {
  const rate = o.sampleRate ?? 48000;
  // Grensen regnes også i byte, så en høyere samplingsfrekvens aldri gir et lengdefelt som flyter over
  const seconds = Math.min(o.seconds, STEM_MAX_SECONDS, Math.floor(WAV_MAX_DATA_BYTES / 4 / rate));
  const total = Math.max(1, Math.ceil(seconds * rate));
  const items = dialogueItems(o.items);
  const parts: Uint8Array[] = [wavHeader(total, 2, rate)];
  const CHUNK = 30;
  let written = 0;
  for (let t = 0; t < seconds - 1e-9 && written < total; t += CHUNK) {
    if (o.signal?.aborted) throw new DOMException("Avbrutt", "AbortError");
    const len = Math.min(CHUNK, seconds - t);
    const buf = await renderAudio(items, o.bank, o.from + t, len, rate);
    const at = Math.round(t * rate);
    const want = Math.min(total, Math.round((t + len) * rate)) - at;
    const l = buf.getChannelData(0);
    const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
    parts.push(pcm16(l, r, want));
    written = at + want;
    o.onProgress?.(t + len, seconds);
    await new Promise((res) => setTimeout(res, 0));
  }
  // Det som mangler (avrunding), fylles med stillhet så lengden stemmer med hodet
  if (written < total) parts.push(new Uint8Array((total - written) * 4));
  return { parts, bytes: 44 + total * 4 };
}

/** Som exportDialogueStemParts, men samlet i én byte-tabell (for tester og små utvalg). */
export async function exportDialogueStem(
  o: Parameters<typeof exportDialogueStemParts>[0],
): Promise<Uint8Array> {
  const { parts, bytes } = await exportDialogueStemParts(o);
  const out = new Uint8Array(bytes);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
