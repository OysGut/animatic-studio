/**
 * DEC-0091 / KI-238: flere bilder fra mobilen til en ressurs uten varianter ga én ny «Fra mobil»-variant per
 * bilde. Nå behandles de etter tur med fersk tilstand, og en «Fra mobil»-variant (begge språk) gjenbrukes.
 */
import { describe, expect, it, vi } from "vitest";
import { applyCommand, newId, variantsOf, type Command, type ProjectState } from "@/core";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

vi.mock("@/adapters/browser/mobile-import", () => ({
  claimMobileImport: vi.fn(() => Promise.resolve(true)),
  linkMobileImport: vi.fn(() => Promise.resolve(null)),
  fetchMobileImports: vi.fn(),
  fetchUploadSessions: vi.fn(),
  subscribeMobileImports: vi.fn(),
}));
vi.mock("@/app/library/asset-images", () => ({
  mediaFromStoredFile: vi.fn((path: string) =>
    Promise.resolve({
      path,
      mimeType: "image/jpeg",
      byteSize: 1000,
      width: 10,
      height: 10,
      sha256: "0".repeat(64),
    }),
  ),
}));

const { importImage, pickMobileVariant } = await import("@/app/mobile/use-mobile-imports");

/** En ressurs uten varianter (som Rolf da bildene kom). */
function withBareAsset(): { s: ProjectState; assetId: string } {
  const assetId = newId<"asset">();
  const r = applyCommand(
    fixture.state,
    envelope({
      type: "CreateAssets",
      assets: [
        {
          assetId: assetId as never,
          fields: {
            kind: "character",
            name: "Rolf",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    } as unknown as Command),
  );
  if (!r.ok) throw new Error(r.error.message);
  return { s: r.state, assetId };
}

function fakeCmds(start: ProjectState) {
  let s = start;
  const sent: Command[] = [];
  return {
    sent,
    current: () => s,
    runAndWait: (c: Command) => {
      sent.push(c);
      const r = applyCommand(s, envelope(c));
      if (!r.ok) return Promise.resolve({ error: r.error.message, commandId: null });
      s = r.state;
      return Promise.resolve({ error: null, commandId: null });
    },
  };
}

const row = (id: string, assetId: string) =>
  ({
    id,
    project_id: fixture.project.id,
    session_id: "s",
    path: `${fixture.project.id}/source/mobile/s/${id}.jpg`,
    kind: "image",
    status: "done",
    contributor_name: "",
    context: { type: "asset", assetId },
    asset_id: assetId,
    asset_version_id: null,
    dismissed: false,
  }) as never;

describe("bilder fra mobilen", () => {
  it("fem bilder etter tur gir én variant «Fra mobil» med fem versjoner", async () => {
    const { s, assetId } = withBareAsset();
    expect(variantsOf(s, assetId)).toHaveLength(0);
    const cmds = fakeCmds(s);
    let chain: Promise<unknown> = Promise.resolve();
    for (let i = 0; i < 5; i++) {
      const r = row(`00000000-0000-7000-8000-0000000c000${i}`, assetId);
      chain = chain.then(async () => {
        expect(await importImage(cmds.current(), cmds as never, r)).toBeNull();
      });
    }
    await chain;
    const vs = variantsOf(cmds.current(), assetId);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.name).toMatch(/^(Fra mobil|From mobile)$/);
    expect(
      Object.values(cmds.current().assetVersions).filter((v) => v.variantId === vs[0]!.id),
    ).toHaveLength(5);
    expect(cmds.sent.filter((c) => c.type === "CreateAssetVariant")).toHaveLength(1);
    expect(cmds.sent.filter((c) => c.type === "AddAssetVersion")).toHaveLength(5);
  });

  it("en «From mobile»-variant (laget på engelsk) gjenbrukes", () => {
    const { s, assetId } = withBareAsset();
    const a = newId<"asset_variant">();
    const b = newId<"asset_variant">();
    let st = s;
    for (const [id, name] of [
      [a, "Animatic"],
      [b, "From mobile"],
    ] as const) {
      const r = applyCommand(
        st,
        envelope({
          type: "CreateAssetVariant",
          variantId: id as never,
          assetId: assetId as never,
          fields: { name, style: "animatic", appearance: "" },
        } as Command),
      );
      if (!r.ok) throw new Error(r.error.message);
      st = r.state;
    }
    expect(pickMobileVariant(st, assetId)).toBe(b);
    expect(pickMobileVariant(st, assetId, a)).toBe(a);
  });
});
