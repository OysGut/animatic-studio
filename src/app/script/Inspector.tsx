/**
 * Inspektør for manus: korriger tolkning (mandat 4.3), rediger tekst og overskrift, del og slå sammen scener (4.4).
 * Alle endringer er kommandoer som kan angres (ADR-0005).
 */
import { TranslationPanel } from "./TranslationPanel";
import { ScriptChanges, useSceneDiscrepancies } from "@/app/assembly/ScriptChanges";
import {
  AlertTriangle,
  Check,
  Clapperboard,
  CopyPlus,
  Drama,
  Eye,
  GitMerge,
  Layers,
  Plus,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  annotationsOfVariant,
  blocksOfVariant,
  compareKeys,
  formatHeading,
  keyBetween,
  isSharedIn,
  newId,
  ownCopyCommands,
  orderedOccurrences,
  sceneNumberOf,
  type BlockKind,
  type Command,
  type ProjectState,
  type SceneHeading,
  L,
  tm,
  lineAudioStatus,
  lineInfo,
  lineLabel,
} from "@/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KIND_LABEL } from "./script-helpers";
import { NotesPanel } from "./NotesPanel";
import { BlockLinksSection } from "./BlockLinksSection";
import { StoryTimeSection } from "./StoryTimeSection";
import type { Selection } from "./ScriptPageView";
import type { Commands } from "@/app/project/use-commands";
import { LineStatusBadge, TakesMicButton } from "@/app/audio/AudioTakesDialog";
import { useStorySuggestions } from "@/app/storylab/suggestions-data";

const EDITABLE_KINDS: BlockKind[] = [
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
  "note",
];
const INT_EXT = ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "I/E."];

interface Props {
  readonly projectId: string;
  readonly state: ProjectState;
  readonly productionId: string;
  readonly selection: Selection;
  readonly editable: boolean;
  readonly startPages: Readonly<Record<string, number>>;
  readonly textRef: RefObject<HTMLTextAreaElement | null>;
  readonly run: (command: Command, label: string, group?: string) => string | null;
  readonly onSelect: (sel: Selection) => void;
  readonly onNextUncertain: () => void;
  readonly uncertainCount: number;
  /** Rekkefølge og synlighet kan bare endres i redigeringsmodus (REQ-0532). */
  readonly structureEditing: boolean;
  /** Navnet nye notater stemples med (DEC-0031). */
  readonly authorName: string;
  /** Notat som skal fremheves (klikket i margen). */
  readonly focusNote: string | null;
  /** Manusspråket i visningen (DEC-0058). Annet enn «nb»: inspektøren viser oversettelsen. */
  readonly language?: string;
  /** Kommandoene (for lydopptak av replikken, DEC-0093). Uten: ingen mikrofon. */
  readonly cmds?: Commands;
}

