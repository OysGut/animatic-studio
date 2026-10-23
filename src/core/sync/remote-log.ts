/**
 * G-2 (A2): andres endringer fra kommandologgen (change_log) brukes direkte på lokal tilstand med den samme
 * domenekjernen som serveren brukte, i rekkefølge etter project_seq. Ren og plattformnøytral: henting,
 * sanntid og ny innlasting ligger i adapteren/appen.
 */
import { applyCommand } from "../commands/apply";
import type { Command } from "../commands/types";
import type { BlockRevision, ProjectState } from "../model";

/** Én rad i kommandologgen slik klienten ser den. `command` kan mangle (for stort sanntidsvarsel). */
export interface RemoteLogRow {
  readonly projectSeq: number;
  readonly id: string;
  readonly actor: string;
  readonly createdAt: string;
  readonly command: unknown;
}

export type RemoteApplyResult = {
  /** Tilstanden etter radene som kunne brukes (uendret objekt når ingenting ble brukt). */
  readonly state: ProjectState;
  /** Siste project_seq som er brukt eller hoppet over (egen kommando). */
  readonly lastSeq: number;
  /** Antall andres kommandoer som ble brukt. */
  readonly applied: number;
  /** Rader som mangler før neste kjente rad (hull i rekken eller rad uten kommando). */
  readonly missing: { readonly after: number; readonly upTo: number } | null;
  /** Grunnen til at full innlasting trengs (ukjent kommando eller konflikt), ellers null. */
  readonly reload: string | null;
};

/**
 * Bruk radene i rekkefølge fra `lastSeq + 1`. Egne kommandoer (`isOwn`) er allerede i tilstanden og hoppes over.
 * Stopper ved første hull (`missing`) eller første kommando som ikke kan brukes (`reload`).
 */
export function applyRemoteRows(
  state: ProjectState,
  lastSeq: number,
  rows: readonly RemoteLogRow[],
  isOwn: (id: string) => boolean,
): RemoteApplyResult {
  const bySeq = new Map<number, RemoteLogRow>();
  for (const r of rows) if (r.projectSeq > lastSeq) bySeq.set(r.projectSeq, r);
  const maxSeq = Math.max(lastSeq, ...bySeq.keys());
  let s = state;
  let seq = lastSeq;
  let applied = 0;
  while (seq < maxSeq) {
    const row = bySeq.get(seq + 1);
    if (!row || (!isOwn(row.id) && !isCommand(row.command)))
      return { state: s, lastSeq: seq, applied, missing: { after: seq, upTo: maxSeq }, reload: null };
    if (!isOwn(row.id)) {
      let r: ReturnType<typeof applyCommand>;
      try {
        r = applyCommand(s, { id: row.id as never, actor: row.actor as never, at: row.createdAt, command: row.command as Command });
      } catch (e) {
        return { state: s, lastSeq: seq, applied, missing: null, reload: `${commandType(row.command)}: ${String(e)}` };
      }
      if (!r.ok) return { state: s, lastSeq: seq, applied, missing: null, reload: `${commandType(row.command)}: ${r.error.code}` };
      s = r.state;
      applied++;
    }
    seq++;
  }
  return { state: s, lastSeq: seq, applied, missing: null, reload: null };
}

function isCommand(c: unknown): c is Command {
  return !!c && typeof c === "object" && typeof (c as { type?: unknown }).type === "string";
}
function commandType(c: unknown): string {
  return isCommand(c) ? c.type : "?";
}

/**
 * Flett full teksthistorikk inn i en tilstand som bare hadde gjeldende revisjon (G-2). Revisjoner som er lagt til
 * lokalt i mellomtiden, beholdes; samme (blokk, revisjon) tas bare med én gang.
 */
export function mergeBlockHistory(state: ProjectState, history: readonly BlockRevision[]): ProjectState {
  const seen = new Set<string>();
  const all: BlockRevision[] = [];
  for (const r of [...state.blockRevisions, ...history]) {
    const k = `${r.blockId}:${r.rev}`;
    if (seen.has(k) || !state.blocks[r.blockId]) continue;
    seen.add(k);
    all.push(r);
  }
  all.sort((a, b) => (a.blockId === b.blockId ? a.rev - b.rev : a.blockId < b.blockId ? -1 : 1));
  const { blockHistory: _partial, ...rest } = state;
  return { ...rest, blockRevisions: all };
}
