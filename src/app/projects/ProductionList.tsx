/**
 * Produksjonene i prosjektet på oversikten, med «Ny produksjon …» og «Legg til scener …» (DEC-0057).
 */
import { useNavigate } from "@tanstack/react-router";
import { CornerUpLeft, FileText, Film, Plus } from "lucide-react";
import { useState } from "react";
import {
  PRODUCTION_KIND_LABEL,
  activeStructure,
  orderedOccurrences,
  promotionCandidates,
  sortedProductions,
  type ProjectState,
} from "@/core";
import { useCommands } from "@/app/project/use-commands";
import { useActiveProduction } from "@/app/project/use-production";
import { Button } from "@/components/ui/button";
import { ProductionDialog } from "./ProductionDialog";
import { PromotionDialog } from "./PromotionDialog";

export function ProductionList({
  state,
  projectId,
  userId,
  editable,
}: {
  state: ProjectState;
  projectId: string;
  userId: string;
  editable: boolean;
}) {
  const cmds = useCommands(projectId, userId, editable);
  const navigate = useNavigate();
  const [, setActive] = useActiveProduction(projectId, state);
  const [dialog, setDialog] = useState<{ addTo: string | null } | null>(null);
  /** Tilbakeføring fra en avledet produksjon (DEC-0060). */
  const [promote, setPromote] = useState<string | null>(null);
  const productions = sortedProductions(state);
  const open = (
    id: string,
    to: "/prosjekt/$projectId/manus" | "/prosjekt/$projectId/montering",
  ) => {
    setActive(id);
    void navigate({ to, params: { projectId } });
  };
  return (
    <>
      <div className="border border-border bg-surface-1">
        <div className="grid grid-cols-[1fr_140px_70px_70px_auto] border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
          <span>Navn</span>
          <span>Type</span>
          <span className="text-right">Scener</span>
          <span className="text-right">Aktive</span>
          <span className="w-[340px]" />
        </div>
        {productions.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-[1fr_140px_70px_70px_auto] items-center border-b border-border px-4 py-1.5 text-[13px] last:border-b-0"
          >
            <span className="truncate font-medium text-text-primary">{p.name}</span>
            <span className="text-text-secondary">{PRODUCTION_KIND_LABEL[p.kind]}</span>
            <span className="tabular text-right text-text-secondary">
              {orderedOccurrences(state, p.id).length}
            </span>
            <span className="tabular text-right text-text-secondary">
              {activeStructure(state, p.id).length}
            </span>
            <span className="flex w-[340px] justify-end gap-1">
              {p.kind !== "main" && promotionCandidates(state, p.id).length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPromote(p.id)}
                  title="Se hva produksjonen har endret, og før det du vil tilbake til hovedfilmen"
                >
                  <CornerUpLeft />
                  Tilbakefør
                </Button>
              ) : null}
              {editable && p.kind !== "main" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ addTo: p.id })}
                  title="Gjenbruk flere scener fra en annen produksjon"
                >
                  <Plus />
                  Scener
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => open(p.id, "/prosjekt/$projectId/manus")}
              >
                <FileText />
                Manus
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => open(p.id, "/prosjekt/$projectId/montering")}
              >
                <Film />
                Film
              </Button>
            </span>
          </div>
        ))}
      </div>
      {editable && productions.length ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => setDialog({ addTo: null })}
        >
          <Plus />
          Ny produksjon …
        </Button>
      ) : null}
      <ProductionDialog
        key={dialog?.addTo ?? "new"}
        state={state}
        cmds={cmds}
        open={dialog !== null}
        addTo={dialog?.addTo ?? null}
        onOpenChange={(o) => (o ? null : setDialog(null))}
        onCreated={(id) => setActive(id)}
      />
      {promote ? (
        <PromotionDialog
          state={state}
          cmds={cmds}
          productionId={promote}
          editable={editable}
          open
          onOpenChange={(o) => (o ? null : setPromote(null))}
        />
      ) : null}
    </>
  );
}
