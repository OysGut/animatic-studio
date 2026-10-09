/**
 * Inspektør for manus: korriger tolkning (mandat 4.3), rediger tekst og overskrift, del og slå sammen scener (4.4).
 * Alle endringer er kommandoer som kan angres (ADR-0005).
 */
import {
  AlertTriangle,
  Check,
  CopyPlus,
  Eye,
  GitMerge,
  Plus,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  annotationsOfVariant,
  blocksOfVariant,
  compareKeys,
  formatHeading,
  keyBetween,
  newId,
  orderedOccurrences,
  type BlockKind,
  type Command,
  type ProjectState,
  type SceneHeading,
} from "@/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KIND_LABEL } from "./script-helpers";
import { NotesPanel } from "./NotesPanel";
import type { Selection } from "./ScriptPageView";

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
  readonly state: ProjectState;
  readonly productionId: string;
  readonly selection: Selection;
  readonly editable: boolean;
  readonly startPages: Readonly<Record<string, number>>;
  readonly textRef: RefObject<HTMLTextAreaElement | null>;
  readonly run: (command: Command, label: string) => string | null;
  readonly onSelect: (sel: Selection) => void;
  readonly onNextUncertain: () => void;
  readonly uncertainCount: number;
  /** Rekkefølge og synlighet kan bare endres i redigeringsmodus (REQ-0532). */
  readonly structureEditing: boolean;
  /** Navnet nye notater stemples med (DEC-0031). */
  readonly authorName: string;
  /** Notat som skal fremheves (klikket i margen). */
  readonly focusNote: string | null;
}

export function Inspector(props: Props) {
  const { state, selection } = props;
  const block = selection.blockId ? state.blocks[selection.blockId] : undefined;
  const occ = selection.occurrenceId ? state.occurrences[selection.occurrenceId] : undefined;
  return (
    <aside aria-label="Inspektør" className="flex min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {block ? "Manusblokk" : occ ? "Scene" : "Manus"}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {block && occ ? (
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

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      {title ? (
        <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
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
          <span className="font-medium">Usikker tolkning: </span>
          {text}
        </span>
      </p>
      {editable ? (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onApprove}>
          <Check />
          Tolkningen er riktig
        </Button>
      ) : null}
    </div>
  );
}

/** Varianten deles med hovedfilmen og kan ikke endres fra en annen produksjon uten egen variant (INV-04). */
function ForkNotice({
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
        Denne scenen deles med hovedfilmen. For å endre den i «{prod.name}» lages en egen versjon;
        hovedfilmen endres ikke.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          const map: Record<string, never> = {};
          for (const b of Object.values(state.blocks))
            if (b.variantId === v.id) map[b.id] = newId() as never;
          setErr(
            run(
              {
                type: "ForkVariant",
                occurrenceId: occ.id as never,
                newVariantId: newId(),
                blockIdMap: map,
              },
              "Lag egen versjon av scenen",
            ),
          );
        }}
      >
        <CopyPlus />
        Lag egen versjon
      </Button>
      <ErrorText message={err} />
    </div>
  );
}

function canEditVariant(state: ProjectState, productionId: string, variantId: string): boolean {
  const v = state.variants[variantId];
  const p = state.productions[productionId];
  if (!v || !p) return false;
  return v.ownerProductionId === null ? p.kind === "main" : v.ownerProductionId === productionId;
}