export function Inspector(props: Props) {
  const { state, selection } = props;
  const block = selection.blockId ? state.blocks[selection.blockId] : undefined;
  const occ = selection.occurrenceId ? state.occurrences[selection.occurrenceId] : undefined;
  const suggestions = useStorySuggestions(props.projectId);
  const openCount = occ ? suggestions.data?.filter((s) => s.status === "open" && s.payload["sceneId"] === occ.sceneId).length ?? 0 : 0;
  return (
    <aside aria-label={L("Inspektør", "Inspector")} className="flex min-h-0 flex-col">
      <div className="flex h-8 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
        <span className="shrink-0">
          {block
            ? L("Manusblokk", "Script block")
            : occ
              ? L("Scene", "Scene")
              : L("Manus", "Script")}
        </span>
        {occ && occ.active && state.productions[occ.productionId]?.kind === "main" ? (
          <Link
            to="/prosjekt/$projectId/montering"
            params={{ projectId: props.projectId }}
            search={{ scene: occ.id, ...(block ? { blokk: block.id } : {}) }}
            className="ml-auto flex min-w-0 items-center gap-1 rounded-sm px-1 normal-case tracking-normal text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={
              block
                ? L(
                    "Åpne monteringen med avspillingshodet der denne replikken eller handlingen er i filmen",
                    "Open the assembly with the playhead where this line or action is in the film",
                  )
                : L(
                    "Åpne monteringen med avspillingshodet ved starten av scenen",
                    "Open the assembly with the playhead at the start of the scene",
                  )
            }
          >
            <Clapperboard className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{L("Vis i filmen", "Show in film")}</span>
          </Link>
        ) : null}
        {occ && occ.active ? (
          <Link
            to="/prosjekt/$projectId/scene"
            params={{ projectId: props.projectId }}
            search={{ scene: occ.id }}
            className={
              (state.productions[occ.productionId]?.kind === "main" ? "" : "ml-auto ") +
              "flex min-w-0 items-center gap-1 rounded-sm px-1 normal-case tracking-normal text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            }
            title={L(
              "Åpne denne scenen i sceneeditoren (2D-animatic)",
              "Open this scene in the scene editor (2D animatic)",
            )}
          >
            <Layers className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{L("Sceneeditor", "Scene editor")}</span>
          </Link>
        ) : null}
        {occ && !block ? (
          <Link
            to="/prosjekt/$projectId/storylab"
            params={{ projectId: props.projectId }}
            search={{ scene: occ.sceneId }}
            data-testid="inspector-storylab"
            className="flex min-w-0 items-center gap-1 rounded-sm px-1 normal-case tracking-normal text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={L(
              "Undersøk scenen i Story Lab (velges som tidspunkt i fortellingen)",
              "Explore the scene in Story Lab (chosen as the point in the story)",
            )}
          >
            <Drama className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{L("Undersøk scene i Story Lab", "Explore scene in Story Lab")}</span>
          </Link>
        ) : null}
        {/* Mikrofonikonet for en replikk (DEC-0093): opptak på datamaskinen og mobilen */}
        {block?.kind === "dialogue" && occ && props.editable && props.cmds ? (
          <TakesMicButton
            className="ml-auto shrink-0 normal-case"
            projectId={props.projectId}
            state={state}
            cmds={props.cmds}
            target={{ kind: "line", occurrenceId: occ.id, blockId: block.id }}
            label={lineLabel(lineInfo(state, occ.id, block.id))}
          />
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {occ && openCount > 0 ? <Link to="/prosjekt/$projectId/storylab" params={{ projectId: props.projectId }} search={{ scene: occ.sceneId, forslag: "open" }} data-testid="script-storylab-suggestions" className="mb-2 block text-xs text-accent-brand">{L(`${openCount} forslag fra Story Lab`, `${openCount} suggestions from Story Lab`)}</Link> : null}
        {occ ? <SceneChanges {...props} occurrenceId={occ.id} /> : null}
        {/* Tekst mot lyd for replikken (DEC-0095, REQ-0703) – påvirker ikke manuseksporten */}
        {block?.kind === "dialogue" && occ ? (
          <div className="mb-2">
            <LineStatusBadge status={lineAudioStatus(state, occ.id, block.id)} />
          </div>
        ) : null}
        {props.language && props.language !== "nb" && occ ? (
          <TranslationPanel
            key={`${block?.id ?? occ.variantId}:${props.language}`}
            state={state}
            language={props.language}
            blockId={block?.id ?? null}
            variantId={block ? null : occ.variantId}
            editable={props.editable}
            run={props.run}
          />
        ) : block && occ ? (
          <BlockPanel {...props} key={block.id} />
        ) : occ ? (
          <ScenePanel {...props} key={occ.id} />
        ) : (
          <SummaryPanel {...props} />
        )}
      </div>
    </aside>
  );
}

