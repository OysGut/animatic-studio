/**
 * C-2 Photoshop-plugin: all oppførsel uten DOM. UI-et (ui.ts) viser bare `state` og kaller metodene.
 * Bruker bare Connector SDK-et (packages/ptg-connector-sdk) mot /api/v1, og Host (host.ts) mot Photoshop.
 *
 * Innlogging: PKCE via systemnettleseren (`shell.openExternal`). UXP kan ikke lytte på en port eller ta imot
 * et eget URL-skjema, så redirect er pluginens registrerte skjema `ptg-photoshop://`, og brukeren limer inn
 * adressen godkjenningssiden viser. Enhetsflyt (kode) er reserveveien. Ingen hemmeligheter: offentlig klient.
 */
import { ConnectorError, PtgConnector, type AssetInfo, type PanelInfo, type VersionInfo } from "../../../packages/ptg-connector-sdk/src/index";
import type { ConnectorManifest } from "../../../packages/ptg-connector-sdk/src/index";
import type { Host, PsDocument } from "./host";
import { describe, openBytes, savePsdCopy, type DocInfo } from "./photoshop-doc";
import { linkFileName, linkKey, loadLinks, rememberLink, saveLinks, type DocLink } from "./links";
import { secureTokenStore } from "./token-store";
import { pickLang, tr, type Lang, type StringKey } from "./strings";

export const CLIENT_ID = "ptg.photoshop";
export const REDIRECT_URI = "ptg-photoshop://oauth/callback";
export const SCOPES = "project:read manifest:read assets:read panels:read transfers:write conflicts:read";
export const DEFAULT_BASE_URL = "https://pentoglass.com";

export interface ItemView { readonly id: string; readonly name: string; readonly notes: readonly string[] }
export interface PluginState {
  signedIn: boolean;
  busy: boolean;
  projectId: string | null; projectName: string | null;
  assets: AssetInfo[]; selectedAssetId: string | null; versions: VersionInfo[];
  scenes: ItemView[]; panels: (PanelInfo & { notes: readonly string[] })[];
  awaitingPaste: boolean; deviceCode: { code: string; uri: string } | null;
  link: DocLink | null; docInfo: DocInfo | null;
  conflict: { id: string; revision: number } | null;
  message: { kind: "info" | "error"; text: string } | null;
  progress: { done: number; total: number } | null;
}

export class PhotoshopPlugin {
  readonly sdk: PtgConnector;
  readonly lang: Lang;
  state: PluginState = { signedIn: false, busy: false, projectId: null, projectName: null, assets: [], selectedAssetId: null, versions: [], scenes: [], panels: [], awaitingPaste: false, deviceCode: null, link: null, docInfo: null, conflict: null, message: null, progress: null };
  private pending: { verifier: string; state: string } | null = null;
  private links: Record<string, DocLink> = {};
  private deviceAbort = { aborted: false };
  private listeners = new Set<() => void>();

