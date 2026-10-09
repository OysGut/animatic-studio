/**
 * Felter og grenser for 2D-scener og lag (M3 del 2, mandat kap. 11). Ren logikk uten avhengigheter.
 * `normalize…` returnerer normaliserte felter eller en norsk feilmelding.
 */
import type {
  AnimatedProperty,
  CameraFrame,
  CompositionCamera,
  Easing,
  Keyframe,
  LayerKind,
  LayerTransform,
} from "../model";
import type { CompositionFields, LayerFields } from "../commands/types";

export const LAYER_KINDS: readonly LayerKind[] = [
  "background",
  "midground",
  "foreground",
  "character",
  "object",
  "effect",
  "other",
];

export const LAYER_KIND_LABEL: Record<LayerKind, string> = {
  background: "Bakgrunn",
  midground: "Mellomgrunn",
  foreground: "Forgrunn",
  character: "Karakter",
  object: "Objekt",
  effect: "Effekt",
  other: "Annet",
};

/** Standard parallakse per lagtype: bakgrunnen beveger seg minst, forgrunnen mest. */
export const DEFAULT_PARALLAX: Record<LayerKind, number> = {
  background: 0.3,
  midground: 0.65,
  foreground: 1.4,
  character: 1,
  object: 1,
  effect: 1,
  other: 1,
};

export const ANIMATED_PROPERTIES: readonly AnimatedProperty[] = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
];
export const EASINGS: readonly Easing[] = ["linear", "ease-in", "ease-out", "ease-in-out", "hold"];

/** Vanlige bildeformater (mandat 12.1). */
export const COMPOSITION_FORMATS = [
  { label: "HD 16:9 (1920 × 1080)", width: 1920, height: 1080 },
  { label: "4K 16:9 (3840 × 2160)", width: 3840, height: 2160 },
  { label: "Kino 1.85:1 (1998 × 1080)", width: 1998, height: 1080 },
  { label: "Scope 2.39:1 (2048 × 858)", width: 2048, height: 858 },
  { label: "Kvadrat 1:1 (1080 × 1080)", width: 1080, height: 1080 },
  { label: "Stående 9:16 (1080 × 1920)", width: 1080, height: 1920 },
] as const;

export const DEFAULT_COMPOSITION: CompositionFields = {
  name: "",
  width: 1920,
  height: 1080,
  durationFrames: 0,
  background: "#101114",
};

export const IDENTITY_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

