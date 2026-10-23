/**
 * Felles innhold for store dialoger som brukeren kan endre størrelse på (Øystein 23.10, AGENTS.md regel 63).
 * Bygger på shadcn-dialogen. Brukeren drar i høyre kant, nedre kant eller grepet nede til høyre; dialogen
 * holdes sentrert. Størrelsen huskes per dialogtype og bruker (useUiPref: nettleseren og kontoens
 * ui_prefs). Dobbeltklikk på grepet eller knappen «Standardstørrelse» tilbakestiller. Shift + piltaster
 * endrer størrelsen når grepet har fokus. På smal skjerm endres ingenting.
 */
import * as React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { DialogContent } from "@/components/ui/dialog";
import { useUiPref } from "@/app/account/ui-prefs";
import { cn } from "@/lib/utils";
import { t } from "@/core/i18n/keyed";
import {
  clampDialogSize,
  DIALOG_DEFAULT_MIN,
  dialogSizePrefKey,
  dragDialogSize,
  isResizableViewport,
  keyDialogSize,
  validStoredDialogSize,
  type DialogSize,
} from "./dialog-size";

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogContent>;

export type ResizableDialogContentProps = ContentProps & {
  /** Dialogtypen størrelsen huskes for (f.eks. «layer-image»). */
  sizeKey: string;
  minWidth?: number;
  minHeight?: number;
};

function useViewport(): DialogSize | null {
  const [vp, setVp] = useState<DialogSize | null>(null);
  useEffect(() => {
    const read = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return vp;
}

type Stored = [DialogSize | null, (next: DialogSize | null) => void];
type InnerProps = ResizableDialogContentProps & { pref: Stored; fref: React.ForwardedRef<HTMLDivElement> };

/** Med kontoen (vanlig app): nettleseren og profiles.ui_prefs. */
function WithAccount(p: Omit<InnerProps, "pref">) {
  const pref = useUiPref<DialogSize | null>(dialogSizePrefKey(p.sizeKey), null, validStoredDialogSize);
  return <Inner {...p} pref={pref} />;
}

/** Uten spørringsklient (isolerte visninger og tester): bare nettleserens lager. */
function LocalOnly(p: Omit<InnerProps, "pref">) {
  const key = `animatic:ui:local:${dialogSizePrefKey(p.sizeKey)}`; // i18n-ignore: nøkkel i nettleserens lager
  const [v, setV] = useState<DialogSize | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      setV(validStoredDialogSize(parsed) ? parsed : null);
    } catch {
      setV(null);
    }
  }, [key]);
  const set = (n: DialogSize | null) => {
    setV(n);
    try {
      if (n) window.localStorage.setItem(key, JSON.stringify(n));
      else window.localStorage.removeItem(key);
    } catch {
      /* privat vindu */
    }
  };
  return <Inner {...p} pref={[v, set]} />;
}

export const ResizableDialogContent = React.forwardRef<HTMLDivElement, ResizableDialogContentProps>((props, fref) => {
  const qc = useContext(QueryClientContext);
  return qc ? <WithAccount {...props} fref={fref} /> : <LocalOnly {...props} fref={fref} />;
});
ResizableDialogContent.displayName = "ResizableDialogContent";

function Inner({ sizeKey, minWidth, minHeight, className, style, children, pref, fref: forwarded, ...props }: InnerProps) {
    const [stored, setStored] = pref;
    const vp = useViewport();
    const [live, setLive] = useState<DialogSize | null>(null);
    const ref = useRef<HTMLDivElement | null>(null);
    const setRef = (el: HTMLDivElement | null) => {
      ref.current = el;
      if (typeof forwarded === "function") forwarded(el);
      else if (forwarded) forwarded.current = el;
    };
    const min = { w: minWidth ?? DIALOG_DEFAULT_MIN.w, h: minHeight ?? DIALOG_DEFAULT_MIN.h };
    const resizable = vp !== null && isResizableViewport(vp.w);
    const raw = resizable ? (live ?? stored) : null;
    const shown = raw && vp ? clampDialogSize(raw, min, vp) : null;

    // Grepene står fast i dialogens synlige ramme også når innholdet rulles
    useEffect(() => {
      const el = ref.current;
      if (!el || !resizable) return;
      const on = () => el.style.setProperty("--dlg-scroll", `${el.scrollTop}px`);
      on();
      el.addEventListener("scroll", on, { passive: true });
      return () => el.removeEventListener("scroll", on);
    }, [resizable]);

    const current = (): DialogSize | null => {
      if (shown) return shown;
      const r = ref.current?.getBoundingClientRect();
      return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
    };

    const startDrag = (edge: "right" | "bottom" | "corner") => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !vp) return;
      const start = current();
      if (!start) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture?.(e.pointerId);
      const x0 = e.clientX;
      const y0 = e.clientY;
      let last = start;
      const move = (ev: PointerEvent) => {
        last = clampDialogSize(dragDialogSize(start, edge, ev.clientX - x0, ev.clientY - y0), min, {
          w: window.innerWidth,
          h: window.innerHeight,
        });
        setLive(last);
      };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        setLive(null);
        if (last !== start) setStored(last);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    };

    const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
      const start = current();
      if (!start || !vp) return;
      const next = keyDialogSize(start, e.key, e.shiftKey);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      setStored(clampDialogSize(next, min, vp));
    };

    const reset = () => {
      setLive(null);
      setStored(null);
    };

    return (
      <DialogContent
        ref={setRef}
        {...props}
        data-dialog-size={sizeKey}
        data-resized={shown ? "true" : "false"}
        className={cn(className, shown && "!max-h-none !max-w-none overflow-y-auto")}
        style={shown ? { ...style, width: shown.w, height: shown.h } : style}
      >
        {children}
        {resizable ? (
          <>
            <div
              aria-hidden="true"
              data-resize-edge="right"
              onPointerDown={startDrag("right")}
              className="absolute right-0 z-10 w-1.5 cursor-ew-resize"
              style={{ top: "var(--dlg-scroll, 0px)", height: "100%" }}
            />
            <div
              aria-hidden="true"
              data-resize-edge="bottom"
              onPointerDown={startDrag("bottom")}
              className="absolute left-0 z-10 h-1.5 w-full cursor-ns-resize"
              style={{ top: "calc(var(--dlg-scroll, 0px) + 100% - 6px)" }}
            />
            {stored ? (
              <button
                type="button"
                onClick={reset}
                aria-label={t("dialog.resize.reset")}
                title={t("dialog.resize.reset")}
                data-testid="dialog-size-reset"
                className="absolute right-6 z-10 flex size-5 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary"
                style={{ top: "calc(var(--dlg-scroll, 0px) + 100% - 22px)" }}
              >
                <RotateCcw className="size-3" aria-hidden="true" />
              </button>
            ) : null}
            <div
              role="button"
              tabIndex={0}
              aria-label={t("dialog.resize.grip")}
              title={t("dialog.resize.grip")}
              data-testid="dialog-size-grip"
              onPointerDown={startDrag("corner")}
              onDoubleClick={reset}
              onKeyDown={onKey}
              className="absolute right-0 z-20 size-4 cursor-nwse-resize rounded-sm text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              style={{ top: "calc(var(--dlg-scroll, 0px) + 100% - 16px)" }}
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                <path d="M14 6 6 14M14 10l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          </>
        ) : null}
      </DialogContent>
    );
}
