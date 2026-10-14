/**
 * Legg til lyd i filmen (M4 del 2, DEC-0044): velg en lydfil fra biblioteket eller last opp en ny, velg
 * lydtype og eventuelt replikken den hører til. Lyden legges ved avspillingshodet og festes til scenen der.
 */
import { Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIO_KIND_LABEL,
  FILM_LANGUAGES,
  LANGUAGE_LABEL,
  MAIN_LANGUAGE,
  isVoiceKind,
  AUDIO_TRACK_ORDER,
  blocksOfVariant,
  coverVersion,
  formatHeading,
  newId,
  sortedAssets,
  L,
  collation,
  type AudioKind,
  type FilmClip,
  type ProjectState,
  languageWord,
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
  language = "nb",
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
  /** Dialogspråket i monteringen (DEC-0059): ny dialog i et annet språk hører til det språket. */
  language?: string;
}) {
  const [kind, setKind] = useState<AudioKind>(initialKind);
  /** Språket (DEC-0059): "" = standard for lydtypen, «*» = felles, ellers språkkode. */
  const [lang, setLang] = useState("");
  /** Brukeren har valgt språk selv: endres ikke når sporet byttes. */
  const [langTouched, setLangTouched] = useState(false);
  const defaultLang = (k: AudioKind) =>
    language !== MAIN_LANGUAGE && isVoiceKind(k) ? language : "";
  const [assetId, setAssetId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setLang(defaultLang(initialKind));
    setLangTouched(false);
    setAssetId(null);
    setBlockId("");
    setError(null);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKind]);

  const sounds = useMemo(() => sortedAssets(state, "sound").filter((a) => !a.archived), [state]);
  const shown = sounds.filter((a) =>
    a.name.toLocaleLowerCase(collation()).includes(query.trim().toLocaleLowerCase(collation())),
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
                // Atmosfære og musikk løper som regel videre over scenene
                continues: kind === "music",
                volumeKeys: [],
                ...(lang ? { language: lang } : {}),
              },
            },
          ],
        },
        L(
          `Legg til ${AUDIO_KIND_LABEL[kind].toLocaleLowerCase(collation())}`,
          `Add ${AUDIO_KIND_LABEL[kind].toLocaleLowerCase(collation())}`,
        ),
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
          <DialogTitle>{L("Legg til lyd", "Add audio")}</DialogTitle>
          <DialogDescription>
            {clip
              ? L(
                  `I scene ${clip.productionNumber ?? ""} ${formatHeading(clip.heading)}, ${formatSeconds(
                    offsetMs / 1000,
                  )} ut i scenen. Lyden følger scenen hvis den flyttes.`,
                  `In scene ${clip.productionNumber ?? ""} ${formatHeading(clip.heading)}, ${formatSeconds(
                    offsetMs / 1000,
                  )} into the scene. The audio follows the scene if it is moved.`,
                )
              : L("Velg en scene i tidslinjen først.", "Choose a scene in the timeline first.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>{L("Spor", "Track")}</span>
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as AudioKind;
                setKind(k);
                if (!langTouched) setLang(defaultLang(k));
              }}
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
            <span className={legend}>{L("Replikk (valgfritt)", "Line (optional)")}</span>
            <select
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
              disabled={lines.length === 0}
              className={select}
            >
              <option value="">
                {lines.length
                  ? L("Ingen", "None")
                  : L("Ingen replikker i scenen", "No lines in the scene")}
              </option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span className={legend}>{L("Språk", "Language")}</span>
            <select
              aria-label={L("Språk", "Language")}
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                setLangTouched(true);
              }}
              className={select}
            >
              <option value="">
                {L("Standard", "Default")} (
                {isVoiceKind(kind) ? LANGUAGE_LABEL[MAIN_LANGUAGE] : L("felles", "shared")})
              </option>
              <option value="*">{L("Felles for alle språk", "Shared for all languages")}</option>
              {FILM_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {L("Bare", "Only")} {languageWord(l)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section
          aria-label={L("Fra biblioteket", "From the library")}
          className="flex flex-col gap-2"
        >
          <h3 className={legend}>{L("Fra biblioteket", "From the library")}</h3>
          {sounds.length === 0 ? (
            <p className="text-xs text-text-tertiary">
              {L("Ingen lydfiler i biblioteket ennå.", "No audio files in the library yet.")}
            </p>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={L("Søk etter lyd …", "Search for audio …")}
                aria-label={L("Søk etter lyd", "Search for audio")}
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
              />
              <ul
                role="listbox"
                aria-label={L("Lydfiler", "Audio files")}
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
          aria-label={L("Ny lydfil", "New audio file")}
          className="flex flex-col gap-1.5 border-t border-border pt-3"
        >
          <h3 className={legend}>{L("Ny lydfil", "New audio file")}</h3>
          <p className="text-xs text-text-tertiary">
            {L(
              "MP3, WAV, OGG, M4A eller FLAC. Lagres i ressursbiblioteket (type «Lyd») og legges inn her.",
              "MP3, WAV, OGG, M4A or FLAC. Saved in the asset library (type “Audio”) and added here.",
            )}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
            className="sr-only"
            aria-label={L("Velg lydfil", "Choose audio file")}
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
            {busy
              ? L("Laster opp …", "Uploading …")
              : L("Last opp lydfil …", "Upload audio file …")}
          </Button>
        </section>

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {L("Avbryt", "Cancel")}
          </Button>
          <Button onClick={() => void add(assetId, null)} disabled={busy || !assetId || !clip}>
            {L("Legg til", "Add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
