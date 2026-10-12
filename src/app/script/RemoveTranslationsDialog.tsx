/**
 * Fjern alle oversettelser til et språk (DEC-0073, KI-114): én samlet, angrebar endring. Norsk manus røres
 * ikke. Nødvendig f.eks. for å kunne angre en manusimport som har fått oversettelser.
 */
import { useMemo, useState } from "react";
import { LANGUAGE_LABEL, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** ID-ene til oversettelsene som er i bruk for språket (manuslinjer og scenehoder). */
export function liveTranslationIds(s: ProjectState, language: string): string[] {
  return Object.values(s.translations)
    .filter((t) => !t.removed && t.language === language)
    .map((t) => t.id);
}

export function RemoveTranslationsDialog({
  open,
  onOpenChange,
  state,
  language,
  cmds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  language: string;
  cmds: Commands;
}) {
  const ids = useMemo(() => liveTranslationIds(state, language), [state, language]);
  const [err, setErr] = useState<string | null>(null);
  const name = (LANGUAGE_LABEL[language] ?? language).toLowerCase();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fjern alle oversettelser til {name}?</DialogTitle>
          <DialogDescription>
            {ids.length} {ids.length === 1 ? "oversettelse" : "oversettelser"} i hele prosjektet
            (alle produksjoner) fjernes i én endring. Det norske manuset endres ikke, og alt kan
            angres (Cmd/Ctrl + Z).
          </DialogDescription>
        </DialogHeader>
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            variant="destructive"
            disabled={ids.length === 0}
            onClick={() => {
              const e = cmds.run(
                { type: "SetTranslationsRemoved", translationIds: ids as never, removed: true },
                `Fjern alle oversettelser til ${name}`,
              );
              setErr(e);
              if (!e) onOpenChange(false);
            }}
          >
            Fjern {ids.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
