/** Validering av tekst, form og effekter (MTS MT1). Returnerer normaliserte verdier eller en melding. */
import { L } from "../i18n";
import { fontById } from "./fonts";
import {
  MAX_TEXT_CHARS,
  type LayerEffects,
  type LetterAnimation,
  type ShapeSpec,
  type TemplateSlotRef,
  type TextSpec,
} from "./types";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const HEX = /^#[0-9a-fA-F]{6}$/;
const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const color = (c: unknown) => typeof c === "string" && HEX.test(c);
const bad = (no: string, en: string) => ({ ok: false as const, error: L(no, en) });

export function normalizeLetterAnim(a: LetterAnimation | null | undefined): Result<LetterAnimation | null> {
  if (!a) return { ok: true, value: null };
  const ints = [a.startFrame, a.delayFrames, a.durationFrames];
  if (
    !["letter", "word", "line"].includes(a.unit) ||
    !["appear", "fade", "slide", "scale"].includes(a.effect) ||
    !["up", "down", "left", "right"].includes(a.direction) ||
    !["start", "end", "center", "random"].includes(a.order) ||
    ints.some((n) => !Number.isInteger(n) || n < 0 || n > 100_000) ||
    !Number.isInteger(a.seed) ||
    !fin(a.distance) ||
    Math.abs(a.distance) > 10_000
  )
    return bad("Ugyldig bokstavanimasjon", "Invalid letter animation");
  return {
    ok: true,
    value: {
      unit: a.unit,
      effect: a.effect,
      direction: a.direction,
      startFrame: a.startFrame,
      delayFrames: a.delayFrames,
      durationFrames: a.durationFrames,
      order: a.order,
      seed: a.seed,
      distance: a.distance,
    },
  };
}

export function normalizeTextSpec(t: TextSpec): Result<TextSpec> {
  if (typeof t.content !== "string") return bad("Ugyldig tekst", "Invalid text");
  const n = [...t.content].length;
  if (n > MAX_TEXT_CHARS)
    return bad(
      `Teksten har ${n} tegn. Grensen er ${MAX_TEXT_CHARS} tegn per tekstlag. Del teksten på flere lag.`,
      `The text has ${n} characters. The limit is ${MAX_TEXT_CHARS} characters per text layer. Split the text over several layers.`,
    );
  if (!fontById(t.fontId)) return bad("Ukjent font", "Unknown font");
  if (!fin(t.size) || t.size < 4 || t.size > 2000) return bad("Ugyldig tekststørrelse", "Invalid text size");
  if (!Number.isInteger(t.weight) || t.weight < 100 || t.weight > 900)
    return bad("Ugyldig vekt", "Invalid weight");
  if (!color(t.color)) return bad("Fargen må være på formen #rrggbb", "The colour must be in the form #rrggbb");
  if (!fin(t.letterSpacing) || Math.abs(t.letterSpacing) > 500)
    return bad("Ugyldig bokstavavstand", "Invalid letter spacing");
  if (!fin(t.lineHeight) || t.lineHeight < 0.5 || t.lineHeight > 5)
    return bad("Ugyldig linjeavstand", "Invalid line spacing");
  if (!["left", "center", "right"].includes(t.align) || !["top", "middle", "bottom"].includes(t.vAlign))
    return bad("Ugyldig justering", "Invalid alignment");
  const anim = normalizeLetterAnim(t.letterAnim);
  if (!anim.ok) return anim;
  return {
    ok: true,
    value: {
      content: t.content,
      fontId: t.fontId,
      size: t.size,
      weight: t.weight,
      italic: t.italic === true,
      color: t.color.toLowerCase(),
      letterSpacing: t.letterSpacing,
      lineHeight: t.lineHeight,
      align: t.align,
      vAlign: t.vAlign,
      wrap: t.wrap !== false,
      ...(anim.value ? { letterAnim: anim.value } : {}),
    },
  };
}

export function normalizeShape(s: ShapeSpec | null | undefined): Result<ShapeSpec | null> {
  if (!s) return { ok: true, value: null };
  if (!["rect", "ellipse", "line"].includes(s.type) || !fin(s.radius) || s.radius < 0 || s.radius > 10_000)
    return bad("Ugyldig form", "Invalid shape");
  if (s.stroke && (!color(s.stroke.color) || !fin(s.stroke.width) || s.stroke.width < 0 || s.stroke.width > 500))
    return bad("Ugyldig kantlinje", "Invalid stroke");
  return {
    ok: true,
    value: {
      type: s.type,
      radius: s.radius,
      stroke: s.stroke ? { color: s.stroke.color.toLowerCase(), width: s.stroke.width } : null,
    },
  };
}

export function normalizeEffects(e: LayerEffects | null | undefined): Result<LayerEffects | null> {
  if (!e) return { ok: true, value: null };
  const out: { -readonly [K in keyof LayerEffects]: LayerEffects[K] } = {};
  if (e.shadow) {
    const s = e.shadow;
    if (!color(s.color) || !fin(s.blur) || s.blur < 0 || s.blur > 500 || !fin(s.offsetX) || !fin(s.offsetY) || Math.abs(s.offsetX) > 2000 || Math.abs(s.offsetY) > 2000)
      return bad("Ugyldig skygge", "Invalid shadow");
    out.shadow = { color: s.color.toLowerCase(), blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY };
  }
  if (e.glow) {
    if (!color(e.glow.color) || !fin(e.glow.blur) || e.glow.blur < 0 || e.glow.blur > 500)
      return bad("Ugyldig glød", "Invalid glow");
    out.glow = { color: e.glow.color.toLowerCase(), blur: e.glow.blur };
  }
  if (e.outline) {
    if (!color(e.outline.color) || !fin(e.outline.width) || e.outline.width < 0 || e.outline.width > 200)
      return bad("Ugyldig kontur", "Invalid outline");
    out.outline = { color: e.outline.color.toLowerCase(), width: e.outline.width };
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}

export function normalizeTemplateRef(t: TemplateSlotRef | null | undefined): Result<TemplateSlotRef | null> {
  if (!t) return { ok: true, value: null };
  if (typeof t.instanceId !== "string" || t.instanceId.length < 1 || t.instanceId.length > 64)
    return bad("Ugyldig malforekomst", "Invalid template instance");
  if (t.slot !== null && (typeof t.slot !== "string" || !/^[a-z0-9_-]{1,40}$/.test(t.slot)))
    return bad("Ugyldig malfelt", "Invalid template field");
  return { ok: true, value: { instanceId: t.instanceId, slot: t.slot } };
}

/** Standard tekst for et nytt tekstlag. */
export function defaultTextSpec(content: string): TextSpec {
  return {
    content,
    fontId: "inter",
    size: 96,
    weight: 700,
    italic: false,
    color: "#ffffff",
    letterSpacing: 0,
    lineHeight: 1.2,
    align: "center",
    vAlign: "middle",
    wrap: true,
  };
}
