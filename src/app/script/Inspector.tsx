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
import { t } from "@/core/i18n/keyed";

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
    <aside aria-label={t("app-script-inspector.inspector.aria-label.893684118699")} className="flex min-h-0 flex-col">
      <div className="flex h-8 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-border px-3 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
        <span className="shrink-0">
          {block
            ? t("app-script-inspector.inspector.span.6430e1c9c262")
            : occ
              ? t("app-script-inspector.inspector.span.8fb617b2eb41")
              : t("app-script-inspector.inspector.span.84ec0326a8c8")}
        </span>
        {occ && occ.active && state.productions[occ.productionId]?.kind === "main" ? (
          <Link
            to="/prosjekt/$projectId/montering"
            params={{ projectId: props.projectId }}
            search={{ scene: occ.id, ...(block ? { blokk: block.id } : {}) }}
            className="ml-auto flex min-w-0 items-center gap-1 rounded-sm px-1 normal-case tracking-normal text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={
              block
                ? t("app-script-inspector.inspector.title.0d985a195132")
                : t("app-script-inspector.inspector.title.1582389ef2df")
            }
          >
            <Clapperboard className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t("app-script-inspector.inspector.span.3681171013f3")}</span>
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
            title={t("app-script-inspector.inspector.title.ea1177837783")}
          >
            <Layers className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t("app-script-inspector.inspector.span.85b9015c0bfa")}</span>
          </Link>
        ) : null}
        {occ && !block ? (
          <Link
            to="/prosjekt/$projectId/storylab"
            params={{ projectId: props.projectId }}
            search={{ scene: occ.sceneId }}
            data-testid="inspector-storylab"
            className="flex min-w-0 items-center gap-1 rounded-sm px-1 normal-case tracking-normal text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={t("app-script-inspector.inspector.title.f4833432d85d")}
          >
            <Drama className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t("app-script-inspector.inspector.span.a9c1c8f137df")}</span>
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
        {occ && openCount > 0 ? <Link to="/prosjekt/$projectId/storylab" params={{ projectId: props.projectId }} search={{ scene: occ.sceneId, forslag: "open" }} data-testid="script-storylab-suggestions" className="mb-2 block text-xs text-accent-brand">{t("app-script-inspector.inspector.link.3d53ef93db1d", { openCount: String(openCount) })}</Link> : null}
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
        <h3 className="mb-1.5 text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
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
            {t("app-script-inspector.uncertain-box.span.6c3bf35fcf67")}
          </span>
          {text}
        </span>
      </p>
      {editable ? (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onApprove}>
          <Check />
          {t("app-script-inspector.uncertain-box.button.80a9025d3328")}
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
        {t("app-script-inspector.fork-notice.p.02ce0d559b19")}
        {prod.name}
        {t("app-script-inspector.fork-notice.p.833b4cce76a9")}
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
              t("app-script-inspector.e.run.c2b171c9be97"),
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
        {t("app-script-inspector.fork-notice.button.beae310f4a28")}
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
        t("app-script-inspector.save.run.66c963dd6fcc"),
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
      t("app-script-inspector.e.run.b269f88ff57e"),
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
        t("app-script-inspector.split.run.97b4128a914b"),
      ),
    );
  }

  return (
    <>
      <p className="mb-3 text-xs text-text-tertiary">
        {t("app-script-inspector.block-panel.p.876e85475374")} {sceneNumberOf(state, occ) ?? t("app-script-inspector.block-panel.p.1da6ef0d3d9a")} ·{" "}
        {t("app-script-inspector.block-panel.p.ed3bf51ec389")} {startPages[occ.id] ?? "–"}
        {block.sourceRef ? (
          <>
            {" "}
            · {t("app-script-inspector.block-panel.p.ed3bf51ec389.2")} {block.sourceRef.page} {t("app-script-inspector.block-panel.p.f60cb0db6c7c")}
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
                t("app-script-inspector.block-panel.run.a2c780f5e20b"),
              ),
            )
          }
        />
      ) : null}
      <Section title={t("app-script-inspector.block-panel.title.643462bd7347")}>
        <select
          aria-label={t("app-script-inspector.block-panel.aria-label.643462bd7347")}
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
                t("app-script-inspector.block-panel.run.efa6e11af60a"),
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
      <Section title={t("app-script-inspector.block-panel.title.afd57ee1c0d5")}>
        <textarea
          ref={textRef}
          aria-label={t("app-script-inspector.block-panel.aria-label.afd57ee1c0d5")}
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
          {t("app-script-inspector.block-panel.p.878b847ce48d")}
        </p>
      </Section>
      {block.kind === "dialogue" || block.kind === "action" ? (
        <Section title={t("app-script-inspector.block-panel.title.98fa6fda1d8b")}>
          <BlockLinksSection
            state={state}
            projectId={projectId}
            productionId={productionId}
            blockId={block.id}
            occurrenceId={occ.id}
          />
        </Section>
      ) : null}
      <Section title={t("app-script-inspector.block-panel.title.4c90fbe46281")}>
        <NotesPanel
          state={state}
          notes={annotationsOfVariant(state, block.variantId).filter((a) => a.blockId === block.id)}
          editable={editable}
          run={run}
          focusId={focusNote}
          authorName={authorName}
          newTarget={{ blockId: block.id, variantId: null, start: 0, end: 0, quote: "" }}
          newLabel={t("app-script-inspector.block-panel.new-label.48354a6c8f7e")}
          productionId={productionId}
        />
        <p className="mt-1 text-[11px] text-text-tertiary">
          {t("app-script-inspector.block-panel.p.6824a8bc32e4")}
        </p>
      </Section>
      {variantEditable ? (
        <Section title={t("app-script-inspector.block-panel.title.fc87c095e37f")}>
          <div className="flex flex-col items-stretch gap-1.5">
            <Button size="sm" variant="secondary" onClick={insertAfter} className="justify-start">
              <Plus />
              {t("app-script-inspector.block-panel.button.dd57511db5e6")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={split}
              disabled={idx <= 0}
              className="justify-start"
              title={
                idx <= 0
                  ? t("app-script-inspector.block-panel.title.f8d206861c09")
                  : undefined
              }
            >
              <Scissors />
              {t("app-script-inspector.block-panel.button.d50065a0491a")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                const e = run(
                  { type: "RemoveBlock", productionId: pid, blockId: block.id },
                  t("app-script-inspector.e.run.c49f542ce812"),
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
              {t("app-script-inspector.block-panel.button.9e75dd29b865")}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            {t("app-script-inspector.block-panel.p.d996f62a2404")}
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
            <span className="text-text-tertiary">{t("app-script-inspector.scene-panel.span.ffd27913a1c8")}</span>
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
              : t("app-script-inspector.scene-panel.title.cca2d0a97d57")
          }
        >
          {occ.active
            ? t("app-script-inspector.scene-panel.label.aa6dd30292dd")
            : merged
              ? t("app-script-inspector.scene-panel.label.071504247f25")
              : t("app-script-inspector.scene-panel.label.1d537137116c")}
          {structureEditing ? (
            <Switch
              checked={occ.active}
              disabled={!editable || merged}
              onCheckedChange={(on) =>
                setErr(
                  run(
                    { type: "SetOccurrenceActive", occurrenceId: occ.id, active: on },
                    on
                      ? t("app-script-inspector.scene-panel.run.f3c42173f4c8")
                      : t("app-script-inspector.scene-panel.run.676faa961714"),
                  ),
                )
              }
              aria-label={
                occ.active
                  ? t("app-script-inspector.scene-panel.aria-label.2d6532875401")
                  : t("app-script-inspector.scene-panel.aria-label.1772bc9a00a7")
              }
            />
          ) : null}
        </label>
      </div>
      {!occ.active && !merged ? (
        <p className="mb-3 text-xs text-text-tertiary">
          {t("app-script-inspector.scene-panel.p.2430d544add9")}
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
                t("app-script-inspector.scene-panel.run.27a9b167b015"),
              ),
            )
          }
        />
      ) : null}
      <Section title={t("app-script-inspector.scene-panel.title.bcaf9daf330b")}>
        <div className="grid grid-cols-[96px_1fr] gap-1.5">
          <label className="sr-only" htmlFor="h-ie">
            {t("app-script-inspector.scene-panel.label.c23814558fc1")}
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
            {t("app-script-inspector.scene-panel.label.5d2b2d7b9eda")}
          </label>
          <Input
            id="h-loc"
            value={heading.location}
            disabled={!variantEditable}
            placeholder={t("app-script-inspector.scene-panel.placeholder.5d2b2d7b9eda")}
            onChange={(e) => setHeading({ ...heading, location: e.target.value.toUpperCase() })}
            className="h-8 bg-surface-3 font-script text-[13px]"
          />
          <span className="self-center text-right text-xs text-text-tertiary">
            {t("app-script-inspector.scene-panel.span.3f2936ca36bb")}
          </span>
          <Input
            aria-label={t("app-script-inspector.scene-panel.aria-label.5cc0d19dd240")}
            value={heading.time}
            disabled={!variantEditable}
            placeholder={t("app-script-inspector.scene-panel.placeholder.66e9681b64e8")}
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
                    t("app-script-inspector.scene-panel.run.c4685d90d1e3"),
                  ),
                )
              }
            >
              {t("app-script-inspector.scene-panel.button.604b1a8ae53a")}
            </Button>
            {changed ? (
              <Button size="sm" variant="ghost" onClick={() => setHeading(v.heading)}>
                {t("app-script-inspector.scene-panel.button.38c7d0fe76dd")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <p className="mt-1.5 text-[11px] text-text-tertiary">
          {t("app-script-inspector.scene-panel.p.c322b07e57c7")} ({occ.productionNumber ?? t("app-script-inspector.scene-panel.p.b85dcd51fd9f")}){" "}
          {t("app-script-inspector.scene-panel.p.6113461a1927")}
        </p>
      </Section>
      <Section title={t("app-script-inspector.scene-panel.title.c3bd3f5dd07a")}>
        <StoryTimeSection
          state={state}
          sceneId={occ.sceneId}
          productionId={productionId}
          editable={editable && !merged}
          run={run}
        />
      </Section>
      <Section title={t("app-script-inspector.scene-panel.title.ebc0e759b715")}>
        <NotesPanel
          state={state}
          notes={annotationsOfVariant(state, v.id)}
          editable={editable}
          run={run}
          focusId={focusNote}
          authorName={authorName}
          newTarget={{ blockId: null, variantId: v.id, start: 0, end: 0, quote: "" }}
          newLabel={t("app-script-inspector.scene-panel.new-label.e5f006023739")}
        />
      </Section>
      {usedIn.length ? (
        <Section title={t("app-script-inspector.scene-panel.title.798a00fa8872")}>
          <p className="text-xs text-text-secondary">{usedIn.join(", ")}</p>
        </Section>
      ) : null}
      {editable ? (
        <Section title={t("app-script-inspector.scene-panel.title.0258d8046c5f")}>
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
                t("app-script-inspector.e.run.cd0fd3eabeca"),
              );
              setErr(e);
              if (!e) onSelect({ occurrenceId, blockId: null });
            }}
          >
            <Plus />
            {t("app-script-inspector.scene-panel.button.0bfe19533b27")}
          </Button>
        </Section>
      ) : null}
      {variantEditable &&
      next &&
      !merged &&
      !isSharedIn(state, productionId, v.id) &&
      !isSharedIn(state, productionId, state.occurrences[next.id]?.variantId ?? "") ? (
        <Section title={t("app-script-inspector.scene-panel.title.b3913a5b5eeb")}>
          {!confirmMerge ? (
            <Button
              size="sm"
              variant="secondary"
              className="justify-start"
              onClick={() => setConfirmMerge(true)}
            >
              <GitMerge />
              {t("app-script-inspector.scene-panel.button.29c015e004aa")}
            </Button>
          ) : (
            <div className="border border-border bg-surface-2 p-2.5 text-xs text-text-secondary">
              <p>
                {t("app-script-inspector.scene-panel.p.415dad468136")}{" "}
                {next.productionNumber ?? t("app-script-inspector.scene-panel.p.ffd27913a1c8")} (
                {nextV ? formatHeading(nextV.heading) : ""}){" "}
                {t("app-script-inspector.scene-panel.p.dc3999e8bdf6")}
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
                        t("app-script-inspector.scene-panel.run.85ad477dbbd7"),
                      ),
                    );
                  }}
                >
                  {t("app-script-inspector.scene-panel.button.b3913a5b5eeb")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmMerge(false)}>
                  {t("app-script-inspector.scene-panel.button.38c7d0fe76dd.2")}
                </Button>
              </div>
            </div>
          )}
        </Section>
      ) : null}
      {removed.length ? (
        <Section title={`${t("app-script-inspector.scene-panel.title.229acbca1722")} (${removed.length})`}>
          <ul className="flex flex-col gap-1">
            {removed.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 border border-border bg-surface-2 px-2 py-1 text-xs"
              >
                <span className="text-text-tertiary">{KIND_LABEL[b.kind]}</span>
                <span className="min-w-0 flex-1 truncate font-script text-text-secondary">
                  {b.text || t("app-script-inspector.scene-panel.span.11592f16a888")}
                </span>
                {variantEditable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setErr(
                        run(
                          { type: "RestoreBlock", productionId: pid, blockId: b.id },
                          t("app-script-inspector.scene-panel.run.59f681e3750c"),
                        ),
                      )
                    }
                  >
                    <Undo2 />
                    {t("app-script-inspector.scene-panel.button.1d27711112fa")}
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
          {t("app-script-inspector.scene-panel.button.ac0a939e1835")}
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
        <dt>{t("app-script-inspector.summary-panel.dt.0354e7d1c7c9")}</dt>
        <dd className="tabular text-right text-text-primary">{occs.length}</dd>
        <dt>{t("app-script-inspector.summary-panel.dt.d091852cac74")}</dt>
        <dd className="tabular text-right text-text-primary">
          {occs.filter((o) => o.active).length}
        </dd>
        <dt>{t("app-script-inspector.summary-panel.dt.377a40ba07a7")}</dt>
        <dd className="tabular text-right text-text-primary">{pages || "–"}</dd>
        <dt>{t("app-script-inspector.summary-panel.dt.2e814d861303")}</dt>
        <dd className="tabular text-right text-text-primary">{uncertainCount}</dd>
      </dl>
      {uncertainCount > 0 ? (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onNextUncertain}>
          <AlertTriangle />
          {t("app-script-inspector.summary-panel.button.bedc3031353c")}
        </Button>
      ) : null}
      <p className="mt-4 text-xs text-text-tertiary">
        {t("app-script-inspector.summary-panel.p.384a4ad6a9e0")}
      </p>
    </div>
  );
}
