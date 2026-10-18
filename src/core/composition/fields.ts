/**
 * Felter og grenser for 2D-scener og lag (M3 del 2, mandat kap. 11). Ren logikk uten avhengigheter.
 * `normalize…` returnerer normaliserte felter eller en norsk feilmelding.
 */
import type {
  AnimatedProperty,
  BlendMode,
  CameraFrame,
  CompositionCamera,
  Easing,
  ImageSwap,
  Keyframe,
  LanguageImage,
  LayerKind,
  LayerMask,
  LayerTransform,
  MaskProperty,
  MotionPath,
  TransformProperty,
} from "../model";
import type { CompositionFields, LayerFields } from "../commands/types";
import { L, localized } from "../i18n";

export const LAYER_KINDS: readonly LayerKind[] = [
  "background",
  "midground",
  "foreground",
  "character",
  "object",
  "effect",
  "other",
  "group",
];

export const LAYER_KIND_LABEL: Record<LayerKind, string> = localized({
  background: ["Bakgrunn", "Background"],
  midground: ["Mellomgrunn", "Midground"],
  foreground: ["Forgrunn", "Foreground"],
  character: ["Karakter", "Character"],
  object: ["Objekt", "Object"],
  effect: ["Effekt", "Effect"],
  other: ["Annet", "Other"],
  group: ["Gruppe", "Group"],
});

/** Standard parallakse per lagtype: bakgrunnen beveger seg minst, forgrunnen mest. */
export const DEFAULT_PARALLAX: Record<LayerKind, number> = {
  background: 0.3,
  midground: 0.65,
  foreground: 1.4,
  character: 1,
  object: 1,
  effect: 1,
  other: 1,
  group: 1,
};

/** Egenskapene i lagets plassering som kan animeres. */
export const ANIMATED_PROPERTIES: readonly TransformProperty[] = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
];

/** Maskens plassering og størrelse som kan animeres (DEC-0072). Myk kant og snudd maske er faste. */
export const MASK_PROPERTIES: readonly MaskProperty[] = [
  "maskX",
  "maskY",
  "maskWidth",
  "maskHeight",
];

/** Feltet i en rektangel- eller ellipsemaske som hver maskeegenskap animerer. */
export const MASK_FIELD: Record<MaskProperty, "x" | "y" | "width" | "height"> = {
  maskX: "x",
  maskY: "y",
  maskWidth: "width",
  maskHeight: "height",
};

/** Alle egenskaper som kan ha nøkkelbilder: lagets plassering og maskens plassering og størrelse. */
export const KEYFRAME_PROPERTIES: readonly AnimatedProperty[] = [
  ...ANIMATED_PROPERTIES,
  ...MASK_PROPERTIES,
];

export function isMaskProperty(p: AnimatedProperty): p is MaskProperty {
  return (MASK_PROPERTIES as readonly string[]).includes(p);
}
export const EASINGS: readonly Easing[] = ["linear", "ease-in", "ease-out", "ease-in-out", "hold"];

/** Vanlige bildeformater (mandat 12.1). */
export const COMPOSITION_FORMATS = [
  { label: "HD 16:9 (1920 × 1080)", width: 1920, height: 1080 },
  { label: "4K 16:9 (3840 × 2160)", width: 3840, height: 2160 },
  {
    get label() {
      return L("Kino 1.85:1 (1998 × 1080)", "Cinema 1.85:1 (1998 × 1080)");
    },
    width: 1998,
    height: 1080,
  },
  { label: "Scope 2.39:1 (2048 × 858)", width: 2048, height: 858 },
  {
    get label() {
      return L("Kvadrat 1:1 (1080 × 1080)", "Square 1:1 (1080 × 1080)");
    },
    width: 1080,
    height: 1080,
  },
  {
    get label() {
      return L("Stående 9:16 (1080 × 1920)", "Portrait 9:16 (1080 × 1920)");
    },
    width: 1080,
    height: 1920,
  },
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
    return {
      ok: false,
      error: L(
        `Bredden må være et helt tall mellom ${MIN_SIZE} og ${MAX_SIZE}`,
        `Width must be a whole number between ${MIN_SIZE} and ${MAX_SIZE}`,
      ),
    };
  if (!Number.isInteger(f.height) || f.height < MIN_SIZE || f.height > MAX_SIZE)
    return {
      ok: false,
      error: L(
        `Høyden må være et helt tall mellom ${MIN_SIZE} og ${MAX_SIZE}`,
        `Height must be a whole number between ${MIN_SIZE} and ${MAX_SIZE}`,
      ),
    };
  if (!Number.isInteger(f.durationFrames) || f.durationFrames < 0 || f.durationFrames > 10_000_000)
    return { ok: false, error: L("Ugyldig varighet", "Invalid duration") };
  const background = normalizeColor(f.background);
  if (!background)
    return {
      ok: false,
      error: L(
        "Bakgrunnsfargen må være på formen #rrggbb",
        "The background colour must be in the form #rrggbb",
      ),
    };
  const name = f.name.trim();
  if (name.length > 200)
    return {
      ok: false,
      error: L(
        "Navnet er for langt (maks 200 tegn)",
        "The name is too long (maximum 200 characters)",
      ),
    };
  if (!validText(name))
    return {
      ok: false,
      error: L("Navnet inneholder ugyldige tegn", "The name contains invalid characters"),
    };
  return { ok: true, value: { ...f, name, background } };
}

