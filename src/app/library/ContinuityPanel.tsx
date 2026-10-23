/**
 * Kontinuitet for en karakter eller ressurs (M6 del 2, DEC-0055, REQ-0150–0158, REQ-0155):
 * hendelser som endrer utseendet (hårklipp, kostyme, skade …), forslag fra manuset som må godkjennes
 * eller avvises, og en tidslinje over scenene i fortellingsrekkefølge med utseendet i hver scene.
 */
import { Thumbnail } from "@/app/shared/Thumbnail";
import { SceneSelect, mainOccurrenceOfScene } from "@/app/shell/SceneSelect";
import { ArrowRight, Check, Clock, Lightbulb, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { CONTINUITY_DURATION_LABEL, CONTINUITY_KIND_LABEL, CONTINUITY_KINDS, appearanceAt, eventApplies, eventMidScene, eventSceneId, blocksOfVariant, continuityEventsOf, continuityFor, continuitySuggestions, continuityTimeline, excerpt, formatHeading, newId, orderedOccurrences, variantsOf, versionsOf, type Asset, type ContinuityDuration, type ContinuityEvent, type ContinuityEventFields, type ContinuityKind, type ContinuitySuggestion, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useImageUrls } from "./asset-images";
import { t } from "@/core/i18n/keyed";

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
    const scene = o?.productionNumber
      ? t("app-library-continuity-panel.scene.message.5f8240fabfbf", { productionNumber: String(o.productionNumber) })
      : t("app-library-continuity-panel.scene.message.7f3ea3e47349");
    return `${scene}${v ? ` – ${formatHeading(v.heading)}` : ""}`;
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
        t("app-library-continuity-panel.dismiss.cmds-run.a1e5b58350a2"),
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
          t("app-library-continuity-panel.r.cmds-run.2ca43faa672b", { name: String(asset.name) }),
        )
      : cmds.run(
          {
            type: "AddContinuityEvents",
            events: [{ eventId: newId<"continuity_event">(), fields: f }],
          },
          t("app-library-continuity-panel.r.cmds-run.6bc5e98852af", { name: String(asset.name) }),
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
    <section aria-label={t("app-library-continuity-panel.continuity-panel.aria-label.f4aa145dd848")} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 whitespace-nowrap text-sm font-medium text-text-primary">
          {t("app-library-continuity-panel.continuity-panel.h2.f4aa145dd848")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {t("app-library-continuity-panel.continuity-panel.span.d10ca3cc794d")}
        </span>
        {editable && !editing ? (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => setEditing({ id: null, fields: blank() })}
            title={
              derived
                ? t("app-library-continuity-panel.continuity-panel.title.74911220b77e", { prodName: String(prodName) })
                : undefined
            }
          >
            <Plus />
            {derived
              ? t("app-library-continuity-panel.continuity-panel.button.4ed5b0fbda51", { name: String(prod!.name) })
              : t("app-library-continuity-panel.continuity-panel.button.76e2ee2f73d3")}
          </Button>
        ) : null}
      </div>

      {/* Forslag fra manuset */}
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-1.5 border border-status-uncertain/40 bg-status-uncertain-bg p-3">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
            <Lightbulb className="size-4 text-status-uncertain" aria-hidden />
            {t("app-library-continuity-panel.continuity-panel.h3.d71a904dcabc")} ({suggestions.length})
          </h3>
          <p className="text-[11px] text-text-tertiary">
            {t("app-library-continuity-panel.continuity-panel.p.4b4f64452be1", { name: String(asset.name) })}
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
                    {x.number ? t("app-library-continuity-panel.continuity-panel.button.915a34558ecb", { number: String(x.number) }) : t("app-library-continuity-panel.continuity-panel.button.9f8e9eed3ef5")}
                  </button>
                  <span className="block text-text-secondary">
                    {t("app-library-continuity-panel.continuity-panel.span.365af2e91108", { text: String(x.text) })}
                  </span>
                </span>
                {editable ? (
                  <span className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing({ id: null, fields: fromSuggestion(x) })}
                      title={t("app-library-continuity-panel.continuity-panel.title.7da29c98f645")}
                    >
                      <Check />
                      {t("app-library-continuity-panel.continuity-panel.button.b411bda25ced")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss(x)}
                      title={t("app-library-continuity-panel.continuity-panel.title.d4d250bd4658")}
                    >
                      <X />
                      {t("app-library-continuity-panel.continuity-panel.button.43e71da0f697")}
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
          {t("app-library-continuity-panel.continuity-panel.p.e32d23438993", { name: String(asset.name) })}
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
                    <span className="rounded-sm bg-surface-3 px-1 text-[11px] text-text-secondary">
                      {e.productionId
                        ? t("app-library-continuity-panel.continuity-panel.span.87dd6cacf301", { name: String(prod!.name) })
                        : t("app-library-continuity-panel.continuity-panel.span.ad72e894ef88")}
                    </span>
                  ) : null}
                  {eventApplies(state, e) ? null : derived &&
                    !e.productionId &&
                    e.disabledIn?.includes(productionId as never) ? (
                    <span className="rounded-sm bg-status-uncertain-bg px-1 text-[11px] text-status-uncertain">
                      {t("app-library-continuity-panel.continuity-panel.span.48f51fe85e00", { name: String(prod!.name) })}
                    </span>
                  ) : (
                    <span className="rounded-sm bg-status-uncertain-bg px-1 text-[11px] text-status-uncertain">
                      {t("app-library-continuity-panel.continuity-panel.span.8878a8833f6b")}
                    </span>
                  )}
                  <span className="rounded-sm bg-surface-3 px-1 text-[11px] text-text-secondary">
                    {e.duration === "temporary"
                      ? t("app-library-continuity-panel.continuity-panel.span.43e5432815fd", { value1: String(sceneLabel(e.untilSceneId).split(" – ")[0]!.toLowerCase()) })
                      : CONTINUITY_DURATION_LABEL[e.duration].toLowerCase()}
                  </span>
                </span>
                {e.description ? (
                  <span className="mt-0.5 block text-text-secondary">{e.description}</span>
                ) : null}
                {e.blockId && state.blocks[e.blockId] ? (
                  <span className="mt-0.5 block text-text-tertiary">
                    {t("app-library-continuity-panel.continuity-panel.span.a8d810745431")} «{excerpt(state.blocks[e.blockId]!.text, 90)}»
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
                            ? t("app-library-continuity-panel.continuity-panel.cmds-run.c1eed607fac6", { name: String(prod!.name) })
                            : t("app-library-continuity-panel.continuity-panel.cmds-run.ab88db920d4f", { name: String(prod!.name) }),
                        ),
                      );
                    }}
                    title={t("app-library-continuity-panel.continuity-panel.title.ef68f2719a3b")}
                  >
                    {e.disabledIn?.includes(productionId as never)
                      ? t("app-library-continuity-panel.continuity-panel.button.64c4f8d8f19a", { name: String(prod!.name) })
                      : t("app-library-continuity-panel.continuity-panel.button.052644afeddc", { name: String(prod!.name) })}
                  </Button>
                </span>
              ) : editable ? (
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ id: e.id, fields: fieldsOf(e) })}
                    title={t("app-library-continuity-panel.continuity-panel.title.25481a6d0d81")}
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
                          t("app-library-continuity-panel.continuity-panel.cmds-run.425c76b29417"),
                        ),
                      )
                    }
                    title={t("app-library-continuity-panel.continuity-panel.title.4f95f8d9f31f")}
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
            {showDismissed ? t("app-library-continuity-panel.continuity-panel.button.dd048a258922") : t("app-library-continuity-panel.continuity-panel.button.caa969f8b7ba")}{" "}
            {t("app-library-continuity-panel.continuity-panel.button.94f5381b1e20")} ({dismissed.length})
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
                            t("app-library-continuity-panel.continuity-panel.cmds-run.66f47868a5a8"),
                          ),
                        )
                      }
                      title={t("app-library-continuity-panel.continuity-panel.title.bd8f9cd18a77")}
                    >
                      <Undo2 />
                      {t("app-library-continuity-panel.continuity-panel.button.66f47868a5a8")}
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
        <div
          aria-label={t("app-library-continuity-panel.continuity-panel.aria-label.cddcd082f32d")}
          className="border border-border bg-surface-1"
        >
          <div className="flex h-8 items-center gap-1.5 border-b border-border bg-surface-2 px-2 text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
            <Clock className="size-3.5" aria-hidden />
            {t("app-library-continuity-panel.continuity-panel.div.132c27c40f4c")}
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
                    title={t("app-library-continuity-panel.continuity-panel.title.b7352afa1a75")}
                  >
                    {r.number ?? "–"}
                  </button>
                  <span className="min-w-0">
                    <span className="block truncate text-text-primary">
                      {r.heading || "—"}
                      {r.nonLinear ? (
                        <span className="ml-1.5 rounded-sm bg-surface-3 px-1 text-[11px] text-text-secondary">
                          {t("app-library-continuity-panel.continuity-panel.span.b8347098e40b")}
                        </span>
                      ) : null}
                    </span>
                    {r.events.length ? (
                      <span className="block truncate text-[11px] text-status-uncertain">
                        {r.events.map((e) => CONTINUITY_KIND_LABEL[e.kind]).join(", ")}
                        {r.events.some((e) => eventMidScene(state, e))
                          ? t("app-library-continuity-panel.continuity-panel.span.90ed61bda97b")
                          : ""}
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
                      <Thumbnail
                        src={url}
                        alt=""
                        className="size-6 rounded-sm bg-surface-3"
                      />
                    ) : null}
                    {look ? variantName(look) : t("app-library-continuity-panel.continuity-panel.span.7c48db48aef3")}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="border-t border-border px-3 py-2 text-[11px] text-text-tertiary">
            {t("app-library-continuity-panel.continuity-panel.p.6b716428961b", { name: String(asset.name) })}
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
  const sceneOptions = occs.map((o) => ({
    value: o.sceneId as string,
    number: o.productionNumber ?? undefined,
    label: formatHeading(state.variants[o.variantId]!.heading) + (o.active ? "" : t("app-library-continuity-panel.scene-options.option.f0b8db8fd1be")),
    occurrence: o,
  }));
  return (
    <form
      aria-label={
        isNew
          ? t("app-library-continuity-panel.event-form.aria-label.4bcd20c83dfc")
          : t("app-library-continuity-panel.event-form.aria-label.afb17f78957c")
      }
      className="flex flex-col gap-2 border border-border bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Label text={t("app-library-continuity-panel.event-form.text.9c82a371587c")}>
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
        <Label text={t("app-library-continuity-panel.event-form.text.40e98daba786")} grow>
          <Input
            value={fields.description}
            maxLength={2000}
            placeholder={t("app-library-continuity-panel.event-form.placeholder.fb9474ffd015", { name: String(asset.name) })}
            onChange={(e) => set({ description: e.target.value })}
            className="h-8 bg-surface-3 text-[13px]"
          />
        </Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Label text={t("app-library-continuity-panel.event-form.text.db03614ef542")}>
          <SceneSelect
            ariaLabel={t("app-library-continuity-panel.event-form.text.db03614ef542")}
            value={fields.sceneId}
            onChange={(v) => set({ sceneId: v as never, blockId: null })}
            className={`${selectCls} max-w-[280px]`}
            options={occ ? sceneOptions : [{ value: fields.sceneId, label: t("app-library-continuity-panel.event-form.option.ce2524bfc27e") }, ...sceneOptions]}
          />
        </Label>
        <Label text={t("app-library-continuity-panel.event-form.text.71345582b956")} grow>
          <select
            value={fields.blockId ?? ""}
            onChange={(e) => set({ blockId: (e.target.value || null) as never })}
            className={`${selectCls} w-full`}
          >
            <option value="">{t("app-library-continuity-panel.event-form.option.4bb5be059581")}</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {excerpt(b.text, 80)}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Label text={t("app-library-continuity-panel.event-form.text.f6175b2fe111")}>
          <select
            value={fields.fromVariantId ?? ""}
            onChange={(e) => set({ fromVariantId: (e.target.value || null) as never })}
            className={selectCls}
          >
            <option value="">{t("app-library-continuity-panel.event-form.option.397bdf198f8e")}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.appearance ? ` (${v.appearance})` : ""}
              </option>
            ))}
          </select>
        </Label>
        <ArrowRight className="mb-2 size-4 text-text-tertiary" aria-hidden />
        <Label text={t("app-library-continuity-panel.event-form.text.8ae985f70afd")}>
          <select
            value={fields.toVariantId ?? ""}
            onChange={(e) => set({ toVariantId: (e.target.value || null) as never })}
            className={selectCls}
          >
            <option value="">{t("app-library-continuity-panel.event-form.option.5cd838bdea16")}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.appearance ? ` (${v.appearance})` : ""}
              </option>
            ))}
          </select>
        </Label>
        <Label text={t("app-library-continuity-panel.event-form.text.d8c860f02481")}>
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
          <Label text={t("app-library-continuity-panel.event-form.text.ca435491c8fe")}>
            <SceneSelect
              ariaLabel={t("app-library-continuity-panel.event-form.text.ca435491c8fe")}
              value={fields.untilSceneId ?? ""}
              onChange={(v) => set({ untilSceneId: (v || null) as never })}
              className={`${selectCls} max-w-[240px]`}
              emptyLabel={t("app-library-continuity-panel.event-form.option.e3e5e0b263d9")}
              options={sceneOptions}
            />
          </Label>
        ) : null}
      </div>
      {variants.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">
          {t("app-library-continuity-panel.event-form.p.8745f0219a80")}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <Check />
          {isNew ? t("app-library-continuity-panel.event-form.button.2b6273e2a2f0") : t("app-library-continuity-panel.event-form.button.79307226f5a4")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("app-library-continuity-panel.event-form.button.d594a54b4cec")}
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
