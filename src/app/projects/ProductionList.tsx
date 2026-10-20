/**
 * Produksjonene i prosjektet på oversikten, med «Ny produksjon …» og «Legg til scener …» (DEC-0057), dato og
 * notat om hva hver produksjon er (DEC-0082).
 */
import { useNavigate } from "@tanstack/react-router";
import { CornerUpLeft, FileText, Film, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import {
  L,
  PRODUCTION_KIND_LABEL,
  locale,
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
import { t } from "@/core/i18n/keyed";

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
  /** Produksjonen der notatet redigeres, og teksten. */
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const productions = sortedProductions(state);
  const saveNote = () => {
    if (!editing) return;
    const p = state.productions[editing.id];
    if (p && (p.note ?? "") !== editing.text.trim()) {
      const e = cmds.run(
        { type: "SetProductionNote", productionId: editing.id as never, note: editing.text },
        t("app-projects-production-list.e.cmds-run.d195c6205e6c", { name: String(p.name) }),
      );
      if (e) {
        setNoteErr(e);
        return;
      }
    }
    setNoteErr(null);
    setEditing(null);
  };
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
        <div className="grid grid-cols-[1fr_140px_70px_70px_auto] border-b border-border px-4 py-2 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
          <span>{t("app-projects-production-list.production-list.span.968a2d180d71")}</span>
          <span>{t("app-projects-production-list.production-list.span.8cf8bf3b36a1")}</span>
          <span className="text-right">{t("app-projects-production-list.production-list.span.69edc139f15f")}</span>
          <span className="text-right">{t("app-projects-production-list.production-list.span.6fee261a2d87")}</span>
          <span className="w-[340px]" />
        </div>
        {productions.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-[1fr_140px_70px_70px_auto] items-start border-b border-border px-4 py-1.5 text-[13px] last:border-b-0"
          >
            <div className="min-w-0 py-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium text-text-primary">{p.name}</span>
                {p.createdAt ? (
                  <span className="tabular shrink-0 text-xs text-text-tertiary">
                    {new Date(p.createdAt).toLocaleDateString(locale())}
                  </span>
                ) : null}
                {editable && editing?.id !== p.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNoteErr(null);
                      setEditing({ id: p.id, text: p.note ?? "" });
                    }}
                    title={t("app-projects-production-list.production-list.title.a55c354dc8c8")}
                    aria-label={t("app-projects-production-list.production-list.aria-label.e51bd43db83d", { name: String(p.name) })}
                    className="shrink-0 rounded-sm p-0.5 text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Pencil className="size-3" />
                  </button>
                ) : null}
              </div>
              {editing?.id === p.id ? (
                <div className="mt-1 flex flex-col gap-1">
                  <textarea
                    autoFocus
                    rows={2}
                    maxLength={2000}
                    value={editing.text}
                    aria-label={t("app-projects-production-list.production-list.aria-label.5aa7d1769e4a", { name: String(p.name) })}
                    placeholder={t("app-projects-production-list.production-list.placeholder.3c42b353d3ee")}
                    onChange={(e) => setEditing({ id: p.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditing(null);
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
                    }}
                    className="resize-y rounded-sm border border-border-control bg-surface-3 px-2 py-1 text-[13px] text-text-primary"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={saveNote}>
                      {t("app-projects-production-list.production-list.button.210b2c82ebf1")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t("app-projects-production-list.production-list.button.12b16db9caae")}
                    </Button>
                  </div>
                  {noteErr ? (
                    <p role="alert" className="text-xs text-status-danger">
                      {noteErr}
                    </p>
                  ) : null}
                </div>
              ) : p.note ? (
                <p className="mt-0.5 whitespace-pre-line text-xs text-text-secondary">{p.note}</p>
              ) : null}
            </div>
            <span className="py-1 text-text-secondary">{PRODUCTION_KIND_LABEL[p.kind]}</span>
            <span className="tabular py-1 text-right text-text-secondary">
              {orderedOccurrences(state, p.id).length}
            </span>
            <span className="tabular py-1 text-right text-text-secondary">
              {activeStructure(state, p.id).length}
            </span>
            <span className="flex w-[340px] justify-end gap-1 py-0.5">
              {p.kind !== "main" && promotionCandidates(state, p.id).length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPromote(p.id)}
                  title={t("app-projects-production-list.production-list.title.32bbd282791d")}
                >
                  <CornerUpLeft />
                  {t("app-projects-production-list.production-list.button.1b1d9a055c41")}
                </Button>
              ) : null}
              {editable && p.kind !== "main" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ addTo: p.id })}
                  title={t("app-projects-production-list.production-list.title.1bb0355b716e")}
                >
                  <Plus />
                  {t("app-projects-production-list.production-list.button.69edc139f15f")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => open(p.id, "/prosjekt/$projectId/manus")}
              >
                <FileText />
                {t("app-projects-production-list.production-list.button.54d322bcdcee")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => open(p.id, "/prosjekt/$projectId/montering")}
              >
                <Film />
                {t("app-projects-production-list.production-list.button.0de49086546c")}
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
          {t("app-projects-production-list.production-list.button.d17ecf1a77cc")}
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
