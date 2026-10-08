import { supabase } from "@/integrations/supabase/client";
import type { AnyClient } from "@/adapters/storage/project-rows";

/** Nettleserklient uten genererte tabelltyper (typer genereres av Lovable etter migrasjon 0001). */
export const db = supabase as unknown as AnyClient;
