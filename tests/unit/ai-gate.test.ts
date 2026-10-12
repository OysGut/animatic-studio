// @vitest-environment node
/** Kostnadsporten for egne nøkler (DEC-0069): nøkkelen fra prosjektets eiere, overordnet tak. */
import { describe, expect, it } from "vitest";
import {
  overAccountCap,
  overProjectBudget,
  projectKey,
  projectProviderIds,
} from "@/adapters/ai/ai-gate.server";
import { fakeDb } from "../helpers/fake-supabase";

const now = new Date().toISOString();
const db = fakeDb({
  project_members: [
    { project_id: "p", user_id: "eier", role: "owner", removed_at: null },
    { project_id: "p", user_id: "red", role: "editor", removed_at: null },
    { project_id: "p", user_id: "gammel", role: "owner", removed_at: "2026-01-01" },
  ],
  ai_provider_keys: [
    { id: "k1", user_id: "eier", provider: "runway", status: "ok" },
    { id: "k2", user_id: "red", provider: "openai", status: "ok" },
    { id: "k3", user_id: "gammel", provider: "google", status: "ok" },
    { id: "k4", user_id: "eier", provider: "fal", status: "failed" },
  ],
  ai_account_limits: [{ user_id: "eier", monthly_cap_usd: 10 }],
  generation_jobs: [
    {
      project_id: "p",
      key_owner: "eier",
      cost_usd: 6,
      status: "done",
      kind: "video",
      created_at: now,
    },
    {
      project_id: "p",
      key_owner: "eier",
      cost_usd: 3,
      status: "failed",
      kind: "video",
      created_at: now,
    },
    {
      project_id: "p",
      key_owner: null,
      cost_usd: null,
      status: "done",
      kind: "prompt",
      created_at: now,
    },
  ],
}) as never;

describe("kostnadsporten", () => {
  it("bare aktive eieres virkende nøkler brukes – aldri en redaktørs eller en fjernet eiers", async () => {
    expect((await projectKey(db, "p", "runway", "red"))?.id).toBe("k1");
    expect(await projectKey(db, "p", "openai", "red")).toBe(null);
    expect(await projectKey(db, "p", "google", "red")).toBe(null);
    expect(await projectKey(db, "p", "fal", "eier")).toBe(null);
    expect(await projectProviderIds(db, "p", "red")).toEqual(["runway"]);
  });

  it("overordnet tak: feilede jobber teller ikke; jobben som går over, stoppes", async () => {
    expect(await overAccountCap(db, "eier", 3, false)).toBe(null);
    expect(await overAccountCap(db, "eier", 5, false)).toMatch(/Kostnadstaket/);
    expect(await overAccountCap(db, "ingen-tak", 1000, false)).toBe(null);
  });

  it("prosjektbudsjettet teller ikke AI-skrevne beskrivelser", async () => {
    expect(await overProjectBudget(db, "p", 2, false)).toBe(null);
    expect(await overProjectBudget(db, "p", 1, false)).toMatch(/budsjett/);
    expect(await overProjectBudget(db, "p", null, false)).toBe(null);
  });
});
