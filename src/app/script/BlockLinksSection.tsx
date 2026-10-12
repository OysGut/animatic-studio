/**
 * Koblinger for en manuslinje (DEC-0072, REQ-0095, REQ-0099): dialogopptak, tidspunkt i scenen, hendelser i
 * 2D-scenen og filmklipp, med lenker til monteringen, sceneeditoren og biblioteket. Koblingene lages i
 * monteringen («Synk replikker», lydsporene, «Dekker manuset») og i sceneeditoren (hendelser på et lag).
 */
import { Link } from "@tanstack/react-router";
import { Clapperboard, Film, Image as ImageIcon, Layers, Library, Mic, Timer } from "lucide-react";
import { useMemo } from "react";
import { blockLinks, takeLabel, type ProjectState } from "@/core";

const fmt = (ms: number) =>
  `${(ms / 1000).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

export function BlockLinksSection({
  state,
  projectId,
  productionId,
  blockId,
  occurrenceId,
}: {
  state: ProjectState;
  projectId: string;
  productionId: string;
  blockId: string;
  occurrenceId: string;
}) {
  const links = useMemo(
    () => blockLinks(state, blockId, productionId),
    [state, blockId, productionId],
  );
  const montering = (label: string) => (
    <Link
      to="/prosjekt/$projectId/montering"
      params={{ projectId }}
      search={{ scene: occurrenceId, blokk: blockId }}
      className="ml-auto shrink-0 text-[11px] text-text-secondary hover:text-text-primary hover:underline"
    >
      {label}
    </Link>
  );
  const row = "flex items-center gap-1.5 text-xs text-text-primary";
  const none = "text-[11px] text-text-tertiary";
  return (
    <div className="flex flex-col gap-2" aria-label="Koblinger for linjen">
      <Group icon={<Mic className="size-3.5" aria-hidden />} title="Dialogopptak">
        {links.recordings.length ? (
          links.recordings.map((a) => (
            <li key={a.id} className={row}>
              <span className="min-w-0 truncate">{a.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-text-tertiary">
                {fmt(a.offsetMs)}
              </span>
              <Link
                to="/prosjekt/$projectId/bibliotek"
                params={{ projectId }}
                search={{ asset: a.assetId }}
                className="ml-auto shrink-0 text-text-secondary hover:text-text-primary"
                title="Åpne lydfilen i biblioteket"
                aria-label={`Åpne ${a.name} i biblioteket`}
              >
                <Library className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))
        ) : (
          <li className={none}>Ingen – legg lyd på dialogsporet i monteringen</li>
        )}
      </Group>
      <Group icon={<Timer className="size-3.5" aria-hidden />} title="Tidspunkt i scenen">
        {links.times.length ? (
          links.times.map((l) => (
            <li key={l.id} className={row}>
              <span className="font-mono">
                {fmt(l.startMs)}
                {l.endMs !== null ? ` – ${fmt(l.endMs)}` : ""}
              </span>
              {montering("Vis")}
            </li>
          ))
        ) : (
          <li className={none}>Ingen – bruk «Synk replikker» i monteringen</li>
        )}
      </Group>
      <Group icon={<Layers className="size-3.5" aria-hidden />} title="Hendelser i 2D-scenen">
        {links.events.length ? (
          links.events.map((e) => (
            <li key={e.link.id} className={row}>
              <span className="min-w-0 truncate">{e.layerName}</span>
              <span className="shrink-0 font-mono text-[11px] text-text-tertiary">
                {fmt(e.link.startMs)}
              </span>
              <Link
                to="/prosjekt/$projectId/scene"
                params={{ projectId }}
                search={{ scene: occurrenceId }}
                className="ml-auto shrink-0 text-[11px] text-text-secondary hover:text-text-primary hover:underline"
              >
                Sceneeditor
              </Link>
            </li>
          ))
        ) : (
          <li className={none}>Ingen – koble linjen til et lag i sceneeditoren</li>
        )}
      </Group>
      <Group icon={<Clapperboard className="size-3.5" aria-hidden />} title="Filmklipp">
        {links.films.length ? (
          links.films.map((f) => (
            <li key={f.take.id} className={row}>
              {f.take.kind === "still" ? (
                <ImageIcon className="size-3 shrink-0 text-text-tertiary" aria-hidden />
              ) : (
                <Film className="size-3 shrink-0 text-text-tertiary" aria-hidden />
              )}
              <span className="min-w-0 truncate">{takeLabel(state, f.take)}</span>
              <span className="shrink-0 text-[11px] text-text-tertiary">
                {f.how === "coverage"
                  ? "dekker linjen"
                  : f.how === "segment"
                    ? "segmentet"
                    : "hele scenen"}
                {f.take.status === "approved" ? " · godkjent" : ""}
              </span>
              {montering("Vis")}
            </li>
          ))
        ) : (
          <li className={none}>Ingen – importer film eller lag AI-video i monteringen</li>
        )}
      </Group>
    </div>
  );
}

function Group({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1 text-[11px] text-text-secondary">
        {icon} {title}
      </p>
      <ul className="flex flex-col gap-0.5 pl-5" aria-label={title}>
        {children}
      </ul>
    </div>
  );
}
