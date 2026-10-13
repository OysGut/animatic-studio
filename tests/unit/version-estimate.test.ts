// @vitest-environment jsdom
/**
 * Varighetsestimatet lagres med hver ny manusversjon (REQ-0120, migrasjon 0028). Feiler lagringen av
 * estimatet, er versjonen likevel lagret. Databasefunksjonene er attrapper; ingen ekte tjenester kalles.
 */
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useCreateVersion, versionDurationEstimate } from "@/app/project/use-versions";
import { mustApply, seedProject } from "../helpers/fixtures";
import { orderedOccurrences } from "@/core";

const h = vi.hoisted(() => ({
  create: null as unknown as Mock<(a: unknown) => Promise<string>>,
  save: null as unknown as Mock<(a: unknown) => Promise<unknown>>,
}));
h.create = vi.fn();
h.save = vi.fn();

vi.mock("@/adapters/browser/versions", () => ({
  createScriptVersion: (a: unknown) => h.create(a),
  fetchScriptSnapshot: vi.fn(),
  listScriptVersions: vi.fn(async () => []),
}));
vi.mock("@/adapters/browser/history-records", () => ({
  saveDurationEstimate: (a: unknown) => h.save(a),
  listDurationEstimates: vi.fn(async () => []),
  listExportRecords: vi.fn(async () => []),
  recordExport: vi.fn(),
  listScriptVersionsWithSnapshots: vi.fn(async () => []),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("Estimat lagres med manusversjonen (REQ-0120)", () => {
  beforeEach(() => {
    h.create.mockReset().mockResolvedValue("versjon-1");
    h.save.mockReset().mockResolvedValue({ id: "estimat-1", scriptVersionId: "versjon-1" });
  });

  it("estimatet regnes ut som i varighetsoversikten", () => {
    const { state, mainId } = seedProject();
    const e = versionDurationEstimate(state, mainId);
    expect(e.snapshot.format).toBe(1);
    expect(e.snapshot.activeScenes).toBeGreaterThan(0);
    expect(e.snapshot.estimatedSeconds).toBeGreaterThan(0);
  });

  it("lagrer estimatet knyttet til den nye versjonen", async () => {
    const { state, mainId } = seedProject();
    const { result } = renderHook(() => useCreateVersion("prosjekt", mainId, true), { wrapper });
    let r: unknown;
    await act(async () => {
      r = await result.current.mutateAsync({ name: "V1", note: "", state });
    });
    expect(r).toEqual({ id: "versjon-1", estimateError: null });
    expect(h.save).toHaveBeenCalledTimes(1);
    const arg = h.save.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      projectId: "prosjekt",
      productionId: mainId,
      scriptVersionId: "versjon-1",
    });
    expect(arg["snapshot"]).toEqual(versionDurationEstimate(state, mainId).snapshot);
  });

  it("venter til køen med endringer er lagret, og regner estimatet fra den lagrede tilstanden", async () => {
    const { state, mainId } = seedProject();
    // Etter at køen er tom: en scene er deaktivert (lagret på serveren)
    const o = orderedOccurrences(state, mainId)[0]!;
    const saved = mustApply(state, {
      type: "SetOccurrenceActive",
      occurrenceId: o.id,
      active: false,
    });
    expect(versionDurationEstimate(saved, mainId).snapshot).not.toEqual(
      versionDurationEstimate(state, mainId).snapshot,
    );
    let idle: () => void = () => undefined;
    const whenIdle = vi.fn(() => new Promise<void>((res) => (idle = res)));
    let current = state;
    const { result } = renderHook(
      () => useCreateVersion("prosjekt", mainId, true, { whenIdle, current: () => current }),
      { wrapper },
    );
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = result.current.mutateAsync({ name: "V1", note: "", state });
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Versjonen lages ikke før alt er lagret
    expect(whenIdle).toHaveBeenCalledTimes(1);
    expect(h.create).not.toHaveBeenCalled();
    current = saved;
    await act(async () => {
      idle();
      await p;
    });
    expect(h.create).toHaveBeenCalledTimes(1);
    const arg = h.save.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg["snapshot"]).toEqual(versionDurationEstimate(saved, mainId).snapshot);
  });

  it("feil ved lagring av estimatet stopper ikke versjonen", async () => {
    h.save.mockRejectedValue(new Error("nettverksfeil"));
    const { state, mainId } = seedProject();
    const { result } = renderHook(() => useCreateVersion("prosjekt", mainId, true), { wrapper });
    let r: unknown;
    await act(async () => {
      r = await result.current.mutateAsync({ name: "V1", note: "", state });
    });
    expect(r).toEqual({ id: "versjon-1", estimateError: "nettverksfeil" });
  });

  it("uten migrasjon 0028 lagres bare versjonen", async () => {
    const { state, mainId } = seedProject();
    const { result } = renderHook(() => useCreateVersion("prosjekt", mainId, false), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "V1", note: "", state });
    });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.save).not.toHaveBeenCalled();
  });
});
