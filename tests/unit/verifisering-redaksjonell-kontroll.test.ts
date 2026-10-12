// @vitest-environment node
/**
 * Verifisering av krav (DEC-0073): brukeren har redaksjonell kontroll – analyser og AI endrer aldri manuset
 * selv (REQ-0326, REQ-0327), og en manusendring kan angres selektivt uten å røre andre endringer (REQ-0311,
 * kjernedelen).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blocksOfVariant,
  continuityAnalysis,
  continuitySuggestions,
  discrepancies,
  filmClips,
  librarySuggestions,
  mainProduction,
  scriptRevertCommands,
  type ProjectState,
} from "@/core";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const ROOT = join(__dirname, "../..");

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe("REQ-0326 / REQ-0327 – analyser og forslag endrer ikke manuset", () => {
  it("REQ-0326 REQ-0327: kontinuitetsanalyse, kontinuitetsforslag og ressursforslag lar prosjektet være uendret", () => {
    const s: ProjectState = structuredClone(fixture.state);
    const before = JSON.stringify(s);
    deepFreeze(s); // enhver endring av tilstanden kaster
    const main = mainProduction(s)!;
    const findings = continuityAnalysis(s, main.id);
    const contSuggestions = continuitySuggestions(s);
    const libSuggestions = librarySuggestions(s, main.id);
    // Analysene gir faktisk resultater på fixturen (ellers tester vi ingenting)
    expect(findings.length + contSuggestions.length + libSuggestions.length).toBeGreaterThan(0);
    expect(JSON.stringify(s)).toBe(before);
    // Resultatene er data (funn og forslag), ikke kommandoer som kan kjøres uten brukeren
    for (const x of [...findings, ...contSuggestions, ...libSuggestions])
      expect(x).not.toHaveProperty("command");
  });

  it("REQ-0326: ingen AI-funksjon på serveren skriver til manuset – bare jobb-, nøkkel- og grensetabellene", () => {
    const dir = join(ROOT, "src/adapters/ai");
    const writes: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      // Ingen kommandoer eller lagring av endringssett fra AI-koden
      expect(src, f).not.toMatch(/apply_changes|\.rpc\(|runCommand/);
      for (const m of src.matchAll(/\.from\(\s*"(\w+)"\s*\)\s*\.(update|insert|upsert|delete)\(/g))
        writes.push(`${f}: ${m[1]}.${m[2]}`);
    }
    // Kontrollprøve: mønsteret finner skrivingene som finnes
    expect(writes.length).toBeGreaterThan(0);
    const allowed = ["generation_jobs", "ai_provider_keys", "ai_account_limits"];
    for (const w of writes) expect(allowed, w).toContain(w.split(": ")[1]!.split(".")[0]);
  });
});

describe("REQ-0311 – selektiv angring av en manusendring (kjernen)", () => {
  it("REQ-0311: av to uavhengige endringer X og Y gir avviket gammel tekst for X; å sette den tilbake beholder Y", () => {
    const s0 = fixture.state;
    const main = mainProduction(s0)!;
    const clip0 = filmClips(s0, main.id).find((c) => c.compositionId !== null)!;
    const occ = s0.occurrences[clip0.occurrenceId]!;
    const compId = Object.values(s0.compositions).find((c) => c.variantId === occ.variantId)!.id;
    let s = mustApply(s0, {
      type: "AcceptScriptChanges",
      occurrenceId: occ.id,
      compositionIds: [compId as never],
      takeIds: [],
    });
    const blocks = blocksOfVariant(s, occ.variantId).filter((b) => b.kind !== "heading");
    const x = blocks.find((b) => b.kind === "dialogue")!;
    const y = blocks.find((b) => b.kind === "action")!;
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: x.id,
      text: "X ny",
    });
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: y.id,
      text: "Y ny",
    });
    const found = discrepancies(s, filmClips(s, main.id)).find(
      (d) => d.occurrenceId === occ.id && d.material.kind === "composition",
    )!;
    const cx = found.changes.find((c) => c.blockId === x.id)!;
    expect(cx).toMatchObject({ kind: "changed", oldText: x.text, newText: "X ny" });
    expect(found.changes.find((c) => c.blockId === y.id)).toMatchObject({ newText: "Y ny" });
    // «Angre denne» for X: kjernefunksjonen som knappen bruker (REQ-0311, DEC-0075)
    const cmds = scriptRevertCommands(s, main.id, [cx]);
    expect(cmds).toEqual([
      { type: "EditBlockText", productionId: main.id, blockId: x.id, text: x.text },
    ]);
    let after = s;
    for (const c of cmds) after = mustApply(after, c);
    expect(after.blocks[x.id]!.text).toBe(x.text);
    expect(after.blocks[y.id]!.text).toBe("Y ny");
    const left = discrepancies(after, filmClips(after, main.id)).find(
      (d) => d.occurrenceId === occ.id && d.material.kind === "composition",
    )!;
    expect(left.changes.map((c) => c.blockId)).toEqual([y.id]);
  });
});

describe("REQ-0311 – scriptRevertCommands for ny og fjernet blokk", () => {
  it("ny blokk fjernes, fjernet blokk gjenopprettes med gammel tekst, ukjente blokker hoppes over", () => {
    const blocks = {
      a: { id: "a", text: "ny", removed: false },
      r: { id: "r", text: "endret", removed: true },
    } as unknown as ProjectState["blocks"];
    const cmds = scriptRevertCommands({ blocks }, "p", [
      { blockId: "a", kind: "added", oldText: null, newText: "ny" } as never,
      { blockId: "r", kind: "removed", oldText: "gammel", newText: null } as never,
      { blockId: "borte", kind: "changed", oldText: "x", newText: "y" } as never,
    ]);
    expect(cmds.map((c) => c.type)).toEqual(["RemoveBlock", "RestoreBlock", "EditBlockText"]);
    expect(cmds[2]).toMatchObject({ blockId: "r", text: "gammel" });
  });
});
