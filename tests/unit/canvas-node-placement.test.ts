// @vitest-environment node
import { expect, it } from "vitest";
import { nextCanvasPosition } from "@/app/storylab/canvas/node-placement";

it("offsets rapid additions 24 pixels right and down from the previous occupied position", () => {
  const first = { x: 100, y: 200 };
  const second = nextCanvasPosition(first, first, [first]);
  const third = nextCanvasPosition(first, second, [first, second]);
  expect(second).toEqual({ x: 124, y: 224 });
  expect(third).toEqual({ x: 148, y: 248 });
});
it("uses the center when it is free and skips all occupied positions", () => {
  expect(nextCanvasPosition({ x: 0, y: 0 }, { x: 100, y: 100 }, [])).toEqual({ x: 0, y: 0 });
  expect(nextCanvasPosition({ x: 0, y: 0 }, null, [{ x: 0, y: 0 }, { x: 24, y: 24 }])).toEqual({ x: 48, y: 48 });
});