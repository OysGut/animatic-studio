import { PinIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { L } from "@/core";
import { useSession } from "@/app/auth/use-session";
import { useStoredNumber } from "@/app/shell/pane-size";
import { sourceWindowId } from "@/app/shell/current-scene";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { ScriptExplorer } from "./ScriptExplorer";
import { explorerUrl, type ExplorerState } from "./explorer-state";

export function ScriptExplorerPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const session = useSession();
  const userId = session.status === "signed-in" ? session.session.user.id : "";
  const [x, setX] = useStoredNumber(`script-explorer:${userId}:x`);
  const [y, setY] = useStoredNumber(`script-explorer:${userId}:y`);
  const [width, setWidth] = useStoredNumber(`script-explorer:${userId}:width`);
  const [height, setHeight] = useStoredNumber(`script-explorer:${userId}:height`);
  const latest = useRef<ExplorerState>({ modus: "follow" });
  const popup = useRef<HTMLDivElement | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const dragging = useRef<{ x: number; y: number; left: number; top: number; width: number; height: number; resize: boolean } | null>(null);
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
      if (document.querySelector('[role="dialog"][aria-modal="true"], [data-radix-popper-content-wrapper]')) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && !popup.current?.contains(focused) && focused.matches('input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, session.status]);
  if (session.status !== "signed-in") return null;
  const pin = () => {
    const source = sourceWindowId();
    const url = explorerUrl(projectId, source, latest.current);
    const opened = window.open(url, `animatic-manusutforsker-${projectId}-${source}`, `popup,width=${Math.round(width ?? 560)},height=${Math.round(height ?? Math.min(760, window.innerHeight - 140))}`);
    if (opened) { opened.focus(); onClose(); } else setBlocked(url);
  };
  const popupWidth = `min(${width ?? 560}px, 100vw)`;
  const popupHeight = height === null ? "min(760px, max(0px, calc(100vh - 140px)))" : `min(${height}px, 100vh)`;
  return <div ref={popup} role="dialog" aria-modal={false} aria-label={L("Manusutforskeren", "Script explorer")} tabIndex={-1} data-testid="script-explorer" className="fixed z-40 flex flex-col overflow-hidden rounded-sm border border-border-strong bg-surface-1 shadow-[var(--shadow-float)]" style={{ left: `clamp(0px, ${x === null ? `calc(100vw - ${popupWidth} - 16px)` : `${x}px`}, max(0px, calc(100vw - ${popupWidth})))`, top: `clamp(0px, ${y ?? 76}px, max(0px, calc(100vh - ${popupHeight})))`, width: popupWidth, height: popupHeight }}>
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3" onPointerDown={(e) => {
      if ((e.target as Element).closest("button,a")) return;
      const rect = popup.current?.getBoundingClientRect(); if (!rect) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, resize: false };
    }} onPointerMove={(e) => { const start = dragging.current; if (!start || start.resize) return; setX(Math.max(0, Math.min(window.innerWidth - 320, start.left + e.clientX - start.x))); setY(Math.max(0, Math.min(window.innerHeight - 80, start.top + e.clientY - start.y))); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      <span className="flex-1 cursor-move text-xs font-semibold text-text-primary">{L("Manusutforskeren", "Script explorer")}</span>
      <ToolbarButton data-testid="script-explorer-pin" onClick={pin}><PinIcon />{L("Fest", "Pin")}</ToolbarButton>
      <ToolbarButton variant="icon" data-testid="script-explorer-close" onClick={onClose} title={L("Lukk Manusutforskeren", "Close script explorer")} aria-label={L("Lukk Manusutforskeren", "Close script explorer")}><X /></ToolbarButton>
    </div>
    {blocked ? <div role="alert" className="border-b border-border p-3 text-xs text-status-uncertain"><p>{L("Nettleseren blokkerte vinduet. Tillat popup-vinduer for denne siden, eller åpne vinduet manuelt.", "Your browser blocked the window. Allow popups for this site, or open the window manually.")}</p><Button asChild variant="ghost" size="sm"><a href={blocked} target={`animatic-manusutforsker-${projectId}-${sourceWindowId()}`} onClick={() => onClose()}>{L("Åpne vinduet manuelt", "Open window manually")}</a></Button></div> : null}
    <ScriptExplorer projectId={projectId} userId={userId} authorName={session.session.user.email ?? ""} onState={(value) => { latest.current = value; }} />
    <div role="separator" tabIndex={0} aria-label={L("Endre vindusstørrelse", "Resize window")} className="absolute bottom-0 right-0 size-4 cursor-nwse-resize border-b-2 border-r-2 border-border-strong" onPointerDown={(e) => { const rect = popup.current?.getBoundingClientRect(); if (!rect) return; e.currentTarget.setPointerCapture(e.pointerId); dragging.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, resize: true }; }} onPointerMove={(e) => { const start = dragging.current; if (!start?.resize) return; setWidth(Math.max(320, Math.min(window.innerWidth - start.left, start.width + e.clientX - start.x))); setHeight(Math.max(240, Math.min(window.innerHeight - start.top, start.height + e.clientY - start.y))); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setWidth(Math.max(320, (popup.current?.getBoundingClientRect().width ?? width ?? 560) + (e.key === "ArrowRight" ? 20 : -20))); } if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setHeight(Math.max(240, (popup.current?.getBoundingClientRect().height ?? height ?? 760) + (e.key === "ArrowDown" ? 20 : -20))); } }} />
  </div>;
}