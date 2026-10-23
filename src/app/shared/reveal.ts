/**
 * Nye resultater skal aldri havne utenfor synet (Øystein 23.10): når en versjon dukker opp i en liste (eller
 * lenken ber om en bestemt versjon), rulles den inn i synet og markeres kort.
 */
import { useEffect, useRef, useState } from "react";

/** Ren regel: hvilke ID-er som er nye siden forrige visning (ingen ved første visning). */
export function newlyAdded(prev: readonly string[] | null, next: readonly string[]): string[] {
  if (prev === null) return [];
  const old = new Set(prev);
  return next.filter((id) => !old.has(id));
}

/** Hvilken ID som skal vises: den lenken ber om (første gang den finnes), ellers den siste nye. */
export function revealTarget(prev: readonly string[] | null, next: readonly string[], focusId: string | null, focusDone: boolean): string | null {
  if (focusId && !focusDone && next.includes(focusId)) return focusId;
  return newlyAdded(prev, next).at(-1) ?? null;
}

export const REVEAL_FLASH_MS = 2000;

/**
 * Ruller elementet med `data-reveal-id` inn i synet i `root` og returnerer ID-en som markeres kort.
 */
export function useRevealNew(root: React.RefObject<HTMLElement | null>, ids: readonly string[], focusId: string | null = null): string | null {
  const prev = useRef<readonly string[] | null>(null);
  const focusDone = useRef(false);
  const [flash, setFlash] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    const target = revealTarget(prev.current, ids, focusId, focusDone.current);
    prev.current = ids;
    if (!target) return;
    if (target === focusId) focusDone.current = true;
    const el = root.current?.querySelector<HTMLElement>(`[data-reveal-id="${CSS.escape(target)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    setFlash(target);
    const h = setTimeout(() => setFlash((f) => (f === target ? null : f)), REVEAL_FLASH_MS);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, focusId]);
  return flash;
}
