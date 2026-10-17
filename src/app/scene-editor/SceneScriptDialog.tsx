/**
 * Redigering av manuset for scenen i et eget vindu fra sceneeditoren (DEC-0089, Mars 16.10.2026: «… mulig å ta
 * opp i en popup og endre slik en ønsker, med alle nødvendige editeringsmuligheter … Vi viser kun denne
 * scenen, men vi kan la brukeren få lov til å lese forrige og neste scene»). Samme lesevisning og inspektør
 * som på Manus-siden: klikk en linje for å endre tekst, elementtype, notater, nye/fjernede blokker og
 * sceneoverskrift. Forrige og neste scene kan vises over og under, bare til lesing.
 */
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  L,
  filterPages,
  formatHeading,
  orderedOccurrences,
  sceneNumberOf,
  scriptPages,
  type ProjectState,
} from "@/core";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Inspector } from "@/app/script/Inspector";
import { ScriptPageView, type Selection } from "@/app/script/ScriptPageView";
import type { Commands } from "@/app/project/use-commands";

const PAGE_PX = 51 * 16; // sidebredde ved 100 %
const NOOP = () => undefined;
const NO_SELECTION: Selection = { occurrenceId: null, blockId: null };

export function SceneScriptDialog({
  open,
  onOpenChange,
  state,
  projectId,
  productionId,
  occurrenceId,
  initialBlockId,
  editable,
  cmds,
  authorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  productionId: string;
  occurrenceId: string;
  initialBlockId: string | null;
  editable: boolean;
  cmds: Commands;
  authorName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[88vh] max-h-[88vh] w-[min(1240px,calc(100vw-48px))] max-w-[min(1240px,calc(100vw-48px))] flex-col gap-0 overflow-hidden border-border bg-surface-2 p-0"
        data-testid="scene-script-dialog"
      >
        {open ? (
          <Body
            key={occurrenceId}
            state={state}
            projectId={projectId}
            productionId={productionId}
            occurrenceId={occurrenceId}
            initialBlockId={initialBlockId}
            editable={editable}
            cmds={cmds}
            authorName={authorName}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  state,
  projectId,
  productionId,
  occurrenceId: startOcc,
  initialBlockId,
  editable,
  cmds,
  authorName,
}: Omit<Parameters<typeof SceneScriptDialog>[0], "open" | "onOpenChange">) {
  const [occurrenceId, setOccurrenceId] = useState(startOcc);
  const [selection, setSelection] = useState<Selection>({
    occurrenceId: startOcc,
    blockId: initialBlockId,
  });
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setZoom(Math.max(0.5, Math.min(1.2, (el.clientWidth - 48) / PAGE_PX))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Linjen som var dobbeltklikket: rett i tekstfeltet
  useEffect(() => {
    if (initialBlockId) setTimeout(() => textRef.current?.focus(), 60);
  }, [initialBlockId]);

  const pagination = useMemo(
    () => scriptPages(state, productionId, { lockedPages: true }),
    [state, productionId],
  );
  const active = useMemo(
    () => orderedOccurrences(state, productionId).filter((o) => o.active),
    [state, productionId],
  );
  const at = active.findIndex((o) => o.id === occurrenceId);
  const prev = at > 0 ? active[at - 1]! : null;
  const next = at >= 0 && at < active.length - 1 ? active[at + 1]! : null;
  const pagesOf = (id: string) => filterPages(pagination.pages, new Set([id]));
  const occ = state.occurrences[occurrenceId];
  const variant = occ ? state.variants[occ.variantId] : undefined;
  const number = occ ? sceneNumberOf(state, occ) : null;
  const title = variant
    ? `${number ? `${L("Scene", "Scene")} ${number} · ` : ""}${formatHeading(variant.heading)}`
    : L("Manus", "Script");

  function select(s: Selection) {
    // Bare scenen som redigeres (forrige og neste er til lesing); en ny scene fra «Del scenen» følges
    if (s.occurrenceId && s.occurrenceId !== occurrenceId) setOccurrenceId(s.occurrenceId);
    setSelection(s);
  }
  function activate(s: Selection) {
    select(s);
    setTimeout(() => textRef.current?.focus(), 30);
  }

  const neighbour = (o: typeof prev, label: string, testId: string) =>
    o ? (
      <div
        className="pointer-events-none opacity-55"
        data-testid={testId}
        aria-label={label}
        role="region"
      >
        <p className="px-6 pt-3 font-sans text-[11px] uppercase tracking-[0.04em] text-text-tertiary">
          {label}
        </p>
        <ScriptPageView
          pages={pagesOf(o.id)}
          state={state}
          selection={NO_SELECTION}
          zoom={zoom}
          onSelect={NOOP}
          onActivate={NOOP}
          flow={{ light: false }}
        />
      </div>
    ) : null;

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4 pr-12">
        <DialogTitle className="min-w-0 truncate text-[13px] font-medium text-text-primary">
          {title}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {L(
            "Manuset for scenen. Klikk en linje for å redigere den i panelet til høyre.",
            "The script for the scene. Click a line to edit it in the panel on the right.",
          )}
        </DialogDescription>
        <div className="ml-auto flex items-center gap-3 text-xs text-text-secondary">
          <label
            className="flex items-center gap-1.5"
            title={prev ? undefined : L("Ingen scene før", "No scene before")}
          >
            <input
              type="checkbox"
              checked={showPrev}
              disabled={!prev}
              onChange={(e) => setShowPrev(e.target.checked)}
              data-testid="scene-script-show-prev"
            />
            {L("Vis forrige scene", "Show previous scene")}
          </label>
          <label
            className="flex items-center gap-1.5"
            title={next ? undefined : L("Ingen scene etter", "No scene after")}
          >
            <input
              type="checkbox"
              checked={showNext}
              disabled={!next}
              onChange={(e) => setShowNext(e.target.checked)}
              data-testid="scene-script-show-next"
            />
            {L("Vis neste scene", "Show next scene")}
          </label>
          <span className="h-5 w-px bg-border" aria-hidden />
          <Button
            size="sm"
            variant="ghost"
            onClick={cmds.undo}
            disabled={!editable}
            aria-label={L("Angre", "Undo")}
            title={L("Angre (⌘/Ctrl + Z)", "Undo (⌘/Ctrl + Z)")}
          >
            <Undo2 />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={cmds.redo}
            disabled={!editable}
            aria-label={L("Gjør om", "Redo")}
            title={L("Gjør om (Shift + ⌘/Ctrl + Z)", "Redo (Shift + ⌘/Ctrl + Z)")}
          >
            <Redo2 />
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
        <div ref={scrollRef} className="min-h-0 overflow-auto bg-bg-app">
          {showPrev
            ? neighbour(
                prev,
                L("Forrige scene – bare lesing", "Previous scene – read only"),
                "scene-script-prev",
              )
            : null}
          <div
            data-testid="scene-script-current"
            className={showPrev || showNext ? "border-y border-accent-brand/40" : ""}
          >
            {at < 0 ? (
              <p className="px-6 pt-6 text-[13px] text-text-secondary">
                {L(
                  "Scenen er deaktivert og står ikke på manussidene. Slå den på i manuset for å se teksten her.",
                  "The scene is deactivated and is not on the script pages. Turn it on in the script to see the text here.",
                )}
              </p>
            ) : (
              <ScriptPageView
                pages={pagesOf(occurrenceId)}
                state={state}
                selection={selection}
                zoom={zoom}
                onSelect={select}
                onActivate={activate}
                flow={{ light: false }}
              />
            )}
          </div>
          {showNext
            ? neighbour(
                next,
                L("Neste scene – bare lesing", "Next scene – read only"),
                "scene-script-next",
              )
            : null}
        </div>
        <div className="flex min-h-0 flex-col border-l border-border bg-surface-1">
          <Inspector
            projectId={projectId}
            state={state}
            productionId={productionId}
            selection={selection}
            editable={editable}
            startPages={pagination.sceneStartPage}
            textRef={textRef}
            run={cmds.run}
            onSelect={select}
            onNextUncertain={NOOP}
            uncertainCount={0}
            structureEditing={false}
            authorName={authorName}
            focusNote={null}
            language="nb"
            cmds={cmds}
          />
        </div>
      </div>
    </>
  );
}
