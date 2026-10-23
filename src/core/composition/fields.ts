import { isScriptLanguageTag } from "../translation/language-tags";
/**
 * Felter og grenser for 2D-scener og lag (M3 del 2, mandat kap. 11). Ren logikk uten avhengigheter.
 * `normalize…` returnerer normaliserte felter eller en norsk feilmelding.
 */
import { TRANSITION_KINDS } from "../model";
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

import {
  normalizeEffects,
  normalizeShape,
  normalizeTemplateRef,
  normalizeTextSpec,
} from "../typography/validate";
import { t as tk, tLocalized } from "@/core/i18n/keyed";
import { panelNoteError, arrowSpecError, cameraMarkError } from "../storyboard";

export const LAYER_KINDS: readonly LayerKind[] = [
  "background",
  "midground",
  "foreground",
  "character",
  "object",
  "effect",
  "other",
  "group",
  "text",
  "page",
  // SB-1 (migrasjon 0102): bare tillatt i storyboardkomposisjoner (kontrolleres i kommandoen og i databasen)
  "note",
  "arrow",
  "camera_mark",
];

export const LAYER_KIND_LABEL: Record<LayerKind, string> = tLocalized({ background: "core-composition-fields.layer-kind-label.background.6e4860fc7e26", midground: "core-composition-fields.layer-kind-label.midground.31b050e96f64", foreground: "core-composition-fields.layer-kind-label.foreground.6f7287418771", character: "core-composition-fields.layer-kind-label.character.4ad6ccb07769", object: "core-composition-fields.layer-kind-label.object.0cc9d5535e35", effect: "core-composition-fields.layer-kind-label.effect.e9a75c00a85f", other: "core-composition-fields.layer-kind-label.other.03f5066b9af7", group: "core-composition-fields.layer-kind-label.group.0cdb01acb892", text: "core-composition-fields.layer-kind-label.text.07732bbe6214", page: "core-composition-fields.layer-kind-label.page.1fb83e5a1234", note: "sb1.layer-note", arrow: "sb1.layer-arrow", camera_mark: "sb1.layer-camera-mark" });

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
  text: 1,
  page: 1,
  note: 1,
  arrow: 1,
  camera_mark: 1,
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
      return tk("core-composition-fields.composition-formats.message.a1a6c0f641b2");
    },
    width: 1998,
    height: 1080,
  },
  { label: "Scope 2.39:1 (2048 × 858)", width: 2048, height: 858 },
  {
    get label() {
      return tk("core-composition-fields.composition-formats.message.1f180268ab0d");
    },
    width: 1080,
    height: 1080,
  },
  {
    get label() {
      return tk("core-composition-fields.composition-formats.message.bb75e0995a61");
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
      error: tk("core-composition-fields.error.error.2527917261cf", { MIN_SIZE: String(MIN_SIZE), MAX_SIZE: String(MAX_SIZE) }),
    };
  if (!Number.isInteger(f.height) || f.height < MIN_SIZE || f.height > MAX_SIZE)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.31898a13dfeb", { MIN_SIZE: String(MIN_SIZE), MAX_SIZE: String(MAX_SIZE) }),
    };
  if (!Number.isInteger(f.durationFrames) || f.durationFrames < 0 || f.durationFrames > 10_000_000)
    return { ok: false, error: tk("core-composition-fields.error.error.b38d50fa79ba") };
  const background = normalizeColor(f.background);
  if (!background)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.2f3f356fc3d3"),
    };
  const name = f.name.trim();
  if (name.length > 200)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.a1b730d3c93c"),
    };
  if (!validText(name))
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.bd227ec51d4c"),
    };
  return { ok: true, value: { ...f, name, background } };
}

