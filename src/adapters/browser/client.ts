/**
 * Nettleserklienten til Lovable Cloud (Supabase) – det eneste stedet i nettleserkoden som importerer den
 * (KI-181, ARCHITECTURE §6). Resten av appen (`src/app`) bruker de små funksjonene i `src/adapters/browser/`,
 * så UI-et ikke er bundet til Supabase og kan flyttes til en annen backend (REQ-0008, DEC-0078).
 */
import { supabase } from "@/integrations/supabase/client";
import type { AnyClient } from "@/adapters/storage/project-rows";

/** Den genererte Supabase-klienten (Auth, Storage, Realtime). Bare for adaptermodulene. */
export const browserClient = supabase;

/** Nettleserklient uten genererte tabelltyper (typer genereres av Lovable etter migrasjon 0001). */
export const db = supabase as unknown as AnyClient;

/** Feil fra backend, uten teknisk innpakning. */
export interface BackendError {
  readonly message: string;
}

/** Svar der kalleren selv avgjør hva en feil betyr (samme form som Supabase gir). */
export interface BackendResult<T> {
  readonly data: T;
  readonly error: BackendError | null;
}

export function plainError(e: { message: string } | null | undefined): BackendError | null {
  return e ? { message: e.message } : null;
}
