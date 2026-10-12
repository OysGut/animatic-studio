// @vitest-environment node
/**
 * AI-bilder som ble laget, men ikke lagt inn i biblioteket (siden ble lukket underveis) kan hentes inn fra
 * AI-jobbene (REQ-0291, REQ-0504; natt til 12.10.2026).
 */
import { describe, expect, it } from "vitest";
import {
  CLAIM_GRACE_MS,
  unclaimedImageJobs,
  versionIdFromResultPath,
  type GenerationJob,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const maja = Object.values(s0.assets).find((a) => a.name === "Maja")!;
const variant = Object.values(s0.assetVariants).find((v) => v.assetId === maja.id)!;
const now = new Date("2026-10-12T03:00:00Z");
const earlier = new Date(now.getTime() - CLAIM_GRACE_MS - 1000).toISOString();

const job = (over: Partial<GenerationJob>): GenerationJob => ({
  id: tid(),
  kind: "image",
  provider: "lovable",
  model: "openai/gpt-image-2",
  prompt: "p",
  assetId: maja.id,
  status: "done",
  error: null,
  resultPath: null,
  resultText: null,
  createdAt: earlier,
  finishedAt: earlier,
  createdBy: "u",
  estimatedCost: null,
  occurrenceId: null,
  segmentId: null,
  ...over,
});

describe("AI-bilder som ikke ble lagt inn", () => {
  const vid = tid<"asset_version">();
  const path = `${s0.project.id}/${maja.id}/${vid}/ai-2026-10-12.png`;

  it("finner ferdige bildejobber uten versjon – og bare dem", () => {
    const lost = job({ resultPath: path });
    const jobs = [
      lost,
      job({ resultPath: null }),
      job({ status: "failed", resultPath: path }),
      job({ kind: "prompt", resultPath: null }),
      job({ assetId: null, resultPath: path }),
      // Akkurat ferdig: siden som bestilte det, legger det inn selv
      job({ resultPath: path, finishedAt: now.toISOString() }),
    ];
    expect(unclaimedImageJobs(s0, jobs, now).map((j) => j.id)).toEqual([lost.id]);
  });

  it("forsvinner når bildet er lagt inn, og versjons-ID-en fra serveren brukes", () => {
    expect(versionIdFromResultPath(path)).toBe(vid);
    expect(versionIdFromResultPath("p/a/ikke-en-id/x.png")).toBe(null);
    const s = mustApply(s0, {
      type: "AddAssetVersion",
      versionId: vid,
      variantId: variant.id,
      media: {
        path,
        mimeType: "image/png",
        width: 1024,
        height: 1536,
        byteSize: 1000,
        sha256: "a".repeat(64),
      },
      note: "Generert med AI, hentet inn fra AI-jobbene",
    });
    expect(unclaimedImageJobs(s, [job({ resultPath: path })], now)).toEqual([]);
  });

  it("ikke for arkiverte ressurser", () => {
    const s = {
      ...s0,
      assets: { ...s0.assets, [maja.id]: { ...maja, archived: true } },
    };
    expect(unclaimedImageJobs(s, [job({ resultPath: path })], now)).toEqual([]);
  });
});
