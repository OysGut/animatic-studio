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
import {
  FINDING_LABEL,
  continuityAnalysis,
  includeSceneCommands,
  sortedProductions,
  type Finding,
  type FindingKind,
  type ProjectState,
} from "@/core";
import { Button } from "@/components/ui/button";
import { useCommands } from "@/app/project/use-commands";
import { readHiddenFindings, writeHiddenFindings } from "./hidden-findings";

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
          Kontinuitetsanalyse
        </h2>
        <span className="text-xs text-text-tertiary">
          Råd om manus og produksjon – ingenting endres automatisk.
        </span>
        {productions.length > 1 ? (
          <select
            aria-label="Produksjon for analysen"
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
            {showHidden ? "Skjul igjen" : `Vis skjulte (${hiddenCount})`}
          </button>
        ) : null}
      </div>
      <div className="border border-border bg-surface-1">
        {findings.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-text-secondary">
            <SearchCheck className="size-4 text-status-success" aria-hidden />
            Ingen funn. Manus, kontinuitet og 2D-scener henger sammen.
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-text-tertiary">Alle funn er skjult.</p>
        ) : (
          groups.map((g) => (
            <div key={g.kind} className="border-b border-border last:border-b-0">
              <h3 className="flex items-center gap-2 px-4 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
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
                          .map((c) => cmds.run(c, `Ta med scene i ${prod!.name}`))
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
                          `Slå av hendelsen i ${prod!.name}`,
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
          Usikre funn bygger på tolkning av teksten og kan være feil.
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
        <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-label="Usikkert" />
      ) : (
        <TriangleAlert
          className="mt-0.5 size-3.5 shrink-0 text-status-moved"
          aria-label="Sannsynlig"
        />
      )}
      <span className="min-w-0 flex-1 text-text-primary">{f.message}</span>
      <span className="flex shrink-0 items-center gap-1">
        {production && f.includeOccurrenceId ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onInclude(f.includeOccurrenceId!)}
            title={`Legg hovedfilmens scene inn i ${production} (på plassen den har i hovedfilmen)`}
          >
            <Plus />
            Ta med scenen
          </Button>
        ) : null}
        {production && f.eventId ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDisableEvent(f.eventId!)}
            title={`Endringen gjelder ikke i ${production}. Hovedfilmen endres ikke.`}
          >
            Slå av i {production}
          </Button>
        ) : null}
        {f.occurrenceId && IN_SCENE_EDITOR.has(f.kind) ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/scene"
              params={{ projectId }}
              search={{ scene: f.occurrenceId }}
              title="Åpne scenen i sceneeditoren"
            >
              <Layers />
              Sceneeditor
            </Link>
          </Button>
        ) : f.occurrenceId ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/manus"
              params={{ projectId }}
              search={{ scene: f.occurrenceId, ...(f.blockId ? { blokk: f.blockId } : {}) }}
              title="Vis linjen i manuset"
            >
              <FileText />
              Manus
            </Link>
          </Button>
        ) : null}
        {f.assetId ? (
          <Button size="sm" variant="ghost" asChild>
            <Link
              to="/prosjekt/$projectId/bibliotek"
              params={{ projectId }}
              search={{ asset: f.assetId }}
              title="Åpne ressursen i biblioteket"
            >
              <Library aria-hidden />
              Bibliotek
            </Link>
          </Button>
        ) : null}
        {/* Skjul er en visningshandling, ikke et råd: dempet, med tekst (UX-gjennomgang DEC-0076, funn 10) */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggle}
          title={hidden ? "Vis funnet igjen" : "Skjul funnet (huskes i denne nettleseren)"}
          aria-label={hidden ? "Vis funnet" : "Skjul funnet"}
          className="text-text-tertiary"
        >
          {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          {hidden ? "Vis" : "Skjul"}
        </Button>
      </span>
    </li>
  );
}