/** Avvik ved manusendring for scenen (DEC-0054): vises øverst i inspektøren. */
function SceneChanges(props: Props & { occurrenceId: string }) {
  const found = useSceneDiscrepancies(props.state, props.occurrenceId);
  if (found.length === 0) return null;
  return (
    <div className="mb-4">
      <ScriptChanges
        state={props.state}
        projectId={props.projectId}
        occurrenceId={props.occurrenceId}
        found={found}
        editable={props.editable}
        run={props.run}
      />
    </div>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      {title ? (
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-2 text-xs text-status-danger">
      {message}
    </p>
  ) : null;
}

function UncertainBox({
  text,
  onApprove,
  editable,
}: {
  text: string;
  onApprove: () => void;
  editable: boolean;
}) {
  return (
    <div className="mb-4 border border-status-uncertain/40 bg-status-uncertain-bg p-2.5 text-xs text-text-primary">
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-px size-3.5 shrink-0 text-status-uncertain" aria-hidden />
        <span>
          <span className="font-medium">
            {L("Usikker tolkning: ", "Uncertain interpretation: ")}
          </span>
          {text}
        </span>
      </p>
      {editable ? (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onApprove}>
          <Check />
          {L("Tolkningen er riktig", "The interpretation is correct")}
        </Button>
      ) : null}
    </div>
  );
}

/** Varianten deles med hovedfilmen og kan ikke endres fra en annen produksjon uten egen variant (INV-04). */
export function ForkNotice({
  state,
  productionId,
  occurrenceId,
  run,
}: {
  state: ProjectState;
  productionId: string;
  occurrenceId: string;
  run: Props["run"];
}) {
  const occ = state.occurrences[occurrenceId]!;
  const v = state.variants[occ.variantId]!;
  const prod = state.productions[productionId]!;
  const [err, setErr] = useState<string | null>(null);
  if (prod.kind === "main" || v.ownerProductionId === productionId) return null;
  return (
    <div className="mb-4 border border-border bg-surface-2 p-2.5 text-xs text-text-secondary">
      <p>
        {L(
          "Denne scenen deles med hovedfilmen. Endrer du den her, får «",
          "This scene is shared with the main film. If you change it here, “",
        )}
        {prod.name}
        {L(
          "» automatisk sin egen versjon av scenen – hovedfilmen endres ikke.",
          "” automatically gets its own version of the scene – the main film is not changed.",
        )}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          // Egen versjon av teksten og kopi av 2D-scenen (DEC-0057)
          const commands = ownCopyCommands(state, occ.id) ?? [];
          const group = newId();
          for (const c of commands) {
            const e = run(
              c,
              L("Lag egen versjon av scenen", "Make own version of the scene"),
              group,
            );
            if (e) {
              setErr(e);
              return;
            }
          }
          setErr(null);
        }}
      >
        <CopyPlus />
        {L("Lag egen versjon", "Make own version")}
      </Button>
      <ErrorText message={err} />
    </div>
  );
}

function canEditVariant(state: ProjectState, productionId: string, variantId: string): boolean {
  const v = state.variants[variantId];
  const p = state.productions[productionId];
  if (!v || !p) return false;
  // Delt med hovedfilmen i en avledet produksjon: endringen lager automatisk en egen versjon (DEC-0057)
  return v.ownerProductionId === null ? true : v.ownerProductionId === productionId;
}