export function normalizeTransform(t: LayerTransform): Result<LayerTransform> {
  for (const k of ["x", "y", "scaleX", "scaleY", "rotation", "opacity"] as const)
    if (!finite(t[k]))
      return { ok: false, error: L(`Ugyldig verdi for ${k}`, `Invalid value for ${k}`) };
  if (Math.abs(t.x) > MAX_COORD || Math.abs(t.y) > MAX_COORD)
    return {
      ok: false,
      error: L(
        "Posisjonen er for langt utenfor scenen",
        "The position is too far outside the scene",
      ),
    };
  if (Math.abs(t.scaleX) > MAX_SCALE || Math.abs(t.scaleY) > MAX_SCALE)
    return { ok: false, error: L("Skaleringen er for stor", "The scale is too large") };
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
  if (list.length > MAX_KEYFRAMES)
    return { ok: false, error: L("For mange nøkkelbilder", "Too many keyframes") };
  const seen = new Set<string>();
  for (const k of list) {
    if (!Number.isInteger(k.frame) || k.frame < 0)
      return { ok: false, error: L("Ugyldig nøkkelbilde", "Invalid keyframe") };
    if (!KEYFRAME_PROPERTIES.includes(k.property))
      return {
        ok: false,
        error: L("Ugyldig egenskap i nøkkelbilde", "Invalid property in keyframe"),
      };
    if (!finite(k.value))
      return { ok: false, error: L("Ugyldig verdi i nøkkelbilde", "Invalid value in keyframe") };
    if (!EASINGS.includes(k.easing))
      return { ok: false, error: L("Ugyldig hastighetskurve", "Invalid easing curve") };
    for (const v of [k.easeOut, k.easeIn])
      if (v !== undefined && (!finite(v) || v < 0 || v > 1))
        return {
          ok: false,
          error: L(
            "Styrken på ease må være mellom 0 og 100 %",
            "The ease strength must be between 0 and 100 %",
          ),
        };
    const key = `${k.property}@${k.frame}`;
    if (seen.has(key))
      return {
        ok: false,
        error: L(
          "To nøkkelbilder på samme bilde og egenskap",
          "Two keyframes on the same frame and property",
        ),
      };
    seen.add(key);
  }
  const sorted = [...list]
    .map((k): Keyframe => ({
      frame: k.frame,
      property: k.property,
      value: k.value,
      easing: k.easing,
      ...(k.easeOut !== undefined ? { easeOut: k.easeOut } : {}),
      ...(k.easeIn !== undefined ? { easeIn: k.easeIn } : {}),
    }))
    .sort((a, b) => a.property.localeCompare(b.property) || a.frame - b.frame);
  return { ok: true, value: sorted };
}

const MAX_SWAPS = 200;
const MAX_PATH_POINTS = 500;
const MAX_TEMPO_POINTS = 20;

