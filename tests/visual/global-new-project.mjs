/** GP4 nytt prosjekt med skriveassistent, A1–A5. Mocket backend; ingen AI-kall.
 * ENV_FILE=… node tests/visual/global-new-project.mjs <baseUrl> <fixture.json> [out]
 */
import { setup } from "./global-harness.mjs";

let sessionCreated = 0;
const h = setup({
  rpc(name) {
    if (name === "create_project") return h.fx.project.id;
    return undefined;
  },
  serverFn(name) {
    if (/createStorySession/.test(name)) {
      sessionCreated++;
      return { ok: true, session: { id: "00000000-0000-4000-8000-0000000e0001" } };
    }
    if (/getStorySession/.test(name)) return { ok: true, session: { id: "00000000-0000-4000-8000-0000000e0001", turns: [], costUsd: 0 } };
    return undefined;
  },
});

await h.run("a1-a4", "/", async (page) => {
  await page.getByRole("button", { name: /Nytt prosjekt/ }).click();
  h.check(await page.getByTestId("new-project-assistant").isVisible(), "A1 «Utvikle nytt prosjekt med skriveassistent» vises");
  await page.locator("#new-project").fill("Nisseprosjekt");
  await page.getByTestId("new-project-idea").fill("En nisse mister lua si på Dovre");
  await page.getByTestId("new-project-assistant").click();
  await page.waitForURL(/\/storylab\?intervju=ny/, { timeout: 10000 });
  h.check(h.log.rpcs.some((r) => r.name === "create_project" && r.body?.p_name === "Nisseprosjekt"), "A2 prosjektet opprettes");
  h.check(/\/storylab/.test(page.url()), "A2 Story Lab åpnes");
  const box = page.getByTestId("storylab-interview").locator("textarea").first();
  await box.waitFor({ timeout: 10000 });
  h.check(sessionCreated === 1, "A3 intervjuøkten startes i Story Lab (SL7), ikke en egen assistent");
  h.check((await box.inputValue()).includes("mister lua"), "A4 idéen står i intervjuets tekstfelt");
  h.check(!h.log.serverFns.some((f) => /generateText|storyInterview|interviewTurn/.test(f.name)), "A4 ingen AI-kall før brukeren sender");
});

await h.run("a5-plain", "/", async (page) => {
  await page.getByRole("button", { name: /Nytt prosjekt/ }).click();
  await page.locator("#new-project").fill("Vanlig");
  await page.getByTestId("new-project-create").click();
  await page.waitForURL((u) => /\/prosjekt\//.test(u.pathname) && !/storylab/.test(u.pathname), { timeout: 10000 });
  h.check(sessionCreated === 1, "A5 vanlig opprettelse starter ikke intervjuet");
});

await h.run("english", "/", async (page) => {
  await page.getByRole("button", { name: /New project/ }).click();
  h.check(/writing assistant/.test(await page.getByTestId("new-project-assistant").innerText()), "engelsk tekst");
}, { lang: "en" });

await h.done();