export function normalizeTransform(t: LayerTransform): Result<LayerTransform> {
  for (const k of ["x", "y", "scaleX", "scaleY", "rotation", "opacity"] as const)
    if (!finite(t[k]))
      return { ok: false, error: tk("core-composition-fields.error.error.848ae0f42a0a", { k: String(k) }) };
  if (Math.abs(t.x) > MAX_COORD || Math.abs(t.y) > MAX_COORD)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.12e4b2ec92df"),
    };
  if (Math.abs(t.scaleX) > MAX_SCALE || Math.abs(t.scaleY) > MAX_SCALE)
    return { ok: false, error: tk("core-composition-fields.error.error.b1b26c07c31e") };
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
    return { ok: false, error: tk("core-composition-fields.error.error.c2526fec210e") };
  const seen = new Set<string>();
  for (const k of list) {
    if (!Number.isInteger(k.frame) || k.frame < 0)
      return { ok: false, error: tk("core-composition-fields.error.error.ce5ce821788e") };
    if (!KEYFRAME_PROPERTIES.includes(k.property))
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.fd4ce020fb64"),
      };
    if (!finite(k.value))
      return { ok: false, error: tk("core-composition-fields.error.error.d55dfbdc25cb") };
    if (!EASINGS.includes(k.easing))
      return { ok: false, error: tk("core-composition-fields.error.error.27338a882356") };
    for (const v of [k.easeOut, k.easeIn])
      if (v !== undefined && (!finite(v) || v < 0 || v > 1))
        return {
          ok: false,
          error: tk("core-composition-fields.error.error.6c622f15f0e0"),
        };
    const key = `${k.property}@${k.frame}`;
    if (seen.has(key))
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.019feb331500"),
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
    return { ok: false, error: tk("core-composition-fields.error.error.67039a07f370") };
  if (list.length > MAX_SWAPS)
    return { ok: false, error: tk("core-composition-fields.error.error.2490286dbee7") };
  const frames = new Set<number>();
  const out: ImageSwap[] = [];
  for (const w of list) {
    if (!w || !Number.isInteger(w.frame) || w.frame < 1)
      return { ok: false, error: tk("core-composition-fields.error.error.85332dbf18d8") };
    if (frames.has(w.frame))
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.b9edd0bc2283"),
      };
    frames.add(w.frame);
    if (typeof w.assetId !== "string" || !w.assetId)
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.34d1e0ea261f"),
      };
    if (w.versionId !== null && w.assetVariantId === null)
      return { ok: false, error: tk("core-composition-fields.error.error.9e78d5e817ab") };
    const tr = w.transition;
    if (tr !== undefined && tr !== null) {
      if (tr.kind !== "crossfade" || !Number.isInteger(tr.frames) || tr.frames < 1 || tr.frames > 10_000)
        return {
          ok: false,
          error: tk("core-composition-fields.error.error.96e56cd7a8f9"),
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
        error: tk("core-composition-fields.error.error.b7a65cea0f1c"),
      };
  }
  return { ok: true, value: out };
}

