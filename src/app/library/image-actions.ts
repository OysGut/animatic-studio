/**
 * Bildeverktøy i stor visning (DEC-0080): utsnitt med fri markering, del opp i ruter (karakterark) og fjern
 * luften rundt. Alt skjer i nettleseren og er gratis; resultatet lagres som nye versjoner (originalen
 * beholdes) – i et eksisterende objekt eller i et nytt.
 */
import {
  L,
  alphaBounds,
  newId,
  paddedBox,
  trimPadding,
  worthTrimming,
  type AssetKind,
  type Command,
  type PixelBox,
  type ProjectState,
} from "@/core";
import { uploadAssetImage } from "./asset-images";

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
        ? L(
            "Lenken til bildet har gått ut – lukk og åpne visningen igjen.",
            "The link to the image has expired – close and reopen the view.",
          )
        : L(
            `Bildet kunne ikke hentes (feil ${res.status}).`,
            `The image could not be loaded (error ${res.status}).`,
          ),
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

/** Beskjær tett rundt det synlige (alfa), med litt luft. null når det ikke er noe å fjerne. */
export function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement | null {
  const data = c
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, c.width, c.height);
  const b = alphaBounds(data.data, c.width, c.height);
  if (!b || !worthTrimming(b, c.width, c.height)) return null;
  const pb = paddedBox(b, trimPadding(b), c.width, c.height);
  const out = document.createElement("canvas");
  out.width = pb.w;
  out.height = pb.h;
  out.getContext("2d")!.drawImage(c, pb.x, pb.y, pb.w, pb.h, 0, 0, pb.w, pb.h);
  return out;
}

export async function canvasToPng(c: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob>((ok, fail) =>
    c.toBlob(
      (b) =>
        b
          ? ok(b)
          : fail(new Error(L("Bildet kunne ikke lages.", "The image could not be created."))),
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
              name: target.name.trim().slice(0, 200) || L("Utsnitt", "Crop"),
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
