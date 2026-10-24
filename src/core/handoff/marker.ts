/**
 * C-1: the hand-off marker embedded in every outgoing file (PSD XMP, PNG tEXt, WAV bext/iXML, SVG metadata,
 * OTIO metadata and manifest.json). It names only the hand-off ID; it never carries a token or secret.
 * Recognition is by marker or by the return link/QR, never by file name.
 */
import { fromUtf8 } from "./bytes";

export const MARKER_PREFIX = "ptg-handoff:v1:";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MARKER_RE = new RegExp(`${MARKER_PREFIX.replace(/[.:]/g, (c) => "\\" + c)}(${UUID})`);
export const isUuid = (s: string): boolean => new RegExp(`^${UUID}$`).test(s);

export function handoffMarker(handoffId: string): string {
  if (!isUuid(handoffId)) throw new Error("handoff id");
  return MARKER_PREFIX + handoffId;
}
export function parseMarker(text: string): string | null {
  return MARKER_RE.exec(text)?.[1] ?? null;
}
/** Scan raw bytes (first and last 2 MiB) for an embedded marker. Works for every format we write. */
export const MARKER_SCAN_BYTES = 2 * 1024 * 1024;
export function findMarker(bytes: Uint8Array): string | null {
  const parts = bytes.length <= MARKER_SCAN_BYTES * 2 ? [bytes] : [bytes.subarray(0, MARKER_SCAN_BYTES), bytes.subarray(bytes.length - MARKER_SCAN_BYTES)];
  for (const p of parts) {
    // latin1 view keeps ASCII intact regardless of surrounding binary data
    let s = ""; for (let i = 0; i < p.length; i += 65536) s += String.fromCharCode(...p.subarray(i, i + 65536));
    const id = parseMarker(s) ?? parseMarker(fromUtf8(p));
    if (id) return id;
  }
  return null;
}
export const xmpPacket = (handoffId: string): string =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:ptg="https://pentoglass.com/ns/1.0/" ptg:handoff="${handoffMarker(handoffId)}"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
