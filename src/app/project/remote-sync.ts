/**
 * G-2 (A2): synkronisering av andres endringer uten full innlasting. Kommandoene fra change_log brukes direkte
 * på den lokale tilstanden (applyRemoteRows i kjernen), i rekkefølge etter project_seq. Hull i rekken tettes ved
 * å hente bare de manglende radene. Full innlasting brukes bare som siste utvei (ukjent kommando, konflikt,
 * hull som ikke lar seg tette) og logges.
 *
 * Egne kommandoer (ownCommandIds) er allerede i tilstanden og hoppes over, som før. Andres endringer brukes
 * ikke midt i egen lagring (commandQueue), så egne endringer aldri forsvinner (K-1 uendret).
 */
import { applyRemoteRows, remoteLogRow, type ProjectState, type RemoteLogRow } from "@/core";

export interface RemoteSyncDeps {
  getState(): ProjectState | undefined;
  setState(state: ProjectState): void;
  /** Pågår en full innlasting? Da venter vi på den (den gir ny loggposisjon). */
  isFetching(): boolean;
  /** Full innlasting (siste utvei). */
  reload(reason: string): void;
  fetchAfter(after: number): Promise<readonly Record<string, unknown>[]>;
  isOwn(id: string): boolean;
  /** Venter egne kommandoer på lagring? */
  isBusy(): boolean;
  onIdle(fn: () => void): void;
  /** Varsel med ID-ene andre har endret (angring stoppes for det andre har endret etterpå). */
  onForeign(ids: readonly string[]): void;
  /** Tidsplanlegging (byttes ut i tester). */
  schedule?(fn: () => void, ms: number): void;
  log?(message: string): void;
}

export interface RemoteSync {
  /** Ny loggposisjon etter full innlasting (null: ukjent – da gir hver ekstern endring full innlasting, som før). */
  reset(logSeq: number | null): void;
  /** Et sanntidsvarsel fra change_log. */
  receive(raw: Record<string, unknown>): void;
  /** Prøv å bruke det som venter (etter innlasting eller når køen er tom). */
  drainSoon(): void;
  /** Venter til alt som kan brukes nå, er brukt (til tester). */
  settle(): Promise<void>;
  lastSeq(): number | null;
  readonly stats: { applied: number; fetched: number; reloads: number; reasons: string[] };
}

const MAX_GAP_ATTEMPTS = 3;

export function createRemoteSync(deps: RemoteSyncDeps): RemoteSync {
  const schedule = deps.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
  const log = deps.log ?? ((m) => console.warn(m));
  let lastSeq: number | null = null;
  let known = false;
  const buffer = new Map<number, RemoteLogRow>();
  let running: Promise<void> | null = null;
  let queued = false;
  let gapAttempts = 0;
  let waitingIdle = false;
  let legacyPending = false;
  const stats = { applied: 0, fetched: 0, reloads: 0, reasons: [] as string[] };

  const reload = (reason: string) => {
    stats.reloads++;
    stats.reasons.push(reason);
    log(`[sync] full innlasting: ${reason}`); // i18n-ignore: logg
    gapAttempts = 0;
    deps.reload(reason);
  };

  const prune = () => {
    if (lastSeq === null) return;
    for (const k of [...buffer.keys()]) if (k <= lastSeq) buffer.delete(k);
  };

  async function drainOnce(): Promise<void> {
    if (!known) return;
    if (deps.isFetching()) return; // den nye innlastingen kaller reset + drainSoon
    if (deps.isBusy()) {
      if (!waitingIdle) {
        waitingIdle = true;
        deps.onIdle(() => {
          waitingIdle = false;
          drainSoon();
        });
      }
      return;
    }
    if (lastSeq === null) {
      // Ukjent loggposisjon: samme oppførsel som før G-2
      if (legacyPending) {
        legacyPending = false;
        reload("ukjent loggposisjon"); // i18n-ignore: logg
      }
      return;
    }
    if (buffer.size === 0) return;
    const state = deps.getState();
    if (!state) return;
    const res = applyRemoteRows(state, lastSeq, [...buffer.values()], deps.isOwn);
    if (res.state !== state) deps.setState(res.state);
    stats.applied += res.applied;
    lastSeq = res.lastSeq;
    prune();
    if (res.reload) {
      buffer.clear();
      reload(res.reload);
      return;
    }
    if (!res.missing) {
      gapAttempts = 0;
      return;
    }
    // Hull: hent bare radene som mangler
    gapAttempts++;
    const after = lastSeq;
    let rows: readonly Record<string, unknown>[] = [];
    try {
      rows = await deps.fetchAfter(after);
    } catch (e) {
      log(`[sync] henting av loggrader feilet: ${String(e)}`); // i18n-ignore: logg
    }
    stats.fetched += rows.length;
    for (const raw of rows) {
      const r = remoteLogRow(raw);
      if (r && lastSeq !== null && r.projectSeq > lastSeq) buffer.set(r.projectSeq, r);
    }
    if (lastSeq !== after) return; // en innlasting kom imellom
    if (buffer.has(after + 1) && (buffer.get(after + 1)!.command !== null || deps.isOwn(buffer.get(after + 1)!.id))) {
      queued = true;
      return;
    }
    if (gapAttempts >= MAX_GAP_ATTEMPTS) {
      buffer.clear();
      reload(`hull i loggen etter ${after}`); // i18n-ignore: logg
      return;
    }
    schedule(drainSoon, 250 * gapAttempts);
  }

  function drainSoon() {
    if (running) {
      queued = true;
      return;
    }
    running = (async () => {
      do {
        queued = false;
        await drainOnce();
      } while (queued);
    })().finally(() => {
      running = null;
    });
  }

  return {
    reset(seq) {
      known = true;
      lastSeq = seq;
      gapAttempts = 0;
      legacyPending = false;
      if (seq === null) buffer.clear();
      prune();
      drainSoon();
    },
    receive(raw) {
      const id = typeof raw["id"] === "string" ? raw["id"] : "";
      const own = !!id && deps.isOwn(id);
      if (!own) {
        const ids = Array.isArray(raw["affected_ids"]) ? (raw["affected_ids"] as string[]) : [];
        deps.onForeign(ids);
      }
      const row = remoteLogRow(raw);
      if (!row || lastSeq === null) {
        if (!own) {
          legacyPending = true;
          drainSoon();
        }
        return;
      }
      if (row.projectSeq <= lastSeq) return;
      buffer.set(row.projectSeq, row);
      drainSoon();
    },
    drainSoon,
    async settle() {
      for (let i = 0; i < 1000 && running; i++) await running;
    },
    lastSeq: () => lastSeq,
    stats,
  };
}