/** Bildeskifter: hele bilder fra 1, ett per bilde, sortert (DEC-0052). */
export function normalizeSwaps(list: readonly ImageSwap[]): Result<readonly ImageSwap[]> {
  if (!Array.isArray(list))
    return { ok: false, error: L("Ugyldige bildeskifter", "Invalid image swaps") };
  if (list.length > MAX_SWAPS)
    return { ok: false, error: L("For mange bildeskifter", "Too many image swaps") };
  const frames = new Set<number>();
  const out: ImageSwap[] = [];
  for (const w of list) {
    if (!w || !Number.isInteger(w.frame) || w.frame < 1)
      return { ok: false, error: L("Ugyldig bildeskifte", "Invalid image swap") };
    if (frames.has(w.frame))
      return {
        ok: false,
        error: L("To bildeskifter på samme bilde", "Two image swaps on the same frame"),
      };
    frames.add(w.frame);
    if (typeof w.assetId !== "string" || !w.assetId)
      return {
        ok: false,
        error: L("Bildeskiftet mangler bilde", "The image swap is missing an image"),
      };
    if (w.versionId !== null && w.assetVariantId === null)
      return { ok: false, error: L("Versjon uten variant", "Version without a variant") };
    const tr = w.transition;
    if (tr !== undefined && tr !== null) {
      if (tr.kind !== "crossfade" || !Number.isInteger(tr.frames) || tr.frames < 1 || tr.frames > 10_000)
        return {
          ok: false,
          error: L("Ugyldig overgang i bildeskiftet", "Invalid transition in the image swap"),
        };
    }
    out.push({
      frame: w.frame,
      assetId: w.assetId,
      assetVariantId: w.assetVariantId ?? null,
      versionId: w.versionId ?? null,
      ...(tr ? { transition: { kind: "crossfade" as const, frames: tr.frames } } : {}),
    });
  }
  out.sort((a, b) => a.frame - b.frame);
  // Krysstoningen kan ikke være lengre enn bildet før (AS2, A2)
  for (let i = 0; i < out.length; i++) {
    const w = out[i]!;
    const gap = w.frame - (i > 0 ? out[i - 1]!.frame : 0);
    if (w.transition && w.transition.frames > gap)
      return {
        ok: false,
        error: L(
          "Krysstoningen er lengre enn bildet før",
          "The crossfade is longer than the image before it",
        ),
      };
  }
  return { ok: true, value: out };
}

/** Bevegelsesbane (DEC-0052): minst to punkter, slutt etter start, ease 0–1, stigende tempokurve. */
export function normalizePath(p: MotionPath | null): Result<MotionPath | null> {
  if (p === null) return { ok: true, value: null };
  if (typeof p !== "object" || !Array.isArray(p.points))
    return { ok: false, error: L("Ugyldig bevegelsesbane", "Invalid motion path") };
  if (p.points.length < 2 || p.points.length > MAX_PATH_POINTS)
    return {
      ok: false,
      error: L(
        `Banen må ha mellom 2 og ${MAX_PATH_POINTS} punkter`,
        `The path must have between 2 and ${MAX_PATH_POINTS} points`,
      ),
    };
  for (const q of p.points)
    if (!finite(q.x) || !finite(q.y) || Math.abs(q.x) > MAX_COORD || Math.abs(q.y) > MAX_COORD)
      return { ok: false, error: L("Ugyldig punkt i banen", "Invalid point in the path") };
  if (!Number.isInteger(p.startFrame) || !Number.isInteger(p.endFrame) || p.startFrame < 0)
    return { ok: false, error: L("Ugyldig tid for banen", "Invalid time for the path") };
  if (p.endFrame <= p.startFrame)
    return {
      ok: false,
      error: L("Banen må slutte etter at den starter", "The path must end after it starts"),
    };
  for (const v of [p.easeOut, p.easeIn])
    if (!finite(v) || v < 0 || v > 1)
      return {
        ok: false,
        error: L(
          "Styrken på ease må være mellom 0 og 100 %",
          "The ease strength must be between 0 and 100 %",
        ),
      };
  if (!Array.isArray(p.tempo) || p.tempo.length > MAX_TEMPO_POINTS)
    return { ok: false, error: L("Ugyldig tempokurve", "Invalid tempo curve") };
  let lastT = 0;
  let lastP = 0;
  for (const q of p.tempo) {
    if (!finite(q.t) || !finite(q.p) || q.t <= lastT || q.t >= 1 || q.p < lastP || q.p > 1)
      return {
        ok: false,
        error: L(
          "Punktene i tempokurven må stige fra start til slutt",
          "The tempo curve points must rise from start to end",
        ),
      };
    lastT = q.t;
    lastP = q.p;
  }
  return {
    ok: true,
    value: {
      points: p.points.map((q) => ({ x: q.x, y: q.y, smooth: q.smooth === true })),
      startFrame: p.startFrame,
      endFrame: p.endFrame,
      easeOut: p.easeOut,
      easeIn: p.easeIn,
      tempo: p.tempo.map((q) => ({ t: q.t, p: q.p })),
    },
  };
}

