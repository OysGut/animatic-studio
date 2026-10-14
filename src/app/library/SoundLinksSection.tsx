/**
 * Hva lyden hører til (mandat 13.2, REQ-0204, DEC-0070): karakterer og andre ressurser, replikker, scener,
 * delsekvenser, hendelser og produksjoner. Koblingene bruker permanente ID-er og følger med når scener flyttes
 * eller får nye numre. Endringer kan angres.
 */
import { Link2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  L,
  SOUND_LINK_LABEL,
  blocksOfVariant,
  collation,
  compareKeys,
  formatHeading,
  orderedOccurrences,
  soundLinkLabel,
  type Asset,
  type ProjectState,
  type SoundLink,
  type SoundLinkKind,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";

const ctl =
  "h-7 min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

const KINDS: readonly SoundLinkKind[] = [
  "asset",
  "scene",
  "block",
  "segment",
  "event",
  "production",
];

export function SoundLinksSection({
  state,
  asset,
  productionId,
  editable,
  cmds,
}: {
  state: ProjectState;
  asset: Asset;
  productionId: string;
  editable: boolean;
  cmds: Commands;
}) {
  const links = asset.soundLinks ?? [];
  const [kind, setKind] = useState<SoundLinkKind>("asset");
  const [scene, setScene] = useState("");
  const [target, setTarget] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const occs = useMemo(
    () => orderedOccurrences(state, productionId).filter((o) => o.active),
    [state, productionId],
  );
  const occ = occs.find((o) => o.id === scene) ?? null;

  const options: { id: string; label: string }[] = useMemo(() => {
    switch (kind) {
      case "asset":
        return Object.values(state.assets)
          .filter((a) => a.id !== asset.id && !a.archived && a.kind !== "sound")
          .sort((a, b) => a.name.localeCompare(b.name, collation()))
          .map((a) => ({ id: a.id, label: a.name }));
      case "scene":
        return occs.map((o) => ({
          id: o.sceneId,
          label:
            `${o.productionNumber ?? ""} ${formatHeading(state.variants[o.variantId]!.heading)}`.trim(),
        }));
      case "block":
        return occ
          ? blocksOfVariant(state, occ.variantId)
              .filter((b) => b.kind === "dialogue" || b.kind === "action")
              .map((b) => ({
                id: b.id,
                label: b.text.length > 70 ? `${b.text.slice(0, 67)}…` : b.text,
              }))
          : [];
      case "segment":
        return occ
          ? Object.values(state.segments)
              .filter((g) => g.occurrenceId === occ.id)
              .sort((a, b) => compareKeys(a.orderKey, b.orderKey))
              .map((g, i) => ({ id: g.id, label: L(`Delsekvens ${i + 1}`, `Segment ${i + 1}`) }))
          : [];
      case "event":
        return Object.values(state.continuityEvents)
          .filter((e) => !e.removed)
          .map((e) => ({ id: e.id, label: soundLinkLabel(state, { kind: "event", id: e.id }) }));
      case "production":
        return Object.values(state.productions).map((p) => ({ id: p.id, label: p.name }));
    }
  }, [kind, state, asset.id, occs, occ]);

  function save(next: readonly SoundLink[], label: string) {
    setErr(cmds.run({ type: "SetSoundLinks", assetId: asset.id, links: next } as never, label));
  }
  const needsScene = kind === "block" || kind === "segment";

  return (
    <section
      aria-labelledby="sound-links-title"
      className="flex flex-col gap-2 border border-border bg-surface-1 p-3"
    >
      <h3 id="sound-links-title" className="flex items-center gap-1.5 text-[13px] font-medium">
        <Link2 className="size-4" aria-hidden /> {L("Hører til", "Belongs to")}
      </h3>
      {links.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {L(
            "Ingen koblinger. Koble lyden til en karakter, scene, replikk, delsekvens, hendelse eller produksjon, så finnes den igjen i søket.",
            "No links. Link the sound to a character, scene, line, segment, event or production, so it can be found again in search.",
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label={L("Koblinger", "Links")}>
          {links.map((l) => (
            <li key={`${l.kind}:${l.id}`} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 text-text-tertiary">{SOUND_LINK_LABEL[l.kind]}</span>
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {soundLinkLabel(state, l)}
              </span>
              {editable ? (
                <button
                  type="button"
                  aria-label={L(
                    `Fjern koblingen til ${soundLinkLabel(state, l)}`,
                    `Remove the link to ${soundLinkLabel(state, l)}`,
                  )}
                  className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                  onClick={() =>
                    save(
                      links.filter((x) => !(x.kind === l.kind && x.id === l.id)),
                      L("Fjern kobling for lyd", "Remove sound link"),
                    )
                  }
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label={L("Type kobling", "Link type")}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as SoundLinkKind);
              setTarget("");
            }}
            className={ctl}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {SOUND_LINK_LABEL[k]}
              </option>
            ))}
          </select>
          {needsScene ? (
            <select
              aria-label="Scene"
              value={scene}
              onChange={(e) => {
                setScene(e.target.value);
                setTarget("");
              }}
              className={ctl + " max-w-56"}
            >
              <option value="">{L("Velg scene …", "Choose scene …")}</option>
              {occs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.productionNumber ?? ""} {formatHeading(state.variants[o.variantId]!.heading)}
                </option>
              ))}
            </select>
          ) : null}
          <select
            aria-label={L("Koble til", "Link to")}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={ctl + " max-w-72 flex-1"}
            disabled={needsScene && !occ}
          >
            <option value="">{L("Velg …", "Choose …")}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id} disabled={links.some((l) => l.id === o.id)}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!target}
            onClick={() => {
              save([...links, { kind, id: target }], L("Koble lyd", "Link sound"));
              setTarget("");
            }}
          >
            {L("Koble til", "Link to")}
          </Button>
        </div>
      ) : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </section>
  );
}
