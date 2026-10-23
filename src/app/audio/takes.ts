import { isSourceLanguage, sourceLanguageOf, SOURCE_TEXT_KEY } from "@/core/dialogue/languages";
/**
 * Lagring av lydopptak som takes (fase 2, bolk B, DEC-0093): fra PC-opptaket og fra mobilen. Et take blir
 * alltid en ny versjon av lydressursen, så ingenting tidligere overskrives (REQ-0686/0688).
 *
 * - Lydressurs: ny versjon i ressursen.
 * - Replikk: ny versjon i lydressursen replikken spiller i scenen. Har replikken ingen lyd, lages en ny
 *   lydressurs og et lydklipp der replikken begynner, med dette takeet låst som aktivt. Senere takes legges
 *   ved siden av og blir aktive først når brukeren velger dem («Bruk dette»).
 * - Romlyd (REQ-0690): egen lydressurs merket «romlyd», en per scene eller lydressurs.
 */
import { ROOM_TONE_TAG, audioClipFieldsOf, lineInfo, lineTitle, newId, roomToneAsset, roomToneName, variantsOf, type AssetMedia, type Command, type ProjectState, type DialogueVersionMeta } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

type Run = Pick<Commands, "runAndWait">;

export type TakeTarget =
  | { readonly kind: "sound"; readonly assetId: string; readonly variantId?: string | undefined }
  | { readonly kind: "line"; readonly occurrenceId: string; readonly blockId: string; readonly clipId?: string };

async function run(cmds: Run, c: Command, label: string, group: string): Promise<void> {
  const r = await cmds.runAndWait(c, label, group);
  if (r.error) throw new Error(r.error);
}

/** En ny lydressurs med én variant (ingen versjon ennå). */
async function newSoundAsset(
  cmds: Run,
  name: string,
  variantName: string,
  group: string,
  extra: { category?: string; tags?: string[]; assetId?: string } = {},
): Promise<{ assetId: string; variantId: string }> {
  const assetId = extra.assetId ?? newId<"asset">();
  const variantId = newId<"asset_variant">();
  await run(
    cmds,
    {
      type: "CreateAssets",
      assets: [
        {
          assetId: assetId as never,
          fields: {
            kind: "sound",
            name: name.slice(0, 200),
            names: [],
            description: "",
            category: extra.category ?? "",
            tags: extra.tags ?? [],
          },
        },
      ],
    },
    t("app-audio-takes.new-sound-asset.run.cc17ebba9725", { name: String(name) }),
    group,
  );
  await run(
    cmds,
    {
      type: "CreateAssetVariant",
      variantId: variantId as never,
      assetId: assetId as never,
      fields: { name: variantName, style: "other", appearance: "" },
    },
    t("app-audio-takes.new-sound-asset.run.25f24158bf25"),
    group,
  );
  return { assetId, variantId };
}

/** Varianten takene legges i: den valgte, ellers den første som ikke er arkivert. */
function soundVariant(s: ProjectState, assetId: string, preferred?: string): string | null {
  const vs = variantsOf(s, assetId).filter((v) => !v.archived);
  if (preferred && vs.some((v) => v.id === preferred)) return preferred;
  return vs[0]?.id ?? null;
}

async function addVersion(
  cmds: Run,
  variantId: string,
  media: AssetMedia,
  note: string,
  group: string,
): Promise<string> {
  const versionId = newId<"asset_version">();
  await run(
    cmds,
    {
      type: "AddAssetVersion",
      versionId: versionId as never,
      variantId: variantId as never,
      media,
      note,
    },
    t("app-audio-takes.add-version.run.152ea4dd0569"),
    group,
  );
  return versionId;
}

export interface SavedTake {
  readonly assetId: string;
  readonly variantId: string;
  readonly versionId: string;
  /** Lydklippet som ble laget for replikken (første opptak), ellers null. */
  readonly clipId: string | null;
}

