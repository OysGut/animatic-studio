/**
 * Asset Studio (AS1–AS3): en fokusert arbeidsflate for ett objekt eller én karakter i én sceneforekomst, over
 * sceneeditoren. Bygger på sceneeditorens lag, bildeskifter, lyd og medieverktøy – ingen egen motor.
 *
 * Venstre: varianter og bilder. Midten: forhåndsvisning («Bare objektet» / «Hele scenen») og objektets tidslinje
 * med lydsporene. Høyre: egenskaper og manus.
 *
 * Lagring (B4/B5): scenen endres bare i et lokalt utkast (`useAssetStudioDraft`) som sendes som én
 * `UpdateSceneDraft` med «Oppdater scenen og lukk». Biblioteket (bilder, varianter, AI, frilegging, lyd og takes)
 * og notater (forsøksvise manusredigeringer) lagres direkte med `cmds` og overlever «Avbryt».
 * Ved revisjonskonflikt (F3) vises hva som er endret av andre; aldri stille overskriving.
 */
import { UiId } from "@/app/shared/UiId";
import { Pause, Play, Redo2, Undo2, Unlock, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyCommand, assetAudioGroups, assetLineIds, compositionDuration, draftCommand, draftConflicts, filmClips, framesToSeconds, imageSegmentsOf, layerFieldsOf, layerVersions, rebaseDraft, removeImageSegment, replaceImageSegment, insertImageSegment, secondsToFrames, setImageSegmentTransition, variantsOf, versionsOf, versionImagePath, type Composition, type FilmAudioItem, type LayerFields, type ProjectState } from "@/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PanelHeader,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator, IconButton } from "@/app/shell/workspace-chrome";
import { useImageUrls } from "@/app/library/asset-images";
import { useAudioPlayback } from "@/app/audio/use-audio-playback";
import { LayerImageDialog } from "@/app/scene-editor/LayerImageDialog";
import { MobileCameraButton } from "@/app/mobile/MobileImportDialog";
import { usePlayback } from "@/app/scene-editor/use-playback";
import type { Commands } from "@/app/project/use-commands";
import { useAssetStudioDraft } from "./use-asset-studio-draft";
import { StudioPreview, type StudioPreviewMode } from "./StudioPreview";
import { VariantStrip, type StripImage } from "./VariantStrip";
import { ObjectTimeline } from "./ObjectTimeline";
import { StudioAudioTracks, muteDraftCommand } from "./StudioAudioTracks";
import { StudioScript } from "./StudioScript";
import { CarryOverDialog } from "@/app/scene-editor/CarryOverDialog";
import { AlphaExportDialog } from "@/app/assembly/AlphaExportDialog";
import { Download } from "lucide-react";
import { t as tk } from "@/core/i18n/keyed";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function AssetStudio({
  projectId,
  state,
  cmds,
  composition,
  occurrenceId,
  productionId,
  layerId,
  editable,
  audioEditable,
  authorName,
  audioOf,
  onClose,
}: {
  projectId: string;
  /** Den lagrede tilstanden (med andres endringer). */
  state: ProjectState;
  cmds: Commands;
  composition: Composition;
  occurrenceId: string;
  productionId: string;
  layerId: string;
  editable: boolean;
  audioEditable: boolean;
  authorName: string;
  /** Lyden i scenen for en tilstand (samme som sceneeditoren spiller). */
  audioOf: (s: ProjectState) => readonly FilmAudioItem[];
  onClose: () => void;
}) {
  const d = useAssetStudioDraft(state, occurrenceId, composition.id);
  const view = d.view;
  // Direkte skrivinger fra verktøyene i studioet (bibliotek, notater, lydopptak og «Bruk dette») merkes som
  // egne, så utkastet legges oppå dem automatisk
  const mark = d.markOwnWrite;
  const directCmds = useMemo<Commands>(
    () => {
      const track = <T,>(command: Parameters<Commands["run"]>[0], action: () => T): T => {
        const before = cmds.current();
        const result = action();
        const after = cmds.current();
        if (before && after && before !== after) {
          const applied = applyCommand(before, {
            id: "studio-own-write" as never,
            actor: "00000000-0000-0000-0000-000000000000" as never,
            at: new Date(0).toISOString(), command,
          });
          if (applied.ok) mark({ before, after: applied.state, affected: applied.affected });
        }
        return result;
      };
      return {
      ...cmds,
      run: (...a: Parameters<Commands["run"]>) => track(a[0], () => cmds.run(...a)),
      runSilent: (...a: Parameters<Commands["runSilent"]>) => track(a[0], () => cmds.runSilent(...a)),
      runQueued: (...a: Parameters<Commands["runQueued"]>) => track(a[0], () => cmds.runQueued(...a)),
      runAndWait: (...a: Parameters<Commands["runAndWait"]>) => track(a[0], () => cmds.runAndWait(...a)),
      };
    },
    [cmds, mark],
  );
  const comp = view.compositions[composition.id] ?? composition;
  const layer = view.layers[layerId as never];
  const fps = view.project.fps;
  const duration = useMemo(() => compositionDuration(view, comp), [view, comp]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<StudioPreviewMode>("object");
  const [alphaOpen, setAlphaOpen] = useState(false);
  const [area, setArea] = useState<"object" | "scene">("object");
  const playback = usePlayback(
    duration,
    fps,
    true,
    area === "object" ? (layer?.activeRange ?? null) : null,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  /** «Bruk også i …» (GP3): skrives direkte til andre scener og blander ikke inn utkastet. */
  const [carryOpen, setCarryOpen] = useState(false);
  const [carryMsg, setCarryMsg] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  /** P8: «Harmoniser stil …» åpner bildedialogen med harmoniseringen fremme. */
  const [harmonizeOpen, setHarmonizeOpen] = useState(false);

  const canEdit = editable && !!layer && !layer.locked;
  const fields = layer ? layerFieldsOf(layer) : null;
  const asset = layer?.assetId ? view.assets[layer.assetId] : undefined;

  const change = useCallback(
    (next: LayerFields, label: string): string | null => {
      void label;
      const e = d.push({ type: "UpdateLayers", layers: [{ layerId: layerId as never, fields: next }] });
      setError(e);
      return e;
    },
    [d, layerId],
  );

  // Bildene: lagene i scenen og alle versjoner av ressursen
  const paths = useMemo(() => {
    const out: string[] = [];
    for (const l of Object.values(view.layers))
      if (l.compositionId === comp.id && !l.removed)
        for (const v of layerVersions(view, l)) out.push(versionImagePath(v, "playback"));
    if (asset)
      for (const v of variantsOf(view, asset.id))
        for (const ver of versionsOf(view, v.id)) out.push(versionImagePath(ver, "playback"));
    return out;
  }, [view, comp.id, asset]);
  const urls = useImageUrls(paths).data ?? {};

  // Lyden (forhåndslytting): dempingen her er bare lokal og når aldri scenen, eksporten eller vanlig avspilling
  const groups = useMemo(
    () => assetAudioGroups(view, occurrenceId, layer?.assetId ?? null),
    [view, occurrenceId, layer?.assetId],
  );
  const [previewMuted, setPreviewMuted] = useState<Set<string>>(
    () =>
      new Set(
        Object.values(state.audioClips)
          .filter((c) => c.occurrenceId === occurrenceId && c.muted)
          .map((c) => c.id),
      ),
  );
  const items = useMemo(
    () => audioOf(view).map((it) => ({ ...it, clip: { ...it.clip, muted: false } })),
    [audioOf, view],
  );
  const soundPaths = useMemo(
    () => [...new Set(items.flatMap((it) => (it.version ? [it.version.mediaPath] : [])))],
    [items],
  );
  const soundUrls = useImageUrls(soundPaths);
  useAudioPlayback({
    items,
    urls: soundUrls.data ?? null,
    playing: playback.playing,
    time: framesToSeconds(playback.frame, fps),
    mutedClipIds: previewMuted,
  });

  const lineIds = useMemo(
    () => (layer?.assetId ? assetLineIds(view, occurrenceId, layer.assetId) : []),
    [view, occurrenceId, layer?.assetId],
  );
  const clip = useMemo(
    () => filmClips(view, productionId).find((c) => c.occurrenceId === occurrenceId) ?? null,
    [view, productionId, occurrenceId],
  );

  const segments = fields ? imageSegmentsOf(fields, duration) : [];
  const seg = selected !== null ? segments.find((s) => s.index === selected) : undefined;

  function pick(img: StripImage) {
    if (!fields || !canEdit) return;
    if (seg) change(replaceImageSegment(fields, seg.index, img), tk("app-asset-studio-asset-studio.pick.change.f1a8f1e518e5"));
    else
      change(
        insertImageSegment(fields, playback.frame, img),
        tk("app-asset-studio-asset-studio.pick.change.7d5475d1f990"),
      );
  }

  function requestCancel() {
    if (d.empty) onClose();
    else setConfirmCancel(true);
  }

  async function save() {
    const fresh = cmds.current() ?? state;
    if (draftConflicts(d.draft, fresh).length) {
      setConflict(true);
      return;
    }
    const rebased = rebaseDraft(d.draft, fresh);
    if (!rebased.ok) {
      setError(rebased.message);
      return;
    }
    const cmd = draftCommand(rebased.draft);
    if (!cmd) {
      onClose();
      return;
    }
    if (d.conflicts.length) {
      setConflict(true);
      return;
    }
    setSaving(true);
    const r = await cmds.runAndWait(
      cmd,
      tk("app-asset-studio-asset-studio.r.cmds-run-and-wait.aec5f64d58bf", { value1: String(layer?.name ?? "") }),
    );
    setSaving(false);
    if (r.error) {
      setError(r.error);
      setConflict(true);
      return;
    }
    onClose();
  }

  function layOnTop() {
    const r = rebaseDraft(d.draft, cmds.current() ?? state);
    if (!r.ok) {
      setError(
        tk("app-asset-studio-asset-studio.lay-on-top.set-error.aff794f3794b"),
      );
      setConflict(false);
      return;
    }
    d.replace(r.draft);
    setConflict(false);
    setError(null);
    setNotice(
      tk("app-asset-studio-asset-studio.lay-on-top.set-notice.eb075dd820b3"),
    );
  }

  // Tastatur: Esc lukker underdialoger først (Radix), deretter «Avbryt». ⌘/Ctrl + Z virker på utkastet.
  // Tastene fra studioet når ikke sceneeditoren under.
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (e.key !== "Escape" || e.defaultPrevented || !root || imagesOpen || confirmCancel || conflict) return;
      const overlay = Array.from(document.querySelectorAll(
        '[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper]',
      )).some((el) => el !== root && el.getAttribute("data-state") !== "closed");
      if (overlay) return;
      e.preventDefault();
      e.stopPropagation();
      requestCancel();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  });

  function onKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    const inSub = target.closest('[role="dialog"],[role="alertdialog"]');
    e.stopPropagation();
    if (inSub && inSub !== rootRef.current) return;
    if (e.key === "Escape") return;
    if (isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) d.redo();
      else d.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      d.redo();
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      playback.toggle();
    }
  }

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const conflictNames = d.conflicts.map((id) => {
    const l = view.layers[id as never];
    if (l) return tk("app-asset-studio-asset-studio.conflict-names.d-conflicts-map.dd78d01e0b81", { name: String(l.name) });
    const c = view.audioClips[id as never];
    if (c) return tk("app-asset-studio-asset-studio.conflict-names.d-conflicts-map.f7b47ddf527d", { name: String(c.name) });
    return tk("app-asset-studio-asset-studio.conflict-names.d-conflicts-map.23313fa29d09");
  });

  if (!layer || !fields) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-2 z-40 flex flex-col items-center justify-center gap-2 border border-border bg-surface-1"
        data-testid="asset-studio"
      >
        <UiId id="NEW" />
        <p className="text-sm text-text-secondary">
          {tk("app-asset-studio-asset-studio.asset-studio.p.e5c62d866af9")}
        </p>
        <Button onClick={onClose}>{tk("app-asset-studio-asset-studio.asset-studio.button.e2de23ff999f")}</Button>
      </div>
    );
  }

  const range = layer.activeRange;
  const sec = (f: number) => Math.round(framesToSeconds(f, fps) * 100) / 100;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={tk("app-asset-studio-asset-studio.asset-studio.aria-label.da9dafcb0106", { name: String(layer.name) })}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-2 z-40 flex flex-col overflow-hidden border border-border bg-surface-1 shadow-lg focus:outline-none"
      data-testid="asset-studio"
      data-draft-steps={d.draft.steps.length}
    >
      <UiId id="NEW" />
      {alphaOpen ? <AlphaExportDialog state={view} composition={comp} initialLayerIds={[layerId]} open={alphaOpen} onOpenChange={setAlphaOpen} /> : null}
      <Toolbar
        title={tk("app-asset-studio-asset-studio.asset-studio.title.f1e77f22dd48", { name: String(layer.name) })}
        status={
          d.empty
            ? tk("app-asset-studio-asset-studio.asset-studio.status.3c1b477a3069")
            : tk("app-asset-studio-asset-studio.asset-studio.status.1c8b2027c94c", { length: String(d.draft.steps.length) })
        }
      >
        <ToolbarGroup>
          <IconButton
            onClick={d.undo}
            disabled={!d.canUndo}
            label={tk("app-asset-studio-asset-studio.asset-studio.label.05398cf0bc92")}
            title={tk("app-asset-studio-asset-studio.asset-studio.title.1adfc38ed448")}
            data-testid="asset-studio-undo"
          >
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton
            onClick={d.redo}
            disabled={!d.canRedo}
            label={tk("app-asset-studio-asset-studio.asset-studio.label.40c865783760")}
            title={tk("app-asset-studio-asset-studio.asset-studio.title.612237f6be7e")}
            data-testid="asset-studio-redo"
          >
            <Redo2 className="size-4" />
          </IconButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarButton data-testid="asset-studio-alpha-open" onClick={() => setAlphaOpen(true)}
          title={tk("app-asset-studio-asset-studio.asset-studio.title.4e6b475444df")}>
          <Download className="size-4" />{tk("app-asset-studio-asset-studio.asset-studio.toolbar-button.4e6b475444df")}
        </ToolbarButton>
        <ToolbarGroup>
          <ToolbarButton
            active={mode === "object"}
            onClick={() => setMode("object")}
            data-testid="asset-studio-view-object"
          >
            {tk("app-asset-studio-asset-studio.asset-studio.toolbar-button.6918d85652af")}
          </ToolbarButton>
          <ToolbarButton
            active={mode === "scene"}
            onClick={() => setMode("scene")}
            data-testid="asset-studio-view-scene"
          >
            {tk("app-asset-studio-asset-studio.asset-studio.toolbar-button.bcffd38cddec")}
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <IconButton
            onClick={playback.toggle}
            label={playback.playing ? tk("app-asset-studio-asset-studio.asset-studio.label.788ef0b685fc") : tk("app-asset-studio-asset-studio.asset-studio.label.80c8ecbf22c4")}
            title={playback.playing ? tk("app-asset-studio-asset-studio.asset-studio.title.28581374a130") : tk("app-asset-studio-asset-studio.asset-studio.title.03e7a5badb5b")}
            data-testid="asset-studio-play"
          >
            {playback.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </IconButton>
          <ToolbarButton
            active={area === "object"}
            onClick={() => setArea("object")}
            data-testid="asset-studio-play-object"
            title={tk("app-asset-studio-asset-studio.asset-studio.title.db2924381614")}
          >
            {tk("app-asset-studio-asset-studio.asset-studio.toolbar-button.b5b20e146106")}
          </ToolbarButton>
          <ToolbarButton
            active={area === "scene"}
            onClick={() => setArea("scene")}
            data-testid="asset-studio-play-scene"
            title={tk("app-asset-studio-asset-studio.asset-studio.title.ddaf60eb3c6a")}
          >
            {tk("app-asset-studio-asset-studio.asset-studio.toolbar-button.bcffd38cddec.2")}
          </ToolbarButton>
        </ToolbarGroup>
      </Toolbar>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* Venstre: medieverktøy, varianter og bilder */}
        <aside className="flex min-h-0 flex-col border-r border-border">
          <div className="flex items-center gap-1 border-b border-border p-2" data-testid="asset-studio-media">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setImagesOpen(true)}
              disabled={!editable}
              data-testid="asset-studio-images"
              title={tk("app-asset-studio-asset-studio.asset-studio.title.335a9be8ac3f")}
            >
              {tk("app-asset-studio-asset-studio.asset-studio.button.7b82afd0712e")}
            </Button>
            {asset && asset.kind !== "sound" && layer.assetId ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setHarmonizeOpen(true);
                  setImagesOpen(true);
                }}
                disabled={!editable}
                data-testid="asset-studio-harmonize"
                title={tk("app-asset-studio-asset-studio.asset-studio.title.2e3ef6ac48ed")}
              >
                {tk("app-asset-studio-asset-studio.asset-studio.button.d821476184ee")}
              </Button>
            ) : null}
            {editable && asset && asset.kind !== "sound" ? (
              <MobileCameraButton
                projectId={projectId}
                context={{
                  type: "asset",
                  assetId: asset.id,
                  ...(layer.assetVariantId ? { variantId: layer.assetVariantId } : {}),
                }}
                label={tk("app-asset-studio-asset-studio.asset-studio.label.b36d69042fa0", { name: String(asset.name) })}
              />
            ) : null}
          </div>
          <VariantStrip
            state={view}
            assetId={layer.assetId}
            urls={urls}
            editable={canEdit}
            replacing={seg !== undefined}
            onPick={pick}
            cmds={directCmds}
          />
        </aside>

        {/* Midten: forhåndsvisning og tidslinje */}
        <main className="flex min-h-0 flex-col">
          <StudioPreview
            state={view}
            composition={comp}
            layerId={layerId}
            frame={playback.frame}
            mode={mode}
            urls={urls}
          />
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-border">
            <ObjectTimeline
              state={view}
              fields={fields}
              durationFrames={duration}
              frame={playback.frame}
              editable={canEdit}
              selected={selected}
              onSelect={setSelected}
              onSeek={playback.setFrame}
              onChange={(f, label) => change(f, label)}
            >
              <StudioAudioTracks
                state={view}
                projectId={projectId}
                cmds={directCmds}
                occurrenceId={occurrenceId}
                assetName={asset?.name ?? layer.name}
                sceneClips={groups.scene}
                assetClips={groups.asset}
                durationFrames={duration}
                fps={fps}
                previewMuted={previewMuted}
                onPreviewMuted={setPreviewMuted}
                editable={editable}
                audioEditable={audioEditable}
                onSaveMute={() => {
                  const c = muteDraftCommand(view, [...groups.scene, ...groups.asset], previewMuted);
                  if (c) setError(d.push(c));
                }}
              />
            </ObjectTimeline>
          </div>
        </main>

        {/* Høyre: egenskaper og manus */}
        <aside className="flex min-h-0 flex-col border-l border-border">
          <PanelHeader title={tk("app-asset-studio-asset-studio.asset-studio.title.0d8293736ec8")} />
          <div className="flex flex-col gap-2 p-2 text-[12px]" data-testid="asset-studio-properties">
            <p className="truncate text-text-primary">
              {layer.name}
              {asset ? <span className="text-text-tertiary"> · {asset.name}</span> : null}
            </p>
            {layer.locked ? (
              <div className="flex items-center gap-2 text-text-secondary" data-testid="asset-studio-locked">
                <span className="flex-1">
                  {tk("app-asset-studio-asset-studio.asset-studio.span.ab2a329a0852")}
                </span>
                {editable ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => change({ ...fields, locked: false }, tk("app-asset-studio-asset-studio.asset-studio.change.b6905ac9439c"))}
                    data-testid="asset-studio-unlock"
                  >
                    <Unlock />
                    {tk("app-asset-studio-asset-studio.asset-studio.button.0058e3e9a4d2")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <fieldset className="flex flex-col gap-1" disabled={!canEdit}>
              <legend className="mb-1 text-[11px] font-medium text-text-secondary">
                {tk("app-asset-studio-asset-studio.asset-studio.legend.a61264741e9e")}
              </legend>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1">
                  {tk("app-asset-studio-asset-studio.asset-studio.label.5564ad94e299")}
                  <Input
                    type="number"
                    step={0.04}
                    min={0}
                    className="h-7 w-20"
                    data-testid="asset-studio-range-from"
                    value={sec(range?.from ?? 0)}
                    onChange={(e) => {
                      const from = Math.max(0, secondsToFrames(Number(e.target.value) || 0, fps));
                      const to = Math.max(from, range?.to ?? duration - 1);
                      change({ ...fields, activeRange: { from, to } }, tk("app-asset-studio-asset-studio.asset-studio.change.10e813998fa5"));
                    }}
                  />
                </label>
                <label className="flex items-center gap-1">
                  {tk("app-asset-studio-asset-studio.asset-studio.label.4044169b1a8e")}
                  <Input
                    type="number"
                    step={0.04}
                    min={0}
                    className="h-7 w-20"
                    data-testid="asset-studio-range-to"
                    value={sec(range?.to ?? duration - 1)}
                    onChange={(e) => {
                      const to = Math.max(0, secondsToFrames(Number(e.target.value) || 0, fps));
                      const from = Math.min(range?.from ?? 0, to);
                      change({ ...fields, activeRange: { from, to } }, tk("app-asset-studio-asset-studio.asset-studio.change.10e813998fa5.2"));
                    }}
                  />
                </label>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                disabled={!range}
                onClick={() => change({ ...fields, activeRange: null }, tk("app-asset-studio-asset-studio.asset-studio.change.2a9019e7a20f"))}
                data-testid="asset-studio-range-clear"
              >
                {tk("app-asset-studio-asset-studio.asset-studio.button.e095b19f78ab")}
              </Button>
              <p className="text-[11px] text-text-tertiary">
                {tk("app-asset-studio-asset-studio.asset-studio.p.690f1d2288d2")}
              </p>
            </fieldset>
            {seg ? (
              <fieldset className="flex flex-col gap-1" disabled={!canEdit} data-testid="asset-studio-segment-props">
                <legend className="mb-1 text-[11px] font-medium text-text-secondary">
                  {tk("app-asset-studio-asset-studio.asset-studio.legend.709f2f6a0539", { value1: String(sec(seg.start)), value2: String(sec(seg.end)) })}
                </legend>
                {seg.index > 0 ? (
                  <label className="flex items-center gap-1.5">
                    {tk("app-asset-studio-asset-studio.asset-studio.label.b7fc8f241267")}
                    <select
                      className="h-7 rounded-sm border border-border-control bg-surface-2 px-1"
                      data-testid="asset-studio-transition"
                      value={seg.transition ? "crossfade" : "cut"}
                      onChange={(e) =>
                        change(
                          setImageSegmentTransition(
                            fields,
                            seg.index,
                            e.target.value === "crossfade" ? Math.max(1, Math.round((fps.num / fps.den) / 2)) : null,
                          ),
                          tk("app-asset-studio-asset-studio.asset-studio.change.3851eb61d2f5"),
                        )
                      }
                    >
                      <option value="cut">{tk("app-asset-studio-asset-studio.asset-studio.option.4fc60c88e514")}</option>
                      <option value="crossfade">{tk("app-asset-studio-asset-studio.asset-studio.option.e1ace1eb4f10")}</option>
                    </select>
                    {seg.transition ? (
                      <Input
                        type="number"
                        min={1}
                        className="h-7 w-16"
                        aria-label={tk("app-asset-studio-asset-studio.asset-studio.aria-label.ce80dcdc3fab")}
                        data-testid="asset-studio-transition-frames"
                        value={seg.transition.frames}
                        onChange={(e) =>
                          change(
                            setImageSegmentTransition(fields, seg.index, Math.max(1, Math.round(Number(e.target.value) || 1))),
                            tk("app-asset-studio-asset-studio.asset-studio.change.3851eb61d2f5.2"),
                          )
                        }
                      />
                    ) : null}
                  </label>
                ) : null}
                <p className="text-[11px] text-text-tertiary">
                  {tk("app-asset-studio-asset-studio.asset-studio.p.33323f5710fa")}
                </p>
                {seg.index > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    data-testid="asset-studio-segment-remove"
                    onClick={() => {
                      const f = removeImageSegment(fields, seg.index);
                      if (f) {
                        change(f, tk("app-asset-studio-asset-studio.asset-studio.change.baa7d508fd9a"));
                        setSelected(null);
                      }
                    }}
                  >
                    <X />
                    {tk("app-asset-studio-asset-studio.asset-studio.button.d1b5fe476529")}
                  </Button>
                ) : null}
              </fieldset>
            ) : null}
            {error ? (
              <p role="alert" className="text-xs text-status-danger" data-testid="asset-studio-error">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="text-xs text-text-secondary" data-testid="asset-studio-notice">
                {notice}
              </p>
            ) : null}
          </div>
          <StudioScript
            state={view}
            cmds={directCmds}
            occurrenceId={occurrenceId}
            clip={clip}
            frame={playback.frame}
            playing={playback.playing}
            lineIds={lineIds}
            editable={editable}
            authorName={authorName}
          />
        </aside>
      </div>

      {/* Fast nederst: skal ikke forveksles med lukking av underdialoger */}
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-2 px-3 py-2">
        <p className="mr-auto text-[11px] text-text-tertiary">
          {tk("app-asset-studio-asset-studio.asset-studio.p.6fc560acd9e9")}
        </p>
        {carryMsg ? (
          <span role="status" className="text-xs text-text-secondary" data-testid="asset-studio-carry-status">
            {carryMsg}
          </span>
        ) : null}
        {editable && state.layers[layerId as never] ? (
          <Button
            variant="ghost"
            onClick={() => setCarryOpen(true)}
            data-testid="asset-studio-carry"
            title={tk("app-asset-studio-asset-studio.asset-studio.title.2a820ba8be6c")}
          >
            {tk("app-asset-studio-asset-studio.asset-studio.button.9db3d23bccf4")}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={requestCancel} data-testid="asset-studio-cancel">
          {tk("app-asset-studio-asset-studio.asset-studio.button.e35acb752cc7")}
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving || !editable}
          data-testid="asset-studio-save"
        >
          {saving ? tk("app-asset-studio-asset-studio.asset-studio.button.8c36dfa5465f") : tk("app-asset-studio-asset-studio.asset-studio.button.f289ae870cb1")}
        </Button>
      </footer>

      {carryOpen ? (
        <CarryOverDialog
          open
          onOpenChange={setCarryOpen}
          state={state}
          cmds={directCmds}
          layerId={layerId}
          sourceOccurrenceId={occurrenceId}
          onDone={setCarryMsg}
        />
      ) : null}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent className="border-border bg-surface-2" data-testid="asset-studio-cancel-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{tk("app-asset-studio-asset-studio.asset-studio.alert-dialog-title.8c6aa4c5295a")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tk("app-asset-studio-asset-studio.asset-studio.alert-dialog-description.e01cb528d7aa", { length: String(d.draft.steps.length) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tk("app-asset-studio-asset-studio.asset-studio.alert-dialog-cancel.4504ae6fae70")}</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} data-testid="asset-studio-cancel-discard">
              {tk("app-asset-studio-asset-studio.asset-studio.alert-dialog-action.fb9859bcb41b")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent className="border-border bg-surface-2" data-testid="asset-studio-conflict">
          <AlertDialogHeader>
            <AlertDialogTitle>{tk("app-asset-studio-asset-studio.asset-studio.alert-dialog-title.b91c599cd1d0")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-1 text-[13px]">
                <span>
                  {conflictNames.length
                    ? tk("app-asset-studio-asset-studio.asset-studio.span.fee998828c3e", { value1: String(conflictNames.join(", ")) })
                    : tk("app-asset-studio-asset-studio.asset-studio.span.e2d9b4a43e6d")}
                </span>
                <span>
                  {tk("app-asset-studio-asset-studio.asset-studio.span.8bea83d9c84f")}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="asset-studio-conflict-discard" onClick={onClose}>
              {tk("app-asset-studio-asset-studio.asset-studio.alert-dialog-cancel.bd3daa5b01cf")}
            </AlertDialogCancel>
            <AlertDialogAction data-testid="asset-studio-conflict-rebase" onClick={layOnTop}>
              {tk("app-asset-studio-asset-studio.asset-studio.alert-dialog-action.549b260ef662")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LayerImageDialog
        open={imagesOpen}
        onOpenChange={(o) => {
          setImagesOpen(o);
          if (!o) setHarmonizeOpen(false);
        }}
        openHarmonize={harmonizeOpen}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const opener = rootRef.current?.querySelector<HTMLElement>('[data-testid="asset-studio-images"]');
          (opener ?? rootRef.current)?.focus();
        }}
        state={view}
        projectId={projectId}
        layer={layer}
        editable={editable}
        cmds={directCmds}
        sceneWrite={(patch, label) =>
          layer.locked
            ? tk("app-asset-studio-asset-studio.asset-studio.scene-write.ab2a329a0852")
            : change({ ...fields, ...patch }, label)
        }
      />
    </div>
  );
}