/** Bevegelsesbane (DEC-0052): minst to punkter, slutt etter start, ease 0–1, stigende tempokurve. */
export function normalizePath(p: MotionPath | null): Result<MotionPath | null> {
  if (p === null) return { ok: true, value: null };
  if (typeof p !== "object" || !Array.isArray(p.points))
    return { ok: false, error: tk("core-composition-fields.error.error.ba372c41650b") };
  if (p.points.length < 2 || p.points.length > MAX_PATH_POINTS)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.4c0101356b82", { MAX_PATH_POINTS: String(MAX_PATH_POINTS) }),
    };
  for (const q of p.points)
    if (!finite(q.x) || !finite(q.y) || Math.abs(q.x) > MAX_COORD || Math.abs(q.y) > MAX_COORD)
      return { ok: false, error: tk("core-composition-fields.error.error.1d822425770f") };
  if (!Number.isInteger(p.startFrame) || !Number.isInteger(p.endFrame) || p.startFrame < 0)
    return { ok: false, error: tk("core-composition-fields.error.error.27f42ab840d5") };
  if (p.endFrame <= p.startFrame)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.bf97b53f71a2"),
    };
  for (const v of [p.easeOut, p.easeIn])
    if (!finite(v) || v < 0 || v > 1)
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.6c622f15f0e0.2"),
      };
  if (!Array.isArray(p.tempo) || p.tempo.length > MAX_TEMPO_POINTS)
    return { ok: false, error: tk("core-composition-fields.error.error.7eff99a93d22") };
  let lastT = 0;
  let lastP = 0;
  for (const q of p.tempo) {
    if (!finite(q.t) || !finite(q.p) || q.t <= lastT || q.t >= 1 || q.p < lastP || q.p > 1)
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.e14a8b17490f"),
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
    return { ok: false, error: tk("core-composition-fields.error.error.6d388f9d2902") };
  const name = f.name.trim();
  if (name.length > 200)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.a1b730d3c93c.2"),
    };
  if (!validText(name))
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.bd227ec51d4c.2"),
    };
  const fill = f.fill === null ? null : normalizeColor(f.fill);
  if (f.fill !== null && !fill)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.904ff8576383"),
    };
  // Sidelag (MTS MT6) oppfører seg som grupper: viser ikke noe selv, kan ikke ligge i en gruppe
  const group = f.kind === "group" || f.kind === "page";
  if (group && (f.assetId !== null || fill !== null || (f.swaps ?? []).length > 0))
    return {
      ok: false,
      error:
        f.kind === "page"
          ? tk("core-composition-fields.error.error.3754542a313f")
          : tk("core-composition-fields.error.error.af5507d36308"),
    };
  const textLayer = f.kind === "text";
  if (textLayer && (f.assetId !== null || fill !== null || !f.text || (f.swaps ?? []).length > 0))
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.9ce003dec334"),
    };
  if (!textLayer && f.text)
    return { ok: false, error: tk("core-composition-fields.error.error.b016677c4eb9") };
  // Storyboardlag (SB-1): lapp, pil og kameramerke bærer innholdet sitt i egen spesifikasjon.
  // At lagtypen bare er tillatt i storyboardkomposisjoner, kontrolleres i kommandoen og i databasen.
  const sbKind = f.kind === "note" || f.kind === "arrow" || f.kind === "camera_mark";
  if (sbKind) {
    if (f.assetId !== null || fill !== null || (f.swaps ?? []).length > 0)
      return { ok: false, error: tk("sb1.error.invalid-layer") };
    const specError =
      f.kind === "note"
        ? panelNoteError(f.note as never)
        : f.kind === "arrow"
          ? arrowSpecError(f.arrow as never)
          : cameraMarkError(f.cameraMark as never);
    if (
      specError ||
      (f.kind !== "note" && f.note) ||
      (f.kind !== "arrow" && f.arrow) ||
      (f.kind !== "camera_mark" && f.cameraMark)
    )
      return { ok: false, error: tk("sb1.error.invalid-layer") };
  } else if (f.note || f.arrow || f.cameraMark)
    return { ok: false, error: tk("sb1.error.invalid-layer") };
  if (!group && !textLayer && !sbKind && f.assetId === null && fill === null)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.93ee74e67b12"),
    };
  if (group && f.groupId !== null)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.0649658150f2"),
    };
  if (f.assetId === null && (f.assetVariantId !== null || f.versionId !== null))
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.89a432c6df1e"),
    };
  if (f.versionId !== null && f.assetVariantId === null)
    return { ok: false, error: tk("core-composition-fields.error.error.9e78d5e817ab.2") };
  if (!Number.isInteger(f.width) || f.width < 1 || f.width > MAX_SIZE)
    return { ok: false, error: tk("core-composition-fields.error.error.96af0c80735e") };
  if (!Number.isInteger(f.height) || f.height < 1 || f.height > MAX_SIZE)
    return { ok: false, error: tk("core-composition-fields.error.error.5cd644bf0d61") };
  if (!finite(f.parallax) || f.parallax < 0 || f.parallax > 4)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.967c355694b5"),
    };
  const t = normalizeTransform(f.transform);
  if (!t.ok) return t;
  const k = normalizeKeyframes(f.keyframes);
  if (!k.ok) return k;
  if (f.groupId !== null && f.groupId.length > 64)
    return { ok: false, error: tk("core-composition-fields.error.error.5484b6939b46") };
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
    return { ok: false, error: tk("core-composition-fields.error.error.3475499a18da") };
  const langs = normalizeLanguageImages(f.languageImages ?? []);
  if (!langs.ok) return langs;
  if (langs.value.length > 0 && (group || f.assetId === null))
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.b8bf91def60e"),
    };
  // Maske og blandingsmodus (REQ-0175): kontroll mot andre lag skjer i kommandoen
  const mask = normalizeMask(f.mask ?? null);
  if (!mask.ok) return mask;
  const blend = normalizeBlend(f.blend ?? "normal");
  if (!blend.ok) return blend;
  if (group && (mask.value !== null || blend.value !== "normal"))
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.e3c0245908ea"),
    };
  const keyframes = maskKeyframes(k.value, mask.value);
  if (!keyframes.ok) return keyframes;
  // Tekst, form, effekter og malfelt (MTS)
  const text = f.text ? normalizeTextSpec(f.text) : ({ ok: true, value: null } as const);
  if (!text.ok) return text;
  const shape = normalizeShape(f.shape);
  if (!shape.ok) return shape;
  if (shape.value && (fill === null || f.assetId !== null))
    return { ok: false, error: tk("core-composition-fields.error.error.0b4307721a01") };
  const effects = normalizeEffects(f.effects);
  if (!effects.ok) return effects;
  if (effects.value && group)
    return { ok: false, error: tk("core-composition-fields.error.error.0684da26635e") };
  const tpl = normalizeTemplateRef(f.template);
  if (!tpl.ok) return tpl;
  // Overgangen inn i siden (MTS MT6): bare sidelag; «cut» lagres ikke (mangler = kutt)
  let pageTransition: import("../model").Transition | null = null;
  if (f.pageTransition !== undefined && f.pageTransition !== null) {
    const pt = f.pageTransition;
    if (f.kind !== "page")
      return { ok: false, error: tk("core-composition-fields.error.error.9f68d4ad33fc") };
    if (
      !TRANSITION_KINDS.includes(pt.kind) ||
      !Number.isInteger(pt.frames) ||
      pt.frames < 0 ||
      pt.frames > 10_000
    )
      return { ok: false, error: tk("core-composition-fields.error.error.edb70213fe66") };
    if (pt.kind !== "cut" && pt.frames > 0) pageTransition = { kind: pt.kind, frames: pt.frames };
  }
  // Aktivt tidsområde (AS2, A3)
  const ar = f.activeRange ?? null;
  if (
    ar !== null &&
    (!Number.isInteger(ar.from) || !Number.isInteger(ar.to) || ar.from < 0 || ar.to < ar.from)
  )
    return { ok: false, error: tk("core-composition-fields.error.error.c53bf4239394") };
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
      ...(text.value ? { text: text.value } : {}),
      ...(shape.value ? { shape: shape.value } : {}),
      ...(effects.value ? { effects: effects.value } : {}),
      ...(tpl.value ? { template: tpl.value } : {}),
      ...(pageTransition ? { pageTransition } : {}),
      ...(f.kind === "note" && f.note ? { note: f.note } : {}),
      ...(f.kind === "arrow" && f.arrow ? { arrow: f.arrow } : {}),
      ...(f.kind === "camera_mark" && f.cameraMark ? { cameraMark: f.cameraMark } : {}),
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

