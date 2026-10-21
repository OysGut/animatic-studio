/**
 * Ta i bruk filer fra mobilen (fase 2, bolk A, DEC-0090): en video som film for scenen, eller et bilde som nytt
 * element i biblioteket. Filen brukes der den ligger (dupliseres ikke), og koblingen lagres i mobilimporten.
 * Alt går gjennom vanlige kommandoer og kan angres.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUiPref } from "@/app/account/ui-prefs";
import { formatDate, newId, secondsToFrames, tm, type ProjectState } from "@/core";
import { audioMediaFromStoredFile } from "@/app/library/asset-audio";
import { saveSceneSound } from "@/app/audio/takes";
import { linkMobileImport, type MobileImportRow } from "@/adapters/browser/mobile-import";
import { createSignedUrls, ASSET_BUCKET } from "@/adapters/browser/storage-files";
import type { Commands } from "@/app/project/use-commands";
import { mediaFromStoredFile } from "@/app/library/asset-images";
import { readFilmMetadataFromUrl } from "@/app/assembly/film-import";
import { t } from "@/core/i18n/keyed";
import { t as tk } from "@/core/i18n/keyed";

/** Bruk en video fra mobilen som film for scenen (vises i stedet for 2D-scenen; kan byttes tilbake). */
export async function applyVideoToScene(
  state: ProjectState,
  cmds: Commands,
  occurrenceId: string,
  row: MobileImportRow,
): Promise<string | null> {
  const [u] = await createSignedUrls(ASSET_BUCKET, [row.path], 600);
  if (!u) return t("app-mobile-mobile-actions.apply-video-to-scene.message.b4d66cb6f80d");
  const media = await readFilmMetadataFromUrl(u.signedUrl, {
    name: row.file_name || "mobil.mp4",
    type: row.mime_type,
    size: row.byte_size,
  });
  const takeId = newId<"take">();
  const group = `mobil-${row.id}`;
  const label = t("app-mobile-mobile-actions.label.message.40eb0a44a43f");
  const r = await cmds.runAndWait(
    {
      type: "AddTake",
      takeId: takeId as never,
      occurrenceId: occurrenceId as never,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: Math.max(1, secondsToFrames(media.durationMs / 1000, state.project.fps)),
      mediaRef: row.path,
      media,
    },
    label,
    group,
  );
  if (r.error) return r.error;
  const e = cmds.run(
    {
      type: "SetSceneEdit",
      occurrenceId: occurrenceId as never,
      activeTakeId: takeId as never,
      parts: [],
    },
    label,
    group,
  );
  if (e) return e;
  return (await linkMobileImport(row.id, { takeId }))?.message ?? null;
}

