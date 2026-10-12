/** KI-177 (DEC-0075): PNG-eksporten av plakaten stopper når dialogen lukkes. */
import { describe, expect, it } from "vitest";
import { posterPng } from "@/engine/export/poster-canvas";

describe("posterPng avbrytes", () => {
  it("et avbrutt signal gir AbortError før noe tegnes", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(posterPng([], 100, 100, 72, {}, undefined, ac.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
