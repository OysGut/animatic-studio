/**
 * B-099: QR-kode for opptak med mobil i sceneeditorens opptaksvindu. Ingen ekte tjenester: Supabase og
 * serverfunksjonene er mocket (mts-harness), mikrofonen er Chromiums falske mikrofon.
 *  - QR-koden vises i opptaksvinduet, med «Mobilen er tilkoblet» og opptak som venter;
 *  - et simulert mobilopptak blir ny versjon på riktig replikk og aktiveres ikke automatisk;
 *  - lyd som ikke er replikk: økten gjelder scenen og avspillingshodet da vinduet ble åpnet;
 *  - «Rå lyd» er på som standard;
 *  - PC-mikrofonen feiler: tydelig melding og QR-koden fremhevet;
 *  - mobilsiden for scenen har «Ta opp lyd» ved siden av bilde og video.
 * Kjør: ENV_FILE=.env node tests/visual/scene-mobile-audio.mjs [base] [fixture]   (UI_LANG=en for engelsk)
 */
import { harness } from "./mts-harness.mjs";
import { uiLang } from "./ui-lang.mjs";

const h = harness("/tmp/browser/scene-mobile-audio");
const LANG = uiLang("nb");
const clip = h.rows.audio_clips.find((c) => c.kind === "dialogue" && c.block_id && !c.removed);
if (!clip) throw new Error("Mangler replikk med lydklipp i fixturen");
const OCC = clip.occurrence_id;
const SESSION = "00000000-0000-7000-8000-00000000b991";
const TOKEN = "B".repeat(43);
const NOW = () => new Date().toISOString();
const lineCtx = { type: "line", occurrenceId: OCC, blockId: clip.block_id, clipId: clip.id };
const imp = (id, status, extra = {}) => ({
  id, project_id: h.fx.project.id, session_id: SESSION, client_file_id: id,
  path: `${h.fx.project.id}/source/mobile/${SESSION}/${id}.webm`, kind: "audio", mime_type: "audio/webm",
  byte_size: 96044, file_name: "take-01.webm", contributor_name: "", status, error: null, context: lineCtx,
  asset_id: null, asset_version_id: null, take_id: null, claimed_by: null, claimed_at: null, dismissed: false,
  created_at: NOW(), confirmed_at: status === "done" ? NOW() : null, ...extra,
});
h.rows.upload_sessions = [{
  id: SESSION, project_id: h.fx.project.id, kind: "personal", parent_id: null, created_by: "00000000-0000-7000-8000-a11ce0000001",
  creator_name: "Mars", context: lineCtx, label: "Scene", media_kinds: ["audio"],
  expires_at: new Date(Date.now() + 7200_000).toISOString(), revoked_at: null, max_files: 1000, max_bytes: 1e10,
  files_count: 2, bytes_total: 2000, last_seen_at: NOW(), created_at: NOW(),
}];
h.rows.mobile_imports = [];
const sessions = [];
let mobileKinds = ["audio"];
h.hooks.serverFn = (name, d) => {
  if (/createUploadSession/.test(name)) {
    sessions.push(d.context);
    return { ok: true, message: "", sessionId: SESSION, token: TOKEN, expiresAt: new Date(Date.now() + 7200_000).toISOString() };
  }
  if (/mobileSession/.test(name))
    return { ok: true, message: "", kind: "personal", label: "Scene 1", from: "Mars", mediaKinds: mobileKinds, expiresAt: new Date(Date.now() + 7200_000).toISOString(), remainingFiles: 990, script: null };
  return undefined;
};
h.hooks.rest = (table) => {
  if (table === "upload_sessions") return h.rows.upload_sessions.map((s) => ({ ...s, last_seen_at: NOW() }));
  if (table === "rpc/claim_mobile_import") return true;
  return undefined;
};
const T = (nb, en) => (LANG === "en" ? en : nb);

async function openDialog(page) {
  await page.getByTestId("scene-record-audio").first().click();
  const dlg = page.getByTestId("record-audio-dialog");
  await dlg.waitFor();
  await page.waitForTimeout(800);
  return dlg;
}