export const MIN_SIZE = 16;
export const MAX_SIZE = 16384;
const MAX_COORD = 1_000_000;
const MAX_SCALE = 1000;
const MAX_KEYFRAMES = 2000; // holder seg godt under databasens grense (512 kB jsonb)
const HEX = /^#[0-9a-f]{6}$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Tekst databasen godtar (ingen nulltegn eller halve tegn). */
export function validText(t: string): boolean {
  if (t.includes("\u0000")) return false;
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(t);
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function normalizeColor(c: string): string | null {
  const v = c.trim().toLowerCase();
  return HEX.test(v) ? v : null;
}

export function normalizeCompositionFields(f: CompositionFields): Result<CompositionFields> {
  if (!Number.isInteger(f.width) || f.width < MIN_SIZE || f.width > MAX_SIZE)
    return { ok: false, error: `Bredden må være et helt tall mellom ${MIN_SIZE} og ${MAX_SIZE}` };
  if (!Number.isInteger(f.height) || f.height < MIN_SIZE || f.height > MAX_SIZE)
    return { ok: false, error: `Høyden må være et helt tall mellom ${MIN_SIZE} og ${MAX_SIZE}` };
  if (!Number.isInteger(f.durationFrames) || f.durationFrames < 0 || f.durationFrames > 10_000_000)
    return { ok: false, error: "Ugyldig varighet" };
  const background = normalizeColor(f.background);
  if (!background) return { ok: false, error: "Bakgrunnsfargen må være på formen #rrggbb" };
  const name = f.name.trim();
  if (name.length > 200) return { ok: false, error: "Navnet er for langt (maks 200 tegn)" };
  if (!validText(name)) return { ok: false, error: "Navnet inneholder ugyldige tegn" };
  return { ok: true, value: { ...f, name, background } };
}

export function normalizeTransform(t: LayerTransform): Result<LayerTransform> {
  for (const k of ["x", "y", "scaleX", "scaleY", "rotation", "opacity"] as const)
    if (!finite(t[k])) return { ok: false, error: `Ugyldig verdi for ${k}` };
  if (Math.abs(t.x) > MAX_COORD || Math.abs(t.y) > MAX_COORD)
    return { ok: false, error: "Posisjonen er for langt utenfor scenen" };
  if (Math.abs(t.scaleX) > MAX_SCALE || Math.abs(t.scaleY) > MAX_SCALE)
    return { ok: false, error: "Skaleringen er for stor" };
  return {
    ok: true,
    value: {
      x: t.x,
      y: t.y,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      rotation: t.rotation,
      opacity: Math.min(1, Math.max(0, t.opacity)),
    },
  };
}

export function normalizeKeyframes(list: readonly Keyframe[]): Result<readonly Keyframe[]> {
  if (list.length > MAX_KEYFRAMES) return { ok: false, error: "For mange nøkkelbilder" };
  const seen = new Set<string>();
  for (const k of list) {
    if (!Number.isInteger(k.frame) || k.frame < 0)
      return { ok: false, error: "Ugyldig nøkkelbilde" };
    if (!ANIMATED_PROPERTIES.includes(k.property))
      return { ok: false, error: "Ugyldig egenskap i nøkkelbilde" };
    if (!finite(k.value)) return { ok: false, error: "Ugyldig verdi i nøkkelbilde" };
    if (!EASINGS.includes(k.easing)) return { ok: false, error: "Ugyldig hastighetskurve" };
    const key = `${k.property}@${k.frame}`;
    if (seen.has(key)) return { ok: false, error: "To nøkkelbilder på samme bilde og egenskap" };
    seen.add(key);
  }
  const sorted = [...list]
    .map((k) => ({ frame: k.frame, property: k.property, value: k.value, easing: k.easing }))
    .sort((a, b) => a.property.localeCompare(b.property) || a.frame - b.frame);
  return { ok: true, value: sorted };
}

export function normalizeLayerFields(f: LayerFields): Result<LayerFields> {
  if (!LAYER_KINDS.includes(f.kind)) return { ok: false, error: "Ugyldig lagtype" };
  const name = f.name.trim();
  if (name.length > 200) return { ok: false, error: "Navnet er for langt (maks 200 tegn)" };
  if (!validText(name)) return { ok: false, error: "Navnet inneholder ugyldige tegn" };
  const fill = f.fill === null ? null : normalizeColor(f.fill);
  if (f.fill !== null && !fill) return { ok: false, error: "Fargen må være på formen #rrggbb" };
  if (f.assetId === null && fill === null)
    return { ok: false, error: "Laget må vise et bilde fra biblioteket eller en fargeflate" };
  if (f.assetId === null && (f.assetVariantId !== null || f.versionId !== null))
    return { ok: false, error: "Variant eller versjon uten ressurs" };
  if (f.versionId !== null && f.assetVariantId === null)
    return { ok: false, error: "Versjon uten variant" };
  if (!Number.isInteger(f.width) || f.width < 1 || f.width > MAX_SIZE)
    return { ok: false, error: "Ugyldig bredde" };
  if (!Number.isInteger(f.height) || f.height < 1 || f.height > MAX_SIZE)
    return { ok: false, error: "Ugyldig høyde" };
  if (!finite(f.parallax) || f.parallax < 0 || f.parallax > 4)
    return { ok: false, error: "Parallaksen må være mellom 0 og 4" };
  const t = normalizeTransform(f.transform);
  if (!t.ok) return t;
  const k = normalizeKeyframes(f.keyframes);
  if (!k.ok) return k;
  if (f.groupId !== null && f.groupId.length > 64) return { ok: false, error: "Ugyldig gruppe" };
  return {
    ok: true,
    value: {
      kind: f.kind,
      name,
      assetId: f.assetId,
      assetVariantId: f.assetVariantId,
      versionId: f.versionId,
      fill,
      width: f.width,
      height: f.height,
      parallax: f.parallax,
      transform: t.value,
      keyframes: k.value,
      visible: f.visible === true,
      locked: f.locked === true,
      groupId: f.groupId,
    },
  };
}

const MAX_SHOTS = 200;

function cameraFrame(f: CameraFrame): CameraFrame | null {
  if (![f.x, f.y, f.zoom, f.rotation].every(finite)) return null;
  if (f.zoom <= 0 || f.zoom > 100) return null;
  if (Math.abs(f.x) > MAX_COORD || Math.abs(f.y) > MAX_COORD) return null;
  return { x: f.x, y: f.y, zoom: f.zoom, rotation: f.rotation };
}

/** Kamera med shots (mandat kap. 12). Shots sorteres etter start. */
export function normalizeCamera(c: CompositionCamera): Result<CompositionCamera> {
  if (typeof c !== "object" || c === null || !Array.isArray(c.shots))
    return { ok: false, error: "Ugyldig kamera" };
  if (c.shots.length > MAX_SHOTS) return { ok: false, error: "For mange kamerautsnitt" };
  const ids = new Set<string>();
  const shots = [];
  for (const sh of c.shots) {
    if (typeof sh.id !== "string" || !sh.id || sh.id.length > 64 || ids.has(sh.id))
      return { ok: false, error: "Ugyldig kamerautsnitt" };
    ids.add(sh.id);
    if (
      !Number.isInteger(sh.startFrame) ||
      !Number.isInteger(sh.endFrame) ||
      sh.startFrame < 0 ||
      sh.endFrame < sh.startFrame
    )
      return { ok: false, error: "Kamerautsnittet må slutte etter at det starter" };
    const from = cameraFrame(sh.from);
    const to = cameraFrame(sh.to);
    if (!from || !to) return { ok: false, error: "Ugyldig kameraramme" };
    if (!EASINGS.includes(sh.easing)) return { ok: false, error: "Ugyldig hastighetskurve" };
    let curve = null;
    if (sh.curve !== null) {
      const k = sh.curve;
      if (![k.c1x, k.c1y, k.c2x, k.c2y].every(finite))
        return { ok: false, error: "Ugyldig kamerabane" };
      curve = { c1x: k.c1x, c1y: k.c1y, c2x: k.c2x, c2y: k.c2y };
    }
    const name = typeof sh.name === "string" ? sh.name.trim().slice(0, 200) : "";
    if (!validText(name) || !validText(sh.id))
      return { ok: false, error: "Ugyldige tegn i kameraet" };
    shots.push({
      id: sh.id,
      name,
      startFrame: sh.startFrame,
      endFrame: sh.endFrame,
      from,
      to,
      curve,
      easing: sh.easing,
    });
  }
  shots.sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  // Ett kamera om gangen: utsnittene kan møtes, men ikke overlappe
  for (let i = 1; i < shots.length; i++)
    if (shots[i]!.startFrame < shots[i - 1]!.endFrame)
      return { ok: false, error: "Kamerautsnittene overlapper. Flytt eller forkort ett av dem." };
  return { ok: true, value: { shots } };
}
