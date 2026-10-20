import { harness } from "./mts-harness.mjs";
const h = harness("/tmp/browser/hyd");
const clip = h.rows.audio_clips.find((c) => c.kind === "dialogue" && c.block_id && !c.removed);
await h.scenario("x", clip.occurrence_id, "nb", async (page) => {
  const errs = []; page.on("pageerror", async (e) => errs.push(String(e).slice(0, 60)));
  page.on("console", (m) => { if (/TIME/.test(m.text())) console.log(m.text()); });
  await page.addInitScript(() => { addEventListener("error", () => console.log("TIME err " + performance.now() + " lang@" + window.__langAt)); const o = console.error; console.error = (...a) => { if (String(a[0]).includes("ydrat")) console.log("TIME cerr " + performance.now() + " lang@" + window.__langAt); o(...a); }; });
  await page.evaluate(() => localStorage.setItem("animatic:lang", "en"));
  await page.goto(h.base + "/personvern", { waitUntil: "networkidle" }); await page.waitForTimeout(900);
  console.log("errors:", errs.length, errs[0] ?? "");
});
process.exit(0);
