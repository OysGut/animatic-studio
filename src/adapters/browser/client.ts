/**
 * Nettleserklienten til Lovable Cloud (Supabase) – det eneste stedet i nettleserkoden som importerer den
 * (KI-181, ARCHITECTURE §6). Resten av appen (`src/app`) bruker de små funksjonene i `src/adapters/browser/`,
 * så UI-et ikke er bundet til Supabase og kan flyttes til en annen backend (REQ-0008, DEC-0078).
 */
import { supabase } from "@/integrations/supabase/client";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

/** Den genererte Supabase-klienten (Auth, Storage, Realtime). Bare for adaptermodulene. */
export const browserClient = supabase;

/** Nettleserklient uten genererte tabelltyper (typer genereres av Lovable etter migrasjon 0001). */
export const db = supabase as unknown as AnyClient;

let channelSeq = 0;
/**
 * Et kanalnavn som er unikt for hver lytter (DEC-0091, KI-237). Supabase gir tilbake den samme kanalen når
 * navnet allerede er i bruk, og da krasjer `.on()` etter `subscribe()` – f.eks. når to deler av siden lytter
 * på samme prosjekt, eller når en komponent monteres på nytt før den gamle kanalen er fjernet. Ikke for
 * tilstedeværelse, der alle må dele samme navn.
 */
export function uniqueChannelName(base: string): string {
  channelSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${channelSeq}-${rand}`;
}

/** Feil fra backend, uten teknisk innpakning. */
export interface BackendError {
  readonly message: string;
}

/** Svar der kalleren selv avgjør hva en feil betyr (samme form som Supabase gir). */
export interface BackendResult<T> {
  readonly data: T;
  readonly error: BackendError | null;
}

/** G-8: vennlig, oversatt melding når databasen stopper et kall for hyppig (SQLSTATE PTG15), ellers meldingen. */
export function backendMessage(e: { readonly message: string; readonly code?: string | null }): string {
  return e.code === "PTG15" ? t("adapters-storage-commands-functions.rate-limited") : e.message;
}

export function plainError(e: { message: string; code?: string | null } | null | undefined): BackendError | null {
  return e ? { message: backendMessage(e) } : null;
}