export function normalizeLayerFields(f: LayerFields): Result<LayerFields> {
  if (!LAYER_KINDS.includes(f.kind))
    return { ok: false, error: L("Ugyldig lagtype", "Invalid layer type") };
  const name = f.name.trim();
  if (name.length > 200)
    return {
      ok: false,
      error: L(
        "Navnet er for langt (maks 200 tegn)",
        "The name is too long (maximum 200 characters)",
      ),
    };
  if (!validText(name))
    return {
      ok: false,
      error: L("Navnet inneholder ugyldige tegn", "The name contains invalid characters"),
    };
  const fill = f.fill === null ? null : normalizeColor(f.fill);
  if (f.fill !== null && !fill)
    return {
      ok: false,
      error: L("Fargen må være på formen #rrggbb", "The colour must be in the form #rrggbb"),
    };
  const group = f.kind === "group";
  if (group && (f.assetId !== null || fill !== null || (f.swaps ?? []).length > 0))
    return {
      ok: false,
      error: L("En gruppe viser ikke noe bilde selv", "A group does not show an image itself"),
    };
  if (!group && f.assetId === null && fill === null)
    return {
      ok: false,
      error: L(
        "Laget må vise et bilde fra biblioteket eller en fargeflate",
        "The layer must show an image from the library or a colour fill",
      ),
    };
  if (group && f.groupId !== null)
    return {
      ok: false,
      error: L("En gruppe kan ikke ligge i en gruppe", "A group cannot be inside another group"),
    };
  if (f.assetId === null && (f.assetVariantId !== null || f.versionId !== null))
    return {
      ok: false,
      error: L("Variant eller versjon uten ressurs", "Variant or version without an asset"),
    };
  if (f.versionId !== null && f.assetVariantId === null)
    return { ok: false, error: L("Versjon uten variant", "Version without a variant") };
  if (!Number.isInteger(f.width) || f.width < 1 || f.width > MAX_SIZE)
    return { ok: false, error: L("Ugyldig bredde", "Invalid width") };
  if (!Number.isInteger(f.height) || f.height < 1 || f.height > MAX_SIZE)
    return { ok: false, error: L("Ugyldig høyde", "Invalid height") };
  if (!finite(f.parallax) || f.parallax < 0 || f.parallax > 4)
    return {
      ok: false,
      error: L("Parallaksen må være mellom 0 og 4", "The parallax must be between 0 and 4"),
    };
  const t = normalizeTransform(f.transform);
  if (!t.ok) return t;
  const k = normalizeKeyframes(f.keyframes);
  if (!k.ok) return k;
  if (f.groupId !== null && f.groupId.length > 64)
    return { ok: false, error: L("Ugyldig gruppe", "Invalid group") };
  const swaps = normalizeSwaps(f.swaps ?? []);
  if (!swaps.ok) return swaps;
  const path = normalizePath(f.path ?? null);
  if (!path.ok) return path;
  const anchor =
    f.anchor === null || f.anchor === undefined
      ? null
      : finite(f.anchor.x) && finite(f.anchor.y)
        ? { x: f.anchor.x, y: f.anchor.y }
        : undefined;
  if (anchor === undefined)
    return { ok: false, error: L("Ugyldig ankerpunkt", "Invalid anchor point") };
  const langs = normalizeLanguageImages(f.languageImages ?? []);
  if (!langs.ok) return langs;
  if (langs.value.length > 0 && (group || f.assetId === null))
    return {
      ok: false,
      error: L(
        "Bare et lag med bilde kan ha et eget bilde per språk",
        "Only a layer with an image can have its own image per language",
      ),
    };
  // Maske og blandingsmodus (REQ-0175): kontroll mot andre lag skjer i kommandoen
  const mask = normalizeMask(f.mask ?? null);
  if (!mask.ok) return mask;
  const blend = normalizeBlend(f.blend ?? "normal");
  if (!blend.ok) return blend;
  if (group && (mask.value !== null || blend.value !== "normal"))
    return {
      ok: false,
      error: L(
        "En gruppe kan ikke ha maske eller blandingsmodus",
        "A group cannot have a mask or blend mode",
      ),
    };
  const keyframes = maskKeyframes(k.value, mask.value);
  if (!keyframes.ok) return keyframes;
  // Aktivt tidsområde (AS2, A3)
  const ar = f.activeRange ?? null;
  if (
    ar !== null &&
    (!Number.isInteger(ar.from) || !Number.isInteger(ar.to) || ar.from < 0 || ar.to < ar.from)
  )
    return { ok: false, error: L("Ugyldig aktivt område", "Invalid active range") };
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
      keyframes: keyframes.value,
      visible: f.visible === true,
      locked: f.locked === true,
      groupId: f.groupId,
      swaps: swaps.value,
      path: path.value,
      anchor: group ? anchor : null,
      ...(langs.value.length ? { languageImages: langs.value } : {}),
      ...(mask.value ? { mask: mask.value } : {}),
      ...(blend.value !== "normal" ? { blend: blend.value } : {}),
      ...(ar ? { activeRange: { from: ar.from, to: ar.to } } : {}),
    },
  };
}

