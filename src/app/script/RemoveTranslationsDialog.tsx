/**
 * Fjern alle oversettelser til et språk (DEC-0073, KI-114): én samlet, angrebar endring. Norsk manus røres
 * ikke. Nødvendig f.eks. for å kunne angre en manusimport som har fått oversettelser.
 */
import { useMemo, useState } from "react";
import { LANGUAGE_LABEL, type ProjectState, languageWord } from "@/core";
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
import { t as tk, tLocalized } from "@/core/i18n/keyed";

/** Språknavn i engelsk (LANGUAGE_LABEL er norsk). */
const LANGUAGE_WORD: Record<string, string> = tLocalized({ nb: "app-script-remove-translations-dialog.language-word-nb", en: "app-script-remove-translations-dialog.language-word-en" });

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
  const name = LANGUAGE_WORD[language] ?? languageWord(language);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tk("app-script-remove-translations-dialog.remove-translations-dialog.dialog-title.59acc8f2b352", { name: String(name) })}
          </DialogTitle>
          <DialogDescription>
            {ids.length}{" "}
            {ids.length === 1
              ? tk("app-script-remove-translations-dialog.remove-translations-dialog.dialog-description.4db1acb59b42")
              : tk("app-script-remove-translations-dialog.remove-translations-dialog.dialog-description.8fb918cc1538")}{" "}
            {tk("app-script-remove-translations-dialog.remove-translations-dialog.dialog-description.8e2ea1fe2838")}
          </DialogDescription>
        </DialogHeader>
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tk("app-script-remove-translations-dialog.remove-translations-dialog.button.1bcfda73aa1e")}
          </Button>
          <Button
            variant="destructive"
            disabled={ids.length === 0}
            onClick={() => {
              const e = cmds.run(
                { type: "SetTranslationsRemoved", translationIds: ids as never, removed: true },
                tk("app-script-remove-translations-dialog.e.cmds-run.ec50f7b3b45e", { name: String(name) }),
              );
              setErr(e);
              if (!e) onOpenChange(false);
            }}
          >
            {tk("app-script-remove-translations-dialog.remove-translations-dialog.button.298f4d9b8845")} {ids.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
