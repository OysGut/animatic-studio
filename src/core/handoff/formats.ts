/**
 * C-1: what each «Send to …» format gives the receiver, honestly, and which targets offer it.
 * The UI shows these facts verbatim (editable layers, text as text, or a flat image).
 */
import { ADAPTERS, type AdapterDescriptor } from "../connectors/capabilities";

export const HANDOFF_TARGETS = ["asset", "panel", "clip", "scene", "production"] as const;
export type HandoffTarget = (typeof HANDOFF_TARGETS)[number];
export const HANDOFF_FORMATS = ["psd", "png", "svg", "wav", "otio", "sbpro"] as const;
export type HandoffFormat = (typeof HANDOFF_FORMATS)[number];

export interface FormatFacts {
  readonly editableLayers: boolean;
  /** Text layers stay editable text (only SVG; PSD text is rasterized). */
  readonly textAsText: boolean;
  readonly flatImage: boolean;
  readonly audio: boolean;
  readonly timeline: boolean;
  /** The edited result can come back through the return page (whitelist). */
  readonly returnable: boolean;
  readonly extension: string;
  readonly mimeType: string;
}
export const FORMAT_FACTS: Record<HandoffFormat, FormatFacts> = {
  psd: { editableLayers: true, textAsText: false, flatImage: false, audio: false, timeline: false, returnable: true, extension: "psd", mimeType: "image/vnd.adobe.photoshop" },
  png: { editableLayers: false, textAsText: false, flatImage: true, audio: false, timeline: false, returnable: true, extension: "png", mimeType: "image/png" },
  svg: { editableLayers: true, textAsText: true, flatImage: false, audio: false, timeline: false, returnable: false, extension: "svg", mimeType: "image/svg+xml" },
  wav: { editableLayers: false, textAsText: false, flatImage: false, audio: true, timeline: false, returnable: true, extension: "wav", mimeType: "audio/wav" },
  otio: { editableLayers: false, textAsText: false, flatImage: false, audio: false, timeline: true, returnable: false, extension: "otio", mimeType: "application/json" },
  // C-5: Storyboard Pro-pakke (.ptgsb = lagret ZIP med manifest v1 + panelbilder). Retur blir kandidater.
  sbpro: { editableLayers: false, textAsText: false, flatImage: false, audio: false, timeline: true, returnable: true, extension: "ptgsb", mimeType: "application/zip" },
};
export const FORMATS_FOR: Record<HandoffTarget, readonly HandoffFormat[]> = {
  asset: ["psd", "png", "svg"],
  panel: ["psd", "png", "svg"],
  clip: ["wav"],
  scene: ["otio"],
  production: ["sbpro"],
};
/** Default adapter per format (only for labels and capability gating). */
export const ADAPTER_FOR: Record<HandoffFormat, string> = {
  psd: "adobe-photoshop-uxp", png: "procreate-handoff", svg: "adobe-photoshop-uxp", wav: "daw-roundtrip", otio: "storyboard-interchange", sbpro: "toonboom-sbpro",
};
export function adapterFor(format: HandoffFormat): AdapterDescriptor {
  return ADAPTERS.find((a) => a.id === ADAPTER_FOR[format])!;
}
/** Asset kinds that are images vs. sound: images get psd/png/svg, sounds wav. */
export function formatsForAsset(kind: string): readonly HandoffFormat[] {
  return kind === "sound" ? ["wav"] : FORMATS_FOR.asset;
}
/** Return token lifetime: short-lived but long enough for a working session in another app. */
export const RETURN_TTL_SECONDS = 48 * 3600;
export const RETURN_TOKEN_PREFIX = "ptgh_";
export const RETURN_TOKEN_RE = /^ptgh_[A-Za-z0-9_-]{43}$/;

/** URL-safe base64 without padding (32 random bytes → 43 characters). */
export function base64UrlToken(bytes: Uint8Array): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const k = Math.min(3, bytes.length - i) + 1;
    for (let j = 0; j < k; j++) out += A[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}
