// @vitest-environment node
/** B-105a: avledede filer følger med når en ressurs lagres til det globale biblioteket (fromPrefix = eget prosjekt). */
import { describe, expect, it } from "vitest";
import { copyDerivedFiles } from "@/adapters/global/global-library.functions";

const P = "11111111-1111-4111-8111-111111111111";
function fakeClient() {
  const copies: [string, string][] = [];
  const client = { storage: { from: () => ({ copy: async (f: string, t: string) => { copies.push([f, t]); return { error: null }; } }) } };
  return { client: client as never, copies };
}

describe("lagring til globalt bibliotek", () => {
  it("kopierer proxy og miniatyr fra eget prosjekt til global sti", async () => {
    const { client, copies } = fakeClient();
    const out = await copyDerivedFiles(
      client,
      { proxy: { path: `${P}/p.webp`, sha256: "a" }, thumbnail: { path: `${P}/t.webp`, sha256: "b" } } as never,
      (d) => `global/w/${d.sha256}.webp`,
      `${P}/`,
    );
    expect(copies).toEqual([[`${P}/p.webp`, "global/w/a.webp"], [`${P}/t.webp`, "global/w/b.webp"]]);
    expect(out?.proxy?.path).toBe("global/w/a.webp");
    expect(out?.thumbnail?.path).toBe("global/w/b.webp");
  });
  it("hopper over stier fra andre prosjekter og med ..", async () => {
    const { client, copies } = fakeClient();
    const out = await copyDerivedFiles(
      client,
      { proxy: { path: "22222222-2222-4222-8222-222222222222/p.webp", sha256: "a" }, thumbnail: { path: `${P}/../x.webp`, sha256: "b" } } as never,
      (d) => `global/w/${d.sha256}.webp`,
      `${P}/`,
    );
    expect(copies).toEqual([]);
    expect(out).toBeUndefined();
  });
});
