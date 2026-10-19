/**
 * Lagring og eksport av lydkomposisjoner (fase 2, bolk C, DEC-0094): miksen lages med lydmotoren
 * (`renderComposition`), lastes opp som WAV og lagres som ny versjon med komposisjonen, så den kan redigeres
 * videre (REQ-0693/0695). Eksport gir WAV eller MP3 av hele komposisjonen, et område eller ett take, lokalt
 * eller som ny lydvariant i biblioteket (REQ-0696). Originalopptakene endres aldri.
 */
import {
  L,
  audioExportName,
  compositionLengthMs,
  cropComposition,
  newId,
  type AssetVersion,
  type AudioComposition,
  type ProjectState,
  type WordAlignment,
} from "@/core";
import { audioBank } from "@/app/audio/use-audio-playback";
import { signedUrls } from "@/app/library/asset-images";
import { uploadAssetAudio } from "@/app/library/asset-audio";
import type { Commands } from "@/app/project/use-commands";
import { channelsOf, encodeMp3, renderComposition } from "@/engine/audio/composition";
import { encodeWav } from "@/engine/export/audio-stem";

type Run = Pick<Commands, "runAndWait">;

/** Henter og dekoder opptakene (én gang per fil, delt med resten av appen). */
export async function loadVersionBuffers(
  versions: readonly AssetVersion[],
): Promise<Map<string, AudioBuffer>> {
  const urls = await signedUrls(versions.map((v) => v.mediaPath));
  const out = new Map<string, AudioBuffer>();
  await Promise.all(
    versions.map(async (v) => {
      const url = urls[v.mediaPath];
      if (!url) return;
      const b = await audioBank.load(v.mediaPath, url);
      if (b) out.set(v.id, b);
    }),
  );
  return out;
}

export interface ExportSettings {
  readonly format: "wav" | "mp3";
  readonly sampleRate: 44100 | 48000;
  readonly channels: 1 | 2;
}

/** Miks og kode komposisjonen (eller et utsnitt). */
export async function encodeComposition(
  c: AudioComposition,
  buffers: ReadonlyMap<string, AudioBuffer>,
  e: ExportSettings,
): Promise<Blob> {
  const buf = await renderComposition(c, (id) => buffers.get(id), {
    sampleRate: e.sampleRate,
    channels: e.channels,
  });
  if (e.format === "mp3")
    return new Blob([(await encodeMp3(buf)) as BlobPart], { type: "audio/mpeg" });
  return new Blob([encodeWav(channelsOf(buf), e.sampleRate) as BlobPart], { type: "audio/wav" });
}

/** Last ned en fil lokalt. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Lagrer komposisjonen som ny versjon av lydressursen: i varianten `variantId`, eller i en ny variant med
 * navnet `newVariantName`. Versjonen er ikke godkjent (den godkjennes som andre versjoner, REQ-0695).
 */
export async function saveComposition(
  cmds: Run,
  state: ProjectState,
  projectId: string,
  assetId: string,
  target: { readonly variantId: string } | { readonly newVariantName: string },
  c: AudioComposition,
  buffers: ReadonlyMap<string, AudioBuffer>,
  note: string,
  options?: { readonly group?: string; readonly alignment?: WordAlignment; readonly prepared?: AudioBuffer | undefined },
): Promise<{ variantId: string; versionId: string; durationMs: number | null }> {
  if (!state.assets[assetId])
    throw new Error(L("Lydressursen finnes ikke", "The audio asset does not exist"));
  if (compositionLengthMs(c) <= 0)
    throw new Error(L("Komposisjonen er tom", "The composition is empty"));
  const blob = options?.prepared
    ? new Blob([encodeWav(channelsOf(options.prepared), options.prepared.sampleRate) as BlobPart], { type: "audio/wav" })
    : await encodeComposition(c, buffers, {
    format: "wav",
    sampleRate: 48000,
    channels: 1,
  });
  const file = new File([blob], "komposisjon.wav", { type: "audio/wav" }); // i18n-ignore – filnavn
  const { versionId, media } = await uploadAssetAudio(projectId, assetId, file);
  const group = options?.group ?? newId<"command">();
  let variantId: string;
  if ("variantId" in target) variantId = target.variantId;
  else {
    variantId = newId<"asset_variant">();
    const r = await cmds.runAndWait(
      {
        type: "CreateAssetVariant",
        variantId: variantId as never,
        assetId: assetId as never,
        fields: { name: target.newVariantName.slice(0, 200), style: "other", appearance: "" },
      },
      L("Ny lydvariant", "New audio variant"),
      group,
    );
    if (r.error) throw new Error(r.error);
  }
  const r = await cmds.runAndWait(
    {
      type: "AddAssetVersion",
      versionId: versionId as never,
      variantId: variantId as never,
      media,
      note,
      composition: c,
      ...(options?.alignment ? { alignment: options.alignment } : {}),
    },
    L("Ny lydkomposisjon", "New audio composition"),
    group,
  );
  if (r.error) throw new Error(r.error);
  return { variantId, versionId, durationMs: media.durationMs ?? null };
}

/** Utsnittet som eksporteres: hele komposisjonen, et område, eller ett take som egen komposisjon. */
export function exportPart(
  c: AudioComposition,
  part:
    | { readonly kind: "all" }
    | { readonly kind: "range"; readonly fromMs: number; readonly toMs: number }
    | { readonly kind: "take"; readonly versionId: string; readonly durationMs: number },
): AudioComposition {
  if (part.kind === "range") return cropComposition(c, part.fromMs, part.toMs);
  if (part.kind === "take")
    return {
      format: 1,
      segments: [
        {
          id: newId<"audio_segment">(),
          versionId: part.versionId,
          track: 0,
          atMs: 0,
          sourceInMs: 0,
          lengthMs: Math.max(1, Math.round(part.durationMs)),
          gainDb: 0,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      ],
    };
  return c;
}

export { audioExportName };
