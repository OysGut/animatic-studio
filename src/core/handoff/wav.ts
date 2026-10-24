/**
 * C-1: pure Broadcast WAV (BWF) writer/reader. 16-bit PCM with a «bext» chunk (description carries the
 * hand-off marker, TimeReference = start in samples since midnight) and an «iXML» chunk with scene,
 * asset ID, timecode and frame rate. DAWs (Pro Tools, Reaper, Nuendo, Logic) read both.
 */
import { ByteReader, ByteWriter, fromUtf8, utf8 } from "./bytes";
import type { Rational } from "../connectors/manifest";

export interface BwfMeta {
  readonly description: string;
  readonly originator: string;
  readonly originatorReference: string;
  /** Start position in samples since midnight. */
  readonly timeReference: number;
  readonly scene: string;
  readonly assetId: string;
  readonly clipId?: string;
  readonly timecode: string;
  readonly frameRate: Rational;
  readonly handoff?: string;
  /** C-6: ekstra ID-felt i iXML <USER> (nøkler A–Z, 0–9, _; skrives bare når de er gitt). */
  readonly user?: Readonly<Record<string, string>>;
  /** C-6: markører (cue + LIST/adtl/labl) i samples fra filens start. */
  readonly markers?: readonly WavMarker[];
}
export interface WavMarker { readonly sample: number; readonly label: string }
/** Takhøyde per fil, så en fil aldri får ubegrenset mange markører. */
export const WAV_MAX_MARKERS = 2000;
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const fixed = (s: string, n: number) => { const b = new Uint8Array(n); b.set(utf8(s).subarray(0, n)); return b; };

function metaChunks(sampleRate: number, meta: BwfMeta): Uint8Array {
  const bext = new ByteWriter()
    .bytes(fixed(meta.description, 256)).bytes(fixed(meta.originator, 32)).bytes(fixed(meta.originatorReference, 32))
    .bytes(fixed("2026-01-01", 10)).bytes(fixed("00:00:00", 8))
    .u32le(meta.timeReference % 0x100000000).u32le(Math.floor(meta.timeReference / 0x100000000))
    .u16le(1).zeros(64).zeros(10).zeros(180).done();
  const fps = `${meta.frameRate.num}/${meta.frameRate.den}`;
  const extra = Object.entries(meta.user ?? {}).filter(([k]) => /^[A-Z][A-Z0-9_]{0,40}$/.test(k)).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("");
  const ixml = utf8(`<?xml version="1.0" encoding="UTF-8"?><BWFXML><IXML_VERSION>2.10</IXML_VERSION><SCENE>${esc(meta.scene)}</SCENE><NOTE>${esc(meta.handoff ?? "")}</NOTE><SPEED><TIMECODE_RATE>${fps}</TIMECODE_RATE><TIMESTAMP_SAMPLE_RATE>${sampleRate}</TIMESTAMP_SAMPLE_RATE><TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO>${meta.timeReference % 0x100000000}</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO><TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI>${Math.floor(meta.timeReference / 0x100000000)}</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI></SPEED><USER><PTG_ASSET>${esc(meta.assetId)}</PTG_ASSET><PTG_CLIP>${esc(meta.clipId ?? "")}</PTG_CLIP><PTG_TIMECODE>${esc(meta.timecode)}</PTG_TIMECODE><PTG_HANDOFF>${esc(meta.handoff ?? "")}</PTG_HANDOFF>${extra}</USER></BWFXML>`);
  const w = new ByteWriter();
  w.ascii("bext").u32le(bext.length).bytes(bext);
  w.ascii("iXML").u32le(ixml.length).bytes(ixml); if (ixml.length % 2) w.u8(0);
  const markers = (meta.markers ?? []).slice(0, WAV_MAX_MARKERS);
  if (markers.length) {
    w.ascii("cue ").u32le(4 + markers.length * 24).u32le(markers.length);
    markers.forEach((m, i) => { w.u32le(i + 1).u32le(Math.max(0, Math.round(m.sample)) >>> 0).ascii("data").u32le(0).u32le(0).u32le(Math.max(0, Math.round(m.sample)) >>> 0); });
    const adtl = new ByteWriter().ascii("adtl");
    markers.forEach((m, i) => { const t = utf8(m.label.slice(0, 200) + "\0"); adtl.ascii("labl").u32le(4 + t.length).u32le(i + 1).bytes(t); if (t.length % 2) adtl.u8(0); });
    const list = adtl.done();
    w.ascii("LIST").u32le(list.length).bytes(list);
  }
  return w.done();
}