await h.scenario(`b099-qr-${LANG}`, OCC, LANG, async (page) => {
  const dlg = await openDialog(page);
  await dlg.getByTestId("record-line-select").selectOption(clip.block_id);
  await page.waitForTimeout(1200);
  const panel = dlg.getByTestId("record-mobile");
  h.check(await panel.getByTestId("mobile-qr").isVisible(), "QR-koden vises i opptaksvinduet");
  h.check(await dlg.getByRole("button", { name: T("Ta opp", "Record") }).first().isVisible(), "PC-opptaket står ved siden av");
  const ctx = sessions.at(-1);
  h.check(ctx?.type === "line" && ctx.blockId === clip.block_id && ctx.clipId === clip.id, `økten gjelder den valgte replikken (${sessions.length} ${JSON.stringify(sessions.map(s=>s.type))} ${await dlg.getByTestId("record-line-select").inputValue()})`);
  await page.waitForTimeout(5500);
  h.check((await panel.getByTestId("record-mobile-connected").innerText()).includes(T("Mobilen er tilkoblet", "The phone is connected")), "«Mobilen er tilkoblet» vises");
  h.check(await dlg.getByTestId("record-raw-audio").isChecked(), "«Rå lyd» er på som standard");
  await page.screenshot({ path: `${h.out}/qr-${LANG}.png` });
});

await h.scenario(`b099-mobilopptak-${LANG}`, OCC, LANG, async (page) => {
  // Mobilen har sendt ett opptak og har ett som venter
  h.rows.mobile_imports = [imp("00000000-0000-7000-8000-00000000b9a1", "done"), imp("00000000-0000-7000-8000-00000000b9a2", "pending")];
  try {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("scene-stage").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  const cmds = h.state.commands;
  const version = cmds.find((c) => c.type === "AddDialogueVersion");
  h.check(cmds.some((c) => c.type === "AddAssetVersion"), "mobilopptaket blir en ny lydversjon");
  h.check(version?.clipId === clip.id, "på riktig replikk");
  h.check(version?.activate === false, "aktiveres ikke automatisk");
  h.check(!cmds.some((c) => /SetActiveDialogueVersion|UpdateAudioClips|SetAssetVersionsRemoved/.test(c.type)), "ingen tidligere versjon overskrives");
  const dlg = await openDialog(page);
  await dlg.getByTestId("record-line-select").selectOption(clip.block_id);
  await page.waitForTimeout(5500);
  h.check((await dlg.getByTestId("record-mobile-pending").innerText().catch(() => "")).includes("1"), "antall opptak som venter vises");
  } finally {
    h.rows.mobile_imports = [];
  }
});

await h.scenario(`b099-lyd-${LANG}`, OCC, LANG, async (page) => {
  const dlg = await openDialog(page);
  await dlg.locator("select").first().selectOption("sfx");
  await page.waitForTimeout(1200);
  const ctx = sessions.at(-1);
  h.check(ctx?.type === "scene_sound" && ctx.occurrenceId === OCC && ctx.kind === "sfx" && Number.isInteger(ctx.atMs), "lyd som ikke er replikk: økten gjelder scenen og avspillingshodet");
  h.check((await dlg.getByTestId("record-mobile").innerText()).length > 0, "QR-koden vises også for lyd");
});

await h.scenario(`b099-pc-feil-${LANG}`, OCC, LANG, async (page) => {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("Requested device not found"), { name: "NotFoundError" }));
  });
  const dlg = await openDialog(page);
  await dlg.getByRole("button", { name: T("Ta opp", "Record") }).first().click();
  await page.waitForTimeout(800);
  h.check(await dlg.getByTestId("record-mic-failed").isVisible(), "PC-feil viser en tydelig melding med mobil som alternativ");
  h.check((await dlg.getByTestId("record-mobile").getAttribute("data-highlight")) === "true", "QR-koden er fremhevet");
  await page.screenshot({ path: `${h.out}/pc-feil-${LANG}.png` });
});

await h.scenario(`b099-mobilside-${LANG}`, OCC, LANG, async (page) => {
  mobileKinds = ["image", "video", "audio"];
  await page.goto(`${h.base}/m/${TOKEN}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const btn = page.getByTestId("mobile-record-audio");
  h.check(await btn.isVisible(), "mobilsiden for scenen har «Ta opp lyd»");
  h.check(await page.getByTestId("mobile-take-photos").isVisible(), "ved siden av bilde og video");
  await btn.click();
  await page.waitForTimeout(500);
  h.check(await page.getByTestId("mobile-rec-start").isVisible(), "opptakskontrollene vises");
  h.check(await page.getByTestId("mobile-raw-audio").isChecked(), "«Rå lyd» på mobilen er på som standard");
  mobileKinds = ["audio"];
});

await h.finish();
