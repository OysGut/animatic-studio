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
import {
  L,
  ROOM_TONE_TAG,
  audioClipFieldsOf,
  lineInfo,
  lineTitle,
  newId,
  roomToneAsset,
  roomToneName,
  variantsOf,
  type AssetMedia,
  type Command,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";

type Run = Pick<Commands, "runAndWait">;

export type TakeTarget =
  | { readonly kind: "sound"; readonly assetId: string; readonly variantId?: string | undefined }
  | { readonly kind: "line"; readonly occurrenceId: string; readonly blockId: string };

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
    L(`Ny lyd «${name}»`, `New audio “${name}”`),
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
    L("Ny lydvariant", "New audio variant"),
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
    L("Nytt lydopptak", "New audio recording"),
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
): Promise<SavedTake> {
  const group = newId<"command">();
  if (target.kind === "sound") {
    let variantId = soundVariant(state, target.assetId, target.variantId);
    if (!variantId)
      variantId = (await newVariant(cmds, target.assetId, L("Opptak", "Recordings"), group))
        .variantId;
    const versionId = await addVersion(cmds, variantId, media, note, group);
    return { assetId: target.assetId, variantId, versionId, clipId: null };
  }
  const info = lineInfo(state, target.occurrenceId, target.blockId);
  if (!info) throw new Error(L("Replikken finnes ikke lenger.", "The line no longer exists."));
  if (info.clip) {
    const assetId = info.clip.assetId;
    let variantId = soundVariant(state, assetId, info.clip.assetVariantId ?? undefined);
    if (!variantId)
      variantId = (await newVariant(cmds, assetId, L("Opptak", "Recordings"), group)).variantId;
    const versionId = await addVersion(cmds, variantId, media, note, group);
    return { assetId, variantId, versionId, clipId: null };
  }
  // Første opptak av replikken: ny lydressurs og et lydklipp der replikken begynner
  const made = await newSoundAsset(cmds, lineTitle(info), L("Opptak", "Recordings"), group, {
    category: L("Dialog", "Dialogue"),
    ...(newAssetId ? { assetId: newAssetId } : {}),
  });
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
    L("Replikken lagt i scenen", "Line added to the scene"),
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
    L("Ny lydvariant", "New audio variant"),
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
      variantId = (await newVariant(cmds, assetId, L("Romlyd", "Room tone"), group)).variantId;
  } else {
    const made = await newSoundAsset(cmds, roomToneName(where), L("Romlyd", "Room tone"), group, {
      category: L("Romlyd", "Room tone"),
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
    const info = lineInfo(state, target.occurrenceId, target.blockId);
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
        L("Valgt opptak for replikken", "Chosen recording for the line"),
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
    L("Opptaket godkjent", "Recording approved"),
    group,
  );
}
