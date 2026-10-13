/**
 * Stor visning av et bilde (Mars 2026-10-13, DEC-0079): klikk på et bilde i bildevalget for å se det stort,
 * zoome og flytte rundt i det. Beskrivelsen (prompten) som laget bildet vises ved siden av – den følger bildet
 * og slettes aldri – med «Sett inn denne beskrivelsen», så den kan brukes igjen og justeres.
 */
import { Copy, Maximize2, Minus, Plus, TextQuote } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  jobForResult,
  jobFromRow,
  formatJobTime,
  stripAttachedSection,
  type AssetVersion,
} from "@/core";
import { fetchJobForResult } from "@/adapters/browser/ai";
import { useAiJobs } from "@/app/ai/use-ai-jobs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Beskrivelsen som laget filen (fra AI-jobbloggen), eller null når bildet ikke er laget med AI. */
export function useImagePrompt(projectId: string, path: string | null) {
  const jobs = useAiJobs(projectId, !!path);
  const recent = useMemo(
    () => (path ? jobForResult(jobs.data?.jobs ?? [], path) : null),
    [jobs.data, path],
  );
  const older = useQuery({
    queryKey: ["ai-job-for-result", projectId, path],
    enabled: !!path && jobs.isSuccess && !recent,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetchJobForResult(projectId, path!);
      return r.data ? jobFromRow(r.data) : null;
    },
  });
  const job = recent ?? older.data ?? null;
  return {
    loading: jobs.isLoading || older.isFetching,
    prompt: job && job.prompt.trim() ? job.prompt : null,
    model: job ? `${job.provider}/${job.model}` : null,
    when: job ? formatJobTime(job.createdAt) : null,
  };
}

const MIN = 0.05;
const MAX = 16;

export function ImageLightbox({
  open,
  onOpenChange,
  projectId,
  version,
  url,
  title,
  onInsertPrompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  version: AssetVersion | null;
  url: string | undefined;
  title: string;
  /** «Sett inn denne beskrivelsen» i genereringsfeltet (utelatt: knappen vises ikke). */
  onInsertPrompt?: (prompt: string) => void;
}) {
  const info = useImagePrompt(projectId, open && version ? version.mediaPath : null);
  const box = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<{ z: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setView(null);
    setCopied(false);
  }, [version?.id, open]);

  // Tilpass: hele bildet synlig i boksen
  function fit() {
    const el = box.current;
    if (!el || !version?.width || !version.height) return { z: 1, x: 0, y: 0 };
    const z = Math.min(el.clientWidth / version.width, el.clientHeight / version.height, 1);
    return {
      z,
      x: (el.clientWidth - version.width * z) / 2,
      y: (el.clientHeight - version.height * z) / 2,
    };
  }
  const v = view ?? fit();
  function zoomAt(z: number, at?: { x: number; y: number }) {
    const el = box.current;
    const p = at ?? { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 };
    const nz = Math.min(MAX, Math.max(MIN, z));
    const k = nz / v.z;
    setView({ z: nz, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(900px,calc(100vh-48px))] max-w-[min(1400px,calc(100vw-32px))] flex-col border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {version?.width && version.height ? `${version.width} × ${version.height} px. ` : ""}
            Rullehjul eller knappene zoomer, dra for å flytte rundt.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => zoomAt(v.z / 1.5)}
                aria-label="Zoom ut"
              >
                <Minus />
              </Button>
              <span className="w-14 text-center font-mono text-xs tabular-nums text-text-secondary">
                {Math.round(v.z * 100)} %
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => zoomAt(v.z * 1.5)}
                aria-label="Zoom inn"
              >
                <Plus />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setView(null)}>
                <Maximize2 /> Tilpass
              </Button>
              <Button size="sm" variant="ghost" onClick={() => zoomAt(1)}>
                100 %
              </Button>
            </div>
            <div
              ref={box}
              className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden rounded-sm bg-[repeating-conic-gradient(var(--surface-3)_0%_25%,var(--surface-1)_0%_50%)] bg-[length:24px_24px] active:cursor-grabbing"
              onWheel={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                zoomAt(v.z * Math.exp(-e.deltaY * 0.0015), {
                  x: e.clientX - r.left,
                  y: e.clientY - r.top,
                });
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setView({ z: v.z, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
            >
              {url ? (
                <img
                  src={url}
                  alt={title}
                  draggable={false}
                  className="absolute left-0 top-0 max-w-none select-none"
                  style={{
                    transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})`,
                    transformOrigin: "0 0",
                    width: version?.width ?? undefined,
                    height: version?.height ?? undefined,
                  }}
                />
              ) : (
                <p className="absolute inset-0 flex items-center justify-center text-xs text-text-tertiary">
                  Henter bildet …
                </p>
              )}
            </div>
          </div>
          <aside
            aria-label="Beskrivelsen som laget bildet"
            className="flex w-[340px] shrink-0 flex-col gap-2 overflow-y-auto rounded-sm border border-border bg-surface-1 p-2"
          >
            <h3 className="flex items-center gap-1 text-[13px] font-medium text-text-primary">
              <TextQuote className="size-4" aria-hidden /> Beskrivelse (prompt)
            </h3>
            {info.loading ? (
              <p className="text-xs text-text-tertiary">Henter …</p>
            ) : info.prompt ? (
              <>
                <p className="text-[11px] text-text-tertiary">
                  {info.model} · {info.when}
                </p>
                <pre className="whitespace-pre-wrap break-words rounded-sm bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary">
                  {stripAttachedSection(info.prompt)}
                </pre>
                <div className="flex flex-wrap gap-1.5">
                  {onInsertPrompt ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        onInsertPrompt(info.prompt!);
                        onOpenChange(false);
                      }}
                    >
                      <TextQuote /> Sett inn denne beskrivelsen
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(stripAttachedSection(info.prompt!))
                        .then(() => setCopied(true));
                    }}
                  >
                    <Copy /> {copied ? "Kopiert" : "Kopier"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-text-tertiary">
                Bildet er ikke laget med AI (lastet opp eller tegnet), så det har ingen beskrivelse.
                {version?.note ? ` Merknad: ${version.note}` : ""}
              </p>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
