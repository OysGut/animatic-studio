/**
 * «Tekst»-menyen i sceneeditoren (MTS MT2/MT4/MT5): legg til tekst, ny lower third, bruk en mal fra
 * biblioteket, og «Bruk samme design som i scene …». Alt lager vanlige lag via kommandoer.
 */
import { useMemo, useState } from "react";
import { Type } from "lucide-react";
import { type Composition, type ProjectState } from "@/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { GlobalLibraryDialog } from "@/app/global/GlobalLibraryDialog";
import type { Commands } from "@/app/project/use-commands";
import {
  addLowerThird,
  addTextLayer,
  applySameDesign,
  applyTemplateVersion,
  lowerThirdUses,
  type Run,
} from "./mts-actions";
import { t as tk } from "@/core/i18n/keyed";

/** Malene i prosjektbiblioteket med nyeste versjon. */
function projectTemplates(state: ProjectState) {
  const out: { assetId: string; name: string; versionId: string; number: number }[] = [];
  for (const a of Object.values(state.assets)) {
    if (a.kind !== "template" || a.archived || a.removed) continue;
    const vers = Object.values(state.assetVersions).filter(
      (v) => v.template && !v.removed && state.assetVariants[v.variantId]?.assetId === a.id,
    );
    const latest = vers.sort((x, y) => y.number - x.number)[0];
    if (latest) out.push({ assetId: a.id, name: a.name, versionId: latest.id, number: latest.number });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function TextMenu({
  state,
  composition,
  run,
  cmds,
  onAdded,
}: {
  state: ProjectState;
  composition: Composition;
  run: Run;
  /** GP6: trengs for «bruk i prosjekt» fra det globale biblioteket. */
  cmds: Commands;
  onAdded: (layerId: string) => void;
}) {
  const [globalOpen, setGlobalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templates = useMemo(() => projectTemplates(state), [state]);
  const uses = useMemo(
    () => lowerThirdUses(state).filter((u) => u.compositionId !== composition.id),
    [state, composition.id],
  );
  const firstLayerOf = (instanceId: string) =>
    Object.values(state.layers).find((l) => l.template?.instanceId === instanceId && !l.groupId)?.id;
  const done = (r: { layerId: string; error: string | null }) => {
    setError(r.error);
    if (!r.error) onAdded(r.layerId);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarButton variant="default" data-testid="mts-text-menu" aria-label={tk("app-scene-editor-text-menu.text-menu.aria-label.258937cf8a87")}>
            <Type aria-hidden />
            <span className="sr-only min-[1400px]:not-sr-only">{tk("app-scene-editor-text-menu.text-menu.span.0c9d947920d5")}</span>
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[70vh] overflow-auto">
          <DropdownMenuItem data-testid="mts-add-text" onSelect={() => done(addTextLayer(run, composition))}>
            {tk("app-scene-editor-text-menu.text-menu.dropdown-menu-item.561c381e21f3")}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="mts-add-lower-third" onSelect={() => done(addLowerThird(run, composition))}>
            {tk("app-scene-editor-text-menu.text-menu.dropdown-menu-item.3eb87d0f3000")}
          </DropdownMenuItem>
          {uses.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{tk("app-scene-editor-text-menu.text-menu.dropdown-menu-label.a1c09757a8ee")}</DropdownMenuLabel>
              {uses.map((u) => (
                <DropdownMenuItem
                  key={u.instanceId}
                  data-testid={`mts-same-design-${u.instanceId}`}
                  onSelect={() => {
                    const r = applySameDesign(run, state, composition, u);
                    setError(r.error);
                    if (!r.error) {
                      // Tilstanden er oppdatert lokalt; laget velges når det finnes
                      queueMicrotask(() => {
                        const id = firstLayerOf(r.instanceId);
                        if (id) onAdded(id);
                      });
                    }
                  }}
                >
                  {tk("app-scene-editor-text-menu.text-menu.dropdown-menu-item.eefacd23e8d1", { sceneLabel: String(u.sceneLabel), templateName: String(u.templateName), versionNumber: String(u.versionNumber) })}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="mts-global-templates" onSelect={() => setGlobalOpen(true)}>
            {tk("app-scene-editor-text-menu.text-menu.dropdown-menu-item.08ecf6fcd8d2")}
          </DropdownMenuItem>
          {templates.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{tk("app-scene-editor-text-menu.text-menu.dropdown-menu-label.779a9dea3449")}</DropdownMenuLabel>
              {templates.map((t) => (
                <DropdownMenuItem
                  key={t.assetId}
                  data-testid={`mts-apply-template-${t.assetId}`}
                  onSelect={() => {
                    const r = applyTemplateVersion(run, state, composition, t.versionId, undefined, tk("app-scene-editor-text-menu.r.apply-template-version.ba6942789333", { name: String(t.name) }));
                    setError(r.error);
                  }}
                >
                  {tk("app-scene-editor-text-menu.text-menu.dropdown-menu-item.f4972adfe1bb", { name: String(t.name), number: String(t.number) })}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <GlobalLibraryDialog
        open={globalOpen}
        onOpenChange={setGlobalOpen}
        state={state}
        cmds={cmds}
        editable
        fixedKind="template"
        onUsed={(assetId) => {
          // Tilstanden er skrevet; finn nyeste malversjon av ressursen og bruk den (M2)
          const fresh = cmds.current() ?? state;
          const vers = Object.values(fresh.assetVersions).filter(
            (v) => v.template && !v.removed && fresh.assetVariants[v.variantId]?.assetId === assetId,
          );
          const latest = vers.sort((x, y) => y.number - x.number)[0];
          if (latest) {
            const name = fresh.assets[assetId]?.name ?? "";
            const r = applyTemplateVersion(run, fresh, composition, latest.id, undefined, tk("app-scene-editor-text-menu.r.apply-template-version.bf65dfd51649", { name: String(name) }));
            setError(r.error);
          }
        }}
      />
      {error ? (
        <span role="alert" data-testid="mts-text-menu-error" className="text-xs text-status-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
