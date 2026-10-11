/**
 * Kontinuitet for en karakter eller ressurs (M6 del 2, DEC-0055, REQ-0150–0158, REQ-0155):
 * hendelser som endrer utseendet (hårklipp, kostyme, skade …), forslag fra manuset som må godkjennes
 * eller avvises, og en tidslinje over scenene i fortellingsrekkefølge med utseendet i hver scene.
 */
import { ArrowRight, Check, Clock, Lightbulb, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  CONTINUITY_DURATION_LABEL,
  CONTINUITY_KIND_LABEL,
  CONTINUITY_KINDS,
  appearanceAt,
  eventApplies,
  eventMidScene,
  eventSceneId,
  blocksOfVariant,
  continuityEventsOf,
  continuityFor,
  continuitySuggestions,
  continuityTimeline,
  excerpt,
  formatHeading,
  newId,
  orderedOccurrences,
  variantsOf,
  versionsOf,
  type Asset,
  type ContinuityDuration,
  type ContinuityEvent,
  type ContinuityEventFields,
  type ContinuityKind,
  type ContinuitySuggestion,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useImageUrls } from "./asset-images";

interface Props {
  readonly state: ProjectState;
  readonly asset: Asset;
  readonly editable: boolean;
  readonly cmds: Commands;
  readonly onGoToScene: (occurrenceId: string) => void;
  /** Produksjonen som er valgt (DEC-0060): en spinoff har egne og avslåtte hendelser. */
  readonly productionId?: string;
}

/** Farger for utseendene i tidslinjen (samme variant = samme farge). */
const LOOK_COLORS = ["#5b8def", "#e0874f", "#4fb38a", "#c56cc9", "#d8b24a", "#6cc3d0", "#e06c7a"];

const selectCls =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

function allMainOccurrences(state: ProjectState) {
  const main = Object.values(state.productions).find((p) => p.kind === "main");
  return main ? orderedOccurrences(state, main.id) : [];
}
function mainOccurrences(state: ProjectState) {
  return allMainOccurrences(state).filter((o) => o.active);
}

