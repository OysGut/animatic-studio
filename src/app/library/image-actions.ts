/**
 * Bildeverktøy i stor visning (DEC-0080): utsnitt med fri markering, del opp i ruter (karakterark) og fjern
 * luften rundt. Alt skjer i nettleseren og er gratis; resultatet lagres som nye versjoner (originalen
 * beholdes) – i et eksisterende objekt eller i et nytt.
 */
import {
  L,
  findTrim,
  newId,
  paddedBox,
  trimPadding,
  type AssetKind,
  type Command,
  type PixelBox,
  type ProjectState,
} from "@/core";
import { uploadAssetImage } from "./asset-images";
import { t as tk } from "@/core/i18n/keyed";

type RunAndWait = (c: Command, label: string, group?: string) => Promise<{ error: string | null }>;

export interface LoadedImage {
  readonly canvas: HTMLCanvasElement;
  readonly w: number;
  readonly h: number;
}

/** Hent bildet som piksler (som blob, så lerretet ikke blir «skittent» av en annen opprinnelse). */
export async function loadImage(url: string): Promise<LoadedImage> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(
      res.status === 400 || res.status === 403
        ? tk("app-library-image-actions.load-image.message.ebea03297952")
        : tk("app-library-image-actions.load-image.message.eff158aa3860", { status: String(res.status) }),
    );
  const blob = await res.blob();
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  let close = () => {};
  try {
    const b = await createImageBitmap(blob);
    source = b;
    w = b.width;
    h = b.height;
    close = () => b.close();
  } catch {
    const u = URL.createObjectURL(blob);
    const img = new Image();
    img.src = u;
    await img.decode();
    source = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
    close = () => URL.revokeObjectURL(u);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(source, 0, 0);
  close();
  return { canvas, w, h };
}

export type Polygon = readonly { readonly x: number; readonly y: number }[];

/**
 * Et utsnitt som nytt bilde: firkanten `box`; med `polygon` blir alt utenfor markeringen gjennomsiktig.
 * `trim` fjerner luften rundt det synlige etterpå (med litt luft).
 */
export function cropCanvas(
  src: LoadedImage,
  box: PixelBox,
  polygon: Polygon | null,
  trim: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = box.w;
  c.height = box.h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  if (polygon && polygon.length >= 3) {
    ctx.beginPath();
    polygon.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x - box.x, p.y - box.y) : ctx.lineTo(p.x - box.x, p.y - box.y),
    );
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(src.canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return trim ? (trimCanvas(c) ?? c) : c;
}

/**
 * Beskjær tett rundt figuren, med litt luft (Mars 15.10.2026): først ut fra gjennomsiktighet (frilagte
 * bilder), ellers ut fra en ensfarget bakgrunn (hvit eller farget, som AI-bilder og vinkelark har).
 * `box` er utsnittet i lerretets piksler. `reason` forteller hvorfor ingenting ble fjernet.
 */
export function trimCanvasInfo(
  c: HTMLCanvasElement,
):
  | { readonly canvas: HTMLCanvasElement; readonly box: PixelBox; readonly by: "alpha" | "color" }
  | { readonly reason: "full" | "empty" | "no-background" } {
  const data = c
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, c.width, c.height);
  const t = findTrim(data.data, c.width, c.height);
  if (t.kind !== "ok") return { reason: t.kind };
  const pb = paddedBox(t.box, trimPadding(t.box), c.width, c.height);
  const out = document.createElement("canvas");
  out.width = pb.w;
  out.height = pb.h;
  out.getContext("2d")!.drawImage(c, pb.x, pb.y, pb.w, pb.h, 0, 0, pb.w, pb.h);
  return { canvas: out, box: pb, by: t.by };
}

/** Beskjær tett rundt figuren (gjennomsiktig eller ensfarget bakgrunn). null når det ikke er noe å fjerne. */
export function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement | null {
  const t = trimCanvasInfo(c);
  return "canvas" in t ? t.canvas : null;
}

/** Meldingen når «Fjern luften rundt» ikke har noe å fjerne. */
export function noTrimMessage(reason: "full" | "empty" | "no-background"): string {
  if (reason === "full")
    return tk("app-library-image-actions.no-trim-message.message.e2612e5a5a0c");
  if (reason === "empty")
    return tk("app-library-image-actions.no-trim-message.message.54a1897f4e53");
  return tk("app-library-image-actions.no-trim-message.message.1e9b9d4a9780");
}