// ---------- Maske og blandingsmodus (REQ-0175, mandat 11.2) ----------

export const BLEND_MODES: readonly BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "soft-light",
  "color",
];

export const BLEND_LABEL: Record<BlendMode, string> = localized({
  normal: ["Normal", "Normal"],
  multiply: ["Multipliser", "Multiply"],
  screen: ["Skjerm", "Screen"],
  overlay: ["Overlegg", "Overlay"],
  darken: ["Mørkere", "Darken"],
  lighten: ["Lysere", "Lighten"],
  "soft-light": ["Mykt lys", "Soft light"],
  color: ["Farge", "Colour"],
});

/** Største myke kant på en maske (piksler). */
export const MAX_MASK_FEATHER = 200;

export function normalizeBlend(b: BlendMode): Result<BlendMode> {
  return BLEND_MODES.includes(b)
    ? { ok: true, value: b }
    : { ok: false, error: L("Ugyldig blandingsmodus", "Invalid blend mode") };
}

/**
 * Maske (REQ-0175): rektangel/ellipse med positiv størrelse og myk kant 0–200 px, eller et annet lag.
 * Om laget finnes, ligger i samme 2D-scene og ikke gir en ring, kontrolleres i kommandoen.
 */
export function normalizeMask(m: LayerMask | null): Result<LayerMask | null> {
  if (m === null) return { ok: true, value: null };
  if (typeof m !== "object") return { ok: false, error: L("Ugyldig maske", "Invalid mask") };
  if (m.invert !== undefined && typeof m.invert !== "boolean")
    return { ok: false, error: L("Ugyldig maske", "Invalid mask") };
  const invert = m.invert === true;
  if (m.kind === "layer") {
    if (typeof m.layerId !== "string" || m.layerId.length === 0 || m.layerId.length > 64)
      return { ok: false, error: L("Ugyldig lag for masken", "Invalid layer for the mask") };
    return { ok: true, value: { kind: "layer", layerId: m.layerId, invert } };
  }
  if (m.kind !== "rect" && m.kind !== "ellipse")
    return { ok: false, error: L("Ugyldig type maske", "Invalid mask type") };
  if (!finite(m.x) || !finite(m.y) || Math.abs(m.x) > MAX_COORD || Math.abs(m.y) > MAX_COORD)
    return { ok: false, error: L("Ugyldig plassering av masken", "Invalid position of the mask") };
  if (!finite(m.width) || !finite(m.height) || m.width <= 0 || m.height <= 0)
    return {
      ok: false,
      error: L(
        "Masken må ha bredde og høyde over 0",
        "The mask must have a width and height above 0",
      ),
    };
  if (m.width > MAX_COORD || m.height > MAX_COORD)
    return { ok: false, error: L("Masken er for stor", "The mask is too large") };
  if (!finite(m.feather) || m.feather < 0 || m.feather > MAX_MASK_FEATHER)
    return {
      ok: false,
      error: L(
        `Myk kant må være mellom 0 og ${MAX_MASK_FEATHER} px`,
        `The soft edge must be between 0 and ${MAX_MASK_FEATHER} px`,
      ),
    };
  return {
    ok: true,
    value: {
      kind: m.kind,
      x: m.x,
      y: m.y,
      width: m.width,
      height: m.height,
      feather: m.feather,
      invert,
    },
  };
}

/**
 * Nøkkelbilder for masken (DEC-0072): bare et lag med rektangel- eller ellipsemaske kan ha dem. Uten en slik
 * maske fjernes de (de ville ikke vist noe, og angre gir dem tilbake sammen med masken). Størrelsen må være
 * over 0 og plasseringen innenfor samme grenser som masken selv.
 */
