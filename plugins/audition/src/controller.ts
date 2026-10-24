/**
 * C-6 Audition-panel (CEP): all oppførsel uten DOM. UI-et (ui.ts) viser bare `state` og kaller metodene.
 * Bruker bare Connector SDK-et mot /api/v1 og Host (cep-host.ts) mot Audition.
 *
 * Innlogging: PKCE via systemnettleseren, klient «ptg.audition» (klientlisten i 0111), redirect til eget
 * skjema `ptg-audition://`; brukeren limer inn adressen. Enhetsflyt (kode) er reserveveien. Ingen hemmeligheter.
 *
 * Ut: lydplanen for en scene eller et panel → hver WAV lastes ned, får ID-er og markører i bext/iXML/cue uten
 * at lyden endres, og lagres sammen med en multitrack-økt (.sesx). Tilbake: brukeren velger redigerte WAV-filer;
 * ID-ene leses fra metadata (aldri fra filnavnet) og hver fil blir en ny kandidatversjon gjennom C-0-mottaket
 * med den utsendte versjonen som grunnlag. Ingenting tas i bruk automatisk.
 */
import { ConnectorError, PtgConnector } from "../../../packages/ptg-connector-sdk/src/index";
import {
  AUDITION_CLIENT_ID, AUDITION_MAX_CONVERT_SECONDS, auditionConvertedFileName, auditionConvertedMeta, auditionFileName,
  auditionSesx, auditionUploadTarget, convertibleAudioFrom, readAuditionReturn, tagAuditionWav, type AuditionPlan,
} from "../../../src/core/connectors/audition-session";
import { encodeBwf } from "../../../src/core/handoff/wav";
import type { Host } from "./host";
import { jsxArg } from "./cep-host";
import { fileTokenStore } from "./token-store";
import { pickLang, tr, type Lang, type StringKey } from "./strings";

export const CLIENT_ID = AUDITION_CLIENT_ID;
export const REDIRECT_URI = "ptg-audition://oauth/callback";
export const SCOPES = "project:read manifest:read assets:read panels:read transfers:write conflicts:read";
export const DEFAULT_BASE_URL = "https://pentoglass.com";
/** Takhøyde per sending tilbake, så ett klikk aldri laster opp ubegrenset. */
export const MAX_RETURN_FILES = 100;

export interface SceneChoice { readonly occurrenceId: string; readonly label: string; readonly panels: readonly { id: string; name: string }[] }
export interface ExportResult { readonly folder: string; readonly files: readonly string[]; readonly skipped: number; readonly manifestId: string; readonly truncated: boolean }
export interface ReturnRow { readonly name: string; readonly status: "candidate" | "conflict" | "rejected"; readonly reason?: StringKey; readonly conflictId?: string }
export interface PluginState {
  signedIn: boolean; busy: boolean;
  projectId: string | null; projectName: string | null;
  scenes: SceneChoice[]; occurrenceId: string | null; panelId: string | null;
  awaitingPaste: boolean; deviceCode: { code: string; uri: string } | null;
  lastExport: ExportResult | null; returns: ReturnRow[];
  conflict: { id: string; revision: number } | null;
  message: { kind: "info" | "error"; text: string } | null;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

export class AuditionPlugin {
  readonly sdk: PtgConnector;
  readonly lang: Lang;
  state: PluginState = { signedIn: false, busy: false, projectId: null, projectName: null, scenes: [], occurrenceId: null, panelId: null, awaitingPaste: false, deviceCode: null, lastExport: null, returns: [], conflict: null, message: null };
  private pending: { verifier: string; state: string } | null = null;
  private deviceAbort = { aborted: false };
  private listeners = new Set<() => void>();

