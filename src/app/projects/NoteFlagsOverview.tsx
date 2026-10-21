/** DV8 (H9–H13): «Merknader og huskelapper» på prosjektsiden. Klikk åpner elementets nåværende plassering. */
import { useTimeFormat } from "@/app/i18n/time-format";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { StickyNote } from "lucide-react";
import { NOTE_FLAG_KIND_LABEL, NOTE_FLAG_TARGETS, noteFlagLocation, noteFlagOverview, sceneNumberOf, formatHeading, type NoteFlagSort, type NoteFlagTargetKind, type ProjectState } from "@/core";
import { t } from "@/core/i18n/keyed";

export function NoteFlagsOverview({ state, projectId, names }: { state: ProjectState; projectId: string; names: Readonly<Record<string, string>> }) {
  const time = useTimeFormat();
  const [sort, setSort] = useState<NoteFlagSort>("date");
  const [creator, setCreator] = useState("");
  const [kind, setKind] = useState<"" | NoteFlagTargetKind>("");
  const [active, setActive] = useState<"" | "on" | "off">("");
  const list = noteFlagOverview(state, sort, { ...(creator ? { creator } : {}), ...(kind ? { kind } : {}), ...(active ? { active: active === "on" } : {}) });
  const creators = [...new Set(Object.values(state.noteFlags ?? {}).filter(f => !f.removed).map(f => f.createdBy ?? ""))].filter(Boolean);
  const select = "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary";
  return <section aria-labelledby="flags-title" data-testid="note-flags-overview" className="mt-8">
    <h2 id="flags-title" className="mb-2 flex items-center gap-2 text-base font-semibold text-text-primary"><StickyNote className="size-4 text-note" aria-hidden />{t("app-projects-note-flags-overview.note-flags-overview.h2.96003518f497")}</h2>
    <div className="mb-2 flex flex-wrap gap-2">
      <label className="flex items-center gap-1 text-xs text-text-secondary">{t("app-projects-note-flags-overview.note-flags-overview.label.27bc311f2d29")}<select data-testid="note-flags-sort" className={select} value={sort} onChange={e => setSort(e.target.value as NoteFlagSort)}><option value="date">{t("app-projects-note-flags-overview.note-flags-overview.option.06a546d4a8a5")}</option><option value="script">{t("app-projects-note-flags-overview.note-flags-overview.option.830ccb27b650")}</option><option value="scene">{t("app-projects-note-flags-overview.note-flags-overview.option.0c6ba0813b4e")}</option></select></label>
      <label className="flex items-center gap-1 text-xs text-text-secondary">{t("app-projects-note-flags-overview.note-flags-overview.label.ee812895b845")}<select data-testid="note-flags-creator" className={select} value={creator} onChange={e => setCreator(e.target.value)}><option value="">{t("app-projects-note-flags-overview.note-flags-overview.option.93b6f86fbac4")}</option>{creators.map(id => <option key={id} value={id}>{names[id] ?? id.slice(0, 8)}</option>)}</select></label>
      <label className="flex items-center gap-1 text-xs text-text-secondary">{t("app-projects-note-flags-overview.note-flags-overview.label.f86f2c2e4e65")}<select data-testid="note-flags-kind" className={select} value={kind} onChange={e => setKind(e.target.value as NoteFlagTargetKind | "")}><option value="">{t("app-projects-note-flags-overview.note-flags-overview.option.93b6f86fbac4.2")}</option>{NOTE_FLAG_TARGETS.map(k => <option key={k} value={k}>{NOTE_FLAG_KIND_LABEL(k)}</option>)}</select></label>
      <label className="flex items-center gap-1 text-xs text-text-secondary">{t("app-projects-note-flags-overview.note-flags-overview.label.f63c28a3f4c6")}<select data-testid="note-flags-active" className={select} value={active} onChange={e => setActive(e.target.value as "" | "on" | "off")}><option value="">{t("app-projects-note-flags-overview.note-flags-overview.option.93b6f86fbac4.3")}</option><option value="on">{t("app-projects-note-flags-overview.note-flags-overview.option.2438446103b8")}</option><option value="off">{t("app-projects-note-flags-overview.note-flags-overview.option.0799d936c79b")}</option></select></label>
    </div>
    {list.length === 0 ? <p className="text-xs text-text-tertiary">{t("app-projects-note-flags-overview.note-flags-overview.p.1931be00d54c")}</p> : <ul className="divide-y divide-border border-y border-border">{list.map(f => {
      const loc = noteFlagLocation(state, f);
      const occ = loc.kind === "scene" ? state.occurrences[loc.occurrenceId] : undefined;
      const place = loc.kind === "scene" && occ ? `${sceneNumberOf(state, occ) ?? ""} ${state.variants[occ.variantId] ? formatHeading(state.variants[occ.variantId]!.heading) : ""}`.trim() : loc.kind === "library" ? state.assets[loc.assetId]?.name ?? "" : t("app-projects-note-flags-overview.place.list-map.2096487ab9b8");
      const body = <><span className={"text-xs " + (f.enabled ? "text-note" : "text-text-tertiary")}>{NOTE_FLAG_KIND_LABEL(f.targetKind)}{f.enabled ? "" : t("app-projects-note-flags-overview.body.span.593b2184fc2d")}</span><span className="min-w-0 flex-1 truncate text-xs text-text-primary">{f.text || t("app-projects-note-flags-overview.body.span.d97ed4a2b488")}</span><span className="text-xs text-text-secondary">{place}</span><span className="text-[11px] text-text-tertiary">{names[f.createdBy ?? ""] ?? ""} {f.createdAt ? <span title={time.exact(f.createdAt)}>{time.relative(f.createdAt)}</span> : ""}</span></>;
      return <li key={f.id} data-testid="note-flags-row" data-flag-id={f.id} className="py-1.5">
        {loc.kind === "scene" ? <Link className="flex items-center gap-3 hover:bg-surface-2" to="/prosjekt/$projectId/scene" params={{ projectId }} search={{ scene: loc.occurrenceId, ...(loc.blockId ? { line: loc.blockId } : {}) }}>{body}</Link>
          : loc.kind === "library" ? <Link className="flex items-center gap-3 hover:bg-surface-2" to="/prosjekt/$projectId/bibliotek" params={{ projectId }} search={{ asset: loc.assetId }}>{body}</Link>
          : <div className="flex items-center gap-3">{body}</div>}
      </li>; })}</ul>}
  </section>;
}
