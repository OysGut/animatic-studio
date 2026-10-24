/**
 * C-3 Premiere Pro-panel: all oppførsel uten DOM. UI-et (ui.ts) viser bare `state` og kaller metodene.
 * Bruker bare Connector SDK-et (packages/ptg-connector-sdk) mot /api/v1, og Host (premiere-host.ts) mot Premiere.
 *
 * Innlogging: PKCE via systemnettleseren, klient «ptg.premiere» (klientlisten i 0111), redirect til eget skjema
 * `ptg-premiere://`; brukeren limer inn adressen. Enhetsflyt (kode) er reserveveien. Ingen hemmeligheter.
 *
 * Flyt: åpne sekvenspakken (FCP XML med markører, laget i appen) → klipp i Premiere → «Send tilbake» leser den
 * aktive sekvensen, kobler klipp til paneler bare på ID (markør eller bildefilnavn) og sender rekkefølge og
 * varighet som forslag. Appen viser forslagene side om side; ingenting tas i bruk automatisk.
 */
import { ConnectorError, PtgConnector } from "../../../packages/ptg-connector-sdk/src/index";
import { cutFromClips, premiereReturnManifest, PREMIERE_ADAPTER, PREMIERE_CLIENT_ID } from "../../../src/core/connectors/premiere-sequence";
import type { Host, UxpFolder } from "./host";
import { importSequenceXml, readActiveSequence } from "./premiere-host";
import { secureTokenStore } from "../../photoshop/src/token-store";
import { pickLang, tr, type Lang, type StringKey } from "./strings";

export const CLIENT_ID = PREMIERE_CLIENT_ID;
export const REDIRECT_URI = "ptg-premiere://oauth/callback";
export const SCOPES = "project:read manifest:read panels:read transfers:write";
export const DEFAULT_BASE_URL = "https://pentoglass.com";
const LINKS = "sequences.json";

/** Koblingen mellom en importert sekvens og produksjonen den kom fra. Ingen hemmeligheter. */
export interface SequenceLink { readonly projectId: string; readonly productionId: string; readonly sequenceName: string; readonly fps: { num: number; den: number }; readonly importedAt: string }
export interface PluginState {
  signedIn: boolean; busy: boolean;
  projectId: string | null; projectName: string | null; panelCount: number;
  awaitingPaste: boolean; deviceCode: { code: string; uri: string } | null;
  lastImport: SequenceLink | null;
  message: { kind: "info" | "error"; text: string } | null;
}

export class PremierePlugin {
  readonly sdk: PtgConnector;
  readonly lang: Lang;
  state: PluginState = { signedIn: false, busy: false, projectId: null, projectName: null, panelCount: 0, awaitingPaste: false, deviceCode: null, lastImport: null, message: null };
  private pending: { verifier: string; state: string } | null = null;
  private links: Record<string, SequenceLink> = {};
  private deviceAbort = { aborted: false };
  private listeners = new Set<() => void>();

