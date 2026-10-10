/**
 * Lydmotor (M4 del 2, mandat 13.3 og 14.1, DEC-0044): dekoder lydfiler og legger lydklippene på riktig
 * tid med volum og inn-/uttoning. Samme plassering brukes ved avspilling (AudioContext) og eksport
 * (OfflineAudioContext), så det du hører er det som eksporteres. Bare på klienten (Web Audio).
 */
import { volumeKeyDbAt, type AudioKind, type FilmAudioItem } from "@/core";

/** Dekodede lydfiler per mediesti, delt mellom avspilling og eksport. */
export class AudioBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();
  private readonly failed = new Set<string>();
  private decoder: BaseAudioContext | null = null;
  constructor(private readonly onLoad?: () => void) {}

  get(path: string): AudioBuffer | undefined {
    return this.buffers.get(path);
  }
  hasFailed(path: string): boolean {
    return this.failed.has(path);
  }

  /** Henter og dekoder lydfilen (én gang). null hvis den ikke kan leses. */
  load(path: string, url: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(path);
    if (have) return Promise.resolve(have);
    const p = this.pending.get(path);
    if (p) return p;
    const job = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const bytes = await res.arrayBuffer();
        this.decoder ??= new OfflineAudioContext(1, 1, 48000);
        const buf = await this.decoder.decodeAudioData(bytes);
        this.buffers.set(path, buf);
        this.onLoad?.();
        return buf;
      } catch {
        this.failed.add(path);
        return null;
      } finally {
        this.pending.delete(path);
      }
    })();
    this.pending.set(path, job);
    return job;
  }

  /** Laster alle lydfilene i lista (mediesti → lenke). */
  async loadAll(urls: Readonly<Record<string, string>>): Promise<void> {
    await Promise.all(Object.entries(urls).map(([p, u]) => this.load(p, u)));
  }
}

/** Volumet for et klipp på et tidspunkt (s i filmen), med inn- og uttoning. */
export function envelopeAt(it: FilmAudioItem, t: number): number {
  const end = it.start + it.length;
  if (t < it.start || t > end) return 0;
  // Overlappende toninger deles forholdsmessig
  let fi = it.fadeIn;
  let fo = it.fadeOut;
  if (fi + fo > it.length && fi + fo > 0) {
    const k = it.length / (fi + fo);
    fi *= k;
    fo *= k;
  }
  // Volumpunkter (dB, som i After Effects) ganges med klippets volum
  let g = it.gain * (it.keys.length ? Math.pow(10, volumeKeyDbAt(it.keys, t - it.start) / 20) : 1);
  if (fi > 0 && t < it.start + fi) g *= (t - it.start) / fi;
  if (fo > 0 && t > end - fo) g *= (end - t) / fo;
  return Math.max(0, g);
}

export interface ScheduleOptions {
  /** Tidspunktet i filmen (s) som spilles når konteksten er på `startAt`. */
  readonly from: number;
  /** Slutten (s i filmen); lyd etter dette tas ikke med. */
  readonly to?: number;
  /** Kontekstens tid (s) da `from` spilles. */
  readonly startAt: number;
  /** Lydtyper som er slått av. */
  readonly mutedKinds?: ReadonlySet<AudioKind>;
}

/**
 * Legger lydklippene inn i en lydkontekst. Klipp uten dekodet lyd hoppes over (de kan legges inn senere
 * med en ny `from`). Returnerer kildene, så de kan stoppes.
 */
export function scheduleAudio(
  ctx: BaseAudioContext,
  destination: AudioNode,
  items: readonly FilmAudioItem[],
  bank: AudioBank,
  o: ScheduleOptions,
): AudioBufferSourceNode[] {
  const out: AudioBufferSourceNode[] = [];
  for (const it of items) {
    if (it.clip.muted || o.mutedKinds?.has(it.clip.kind) || !it.version) continue;
    const buf = bank.get(it.version.mediaPath);
    if (!buf) continue;
    const s = scheduleOne(ctx, destination, it, buf, o);
    if (s) out.push(s);
  }
  return out;
}

