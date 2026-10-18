/** Skrivehjelpen (T2): hurtigtaster, markerte linjer og kontekstmenyen på manussidene. */
import { useEffect, useRef } from "react";
import { L, REWRITE_MODES, type RewriteMode } from "@/core";
import type { AssistAction } from "./WritingPanel";

/** Alt + Shift + R / N / F (kolliderer ikke med nettleserens Ctrl/⌘ + Shift-taster). Ikke mens man skriver. */
export function assistShortcut(e: {
  code: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}): "rewrite" | "next_line" | "format" | null {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return null;
  if (e.code === "KeyR") return "rewrite";
  if (e.code === "KeyN") return "next_line";
  if (e.code === "KeyF") return "format";
  return null;
}

/** Linjene (data-block) som den markerte teksten berører, i rekkefølge. */
export function selectedBlockIdsIn(root: HTMLElement | null): string[] {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return [];
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];
  const out: string[] = [];
  root.querySelectorAll("[data-block]").forEach((el) => {
    const id = el.getAttribute("data-block");
    if (id && range.intersectsNode(el) && !out.includes(id)) out.push(id);
  });
  return out;
}

const MODE_LABEL: Record<RewriteMode, () => string> = {
  shorter: () => L("Kortere", "Shorter"),
  clearer: () => L("Tydeligere", "Clearer"),
  spoken: () => L("Mer muntlig", "More spoken"),
  tone: () => L("Annen tone …", "Different tone …"),
  free: () => L("Fritt ønske …", "Free request …"),
};

export function AssistContextMenu({
  x,
  y,
  onClose,
  onPick,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onPick: (action: AssistAction, mode?: RewriteMode) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    ref.current?.querySelector("button")?.focus();
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const item = (label: string, action: AssistAction, mode?: RewriteMode, testId?: string) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      data-testid={testId}
      className="block w-full rounded-sm px-2 py-1 text-left text-[13px] text-text-primary hover:bg-surface-3 focus:bg-surface-3 focus:outline-none"
      onClick={() => onPick(action, mode)}
    >
      {label}
    </button>
  );
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={L("Skrivehjelp", "Writing assistant")}
      data-testid="assist-context-menu"
      className="fixed z-50 min-w-[200px] rounded-md border border-border bg-surface-2 p-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-text-tertiary">{L("Skriv om …", "Rewrite …")}</p>
      {REWRITE_MODES.map((m) => item(MODE_LABEL[m](), "rewrite", m, `assist-menu-rewrite-${m}`))}
      <div className="my-1 h-px bg-border" />
      {item(L("Språkvask", "Language polish"), "polish", undefined, "assist-menu-polish")}
      {item(L("Foreslå neste replikk", "Suggest next line"), "next_line", undefined, "assist-menu-next-line")}
      {item(L("Engelsk oversettelsesutkast", "English translation draft"), "translate", undefined, "assist-menu-translate")}
      {item(L("Formatsjekk", "Format check"), "format", undefined, "assist-menu-format")}
    </div>
  );
}
