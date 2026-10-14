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
import { PaneResizer, usePaneSize, useStoredFlag } from "./pane-size";

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
  "flex h-8 items-center gap-2 rounded-sm px-2 text-[13px] text-text-secondary hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-focus-ring";
const active = "bg-accent-selection font-medium text-text-primary";

/** Menyen til venstre. Kan slås sammen til en smal stripe med ikoner (DEC-0040); valget huskes. */
export function ProjectNav({ projectId }: { projectId: string }) {
  const [width, setWidth] = usePaneSize("project-nav", 184, 140, 320);
  const [collapsed, setCollapsed] = useStoredFlag("project-nav-collapsed", false);
  return (
    <nav
      aria-label="Arbeidsflater"
      style={{ width: collapsed ? 44 : width }}
      className="relative flex shrink-0 flex-col gap-0.5 border-r border-border bg-surface-1 p-1.5"
    >
      {collapsed ? null : (
        <PaneResizer
          edge="right"
          size={width}
          onSize={setWidth}
          min={140}
          max={320}
          label={L("Bredde på menyen", "Menu width")}
        />
      )}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={item + (collapsed ? " justify-center px-0" : " justify-end")}
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
      {LINKS.map((l) => {
        const label = NAV_LABEL[l.labelKey];
        return (
          <Link
            key={l.to}
            to={l.to}
            params={{ projectId }}
            activeOptions={{ exact: l.exact }}
            className={item + (collapsed ? " justify-center px-0" : "")}
            activeProps={{ className: active, "aria-current": "page" }}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
          >
            {l.icon}
            {collapsed ? null : <span className="truncate">{label}</span>}
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
            "flex h-8 cursor-not-allowed items-center gap-2 px-2 text-[13px] text-text-disabled [&_svg]:size-4 [&_svg]:shrink-0" +
            (collapsed ? " justify-center px-0" : "")
          }
        >
          {w.icon}
          {collapsed ? null : (
            <>
              <span className="truncate">{w.label}</span>
              <span className="ml-auto font-mono text-[11px] text-text-disabled">
                {w.milestone}
              </span>
            </>
          )}
        </span>
      ))}
    </nav>
  );
}
