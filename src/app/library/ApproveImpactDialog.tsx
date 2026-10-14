/**
 * Godkjenning av et nytt bilde med konsekvenser (M6 del 3, DEC-0056, REQ-0130/0132/0134/0314): viser
 * scenene som berøres og lar brukeren velge scene for scene om det nye bildet skal brukes. Ferdig film der
 * ressursen er med, vises som «kan være påvirket» (usikkert) – den endres ikke.
 */
import { CircleHelp, Film, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import {
  L,
  applyCommand,
  approveWithImpactCommands,
  assetVersionImpact,
  formatHeading,
  newId,
  type AssetVariant,
  type AssetVersion,
  type ProjectState,
  type SceneImpact,
} from "@/core";
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

/** Scenene der godkjenningen endrer noe (eller kan endre noe). Tom liste = godkjenn uten spørsmål. */
export function useApproveImpact(
  state: ProjectState,
  productionId: string,
  variantId: string,
  versionId: string | null,
): SceneImpact[] {
  return useMemo(
    () => (versionId ? assetVersionImpact(state, productionId, variantId, versionId) : []),
    [state, productionId, variantId, versionId],
  );
}

export function ApproveImpactDialog({
  state,
  productionId,
  variant,
  version,
  cmds,
  onClose,
}: {
  state: ProjectState;
  productionId: string;
  variant: AssetVariant;
  /** Versjonen som skal godkjennes; null = lukket. */
  version: AssetVersion | null;
  cmds: Commands;
  onClose: () => void;
}) {
  const impact = useApproveImpact(state, productionId, variant.id, version?.id ?? null);
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const changing = (x: SceneImpact) =>
    x.layers.some((l) => l.mode === "follows" || l.mode === "locked");
  const withLayers = impact.filter(changing);
  const films = impact.filter((x) => x.filmTakeIds.length > 0);
  const otherProductions = withLayers.some((x) => x.productionId !== productionId);
  const label = (x: SceneImpact) => {
    const o = x.occurrenceId ? state.occurrences[x.occurrenceId] : undefined;
    const c = x.compositionId ? state.compositions[x.compositionId] : undefined;
    const v = state.variants[o?.variantId ?? c?.variantId ?? ""];
    const prod =
      x.productionId && x.productionId !== productionId
        ? ` · ${state.productions[x.productionId]?.name ?? L("annen produksjon", "another production")}`
        : !x.occurrenceId
          ? L(" · ikke i noen produksjon", " · not in any production")
          : "";
    return `${x.number ? `${x.number}. ` : ""}${v ? formatHeading(v.heading) : "Scene"}${x.active || !x.occurrenceId ? "" : L(" (deaktivert)", " (inactive)")}${prod}`;
  };

  function close() {
    setKeep(new Set());
    setErr(null);
    onClose();
  }

  function confirm() {
    if (!version) return;
    const commands = approveWithImpactCommands(state, variant.id, version.id, impact, keep);
    // Prøv hele kjeden lokalt først, så godkjenningen ikke blir halvveis
    let probe = state;
    for (const c of commands) {
      const r = applyCommand(probe, {
        id: newId<"command">(),
        actor: "00000000-0000-7000-8000-000000000000" as never,
        at: new Date().toISOString(),
        command: c,
      });
      if (!r.ok) {
        setErr(
          L(
            `Godkjenningen kan ikke gjøres: ${r.error.message}`,
            `The approval cannot be made: ${r.error.message}`,
          ),
        );
        return;
      }
      probe = r.state;
    }
    const group = newId();
    for (const c of commands) {
      const e = cmds.run(
        c,
        c.type === "ApproveAssetVersion"
          ? L(
              `Godkjenn v${version.number} av «${variant.name}»`,
              `Approve v${version.number} of “${variant.name}”`,
            )
          : L("Bilder i valgte scener", "Images in the chosen scenes"),
        group,
      );
      if (e) {
        setErr(e);
        return;
      }
    }
    close();
  }

  return (
    <Dialog open={version !== null} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="max-h-[88vh] max-w-[640px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {L("Godkjenn", "Approve")} v{version?.number} {L("av «", "of “")}
            {variant.name}
            {L("»", "”")}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Bildet brukes i scenene under. Velg hvilke som skal få det nye bildet – de andre beholder bildet de har nå.",
              "The image is used in the scenes below. Choose which ones get the new image – the others keep the image they have now.",
            )}
          </DialogDescription>
        </DialogHeader>
        {withLayers.length ? (
          <ul
            aria-label={L("Scener med 2D-scene", "Scenes with a 2D scene")}
            className="flex flex-col gap-1"
          >
            {withLayers.map((x) => {
              const on = !keep.has(x.key);
              const follows = x.layers.filter((l) => l.mode === "follows" && l.versionId).length;
              const locked = x.layers.filter((l) => l.mode === "locked").length;
              const newer = x.layers.filter((l) => l.mode === "locked_newer").length;
              return (
                <li key={x.key}>
                  <label className="flex items-start gap-2 rounded-sm bg-surface-1 px-2 py-1.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setKeep((s) => {
                          const n = new Set(s);
                          if (n.has(x.key)) n.delete(x.key);
                          else n.add(x.key);
                          return n;
                        })
                      }
                      className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-text-primary">
                        <Layers className="size-3.5 text-text-tertiary" aria-hidden />
                        {label(x)}
                      </span>
                      <span className="block text-[11px] text-text-tertiary">
                        {on
                          ? L("Får det nye bildet", "Gets the new image")
                          : L("Beholder bildet den har nå", "Keeps the image it has now")}
                        {locked && on
                          ? L(
                              ` (${locked} låst bilde oppdateres)`,
                              ` (${locked} locked image updated)`,
                            )
                          : ""}
                        {follows && !on
                          ? L(
                              ` (${follows} bilde låses til dagens versjon)`,
                              ` (${follows} image locked to today's version)`,
                            )
                          : ""}
                        {newer
                          ? L(
                              ` · ${newer} bilde er låst til en nyere versjon og endres ikke`,
                              ` · ${newer} image is locked to a newer version and is not changed`,
                            )
                          : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-text-secondary">
            {L("Ingen 2D-scener får et annet bilde.", "No 2D scenes get a different image.")}
          </p>
        )}
        {otherProductions ? (
          <p className="text-[11px] text-text-tertiary">
            {L(
              "Godkjenningen gjelder hele prosjektet, også andre produksjoner.",
              "The approval applies to the whole project, including other productions.",
            )}
          </p>
        ) : null}
        {films.length ? (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <CircleHelp className="size-3.5 text-text-tertiary" aria-hidden />
              {L(
                "Ferdig film kan være påvirket (usikkert – filmen endres ikke, kontroller den selv):",
                "A finished film may be affected (uncertain – the film is not changed, check it yourself):",
              )}
            </p>
            <ul className="flex flex-col gap-0.5 pl-5 text-xs text-text-tertiary">
              {films.map((x) => (
                <li key={x.key} className="flex items-center gap-1.5">
                  <Film className="size-3" aria-hidden />
                  {label(x)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {L("Avbryt", "Cancel")}
          </Button>
          <Button onClick={confirm}>{L("Godkjenn", "Approve")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
