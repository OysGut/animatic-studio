/**
 * C-1: recognize which hand-off a returned file belongs to. Accepted only via an embedded marker
 * (manifest/XMP/tEXt/bext/iXML) or the return link/QR token. A matching file name alone is never enough.
 */
import { findMarker } from "./marker";

export type Recognition =
  | { readonly ok: true; readonly handoffId: string; readonly via: "marker" | "link" | "marker+link" }
  | { readonly ok: false; readonly reason: "filename_only" | "mismatch" | "unknown" };

export function recognizeReturn(i: {
  bytes: Uint8Array;
  /** Hand-off resolved from the return link or QR token (server-verified), if any. */
  linkHandoffId: string | null;
  /** Hand-offs the signed-in user may receive into (by ID), for marker-only returns. */
  knownHandoffIds?: readonly string[];
  /** Original outgoing file names; only used to explain why a match by name is refused. */
  outgoingNames?: readonly string[];
  fileName?: string;
}): Recognition {
  const marker = findMarker(i.bytes);
  if (i.linkHandoffId) {
    if (marker && marker !== i.linkHandoffId) return { ok: false, reason: "mismatch" };
    return { ok: true, handoffId: i.linkHandoffId, via: marker ? "marker+link" : "link" };
  }
  if (marker && (i.knownHandoffIds ?? []).includes(marker)) return { ok: true, handoffId: marker, via: "marker" };
  if (i.fileName && (i.outgoingNames ?? []).includes(i.fileName)) return { ok: false, reason: "filename_only" };
  return { ok: false, reason: "unknown" };
}
