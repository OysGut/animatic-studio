/**
 * B-098: serverfunksjoner for «Legg til font …». Katalog, forhåndsvisning og nedlasting går via serveren,
 * så nettleseren aldri henter noe direkte fra Google. Krever innlogging. Feil fra kilden gir et rolig
 * svar («ikke tilgjengelig nå»); ingenting annet i appen stopper.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FONT_MAX_VARIANTS, isFamilyName, type CatalogFont, type CatalogVariant } from "@/core/typography";

export type FontSourceResult<T> = { ok: true; value: T } | { ok: false; code: "unavailable" | "invalid" };

function variantsOf(v: unknown): CatalogVariant[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > FONT_MAX_VARIANTS) throw new Error("bad variants");
  return v.map((x) => {
    const o = x as { weight?: unknown; italic?: unknown };
    if (!Number.isInteger(o.weight) || (o.weight as number) < 1 || (o.weight as number) > 1000) throw new Error("bad variants");
    return { weight: o.weight as number, italic: o.italic === true };
  });
}

function family(v: unknown): string {
  if (!isFamilyName(v)) throw new Error("bad family");
  return v;
}

export const listGoogleFonts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<FontSourceResult<CatalogFont[]>> => {
    const { googleCatalog } = await import("./google-fonts.server");
    const list = await googleCatalog();
    return list ? { ok: true, value: list } : { ok: false, code: "unavailable" };
  });

export const googleFontPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const text = typeof x["text"] === "string" ? (x["text"] as string).slice(0, 200) : "";
    return { family: family(x["family"]), variant: variantsOf([x["variant"]])[0]!, text };
  })
  .handler(async ({ data }): Promise<FontSourceResult<{ base64: string }>> => {
    const { previewFontFile, toBase64 } = await import("./google-fonts.server");
    try {
      return { ok: true, value: { base64: toBase64(await previewFontFile(data.family, data.variant, data.text)) } };
    } catch (e) {
      console.warn("[b098] preview failed:", e instanceof Error ? e.message.slice(0, 80) : "unknown");
      return { ok: false, code: "unavailable" };
    }
  });

export interface PackagedFontFile {
  readonly weight: number;
  readonly italic: boolean;
  readonly format: "woff2" | "ttf";
  readonly subset?: string;
  readonly unicodeRange?: string;
  readonly base64: string;
}

export const googleFontPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const subsets = Array.isArray(x["subsets"])
      ? (x["subsets"] as unknown[]).filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,40}$/.test(s)).slice(0, 40)
      : [];
    return { family: family(x["family"]), variants: variantsOf(x["variants"]), subsets };
  })
  .handler(async ({ data }): Promise<FontSourceResult<PackagedFontFile[]>> => {
    const { packageFontFiles, toBase64 } = await import("./google-fonts.server");
    try {
      const files = await packageFontFiles(data.family, data.variants, data.subsets);
      return {
        ok: true,
        value: files.map((f) => ({
          weight: f.weight,
          italic: f.italic,
          format: f.format,
          ...(f.subset ? { subset: f.subset } : {}),
          ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
          base64: toBase64(f.bytes),
        })),
      };
    } catch (e) {
      console.warn("[b098] package failed:", e instanceof Error ? e.message.slice(0, 80) : "unknown");
      return { ok: false, code: "unavailable" };
    }
  });
