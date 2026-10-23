// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Thumbnail } from "@/app/shared/Thumbnail";
import { planImageIngest } from "@/core/library/image-ingest";

describe("Thumbnail (plassholderretting del 2)", () => {
  it("viser hele bildet med contain, aldri cover eller strekking", () => {
    const { container } = render(<Thumbnail src="x.png" className="rounded" />);
    const img = container.querySelector("img")!;
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toMatch(/object-(cover|fill)/);
    expect(img.className).toContain("thumb-checker");
    expect(img.getAttribute("width")).toBeNull();
    expect(img.getAttribute("height")).toBeNull();
  });
  it("ingen miniatyr i src/app bruker object-cover (unntatt profilbilde)", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".tsx") && !p.endsWith("ShowcaseBox.tsx") && readFileSync(p, "utf8").includes("object-cover")) hits.push(p);
      }
    };
    walk("src/app");
    expect(hits).toEqual([]);
  });
});

describe("miniatyrgeneratoren bevarer proporsjonene", () => {
  const ctx = { frameWidth: 1920, frameHeight: 1080 };
  it("stående 1:2", () => {
    expect(planImageIngest({ width: 1000, height: 2000 }, ctx).thumbnail).toEqual({ width: 128, height: 256 });
  });
  it("liggende 2:1", () => {
    expect(planImageIngest({ width: 2000, height: 1000 }, ctx).thumbnail).toEqual({ width: 256, height: 128 });
  });
});