function BlockPanel({
  projectId,
  state,
  productionId,
  selection,
  editable,
  startPages,
  textRef,
  run,
  onSelect,
  authorName,
  focusNote,
}: Props) {
  const block = state.blocks[selection.blockId!]!;
  const occ = state.occurrences[selection.occurrenceId!]!;
  const variantEditable = editable && canEditVariant(state, productionId, block.variantId);
  const [text, setText] = useState(block.text);
  const [err, setErr] = useState<string | null>(null);
  // Oppdater feltet når teksten endres utenfra – men aldri mens brukeren skriver i det
  useEffect(() => {
    if (document.activeElement !== textRef.current) setText(block.text);
  }, [block.text, textRef]);
  const blocks = blocksOfVariant(state, block.variantId);
  const idx = blocks.findIndex((b) => b.id === block.id);
  const pid = productionId as never;

  const cancelled = useRef(false);
  function save() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === block.text || !variantEditable) return;
    setErr(
      run(
        { type: "EditBlockText", productionId: pid, blockId: block.id, text },
        L("Rediger tekst", "Edit text"),
      ),
    );
  }

  function insertAfter() {
    // Neste plass regnes over alle blokker i scenen, også fjernede (de beholder plassen sin)
    const next = Object.values(state.blocks)
      .filter((b) => b.variantId === block.variantId && compareKeys(b.orderKey, block.orderKey) > 0)
      .sort((a, b) => compareKeys(a.orderKey, b.orderKey))[0];
    const id = newId<"script_block">();
    const kind: BlockKind =
      block.kind === "character" || block.kind === "parenthetical" ? "dialogue" : "action";
    const e = run(
      {
        type: "InsertBlock",
        productionId: pid,
        variantId: block.variantId,
        block: {
          blockId: id,
          kind,
          text: "",
          orderKey: keyBetween(block.orderKey, next?.orderKey ?? null),
        },
      },
      L("Ny blokk", "New block"),
    );
    setErr(e);
    if (!e) {
      onSelect({ occurrenceId: occ.id, blockId: id });
      setTimeout(() => textRef.current?.focus(), 30);
    }
  }

  function split() {
    const v = state.variants[block.variantId]!;
    const map: Record<string, never> = {};
    for (const o of Object.values(state.occurrences))
      if (o.variantId === v.id) map[o.id] = newId() as never;
    setErr(
      run(
        {
          type: "SplitScene",
          productionId: pid,
          occurrenceId: occ.id,
          atBlockId: block.id,
          newSceneId: newId(),
          newVariantId: newId(),
          newOccurrenceIds: map,
          heading: v.heading,
        },
        L("Del scene", "Split scene"),
      ),
    );
  }

  return (
    <>
      <p className="mb-3 text-xs text-text-tertiary">
        {L("Scene", "Scene")} {sceneNumberOf(state, occ) ?? L("uten nummer", "unnumbered")} ·{" "}
        {L("side", "page")} {startPages[occ.id] ?? "–"}
        {block.sourceRef ? (
          <>
            {" "}
            · {L("side", "page")} {block.sourceRef.page} {L("i originalen", "in the original")}
          </>
        ) : null}
      </p>
      <ForkNotice state={state} productionId={productionId} occurrenceId={occ.id} run={run} />
      {block.uncertainty ? (
        <UncertainBox
          text={tm(block.uncertainty)}
          editable={variantEditable}
          onApprove={() =>
            setErr(
              run(
                {
                  type: "SetUncertainty",
                  productionId: pid,
                  targetId: block.id,
                  uncertainty: null,
                },
                L("Godkjenn tolkning", "Approve interpretation"),
              ),
            )
          }
        />
      ) : null}
      <Section title={L("Elementtype", "Element type")}>
        <select
          aria-label={L("Elementtype", "Element type")}
          value={block.kind}
          disabled={!variantEditable}
          onChange={(e) =>
            setErr(
              run(
                {
                  type: "SetBlockKind",
                  productionId: pid,
                  blockId: block.id,
                  kind: e.target.value as BlockKind,
                },
                L("Endre elementtype", "Change element type"),
              ),
            )
          }
          className="h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-60"
        >
          {EDITABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Section>
      <Section title={L("Tekst", "Text")}>
        <textarea
          ref={textRef}
          aria-label={L("Tekst", "Text")}
          value={text}
          readOnly={!variantEditable}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              cancelled.current = true;
              setText(block.text);
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          rows={Math.min(14, Math.max(3, Math.ceil(text.length / 34) + text.split("\n").length))}
          className={
            "w-full resize-y rounded-sm border border-border-control bg-surface-3 p-2 font-script text-[13px] leading-snug text-text-primary " +
            (block.kind === "character" || block.kind === "transition" ? "uppercase" : "")
          }
        />
        <p className="mt-1 text-[11px] text-text-tertiary">
          {L(
            "Lagres når du går ut av feltet (eller ⌘/Ctrl + Enter). Esc angrer.",
            "Saved when you leave the field (or ⌘/Ctrl + Enter). Esc undoes.",
          )}
        </p>
      </Section>
      {block.kind === "dialogue" || block.kind === "action" ? (
        <Section title={L("Koblinger", "Links")}>
          <BlockLinksSection
            state={state}
            projectId={projectId}
            productionId={productionId}
            blockId={block.id}
            occurrenceId={occ.id}
          />
        </Section>
      ) : null}
      <Section title={L("Notater", "Notes")}>
        <NotesPanel
          state={state}
          notes={annotationsOfVariant(state, block.variantId).filter((a) => a.blockId === block.id)}
          editable={editable}
          run={run}
          focusId={focusNote}
          authorName={authorName}
          newTarget={{ blockId: block.id, variantId: null, start: 0, end: 0, quote: "" }}
          newLabel={L("Notat på hele elementet", "Note on the whole element")}
        />
        <p className="mt-1 text-[11px] text-text-tertiary">
          {L(
            "Notat på enkeltord: merk teksten i manuset og velg «Legg til notat».",
            "Note on single words: select the text in the script and choose “Add note”.",
          )}
        </p>
      </Section>
      {variantEditable ? (
        <Section title={L("Handlinger", "Actions")}>
          <div className="flex flex-col items-stretch gap-1.5">
            <Button size="sm" variant="secondary" onClick={insertAfter} className="justify-start">
              <Plus />
              {L("Ny blokk etter denne", "New block after this")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={split}
              disabled={idx <= 0}
              className="justify-start"
              title={
                idx <= 0
                  ? L("Kan ikke dele ved første blokk", "Cannot split at the first block")
                  : undefined
              }
            >
              <Scissors />
              {L("Del scenen her", "Split the scene here")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                const e = run(
                  { type: "RemoveBlock", productionId: pid, blockId: block.id },
                  L("Fjern blokk", "Remove block"),
                );
                setErr(e);
                if (!e)
                  onSelect({
                    occurrenceId: occ.id,
                    blockId: blocks[idx + 1]?.id ?? blocks[idx - 1]?.id ?? null,
                  });
              }}
            >
              <Trash2 />
              {L("Fjern blokken", "Remove the block")}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            {L(
              "Fjernet tekst kan hentes tilbake fra scenen. Historikken beholdes.",
              "Removed text can be restored to the scene. The history is kept.",
            )}
          </p>
        </Section>
      ) : null}
      <ErrorText message={err} />
    </>
  );
}