function BlockPanel({
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
      run({ type: "EditBlockText", productionId: pid, blockId: block.id, text }, "Rediger tekst"),
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
      "Ny blokk",
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
        "Del scene",
      ),
    );
  }

  return (
    <>
      <p className="mb-3 text-xs text-text-tertiary">
        Scene {occ.productionNumber ?? "uten nummer"} · side {startPages[occ.id] ?? "–"}
        {block.sourceRef ? <> · side {block.sourceRef.page} i originalen</> : null}
      </p>
      <ForkNotice state={state} productionId={productionId} occurrenceId={occ.id} run={run} />
      {block.uncertainty ? (
        <UncertainBox
          text={block.uncertainty}
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
                "Godkjenn tolkning",
              ),
            )
          }
        />
      ) : null}
      <Section title="Elementtype">
        <select
          aria-label="Elementtype"
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
                "Endre elementtype",
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
      <Section title="Tekst">
        <textarea
          ref={textRef}
          aria-label="Tekst"
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
          Lagres når du går ut av feltet (eller ⌘/Ctrl + Enter). Esc angrer.
        </p>
      </Section>
      <Section title="Notater">
        <NotesPanel
          state={state}
          notes={annotationsOfVariant(state, block.variantId).filter((a) => a.blockId === block.id)}
          editable={editable}
          run={run}
          focusId={focusNote}
          authorName={authorName}
          newTarget={{ blockId: block.id, variantId: null, start: 0, end: 0, quote: "" }}
          newLabel="Notat på hele elementet"
        />
        <p className="mt-1 text-[11px] text-text-tertiary">
          Notat på enkeltord: merk teksten i manuset og velg «Legg til notat».
        </p>
      </Section>
      {variantEditable ? (
        <Section title="Handlinger">
          <div className="flex flex-col items-stretch gap-1.5">
            <Button size="sm" variant="secondary" onClick={insertAfter} className="justify-start">
              <Plus />
              Ny blokk etter denne
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={split}
              disabled={idx <= 0}
              className="justify-start"
              title={idx <= 0 ? "Kan ikke dele ved første blokk" : undefined}
            >
              <Scissors />
              Del scenen her
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                const e = run(
                  { type: "RemoveBlock", productionId: pid, blockId: block.id },
                  "Fjern blokk",
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
              Fjern blokken
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            Fjernet tekst kan hentes tilbake fra scenen. Historikken beholdes.
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
          Scene {occ.productionNumber ?? <span className="text-text-tertiary">uten nummer</span>}
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
              : "Slå på «Endre rekkefølge og synlighet» i scenelisten for å endre"
          }
        >
          {occ.active ? "Aktiv" : merged ? "Sammenslått" : "Deaktivert"}
          {structureEditing ? (
            <Switch
              checked={occ.active}
              disabled={!editable || merged}
              onCheckedChange={(on) =>
                setErr(
                  run(
                    { type: "SetOccurrenceActive", occurrenceId: occ.id, active: on },
                    on ? "Aktiver scene" : "Deaktiver scene",
                  ),
                )
              }
              aria-label={occ.active ? "Deaktiver scenen" : "Aktiver scenen"}
            />
          ) : null}
        </label>
      </div>
      {!occ.active && !merged ? (
        <p className="mb-3 text-xs text-text-tertiary">
          Deaktiverte scener er utelatt fra manus og film i denne produksjonen. Ingenting er
          slettet.
        </p>
      ) : null}
      <ForkNotice state={state} productionId={productionId} occurrenceId={occ.id} run={run} />
      {v.uncertainty ? (
        <UncertainBox
          text={v.uncertainty}
          editable={variantEditable}
          onApprove={() =>
            setErr(
              run(
                { type: "SetUncertainty", productionId: pid, targetId: v.id, uncertainty: null },
                "Godkjenn overskrift",
              ),
            )
          }
        />
      ) : null}
      <Section title="Sceneoverskrift">
        <div className="grid grid-cols-[96px_1fr] gap-1.5">
          <label className="sr-only" htmlFor="h-ie">
            INT/EXT
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
            Sted
          </label>
          <Input
            id="h-loc"
            value={heading.location}
            disabled={!variantEditable}
            placeholder="Sted"
            onChange={(e) => setHeading({ ...heading, location: e.target.value.toUpperCase() })}
            className="h-8 bg-surface-3 font-script text-[13px]"
          />
          <span className="self-center text-right text-xs text-text-tertiary">Tid</span>
          <Input
            aria-label="Tid på døgnet"
            value={heading.time}
            disabled={!variantEditable}
            placeholder="DAG, KVELD, NATT …"
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
                    "Endre sceneoverskrift",
                  ),
                )
              }
            >
              Lagre overskrift
            </Button>
            {changed ? (
              <Button size="sm" variant="ghost" onClick={() => setHeading(v.heading)}>
                Avbryt
              </Button>
            ) : null}
          </div>
        ) : null}
        <p className="mt-1.5 text-[11px] text-text-tertiary">
          Scenenummeret ({occ.productionNumber ?? "ingen"}) er produksjonens nummer og endres ikke
          når scener flyttes. Ny nummerering velges ved eksport.
        </p>
      </Section>
      <Section title="Notater i scenen">
        <NotesPanel
          state={state}
          notes={annotationsOfVariant(state, v.id)}
          editable={editable}
          run={run}
          focusId={focusNote}
          authorName={authorName}
          newTarget={{ blockId: null, variantId: v.id, start: 0, end: 0, quote: "" }}
          newLabel="Nål på scenen"
        />
      </Section>
      {usedIn.length ? (
        <Section title="Brukes også i">
          <p className="text-xs text-text-secondary">{usedIn.join(", ")}</p>
        </Section>
      ) : null}
      {editable ? (
        <Section title="Ny scene">
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
                "Ny scene",
              );
              setErr(e);
              if (!e) onSelect({ occurrenceId, blockId: null });
            }}
          >
            <Plus />
            Ny scene etter denne
          </Button>
        </Section>
      ) : null}
      {variantEditable && next && !merged ? (
        <Section title="Slå sammen">
          {!confirmMerge ? (
            <Button
              size="sm"
              variant="secondary"
              className="justify-start"
              onClick={() => setConfirmMerge(true)}
            >
              <GitMerge />
              Slå sammen med neste scene
            </Button>
          ) : (
            <div className="border border-border bg-surface-2 p-2.5 text-xs text-text-secondary">
              <p>
                Teksten i scene {next.productionNumber ?? "uten nummer"} (
                {nextV ? formatHeading(nextV.heading) : ""}) legges sist i denne scenen. Den gamle
                scenen beholdes som «sammenslått» og kan hentes tilbake med Angre.
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
                        "Slå sammen scener",
                      ),
                    );
                  }}
                >
                  Slå sammen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmMerge(false)}>
                  Avbryt
                </Button>
              </div>
            </div>
          )}
        </Section>
      ) : null}
      {removed.length ? (
        <Section title={`Fjernet tekst (${removed.length})`}>
          <ul className="flex flex-col gap-1">
            {removed.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 border border-border bg-surface-2 px-2 py-1 text-xs"
              >
                <span className="text-text-tertiary">{KIND_LABEL[b.kind]}</span>
                <span className="min-w-0 flex-1 truncate font-script text-text-secondary">
                  {b.text || "(tom)"}
                </span>
                {variantEditable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setErr(
                        run(
                          { type: "RestoreBlock", productionId: pid, blockId: b.id },
                          "Hent tilbake tekst",
                        ),
                      )
                    }
                  >
                    <Undo2 />
                    Hent tilbake
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
          Gå til første blokk
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
        <dt>Scener</dt>
        <dd className="tabular text-right text-text-primary">{occs.length}</dd>
        <dt>Aktive</dt>
        <dd className="tabular text-right text-text-primary">
          {occs.filter((o) => o.active).length}
        </dd>
        <dt>Siste scene starter på side</dt>
        <dd className="tabular text-right text-text-primary">{pages || "–"}</dd>
        <dt>Usikre tolkninger</dt>
        <dd className="tabular text-right text-text-primary">{uncertainCount}</dd>
      </dl>
      {uncertainCount > 0 ? (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onNextUncertain}>
          <AlertTriangle />
          Gå til neste usikre tolkning
        </Button>
      ) : null}
      <p className="mt-4 text-xs text-text-tertiary">
        Klikk på en linje i manuset for å rette elementtype eller tekst. Dobbeltklikk for å skrive.
        Scener flyttes og slås av og på i listen til venstre etter at du har slått på «Endre
        rekkefølge og synlighet» – manus og film følger alltid samme rekkefølge.
      </p>
    </div>
  );
}