/** Lagrer et opptak som nytt take for målet. `state` må være fersk (cmds.current()). */
export async function saveTake(
  cmds: Run,
  state: ProjectState,
  target: TakeTarget,
  media: AssetMedia,
  note: string,
  /** ID-en en ny lydressurs skal få (så filen allerede ligger i ressursens mappe). */
  newAssetId?: string,
  dialogueMeta?: DialogueVersionMeta,
  activate = false,
): Promise<SavedTake> {
  const group = newId<"command">();
  if (target.kind === "sound") {
    let variantId = soundVariant(state, target.assetId, target.variantId);
    if (!variantId)
      variantId = (await newVariant(cmds, target.assetId, t("app-audio-takes.save-take.new-variant.afe00012969a"), group))
        .variantId;
    const versionId = await addVersion(cmds, variantId, media, note, group);
    return { assetId: target.assetId, variantId, versionId, clipId: null };
  }
  const info = lineInfo(state, target.occurrenceId, target.blockId, target.clipId);
  if (!info) throw new Error(t("app-audio-takes.save-take.message.07d3ed078977"));
  if (info.clip) {
    const generated = dialogueMeta?.source === "ai" && newAssetId
      ? await newSoundAsset(cmds, lineTitle(info), t("app-audio-takes.generated.new-sound-asset.06f621d268ab"), group, { assetId: newAssetId, category: t("app-audio-takes.category.category.39656a5891aa") })
      : null;
    const assetId = generated?.assetId ?? info.clip.assetId;
    let variantId = generated?.variantId ?? soundVariant(state, assetId, info.clip.assetVariantId ?? undefined);
    if (!variantId)
      variantId = (await newVariant(cmds, assetId, t("app-audio-takes.save-take.new-variant.afe00012969a.2"), group)).variantId;
    const versionId = await addVersion(cmds, variantId, media, note, group);
    await run(cmds, {
      type: "AddDialogueVersion", dialogueVersionId: newId<"dialogue_version">(), clipId: info.clip.id,
      fields: { assetId, assetVariantId: variantId, assetVersionId: versionId,
        sourceInMs: 0, lengthMs: Math.max(1, media.durationMs ?? 1000), gainDb: 0,
        fadeInMs: 0, fadeOutMs: 0, volumeKeys: [], speed: 1, compositionId: null,
        source: "record", provider: null, voiceId: null, modelId: null, settings: {},
        scriptRevision: state.blocks[target.blockId]?.currentRev ?? null,
        ...dialogueMeta, parentVersionId: info.clip.activeVersionId ?? null }, activate,
    }, t("app-audio-takes.save-take.run.175dcf9b42af"), group);
    return { assetId, variantId, versionId, clipId: generated ? info.clip.id : null };
  }
  // Første opptak av replikken: ny lydressurs og et lydklipp der replikken begynner
  const made = await newSoundAsset(cmds, lineTitle(info), t("app-audio-takes.made.new-sound-asset.4aa46207f4ef"), group, {
    category: t("app-audio-takes.category.category.0a82e2f5112a"),
    ...(newAssetId ? { assetId: newAssetId } : {}),
  });
  const versionId = await addVersion(cmds, made.variantId, media, note, group);
  const clipId = newId<"audio_clip">();
  await run(
    cmds,
    {
      type: "AddAudioClips",
      dialogueMeta: dialogueMeta ?? { source: "record", provider: null, voiceId: null, modelId: null, settings: {}, scriptRevision: state.blocks[target.blockId]?.currentRev ?? null, parentVersionId: null },
      clips: [
        {
          clipId: clipId as never,
          fields: {
            occurrenceId: target.occurrenceId as never,
            kind: "dialogue",
            name: lineTitle(info),
            assetId: made.assetId as never,
            assetVariantId: made.variantId as never,
            versionId: versionId as never,
            blockId: target.blockId as never,
            offsetMs: info.startMs,
            sourceInMs: 0,
            lengthMs: Math.max(1, media.durationMs ?? 1000),
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
            muted: false,
            continues: false,
            volumeKeys: [],
          },
        },
      ],
    },
    t("app-audio-takes.save-take.run.0485f6cde6ad"),
    group,
  );
  return { ...made, versionId, clipId };
}

async function newVariant(
  cmds: Run,
  assetId: string,
  name: string,
  group: string,
): Promise<{ variantId: string }> {
  const variantId = newId<"asset_variant">();
  await run(
    cmds,
    {
      type: "CreateAssetVariant",
      variantId: variantId as never,
      assetId: assetId as never,
      fields: { name, style: "other", appearance: "" },
    },
    t("app-audio-takes.new-variant.run.5804becbdc15"),
    group,
  );
  return { variantId };
}