export function ContinuityPanel({
  state: realState,
  asset,
  editable,
  cmds,
  onGoToScene,
  productionId,
}: Props) {
  // Kontinuiteten slik den er i produksjonen (DEC-0060, REQ-0166/0167)
  const state = useMemo(() => continuityFor(realState, productionId), [realState, productionId]);
  const prod = productionId ? realState.productions[productionId] : undefined;
  const derived = !!prod && prod.kind !== "main";
  const prodName = prod ? `«${prod.name}»` : "";
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string | null;
    fields: ContinuityEventFields;
  } | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const variants = variantsOf(state, asset.id).filter((v) => !v.archived);
  const applying = useMemo(() => continuityEventsOf(state, asset.id), [state, asset.id]);
  // Også godkjente hendelser i scener som er deaktivert (vises, men gjelder ikke)
  const events = useMemo(
    () => [
      ...applying,
      ...Object.values(state.continuityEvents).filter(
        (e) =>
          e.assetId === asset.id &&
          !e.removed &&
          e.status === "approved" &&
          (!e.productionId || e.productionId === productionId) &&
          !eventApplies(state, e),
      ),
    ],
    [applying, state, asset.id],
  );
  const dismissed = Object.values(state.continuityEvents).filter(
    (e) =>
      e.assetId === asset.id &&
      !e.removed &&
      e.status === "dismissed" &&
      (!e.productionId || e.productionId === productionId),
  );
  const suggestions = useMemo(() => continuitySuggestions(state, asset.id), [state, asset.id]);
  const timeline = useMemo(() => continuityTimeline(state, asset.id), [state, asset.id]);
  const occs = derived
    ? orderedOccurrences(state, productionId!).filter((o) => o.active)
    : mainOccurrences(state);
  // Også deaktiverte scener (en hendelse kan vare til en scene som er tatt ut av filmen)
  const allOccs = derived
    ? [...allMainOccurrences(state), ...orderedOccurrences(state, productionId!)]
    : allMainOccurrences(state);
  const sceneLabel = (sceneId: string | null) => {
    if (!sceneId) return "—";
    const o = allOccs.find((x) => x.sceneId === sceneId);
    const v = o
      ? state.variants[o.variantId]
      : Object.values(state.variants).find((x) => x.sceneId === sceneId);
    return `${o?.productionNumber ? `Scene ${o.productionNumber}` : "Scene"}${v ? ` – ${formatHeading(v.heading)}` : ""}`;
  };
  const variantName = (id: string | null) => (id ? (state.assetVariants[id]?.name ?? "—") : "—");
  const colorOf = (id: string | null) => {
    if (!id) return "transparent";
    const i = variantsOf(state, asset.id).findIndex((v) => v.id === id);
    return LOOK_COLORS[(i < 0 ? 0 : i) % LOOK_COLORS.length]!;
  };
  // Små bilder av utseendene
  const thumbPath = (variantId: string | null) => {
    if (!variantId) return null;
    const v = state.assetVariants[variantId];
    const ver = v?.approvedVersionId
      ? state.assetVersions[v.approvedVersionId]
      : versionsOf(state, variantId)[0];
    return ver?.mediaPath ?? null;
  };
  const paths = [...new Set(variants.map((v) => thumbPath(v.id)).filter((p): p is string => !!p))];
  const urls = useImageUrls(paths).data ?? {};

  function blank(sceneId?: string): ContinuityEventFields {
    const last = events[events.length - 1];
    return {
      assetId: asset.id,
      kind: "haircut",
      description: "",
      fromVariantId: last?.toVariantId ?? null,
      toVariantId: null,
      duration: "permanent",
      sceneId: (sceneId ?? occs[0]?.sceneId ?? "") as never,
      blockId: null,
      untilSceneId: null,
      status: "approved",
      // Ny hendelse i en spinoff gjelder bare der (DEC-0060)
      ...(derived ? { productionId: productionId as never } : {}),
    };
  }

  function fromSuggestion(x: ContinuitySuggestion): ContinuityEventFields {
    // Utseendet før: det som gjelder ved linjen ifølge hendelsene som finnes
    const before = appearanceAt(state, asset.id, x.sceneId, x.blockId).variantId;
    return {
      assetId: asset.id,
      kind: x.kind,
      description: x.text,
      fromVariantId: before as never,
      toVariantId: null,
      duration: x.duration,
      sceneId: x.sceneId as never,
      blockId: x.blockId as never,
      untilSceneId: null,
      status: "approved",
      ...(derived ? { productionId: productionId as never } : {}),
    };
  }

  function dismiss(x: ContinuitySuggestion) {
    setErr(
      cmds.run(
        {
          type: "AddContinuityEvents",
          events: [
            {
              eventId: newId<"continuity_event">(),
              fields: { ...fromSuggestion(x), fromVariantId: null, status: "dismissed" },
            },
          ],
        },
        "Avvis forslag til kontinuitet",
      ),
    );
  }

  function save() {
    if (!editing) return;
    const f = {
      ...editing.fields,
      untilSceneId: editing.fields.duration === "temporary" ? editing.fields.untilSceneId : null,
    };
    const r = editing.id
      ? cmds.run(
          { type: "UpdateContinuityEvents", events: [{ eventId: editing.id as never, fields: f }] },
          `Endre kontinuitet for «${asset.name}»`,
        )
      : cmds.run(
          {
            type: "AddContinuityEvents",
            events: [{ eventId: newId<"continuity_event">(), fields: f }],
          },
          `Ny kontinuitetshendelse for «${asset.name}»`,
        );
    setErr(r);
    if (!r) setEditing(null);
  }

  const fieldsOf = (e: ContinuityEvent): ContinuityEventFields => ({
    assetId: e.assetId,
    kind: e.kind,
    description: e.description,
    fromVariantId: e.fromVariantId,
    toVariantId: e.toVariantId,
    duration: e.duration,
    sceneId: eventSceneId(state, e) as never,
    blockId: e.blockId,
    untilSceneId: e.untilSceneId,
    status: e.status,
  });

  return (
    <section aria-label="Kontinuitet" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 whitespace-nowrap text-sm font-medium text-text-primary">
          Kontinuitet
        </h2>
        <span className="text-xs text-text-tertiary">
          Når utseendet endres i historien (f.eks. klipper håret). Riktig utseende i hver scene
          følger fortellingstiden – også i tilbakeblikk.
        </span>
        {editable && !editing ? (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setEditing({ id: null, fields: blank() })}
            title={derived ? `Hendelsen gjelder bare i ${prodName}` : undefined}
          >
            <Plus />
            {derived ? `Ny hendelse i ${prod!.name}` : "Ny hendelse"}
          </Button>
        ) : null}
      </div>

      {/* Forslag fra manuset */}
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-1.5 border border-status-uncertain/40 bg-status-uncertain-bg p-3">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
            <Lightbulb className="size-4 text-status-uncertain" aria-hidden />
            Forslag fra manuset ({suggestions.length})
          </h3>
          <p className="text-[11px] text-text-tertiary">
            Linjer der {asset.name} nevnes og noe kan endre utseendet. Ingenting brukes før du
            godkjenner.
          </p>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {suggestions.map((x) => (
              <li
                key={x.key}
                className="flex items-start gap-2 rounded-sm bg-surface-1 px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-text-primary">
                    {CONTINUITY_KIND_LABEL[x.kind]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onGoToScene(x.occurrenceId)}
                    className="ml-1.5 text-text-tertiary underline-offset-2 hover:underline"
                  >
                    {x.number ? `scene ${x.number}` : "scene"}
                  </button>
                  <span className="block text-text-secondary">«{x.text}»</span>
                </span>
                {editable ? (
                  <span className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing({ id: null, fields: fromSuggestion(x) })}
                      title="Fyll inn utseendet før og etter, og godkjenn"
                    >
                      <Check />
                      Godkjenn …
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss(x)}
                      title="Ikke en endring"
                    >
                      <X />
                      Avvis
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <EventForm
          state={state}
          asset={asset}
          fields={editing.fields}
          isNew={editing.id === null}
          onChange={(f) => setEditing({ ...editing, fields: f })}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setErr(null);
          }}
        />
      ) : null}

      {/* Hendelsene */}
      {events.length === 0 && !editing ? (
        <p className="text-[13px] text-text-secondary">
          Ingen hendelser. Legg inn en hendelse når {asset.name} forandrer seg i historien – med
          utseendet før og etter (visuelle varianter over).
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-3 border border-border bg-surface-1 px-3 py-2 text-xs"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-text-primary">
                    {CONTINUITY_KIND_LABEL[e.kind]}
                  </span>
                  <span className="text-text-tertiary">{sceneLabel(eventSceneId(state, e))}</span>
                  {derived ? (
                    <span className="rounded-sm bg-surface-3 px-1 text-[10px] text-text-secondary">
                      {e.productionId ? `bare i ${prod!.name}` : "fra hovedfilmen"}
                    </span>
                  ) : null}
                  {eventApplies(state, e) ? null : derived &&
                    !e.productionId &&
                    e.disabledIn?.includes(productionId as never) ? (
                    <span className="rounded-sm bg-status-uncertain-bg px-1 text-[10px] text-status-uncertain">
                      slått av i {prod!.name}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-status-uncertain-bg px-1 text-[10px] text-status-uncertain">
                      scenen er ikke med – gjelder ikke
                    </span>
                  )}
                  <span className="rounded-sm bg-surface-3 px-1 text-[10px] text-text-secondary">
                    {e.duration === "temporary"
                      ? `over fra ${sceneLabel(e.untilSceneId).split(" – ")[0]!.toLowerCase()}`
                      : CONTINUITY_DURATION_LABEL[e.duration].toLowerCase()}
                  </span>
                </span>
                {e.description ? (
                  <span className="mt-0.5 block text-text-secondary">{e.description}</span>
                ) : null}
                {e.blockId && state.blocks[e.blockId] ? (
                  <span className="mt-0.5 block text-text-tertiary">
                    Ved linjen «{excerpt(state.blocks[e.blockId]!.text, 90)}»
                  </span>
                ) : null}
                <span className="mt-1 flex items-center gap-1.5 text-text-secondary">
                  <Look name={variantName(e.fromVariantId)} color={colorOf(e.fromVariantId)} />
                  <ArrowRight className="size-3 text-text-tertiary" aria-hidden />
                  <Look name={variantName(e.toVariantId)} color={colorOf(e.toVariantId)} />
                </span>
              </span>
              {editable && derived && !e.productionId ? (
                // Hovedfilmens hendelse i en spinoff: kan slås av eller på her (REQ-0167)
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const off = !!e.disabledIn?.includes(productionId as never);
                      setErr(
                        cmds.run(
                          {
                            type: "SetContinuityEventDisabled",
                            eventId: e.id,
                            productionId: productionId as never,
                            disabled: !off,
                          },
                          off
                            ? `Slå på hendelsen i ${prod!.name}`
                            : `Slå av hendelsen i ${prod!.name}`,
                        ),
                      );
                    }}
                    title="Hovedfilmen endres ikke"
                  >
                    {e.disabledIn?.includes(productionId as never)
                      ? `Slå på i ${prod!.name}`
                      : `Slå av i ${prod!.name}`}
                  </Button>
                </span>
              ) : editable ? (
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ id: e.id, fields: fieldsOf(e) })}
                    title="Endre"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setErr(
                        cmds.run(
                          { type: "SetContinuityEventsRemoved", eventIds: [e.id], removed: true },
                          "Fjern kontinuitetshendelse",
                        ),
                      )
                    }
                    title="Fjern hendelsen (kan angres)"
                  >
                    <Trash2 />
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {dismissed.length ? (
        <div className="text-xs">
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="text-text-tertiary hover:text-text-primary"
          >
            {showDismissed ? "Skjul" : "Vis"} avviste forslag ({dismissed.length})
          </button>
          {showDismissed ? (
            <ul className="mt-1 flex flex-col gap-1">
              {dismissed.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-text-tertiary">
                  <span className="min-w-0 flex-1 truncate">
                    {CONTINUITY_KIND_LABEL[e.kind]} ·{" "}
                    {sceneLabel(eventSceneId(state, e)).split(" – ")[0]} · «{e.description}»
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setErr(
                          cmds.run(
                            { type: "SetContinuityEventsRemoved", eventIds: [e.id], removed: true },
                            "Angre avvisning",
                          ),
                        )
                      }
                      title="Vis forslaget igjen"
                    >
                      <Undo2 />
                      Angre avvisning
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}

      {/* Tidslinje (fortellingsrekkefølge) */}
      {events.length > 0 ? (
        <div aria-label="Kontinuitetstidslinje" className="border border-border bg-surface-1">
          <div className="flex h-8 items-center gap-1.5 border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            <Clock className="size-3.5" aria-hidden />
            Tidslinje i fortellingstid
          </div>
          <ol className="max-h-[50vh] overflow-y-auto py-1">
            {timeline.map((r) => {
              const look = r.appearance.variantId;
              const url = thumbPath(look) ? urls[thumbPath(look)!] : undefined;
              return (
                <li
                  key={r.sceneId}
                  className={
                    "grid grid-cols-[6px_34px_1fr_auto] items-center gap-2 px-3 py-1 text-xs" +
                    (r.present ? "" : " opacity-55")
                  }
                >
                  <span
                    aria-hidden
                    className="h-full min-h-5 rounded-sm"
                    style={{ background: colorOf(look) }}
                  />
                  <button
                    type="button"
                    disabled={!r.occurrenceId}
                    onClick={() => r.occurrenceId && onGoToScene(r.occurrenceId)}
                    className="tabular truncate text-right font-mono text-text-secondary hover:text-text-primary"
                    title="Vis scenen i manus"
                  >
                    {r.number ?? "–"}
                  </button>
                  <span className="min-w-0">
                    <span className="block truncate text-text-primary">
                      {r.heading || "—"}
                      {r.nonLinear ? (
                        <span className="ml-1.5 rounded-sm bg-surface-3 px-1 text-[10px] text-text-secondary">
                          tilbakeblikk / tidshopp
                        </span>
                      ) : null}
                    </span>
                    {r.events.length ? (
                      <span className="block truncate text-[11px] text-status-uncertain">
                        {r.events.map((e) => CONTINUITY_KIND_LABEL[e.kind]).join(", ")}
                        {r.events.some((e) => eventMidScene(state, e)) ? " midt i scenen" : ""}
                      </span>
                    ) : r.appearance.active.length ? (
                      <span className="block truncate text-[11px] text-text-tertiary">
                        {r.appearance.active
                          .filter((e) => e.duration !== "permanent")
                          .map((e) => e.description || CONTINUITY_KIND_LABEL[e.kind])
                          .join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        className="size-6 rounded-sm bg-surface-3 object-contain"
                      />
                    ) : null}
                    {look ? variantName(look) : "standard"}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-border px-3 py-2 text-[11px] text-text-tertiary">
            Utseendet ved begynnelsen av hver scene. Nedtonet: {asset.name} nevnes ikke i scenen.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Look({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="size-2.5 rounded-full border border-border"
        style={{ background: color }}
      />
      {name}
    </span>
  );
}

function EventForm({
  state,
  asset,
  fields,
  isNew,
  onChange,
  onSave,
  onCancel,
}: {
  state: ProjectState;
  asset: Asset;
  fields: ContinuityEventFields;
  isNew: boolean;
  onChange: (f: ContinuityEventFields) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const occs = allMainOccurrences(state);
  const variants = variantsOf(state, asset.id).filter(
    (v) => !v.archived || v.id === fields.fromVariantId || v.id === fields.toVariantId,
  );
  const occ = occs.find((o) => o.sceneId === fields.sceneId);
  // Linjene i scenevarianten linjen hører til (ellers hovedfilmens variant)
  const own = fields.blockId ? state.blocks[fields.blockId] : undefined;
  const variantId =
    (own && state.variants[own.variantId]?.sceneId === fields.sceneId
      ? own.variantId
      : undefined) ??
    occ?.variantId ??
    Object.values(state.variants).find((v) => v.sceneId === fields.sceneId)?.id;
  const blocks = variantId
    ? blocksOfVariant(state, variantId).filter((b) => b.kind !== "heading")
    : [];
  const set = (p: Partial<ContinuityEventFields>) => onChange({ ...fields, ...p });
  const sceneOptions = occs.map((o) => (
    <option key={o.id} value={o.sceneId}>
      {o.productionNumber ? `${o.productionNumber}. ` : ""}
      {formatHeading(state.variants[o.variantId]!.heading)}
      {o.active ? "" : " (deaktivert)"}
    </option>
  ));
  return (
    <form
      aria-label={isNew ? "Ny kontinuitetshendelse" : "Endre kontinuitetshendelse"}
      className="flex flex-col gap-2 border border-border bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Label text="Hva skjer">
          <select
            value={fields.kind}
            onChange={(e) => set({ kind: e.target.value as ContinuityKind })}
            className={selectCls}
          >
            {CONTINUITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {CONTINUITY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Label>
        <Label text="Beskrivelse" grow>
          <Input
            value={fields.description}
            maxLength={2000}
            placeholder={`F.eks. ${asset.name} klipper håret kort`}
            onChange={(e) => set({ description: e.target.value })}
            className="h-8 bg-surface-3 text-[13px]"
          />
        </Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Label text="Scene">
          <select
            value={fields.sceneId}
            onChange={(e) => set({ sceneId: e.target.value as never, blockId: null })}
            className={`${selectCls} max-w-[280px]`}
          >
            {occ ? null : <option value={fields.sceneId}>(scenen er ikke i hovedfilmen)</option>}
            {sceneOptions}
          </select>
        </Label>
        <Label text="Fra linjen" grow>
          <select
            value={fields.blockId ?? ""}
            onChange={(e) => set({ blockId: (e.target.value || null) as never })}
            className={`${selectCls} w-full`}
          >
            <option value="">Fra scenens begynnelse</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {excerpt(b.text, 80)}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Label text="Utseende før">
          <select
            value={fields.fromVariantId ?? ""}
            onChange={(e) => set({ fromVariantId: (e.target.value || null) as never })}
            className={selectCls}
          >
            <option value="">— ikke valgt —</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.appearance ? ` (${v.appearance})` : ""}
              </option>
            ))}
          </select>
        </Label>
        <ArrowRight className="mb-2 size-4 text-text-tertiary" aria-hidden />
        <Label text="Utseende etter">
          <select
            value={fields.toVariantId ?? ""}
            onChange={(e) => set({ toVariantId: (e.target.value || null) as never })}
            className={selectCls}
          >
            <option value="">— ingen egen variant —</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.appearance ? ` (${v.appearance})` : ""}
              </option>
            ))}
          </select>
        </Label>
        <Label text="Varer">
          <select
            value={fields.duration}
            onChange={(e) => set({ duration: e.target.value as ContinuityDuration })}
            className={selectCls}
          >
            {(["permanent", "temporary", "scene"] as const).map((d) => (
              <option key={d} value={d}>
                {CONTINUITY_DURATION_LABEL[d]}
              </option>
            ))}
          </select>
        </Label>
        {fields.duration === "temporary" ? (
          <Label text="Over fra scene">
            <select
              value={fields.untilSceneId ?? ""}
              onChange={(e) => set({ untilSceneId: (e.target.value || null) as never })}
              className={`${selectCls} max-w-[240px]`}
            >
              <option value="">— velg —</option>
              {sceneOptions}
            </select>
          </Label>
        ) : null}
      </div>
      {variants.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">
          Lag visuelle varianter (f.eks. «Langt hår» og «Kort hår») for å velge utseendet før og
          etter. Hendelsen kan også lagres bare med beskrivelse.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <Check />
          {isNew ? "Lagre hendelsen" : "Lagre endringen"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}

function Label({ text, grow, children }: { text: string; grow?: boolean; children: ReactNode }) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-text-tertiary${grow ? " min-w-[200px] flex-1" : ""}`}
    >
      {text}
      {children}
    </label>
  );
}
