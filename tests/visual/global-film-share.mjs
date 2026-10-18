/** GP5 QR-deling, Q1–Q8. Mocket backend og serverfunksjoner; ingen ekte opplasting.
 * Q1–Q5 bruker delingsdialogen fra eksporten (krever at nettleseren kan lage H.264/AAC; ellers kontrolleres
 * forklaringen). Q6–Q8 bruker den offentlige siden /se/$token.
 * ENV_FILE=… node tests/visual/global-film-share.mjs <baseUrl> <fixture.json> [out]
 */
import { setup } from "./global-harness.mjs";

const TOKEN = "a".repeat(64);
const SHARE = "00000000-0000-4000-8000-0000000f0001";
let shares = [];
let resolveOk = true;
const h = setup({
  tables(table) {
    if (table === "film_shares") return shares;
    return undefined;
  },
  rpc(name, body) {
    if (name === "record_export") return "00000000-0000-4000-8000-0000000f0e01";
    if (name === "create_film_share") {
      shares = [{ id: SHARE, export_record_id: "00000000-0000-4000-8000-0000000f0e01", title: "Film", status: "uploading", expires_at: null, share_days: body.p_share_days, byte_size: body.p_byte_size, created_at: new Date().toISOString() }];
      return { id: SHARE, storage_key: `${h.fx.project.id}/shares/${SHARE}/film.mp4` };
    }
    if (name === "film_share_token") return shares[0]?.status === "ready" ? TOKEN : null;
    if (name === "revoke_film_share") { shares = shares.map((s) => ({ ...s, status: "revoked" })); return null; }
    return undefined;
  },
  serverFn(name) {
    if (/activateFilmShare/.test(name)) {
      shares = shares.map((s) => ({ ...s, status: "ready", expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }));
      return { token: TOKEN };
    }
    if (/resolveFilmShare/.test(name))
      return resolveOk ? { ok: true, film: { title: "Jula på Dovre – animatic", width: 1920, height: 1080, durationMs: 4000, url: "data:video/mp4;base64," } } : { ok: false };
    return undefined;
  },
});

await h.run("q1-q5-share", "$P/montering", async (page) => {
  await page.getByRole("button", { name: /Eksporter|Export/ }).first().click();
  const exportBtn = page.getByRole("dialog").getByRole("button", { name: /^(Eksporter|Lag video|Export|Make video)/ }).last();
  await exportBtn.click();
  await page.getByTestId("film-share-open").waitFor({ timeout: 120000 });
  h.check(true, "Q1 «Del med QR-kode» vises når filmen er laget");
  await page.getByTestId("film-share-open").click();
  const dlg = page.getByTestId("film-share-dialog");
  await dlg.waitFor();
  if (await dlg.getByTestId("film-share-ineligible").count()) {
    h.check(/MP4|AAC|500/.test(await dlg.getByTestId("film-share-ineligible").innerText()), "Q1 nettleseren laget ikke H.264/AAC: forklaringen vises");
    return;
  }
  h.check(await dlg.getByTestId("film-share-days").inputValue() === "30", "Q2 standard er 30 dager");
  h.check(await dlg.locator("canvas, img").count() === 0, "Q5 ingen QR før filmen er klar");
  await dlg.getByTestId("film-share-create").click();
  await dlg.getByTestId("film-share-ready").waitFor({ timeout: 10000 });
  h.check(h.log.rpcs.some((r) => r.name === "create_film_share" && r.body.p_share_days === 30), "Q2 delingen gjelder en bestemt filmversjon med valgt varighet");
  h.check(h.log.serverFns.some((f) => /activateFilmShare/.test(f.name)), "Q3 serveren sjekker filen før lenken lages");
  h.check(await dlg.getByTestId("film-share-status").getAttribute("data-status") === "available", "Q5 status: tilgjengelig via QR");
  h.check(await dlg.getByTestId("film-share-copy").isVisible(), "Q4 kopier lenke");
  await dlg.getByTestId("film-share-revoke").click();
  await dlg.getByTestId("film-share-create").waitFor({ timeout: 5000 });
  h.check(h.log.rpcs.some((r) => r.name === "revoke_film_share"), "Q8 tilbakekalling");
  h.check(await dlg.locator('[data-share-status="revoked"]').count() === 1, "Q5 status: ikke lenger delt");
});

await h.run("q6-player", `/se/${TOKEN}`, async (page) => {
  await page.getByTestId("film-player").waitFor();
  const v = page.getByTestId("film-player-video");
  h.check(await v.getAttribute("playsinline") !== null && await v.getAttribute("controls") !== null, "Q6 mobilspiller med kontroller");
  const style = await v.getAttribute("style");
  h.check(/1920 \/ 1080/.test(style ?? ""), "Q6 riktig bildeformat");
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  h.check(/noindex/.test(robots ?? ""), "Q7 noindex");
  const scripts = await page.locator("script[src]").evaluateAll((els) => els.map((e) => e.src).filter((s) => !s.startsWith(location.origin)));
  h.check(scripts.length === 0, "Q7 ingen tredjepartsskript");
  const sent = h.log.serverFns.filter((f) => !/resolveFilmShare/.test(f.name));
  h.check(sent.length === 0, "Q7 siden henter ingen prosjektdata");
  h.check(!h.log.rpcs.some((r) => r.name !== "my_account"), "Q7 ingen databasekall fra siden");
}, { viewport: { width: 390, height: 844 }, signedIn: false });

resolveOk = false;
await h.run("q8-revoked", `/se/${TOKEN}`, async (page) => {
  await page.getByTestId("film-player-gone").waitFor();
  h.check(true, "Q8 tilbakekalt eller utløpt lenke viser at filmen ikke er delt");
}, { viewport: { width: 390, height: 844 }, signedIn: false });

await h.done();
