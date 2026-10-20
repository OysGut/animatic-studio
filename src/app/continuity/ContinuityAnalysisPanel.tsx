/**
 * Rådgivende kontinuitetsanalyse på prosjektoversikten (M6 del 3, DEC-0056, REQ-0319–0324, REQ-0129,
 * REQ-0132, REQ-0314). Funnene er råd: ingenting endres. Usikre funn er merket. «Skjul» er en
 * visningshandling som huskes per prosjekt i denne nettleseren (KI-105, samme mønster som forslagene i
 * biblioteket); funnet står fortsatt og kan vises igjen.
 */
import { Link } from "@tanstack/react-router";
import {
  CircleHelp,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Library,
  Plus,
  SearchCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FINDING_LABEL, continuityAnalysis, includeSceneCommands, sortedProductions, type Finding, type FindingKind, type ProjectState } from "@/core";
import { Button } from "@/components/ui/button";
import { useCommands } from "@/app/project/use-commands";
import { readHiddenFindings, writeHiddenFindings } from "./hidden-findings";
import { t } from "@/core/i18n/keyed";

const ORDER: readonly FindingKind[] = [
  "spinoff_gap",
  "timeline_conflict",
  "unexplained_change",
  "asset_outdated",
  "refers_deactivated",
  "before_intro",
  "before_established",
  "name_variant",
];

/** Funn som gjelder 2D-scenen, åpnes i sceneeditoren; resten i manuset. */
const IN_SCENE_EDITOR = new Set<FindingKind>(["unexplained_change", "asset_outdated"]);

