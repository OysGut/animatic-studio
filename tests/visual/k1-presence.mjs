/**
 * K-1: varsel når en annen redigerer samme scene, og valget etter en lagringskonflikt. Mockede tjenester
 * (ingen betalte kall). Den andre brukeren («Ada») simuleres med en falsk sanntidskanal (Phoenix vsn 2.0.0)
 * som melder at Ada står i samme scene og Bo i en annen. Første fargeendring avvises med revision_conflict.
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/k1-presence.mjs
 */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
const h = harness("/tmp/browser/k1-presence");
const lang = process.env.UI_LANG ?? "nb";
const occs = h.rows.scene_occurrences.filter((o) => o.active);
const occ = occs[0];
const other = occs[1];
if (!occ || !other) throw new Error("Missing fixture");
const ADA = "00000000-0000-7000-8000-0000000ada01";
const BO = "00000000-0000-7000-8000-0000000b0b01";

h.hooks.context = async (context) => {
  await context.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (!Array.isArray(m)) return;
      const [joinRef, ref, topic, event] = m;
      const reply = (response = {}) => ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "heartbeat" || event === "access_token") return reply();
      if (event === "phx_join") {
        reply({ postgres_changes: [] });
        if (String(topic).includes("presence-")) {
          setTimeout(() => ws.send(JSON.stringify([joinRef, null, topic, "presence_state", {
            [ADA]: { metas: [{ phx_ref: "a1", name: "Ada", occurrenceId: occ.id }] },
            [BO]: { metas: [{ phx_ref: "b1", name: "Bo", occurrenceId: other.id }] },
          }])), 200);
        }
        return;
      }
      if (event === "presence") return reply();
      if (event === "phx_leave") return reply();
    });
  });
};
let conflicts = 0;
h.hooks.serverFn = (name, d) => {
  if (/runCommand/.test(name) && d.command?.type === "SetOccurrenceColor" && conflicts === 0) {
    conflicts++;
    h.state.commands.push({ ...d.command, rejected: true });
    return { ok: false, code: "revision_conflict", message: "conflict" };
  }
  return undefined;
};
h.hooks.rest = (table) => {
  if (table === "rpc/scene_last_changes") return [{ scene_id: occ.scene_id, changed_at: "2026-10-22T10:15:00Z", actor_name: "Ada", logged: true }];
  return undefined;
};

await h.scenario(`k1-${lang}`, occ.id, lang, async (page) => {
  const badge = page.getByTestId("scene-presence-badge");
  h.check(await h.eventually(() => badge.isVisible(), 8000), `${lang}: merket vises når Ada står i samme scene`);
  const text = (await badge.innerText().catch(() => "")) ?? "";
  const expected = byLang(lang, "Ada redigerer også denne scenen", "Ada is also editing this scene");
  h.check(text.includes(expected), `${lang}: merket sier «${expected}» (${text})`);
  h.check(!text.includes("Bo"), `${lang}: Bo (annen scene) står ikke i merket`);
  await page.screenshot({ path: `${h.out}/${lang}-badge.png` });

  // Prikk i scenelisten ved begge scenene der andre står
  await page.getByTestId("scene-picker-trigger").click();
  const dots = page.locator('[role="option"] [data-testid="scene-presence-dot"]');
  await page.locator('[role="option"]').first().waitFor();
  h.check(await h.eventually(async () => (await dots.count()) === 2), `${lang}: prikk ved de to scenene der andre står`);
  const label = await dots.first().getAttribute("aria-label");
  h.check(!!label && label.includes(byLang(lang, "Andre i scenen nå", "Others in this scene now")), `${lang}: prikken har oversatt skjermlesertekst (${label})`);
  await page.screenshot({ path: `${h.out}/${lang}-picker.png` });
  await page.keyboard.press("Escape");

  // Konflikt: første fargeendring avvises; ingenting sendes på nytt før brukeren velger
  await page.getByTestId("scene-color-trigger").click();
  await page.getByTestId("scene-color-option-teal").click();
  const notice = page.getByTestId("scene-conflict");
  h.check(await h.eventually(() => notice.isVisible(), 5000), `${lang}: konfliktvarselet vises`);
  const by = await page.getByTestId("scene-conflict-by").innerText().catch(() => "");
  h.check(by.includes("Ada"), `${lang}: varselet viser hvem som sist endret (${by})`);
  const sentBefore = h.state.commands.filter((c) => c?.type === "SetOccurrenceColor").length;
  await page.waitForTimeout(800);
  h.check(h.state.commands.filter((c) => c?.type === "SetOccurrenceColor").length === sentBefore, `${lang}: ingenting sendes automatisk`);
  h.check((await page.getByTestId("scene-conflict-rebase").innerText()).includes(byLang(lang, "Legg min endring oppå", "Apply my change on top")), `${lang}: «Legg min endring oppå» er oversatt`);
  h.check((await page.getByTestId("scene-conflict-discard").innerText()).includes(byLang(lang, "Forkast min endring", "Discard my change")), `${lang}: «Forkast min endring» er oversatt`);
  await page.screenshot({ path: `${h.out}/${lang}-conflict.png` });

  await page.getByTestId("scene-conflict-rebase").click();
  h.check(await h.eventually(() => h.state.commands.some((c) => c?.type === "SetOccurrenceColor" && c.color === "teal" && !c.rejected)), `${lang}: «Legg min endring oppå» sender endringen på nytt`);
  h.check(await h.eventually(async () => (await notice.count()) === 0), `${lang}: varselet forsvinner etter valget`);

  // Ny konflikt, så forkast
  conflicts = 0;
  await page.getByTestId("scene-color-trigger").click();
  await page.getByTestId("scene-color-option-pink").click();
  h.check(await h.eventually(() => notice.isVisible(), 5000), `${lang}: ny konflikt vises`);
  await page.getByTestId("scene-conflict-discard").click();
  h.check(await h.eventually(async () => (await notice.count()) === 0), `${lang}: «Forkast min endring» lukker varselet`);
  await page.waitForTimeout(500);
  h.check(!h.state.commands.some((c) => c?.type === "SetOccurrenceColor" && c.color === "pink" && !c.rejected), `${lang}: den forkastede endringen sendes ikke`);
});
await h.finish();