export function scheduleOne(
  ctx: BaseAudioContext,
  destination: AudioNode,
  it: FilmAudioItem,
  buf: AudioBuffer,
  o: ScheduleOptions,
): AudioBufferSourceNode | null {
  const end = Math.min(it.start + it.length, o.to ?? Infinity);
  // Kommer planleggingen for sent (kontekstens klokke har passert), starter lyden like langt inn
  const late = Math.max(0, ctx.currentTime - (o.startAt + Math.max(0, it.start - o.from)));
  const t0 = Math.max(o.from, it.start) + late;
  if (end <= t0) return null;
  const srcOffset = it.sourceIn + (t0 - it.start);
  const dur = Math.min(end - t0, buf.duration - srcOffset);
  if (dur <= 0) return null;
  const when = o.startAt + (t0 - o.from);
  // (when kan ikke være i fortiden etter justeringen over)
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  // Brytepunktene i volumkurven: start, slutten på inntoningen, starten på uttoningen, slutt
  let fi = it.fadeIn;
  let fo = it.fadeOut;
  if (fi + fo > it.length && fi + fo > 0) {
    const k = it.length / (fi + fo);
    fi *= k;
    fo *= k;
  }
  // Volumpunktene, og mellompunkter hvert 100. ms mellom dem (kurven er rett i dB, ikke i styrke)
  const keyTimes: number[] = [];
  for (let i = 0; i < it.keys.length; i++) {
    const k = it.keys[i]!;
    keyTimes.push(it.start + k.t);
    const next = it.keys[i + 1];
    if (next && next.db !== k.db)
      for (let x = k.t + 0.1; x < next.t; x += 0.1) keyTimes.push(it.start + x);
  }
  const points = [t0, it.start + fi, it.start + it.length - fo, t0 + dur, ...keyTimes]
    .filter((t) => t >= t0 && t <= t0 + dur)
    .sort((a, b) => a - b);
  gain.gain.setValueAtTime(envelopeAt(it, t0), when);
  for (const t of points.slice(1))
    gain.gain.linearRampToValueAtTime(envelopeAt(it, t), when + (t - t0));
  src.connect(gain).connect(destination);
  src.start(Math.max(0, when), srcOffset, dur);
  return src;
}

/**
 * Mikser lyden for et tidsrom (s i filmen) til en stereo AudioBuffer (eksport). null hvis det ikke er
 * noen lyd i tidsrommet.
 */
export async function renderAudio(
  items: readonly FilmAudioItem[],
  bank: AudioBank,
  from: number,
  duration: number,
  sampleRate = 48000,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  scheduleAudio(ctx, ctx.destination, items, bank, { from, to: from + duration, startAt: 0 });
  return ctx.startRendering();
}

/** Finnes det lyd (med dekodet fil) i tidsrommet? */
export function hasAudioIn(
  items: readonly FilmAudioItem[],
  bank: AudioBank,
  from: number,
  to: number,
): boolean {
  return items.some(
    (it) =>
      !it.clip.muted &&
      it.version !== null &&
      bank.get(it.version.mediaPath) !== undefined &&
      it.start < to &&
      it.start + it.length > from,
  );
}

/** Topper for bølgeform: maks utslag per kolonne for et utsnitt av lydfilen. */
const peakCache = new WeakMap<AudioBuffer, Map<string, Float32Array>>();
export function peaks(buf: AudioBuffer, from: number, to: number, columns: number): Float32Array {
  const key = `${from.toFixed(3)}:${to.toFixed(3)}:${columns}`;
  let m = peakCache.get(buf);
  const hit = m?.get(key);
  if (hit) return hit;
  const out = new Float32Array(Math.max(1, columns));
  const ch = buf.getChannelData(0);
  const a = Math.max(0, Math.floor(from * buf.sampleRate));
  const b = Math.min(ch.length, Math.ceil(to * buf.sampleRate));
  const per = Math.max(1, (b - a) / out.length);
  for (let i = 0; i < out.length; i++) {
    const s = Math.floor(a + i * per);
    const e = Math.min(b, Math.floor(a + (i + 1) * per));
    let max = 0;
    // Hopp over prøver i lange kolonner (rask nok og jevn nok for visning)
    const step = Math.max(1, Math.floor((e - s) / 200));
    for (let j = s; j < e; j += step) {
      const v = Math.abs(ch[j]!);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  if (!m) {
    m = new Map();
    peakCache.set(buf, m);
  }
  if (m.size > 200) m.clear();
  m.set(key, out);
  return out;
}