  constructor(private readonly host: Host, readonly baseUrl = DEFAULT_BASE_URL, sdk?: PtgConnector) {
    this.lang = pickLang(host.language);
    this.sdk = sdk ?? new PtgConnector({ baseUrl, clientId: CLIENT_ID, fetch: host.fetch, random: host.random, tokens: fileTokenStore(host) });
  }
  t(key: StringKey, vars?: Record<string, string | number>) { return tr(this.lang, key, vars); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private set(p: Partial<PluginState>) { this.state = { ...this.state, ...p }; for (const l of this.listeners) l(); }
  private say(kind: "info" | "error", text: string) { this.set({ message: { kind, text } }); }

  private async fail(e: unknown) {
    if (e instanceof ConnectorError && e.status === 401) {
      await this.sdk.logout().catch(() => undefined);
      this.set({ signedIn: false, projectId: null, projectName: null, scenes: [], conflict: null });
      this.say("error", this.t("revoked"));
      return;
    }
    this.say("error", this.t("error", { code: e instanceof ConnectorError ? e.code : "plugin_error" }));
  }
  private async run(fn: () => Promise<void>) {
    this.set({ busy: true, message: null });
    try { await fn(); } catch (e) { await this.fail(e); } finally { this.set({ busy: false }); }
  }

  async start() {
    await this.run(async () => { try { await this.sdk.session(); } catch (e) { if (e instanceof ConnectorError && e.code === "not_signed_in") return; throw e; } await this.loadProject(); });
  }

  // ---------- Innlogging ----------
  async beginSignIn() {
    const b = this.sdk.beginAuthorization(REDIRECT_URI, SCOPES);
    this.pending = { verifier: b.verifier, state: b.state };
    this.host.openUrl(b.url);
    this.set({ awaitingPaste: true });
    this.say("info", this.t("pasteHint"));
  }
  async finishSignIn(pasted: string) {
    const p = this.pending;
    await this.run(async () => {
      if (!p) throw new ConnectorError(400, "no_pending_sign_in");
      const url = pasted.trim();
      if (!url.startsWith(REDIRECT_URI)) throw new ConnectorError(400, "wrong_address");
      await this.sdk.completeAuthorization(url, { ...p, redirectUri: REDIRECT_URI });
      this.pending = null;
      this.set({ awaitingPaste: false });
      await this.loadProject();
    });
  }
  async deviceSignIn() {
    this.deviceAbort = { aborted: false };
    await this.run(async () => {
      await this.sdk.deviceLogin(SCOPES, d => { this.set({ deviceCode: { code: d.userCode, uri: d.verificationUri } }); this.host.openUrl(d.verificationUriComplete); }, this.deviceAbort);
      this.set({ deviceCode: null });
      await this.loadProject();
    });
  }
  async signOut() {
    this.deviceAbort.aborted = true;
    await this.sdk.logout();
    this.set({ signedIn: false, projectId: null, projectName: null, scenes: [], occurrenceId: null, panelId: null, awaitingPaste: false, deviceCode: null, conflict: null, message: null });
  }

  async loadProject() {
    const s = await this.sdk.session();
    const [projects, manifest] = await Promise.all([this.sdk.projects(), this.sdk.manifest(s.projectId)]);
    const occ = manifest.items.filter(i => i.kind === "occurrence" && i["active"] !== false);
    const scenes: SceneChoice[] = occ.map((o, n) => ({
      occurrenceId: o.id, label: `${this.t("scene")} ${n + 1}`,
      panels: manifest.items.filter(i => i.kind === "panel" && i.parentId === o.id).map(i => ({ id: i.id, name: i.name ?? "" })),
    }));
    this.set({ signedIn: true, projectId: s.projectId, projectName: projects.projects[0]?.name ?? null, scenes, occurrenceId: this.state.occurrenceId ?? scenes[0]?.occurrenceId ?? null });
  }
  choose(occurrenceId: string | null, panelId: string | null = null) { this.set({ occurrenceId, panelId }); }

  // ---------- Lyd ut ----------
  async exportAudio(folderArg?: string | null) {
    await this.run(async () => {
      const pid = this.state.projectId, occ = this.state.occurrenceId;
      if (!pid || !occ) { this.say("error", this.t("noScene")); return; }
      const plan: AuditionPlan = await this.sdk.auditionPlan(pid, occ, this.state.panelId);
      const folder = folderArg ?? await this.host.pickFolder(this.t("chooseFolder"));
      if (!folder) return;
      const files: string[] = []; const keptClips: AuditionPlan["clips"][number][] = [];
      let skipped = 0; let converted = 0;
      for (const [i, clip] of plan.clips.entries()) {
        const wav = /wav|wave/i.test(clip.mimeType);
        const from = wav ? null : convertibleAudioFrom(clip.mimeType);
        if (!wav && (!from || !this.host.decodeAudio)) { skipped++; continue; }
        const dl = await this.sdk.download(pid, clip.assetId, clip.versionId);
        let tagged: Uint8Array; let name: string;
        try {
          if (from) {
            const decoded = await this.host.decodeAudio!(dl.bytes.slice(), clip.mimeType);
            if (!decoded || !Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0 || !decoded.channels.length
              || !decoded.channels[0]!.length
              || decoded.channels.some(ch => ch.length !== decoded.channels[0]!.length || ch.length / decoded.sampleRate > AUDITION_MAX_CONVERT_SECONDS)) {
              skipped++; continue;
            }
            tagged = encodeBwf(decoded.channels, decoded.sampleRate, auditionConvertedMeta(plan, clip, from, decoded.sampleRate));
            name = auditionConvertedFileName(clip, i, from);
          } else {
            tagged = tagAuditionWav(dl.bytes, plan, clip);
            name = auditionFileName(clip, i);
          }
        } catch { skipped++; continue; }
        await this.host.writeFile(`${folder}/${name}`, tagged);
        files.push(name);
        keptClips.push(clip);
        if (from) converted++;
      }
      const kept = { ...plan, clips: keptClips };
      const sesx = `${folder}/ptg_${plan.sceneLabel}_${plan.manifestId.slice(0, 8)}.sesx`;
      await this.host.writeFile(sesx, auditionSesx(kept, files));
      await this.host.writeFile(`${folder}/ptg-audition.json`, JSON.stringify({ manifestVersion: 1, adapter: { id: "adobe-audition-cep", version: "1" }, plan: kept, files }, null, 2));
      this.set({ lastExport: { folder, files, skipped, manifestId: plan.manifestId, truncated: plan.truncated } });
      const parts = [this.t("exported", { count: files.length })];
      if (skipped) parts.push(this.t("skipped", { count: skipped }));
      if (converted) parts.push(this.t("converted", { count: converted }));
      if (plan.truncated) parts.push(this.t("truncated"));
      if (files.length) parts.push(this.t((await this.host.evalScript(`ptgOpenSession(${jsxArg(sesx)})`)) === "ok" ? "sessionOpened" : "sessionFailed"));
      this.say(plan.truncated || skipped ? "error" : "info", parts.join(" "));
    });
  }

  // ---------- Send tilbake ----------
  async sendBack(pathsArg?: string[]) {
    await this.run(async () => {
      const pid = this.state.projectId;
      if (!pid) { this.say("error", this.t("revoked")); return; }
      const paths = (pathsArg ?? await this.host.pickFiles(this.t("chooseFiles"))).slice(0, MAX_RETURN_FILES);
      if (!paths.length) return;
      const rows: ReturnRow[] = [];
      let conflict: PluginState["conflict"] = null;
      for (const path of paths) {
        const name = baseName(path);
        const bytes = await this.host.readFile(path);
        const r = readAuditionReturn(bytes, pid);
        if (!r.ok) { rows.push({ name, status: "rejected", reason: ({ not_wav: "notWav", too_large: "tooLarge", no_ptg_id: "noId", wrong_project: "wrongProject" } as const)[r.reason] }); continue; }
        const target = auditionUploadTarget(r.ref);
        const key = PtgConnector.idempotencyKey(PtgConnector.checksum(bytes), target);
        const t = await this.sdk.upload(pid, { name: `${r.ref.role || "audio"}.wav`, bytes }, target, key);
        if (t.conflictId) {
          const c = (await this.sdk.conflicts(pid)).conflicts.find(x => x.id === t.conflictId);
          conflict = conflict ?? { id: t.conflictId, revision: c?.revision ?? 1 };
          rows.push({ name, status: "conflict", conflictId: t.conflictId });
        } else rows.push({ name, status: "candidate" });
      }
      const sent = rows.filter(r => r.status !== "rejected").length;
      const errors = rows.filter(r => r.status === "rejected").map(r => this.t(r.reason!, { name: r.name }));
      this.set({ returns: rows, conflict });
      const text = [sent ? this.t("sent", { count: sent }) : "", conflict ? this.t("conflict") : "", ...errors].filter(Boolean).join(" ");
      this.say(errors.length && !sent ? "error" : "info", text);
    });
  }

  async resolve(choice: "keep_both" | "choose_current" | "choose_incoming") {
    const c = this.state.conflict, pid = this.state.projectId;
    if (!c || !pid) return;
    if (choice === "choose_incoming") { this.host.openUrl(new URL("/konto#c0-conflicts", this.baseUrl).toString()); return; }
    await this.run(async () => {
      await this.sdk.resolveConflict(pid, c.id, choice, c.revision);
      this.set({ conflict: null });
      this.say("info", this.t("resolved"));
    });
  }
}