  constructor(private readonly host: Host, readonly baseUrl = DEFAULT_BASE_URL, sdk?: PtgConnector) {
    this.lang = pickLang(host.language);
    this.sdk = sdk ?? new PtgConnector({ baseUrl, clientId: CLIENT_ID, fetch: host.fetch, random: host.random, tokens: secureTokenStore(host.uxp.storage.secureStorage) });
  }
  t(key: StringKey, vars?: Record<string, string | number>) { return tr(this.lang, key, vars); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private set(p: Partial<PluginState>) { this.state = { ...this.state, ...p }; for (const l of this.listeners) l(); }
  private say(kind: "info" | "error", key: StringKey, vars?: Record<string, string | number>) { this.set({ message: { kind, text: this.t(key, vars) } }); }

  private async fail(e: unknown) {
    if (e instanceof ConnectorError && e.status === 401) {
      await this.sdk.logout().catch(() => undefined);
      this.set({ signedIn: false, projectId: null, projectName: null, panelCount: 0 });
      this.say("error", "revoked");
      return;
    }
    this.say("error", "error", { code: e instanceof ConnectorError ? e.code : "plugin_error" });
  }
  private async run(fn: () => Promise<void>) {
    this.set({ busy: true, message: null });
    try { await fn(); } catch (e) { await this.fail(e); } finally { this.set({ busy: false }); }
  }

  async start() {
    this.links = await this.loadLinks();
    await this.run(async () => { try { await this.sdk.session(); } catch (e) { if (e instanceof ConnectorError && e.code === "not_signed_in") return; throw e; } await this.loadProject(); });
  }

  // ---------- Innlogging ----------
  async beginSignIn() {
    const b = this.sdk.beginAuthorization(REDIRECT_URI, SCOPES);
    this.pending = { verifier: b.verifier, state: b.state };
    await this.host.uxp.shell.openExternal(b.url, this.t("signIn"));
    this.set({ awaitingPaste: true });
    this.say("info", "pasteHint");
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
      await this.sdk.deviceLogin(SCOPES, d => { this.set({ deviceCode: { code: d.userCode, uri: d.verificationUri } }); void this.host.uxp.shell.openExternal(d.verificationUriComplete, this.t("signIn")); }, this.deviceAbort);
      this.set({ deviceCode: null });
      await this.loadProject();
    });
  }
  async signOut() {
    this.deviceAbort.aborted = true;
    await this.sdk.logout();
    this.set({ signedIn: false, projectId: null, projectName: null, panelCount: 0, awaitingPaste: false, deviceCode: null, message: null });
  }

  async loadProject() {
    const s = await this.sdk.session();
    const [projects, panels] = await Promise.all([this.sdk.projects(), this.sdk.panels(s.projectId).catch(() => ({ panels: [] }))]);
    this.set({ signedIn: true, projectId: s.projectId, projectName: projects.projects[0]?.name ?? null, panelCount: panels.panels.length });
  }

  // ---------- Åpne sekvenspakken ----------
  /** Brukeren velger den utpakkede mappen. manifest.json kontrolleres før Premiere importerer sequence.xml. */
  async importPackage(folder?: UxpFolder | null) {
    await this.run(async () => {
      const dir = folder ?? await this.host.uxp.storage.localFileSystem.getFolder();
      if (!dir) return;
      let meta: Record<string, any>;
      try { meta = JSON.parse(String(await (await dir.getEntry("manifest.json")).read({ format: this.host.uxp.storage.formats.utf8 }))); } catch { this.say("error", "badPackage"); return; }
      const premiere = meta?.["premiere"];
      if (meta?.["adapter"]?.["id"] !== PREMIERE_ADAPTER.id || !premiere || typeof premiere["productionId"] !== "string") { this.say("error", "badPackage"); return; }
      if (meta["projectId"] !== this.state.projectId) { this.say("error", "wrongProject"); return; }
      const xml = await dir.getEntry(String(premiere["sequence"] ?? "sequence.xml"));
      const text = String(await xml.read({ format: this.host.uxp.storage.formats.utf8 }));
      const name = /<sequence\b[^>]*>\s*<name>([\s\S]*?)<\/name>/.exec(text)?.[1] ?? "Pen to Glass";
      if (!(await importSequenceXml(this.host, xml.nativePath))) throw new ConnectorError(500, "import_failed");
      const link: SequenceLink = { projectId: meta["projectId"], productionId: premiere["productionId"], sequenceName: decodeXml(name), fps: meta["frameRate"], importedAt: new Date().toISOString() };
      this.links = { ...this.links, [link.sequenceName]: link };
      await this.saveLinks();
      this.set({ lastImport: link });
      this.say("info", "imported", { count: Number(premiere["panels"] ?? 0) });
    });
  }

  // ---------- Send tilbake ----------
  async sendBack() {
    await this.run(async () => {
      const link = this.state.lastImport;
      const fps = link?.fps ?? { num: 25, den: 1 };
      const seq = await readActiveSequence(this.host, fps);
      const l = seq ? this.links[seq.name] ?? (link && link.sequenceName === seq.name ? link : null) : null;
      if (!seq || !l || l.projectId !== this.state.projectId) { this.say("error", "noSequence"); return; }
      const cut = cutFromClips(seq.clips.map(c => ({ ...c })));
      if (!cut.items.length) { this.say("error", "noPanels"); return; }
      const manifest = premiereReturnManifest({ projectId: l.projectId, productionId: l.productionId, fps: l.fps, sequenceName: seq.name, nowIso: new Date().toISOString(), hostVersion: this.host.hostVersion }, cut);
      const r = await this.sdk.sendPremiereReturn(l.projectId, manifest);
      this.say("info", "sent", { proposals: r.proposals, conflicts: r.conflicts });
    });
  }

  private async loadLinks(): Promise<Record<string, SequenceLink>> {
    try {
      const f = await (await this.host.uxp.storage.localFileSystem.getDataFolder()).getEntry(LINKS);
      const v = JSON.parse(String(await f.read({ format: this.host.uxp.storage.formats.utf8 })));
      return v && typeof v === "object" ? v : {};
    } catch { return {}; }
  }
  private async saveLinks() {
    const keys = Object.keys(this.links).sort((a, b) => this.links[a]!.importedAt.localeCompare(this.links[b]!.importedAt));
    while (keys.length > 200) delete this.links[keys.shift()!];
    const f = await (await this.host.uxp.storage.localFileSystem.getDataFolder()).createFile(LINKS, { overwrite: true });
    await f.write(JSON.stringify(this.links), { format: this.host.uxp.storage.formats.utf8 });
  }
}
const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
