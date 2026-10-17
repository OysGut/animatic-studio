/**
 * Felles verktøylinjer og panelhoder (UI-løft U2, Premiere/DaVinci-stil). Bare utseende: knappene er ekte
 * <button>-elementer, og title, aria-* og hendelser sendes uendret videre, så rolle og navn blir som før.
 */
import { Slot } from "@radix-ui/react-slot";
import { ChevronDown, ChevronRight } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Verktøylinjen under appheaderen: minst 40 px, kan bryte til flere linjer på smale skjermer. */
export function Toolbar({
  title,
  status,
  children,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title?: ReactNode;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      {...rest}
      className={cn(
        "flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-surface-2 px-3 py-1",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center text-[13px] font-medium text-text-primary">{title}</div>
      ) : null}
      {children}
      {status ? <div className="ml-auto flex flex-wrap items-center gap-3">{status}</div> : null}
    </div>
  );
}

export function ToolbarGroup({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("flex items-center gap-1", className)} />;
}

/** Tynn loddrett skillelinje mellom gruppene. */
export function ToolbarSeparator() {
  return <div aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border-strong" />;
}

export type ToolbarButtonVariant = "icon" | "default" | "primary";

const base =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm text-[13px] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ToolbarButtonVariant, string> = {
  icon: "size-7 justify-center text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:hover:bg-transparent",
  default:
    "px-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:hover:bg-transparent",
  primary: "px-3 font-medium bg-accent-brand text-accent-fg hover:bg-accent-brand/90",
};

/** Knapp i verktøylinjen: 28 px høy, i tre varianter. */
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
        "group flex h-8 shrink-0 items-center gap-1.5 border-b border-border bg-surface-2 px-2",
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
          className="inline-flex size-5 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
        >
          {collapse.open ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
      <Heading className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {title}
      </Heading>
      {count !== undefined && count !== null ? (
        <span className="font-mono text-[11px] tabular-nums text-text-tertiary">{count}</span>
      ) : null}
      {actions ? (
        <div className="ml-auto flex items-center gap-0.5 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
