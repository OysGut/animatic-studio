// @vitest-environment node
/** Bildebufferen i lerretet har en LRU-grense og kaster aldri bilder som er i bruk (KI-42). */
import { describe, expect, it, vi } from "vitest";
import { ImageCache, decodedBytes, type LoadingImage } from "@/engine/compositor/canvas";

class FakeImage implements LoadingImage {
  crossOrigin: string | null = null;
  decoding: "async" | "sync" | "auto" = "auto";
  onload: LoadingImage["onload"] = null;
  onerror: LoadingImage["onerror"] = null;
  src = "";
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly bitmap = false,
  ) {}
  get close() {
    return this.bitmap ? () => void (this.closed = true) : undefined;
  }
  load() {
    this.onload?.call(globalThis as never, new Event("load"));
  }
}

function setup(limits: { maxImages?: number; maxBytes?: number }, size = 10, bitmap = false) {
  const made: FakeImage[] = [];
  const onLoad = vi.fn();
  const cache = new ImageCache(onLoad, {
    ...limits,
    createImage: () => {
      const i = new FakeImage(size, size, bitmap);
      made.push(i);
      return i;
    },
  });
  /** Ber om bildene og lar dem lastes ferdig. */
  const show = (...paths: string[]) => {
    const before = made.length;
    cache.ensure(Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])));
    for (const i of made.slice(before)) i.load();
  };
  return { cache, made, onLoad, show };
}

describe("ImageCache (KI-42)", () => {
  it("kaster de minst nylig brukte bildene over grensen og frigjør dem", () => {
    const { cache, made, show } = setup({ maxImages: 3 });
    show("a");
    show("b");
    show("c");
    show("a"); // a er nylig brukt igjen
    show("d");
    expect([...cache.images.keys()].sort()).toEqual(["a", "c", "d"]);
    expect(made[1]!.src).toBe(""); // b er frigjort
    expect(cache.size.images).toBe(3);
  });

  it("kaster aldri bilder som det siste kallet ba om, selv over grensen", () => {
    const { cache, show } = setup({ maxImages: 2 });
    show("a", "b", "c", "d");
    expect(cache.images.size).toBe(4);
    show("e");
    expect([...cache.images.keys()]).toEqual(["d", "e"]);
  });

  it("begrenser anslått minne og lukker ImageBitmap", () => {
    const one = decodedBytes({ width: 100, height: 100 });
    const { cache, made, show } = setup({ maxBytes: one * 2 + 1 }, 100, true);
    show("a");
    show("b");
    show("c");
    expect(cache.size.bytes).toBeLessThanOrEqual(one * 2 + 1);
    expect([...cache.images.keys()]).toEqual(["b", "c"]);
    expect(made[0]!.closed).toBe(true);
  });

  it("et kastet bilde lastes på nytt når det trengs igjen", () => {
    const { cache, made, show } = setup({ maxImages: 1 });
    show("a");
    show("b");
    expect(cache.images.has("a")).toBe(false);
    show("a");
    expect(cache.images.has("a")).toBe(true);
    expect(made).toHaveLength(3);
  });

  it("delt buffer: en visning kan ikke kaste bilder en annen visning fortsatt tegner; lukket visning frigjør sine", () => {
    const made: FakeImage[] = [];
    const cache = new ImageCache(vi.fn(), {
      maxImages: 2,
      createImage: () => {
        const i = new FakeImage(10, 10);
        made.push(i);
        return i;
      },
    });
    const assembly = {};
    const compare = {};
    const show = (consumer: object, ...paths: string[]) => {
      const before = made.length;
      cache.ensure(Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])), consumer);
      for (const i of made.slice(before)) i.load();
    };
    show(assembly, "a", "b");
    // Sammenligningen ber om andre bilder: monteringens bilder er fortsatt i bruk og kastes ikke
    show(compare, "c", "d");
    expect([...cache.images.keys()].sort()).toEqual(["a", "b", "c", "d"]);
    show(compare, "e");
    expect([...cache.images.keys()].sort()).toEqual(["a", "b", "e"]);
    // Sammenligningen lukkes: bildet dens kan kastes, monteringens ikke
    cache.release(compare);
    show(assembly, "a", "b");
    expect([...cache.images.keys()].sort()).toEqual(["a", "b"]);
  });
});