  constructor(private readonly host: Host, readonly baseUrl = DEFAULT_BASE_URL, sdk?: PtgConnector) {
    this.lang = pickLang(host.language);
    this.sdk = sdk ?? new PtgConnector({ baseUrl, clientId: CLIENT_ID, fetch: host.fetch, random: host.random, tokens: secureTokenStore(host.uxp.storage.secureStorage) });
  }
  t(key: StringKey, vars?: Record<string, string | number>) { return tr(this.lang, key, vars); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private set(p: Partial<PluginState>) { this.state = { ...this.state, ...p }; for (const l of this.listeners) l(); }
  private info(key: StringKey) { this.set({ message: { kind: "info", text: this.t(key) } }); }

  /** Feil fra SDK-et: 401 betyr tilbaketrukket/utløpt tilgang, og pluginen glemmer tokens lokalt. */
  private async fail(e: unknown) {
    if (e instanceof ConnectorError && e.status === 401) {
      await this.sdk.logout().catch(() => undefined);
      this.set({ signedIn: false, projectId: null, projectName: null, assets: [], versions: [], scenes: [], panels: [], conflict: null, message: { kind: "error", text: this.t("revoked") } });
      return;
    }
    const code = e instanceof ConnectorError ? e.code : "plugin_error";
    this.set({ message: { kind: "error", text: this.t("error", { code }) } });
  }
  private async run(fn: () => Promise<void>) {
    this.set({ busy: true, message: null });
    try { await fn(); } catch (e) { await this.fail(e); } finally { this.set({ busy: false, progress: null }); }
  }

  async start() {
    this.links = await loadLinks(this.host.uxp);
    await this.run(async () => { try { await this.sdk.session(); } catch (e) { if (e instanceof ConnectorError && e.code === "not_signed_in") return; throw e; } await this.loadProject(); });
  }

  // ---------- Innlogging ----------
  async beginSignIn() {
    const b = this.sdk.beginAuthorization(REDIRECT_URI, SCOPES);
    this.pending = { verifier: b.verifier, state: b.state };
    await this.host.uxp.shell.openExternal(b.url, this.t("signIn"));
    this.set({ awaitingPaste: true, message: { kind: "info", text: this.t("pasteHint") } });
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
    this.set({ signedIn: false, projectId: null, projectName: null, assets: [], versions: [], scenes: [], panels: [], link: null, conflict: null, awaitingPaste: false, deviceCode: null, message: null });
  }

  // ---------- Prosjektvisning ----------
  async loadProject() {
    const s = await this.sdk.session();
    const [projects, assets, manifest, panels] = await Promise.all([
      this.sdk.projects(), this.sdk.assets(s.projectId), this.sdk.manifest(s.projectId),
      this.sdk.panels(s.projectId).catch(() => ({ panels: [] as PanelInfo[] })),
    ]);
    const notesOf = (m: ConnectorManifest) => new Map(m.items.map(i => [i.id, i.notes ?? []] as const));
    const notes = notesOf(manifest);
    this.set({
      signedIn: true, projectId: s.projectId, projectName: projects.projects[0]?.name ?? null,
      assets: assets.assets.filter(a => a.variants.length > 0),
      scenes: manifest.items.filter(i => i.kind === "scene").map(i => ({ id: i.id, name: i.name ?? i.id, notes: i.notes ?? [] })),
      panels: panels.panels.map(p => ({ ...p, notes: notes.get(p.id) ?? [] })),
    });
    this.refreshActiveDocument();
  }
  async selectAsset(assetId: string) {
    await this.run(async () => {
      const v = await this.sdk.versions(this.state.projectId!, assetId);
      this.set({ selectedAssetId: assetId, versions: v.versions.filter(x => /psd|png/.test(x.mimeType)).sort((a, b) => b.number - a.number) });
    });
  }
  /** Koblingen til dokumentet som er aktivt i Photoshop nå (eller null). */
  refreshActiveDocument() {
    const doc = this.host.ps.app.activeDocument;
    const link = doc ? this.links[linkKey(doc.name)] ?? null : null;
    this.set({ link: link && link.projectId === this.state.projectId ? link : null });
  }

  // ---------- Åpne ----------
  async openVersion(versionId: string) {
    await this.run(async () => {
      const asset = this.state.assets.find(a => a.id === this.state.selectedAssetId);
      const v = this.state.versions.find(x => x.id === versionId);
      if (!asset || !v) throw new ConnectorError(404, "version_not_found");
      const file = await this.sdk.download(this.state.projectId!, asset.id, v.id);
      const ext = file.mimeType.includes("photoshop") ? "psd" : "png";
      const fileName = linkFileName(asset.name, v.number, v.id, ext);
      const doc = await openBytes(this.host, fileName, file.bytes, this.t("open"));
      const link: DocLink = { projectId: this.state.projectId!, assetId: asset.id, variantId: v.variantId, baseVersionId: v.id, baseNumber: v.number, assetName: asset.name, fileName: doc.name || fileName, openedAt: new Date().toISOString() };
      this.links = rememberLink(this.links, link);
      await saveLinks(this.host.uxp, this.links);
      this.set({ link, docInfo: await describe(this.host, doc), conflict: null });
    });
  }

  // ---------- Send tilbake ----------
  async sendBack() {
    await this.run(async () => {
      const doc: PsDocument | null = this.host.ps.app.activeDocument;
      const link = doc ? this.links[linkKey(doc.name)] : undefined;
      if (!doc || !link) { this.info("noDoc"); return; }
      const docInfo = await describe(this.host, doc);
      const name = linkKey(link.fileName) + ".psd";
      const bytes = await savePsdCopy(this.host, doc, name, this.t("sendBack"));
      const target = { assetId: link.assetId, variantId: link.variantId, baseVersionId: link.baseVersionId };
      const key = PtgConnector.idempotencyKey(PtgConnector.checksum(bytes), target);
      const r = await this.sdk.upload(link.projectId, { name, bytes }, target, key, (done, total) => this.set({ progress: { done, total } }));
      let conflict: PluginState["conflict"] = null;
      if (r.conflictId) {
        const list = await this.sdk.conflicts(link.projectId);
        const c = list.conflicts.find(x => x.id === r.conflictId);
        conflict = { id: r.conflictId, revision: c?.revision ?? 1 };
      }
      this.set({ docInfo, conflict, message: conflict ? { kind: "info", text: this.t("conflict") } : { kind: "info", text: this.t("sent") } });
    });
  }
  /** De tre valgene fra C-0. «Bruk min» åpner appen: bare brukerens egen godkjenning bytter aktiv versjon. */
  async resolve(choice: "keep_both" | "choose_current" | "choose_incoming") {
    const c = this.state.conflict, pid = this.state.link?.projectId ?? this.state.projectId;
    if (!c || !pid) return;
    if (choice === "choose_incoming") { await this.host.uxp.shell.openExternal(new URL("/konto#c0-conflicts", this.baseUrl).toString(), this.t("useMine")); return; }
    await this.run(async () => {
      await this.sdk.resolveConflict(pid, c.id, choice, c.revision);
      this.set({ conflict: null, message: { kind: "info", text: this.t("resolved") } });
    });
  }
}
