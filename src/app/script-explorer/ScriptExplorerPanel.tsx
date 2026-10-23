import { Maximize2, Minimize2, PanelLeft, PanelRight, PinIcon, X } from "lucide-react";
import { UiId } from "@/app/shared/UiId";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { useSession } from "@/app/auth/use-session";
import { useUiPref } from "@/app/account/ui-prefs";
import { sourceWindowId } from "@/app/shell/current-scene";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { ScriptExplorer } from "./ScriptExplorer";
import { explorerUrl, type ExplorerState } from "./explorer-state";
import {
  PREF_KEYS, WIN_EDGES, defaultRect, keyResizeRect, layoutRect, moveRect, popupFeatures, resizeRect, toggleMaximized,
  validPopupPref, validWindowPref, type PopupPref, type Viewport, type WinEdge, type WinLayout, type WinRect, type WindowPref,
} from "./window-geometry";
import { t } from "@/core/i18n/keyed";

const viewportNow = (): Viewport => ({ w: window.innerWidth, h: window.innerHeight });

function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(viewportNow);
  useEffect(() => {
    const on = () => setVp(viewportNow());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

const GRIP_CLASS: Record<WinEdge, string> = {
  n: "left-3 right-3 top-0 h-1.5 cursor-ns-resize",
  s: "bottom-0 left-3 right-6 h-1.5 cursor-ns-resize",
  e: "bottom-6 right-0 top-3 w-1.5 cursor-ew-resize",
  w: "bottom-3 left-0 top-3 w-1.5 cursor-ew-resize",
  ne: "right-0 top-0 size-3 cursor-nesw-resize",
  nw: "left-0 top-0 size-3 cursor-nwse-resize",
  sw: "bottom-0 left-0 size-3 cursor-nesw-resize",
  se: "bottom-0 right-0 size-6 cursor-nwse-resize",
};

export function ScriptExplorerPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const session = useSession();
  const userId = session.status === "signed-in" ? session.session.user.id : "";
  const vp = useViewport();
  const [pref, setPref] = useUiPref<WindowPref | null>(PREF_KEYS.window, null, validWindowPref);
  const [popupPref] = useUiPref<PopupPref | null>(PREF_KEYS.popup, null, validPopupPref);
  const [live, setLive] = useState<WinRect | null>(null);
  const latest = useRef<ExplorerState>({ modus: "follow" });
  const popup = useRef<HTMLDivElement | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const dragging = useRef<{ x: number; y: number; start: WinRect; edge: WinEdge | "move" } | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const input = popup.current?.querySelector<HTMLInputElement>('[data-testid="script-explorer-search"]');
      (input ?? popup.current)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (session.status !== "signed-in") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [data-radix-popper-content-wrapper], [data-explorer-menu]')) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && !popup.current?.contains(focused) && focused.matches('input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, session.status]);
  if (session.status !== "signed-in") return null;
  const layout: WinLayout = pref?.layout ?? "free";
  const stored = pref?.rect ?? defaultRect(vp);
  const rect = live ?? layoutRect(layout, stored, vp);
  const setLayout = (next: WinLayout) => setPref({ rect: stored, layout: next });
  const pin = () => {
    const source = sourceWindowId();
    const url = explorerUrl(projectId, source, latest.current);
    const opened = window.open(url, `animatic-manusutforsker-${projectId}-${source}`, popupFeatures(popupPref, { w: rect.w, h: rect.h }));
    if (opened) { opened.focus(); onClose(); } else setBlocked(url);
  };
  const begin = (edge: WinEdge | "move") => (e: PointerEvent<HTMLElement>) => {
    if (e.button > 0) return;
    if (edge === "move" && (e.target as Element).closest("button,a")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = { x: e.clientX, y: e.clientY, start: rect, edge };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = dragging.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    setLive(d.edge === "move" ? moveRect(d.start, dx, dy, vp) : resizeRect(d.start, d.edge, dx, dy, vp));
  };
  const end = () => {
    const d = dragging.current; dragging.current = null;
    if (d && live) setPref({ rect: live, layout: "free" });
    setLive(null);
  };
  const maximized = layout === "max";
  return <div ref={popup} role="dialog" aria-modal={false} aria-label={t("app-script-explorer-script-explorer-panel.script-explorer-panel.aria-label.404e4b629270")} tabIndex={-1} data-testid="script-explorer" data-layout={layout} className="group/win fixed z-40 flex flex-col overflow-hidden rounded-sm border border-border-strong bg-surface-1 shadow-[var(--shadow-float)]" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
    <div data-testid="script-explorer-titlebar" className="flex h-9 shrink-0 cursor-move items-center gap-1 border-b border-border bg-surface-2 px-3" onPointerDown={begin("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDoubleClick={(e) => { if ((e.target as Element).closest("button,a")) return; setLayout(toggleMaximized(layout)); }}>
      <span className="flex-1 select-none text-xs font-semibold text-text-primary">{t("app-script-explorer-script-explorer-panel.script-explorer-panel.span.404e4b629270")}</span>
      <ToolbarButton variant="icon" data-testid="script-explorer-snap-left" active={layout === "left"} aria-pressed={layout === "left"} title={t("script-explorer2.window.snap-left")} aria-label={t("script-explorer2.window.snap-left")} onClick={() => setLayout(layout === "left" ? "free" : "left")}><PanelLeft /></ToolbarButton>
      <ToolbarButton variant="icon" data-testid="script-explorer-snap-right" active={layout === "right"} aria-pressed={layout === "right"} title={t("script-explorer2.window.snap-right")} aria-label={t("script-explorer2.window.snap-right")} onClick={() => setLayout(layout === "right" ? "free" : "right")}><PanelRight /></ToolbarButton>
      <ToolbarButton variant="icon" data-testid="script-explorer-maximize" aria-pressed={maximized} title={maximized ? t("script-explorer2.window.restore") : t("script-explorer2.window.maximize")} aria-label={maximized ? t("script-explorer2.window.restore") : t("script-explorer2.window.maximize")} onClick={() => setLayout(toggleMaximized(layout))}>{maximized ? <Minimize2 /> : <Maximize2 />}</ToolbarButton>
      <ToolbarButton data-testid="script-explorer-pin" onClick={pin}><PinIcon />{t("app-script-explorer-script-explorer-panel.script-explorer-panel.toolbar-button.01bb4529fe0d")}</ToolbarButton>
      <ToolbarButton variant="icon" data-testid="script-explorer-close" onClick={onClose} title={t("app-script-explorer-script-explorer-panel.script-explorer-panel.title.be55e869b1a8")} aria-label={t("app-script-explorer-script-explorer-panel.script-explorer-panel.aria-label.be55e869b1a8")}><X /></ToolbarButton>
    </div>
    {blocked ? <div role="alert" className="border-b border-border p-3 text-xs text-status-uncertain"><p>{t("app-script-explorer-script-explorer-panel.script-explorer-panel.p.7c774a42771f")}</p><Button asChild variant="ghost" size="sm"><a href={blocked} target={`animatic-manusutforsker-${projectId}-${sourceWindowId()}`} onClick={() => onClose()}>{t("app-script-explorer-script-explorer-panel.script-explorer-panel.a.2b14fcf177d7")}</a></Button></div> : null}
    <ScriptExplorer projectId={projectId} userId={userId} authorName={session.session.user.email ?? ""} onState={(value) => { latest.current = value; }} />
    {WIN_EDGES.map((edge) => edge === "se"
      ? <div key={edge} role="separator" tabIndex={0} data-testid="script-explorer-grip-se" aria-label={t("app-script-explorer-script-explorer-panel.script-explorer-panel.aria-label.8b1abcb1e1eb")} className={`absolute z-10 ${GRIP_CLASS.se} border-b-[3px] border-r-[3px] border-border-strong hover:border-accent-brand focus-visible:border-accent-brand focus-visible:outline-none`} onPointerDown={begin(edge)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={(e) => { const next = keyResizeRect(rect, e.key, vp); if (next) { e.preventDefault(); setPref({ rect: next, layout: "free" }); } }} />
      : <div key={edge} aria-hidden data-testid={`script-explorer-grip-${edge}`} data-edge={edge} className={`absolute z-10 ${GRIP_CLASS[edge]} bg-accent-brand/50 opacity-0 transition-opacity hover:opacity-100`} onPointerDown={begin(edge)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />)}
    <UiId id="NEW" />
  </div>;
}