/** Lagrer romlyd (REQ-0690) i romlydressursen for stedet (lages første gang). */
export async function saveRoomTone(
  cmds: Run,
  state: ProjectState,
  where: string,
  media: AssetMedia,
  note: string,
  newAssetId?: string,
): Promise<SavedTake> {
  const group = newId<"command">();
  const existing = roomToneAsset(state, where);
  let assetId: string;
  let variantId: string | null;
  if (existing) {
    assetId = existing.id;
    variantId = soundVariant(state, assetId);
    if (!variantId)
      variantId = (await newVariant(cmds, assetId, t("app-audio-takes.save-room-tone.new-variant.26f9abeb461a"), group)).variantId;
  } else {
    const made = await newSoundAsset(cmds, roomToneName(where), t("app-audio-takes.made.new-sound-asset.b587bef106d3"), group, {
      category: t("app-audio-takes.category.category.a6947327116b"),
      tags: [ROOM_TONE_TAG],
      ...(newAssetId ? { assetId: newAssetId } : {}),
    });
    assetId = made.assetId;
    variantId = made.variantId;
  }
  const versionId = await addVersion(cmds, variantId, media, note, group);
  return { assetId, variantId, versionId, clipId: null };
}

/**
 * «Bruk dette»: gjør et take aktivt. For en replikk spiller lydklippet takeet (lengden følger opptaket);
 * takeet godkjennes også i biblioteket. For en lydressurs: godkjenn takeet.
 */
export async function chooseTake(
  cmds: Run,
  state: ProjectState,
  target: TakeTarget,
  take: {
    readonly variantId: string;
    readonly versionId: string;
    readonly durationMs: number | null;
  },
): Promise<void> {
  const group = newId<"command">();
  if (target.kind === "line") {
    const info = lineInfo(state, target.occurrenceId, target.blockId, target.clipId);
    if (info?.clip) {
      const f = audioClipFieldsOf(info.clip);
      await run(
        cmds,
        {
          type: "UpdateAudioClips",
          clips: [
            {
              clipId: info.clip.id as never,
              fields: {
                ...f,
                assetVariantId: take.variantId as never,
                versionId: take.versionId as never,
                sourceInMs: 0,
                lengthMs: Math.max(1, take.durationMs ?? f.lengthMs),
              },
            },
          ],
        },
        t("app-audio-takes.choose-take.run.14093436a834"),
        group,
      );
    }
  }
  await run(
    cmds,
    {
      type: "ApproveAssetVersion",
      variantId: take.variantId as never,
      versionId: take.versionId as never,
    },
    t("app-audio-takes.choose-take.run.808e8391fb65"),
    group,
  );
}

/**
 * B-099: et opptak (fra mobilen) av en lyd som ikke er en replikk. Blir en ny lydressurs med én versjon og et
 * lydklipp i scenen ved `atMs`, som ved PC-opptak. Ett angresteg; ingenting eksisterende endres.
 */
export async function saveSceneSound(
  cmds: Run,
  target: { readonly occurrenceId: string; readonly atMs: number; readonly kind: "dialogue" | "narration" | "sfx" | "ambience" | "music"; readonly language?: string | undefined },
  media: AssetMedia,
  name: string,
  note: string,
): Promise<SavedTake> {
  const group = newId<"command">();
  const made = await newSoundAsset(cmds, name, t("app-audio-takes.made.new-sound-asset.4aa46207f4ef"), group);
  const versionId = await addVersion(cmds, made.variantId, media, note, group);
  const clipId = newId<"audio_clip">();
  await run(
    cmds,
    {
      type: "AddAudioClips",
      clips: [
        {
          clipId: clipId as never,
          fields: {
            occurrenceId: target.occurrenceId as never,
            kind: target.kind,
            name: name.slice(0, 200),
            assetId: made.assetId as never,
            assetVariantId: null,
            versionId: null,
            blockId: null,
            offsetMs: Math.max(0, Math.round(target.atMs)),
            sourceInMs: 0,
            lengthMs: Math.max(1, media.durationMs ?? 1000),
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
            muted: false,
            continues: false,
            volumeKeys: [],
            ...(target.language && target.language !== SOURCE_TEXT_KEY && (target.kind === "dialogue" || target.kind === "narration") ? { language: target.language } : {}),
          },
        },
      ],
    },
    t("b099.scene.sound-label"),
    group,
  );
  return { ...made, versionId, clipId };
}
