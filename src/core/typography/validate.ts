/** Validering av tekst, form og effekter (MTS MT1). Returnerer normaliserte verdier eller en melding. */

import { fontById } from "./fonts";
import {
  MAX_TEXT_CHARS,
  type LayerEffects,
  type LetterAnimation,
  type ShapeSpec,
  type TemplateSlotRef,
  type TextSpec,
} from "./types";
import { t as tk } from "@/core/i18n/keyed";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const HEX = /^#[0-9a-fA-F]{6}$/;
const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const color = (c: unknown) => typeof c === "string" && HEX.test(c);
const bad = (error: string) => ({ ok: false as const, error });

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
    return bad(tk("core-typography-validate.normalize-letter-anim.bad.c9385d70a87b"));
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
  if (typeof t.content !== "string") return bad(tk("core-typography-validate.normalize-text-spec.bad.fa792149bf50"));
  const n = [...t.content].length;
  if (n > MAX_TEXT_CHARS)
    return bad(tk("core-typography-validate.normalize-text-spec.bad.e28766869227", { n: String(n), MAX_TEXT_CHARS: String(MAX_TEXT_CHARS) }));
  if (!fontById(t.fontId)) return bad(tk("core-typography-validate.normalize-text-spec.bad.3b0e84f4ea54"));
  if (!fin(t.size) || t.size < 4 || t.size > 2000) return bad(tk("core-typography-validate.normalize-text-spec.bad.bb57b9377172"));
  if (!Number.isInteger(t.weight) || t.weight < 100 || t.weight > 900)
    return bad(tk("core-typography-validate.normalize-text-spec.bad.1499fd669143"));
  if (!color(t.color)) return bad(tk("core-typography-validate.normalize-text-spec.bad.abc35c0addb6"));
  if (!fin(t.letterSpacing) || Math.abs(t.letterSpacing) > 500)
    return bad(tk("core-typography-validate.normalize-text-spec.bad.5d8b2e2d4ad0"));
  if (!fin(t.lineHeight) || t.lineHeight < 0.5 || t.lineHeight > 5)
    return bad(tk("core-typography-validate.normalize-text-spec.bad.21268635791c"));
  if (!["left", "center", "right"].includes(t.align) || !["top", "middle", "bottom"].includes(t.vAlign))
    return bad(tk("core-typography-validate.normalize-text-spec.bad.7d90c3c616b3"));
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
    return bad(tk("core-typography-validate.normalize-shape.bad.989213f99c01"));
  if (s.stroke && (!color(s.stroke.color) || !fin(s.stroke.width) || s.stroke.width < 0 || s.stroke.width > 500))
    return bad(tk("core-typography-validate.normalize-shape.bad.b75748de5268"));
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
      return bad(tk("core-typography-validate.normalize-effects.bad.e15ada947a5b"));
    out.shadow = { color: s.color.toLowerCase(), blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY };
  }
  if (e.glow) {
    if (!color(e.glow.color) || !fin(e.glow.blur) || e.glow.blur < 0 || e.glow.blur > 500)
      return bad(tk("core-typography-validate.normalize-effects.bad.e57a5a64834e"));
    out.glow = { color: e.glow.color.toLowerCase(), blur: e.glow.blur };
  }
  if (e.outline) {
    if (!color(e.outline.color) || !fin(e.outline.width) || e.outline.width < 0 || e.outline.width > 200)
      return bad(tk("core-typography-validate.normalize-effects.bad.d6a5d5db62aa"));
    out.outline = { color: e.outline.color.toLowerCase(), width: e.outline.width };
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}

export function normalizeTemplateRef(t: TemplateSlotRef | null | undefined): Result<TemplateSlotRef | null> {
  if (!t) return { ok: true, value: null };
  if (typeof t.instanceId !== "string" || t.instanceId.length < 1 || t.instanceId.length > 64)
    return bad(tk("core-typography-validate.normalize-template-ref.bad.dffd099c124c"));
  if (typeof t.key !== "string" || !/^[a-z0-9_-]{1,40}$/.test(t.key))
    return bad(tk("core-typography-validate.normalize-template-ref.bad.e078e0326f89"));
  if (t.slot !== null && (typeof t.slot !== "string" || !/^[a-z0-9_-]{1,40}$/.test(t.slot)))
    return bad(tk("core-typography-validate.normalize-template-ref.bad.d703eb031df0"));
  return { ok: true, value: { instanceId: t.instanceId, key: t.key, slot: t.slot } };
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
