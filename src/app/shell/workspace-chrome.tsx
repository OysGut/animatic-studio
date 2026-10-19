/**
 * Felles verktøylinjer og panelhoder (UI-løft U2, Premiere/DaVinci-stil). Bare utseende: knappene er ekte
 * <button>-elementer, og title, aria-* og hendelser sendes uendret videre, så rolle og navn blir som før.
 */
import { Slot } from "@radix-ui/react-slot";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { L } from "@/core";
import { cn } from "@/lib/utils";
import { countPrimary, planToolbarOverflow } from "./toolbar-overflow";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type OverflowCtx = {
  register: (id: string, priority: number) => () => void;
  hidden: ReadonlySet<string>;
  target: HTMLElement | null;
};
const OverflowContext = createContext<OverflowCtx | null>(null);

/**
 * Verktøylinjen under appheaderen: rader på 32 px. `overflow="wrap"` (standard) bryter til flere rader;
 * `overflow="menu"` flytter grupper som ikke får plass, inn i «Mer …» (lavest `priority` først).
 */
export function Toolbar({
  title,
  status,
  children,
  className,
  overflow = "wrap",
  moreLabel,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title?: ReactNode;
  status?: ReactNode;
  children?: ReactNode;
  overflow?: "wrap" | "menu";
  moreLabel?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const groups = useRef(new Map<string, number>());
  const widths = useRef(new Map<string, number>());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [tick, setTick] = useState(0);
  const menu = overflow === "menu";

  const ctx: OverflowCtx | null = menu
    ? {
        hidden,
        target,
        register: (id, priority) => {
          groups.current.set(id, priority);
          setTick((t) => t + 1);
          return () => {
            groups.current.delete(id);
            widths.current.delete(id);
            setTick((t) => t + 1);
          };
        },
      }
    : null;

  useIsoLayoutEffect(() => {
    if (!menu || !rootRef.current) return;
    const root = rootRef.current;
    const measure = () => {
      const ids = [...groups.current.keys()];
      for (const el of root.querySelectorAll<HTMLElement>("[data-toolbar-group]")) {
        const id = el.dataset["toolbarGroup"];
        if (id) widths.current.set(id, el.offsetWidth + 4);
      }
      const fixed = [...root.querySelectorAll<HTMLElement>("[data-toolbar-fixed]")].reduce(
        (s, el) => s + el.offsetWidth + 8,
        0,
      );
      const avail = root.clientWidth - 24 - fixed;
      const plan = planToolbarOverflow(
        ids.map((id) => widths.current.get(id) ?? 0),
        avail,
        ids.map((id) => groups.current.get(id) ?? 0),
        36,
      );
      const next = new Set(plan.map((i) => ids[i]!));
      setHidden((prev) =>
        prev.size === next.size && [...prev].every((x) => next.has(x)) ? prev : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [menu, tick]);

  useEffect(() => {
    if (!import.meta.env.DEV || !rootRef.current) return;
    const n = countPrimary(
      [...rootRef.current.querySelectorAll<HTMLElement>("[data-toolbar-variant]")].map(
        (el) => el.dataset["toolbarVariant"],
      ),
    );
    if (n > 1) console.warn("Toolbar: at most one primary action per toolbar (U2).");
  });

  return (
    <TooltipProvider delayDuration={400}>
      <OverflowContext.Provider value={ctx}>
        <div
          ref={rootRef}
          {...rest}
          className={cn(
            "flex min-h-toolbar shrink-0 items-center gap-x-2 border-b border-border bg-surface-2 px-3",
            menu ? "flex-nowrap overflow-hidden" : "flex-wrap gap-y-0.5",
            className,
          )}
        >
          {title ? (
            <div
              data-toolbar-fixed
              className="flex h-toolbar items-center text-[length:var(--text-chrome)] font-medium text-text-primary"
            >
              {title}
            </div>
          ) : null}
          {children}
          {menu ? (
            <PopoverPrimitive.Root>
              <PopoverPrimitive.Trigger asChild>
                <ToolbarButton
                  variant="icon"
                  data-toolbar-fixed
                  aria-label={moreLabel ?? L("Mer …", "More …")}
                  title={moreLabel ?? L("Mer …", "More …")}
                  className={hidden.size === 0 ? "hidden" : ""}
                >
                  <MoreHorizontal aria-hidden />
                </ToolbarButton>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal forceMount>
                <PopoverPrimitive.Content
                  forceMount
                  align="end"
                  sideOffset={4}
                  className="z-50 flex max-w-[min(90vw,32rem)] flex-col gap-1 rounded-md border border-border bg-surface-2 p-1 shadow-md outline-none data-[state=closed]:hidden"
                >
                  <div ref={setTarget} className="flex flex-col items-start gap-1" />
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
          ) : null}
          {status ? (
            <div data-toolbar-fixed className="ml-auto flex flex-wrap items-center gap-3">
              {status}
            </div>
          ) : null}
        </div>
      </OverflowContext.Provider>
    </TooltipProvider>
  );
}

export function ToolbarGroup({
  className,
  priority = 0,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { priority?: number }) {
  const ctx = useContext(OverflowContext);
  const id = useId();
  const register = ctx?.register;
  useIsoLayoutEffect(() => (register ? register(id, priority) : undefined), [id, priority, !!register]);
  const node = (
    <div
      {...rest}
      data-toolbar-group={ctx ? id : undefined}
      className={cn("flex h-toolbar shrink-0 items-center gap-toolbar-gap", className)}
    />
  );
  if (ctx && ctx.hidden.has(id) && ctx.target) return createPortal(node, ctx.target);
  return node;
}

/** Tynn loddrett skillelinje mellom gruppene. */
export function ToolbarSeparator() {
  return <div aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border-strong" />;
}

export type ToolbarButtonVariant = "icon" | "default" | "primary";

const base =
  "inline-flex h-icon-btn shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm text-[length:var(--text-chrome)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ToolbarButtonVariant, string> = {
  icon: "size-icon-btn justify-center text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:hover:bg-transparent",
  default:
    "px-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:hover:bg-transparent",
  primary:
    "px-3 font-medium bg-accent-brand text-accent-fg hover:bg-accent-brand/90 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2",
};

/** Knapp i verktøylinjen: 28 px høy, i tre varianter. Høyst én `primary` per verktøylinje. */
export const ToolbarButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ToolbarButtonVariant;
    active?: boolean;
    asChild?: boolean;
  }
>(function ToolbarButton(
  { variant = "default", active, asChild, className, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: type ?? "button" })}
      data-toolbar-variant={variant}
      {...rest}
      className={cn(
        base,
        variants[variant],
        active && variant !== "primary" ? "bg-accent-selection text-text-primary" : "",
        className,
      )}
    />
  );
});

