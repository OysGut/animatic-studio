/** DV8 (H9–H13): «Merknader og huskelapper» på prosjektsiden. Klikk åpner elementets nåværende plassering. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { StickyNote } from "lucide-react";
import { L, NOTE_FLAG_KIND_LABEL, NOTE_FLAG_TARGETS, noteFlagLocation, noteFlagOverview, sceneNumberOf, formatHeading, type NoteFlagSort, type NoteFlagTargetKind, type ProjectState } from "@/core";

export function NoteFlagsOverview({ state, projectId, names }: { state: ProjectState; projectId: string; names: Readonly<Record<string, string>> }) {
  const [sort, setSort] = useState<NoteFlagSort>("date");
  const [creator, setCreator] = useState("");
  const [kind, setKind] = useState<"" | NoteFlagTargetKind>("");
  const [active, setActive] = useState<"" | "on" | "off">("");
  const list = noteFlagOverview(state, sort, { ...(creator ? { creator } : {}), ...(kind ? { kind } : {}), ...(active ? { active: active === "on" } : {}) });
  const creators = [...new Set(Object.values(state.noteFlags ?? {}).filter(f => !f.removed).map(f => f.createdBy ?? ""))].filter(Boolean);
  const select = "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary";
  return <section aria-labelledby="flags-title" data-testid="note-flags-overview" className="mt-8">
    <h2 id="flags-title" className="mb-2 flex items-center gap-2 text-base font-semibold text-text-primary"><StickyNote className="size-4 text-note" aria-hidden />{L("Merknader og huskelapper", "Notes and note flags")}</h2>
    <div className="mb-2 flex flex-wrap gap-2">
      <label className="flex items-center gap-1 text-xs text-text-secondary">{L("Sorter", "Sort")}<select data-testid="note-flags-sort" className={select} value={sort} onChange={e => setSort(e.target.value as NoteFlagSort)}><option value="date">{L("Dato", "Date")}</option><option value="script">{L("Plassering i manus", "Script position")}</option><option value="scene">{L("Scenerekkefølge", "Scene order")}</option></select></label>
      <label className="flex items-center gap-1 text-xs text-text-secondary">{L("Oppretter", "Creator")}<select data-testid="note-flags-creator" className={select} value={creator} onChange={e => setCreator(e.target.value)}><option value="">{L("Alle", "All")}</option>{creators.map(id => <option key={id} value={id}>{names[id] ?? id.slice(0, 8)}</option>)}</select></label>
      <label className="flex items-center gap-1 text-xs text-text-secondary">{L("Type", "Type")}<select data-testid="note-flags-kind" className={select} value={kind} onChange={e => setKind(e.target.value as NoteFlagTargetKind | "")}><option value="">{L("Alle", "All")}</option>{NOTE_FLAG_TARGETS.map(k => <option key={k} value={k}>{NOTE_FLAG_KIND_LABEL(k)}</option>)}</select></label>
      <label className="flex items-center gap-1 text-xs text-text-secondary">{L("Status", "Status")}<select data-testid="note-flags-active" className={select} value={active} onChange={e => setActive(e.target.value as "" | "on" | "off")}><option value="">{L("Alle", "All")}</option><option value="on">{L("Aktive", "Active")}</option><option value="off">{L("Avslåtte", "Turned off")}</option></select></label>
    </div>
    {list.length === 0 ? <p className="text-xs text-text-tertiary">{L("Ingen huskelapper.", "No note flags.")}</p> : <ul className="divide-y divide-border border-y border-border">{list.map(f => {
      const loc = noteFlagLocation(state, f);
      const occ = loc.kind === "scene" ? state.occurrences[loc.occurrenceId] : undefined;
      const place = loc.kind === "scene" && occ ? `${sceneNumberOf(state, occ) ?? ""} ${formatHeading(state.variants[occ.variantId]?.heading ?? { location: "" } as never)}`.trim() : loc.kind === "library" ? state.assets[loc.assetId]?.name ?? "" : L("Elementet finnes ikke lenger", "The item no longer exists");
      const body = <><span className={"text-xs " + (f.enabled ? "text-note" : "text-text-tertiary")}>{NOTE_FLAG_KIND_LABEL(f.targetKind)}{f.enabled ? "" : L(" · av", " · off")}</span><span className="min-w-0 flex-1 truncate text-xs text-text-primary">{f.text || L("(uten tekst)", "(no text)")}</span><span className="text-xs text-text-secondary">{place}</span><span className="text-[11px] text-text-tertiary">{names[f.createdBy ?? ""] ?? ""} {f.createdAt ? new Date(f.createdAt).toLocaleDateString(L("nb-NO", "en-GB")) : ""}</span></>;
      return <li key={f.id} data-testid="note-flags-row" data-flag-id={f.id} className="py-1.5">
        {loc.kind === "scene" ? <Link className="flex items-center gap-3 hover:bg-surface-2" to="/prosjekt/$projectId/scene" params={{ projectId }} search={{ scene: loc.occurrenceId, ...(loc.blockId ? { line: loc.blockId } : {}) }}>{body}</Link>
          : loc.kind === "library" ? <Link className="flex items-center gap-3 hover:bg-surface-2" to="/prosjekt/$projectId/bibliotek" params={{ projectId }} search={{ asset: loc.assetId }}>{body}</Link>
          : <div className="flex items-center gap-3">{body}</div>}
      </li>; })}</ul>}
  </section>;
}
