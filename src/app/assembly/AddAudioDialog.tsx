/**
 * Legg til lyd i filmen (M4 del 2, DEC-0044): velg en lydfil fra biblioteket eller last opp en ny, velg
 * lydtype og eventuelt replikken den hører til. Lyden legges ved avspillingshodet og festes til scenen der.
 */
import { Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIO_KIND_LABEL,
  AUDIO_TRACK_ORDER,
  blocksOfVariant,
  coverVersion,
  formatHeading,
  newId,
  sortedAssets,
  type AudioKind,
  type FilmClip,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useImageUrls } from "@/app/library/asset-images";
import { createSoundAsset, nameFromFile } from "@/app/library/asset-audio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSeconds } from "./FilmTimeline";

export function AddAudioDialog({
  open,
  onOpenChange,
  state,
  projectId,
  cmds,
  clip,
  offsetMs,
  initialKind,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  /** Scenen lyden festes til (under avspillingshodet). */
  clip: FilmClip | null;
  /** Start i scenen (ms). */
  offsetMs: number;
  initialKind: AudioKind;
  onAdded: (clipId: string) => void;
}) {
  const [kind, setKind] = useState<AudioKind>(initialKind);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setAssetId(null);
    setBlockId("");
    setError(null);
    setQuery("");
  }, [open, initialKind]);

  const sounds = useMemo(() => sortedAssets(state, "sound").filter((a) => !a.archived), [state]);
  const shown = sounds.filter((a) =>
    a.name.toLocaleLowerCase("nb").includes(query.trim().toLocaleLowerCase("nb")),
  );
  const paths = useMemo(
    () =>
      sounds.flatMap((a) => {
        const v = coverVersion(state, a.id);
        return v ? [v.mediaPath] : [];
      }),
    [state, sounds],
  );
  const urls = useImageUrls(open ? paths : []).data ?? {};

  // Replikker i scenen (dialog), med karakteren foran
  const lines = useMemo(() => {
    if (!clip) return [];
    const blocks = blocksOfVariant(state, clip.variantId);
    const out: { id: string; label: string }[] = [];
    let speaker = "";
    for (const b of blocks) {
      if (b.kind === "character") speaker = b.text.trim();
      else if (b.kind === "dialogue")
        out.push({ id: b.id, label: `${speaker ? speaker + ": " : ""}${b.text.slice(0, 80)}` });
    }
    return out;
  }, [state, clip]);

  async function add(fromAsset: string | null, file: File | null) {
    if (!clip) return;
    setBusy(true);
    setError(null);
    try {
      let id = fromAsset;
      let durationMs: number | null = null;
      let name = "";
      if (file) {
        name = nameFromFile(file);
        const made = await createSoundAsset(cmds, projectId, file, name);
        id = made.assetId;
        durationMs = made.durationMs;
      } else if (id) {
        name = state.assets[id]?.name ?? "";
        durationMs = coverVersion(state, id)?.durationMs ?? null;
      }
      if (!id) return;
      const clipId = newId<"audio_clip">();
      const r = await cmds.runAndWait(
        {
          type: "AddAudioClips",
          clips: [
            {
              clipId: clipId as never,
              fields: {
                occurrenceId: clip.occurrenceId,
                kind,
                name,
                assetId: id as never,
                assetVariantId: null,
                versionId: null,
                blockId: (blockId || null) as never,
                offsetMs: Math.max(0, Math.round(offsetMs)),
                sourceInMs: 0,
                lengthMs: Math.max(1, durationMs ?? 5000),
                gainDb: 0,
                fadeInMs: 0,
                fadeOutMs: 0,
                muted: false,
              },
            },
          ],
        },
        `Legg til ${AUDIO_KIND_LABEL[kind].toLocaleLowerCase("nb")}`,
      );
      if (r.error) throw new Error(r.error);
      onAdded(clipId);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const legend = "mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
  const select =
    "h-8 min-w-0 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[86vh] max-w-[640px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Legg til lyd</DialogTitle>
          <DialogDescription>
            {clip
              ? `I scene ${clip.productionNumber ?? ""} ${formatHeading(clip.heading)}, ${formatSeconds(
                  offsetMs / 1000,
                )} ut i scenen. Lyden følger scenen hvis den flyttes.`
              : "Velg en scene i tidslinjen først."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>Spor</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AudioKind)}
              className={select}
            >
              {AUDIO_TRACK_ORDER.map((k) => (
                <option key={k} value={k}>
                  {AUDIO_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>Replikk (valgfritt)</span>
            <select
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
              disabled={lines.length === 0}
              className={select}
            >
              <option value="">{lines.length ? "Ingen" : "Ingen replikker i scenen"}</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section aria-label="Fra biblioteket" className="flex flex-col gap-2">
          <h3 className={legend}>Fra biblioteket</h3>
          {sounds.length === 0 ? (
            <p className="text-xs text-text-tertiary">Ingen lydfiler i biblioteket ennå.</p>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søk etter lyd …"
                aria-label="Søk etter lyd"
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
              />
              <ul
                role="listbox"
                aria-label="Lydfiler"
                className="flex max-h-[240px] flex-col overflow-y-auto"
              >
                {shown.map((a) => {
                  const v = coverVersion(state, a.id);
                  const on = assetId === a.id;
                  return (
                    <li
                      key={a.id}
                      role="option"
                      aria-selected={on}
                      onClick={() => setAssetId(a.id)}
                      onDoubleClick={() => void add(a.id, null)}
                      className={
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-[13px] " +
                        (on
                          ? "bg-accent-selection text-text-primary"
                          : "text-text-secondary hover:bg-surface-3")
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="font-mono text-[11px] text-text-tertiary">
                        {v?.durationMs ? formatSeconds(v.durationMs / 1000) : "–"}
                      </span>
                      {v && urls[v.mediaPath] ? (
                        <audio
                          src={urls[v.mediaPath]}
                          controls
                          preload="none"
                          className="h-6 w-[150px]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section
          aria-label="Ny lydfil"
          className="flex flex-col gap-1.5 border-t border-border pt-3"
        >
          <h3 className={legend}>Ny lydfil</h3>
          <p className="text-xs text-text-tertiary">
            MP3, WAV, OGG, M4A eller FLAC. Lagres i ressursbiblioteket (type «Lyd») og legges inn
            her.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
            className="sr-only"
            aria-label="Velg lydfil"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void add(null, f);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            disabled={busy || !clip}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? "Laster opp …" : "Last opp lydfil …"}
          </Button>
        </section>

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Avbryt
          </Button>
          <Button onClick={() => void add(assetId, null)} disabled={busy || !assetId || !clip}>
            Legg til
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
