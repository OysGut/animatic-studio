/**
 * Lydfiler i ressursbiblioteket (DEC-0044): opplasting til bøtta «assets» og ny ressurs av typen «Lyd».
 * Filen lastes opp først; deretter lagres versjonen som en kommando. Feiler opplastingen, lagres ingenting.
 */
import {
  assetFilePath,
  ASSET_MAX_BYTES,
  AUDIO_MIME_TYPES,
  newId,
  type AssetMedia,
  L,
} from "@/core";
import { sha256Hex } from "@/engine/import/browser";
import { downloadFile, uploadFile } from "@/adapters/browser/storage-files";
import type { Commands } from "@/app/project/use-commands";
import { ASSET_BUCKET, safeFileName } from "./asset-images";

const BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

/** Filtypen; noen nettlesere oppgir den ikke for lydfiler, da brukes filendelsen. */
export function audioMime(file: File): string {
  if (AUDIO_MIME_TYPES.includes(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? file.type;
}

export function checkAudioFile(file: File): string | null {
  if (!AUDIO_MIME_TYPES.includes(audioMime(file)))
    return L(
      "Lyden må være MP3, WAV, OGG, WebM, M4A/AAC eller FLAC.",
      "The audio must be MP3, WAV, OGG, WebM, M4A/AAC or FLAC.",
    );
  if (file.size > ASSET_MAX_BYTES)
    return L("Lydfilen er større enn 2 GB.", "The audio file is larger than 2 GB.");
  if (file.size === 0) return L("Filen er tom.", "The file is empty.");
  return null;
}

/** Lengden på lydfilen i millisekunder (dekodes i nettleseren). */
export async function audioDuration(bytes: ArrayBuffer): Promise<number | null> {
  try {
    const ctx = new OfflineAudioContext(1, 1, 48000);
    const buf = await ctx.decodeAudioData(bytes.slice(0));
    return Math.max(1, Math.round(buf.duration * 1000));
  } catch {
    return null;
  }
}

/** Last opp en lydfil og returner data til AddAssetVersion. Kaster med norsk feilmelding. */
export async function uploadAssetAudio(
  projectId: string,
  assetId: string,
  file: File,
): Promise<{ versionId: string; media: AssetMedia }> {
  const problem = checkAudioFile(file);
  if (problem) throw new Error(problem);
  const mimeType = audioMime(file);
  const versionId = newId<"asset_version">();
  const raw = await file.arrayBuffer();
  const [sha256, durationMs] = await Promise.all([
    sha256Hex(new Uint8Array(raw)),
    audioDuration(raw),
  ]);
  if (durationMs === null)
    throw new Error(
      L(
        "Lydfilen kunne ikke leses av nettleseren. Prøv MP3 eller WAV.",
        "The browser could not read the audio file. Try MP3 or WAV.",
      ),
    );
  const path = assetFilePath(projectId, "source", assetId, versionId, safeFileName(file.name));
  const error = await uploadFile(ASSET_BUCKET, path, file, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    if (/mime|type.*not.*(allowed|supported)/i.test(error.message))
      throw new Error(
        L(
          "Lagringen tar ikke imot lydfiler ennå. Kontakt administratoren for å oppdatere Animatic Studio.",
          "The storage does not accept audio files yet. Contact the administrator to update Animatic Studio.",
        ),
      );
    throw new Error(
      L(
        `Lyden ble ikke lastet opp: ${error.message}`,
        `The audio was not uploaded: ${error.message}`,
      ),
    );
  }
  return {
    versionId,
    media: {
      path,
      mimeType,
      width: null,
      height: null,
      byteSize: file.size,
      sha256,
      durationMs,
    },
  };
}

/** Navn fra filnavnet: «vind_i_traerne.mp3» → «vind i traerne». */
export function nameFromFile(file: File): string {
  return (
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim()
      .slice(0, 200) || L("Lyd", "Audio")
  );
}

/**
 * Ny lydressurs fra en fil: ressurs (type «sound»), variant «Lyd» og første versjon.
 * Returnerer ID-ene og lengden. Kaster med norsk feilmelding.
 */
export async function createSoundAsset(
  cmds: Commands,
  projectId: string,
  file: File,
  name: string,
): Promise<{ assetId: string; variantId: string; versionId: string; durationMs: number }> {
  const problem = checkAudioFile(file);
  if (problem) throw new Error(problem);
  const assetId = newId<"asset">();
  const variantId = newId<"asset_variant">();
  // Last opp først, så det ikke blir en tom ressurs hvis opplastingen feiler
  const { versionId, media } = await uploadAssetAudio(projectId, assetId, file);
  const steps = [
    {
      command: {
        type: "CreateAssets" as const,
        assets: [
          {
            assetId: assetId as never,
            fields: {
              kind: "sound" as const,
              name: name.trim() || nameFromFile(file),
              names: [],
              description: "",
              category: "",
              tags: [],
            },
          },
        ],
      },
      label: L(`Ny lyd «${name}»`, `New audio “${name}”`),
    },
    {
      command: {
        type: "CreateAssetVariant" as const,
        variantId: variantId as never,
        assetId: assetId as never,
        fields: { name: L("Lyd", "Audio"), style: "other" as const, appearance: "" },
      },
      label: L("Ny lydvariant", "New audio variant"),
    },
    {
      command: {
        type: "AddAssetVersion" as const,
        versionId: versionId as never,
        variantId: variantId as never,
        media,
        note: "",
      },
      label: L("Ny lydfil", "New audio file"),
    },
  ];
  // Ett angresteg for hele den nye lyden (KI-56, DEC-0049): de tre endringene samles i samme gruppe
  const group = newId<"command">();
  for (const s of steps) {
    const r = await cmds.runAndWait(s.command, s.label, group);
    if (r.error) throw new Error(r.error);
  }
  return { assetId, variantId, versionId, durationMs: media.durationMs ?? 1000 };
}

/**
 * Lyddata til AddAssetVersion for en fil som allerede ligger i lagringen (opptak fra mobilen, bolk B):
 * filen hentes, lengden leses og kontrollsummen regnes ut. Kaster med feilmelding.
 */
export async function audioMediaFromStoredFile(path: string, mime: string): Promise<AssetMedia> {
  const { data, error } = await downloadFile(ASSET_BUCKET, path);
  if (error || !data)
    throw new Error(
      L(
        `Opptaket kunne ikke hentes: ${error?.message ?? "ukjent feil"}`,
        `The recording could not be fetched: ${error?.message ?? "unknown error"}`,
      ),
    );
  const raw = await data.arrayBuffer();
  const [sha256, durationMs] = await Promise.all([
    sha256Hex(new Uint8Array(raw)),
    audioDuration(raw.slice(0)),
  ]);
  return {
    path,
    mimeType: (mime || data.type || "audio/webm").split(";")[0]!.trim(),
    width: null,
    height: null,
    byteSize: raw.byteLength,
    sha256,
    durationMs: durationMs ?? null,
  };
}
