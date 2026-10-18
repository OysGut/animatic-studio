import { Link } from "@tanstack/react-router";
import {
  Clapperboard,
  FileText,
  Film,
  Layers,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { L, localized } from "@/core";
import { useStoredFlag } from "./pane-size";

/** Arbeidsflatene (INFORMATION_ARCHITECTURE.md). Flatene som ikke er bygget ennå vises deaktivert med milepæl. */
const LATER: { label: string; icon: ReactNode; milestone: string }[] = [];

/** Navn på arbeidsflatene (slås opp i render, så de følger språkvalget). */
const NAV_LABEL = localized({
  overview: ["Prosjektoversikt", "Project overview"],
  script: ["Manus", "Script"],
  library: ["Ressursbibliotek", "Asset library"],
  scene: ["Sceneeditor", "Scene editor"],
  assembly: ["Montering", "Assembly"],
  release: ["Utgivelse", "Release"],
});

const LINKS = [
  {
    to: "/prosjekt/$projectId",
    labelKey: "overview",
    icon: <Users aria-hidden />,
    exact: true,
  },
  {
    to: "/prosjekt/$projectId/manus",
    labelKey: "script",
    icon: <FileText aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/bibliotek",
    labelKey: "library",
    icon: <Library aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/scene",
    labelKey: "scene",
    icon: <Layers aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/montering",
    labelKey: "assembly",
    icon: <Film aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/utgivelse",
    labelKey: "release",
    icon: <Clapperboard aria-hidden />,
    exact: false,
  },
] as const;

const item =
  "relative flex h-9 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-[13px] text-text-secondary hover:text-text-primary [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
/** Aktiv fane: 2 px strek nederst i merkefargen, som faneskillet i Premiere. Ingen fylt bakgrunn. */
const active =
  "font-medium text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent-brand";

/** Fanerad med arbeidsflatene øverst (U4). Kan slås sammen til bare ikoner (DEC-0040); valget huskes. */
export function ProjectNav({ projectId }: { projectId: string }) {
  const [collapsed, setCollapsed] = useStoredFlag("project-nav-collapsed", false);
  return (
    <nav
      aria-label="Arbeidsflater"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-border bg-surface-1"
    >
      {LINKS.map((l) => {
        const label = NAV_LABEL[l.labelKey];
        return (
          <Link
            key={l.to}
            to={l.to}
            params={{ projectId }}
            activeOptions={{ exact: l.exact }}
            className={item + (collapsed ? " px-2.5" : "")}
            activeProps={{ className: active, "aria-current": "page" }}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
          >
            {l.icon}
            {collapsed ? null : <span>{label}</span>}
          </Link>
        );
      })}
      {LATER.map((w) => (
        <span
          key={w.label}
          aria-disabled
          aria-label={
            collapsed
              ? L(`${w.label} – kommer i ${w.milestone}`, `${w.label} – coming in ${w.milestone}`)
              : undefined
          }
          title={L(`${w.label} – kommer i ${w.milestone}`, `${w.label} – coming in ${w.milestone}`)}
          className={
            "flex h-9 shrink-0 cursor-not-allowed items-center gap-2 whitespace-nowrap px-3 text-[13px] text-text-disabled [&_svg]:size-4 [&_svg]:shrink-0" +
            (collapsed ? " px-2.5" : "")
          }
        >
          {w.icon}
          {collapsed ? null : (
            <>
              <span>{w.label}</span>
              <span className="font-mono text-[11px] text-text-disabled">{w.milestone}</span>
            </>
          )}
        </span>
      ))}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={item + " ml-auto px-2.5"}
        aria-label={collapsed ? L("Vis menyen", "Show menu") : L("Skjul menyen", "Hide menu")}
        aria-expanded={!collapsed}
        title={
          collapsed
            ? L("Vis menyen", "Show menu")
            : L("Skjul menyen (bare ikoner)", "Hide menu (icons only)")
        }
      >
        {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
      </button>
    </nav>
  );
}
