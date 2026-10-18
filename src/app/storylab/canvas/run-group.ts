import { newId, type Command } from "@/core";
import type { Commands } from "@/app/project/use-commands";

/** Kjører kommandoene etter hverandre som én angregruppe. Gir feilen (eller null). */
export async function runGroup(cmds: Commands, commands: readonly Command[], label: string): Promise<string | null> {
  const group = `canvas:${newId()}`;
  for (const c of commands) {
    const r = await cmds.runAndWait(c, label, group);
    if (r.error) return r.error;
  }
  return null;
}
