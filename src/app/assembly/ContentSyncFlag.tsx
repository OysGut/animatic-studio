/**
 * Flagget «Ressurs oppdatert» (REQ-0022, DEC-0072/0078): scenen er laget med en eldre versjon av en ressurs
 * enn den som er godkjent nå. Vises i monteringens scenepanel og i sceneeditoren, og åpner arbeidslisten
 * (AssetWorklistDialog). Ingenting endres før brukeren velger det i arbeidslisten.
 */
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { contentSyncText, type ProjectState, type SceneContentSync } from "@/core";
import { useSession } from "@/app/auth/use-session";
import { AssetWorklistDialog } from "@/app/library/AssetWorklistDialog";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

export function ContentSyncFlag({
  state,
  projectId,
  productionId,
  sync,
  editable,
  cmds,
  compact = false,
}: {
  /** Smal verktøylinje: bare ikonet under 2xl (teksten står i verktøytipset og for skjermlesere). */
  compact?: boolean;
  state: ProjectState;
  projectId: string;
  productionId: string;
  /** Flagget for scenen, eller undefined (da vises ingenting). */
  sync: SceneContentSync | undefined;
  editable: boolean;
  /** Kommandoene til arbeidsflaten (så endringer i arbeidslisten kan angres der). */
  cmds?: Commands | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!sync) return null;
  const text = contentSyncText(state, sync);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("app-assembly-content-sync-flag.content-sync-flag.title.29374ef3194f", { text: String(text) })}
        aria-label={t("app-assembly-content-sync-flag.content-sync-flag.aria-label.eb0da6188e26", { text: String(text) })}
        data-testid="content-sync-flag"
        className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-status-uncertain/50 bg-surface-2 px-1.5 text-[11px] text-text-primary hover:bg-surface-3"
      >
        <ListChecks className="size-3 text-status-uncertain" aria-hidden />
        <span className={compact ? "hidden 2xl:inline" : undefined}>
          {t("app-assembly-content-sync-flag.content-sync-flag.span.a775e049bd65")}
        </span>
      </button>
      {open ? (
        cmds ? (
          <AssetWorklistDialog
            open
            onOpenChange={setOpen}
            state={state}
            projectId={projectId}
            productionId={productionId}
            editable={editable}
            cmds={cmds}
          />
        ) : (
          <OwnCommandsWorklist
            state={state}
            projectId={projectId}
            productionId={productionId}
            editable={editable}
            onClose={() => setOpen(false)}
          />
        )
      ) : null}
    </>
  );
}

/** Uten arbeidsflatens kommandoer: egne, bare mens dialogen er åpen (som varselet på prosjektoversikten). */
function OwnCommandsWorklist({
  state,
  projectId,
  productionId,
  editable,
  onClose,
}: {
  state: ProjectState;
  projectId: string;
  productionId: string;
  editable: boolean;
  onClose: () => void;
}) {
  const session = useSession();
  const userId = session.status === "signed-in" ? session.session.user.id : "";
  const cmds = useCommands(projectId, userId, editable && !!userId);
  return (
    <AssetWorklistDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      state={state}
      projectId={projectId}
      productionId={productionId}
      editable={editable && !!userId}
      cmds={cmds}
    />
  );
}
