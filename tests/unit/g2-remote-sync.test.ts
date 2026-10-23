// @vitest-environment node
/**
 * G-2 (A2): to klienter med falsk sanntid. Andres endringer brukes direkte på lokal tilstand i rekkefølge etter
 * project_seq, hull tettes med bare de manglende radene, og full innlasting skjer bare som siste utvei.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  applyRemoteRows,
  checkInvariants,
  keyBetween,
  mergeBlockHistory,
  type Command,
  type ProjectState,
} from "@/core";
import { createRemoteSync, type RemoteSync } from "@/app/project/remote-sync";
import { ALICE, BOB, seedProject, tid } from "../helpers/fixtures";

type LogRow = Record<string, unknown>;

/** Klient A gjør endringer; serverloggen får én rad per kommando med sammenhengende project_seq. */
function clientA(start: ProjectState) {
  let state = start;
  const log: LogRow[] = [];
  return {
    log,
    get state() {
      return state;
    },
    run(command: Command) {
      const id = tid<"command">();
      const at = new Date(Date.UTC(2026, 9, 23, 12, 0, log.length)).toISOString();
      const r = applyCommand(state, { id, actor: ALICE, at, command });
      if (!r.ok) throw new Error(`${command.type}: ${r.error.message}`);
      state = r.state;
      log.push({ id, project_seq: log.length + 1, actor: ALICE, created_at: at, command, affected_ids: r.affected });
    },
  };
}

/** Klient B: synkroniseringen med en falsk spørringsbuffer. */
function clientB(start: ProjectState, serverLog: LogRow[], opts: { own?: Set<string>; busy?: () => boolean } = {}) {
  let state: ProjectState | undefined = start;
  const idle = new Set<() => void>();
  const foreign: string[][] = [];
  const sync: RemoteSync = createRemoteSync({
    getState: () => state,
    setState: (s) => (state = s),
    isFetching: () => false,
    reload: () => {},
    fetchAfter: async (after) => serverLog.filter((r) => Number(r["project_seq"]) > after).slice(0, 500),
    isOwn: (id) => opts.own?.has(id) ?? false,
    isBusy: opts.busy ?? (() => false),
    onIdle: (fn) => idle.add(fn),
    onForeign: (ids) => foreign.push([...ids]),
    schedule: (fn) => void Promise.resolve().then(fn),
    log: () => {},
  });
  sync.reset(0);
  return {
    sync,
    foreign,
    get state() {
      return state;
    },
    fireIdle() {
      for (const f of [...idle]) {
        idle.delete(f);
        f();
      }
    },
  };
}

function scenario() {
  const { state, mainId } = seedProject(1);
  const a = clientA(state);
  const blockId = tid<"block">();
  a.run({
    type: "CreateScene",
    productionId: mainId,
    sceneId: tid<"scene">(),
    variantId: tid<"variant">(),
    occurrenceId: tid<"occurrence">(),
    orderKey: keyBetween(Object.values(state.occurrences).map((o) => o.orderKey).sort().at(-1) ?? null, null),
    heading: { intExt: "INT.", location: "STUE", time: "DAG" },
    blocks: [{ blockId, kind: "action", text: "Start", orderKey: keyBetween(null, null) }],
  } as never);
  for (let i = 1; i < 100; i++)
    a.run({ type: "EditBlockText", productionId: mainId, blockId, text: `Endring ${i}` } as never);
  return { start: state, a, blockId };
}

