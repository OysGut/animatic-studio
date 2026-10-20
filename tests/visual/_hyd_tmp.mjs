import { harness } from "./mts-harness.mjs";
const h = harness("/tmp/browser/hyd");
const clip = h.rows.audio_clips.find((c) => c.kind === "dialogue" && c.block_id && !c.removed);
await h.scenario("x", clip.occurrence_id, "nb", async (page) => {
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await page.evaluate(() => localStorage.setItem("animatic:lang", "en"));
  await page.goto(h.base + "/personvern", { waitUntil: "networkidle" }); await page.waitForTimeout(900);
  console.log("errors:", errs.length, errs[0] ?? "");
});
process.exit(0);