export function encodeBwf(channels: readonly Float32Array[], sampleRate: number, meta: BwfMeta): Uint8Array {
  const ch = channels.length, frames = channels[0]?.length ?? 0;
  if (ch < 1 || ch > 8 || channels.some((c) => c.length !== frames)) throw new Error("wav channels");
  const data = new ByteWriter();
  for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, channels[c]![i]!)); data.u16le(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff) & 0xffff); }
  const pcm = data.done();
  const w = new ByteWriter();
  w.ascii("RIFF").u32le(0).ascii("WAVE");
  w.ascii("fmt ").u32le(16).u16le(1).u16le(ch).u32le(sampleRate).u32le(sampleRate * ch * 2).u16le(ch * 2).u16le(16);
  w.bytes(metaChunks(sampleRate, meta));
  w.ascii("data").u32le(pcm.length).bytes(pcm); if (pcm.length % 2) w.u8(0);
  w.patchU32le(4, w.length - 8);
  return w.done();
}

/**
 * C-6: skriver nye metadata inn i en eksisterende WAV uten å røre lyden. «fmt » og «data» (og ukjente
 * biter) kopieres byte for byte; gamle bext/iXML/cue/LIST erstattes. Alle bitdybder og kanaltall beholdes.
 */
export function retagWav(bytes: Uint8Array, meta: BwfMeta): Uint8Array {
  const r = new ByteReader(bytes);
  if (r.ascii(4) !== "RIFF") throw new Error("not wav"); r.skip(4);
  if (r.ascii(4) !== "WAVE") throw new Error("not wav");
  const keep: Uint8Array[] = [];
  let fmt: Uint8Array | null = null, data: Uint8Array | null = null, sampleRate = 0;
  while (r.pos + 8 <= bytes.length) {
    const start = r.pos, id = r.ascii(4), len = r.u32le();
    const end = Math.min(bytes.length, r.pos + len + (len % 2));
    const chunk = bytes.subarray(start, end);
    if (id === "fmt ") { fmt = chunk; sampleRate = new DataView(bytes.buffer, bytes.byteOffset + start + 12, 4).getUint32(0, true); }
    else if (id === "data") data = chunk;
    else if (id !== "bext" && id !== "iXML" && id !== "cue " && id !== "LIST") keep.push(chunk);
    r.pos = end;
  }
  if (!fmt || !data) throw new Error("not wav");
  const w = new ByteWriter();
  w.ascii("RIFF").u32le(0).ascii("WAVE").bytes(fmt);
  for (const k of keep) w.bytes(k);
  w.bytes(metaChunks(sampleRate, meta)).bytes(data);
  w.patchU32le(4, w.length - 8);
  return w.done();
}

export interface BwfInfo {
  readonly channels: number;
  readonly sampleRate: number;
  readonly frames: number;
  readonly description: string | null;
  readonly timeReference: number | null;
  readonly ixml: Record<string, string>;
  readonly markers: readonly WavMarker[];
}
export function readBwf(bytes: Uint8Array): BwfInfo {
  const r = new ByteReader(bytes);
  if (r.ascii(4) !== "RIFF") throw new Error("not wav"); r.skip(4);
  if (r.ascii(4) !== "WAVE") throw new Error("not wav");
  let channels = 0, sampleRate = 0, bits = 16, dataLen = 0, description: string | null = null, timeReference: number | null = null;
  const ixml: Record<string, string> = {};
  const cues = new Map<number, number>(), labels = new Map<number, string>();
  while (r.pos + 8 <= bytes.length) {
    const id = r.ascii(4), len = r.u32le(), start = r.pos;
    if (id === "fmt ") { r.skip(2); channels = r.u16le(); sampleRate = r.u32le(); r.skip(6); bits = r.u16le(); }
    else if (id === "bext") { const d = r.bytes(Math.min(len, 256)); description = fromUtf8(d.subarray(0, d.indexOf(0) < 0 ? d.length : d.indexOf(0))); r.pos = start + 338; timeReference = r.u32le() + r.u32le() * 0x100000000; }
    else if (id === "iXML") { const x = fromUtf8(r.bytes(len)); for (const m of x.matchAll(/<([A-Z0-9_]+)>([^<]*)<\/\1>/g)) ixml[m[1]!] = m[2]!.replace(/&(lt|gt|amp|quot|apos);/g, (_, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e as "lt"]); }
    else if (id === "data") dataLen = len;
    else if (id === "cue ") { const n = Math.min(r.u32le(), WAV_MAX_MARKERS); for (let i = 0; i < n && r.pos + 24 <= start + len; i++) { const cid = r.u32le(); r.skip(16); cues.set(cid, r.u32le()); } }
    else if (id === "LIST" && len >= 4 && r.ascii(4) === "adtl") {
      while (r.pos + 8 <= start + len) { const sid = r.ascii(4), sl = r.u32le(), ss = r.pos; if (sid === "labl" && sl >= 4) { const cid = r.u32le(); const t = r.bytes(sl - 4); const z = t.indexOf(0); labels.set(cid, fromUtf8(z < 0 ? t : t.subarray(0, z))); } r.pos = ss + sl + (sl % 2); }
    }
    r.pos = Math.min(bytes.length, start + len + (len % 2));
  }
  const markers = [...cues.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([cid, sample]) => ({ sample, label: labels.get(cid) ?? "" }));
  return { channels, sampleRate, frames: channels ? dataLen / (channels * (bits / 8)) : 0, description, timeReference, ixml, markers };
}