export function ContinuityAnalysisPanel({
  state,
  projectId,
  productionId: mainId,
  userId,
  editable = false,
}: {
  state: ProjectState;
  projectId: string;
  /** Hovedfilmen (standard); avledede produksjoner kan velges i panelet (DEC-0060). */
  productionId: string;
  userId?: string;
  editable?: boolean;
}) {
  const productions = sortedProductions(state);
  const [chosen, setChosen] = useState(mainId);
  const productionId = state.productions[chosen] ? chosen : mainId;
  const prod = state.productions[productionId];
  const derived = !!prod && prod.kind !== "main";
  const cmds = useCommands(projectId, userId ?? "", editable && !!userId);
  const [err, setErr] = useState<string | null>(null);
  const findings = useMemo(() => continuityAnalysis(state, productionId), [state, productionId]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(
    () => new Set(readHiddenFindings(projectId)),
  );
  // Et annet prosjekt i samme komponent: les dets skjulte funn
  const [hiddenFor, setHiddenFor] = useState(projectId);
  if (hiddenFor !== projectId) {
    setHiddenFor(projectId);
    setHidden(new Set(readHiddenFindings(projectId)));
  }
  useEffect(() => {
    if (hiddenFor === projectId) writeHiddenFindings(projectId, hidden);
  }, [hidden, hiddenFor, projectId]);
  const [showHidden, setShowHidden] = useState(false);
  const shown = findings.filter((f) => showHidden || !hidden.has(f.key));
  const hiddenCount = findings.filter((f) => hidden.has(f.key)).length;
  const groups = ORDER.map((k) => ({ kind: k, items: shown.filter((f) => f.kind === k) })).filter(
    (g) => g.items.length,
  );

  return (
    <section aria-labelledby="continuity-title" className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="continuity-title" className="text-base font-semibold text-text-primary">
          {t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.h2.e12c9ec8d67a")}
        </h2>
        <span className="text-xs text-text-tertiary">
          {t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.span.c7f319dc227a")}
        </span>
        {productions.length > 1 ? (
          <select
            aria-label={t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.aria-label.93689bf603f1")}
            value={productionId}
            onChange={(e) => setChosen(e.target.value)}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
        {hiddenCount ? (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
          >
            {showHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showHidden
              ? t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.button.2a798bfbe96c")
              : t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.button.bfc722871c4b", { hiddenCount: String(hiddenCount) })}
          </button>
        ) : null}
      </div>
      <div className="border border-border bg-surface-1">
        {findings.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-text-secondary">
            <SearchCheck className="size-4 text-status-success" aria-hidden />
            {t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.p.4ef3a75ebdb1")}
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-text-tertiary">
            {t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.p.af81201123a8")}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.kind} className="border-b border-border last:border-b-0">
              <h3 className="flex items-center gap-2 px-4 pb-1 pt-2.5 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
                {FINDING_LABEL[g.kind]}
                <span className="tabular normal-case tracking-normal">{g.items.length}</span>
              </h3>
              <ul className="pb-1.5">
                {g.items.map((f) => (
                  <FindingRow
                    key={f.key}
                    f={f}
                    projectId={projectId}
                    production={derived && editable && userId ? prod!.name : null}
                    onInclude={(occId) =>
                      setErr(
                        includeSceneCommands(state, productionId, occId)
                          .map((c) =>
                            cmds.run(
                              c,
                              t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.cmds-run.82d940fab072", { name: String(prod!.name) }),
                            ),
                          )
                          .find((x) => x) ?? null,
                      )
                    }
                    onDisableEvent={(eventId) =>
                      setErr(
                        cmds.run(
                          {
                            type: "SetContinuityEventDisabled",
                            eventId: eventId as never,
                            productionId: productionId as never,
                            disabled: true,
                          },
                          t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.cmds-run.2d37690e25d9", { name: String(prod!.name) }),
                        ),
                      )
                    }
                    hidden={hidden.has(f.key)}
                    onToggle={() =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (n.has(f.key)) n.delete(f.key);
                        else n.add(f.key);
                        return n;
                      })
                    }
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      {err ? (
        <p role="alert" className="mt-1 text-xs text-status-danger">
          {err}
        </p>
      ) : null}
      {findings.some((f) => f.certainty === "uncertain") ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-text-tertiary">
          <CircleHelp className="size-3" aria-hidden />
          {t("app-continuity-continuity-analysis-panel.continuity-analysis-panel.p.cda8c242a64d")}
        </p>
      ) : null}
    </section>
  );
}

function FindingRow({
  f,
  projectId,
  hidden,
  onToggle,
  production,
  onInclude,
  onDisableEvent,
}: {
  f: Finding;
  projectId: string;
  hidden: boolean;
  onToggle: () => void;
  /** Navnet på den avledede produksjonen når funnet kan løses der (DEC-0060), ellers null. */
  production: string | null;
  onInclude: (mainOccurrenceId: string) => void;
  onDisableEvent: (eventId: string) => void;
}) {
  const uncertain = f.certainty === "uncertain";
  return (
    <li
      className={
        "group flex items-start gap-2 px-4 py-1.5 text-[13px] hover:bg-surface-2" +
        (hidden ? " opacity-50" : "")
      }
    >
      {uncertain ? (
        <CircleHelp
          className="mt-0.5 size-3.5 shrink-0 text-text-tertiary"
          aria-label={t("app-continuity-continuity-analysis-panel.finding-row.aria-label.c5772cc515f5")}
        />
      ) : (
        <TriangleAlert
          className="mt-0.5 size-3.5 shrink-0 text-status-moved"
          aria-label={t("app-continuity-continuity-analysis-panel.finding-row.aria-label.0440cdf1bb18")}
        />
      )}
      <span className="min-w-0 flex-1 text-text-primary">{f.message}</span>
      <span className="flex shrink-0 items-center gap-1">
        {production && f.includeOccurrenceId ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onInclude(f.includeOccurrenceId!)}
            title={t("app-continuity-continuity-analysis-panel.finding-row.title.e58706170cd4", { production: String(production) })}
          >
            <Plus />
            {t("app-continuity-continuity-analysis-panel.finding-row.button.d1992e5381ee")}
          </Button>
        ) : null}
        {production && f.eventId ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDisableEvent(f.eventId!)}
            title={t("app-continuity-continuity-analysis-panel.finding-row.title.b8cd9877c07c", { production: String(production) })}
          >
            {t("app-continuity-continuity-analysis-panel.finding-row.button.0e9731b099e9")} {production}
          </Button>
        ) : null}
        {f.occurrenceId && IN_SCENE_EDITOR.has(f.kind) ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/scene"
              params={{ projectId }}
              search={{ scene: f.occurrenceId }}
              title={t("app-continuity-continuity-analysis-panel.finding-row.title.1ae8af000877")}
            >
              <Layers />
              {t("app-continuity-continuity-analysis-panel.finding-row.link.598f88f98058")}
            </Link>
          </Button>
        ) : f.occurrenceId ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/manus"
              params={{ projectId }}
              search={{ scene: f.occurrenceId, ...(f.blockId ? { blokk: f.blockId } : {}) }}
              title={t("app-continuity-continuity-analysis-panel.finding-row.title.3b3cbd15c22c")}
            >
              <FileText />
              {t("app-continuity-continuity-analysis-panel.finding-row.link.bf5c8d993e68")}
            </Link>
          </Button>
        ) : null}
        {f.assetId ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/bibliotek"
              params={{ projectId }}
              search={{ asset: f.assetId }}
              title={t("app-continuity-continuity-analysis-panel.finding-row.title.7b99489540ba")}
            >
              <Library aria-hidden />
              {t("app-continuity-continuity-analysis-panel.finding-row.link.e1776164cc11")}
            </Link>
          </Button>
        ) : null}
        {/* Skjul er en visningshandling, ikke et råd: dempet, med tekst (UX-gjennomgang DEC-0076, funn 10) */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggle}
          title={
            hidden
              ? t("app-continuity-continuity-analysis-panel.finding-row.title.4a76d0f14664")
              : t("app-continuity-continuity-analysis-panel.finding-row.title.5c45cd626ceb")
          }
          aria-label={hidden ? t("app-continuity-continuity-analysis-panel.finding-row.aria-label.e971f112cb08") : t("app-continuity-continuity-analysis-panel.finding-row.aria-label.853ff45b289f")}
          className="text-text-tertiary"
        >
          {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          {hidden ? t("app-continuity-continuity-analysis-panel.finding-row.button.ed62e1e48487") : t("app-continuity-continuity-analysis-panel.finding-row.button.ef1142d2b743")}
        </Button>
      </span>
    </li>
  );
}
