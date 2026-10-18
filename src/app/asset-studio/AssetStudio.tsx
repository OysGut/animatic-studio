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
import { Pause, Play, Redo2, Undo2, Unlock, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  L,
  applyCommand,
  assetAudioGroups,
  assetLineIds,
  compositionDuration,
  draftCommand,
  draftConflicts,
  filmClips,
  framesToSeconds,
  imageSegmentsOf,
  layerFieldsOf,
  layerVersions,
  rebaseDraft,
  removeImageSegment,
  replaceImageSegment,
  insertImageSegment,
  secondsToFrames,
  setImageSegmentTransition,
  variantsOf,
  versionsOf,
  type Composition,
  type FilmAudioItem,
  type LayerFields,
  type ProjectState,
} from "@/core";
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
  ToolbarSeparator,
} from "@/app/shell/workspace-chrome";
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
          if (applied.ok) mark({ before, after, affected: applied.affected });
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
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);

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
        for (const v of layerVersions(view, l)) out.push(v.mediaPath);
    if (asset)
      for (const v of variantsOf(view, asset.id))
        for (const ver of versionsOf(view, v.id)) out.push(ver.mediaPath);
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
    if (seg) change(replaceImageSegment(fields, seg.index, img), L("Erstatt bilde", "Replace image"));
    else
      change(
        insertImageSegment(fields, playback.frame, img),
        L("Nytt bildesegment", "New image segment"),
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
      L(`Asset Studio: ${layer?.name ?? ""}`, `Asset Studio: ${layer?.name ?? ""}`),
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
        L(
          "Utkastet kan ikke legges oppå den nye versjonen. Forkast det, eller gjør endringene på nytt.",
          "The draft cannot be laid on top of the new version. Discard it, or make the changes again.",
        ),
      );
      setConflict(false);
      return;
    }
    d.replace(r.draft);
    setConflict(false);
    setError(null);
    setNotice(
      L(
        "Utkastet ligger nå oppå den nyeste versjonen. Se over forhåndsvisningen og trykk «Oppdater scenen og lukk» igjen.",
        "The draft is now on top of the latest version. Check the preview and press “Update the scene and close” again.",
      ),
    );
  }

  // Tastatur: Esc lukker underdialoger først (Radix), deretter «Avbryt». ⌘/Ctrl + Z virker på utkastet.
  // Tastene fra studioet når ikke sceneeditoren under.
  function onKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    const inSub = target.closest('[role="dialog"],[role="alertdialog"]');
    e.stopPropagation();
    if (inSub && inSub !== rootRef.current) return;
    if (e.key === "Escape") {
      e.preventDefault();
      requestCancel();
      return;
    }
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
    if (l) return L(`laget «${l.name}»`, `the layer “${l.name}”`);
    const c = view.audioClips[id as never];
    if (c) return L(`lydklippet «${c.name}»`, `the audio clip “${c.name}”`);
    return L("2D-scenen", "the 2D scene");
  });

  if (!layer || !fields) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-2 z-40 flex flex-col items-center justify-center gap-2 border border-border bg-surface-1"
        data-testid="asset-studio"
      >
        <p className="text-sm text-text-secondary">
          {L("Laget finnes ikke lenger.", "The layer no longer exists.")}
        </p>
        <Button onClick={onClose}>{L("Lukk", "Close")}</Button>
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
      aria-label={L(`Asset Studio: ${layer.name}`, `Asset Studio: ${layer.name}`)}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-2 z-40 flex flex-col overflow-hidden border border-border bg-surface-1 shadow-lg focus:outline-none"
      data-testid="asset-studio"
      data-draft-steps={d.draft.steps.length}
    >
      <Toolbar
        title={L(`Asset Studio – ${layer.name}`, `Asset Studio – ${layer.name}`)}
        status={
          d.empty
            ? L("Ingen endringer i scenen", "No changes in the scene")
            : L(
                `${d.draft.steps.length} endringer i utkastet – ikke lagret i scenen`,
                `${d.draft.steps.length} changes in the draft – not saved in the scene`,
              )
        }
      >
        <ToolbarGroup>
          <ToolbarButton
            variant="icon"
            onClick={d.undo}
            disabled={!d.canUndo}
            aria-label={L("Angre i utkastet", "Undo in the draft")}
            title={L("Angre i utkastet (⌘/Ctrl + Z)", "Undo in the draft (⌘/Ctrl + Z)")}
            data-testid="asset-studio-undo"
          >
            <Undo2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            variant="icon"
            onClick={d.redo}
            disabled={!d.canRedo}
            aria-label={L("Gjør om i utkastet", "Redo in the draft")}
            title={L("Gjør om i utkastet (⇧ + ⌘/Ctrl + Z)", "Redo in the draft (⇧ + ⌘/Ctrl + Z)")}
            data-testid="asset-studio-redo"
          >
            <Redo2 className="size-4" />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <ToolbarButton
            active={mode === "object"}
            onClick={() => setMode("object")}
            data-testid="asset-studio-view-object"
          >
            {L("Bare objektet", "Object only")}
          </ToolbarButton>
          <ToolbarButton
            active={mode === "scene"}
            onClick={() => setMode("scene")}
            data-testid="asset-studio-view-scene"
          >
            {L("Hele scenen", "Whole scene")}
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <ToolbarButton
            variant="icon"
            onClick={playback.toggle}
            aria-label={playback.playing ? L("Pause", "Pause") : L("Spill av", "Play")}
            title={playback.playing ? L("Pause (mellomrom)", "Pause (space)") : L("Spill av (mellomrom)", "Play (space)")}
            data-testid="asset-studio-play"
          >
            {playback.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </ToolbarButton>
          <ToolbarButton
            active={area === "object"}
            onClick={() => setArea("object")}
            data-testid="asset-studio-play-object"
            title={L("Spill objektets aktive område", "Play the object's active range")}
          >
            {L("Objektets område", "Object's range")}
          </ToolbarButton>
          <ToolbarButton
            active={area === "scene"}
            onClick={() => setArea("scene")}
            data-testid="asset-studio-play-scene"
            title={L("Spill hele scenen", "Play the whole scene")}
          >
            {L("Hele scenen", "Whole scene")}
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
              title={L(
                "Last opp, lag med AI, frilegg eller lag vinkler. Nye bilder lagres med en gang i biblioteket.",
                "Upload, create with AI, cut out or create angles. New images are saved straight away in the library.",
              )}
            >
              {L("Bilder og verktøy …", "Images and tools …")}
            </Button>
            {editable && asset && asset.kind !== "sound" ? (
              <MobileCameraButton
                projectId={projectId}
                context={{
                  type: "asset",
                  assetId: asset.id,
                  ...(layer.assetVariantId ? { variantId: layer.assetVariantId } : {}),
                }}
                label={L(`Bilder av ${asset.name}`, `Pictures of ${asset.name}`)}
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
          <PanelHeader title={L("Egenskaper", "Properties")} />
          <div className="flex flex-col gap-2 p-2 text-[12px]" data-testid="asset-studio-properties">
            <p className="truncate text-text-primary">
              {layer.name}
              {asset ? <span className="text-text-tertiary"> · {asset.name}</span> : null}
            </p>
            {layer.locked ? (
              <div className="flex items-center gap-2 text-text-secondary" data-testid="asset-studio-locked">
                <span className="flex-1">
                  {L("Laget er låst. Lås det opp for å endre.", "The layer is locked. Unlock it to make changes.")}
                </span>
                {editable ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => change({ ...fields, locked: false }, L("Lås opp lag", "Unlock layer"))}
                    data-testid="asset-studio-unlock"
                  >
                    <Unlock />
                    {L("Lås opp", "Unlock")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <fieldset className="flex flex-col gap-1" disabled={!canEdit}>
              <legend className="mb-1 text-[11px] font-medium text-text-secondary">
                {L("Når objektet vises", "When the object is shown")}
              </legend>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1">
                  {L("Fra (s)", "From (s)")}
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
                      change({ ...fields, activeRange: { from, to } }, L("Endre objektets tidsområde", "Change the object's time range"));
                    }}
                  />
                </label>
                <label className="flex items-center gap-1">
                  {L("Til (s)", "To (s)")}
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
                      change({ ...fields, activeRange: { from, to } }, L("Endre objektets tidsområde", "Change the object's time range"));
                    }}
                  />
                </label>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                disabled={!range}
                onClick={() => change({ ...fields, activeRange: null }, L("Objektet vises i hele scenen", "The object is shown in the whole scene"))}
                data-testid="asset-studio-range-clear"
              >
                {L("Vis i hele scenen", "Show in the whole scene")}
              </Button>
              <p className="text-[11px] text-text-tertiary">
                {L(
                  "Endrer bare når objektet vises. Scenens lengde, andre lag og dialog flyttes ikke. Skjult lag og opasitet gjelder i tillegg.",
                  "Only changes when the object is shown. The scene length, other layers and dialogue are not moved. Hidden layer and opacity apply in addition.",
                )}
              </p>
            </fieldset>
            {seg ? (
              <fieldset className="flex flex-col gap-1" disabled={!canEdit} data-testid="asset-studio-segment-props">
                <legend className="mb-1 text-[11px] font-medium text-text-secondary">
                  {L(
                    `Bildesegment fra ${sec(seg.start)} s til ${sec(seg.end)} s`,
                    `Image segment from ${sec(seg.start)} s to ${sec(seg.end)} s`,
                  )}
                </legend>
                {seg.index > 0 ? (
                  <label className="flex items-center gap-1.5">
                    {L("Overgang inn", "Transition in")}
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
                          L("Endre overgang", "Change transition"),
                        )
                      }
                    >
                      <option value="cut">{L("Kutt", "Cut")}</option>
                      <option value="crossfade">{L("Krysstoning", "Crossfade")}</option>
                    </select>
                    {seg.transition ? (
                      <Input
                        type="number"
                        min={1}
                        className="h-7 w-16"
                        aria-label={L("Krysstoningens lengde i bilder", "Crossfade length in frames")}
                        data-testid="asset-studio-transition-frames"
                        value={seg.transition.frames}
                        onChange={(e) =>
                          change(
                            setImageSegmentTransition(fields, seg.index, Math.max(1, Math.round(Number(e.target.value) || 1))),
                            L("Endre overgang", "Change transition"),
                          )
                        }
                      />
                    ) : null}
                  </label>
                ) : null}
                <p className="text-[11px] text-text-tertiary">
                  {L(
                    "Klikk et bilde til venstre for å erstatte bildet i segmentet.",
                    "Click an image on the left to replace the image in the segment.",
                  )}
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
                        change(f, L("Fjern bildesegment", "Remove image segment"));
                        setSelected(null);
                      }
                    }}
                  >
                    <X />
                    {L("Fjern segmentet (bildet blir i biblioteket)", "Remove the segment (the image stays in the library)")}
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
          {L(
            "Nye bilder, lydopptak og notater er allerede lagret. Scenen endres først når du oppdaterer den.",
            "New images, audio recordings and notes are already saved. The scene changes only when you update it.",
          )}
        </p>
        <Button variant="ghost" onClick={requestCancel} data-testid="asset-studio-cancel">
          {L("Avbryt uten å oppdatere scenen", "Cancel without updating the scene")}
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving || !editable}
          data-testid="asset-studio-save"
        >
          {saving ? L("Oppdaterer …", "Updating …") : L("Oppdater scenen og lukk", "Update the scene and close")}
        </Button>
      </footer>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent className="border-border bg-surface-2" data-testid="asset-studio-cancel-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{L("Forkaste endringene i scenen?", "Discard the changes in the scene?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {L(
                `Utkastet har ${d.draft.steps.length} endringer som ikke er lagret i scenen. Nye bilder, lydopptak og notater blir liggende i biblioteket.`,
                `The draft has ${d.draft.steps.length} changes that are not saved in the scene. New images, audio recordings and notes stay in the library.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Fortsett å arbeide", "Keep working")}</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} data-testid="asset-studio-cancel-discard">
              {L("Forkast og lukk", "Discard and close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent className="border-border bg-surface-2" data-testid="asset-studio-conflict">
          <AlertDialogHeader>
            <AlertDialogTitle>{L("Scenen er endret av andre", "The scene has been changed by others")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-1 text-[13px]">
                <span>
                  {conflictNames.length
                    ? L(
                        `Mens du arbeidet, ble ${conflictNames.join(", ")} endret i et annet vindu eller av en annen bruker.`,
                        `While you were working, ${conflictNames.join(", ")} was changed in another window or by another user.`,
                      )
                    : L(
                        "Scenen ble ikke oppdatert fordi noe er endret i et annet vindu eller av en annen bruker.",
                        "The scene was not updated because something was changed in another window or by another user.",
                      )}
                </span>
                <span>
                  {L(
                    "Ingenting er overskrevet. Du kan legge utkastet oppå den nye versjonen og se resultatet før du oppdaterer, eller forkaste utkastet.",
                    "Nothing has been overwritten. You can lay the draft on top of the new version and see the result before updating, or discard the draft.",
                  )}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="asset-studio-conflict-discard" onClick={onClose}>
              {L("Forkast utkastet", "Discard the draft")}
            </AlertDialogCancel>
            <AlertDialogAction data-testid="asset-studio-conflict-rebase" onClick={layOnTop}>
              {L("Legg utkastet oppå og forhåndsvis", "Lay the draft on top and preview")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LayerImageDialog
        open={imagesOpen}
        onOpenChange={setImagesOpen}
        state={view}
        projectId={projectId}
        layer={layer}
        editable={editable}
        cmds={directCmds}
        sceneWrite={(patch, label) =>
          layer.locked
            ? L("Laget er låst. Lås det opp for å endre.", "The layer is locked. Unlock it to make changes.")
            : change({ ...fields, ...patch }, label)
        }
      />
    </div>
  );
}
