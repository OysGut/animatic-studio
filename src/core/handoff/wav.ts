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
}
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const fixed = (s: string, n: number) => { const b = new Uint8Array(n); b.set(utf8(s).subarray(0, n)); return b; };

export function encodeBwf(channels: readonly Float32Array[], sampleRate: number, meta: BwfMeta): Uint8Array {
  const ch = channels.length, frames = channels[0]?.length ?? 0;
  if (ch < 1 || ch > 8 || channels.some((c) => c.length !== frames)) throw new Error("wav channels");
  const bext = new ByteWriter()
    .bytes(fixed(meta.description, 256)).bytes(fixed(meta.originator, 32)).bytes(fixed(meta.originatorReference, 32))
    .bytes(fixed("2026-01-01", 10)).bytes(fixed("00:00:00", 8))
    .u32le(meta.timeReference % 0x100000000).u32le(Math.floor(meta.timeReference / 0x100000000))
    .u16le(1).zeros(64).zeros(10).zeros(180).done();
  const fps = `${meta.frameRate.num}/${meta.frameRate.den}`;
  const ixml = utf8(`<?xml version="1.0" encoding="UTF-8"?><BWFXML><IXML_VERSION>2.10</IXML_VERSION><SCENE>${esc(meta.scene)}</SCENE><NOTE>${esc(meta.handoff ?? "")}</NOTE><SPEED><TIMECODE_RATE>${fps}</TIMECODE_RATE><TIMESTAMP_SAMPLE_RATE>${sampleRate}</TIMESTAMP_SAMPLE_RATE><TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO>${meta.timeReference % 0x100000000}</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO><TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI>${Math.floor(meta.timeReference / 0x100000000)}</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI></SPEED><USER><PTG_ASSET>${esc(meta.assetId)}</PTG_ASSET><PTG_CLIP>${esc(meta.clipId ?? "")}</PTG_CLIP><PTG_TIMECODE>${esc(meta.timecode)}</PTG_TIMECODE><PTG_HANDOFF>${esc(meta.handoff ?? "")}</PTG_HANDOFF></USER></BWFXML>`);
  const data = new ByteWriter();
  for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, channels[c]![i]!)); data.u16le(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff) & 0xffff); }
  const pcm = data.done();
  const w = new ByteWriter();
  w.ascii("RIFF").u32le(0).ascii("WAVE");
  w.ascii("fmt ").u32le(16).u16le(1).u16le(ch).u32le(sampleRate).u32le(sampleRate * ch * 2).u16le(ch * 2).u16le(16);
  w.ascii("bext").u32le(bext.length).bytes(bext);
  w.ascii("iXML").u32le(ixml.length).bytes(ixml); if (ixml.length % 2) w.u8(0);
  w.ascii("data").u32le(pcm.length).bytes(pcm); if (pcm.length % 2) w.u8(0);
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
}
export function readBwf(bytes: Uint8Array): BwfInfo {
  const r = new ByteReader(bytes);
  if (r.ascii(4) !== "RIFF") throw new Error("not wav"); r.skip(4);
  if (r.ascii(4) !== "WAVE") throw new Error("not wav");
  let channels = 0, sampleRate = 0, bits = 16, dataLen = 0, description: string | null = null, timeReference: number | null = null;
  const ixml: Record<string, string> = {};
  while (r.pos + 8 <= bytes.length) {
    const id = r.ascii(4), len = r.u32le(), start = r.pos;
    if (id === "fmt ") { r.skip(2); channels = r.u16le(); sampleRate = r.u32le(); r.skip(6); bits = r.u16le(); }
    else if (id === "bext") { const d = r.bytes(Math.min(len, 256)); description = fromUtf8(d.subarray(0, d.indexOf(0) < 0 ? d.length : d.indexOf(0))); r.pos = start + 338; timeReference = r.u32le() + r.u32le() * 0x100000000; }
    else if (id === "iXML") { const x = fromUtf8(r.bytes(len)); for (const m of x.matchAll(/<([A-Z0-9_]+)>([^<]*)<\/\1>/g)) ixml[m[1]!] = m[2]!.replace(/&(lt|gt|amp|quot|apos);/g, (_, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e as "lt"]); }
    else if (id === "data") dataLen = len;
    r.pos = Math.min(bytes.length, start + len + (len % 2));
  }
  return { channels, sampleRate, frames: channels ? dataLen / (channels * (bits / 8)) : 0, description, timeReference, ixml };
}