/** Legg et bilde fra mobilen inn som nytt element (objekt) i biblioteket; dras deretter inn i scenen. */
export async function addImageAsNewAsset(
  cmds: Commands,
  row: MobileImportRow,
  name: string,
): Promise<string | null> {
  const assetId = newId<"asset">();
  const variantId = newId<"asset_variant">();
  const versionId = newId<"asset_version">();
  const group = `mobil-${row.id}`;
  const label = t("app-mobile-mobile-actions.label.message.18b3fbd80710", { name: String(name) });
  const media = await mediaFromStoredFile(row.path);
  for (const c of [
    {
      type: "CreateAssets" as const,
      assets: [
        {
          assetId: assetId as never,
          fields: {
            kind: "object" as const,
            name,
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    },
    {
      type: "CreateAssetVariant" as const,
      variantId: variantId as never,
      assetId: assetId as never,
      fields: { name: t("app-mobile-mobile-actions.name.name.093837e5454e"), style: "reference" as const, appearance: "" },
    },
    {
      type: "AddAssetVersion" as const,
      versionId: versionId as never,
      variantId: variantId as never,
      media,
      note: t("app-mobile-mobile-actions.note.note.3f742c13823c", { value1: String(row.contributor_name || tk("app-mobile-mobile-actions.from-mobile-fallback")) }),
    },
  ]) {
    const r = await cmds.runAndWait(c, label, group);
    if (r.error) return r.error;
  }
  return (await linkMobileImport(row.id, { assetId, versionId }))?.message ?? null;
}

/** B-097: lydtypene «Legg i scenen» spør om; sist valgte huskes på kontoen. */
export type SceneSoundChoice = "sfx" | "ambience" | "music";
const SCENE_SOUND_CHOICES: readonly SceneSoundChoice[] = ["sfx", "ambience", "music"];
const isSceneSoundChoice = (v: unknown): v is SceneSoundChoice => SCENE_SOUND_CHOICES.includes(v as SceneSoundChoice);
export const SCENE_SOUND_KIND_PREF = "audio.sceneSoundKind"; // i18n-ignore: nøkkel

/** B-099: en lyd fra mobilen blir en ny lydressurs i scenen ved avspillingshodet. */
export async function addAudioToScene(
  cmds: Commands,
  occurrenceId: string,
  row: MobileImportRow,
  atMs: number,
  kind: SceneSoundChoice = "sfx",
): Promise<string | null> {
  const media = await audioMediaFromStoredFile(row.path, row.mime_type);
  const name = (row.file_name || "").replace(/\.[a-z0-9]+$/i, "").trim() || t("b099.scene.sound-name", { stamp: formatDate(row.created_at) });
  const saved = await saveSceneSound(cmds, { occurrenceId, atMs, kind }, media, name, "");
  return (await linkMobileImport(row.id, { assetId: saved.assetId, versionId: saved.versionId }))?.message ?? null;
}

/** Knappene for en mottatt fil i scenens mobilvindu. */
export function SceneMobileActions({
  state,
  cmds,
  occurrenceId,
  row,
  atMs = 0,
}: {
  state: ProjectState;
  cmds: Commands;
  occurrenceId: string;
  row: MobileImportRow;
  /** B-099: avspillingshodet – der en lyd fra mobilen legges i scenen. */
  atMs?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [soundKind, setSoundKind] = useUiPref<SceneSoundChoice>(SCENE_SOUND_KIND_PREF, "sfx", isSceneSoundChoice);
  if (row.take_id)
    return (
      <span className="text-[11px] text-status-success">{t("app-mobile-mobile-actions.scene-mobile-actions.span.d8591e22b250")}</span>
    );
  if (row.asset_version_id)
    return (
      <span className="text-[11px] text-status-success">
        {t("app-mobile-mobile-actions.scene-mobile-actions.span.dd72c87f8a7c")}
      </span>
    );
  async function go(fn: () => Promise<string | null>) {
    setBusy(true);
    setErr(null);
    try {
      setErr(await fn());
    } catch (e) {
      setErr(tm((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const base = (row.file_name || "").replace(/\.[a-z0-9]+$/i, "").trim();
  return (
    <div className="flex flex-col gap-0.5">
      {row.kind === "video" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void go(() => applyVideoToScene(state, cmds, occurrenceId, row))}
          className="rounded-sm bg-surface-3 px-1 py-0.5 text-[11px] text-text-primary hover:bg-surface-4 disabled:opacity-50"
          data-testid="mobile-use-film"
        >
          {t("app-mobile-mobile-actions.scene-mobile-actions.button.1428dd36493d")}
        </button>
      ) : row.kind === "image" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void go(() =>
              addImageAsNewAsset(cmds, row, base || t("app-mobile-mobile-actions.scene-mobile-actions.add-image-as-new-asset.f2e0f2c85f05")),
            )
          }
          className="rounded-sm bg-surface-3 px-1 py-0.5 text-[11px] text-text-primary hover:bg-surface-4 disabled:opacity-50"
          data-testid="mobile-new-element"
        >
          {t("app-mobile-mobile-actions.scene-mobile-actions.button.91640d5780c0")}
        </button>
      ) : row.kind === "audio" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-0.5 rounded-sm bg-surface-3 px-1 py-0.5 text-[11px] text-text-primary hover:bg-surface-4 disabled:opacity-50"
              data-testid="mobile-add-sound"
            >
              {t("b099.scene.add-sound")}
              <ChevronDown className="size-3" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" data-testid="mobile-add-sound-menu">
            <DropdownMenuLabel className="text-[11px] font-normal text-text-tertiary">{t("b097.sound-kind.ask")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={soundKind}>
              {SCENE_SOUND_CHOICES.map((k) => (
                <DropdownMenuRadioItem
                  key={k}
                  value={k}
                  data-testid={`mobile-add-sound-${k}`}
                  onSelect={() => {
                    setSoundKind(k);
                    void go(() => addAudioToScene(cmds, occurrenceId, row, atMs, k));
                  }}
                >
                  {k === "sfx" ? t("b097.sound-kind.sfx") : k === "ambience" ? t("b097.sound-kind.ambience") : t("b097.sound-kind.music")}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {err ? <span className="text-[11px] text-status-danger">{err}</span> : null}
    </div>
  );
}