export const BLEND_LABEL: Record<BlendMode, string> = tLocalized({ normal: "core-composition-fields.blend-label.normal.46f6b58cf0d2", multiply: "core-composition-fields.blend-label.multiply.9dde5bedc7ac", screen: "core-composition-fields.blend-label.screen.75d742ab12d6", overlay: "core-composition-fields.blend-label.overlay.cacb6a5bb7dc", darken: "core-composition-fields.blend-label.darken.df32ade13bc9", lighten: "core-composition-fields.blend-label.lighten.5b5d7b6aa6a4", "soft-light": "core-composition-fields.blend-label.soft-light.f2d19b35d47f", color: "core-composition-fields.blend-label.color.3db247d33699" });

/** Største myke kant på en maske (piksler). */
export const MAX_MASK_FEATHER = 200;

export function normalizeBlend(b: BlendMode): Result<BlendMode> {
  return BLEND_MODES.includes(b)
    ? { ok: true, value: b }
    : { ok: false, error: tk("core-composition-fields.error.error.ff8cc66d7da0") };
}

/**
 * Maske (REQ-0175): rektangel/ellipse med positiv størrelse og myk kant 0–200 px, eller et annet lag.
 * Om laget finnes, ligger i samme 2D-scene og ikke gir en ring, kontrolleres i kommandoen.
 */
