/**
 * Fjern alle oversettelser til et språk (DEC-0073, KI-114): én samlet, angrebar endring. Norsk manus røres
 * ikke. Nødvendig f.eks. for å kunne angre en manusimport som har fått oversettelser.
 */
import { useMemo, useState } from "react";
import { L, LANGUAGE_LABEL, type ProjectState, languageWord } from "@/core";
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

/** Språknavn i engelsk (LANGUAGE_LABEL er norsk). */
const LANGUAGE_NAME_EN: Record<string, string> = { nb: "Norwegian", en: "English" };

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
  const name = L(languageWord(language), LANGUAGE_NAME_EN[language] ?? language);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {L(`Fjern alle oversettelser til ${name}?`, `Remove all translations into ${name}?`)}
          </DialogTitle>
          <DialogDescription>
            {ids.length}{" "}
            {ids.length === 1
              ? L("oversettelse", "translation")
              : L("oversettelser", "translations")}{" "}
            {L(
              "i hele prosjektet (alle produksjoner) fjernes i én endring. Det norske manuset endres ikke, og alt kan angres (Cmd/Ctrl + Z).",
              "across the whole project (all productions) are removed in one change. The Norwegian script is not changed, and everything can be undone (Cmd/Ctrl + Z).",
            )}
          </DialogDescription>
        </DialogHeader>
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {L("Avbryt", "Cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={ids.length === 0}
            onClick={() => {
              const e = cmds.run(
                { type: "SetTranslationsRemoved", translationIds: ids as never, removed: true },
                L(`Fjern alle oversettelser til ${name}`, `Remove all translations into ${name}`),
              );
              setErr(e);
              if (!e) onOpenChange(false);
            }}
          >
            {L("Fjern", "Remove")} {ids.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
