/**
 * Beskrivelsene slik de sendes til modellen (synlige beskrivelser, mandat 18, REQ-0489, DEC-0070), med
 * hva som ble tilpasset for modellen (lengde, lyd). Vises i bekreftelsen før noe koster penger.
 */
import { L } from "@/core";

export function SentPrompts({
  items,
}: {
  items: readonly { label: string; text: string; notes: readonly string[] }[];
}) {
  if (!items.length) return null;
  const changed = items.filter((x) => x.notes.length);
  const notes = [...new Set(changed.flatMap((x) => x.notes))];
  return (
    <details className="text-[11px] text-text-tertiary">
      <summary className="cursor-pointer">
        {L("Se det som sendes til modellen", "See what is sent to the model")}
        {changed.length
          ? L(
              ` – tilpasset modellen i ${changed.length} av ${items.length}`,
              ` – adjusted for the model in ${changed.length} of ${items.length}`,
            )
          : L(" (uendret)", " (unchanged)")}
      </summary>
      {notes.length ? (
        <ul className="ml-4 mt-1 list-disc text-text-secondary">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1 flex max-h-56 flex-col gap-2 overflow-y-auto">
        {items.map((x, i) => (
          <div key={`${x.label}-${i}`}>
            <p className="font-medium text-text-secondary">
              {x.label} ({x.text.length} {L("tegn", "characters")})
            </p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-secondary">
              {x.text}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
