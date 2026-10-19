/** Skrivehjelpen (T2): gammel og ny tekst side om side, med markering på ordnivå og valg per linje. */
import { L, wordDiff, type Proposal, type ProposalItem } from "@/core";

const KIND: Record<string, () => string> = {
  action: () => L("Handling", "Action"),
  character: () => L("Karakter", "Character"),
  parenthetical: () => L("Parentes", "Parenthetical"),
  dialogue: () => L("Replikk", "Dialogue"),
  transition: () => L("Overgang", "Transition"),
  shot: () => L("Bilde", "Shot"),
  note: () => L("Notat", "Note"),
  heading: () => L("Sceneoverskrift", "Scene heading"),
};

function Side({ item, side }: { item: ProposalItem; side: "old" | "new" }) {
  const parts = wordDiff(item.oldText, item.newText);
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-text-primary">
      {parts.map((p, i) =>
        p.op === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.op === "removed" && side === "old" ? (
          <del key={i} className="bg-status-danger/15 text-status-danger">
            {p.text}
          </del>
        ) : p.op === "added" && side === "new" ? (
          <ins key={i} className="bg-accent-brand/15 text-accent-brand no-underline">
            {p.text}
          </ins>
        ) : null,
      )}
    </p>
  );
}

export function ProposalDiff({
  proposal,
  picked,
  conflicts,
  onToggle,
}: {
  proposal: Proposal;
  picked: ReadonlySet<string>;
  conflicts: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const rows: ProposalItem[] = [
    ...(proposal.headingFix
      ? [
          {
            key: "heading",
            blockId: null,
            kind: "heading" as const,
            oldText: `${proposal.headingFix.oldHeading.intExt} ${proposal.headingFix.oldHeading.location} – ${proposal.headingFix.oldHeading.time}`,
            newText: `${proposal.headingFix.heading.intExt} ${proposal.headingFix.heading.location} – ${proposal.headingFix.heading.time}`,
            baseRevision: proposal.headingFix.revision,
            baseText: null,
          },
        ]
      : []),
    ...(proposal.scene
      ? [
          {
            key: "scene-heading",
            blockId: null,
            kind: "heading" as const,
            oldText: "",
            newText: `${proposal.scene.heading.intExt} ${proposal.scene.heading.location} – ${proposal.scene.heading.time}`,
            baseRevision: null,
            baseText: null,
          },
        ]
      : []),
    ...proposal.items,
  ];
  const isNew = proposal.kind === "next_line" || proposal.kind === "scene";
  return (
    <div className="space-y-2" data-testid="assist-diff">
      <div className="grid grid-cols-[20px_1fr_1fr] gap-2 text-chrome-label uppercase tracking-label text-text-tertiary">
        <span />
        <span>{proposal.kind === "translate" ? L("Norsk", "Norwegian") : L("Nå", "Now")}</span>
        <span>{proposal.kind === "translate" ? L("Engelsk utkast", "English draft") : L("Forslag", "Suggestion")}</span>
      </div>
      {rows.map((item) => {
        const conflict = conflicts.has(item.key);
        const fixed = item.key === "scene-heading";
        return (
          <div
            key={item.key}
            data-testid="assist-diff-row"
            data-key={item.key}
            data-conflict={conflict ? "true" : undefined}
            className={
              "grid grid-cols-[20px_1fr_1fr] gap-2 rounded-sm border p-2 " +
              (conflict ? "border-status-danger/60" : "border-border")
            }
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={fixed || (picked.has(item.key) && !conflict)}
              disabled={fixed || conflict}
              onChange={() => onToggle(item.key)}
              aria-label={L("Ta med denne linjen", "Include this line")}
              data-testid="assist-diff-pick"
            />
            <div className="min-w-0">
              <p className="mb-0.5 text-[11px] text-text-tertiary">
                {(KIND[item.kind] ?? KIND["action"]!)()}
                {isNew ? ` · ${L("Ny", "New")}` : ""}
              </p>
              {proposal.kind === "translate" ? (
                <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-text-primary">{item.oldText}</p>
              ) : (
                <Side item={item} side="old" />
              )}
            </div>
            <div className="min-w-0">
              <p className="mb-0.5 text-[11px] text-text-tertiary">&nbsp;</p>
              {proposal.kind === "translate" ? (
                <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-text-primary">{item.newText}</p>
              ) : (
                <Side item={item} side="new" />
              )}
              {conflict ? (
                <p className="mt-1 text-[11px] text-status-danger" data-testid="assist-conflict">
                  {L("Endret av noen andre etter forslaget", "Changed by someone else after the suggestion")}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