function ScenePanel({
  state,
  productionId,
  selection,
  editable,
  startPages,
  run,
  onSelect,
  structureEditing,
  authorName,
  focusNote,
}: Props) {
  const occ = state.occurrences[selection.occurrenceId!]!;
  const v = state.variants[occ.variantId]!;
  const scene = state.scenes[occ.sceneId]!;
  const merged = scene.mergedIntoSceneId !== null;
  const variantEditable = editable && canEditVariant(state, productionId, v.id);
  const pid = productionId as never;
  const [heading, setHeading] = useState<SceneHeading>(v.heading);
  const [err, setErr] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const lastHeading = useRef(v.heading);
  useEffect(() => {
    // Ta inn endringer utenfra bare hvis brukeren ikke har ulagrede endringer i feltene
    setHeading((h) => {
      const o = lastHeading.current;
      const untouched = h.intExt === o.intExt && h.location === o.location && h.time === o.time;
      lastHeading.current = v.heading;
      return untouched ? v.heading : h;
    });
  }, [v.heading]);
  const occs = orderedOccurrences(state, productionId);
  const next = occs[occs.findIndex((o) => o.id === occ.id) + 1];
  const usedIn = Object.values(state.occurrences)
    .filter((o) => o.sceneId === occ.sceneId && o.productionId !== productionId)
    .map((o) => state.productions[o.productionId]?.name)
    .filter(Boolean);
  const removed = Object.values(state.blocks)
    .filter((b) => b.variantId === v.id && b.removed)
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
  const changed =
    heading.intExt !== v.heading.intExt ||
    heading.location !== v.heading.location ||
    heading.time !== v.heading.time;
  const nextV = next ? state.variants[next.variantId] : undefined;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">
          Scene{" "}
          {sceneNumberOf(state, occ) ?? (
            <span className="text-text-tertiary">{L("uten nummer", "unnumbered")}</span>
          )}
          {occ.active ? (
            <span className="ml-2 text-xs font-normal text-text-tertiary">
              side {startPages[occ.id] ?? "–"}
            </span>
          ) : null}
        </p>
        <label
          className="flex items-center gap-2 text-xs text-text-secondary"
          title={
            structureEditing || !editable
              ? undefined
              : L(
                  "Slå på «Endre rekkefølge og synlighet» i scenelisten for å endre",
                  "Turn on “Change order and visibility” in the scene list to change",
                )
          }
        >
          {occ.active
            ? L("Aktiv", "Active")
            : merged
              ? L("Sammenslått", "Merged")
              : L("Deaktivert", "Inactive")}
          {structureEditing ? (
            <Switch
              checked={occ.active}
              disabled={!editable || merged}
              onCheckedChange={(on) =>
                setErr(
                  run(
                    { type: "SetOccurrenceActive", occurrenceId: occ.id, active: on },
                    on
                      ? L("Aktiver scene", "Activate scene")
                      : L("Deaktiver scene", "Deactivate scene"),
                  ),
                )
              }
              aria-label={
                occ.active
                  ? L("Deaktiver scenen", "Deactivate the scene")
                  : L("Aktiver scenen", "Activate the scene")
              }
            />
          ) : null}
        </label>
      </div>
      {!occ.active && !merged ? (
        <p className="mb-3 text-xs text-text-tertiary">
          {L(
            "Deaktiverte scener er utelatt fra manus og film i denne produksjonen. Ingenting er slettet.",
            "Inactive scenes are left out of the script and film in this production. Nothing is deleted.",
          )}
        </p>
      ) : null}
      <ForkNotice state={state} productionId={productionId} occurrenceId={occ.id} run={run} />
      {v.uncertainty ? (
        <UncertainBox
          text={tm(v.uncertainty)}
          editable={variantEditable}
          onApprove={() =>
            setErr(
              run(
                { type: "SetUncertainty", productionId: pid, targetId: v.id, uncertainty: null },
                L("Godkjenn overskrift", "Approve heading"),
              ),
            )
          }
        />
      ) : null}
      <Section title={L("Sceneoverskrift", "Scene heading")}>
        <div className="grid grid-cols-[96px_1fr] gap-1.5">
          <label className="sr-only" htmlFor="h-ie">
            {L("INT/EXT", "INT/EXT")}
          </label>
          <Input
            id="h-ie"
            list="int-ext"
            value={heading.intExt}
            disabled={!variantEditable}
            onChange={(e) => setHeading({ ...heading, intExt: e.target.value.toUpperCase() })}
            className="h-8 bg-surface-3 font-script text-[13px]"
          />
          <datalist id="int-ext">
            {INT_EXT.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <label className="sr-only" htmlFor="h-loc">
            {L("Sted", "Location")}
          </label>
          <Input
            id="h-loc"
            value={heading.location}
            disabled={!variantEditable}
            placeholder={L("Sted", "Location")}
            onChange={(e) => setHeading({ ...heading, location: e.target.value.toUpperCase() })}
            className="h-8 bg-surface-3 font-script text-[13px]"
          />
          <span className="self-center text-right text-xs text-text-tertiary">
            {L("Tid", "Time")}
          </span>
          <Input
            aria-label={L("Tid på døgnet", "Time of day")}
            value={heading.time}
            disabled={!variantEditable}
            placeholder={L("DAG, KVELD, NATT …", "DAY, EVENING, NIGHT …")}
            onChange={(e) => setHeading({ ...heading, time: e.target.value.toUpperCase() })}
            className="h-8 bg-surface-3 font-script text-[13px]"
          />
        </div>
        {variantEditable ? (
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              disabled={!changed || !heading.location.trim()}
              onClick={() =>
                setErr(
                  run(
                    {
                      type: "EditSceneHeading",
                      productionId: pid,
                      variantId: v.id,
                      heading: {
                        intExt: heading.intExt.trim(),
                        location: heading.location.trim(),
                        time: heading.time.trim(),
                      },
                    },
                    L("Endre sceneoverskrift", "Change scene heading"),
                  ),
                )
              }
            >
              {L("Lagre overskrift", "Save heading")}
            </Button>
            {changed ? (
              <Button size="sm" variant="ghost" onClick={() => setHeading(v.heading)}>
                {L("Avbryt", "Cancel")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <p className="mt-1.5 text-[11px] text-text-tertiary">
          {L("Scenenummeret", "The scene number")} ({occ.productionNumber ?? L("ingen", "none")}){" "}
          {L(
            "er produksjonens nummer og endres ikke når scener flyttes. Ny nummerering velges ved eksport.",
            "is the production's number and does not change when scenes are moved. New numbering is chosen on export.",
          )}
        </p>
      </Section>
      <Section title={L("Fortellingstid", "Story time")}>
        <StoryTimeSection
          state={state}
          sceneId={occ.sceneId}
          productionId={productionId}
          editable={editable && !merged}
          run={run}
        />
      </Section>
      <Section title={L("Notater i scenen", "Notes in the scene")}>
        <NotesPanel
          state={state}
          notes={annotationsOfVariant(state, v.id)}
          editable={editable}
          run={run}
          focusId={focusNote}
          authorName={authorName}
          newTarget={{ blockId: null, variantId: v.id, start: 0, end: 0, quote: "" }}
          newLabel={L("Nål på scenen", "Pin on the scene")}
        />
      </Section>
      {usedIn.length ? (
        <Section title={L("Brukes også i", "Also used in")}>
          <p className="text-xs text-text-secondary">{usedIn.join(", ")}</p>
        </Section>
      ) : null}
      {editable ? (
        <Section title={L("Ny scene", "New scene")}>
          <Button
            size="sm"
            variant="secondary"
            className="justify-start"
            onClick={() => {
              const occurrenceId = newId<"scene_occurrence">();
              const blockId = newId<"script_block">();
              const e = run(
                {
                  type: "CreateScene",
                  productionId: pid,
                  sceneId: newId(),
                  variantId: newId(),
                  occurrenceId,
                  orderKey: keyBetween(occ.orderKey, next?.orderKey ?? null),
                  heading: { intExt: "INT.", location: "NY SCENE", time: "DAG" },
                  blocks: [{ blockId, kind: "action", text: "", orderKey: "i" }],
                  productionNumber: null,
                },
                L("Ny scene", "New scene"),
              );
              setErr(e);
              if (!e) onSelect({ occurrenceId, blockId: null });
            }}
          >
            <Plus />
            {L("Ny scene etter denne", "New scene after this")}
          </Button>
        </Section>
      ) : null}
      {variantEditable &&
      next &&
      !merged &&
      !isSharedIn(state, productionId, v.id) &&
      !isSharedIn(state, productionId, state.occurrences[next.id]?.variantId ?? "") ? (
        <Section title={L("Slå sammen", "Merge")}>
          {!confirmMerge ? (
            <Button
              size="sm"
              variant="secondary"
              className="justify-start"
              onClick={() => setConfirmMerge(true)}
            >
              <GitMerge />
              {L("Slå sammen med neste scene", "Merge with the next scene")}
            </Button>
          ) : (
            <div className="border border-border bg-surface-2 p-2.5 text-xs text-text-secondary">
              <p>
                {L("Teksten i scene", "The text of scene")}{" "}
                {next.productionNumber ?? L("uten nummer", "unnumbered")} (
                {nextV ? formatHeading(nextV.heading) : ""}){" "}
                {L(
                  "legges sist i denne scenen. Den gamle scenen beholdes som «sammenslått» og kan hentes tilbake med Angre.",
                  "is added last in this scene. The old scene is kept as “merged” and can be restored with Undo.",
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setConfirmMerge(false);
                    setErr(
                      run(
                        {
                          type: "MergeScenes",
                          productionId: pid,
                          targetOccurrenceId: occ.id,
                          sourceOccurrenceId: next.id,
                        },
                        L("Slå sammen scener", "Merge scenes"),
                      ),
                    );
                  }}
                >
                  {L("Slå sammen", "Merge")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmMerge(false)}>
                  {L("Avbryt", "Cancel")}
                </Button>
              </div>
            </div>
          )}
        </Section>
      ) : null}
      {removed.length ? (
        <Section title={`${L("Fjernet tekst", "Removed text")} (${removed.length})`}>
          <ul className="flex flex-col gap-1">
            {removed.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 border border-border bg-surface-2 px-2 py-1 text-xs"
              >
                <span className="text-text-tertiary">{KIND_LABEL[b.kind]}</span>
                <span className="min-w-0 flex-1 truncate font-script text-text-secondary">
                  {b.text || L("(tom)", "(empty)")}
                </span>
                {variantEditable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setErr(
                        run(
                          { type: "RestoreBlock", productionId: pid, blockId: b.id },
                          L("Hent tilbake tekst", "Restore text"),
                        ),
                      )
                    }
                  >
                    <Undo2 />
                    {L("Hent tilbake", "Restore")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {occ.active ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onSelect({ occurrenceId: occ.id, blockId: blocksOfVariant(state, v.id)[0]?.id ?? null })
          }
        >
          <Eye />
          {L("Gå til første blokk", "Go to first block")}
        </Button>
      ) : null}
      <ErrorText message={err} />
    </>
  );
}

function SummaryPanel({ state, productionId, startPages, uncertainCount, onNextUncertain }: Props) {
  const occs = orderedOccurrences(state, productionId);
  const pages = Object.values(startPages).reduce((m, p) => Math.max(m, p), 0);
  return (
    <div className="text-[13px] text-text-secondary">
      <dl className="grid grid-cols-[1fr_auto] gap-y-1">
        <dt>{L("Scener", "Scenes")}</dt>
        <dd className="tabular text-right text-text-primary">{occs.length}</dd>
        <dt>{L("Aktive", "Active")}</dt>
        <dd className="tabular text-right text-text-primary">
          {occs.filter((o) => o.active).length}
        </dd>
        <dt>{L("Siste scene starter på side", "Last scene starts on page")}</dt>
        <dd className="tabular text-right text-text-primary">{pages || "–"}</dd>
        <dt>{L("Usikre tolkninger", "Uncertain interpretations")}</dt>
        <dd className="tabular text-right text-text-primary">{uncertainCount}</dd>
      </dl>
      {uncertainCount > 0 ? (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onNextUncertain}>
          <AlertTriangle />
          {L("Gå til neste usikre tolkning", "Go to next uncertain interpretation")}
        </Button>
      ) : null}
      <p className="mt-4 text-xs text-text-tertiary">
        {L(
          "Klikk på en linje i manuset for å rette elementtype eller tekst. Dobbeltklikk for å skrive. Scener flyttes og slås av og på i listen til venstre etter at du har slått på «Endre rekkefølge og synlighet» – manus og film følger alltid samme rekkefølge.",
          "Click a line in the script to correct its element type or text. Double-click to type. Scenes are moved and switched on and off in the list on the left after you turn on “Change order and visibility” – the script and film always follow the same order.",
        )}
      </p>
    </div>
  );
}
