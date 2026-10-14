/**
 * Varsel i prosjektoversikten når scener viser eldre versjoner av ressurser (arbeidslisten, DEC-0072).
 */
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { L, type ProjectState } from "@/core";
import { useCommands } from "@/app/project/use-commands";
import { AssetWorklistDialog, useWorklistCount } from "@/app/library/AssetWorklistDialog";
import { Button } from "@/components/ui/button";

export function WorklistNotice({
  state,
  projectId,
  productionId,
  userId,
  editable,
}: {
  state: ProjectState;
  projectId: string;
  productionId: string;
  userId: string;
  editable: boolean;
}) {
  const n = useWorklistCount(state, projectId, productionId);
  const cmds = useCommands(projectId, userId, editable);
  const [open, setOpen] = useState(false);
  if (n === 0) return null;
  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
      <ListChecks className="size-3.5 text-status-uncertain" aria-hidden />
      {n === 1
        ? L("Ett sted i filmen viser", "One place in the film shows")
        : L(`${n} steder i filmen viser`, `${n} places in the film show`)}{" "}
      {L(
        "en eldre versjon av en ressurs enn den som er godkjent.",
        "an older version of an asset than the one that is approved.",
      )}
      <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setOpen(true)}>
        {L("Arbeidsliste …", "Worklist …")}
      </Button>
      {open ? (
        <AssetWorklistDialog
          open={open}
          onOpenChange={setOpen}
          state={state}
          projectId={projectId}
          productionId={productionId}
          editable={editable}
          cmds={cmds}
        />
      ) : null}
    </p>
  );
}
