/**
 * En liten Web Audio-erstatning for tester i Node (ende-til-ende-kontrollen, REQ-0004). Node har ikke
 * OfflineAudioContext. Erstatningen gjør akkurat det lydmotoren (src/engine/audio/mixer.ts) bruker:
 * AudioBufferSource → Gain → destinasjon, start(når, fra, lengde), volumkurve med setValueAtTime og
 * linearRampToValueAtTime, og miksing til en stereo-buffer. decodeAudioData leser 16-biters PCM-WAV.
 *
 * Dermed prøves plasseringen og volumet i den ekte miksekoden, ikke i en kopi av den.
 */

export class FakeAudioBuffer {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number): Float32Array {
    return this.channels[c]!;
  }
}

class FakeParam {
  private events: { t: number; v: number; ramp: boolean }[] = [];
  value = 1;
  setValueAtTime(v: number, t: number) {
    this.events.push({ t, v, ramp: false });
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push({ t, v, ramp: true });
  }
  valueAt(t: number): number {
    const ev = [...this.events].sort((a, b) => a.t - b.t);
    if (!ev.length) return this.value;
    let prev = ev[0]!;
    if (t < prev.t) return prev.v;
    for (const e of ev.slice(1)) {
      if (t < e.t)
        return e.ramp ? prev.v + ((e.v - prev.v) * (t - prev.t)) / (e.t - prev.t) : prev.v;
      prev = e;
    }
    return prev.v;
  }
}

class FakeGain {
  readonly gain = new FakeParam();
  connect<T>(dest: T): T {
    return dest;
  }
}

class FakeSource {
  buffer: FakeAudioBuffer | null = null;
  gainNode: FakeGain | null = null;
  play: { when: number; offset: number; dur: number } | null = null;
  constructor(private readonly ctx: FakeOfflineAudioContext) {}
  connect(g: FakeGain): FakeGain {
    this.gainNode = g;
    return g;
  }
  start(when = 0, offset = 0, dur?: number) {
    this.play = { when, offset, dur: dur ?? (this.buffer?.duration ?? 0) - offset };
    this.ctx.sources.push(this);
  }
}

/** Leser en 16-biters PCM-WAV (samme format som encodeWav lager). */
export function decodeWav(bytes: ArrayBuffer | Uint8Array): FakeAudioBuffer {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o: number) => String.fromCharCode(...u8.subarray(o, o + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Ikke en WAV-fil");
  const channels = v.getUint16(22, true);
  const rate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  if (bits !== 16 || tag(36) !== "data") throw new Error("Bare enkel 16-biters PCM støttes");
  const frames = v.getUint32(40, true) / (channels * 2);
  const buf = new FakeAudioBuffer(channels, frames, rate);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++)
      buf.channels[c]![i] = v.getInt16(44 + (i * channels + c) * 2, true) / 0x8000;
  return buf;
}

export class FakeOfflineAudioContext {
  readonly destination = {};
  readonly currentTime = 0;
  readonly sources: FakeSource[] = [];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {}
  createBufferSource() {
    return new FakeSource(this);
  }
  createGain() {
    return new FakeGain();
  }
  async decodeAudioData(bytes: ArrayBuffer): Promise<FakeAudioBuffer> {
    return decodeWav(bytes);
  }
  async startRendering(): Promise<FakeAudioBuffer> {
    const out = new FakeAudioBuffer(this.numberOfChannels, this.length, this.sampleRate);
    for (const s of this.sources) {
      const b = s.buffer;
      const p = s.play;
      if (!b || !p) continue;
      const i0 = Math.max(0, Math.round(p.when * this.sampleRate));
      const i1 = Math.min(this.length, Math.round((p.when + p.dur) * this.sampleRate));
      for (let i = i0; i < i1; i++) {
        const t = i / this.sampleRate;
        const j = Math.floor((t - p.when + p.offset) * b.sampleRate);
        if (j < 0 || j >= b.length) continue;
        const g = s.gainNode ? s.gainNode.gain.valueAt(t) : 1;
        for (let c = 0; c < this.numberOfChannels; c++) {
          const src = b.channels[Math.min(c, b.numberOfChannels - 1)]!;
          out.channels[c]![i]! += src[j]! * g;
        }
      }
    }
    return out;
  }
}