describe("G-2 A2: andres endringer uten full innlasting", () => {
  it("100 raske endringer fra A gir samme tilstand hos B, uten full innlasting", async () => {
    const { start, a } = scenario();
    const b = clientB(start, a.log);
    for (const row of a.log) b.sync.receive(row);
    await b.sync.settle();
    expect(b.state).toEqual(a.state);
    expect(b.sync.stats).toMatchObject({ applied: 100, reloads: 0, fetched: 0 });
    expect(b.sync.lastSeq()).toBe(100);
    expect(b.foreign).toHaveLength(100);
  });

  it("varsler i feil rekkefølge brukes likevel etter project_seq", async () => {
    const { start, a } = scenario();
    const b = clientB(start, a.log);
    for (const row of [...a.log].reverse()) b.sync.receive(row);
    await b.sync.settle();
    expect(b.state).toEqual(a.state);
    expect(b.sync.stats.reloads).toBe(0);
  });

  it("hull i sekvensen: bare de manglende radene hentes, ingen full innlasting", async () => {
    const { start, a } = scenario();
    const b = clientB(start, a.log);
    // Varslene for 40–49 kommer aldri; 60 kommer uten kommando (for stort sanntidsvarsel)
    for (const row of a.log) {
      const seq = Number(row["project_seq"]);
      if (seq >= 40 && seq < 50) continue;
      b.sync.receive(seq === 60 ? { ...row, command: undefined } : row);
    }
    for (let i = 0; i < 20; i++) await b.sync.settle();
    expect(b.state).toEqual(a.state);
    expect(b.sync.stats.reloads).toBe(0);
    expect(b.sync.stats.fetched).toBeGreaterThan(0);
    expect(b.sync.lastSeq()).toBe(100);
  });

  it("ukjent kommando gir full innlasting (logget), ikke en stille feil", async () => {
    const { start, a } = scenario();
    const reasons: string[] = [];
    let reloads = 0;
    let state: ProjectState | undefined = start;
    const sync = createRemoteSync({
      getState: () => state,
      setState: (s) => (state = s),
      isFetching: () => false,
      reload: () => void reloads++,
      fetchAfter: async () => [],
      isOwn: () => false,
      isBusy: () => false,
      onIdle: () => {},
      onForeign: () => {},
      log: (m) => reasons.push(m),
    });
    sync.reset(0);
    sync.receive(a.log[0]!);
    sync.receive({ ...a.log[1]!, command: { type: "NoSuchCommand" } });
    await sync.settle();
    expect(reloads).toBe(1);
    expect(reasons.join(" ")).toMatch(/NoSuchCommand/);
    expect(sync.lastSeq()).toBe(1);
  });

  it("hull som ikke lar seg tette, gir full innlasting etter noen forsøk", async () => {
    const { start, a } = scenario();
    let reloads = 0;
    let state: ProjectState | undefined = start;
    const sync = createRemoteSync({
      getState: () => state,
      setState: (s) => (state = s),
      isFetching: () => false,
      reload: () => void reloads++,
      fetchAfter: async () => [],
      isOwn: () => false,
      isBusy: () => false,
      onIdle: () => {},
      onForeign: () => {},
      schedule: (fn) => void Promise.resolve().then(fn),
      log: () => {},
    });
    sync.reset(0);
    sync.receive(a.log[5]!);
    for (let i = 0; i < 10; i++) await sync.settle();
    expect(reloads).toBe(1);
  });

  it("egne kommandoer hoppes over, og andres endringer venter til egen lagring er ferdig (K-1)", async () => {
    const { start, a } = scenario();
    // B har selv gjort kommando 1 (allerede i tilstanden) – resten er andres
    const own = new Set([String(a.log[0]!["id"])]);
    const first = applyCommand(start, { id: a.log[0]!["id"] as never, actor: ALICE, at: String(a.log[0]!["created_at"]), command: a.log[0]!["command"] as Command });
    if (!first.ok) throw new Error("oppsett");
    let busy = true;
    const b = clientB(first.state, a.log, { own, busy: () => busy });
    for (const row of a.log) b.sync.receive(row);
    await b.sync.settle();
    expect(b.state).toBe(first.state); // ingenting brukt midt i egen lagring
    expect(b.foreign).toHaveLength(99); // men angrevernet varsles straks, som før
    busy = false;
    b.fireIdle();
    await b.sync.settle();
    expect(b.state).toEqual(a.state);
    expect(b.sync.stats).toMatchObject({ applied: 99, reloads: 0 });
  });

  it("applyRemoteRows er ren: samme rader gir samme tilstand og rapporterer hull", () => {
    const { start, a } = scenario();
    const rows = a.log.map((r) => ({ projectSeq: Number(r["project_seq"]), id: String(r["id"]), actor: BOB, createdAt: String(r["created_at"]), command: r["command"] }));
    const gap = applyRemoteRows(start, 0, rows.filter((r) => r.projectSeq !== 3), () => false);
    expect(gap.lastSeq).toBe(2);
    expect(gap.missing).toEqual({ after: 2, upTo: 100 });
  });
});

describe("G-2 A1: historikk lastes etter åpning", () => {
  it("tilstand med bare gjeldende revisjon passerer kontrollene, og full historikk flettes inn uten duplikater", () => {
    const { a, blockId } = scenario();
    const full = a.state;
    const current = { ...full, blockRevisions: full.blockRevisions.filter((r) => r.rev === full.blocks[blockId]!.currentRev || String(r.blockId) !== String(blockId)), blockHistory: "current" as const };
    expect(checkInvariants(current)).toEqual([]);
    const { blockHistory: _p, ...asFull } = current;
    expect(checkInvariants(asFull)).not.toEqual([]);
    const merged = mergeBlockHistory(current, full.blockRevisions);
    expect(merged.blockHistory).toBeUndefined();
    expect(merged.blockRevisions).toEqual(full.blockRevisions);
    expect(checkInvariants(merged)).toEqual([]);
  });
});
