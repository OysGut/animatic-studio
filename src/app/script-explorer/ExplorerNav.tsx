/**
 * «Åpne i …»-raden, ressursbrikkene og brikkemenyen i manusutforskeren (Øystein 23.10). Bare navigasjon:
 * ingen skriving. Fra popup-vinduet åpnes målene i hovedvinduet (window.opener).
 */
import { BookOpen, ChevronDown, Clapperboard, Film, FlaskConical, Mic, Box, MapPin, User } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Asset, AssetUsage } from "@/core";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { t } from "@/core/i18n/keyed";

export interface OpenTargets {
  readonly script: string;
  readonly assembly: string;
  readonly scene: string;
  readonly dialogue: string | null;
  readonly storylab: string;
}

export function projectUrls(projectId: string, occurrenceId: string, blockId: string | null, dialogueBlockId: string | null): OpenTargets {
  const base = `/prosjekt/${encodeURIComponent(projectId)}`;
  const q = (v: Record<string, string>) => new URLSearchParams(v).toString();
  const withBlock = { scene: occurrenceId, ...(blockId ? { blokk: blockId } : {}) };
  return {
    script: `${base}/manus?${q(withBlock)}`,
    assembly: `${base}/montering?${q(withBlock)}`,
    scene: `${base}/scene?${q({ scene: occurrenceId })}`,
    dialogue: dialogueBlockId ? `${base}/scene?${q({ scene: occurrenceId, line: dialogueBlockId })}` : null,
    storylab: `${base}/storylab?${q({ scene: occurrenceId })}`,
  };
}
export function libraryUrl(projectId: string, assetId: string): string {
  return `/prosjekt/${encodeURIComponent(projectId)}/bibliotek?${new URLSearchParams({ asset: assetId })}`;
}

function OpenLink({ href, testId, icon, label, aria, onOpen }: { href: string; testId: string; icon: ReactNode; label: string; aria: string; onOpen: (url: string) => void }) {
  return <a href={href} data-testid={testId} title={aria} aria-label={aria} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onOpen(href); }} className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-brand [&_svg]:size-3.5">{icon}{label}</a>;
}

export function OpenInBar({ targets, onOpen }: { targets: OpenTargets; onOpen: (url: string) => void }) {
  return <div role="group" aria-label={t("script-explorer2.open.group")} data-testid="script-explorer-open-in" className="flex flex-wrap items-center gap-0.5">
    <span className="pr-1 text-xs text-text-tertiary">{t("script-explorer2.open.group")}</span>
    <OpenLink href={targets.script} testId="script-explorer-open-script" icon={<BookOpen />} label={t("script-explorer2.open.script")} aria={t("app-script-explorer-script-explorer.explorer-content.link.20fc3e3355c1")} onOpen={onOpen} />
    <OpenLink href={targets.assembly} testId="script-explorer-open-assembly" icon={<Film />} label={t("script-explorer2.open.assembly")} aria={t("script-explorer2.open.assembly-aria")} onOpen={onOpen} />
    <OpenLink href={targets.scene} testId="script-explorer-open-scene" icon={<Clapperboard />} label={t("script-explorer2.open.scene")} aria={t("script-explorer2.open.scene-aria")} onOpen={onOpen} />
    {targets.dialogue
      ? <OpenLink href={targets.dialogue} testId="script-explorer-open-dialogue" icon={<Mic />} label={t("script-explorer2.open.dialogue")} aria={t("script-explorer2.open.dialogue-aria")} onOpen={onOpen} />
      : <ToolbarButton disabled data-testid="script-explorer-open-dialogue" title={t("script-explorer2.open.dialogue-none")} aria-label={t("script-explorer2.open.dialogue-none")}><Mic />{t("script-explorer2.open.dialogue")}</ToolbarButton>}
    <OpenLink href={targets.storylab} testId="script-explorer-open-storylab" icon={<FlaskConical />} label={t("script-explorer2.open.storylab")} aria={t("script-explorer2.open.storylab-aria")} onOpen={onOpen} />
  </div>;
}

const KIND_ICON: Record<string, ReactNode> = { character: <User />, object: <Box />, location: <MapPin /> };

export interface AssetMenuProps {
  readonly asset: Asset;
  readonly usages: readonly AssetUsage[];
  readonly currentOccurrenceId: string | null;
  readonly onGo: (occurrenceId: string) => void;
  readonly onFilter: () => void;
  readonly onOpen: (url: string) => void;
  readonly library: string;
  readonly onClose: () => void;
  readonly position?: { readonly x: number; readonly y: number };
}