function maskKeyframes(
  list: readonly Keyframe[],
  mask: LayerMask | null,
): Result<readonly Keyframe[]> {
  if (!mask || mask.kind === "layer") {
    return list.some((k) => isMaskProperty(k.property))
      ? { ok: true, value: list.filter((k) => !isMaskProperty(k.property)) }
      : { ok: true, value: list };
  }
  for (const k of list) {
    if (!isMaskProperty(k.property)) continue;
    if (Math.abs(k.value) > MAX_COORD)
      return {
        ok: false,
        error: L(
          "Ugyldig plassering eller størrelse på masken i nøkkelbilde",
          "Invalid position or size of the mask in a keyframe",
        ),
      };
    if ((k.property === "maskWidth" || k.property === "maskHeight") && k.value <= 0)
      return {
        ok: false,
        error: L(
          "Masken må ha bredde og høyde over 0",
          "The mask must have a width and height above 0",
        ),
      };
  }
  return { ok: true, value: list };
}

/** Språkavhengige bilder (DEC-0059): ett per språk, ikke hovedspråket, sortert etter språk. */
export function normalizeLanguageImages(
  list: readonly LanguageImage[],
): Result<readonly LanguageImage[]> {
  if (!Array.isArray(list) || list.length > 20)
    return { ok: false, error: L("Ugyldige bilder per språk", "Invalid images per language") };
  const seen = new Set<string>();
  const out: LanguageImage[] = [];
  for (const li of list) {
    if (!li || typeof li.language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(li.language))
      return { ok: false, error: L("Ugyldig språk for bildet", "Invalid language for the image") };
    if (li.language === "nb")
      return {
        ok: false,
        error: L("Norsk bruker lagets eget bilde", "Norwegian uses the layer's own image"),
      };
    if (seen.has(li.language))
      return {
        ok: false,
        error: L("To bilder for samme språk", "Two images for the same language"),
      };
    seen.add(li.language);
    if (typeof li.assetVariantId !== "string" || !li.assetVariantId)
      return {
        ok: false,
        error: L(
          "Bildet for språket mangler variant",
          "The image for the language is missing a variant",
        ),
      };
    out.push({
      language: li.language,
      assetVariantId: li.assetVariantId,
      versionId: li.versionId ?? null,
    });
  }
  out.sort((a, b) => a.language.localeCompare(b.language));
  return { ok: true, value: out };
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
    return { ok: false, error: L("Ugyldig kamera", "Invalid camera") };
  if (c.shots.length > MAX_SHOTS)
    return { ok: false, error: L("For mange kamerautsnitt", "Too many camera shots") };
  const ids = new Set<string>();
  const shots = [];
  for (const sh of c.shots) {
    if (typeof sh.id !== "string" || !sh.id || sh.id.length > 64 || ids.has(sh.id))
      return { ok: false, error: L("Ugyldig kamerautsnitt", "Invalid camera shot") };
    ids.add(sh.id);
    if (
      !Number.isInteger(sh.startFrame) ||
      !Number.isInteger(sh.endFrame) ||
      sh.startFrame < 0 ||
      sh.endFrame < sh.startFrame
    )
      return {
        ok: false,
        error: L(
          "Kamerautsnittet må slutte etter at det starter",
          "The camera shot must end after it starts",
        ),
      };
    const from = cameraFrame(sh.from);
    const to = cameraFrame(sh.to);
    if (!from || !to) return { ok: false, error: L("Ugyldig kameraramme", "Invalid camera frame") };
    if (!EASINGS.includes(sh.easing))
      return { ok: false, error: L("Ugyldig hastighetskurve", "Invalid easing curve") };
    let curve = null;
    if (sh.curve !== null) {
      const k = sh.curve;
      if (![k.c1x, k.c1y, k.c2x, k.c2y].every(finite))
        return { ok: false, error: L("Ugyldig kamerabane", "Invalid camera path") };
      curve = { c1x: k.c1x, c1y: k.c1y, c2x: k.c2x, c2y: k.c2y };
    }
    const name = typeof sh.name === "string" ? sh.name.trim().slice(0, 200) : "";
    if (!validText(name) || !validText(sh.id))
      return {
        ok: false,
        error: L("Ugyldige tegn i kameraet", "Invalid characters in the camera"),
      };
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
      return {
        ok: false,
        error: L(
          "Kamerautsnittene overlapper. Flytt eller forkort ett av dem.",
          "The camera shots overlap. Move or shorten one of them.",
        ),
      };
  return { ok: true, value: { shots } };
}
