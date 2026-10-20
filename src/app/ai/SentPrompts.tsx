/**
 * Beskrivelsene slik de sendes til modellen (synlige beskrivelser, mandat 18, REQ-0489, DEC-0070), med
 * hva som ble tilpasset for modellen (lengde, lyd). Vises i bekreftelsen før noe koster penger.
 */

import { t } from "@/core/i18n/keyed";

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
        {t("app-ai-sent-prompts.sent-prompts.summary.0ad6cdb50924")}
        {changed.length
          ? t("app-ai-sent-prompts.sent-prompts.summary.78813c7d5dce", { length: String(changed.length), length2: String(items.length) })
          : t("app-ai-sent-prompts.sent-prompts.summary.1910a33162ee")}
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
              {x.label} ({x.text.length} {t("app-ai-sent-prompts.sent-prompts.p.3d4fb296b758")})
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