/** Neste/forrige/første opptreden ut fra rekkefølgen i produksjonen. */
export function appearanceTargets(usages: readonly AssetUsage[], current: string | null): { prev: string | null; next: string | null; first: string | null } {
  const ids = usages.map((u) => u.occurrenceId);
  const at = current ? ids.indexOf(current) : -1;
  return { first: ids[0] ?? null, prev: at > 0 ? ids[at - 1]! : null, next: at >= 0 ? ids[at + 1] ?? null : ids[0] ?? null };
}

export function AssetMenu(p: AssetMenuProps) {
  const menu = useRef<HTMLDivElement | null>(null);
  const [all, setAll] = useState(false);
  const targets = appearanceTargets(p.usages, p.currentOccurrenceId);
  useLayoutEffect(() => { menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus(); }, []);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) p.onClose(); };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [p.onClose]);
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); p.onClose(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const list = items(); const i = list.indexOf(document.activeElement as HTMLElement);
    const n = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    list[n]?.focus();
  };
  const item = (testId: string, label: string, run: (() => void) | null) => <button type="button" role="menuitem" data-testid={testId} aria-disabled={run ? undefined : true} tabIndex={-1} className={"block w-full rounded-sm px-2 py-1 text-left text-xs focus-visible:bg-surface-3 focus-visible:outline-none " + (run ? "text-text-primary hover:bg-surface-3" : "text-text-tertiary")} onClick={() => { if (!run) return; run(); if (testId !== "asset-menu-all") p.onClose(); }}>{label}</button>;
  const name = p.asset.name;
  return <div ref={menu} role="menu" data-explorer-menu data-testid="script-explorer-asset-menu" aria-label={t("script-explorer2.chip.menu", { name })} onKeyDown={onKey} className={(p.position ? "fixed" : "absolute left-0 top-full mt-1") + " z-50 w-64 rounded-sm border border-border-strong bg-surface-2 p-1 shadow-[var(--shadow-float)]"} style={p.position ? { left: p.position.x, top: p.position.y } : undefined}>
    {item("asset-menu-library", t("script-explorer2.menu.library"), () => p.onOpen(p.library))}
    {item("asset-menu-filter", t("script-explorer2.menu.filter"), p.onFilter)}
    {item("asset-menu-next", t("script-explorer2.menu.next"), targets.next ? () => p.onGo(targets.next!) : null)}
    {item("asset-menu-prev", t("script-explorer2.menu.prev"), targets.prev ? () => p.onGo(targets.prev!) : null)}
    {item("asset-menu-first", t("script-explorer2.menu.first"), targets.first ? () => p.onGo(targets.first!) : null)}
    {item("asset-menu-all", t("script-explorer2.menu.all", { name }), p.usages.length ? () => setAll((v) => !v) : null)}
    {all ? <div role="group" aria-label={t("script-explorer2.menu.all", { name })} className="max-h-48 overflow-y-auto border-t border-border pt-1">
      {p.usages.map((u) => <button key={u.occurrenceId} type="button" role="menuitem" tabIndex={-1} data-testid="asset-menu-scene" data-occurrence-id={u.occurrenceId} aria-current={u.occurrenceId === p.currentOccurrenceId ? "true" : undefined} className="block w-full rounded-sm px-2 py-0.5 text-left text-xs text-text-secondary hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none" onClick={() => { p.onGo(u.occurrenceId); p.onClose(); }}>{t("script-explorer2.menu.scene", { number: u.number ?? "–" })}</button>)}
    </div> : null}
  </div>;
}

export function AssetChips({ assets, open, onToggle, renderMenu }: { assets: readonly Asset[]; open: string | null; onToggle: (assetId: string | null) => void; renderMenu: (asset: Asset) => ReactNode }) {
  if (!assets.length) return null;
  return <ul aria-label={t("script-explorer2.chips.label")} data-testid="script-explorer-chips" className="flex flex-wrap gap-1">
    {assets.map((a) => <li key={a.id} className="relative">
      <button type="button" data-testid="script-explorer-chip" data-asset-id={a.id} data-kind={a.kind} aria-haspopup="menu" aria-expanded={open === a.id} aria-label={t("script-explorer2.chip.menu", { name: a.name })} onClick={() => onToggle(open === a.id ? null : a.id)} className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-surface-3 px-2 text-xs text-text-primary hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-brand [&_svg]:size-3">{KIND_ICON[a.kind]}{a.name}<ChevronDown aria-hidden /></button>
      {open === a.id ? renderMenu(a) : null}
    </li>)}
  </ul>;
}
