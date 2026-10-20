/**
 * Lyden i en AI-video som eget lydspor (DEC-0085, Mars 15.10.2026): «eventuelt lydspor fra generert video
 * skal vises som et eget lydspor som skal kunne skyves rundt og justeres som et hvilket som helst lyd».
 * Lyden hentes ut i nettleseren (WAV), legges i biblioteket som lydressurs og inn i scenen som et dempet
 * lydklipp der videoen begynner. Videoen selv spilles uten lyd, så lyden ikke dobles.
 */
import { newId, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { createSoundAsset } from "@/app/library/asset-audio";
import { encodeWav } from "@/engine/export/audio-stem";
import { t } from "@/core/i18n/keyed";

/** Lyden i videofilen som WAV, eller null når den ikke har lyd (eller nettleseren ikke kan lese den). */
export async function audioFromVideo(blob: Blob, name: string): Promise<File | null> {
  if (typeof OfflineAudioContext === "undefined") return null;
  try {
    const ctx = new OfflineAudioContext(1, 1, 48000);
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (buf.length === 0 || buf.duration < 0.05) return null;
    const channels = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, i) =>
      buf.getChannelData(i),
    );
    // Helt stille lyd tas ikke med
    if (!channels.some((c) => c.some((v) => Math.abs(v) > 1e-4))) return null;
    return new File([encodeWav(channels, buf.sampleRate) as BlobPart], `${name}.wav`, {
      type: "audio/wav",
    });
  } catch {
    return null;
  }
}

/**
 * Legg lyden inn som dempet lydklipp i scenen (fra `offsetMs` i scenen). Feil stopper ikke innleggingen av
 * videoen; den meldes tilbake.
 */
export async function addVideoAudioTrack(
  state: ProjectState,
  cmds: Commands,
  occurrenceId: string,
  file: File,
  name: string,
  offsetMs: number,
): Promise<string | null> {
  try {
    const made = await createSoundAsset(cmds, state.project.id, file, name);
    const r = await cmds.runAndWait(
      {
        type: "AddAudioClips",
        clips: [
          {
            clipId: newId<"audio_clip">() as never,
            fields: {
              occurrenceId: occurrenceId as never,
              kind: "sfx",
              name,
              assetId: made.assetId as never,
              assetVariantId: null,
              versionId: null,
              blockId: null,
              offsetMs: Math.max(0, Math.round(offsetMs)),
              sourceInMs: 0,
              lengthMs: Math.max(1, made.durationMs),
              gainDb: 0,
              fadeInMs: 0,
              fadeOutMs: 0,
              // Dempet til brukeren skrur den på (DEC-0085)
              muted: true,
              continues: false,
              volumeKeys: [],
            },
          },
        ],
      },
      t("app-ai-video-audio.r.cmds-run-and-wait.60aea6cae59a", { name: String(name) }),
    );
    return r.error ?? null;
  } catch (e) {
    return (e as Error).message;
  }
}
