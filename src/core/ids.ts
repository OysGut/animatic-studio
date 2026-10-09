/**
 * Permanente identifikatorer (mandat 3.1–3.2, INV-02, INV-03).
 * ID-er er uavhengige av navn, språk, plassering og synlige løpenumre.
 */

declare const brand: unique symbol;
export type Id<Kind extends string> = string & { readonly [brand]: Kind };

export type ProjectId = Id<"project">;
export type UserId = Id<"user">;
export type ProductionId = Id<"production">;
export type SceneId = Id<"scene">;
export type VariantId = Id<"scene_variant">;
export type BlockId = Id<"script_block">;
export type OccurrenceId = Id<"scene_occurrence">;
export type SegmentId = Id<"production_segment">;
export type TakeId = Id<"take">;
export type CommandId = Id<"command">;
/** Ressursbiblioteket (M3, mandat kap. 8–9). */
export type AssetId = Id<"asset">;
export type AssetVariantId = Id<"asset_variant">;
export type AssetVersionId = Id<"asset_version">;
/** Notater i manus (DEC-0031). */
export type AnnotationId = Id<"annotation">;
/** 2D-sceneeditoren (M3 del 2, mandat kap. 11–12). */
export type CompositionId = Id<"composition">;
export type LayerId = Id<"composition_layer">;
export type AudioClipId = Id<"audio_clip">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Tolk en streng som ID av gitt type. Kaster ved ugyldig format. */
export function asId<Kind extends string>(value: string): Id<Kind> {
  if (!isUuid(value)) throw new Error(`Ugyldig ID: ${value}`);
  return value as Id<Kind>;
}

function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * UUID v7 (RFC 9562): 48 bit millisekunder + tilfeldighet. Sorterbar etter opprettelsestid.
 * `now` og `random` kan injiseres for deterministiske tester.
 */
export function newId<Kind extends string>(
  now: number = Date.now(),
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): Id<Kind> {
  const bytes = new Uint8Array(16);
  let t = Math.max(0, Math.floor(now));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  const r = random(10);
  bytes.set(r, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versjon 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as Id<Kind>;
}