export function normalizeMask(m: LayerMask | null): Result<LayerMask | null> {
  if (m === null) return { ok: true, value: null };
  if (typeof m !== "object") return { ok: false, error: tk("core-composition-fields.error.error.c75351cc5b56") };
  if (m.invert !== undefined && typeof m.invert !== "boolean")
    return { ok: false, error: tk("core-composition-fields.error.error.c75351cc5b56.2") };
  const invert = m.invert === true;
  if (m.kind === "layer") {
    if (typeof m.layerId !== "string" || m.layerId.length === 0 || m.layerId.length > 64)
      return { ok: false, error: tk("core-composition-fields.error.error.1294e3c5e368") };
    return { ok: true, value: { kind: "layer", layerId: m.layerId, invert } };
  }
  if (m.kind !== "rect" && m.kind !== "ellipse")
    return { ok: false, error: tk("core-composition-fields.error.error.758d808ebac0") };
  if (!finite(m.x) || !finite(m.y) || Math.abs(m.x) > MAX_COORD || Math.abs(m.y) > MAX_COORD)
    return { ok: false, error: tk("core-composition-fields.error.error.4ad15b3631e8") };
  if (!finite(m.width) || !finite(m.height) || m.width <= 0 || m.height <= 0)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.a4f1b97641ca"),
    };
  if (m.width > MAX_COORD || m.height > MAX_COORD)
    return { ok: false, error: tk("core-composition-fields.error.error.76f016e9d457") };
  if (!finite(m.feather) || m.feather < 0 || m.feather > MAX_MASK_FEATHER)
    return {
      ok: false,
      error: tk("core-composition-fields.error.error.b2f9ad3691b5", { MAX_MASK_FEATHER: String(MAX_MASK_FEATHER) }),
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
        error: tk("core-composition-fields.error.error.5405cb447f1b"),
      };
    if ((k.property === "maskWidth" || k.property === "maskHeight") && k.value <= 0)
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.a4f1b97641ca.2"),
      };
  }
  return { ok: true, value: list };
}

/** Språkavhengige bilder (DEC-0059): ett per språk, ikke hovedspråket, sortert etter språk. */
export function normalizeLanguageImages(
  list: readonly LanguageImage[],
): Result<readonly LanguageImage[]> {
  if (!Array.isArray(list) || list.length > 20)
    return { ok: false, error: tk("core-composition-fields.error.error.0d2b9114f802") };
  const seen = new Set<string>();
  const out: LanguageImage[] = [];
  for (const li of list) {
    if (!li || typeof li.language !== "string" || !isScriptLanguageTag(li.language))
      return { ok: false, error: tk("core-composition-fields.error.error.09a2b9a18fb7") };
    if (seen.has(li.language))
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.a62138f1e5f3"),
      };
    seen.add(li.language);
    if (typeof li.assetVariantId !== "string" || !li.assetVariantId)
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.f2b9e6a5c518"),
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
    return { ok: false, error: tk("core-composition-fields.error.error.29da565c9517") };
  if (c.shots.length > MAX_SHOTS)
    return { ok: false, error: tk("core-composition-fields.error.error.65da5e8cda8d") };
  const ids = new Set<string>();
  const shots = [];
  for (const sh of c.shots) {
    if (typeof sh.id !== "string" || !sh.id || sh.id.length > 64 || ids.has(sh.id))
      return { ok: false, error: tk("core-composition-fields.error.error.d26c2a33b316") };
    ids.add(sh.id);
    if (
      !Number.isInteger(sh.startFrame) ||
      !Number.isInteger(sh.endFrame) ||
      sh.startFrame < 0 ||
      sh.endFrame < sh.startFrame
    )
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.8c32267612cd"),
      };
    const from = cameraFrame(sh.from);
    const to = cameraFrame(sh.to);
    if (!from || !to) return { ok: false, error: tk("core-composition-fields.error.error.070bbd8ae3c4") };
    if (!EASINGS.includes(sh.easing))
      return { ok: false, error: tk("core-composition-fields.error.error.27338a882356.2") };
    let curve = null;
    if (sh.curve !== null) {
      const k = sh.curve;
      if (![k.c1x, k.c1y, k.c2x, k.c2y].every(finite))
        return { ok: false, error: tk("core-composition-fields.error.error.87b9ef0aae78") };
      curve = { c1x: k.c1x, c1y: k.c1y, c2x: k.c2x, c2y: k.c2y };
    }
    const name = typeof sh.name === "string" ? sh.name.trim().slice(0, 200) : "";
    if (!validText(name) || !validText(sh.id))
      return {
        ok: false,
        error: tk("core-composition-fields.error.error.3024617477db"),
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
        error: tk("core-composition-fields.error.error.cac38573239b"),
      };
  return { ok: true, value: { shots } };
}