/**
 * Ikonknapp på 28 px med verktøytips (navn + ev. hurtigtast). `aria-label` kommer fra samme tekst.
 * `title` sendes bare videre hvis den gis eksplisitt (eksisterende tester kan lese den).
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    shortcut?: string;
    active?: boolean;
    side?: "top" | "bottom" | "left" | "right";
  }
>(function IconButton({ label, shortcut, side = "bottom", onPointerMove, onFocus, ...rest }, ref) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Enhver tast lukker tipset før resten av appen ser tasten, så Esc og hurtigtaster virker som før.
    const close = () => flushSync(() => setOpen(false));
    window.addEventListener("keydown", close, true);
    window.addEventListener("pointerdown", close, true);
    return () => {
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("pointerdown", close, true);
    };
  }, [open]);
  return (
    <TooltipProvider delayDuration={400}>
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <ToolbarButton
          ref={ref}
          variant="icon"
          aria-label={label}
          data-icon-button=""
          {...rest}
          onFocus={(e) => {
            onFocus?.(e);
            // Verktøytipset åpnes bare ved peker: et tips som åpner seg ved fokus, ville fanget Esc
            // (f.eks. når fokus kommer tilbake fra en dialog) og endret tastaturbruken.
            e.preventDefault();
          }}
          onPointerMove={(e) => {
            onPointerMove?.(e);
            // Ikke åpne verktøytips mens en knapp holdes nede (dra i tidslinje eller lerret).
            if (e.buttons !== 0) e.preventDefault();
          }}
        />
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="pointer-events-none flex items-center gap-2 rounded-sm border border-border bg-surface-3 px-2 py-1 text-[length:var(--text-[length:var(--text-chrome)]-label)] text-text-primary data-[state=closed]:animate-none"
      >
        <span>{label}</span>
        {shortcut ? (
          <kbd className="rounded-sm border border-border-strong px-1 font-mono text-text-secondary">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
});

/** Hode over et panel: 32 px, liten tittel i store bokstaver, valgfri pil, tall og handlinger. */
export function PanelHeader({
  title,
  as: Heading = "h2",
  count,
  collapse,
  actions,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  as?: "h2" | "h3" | "span";
  count?: ReactNode;
  collapse?: { open: boolean; onToggle: () => void; label: string };
  actions?: ReactNode;
}) {
  return (
    <div
      {...rest}
      className={cn(
        "group flex h-toolbar shrink-0 items-center gap-1.5 border-b border-border bg-surface-2 px-2",
        className,
      )}
    >
      {collapse ? (
        <button
          type="button"
          onClick={collapse.onToggle}
          aria-expanded={collapse.open}
          aria-label={collapse.label}
          title={collapse.label}
          className="inline-flex size-5 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
        >
          {collapse.open ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
      <Heading className="min-w-0 truncate text-[length:var(--text-[length:var(--text-chrome)]-label)] font-medium uppercase tracking-label text-text-tertiary">
        {title}
      </Heading>
      {count !== undefined && count !== null ? (
        <span className="font-mono text-[length:var(--text-[length:var(--text-chrome)]-label)] tabular-nums text-text-tertiary">{count}</span>
      ) : null}
      {actions ? <div className="ml-auto flex items-center gap-0.5">{actions}</div> : null}
    </div>
  );
}