/**
 * Originalen med et område gjort gjennomsiktig (Mars 15.10.2026, «Deler»: så rammen står alene når
 * dørbladet er tatt ut). `polygon` er i bildets piksler.
 */
export function eraseCanvas(src: HTMLCanvasElement, polygon: Polygon): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  if (polygon.length >= 3) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  return c;
}

export async function canvasToPng(c: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob>((ok, fail) =>
    c.toBlob(
      (b) =>
        b
          ? ok(b)
          : fail(new Error(tk("app-library-image-actions.blob.fail.d2a3503fa9b6"))),
      "image/png",
    ),
  );
  // i18n-ignore: filnavn
  const base = name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "bilde";
  return new File([blob], `${base}.png`, { type: "image/png" });
}

/** Hvor et nytt bilde skal: en variant i et eksisterende objekt, eller et nytt objekt. */
export type ImageTarget =
  | { readonly kind: "existing"; readonly assetId: string; readonly variantId: string | null }
  | { readonly kind: "new"; readonly name: string; readonly assetKind: AssetKind };

/**
 * Lagrer et bilde som ny versjon. Et nytt objekt får en variant «Animatic»; et objekt uten varianter får
 * også en. Alt i samme angregruppe. Returnerer versjonen og varianten, eller feilmeldingen.
 */
export async function saveImageTo(
  runAndWait: RunAndWait,
  state: ProjectState,
  projectId: string,
  target: ImageTarget,
  file: File,
  note: string,
  label: string,
  group = newId(),
): Promise<{ versionId: string; variantId: string; assetId: string } | { error: string }> {
  const assetId = target.kind === "existing" ? target.assetId : newId<"asset">();
  // Last opp først: feiler opplastingen, lages ingenting
  const up = await uploadAssetImage(projectId, assetId, file);
  if (target.kind === "new") {
    const r = await runAndWait(
      {
        type: "CreateAssets",
        assets: [
          {
            assetId: assetId as never,
            fields: {
              kind: target.assetKind,
              name: target.name.trim().slice(0, 200) || tk("app-library-image-actions.name.name.6a87545f553f"),
              names: [],
              description: "",
              category: "",
              tags: [],
            },
          },
        ],
      },
      label,
      group,
    );
    if (r.error) return { error: r.error };
  }
  let variantId = target.kind === "existing" ? target.variantId : null;
  if (variantId && !state.assetVariants[variantId]) variantId = null;
  if (!variantId && target.kind === "existing")
    variantId =
      Object.values(state.assetVariants).find((v) => v.assetId === assetId && !v.archived)?.id ??
      null;
  if (!variantId) {
    variantId = newId<"asset_variant">();
    const r = await runAndWait(
      {
        type: "CreateAssetVariant",
        variantId: variantId as never,
        assetId: assetId as never,
        fields: { name: "Animatic", style: "animatic", appearance: "" },
      },
      label,
      group,
    );
    if (r.error) return { error: r.error };
  }
  const r = await runAndWait(
    {
      type: "AddAssetVersion",
      versionId: up.versionId as never,
      variantId: variantId as never,
      media: up.media,
      note: [note, up.note].filter(Boolean).join(" ").slice(0, 2000),
    },
    label,
    group,
  );
  if (r.error) return { error: r.error };
  return { versionId: up.versionId, variantId, assetId };
}

/**
 * Et nytt, tomt objekt med en variant «Animatic» (til AI-deler, der bildet lages på serveren etterpå).
 * Returnerer ID-ene, eller feilmeldingen.
 */
export async function createAssetWithVariant(
  runAndWait: RunAndWait,
  name: string,
  assetKind: AssetKind,
  description: string,
  label: string,
  group = newId(),
): Promise<{ assetId: string; variantId: string } | { error: string }> {
  const assetId = newId<"asset">();
  const a = await runAndWait(
    {
      type: "CreateAssets",
      assets: [
        {
          assetId: assetId as never,
          fields: {
            kind: assetKind,
            name: name.trim().slice(0, 200) || tk("app-library-image-actions.name.name.f563d3f30c1d"),
            names: [],
            description: description.slice(0, 2000),
            category: "",
            tags: [],
          },
        },
      ],
    },
    label,
    group,
  );
  if (a.error) return { error: a.error };
  const variantId = newId<"asset_variant">();
  const v = await runAndWait(
    {
      type: "CreateAssetVariant",
      variantId: variantId as never,
      assetId: assetId as never,
      fields: { name: "Animatic", style: "animatic", appearance: "" },
    },
    label,
    group,
  );
  if (v.error) return { error: v.error };
  return { assetId, variantId };
}
