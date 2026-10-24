/**
 * C-7 Illustrator-panel: all oppførsel uten DOM og uten CEP. Kjenner bare SDK-et, den delte SVG-modellen
 * (src/core/connectors/illustrator-svg.ts) og to smale vertsgrensesnitt (Host for filer, IllustratorHost for
 * dokumentet). Ved overgang til UXP byttes bare vertslaget; denne filen beholdes.
 *
 * Innlogging: PKCE via systemnettleseren (klient «ptg.illustrator», redirect `ptg-illustrator://`) eller kode.
 *
 * Ut: en ressursversjon (PNG/JPEG) blir SVG med artboard i nøyaktig pikselstørrelse, et låst-for-referanse
 *     kildelag og et tomt tegnelag, pluss manifest v1; panel- og ressurspakker fra C-1 («Send til … SVG»)
 *     åpnes med lagene sine. Koblingen skrives i SVG-metadata og i dokumentets XMP. Der det går, lagres .ai.
 * Tilbake: koblingen leses fra XMP (aldri filnavnet). Artboardet eksporteres som PNG med alfa i ressursens
 *     størrelse og lastes opp som ny kandidatversjon med den utsendte versjonen som grunnlag. SVG/.ai kan ikke
 *     lagres som versjon i prosjektmodellen i dag (ASSET_MIME_TYPES), se C7_REPORT.md. Ingenting tas i bruk.
 */
import { ConnectorError, PtgConnector, type AssetInfo, type VersionInfo } from "../../../packages/ptg-connector-sdk/src/index";
import {
  ILLUSTRATOR_ADAPTER, ILLUSTRATOR_CLIENT_ID, buildIllustratorSvg, illustratorUploadTarget, imagePixelSize, parseIllustratorLink,
  readIllustratorSvg, type IllustratorDoc, type IllustratorLink,
} from "../../../src/core/connectors/illustrator-svg";
import { sha256Hex } from "../../../src/core/connectors/sha256";
import { validateManifest, type ConnectorManifest } from "../../../src/core/connectors/manifest";
import { toBase64 } from "../../audition/src/cep-host";
import { fileTokenStore } from "../../audition/src/token-store";
import type { Host, IllustratorHost } from "./host";
import { pickLang, tr, type Lang, type StringKey } from "./strings";

export const CLIENT_ID = ILLUSTRATOR_CLIENT_ID;
export const REDIRECT_URI = "ptg-illustrator://oauth/callback";
export const SCOPES = "project:read manifest:read assets:read panels:read transfers:write conflicts:read";
export const DEFAULT_BASE_URL = "https://pentoglass.com";
export const TOKEN_FILE = "illustrator-session.json";
export const DEFAULT_DPI = 72;

export interface PluginState {
  signedIn: boolean; busy: boolean;
  projectId: string | null; projectName: string | null;
  assets: AssetInfo[]; selectedAssetId: string | null; versions: VersionInfo[];
  awaitingPaste: boolean; deviceCode: { code: string; uri: string } | null;
  opened: { link: IllustratorLink; width: number; height: number; layers: number; folder: string } | null;
  conflict: { id: string; revision: number } | null;
  message: { kind: "info" | "error"; text: string } | null;
}

const safe = (s: string) => s.normalize("NFC").replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "artwork";
const countLayers = (doc: IllustratorDoc) => doc.layers.length;

export class IllustratorPlugin {
  readonly sdk: PtgConnector;
  readonly lang: Lang;
  state: PluginState = { signedIn: false, busy: false, projectId: null, projectName: null, assets: [], selectedAssetId: null, versions: [], awaitingPaste: false, deviceCode: null, opened: null, conflict: null, message: null };
  private pending: { verifier: string; state: string } | null = null;
  private deviceAbort = { aborted: false };
  private listeners = new Set<() => void>();

  constructor(private readonly host: Host, private readonly ai: IllustratorHost, readonly baseUrl = DEFAULT_BASE_URL, sdk?: PtgConnector) {
    this.lang = pickLang(host.language);
    this.sdk = sdk ?? new PtgConnector({ baseUrl, clientId: CLIENT_ID, fetch: host.fetch, random: host.random, tokens: fileTokenStore(host, TOKEN_FILE) });
  }
  t(key: StringKey, vars?: Record<string, string | number>) { return tr(this.lang, key, vars); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private set(p: Partial<PluginState>) { this.state = { ...this.state, ...p }; for (const l of this.listeners) l(); }
  private say(kind: "info" | "error", key: StringKey, vars?: Record<string, string | number>) { this.set({ message: { kind, text: this.t(key, vars) } }); }

  private async fail(e: unknown) {
    if (e instanceof ConnectorError && e.status === 401) {
      await this.sdk.logout().catch(() => undefined);
      this.set({ signedIn: false, projectId: null, projectName: null, assets: [], versions: [], conflict: null });
      this.say("error", "revoked");
      return;
    }
    this.say("error", "error", { code: e instanceof ConnectorError ? e.code : e instanceof Error ? e.message : "plugin_error" });
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
      await this.sdk.deviceLogin(SCOPES, d => { this.set({ deviceCode: { code: d.userCode, uri: d.verificationUri } }); this.host.openUrl(d.verificationUriComplete); }, this.deviceAbort);
      this.set({ deviceCode: null });
      await this.loadProject();
    });
  }
  async signOut() {
    this.deviceAbort.aborted = true;
    await this.sdk.logout();
    this.set({ signedIn: false, projectId: null, projectName: null, assets: [], versions: [], opened: null, awaitingPaste: false, deviceCode: null, conflict: null, message: null });
  }
  async loadProject() {
    const s = await this.sdk.session();
    const [projects, assets] = await Promise.all([this.sdk.projects(), this.sdk.assets(s.projectId)]);
    this.set({ signedIn: true, projectId: s.projectId, projectName: projects.projects[0]?.name ?? null, assets: assets.assets });
  }
  async selectAsset(assetId: string) {
    await this.run(async () => {
      const v = await this.sdk.versions(this.state.projectId!, assetId);
      this.set({ selectedAssetId: assetId, versions: v.versions });
    });
  }

  // ---------- Ut ----------
  private manifestFor(link: IllustratorLink, file: { path: string; sha256: string; byteSize: number }, width: number, height: number, dpi: number): ConnectorManifest {
    const items: ConnectorManifest["items"][number][] = [{ kind: "project", id: link.projectId }];
    if (link.assetId) items.push({ kind: "asset", id: link.assetId, revision: link.revision, base: { entity: "asset_version", id: link.versionId ?? link.assetId, revision: link.revision }, files: [{ ...file, mimeType: "image/svg+xml", width, height, dpi }], variantId: link.variantId });
    if (link.panelId) items.push({ kind: "panel", id: link.panelId, revision: link.revision, base: { entity: "panel", id: link.panelId, revision: link.revision } });
    const m: ConnectorManifest = { manifestVersion: 1, createdAt: new Date().toISOString(), projectId: link.projectId, frameRate: { num: 25, den: 1 }, sampleRate: 48000, sourceApp: { name: "Adobe Illustrator", version: "cep" }, adapter: { ...ILLUSTRATOR_ADAPTER, illustratorLink: link.manifestId }, items };
    const v = validateManifest(m);
    if (!v.ok) throw new ConnectorError(500, "invalid_manifest");
    return m;
  }
  /** Skriver SVG + manifest, åpner i Illustrator, skriver XMP-koblingen og lagrer .ai der det går. */
  private async place(doc: IllustratorDoc, folder: string, base: string) {
    const svg = buildIllustratorSvg(doc);
    const bytes = new TextEncoder().encode(svg);
    const svgPath = `${folder}/${base}.svg`;
    await this.host.makeDir(folder);
    await this.host.writeFile(svgPath, svg);
    await this.host.writeFile(`${folder}/manifest.json`, JSON.stringify(this.manifestFor(doc.link!, { path: `${base}.svg`, sha256: sha256Hex(bytes), byteSize: bytes.length }, doc.width, doc.height, doc.dpi), null, 2));
    if (!(await this.ai.openSvg(svgPath, doc.dpi))) { this.say("error", "openFailed"); return; }
    await this.ai.writeLink(JSON.stringify(doc.link));
    await this.ai.saveAi(`${folder}/${base}.ai`);
    this.set({ opened: { link: doc.link!, width: doc.width, height: doc.height, layers: countLayers(doc), folder }, conflict: null });
    this.say("info", "opened", { count: countLayers(doc), width: doc.width, height: doc.height });
  }

  async openVersion(versionId: string, folderArg?: string | null) {
    await this.run(async () => {
      const pid = this.state.projectId!, assetId = this.state.selectedAssetId!;
      const asset = this.state.assets.find(a => a.id === assetId)!;
      const version = this.state.versions.find(v => v.id === versionId)!;
      const dl = await this.sdk.download(pid, assetId, versionId);
      const size = imagePixelSize(dl.bytes);
      if (!size) { this.say("error", "unsupportedImage"); return; }
      const link: IllustratorLink = { projectId: pid, manifestId: sha256Hex(`${pid}|${assetId}|${versionId}`).slice(0, 32), assetId, variantId: version.variantId, versionId, panelId: null, revision: asset.revision };
      const href = `data:${size.mimeType};base64,${toBase64(dl.bytes)}`;
      const doc: IllustratorDoc = { width: size.width, height: size.height, dpi: DEFAULT_DPI, link, layers: [
        { id: `version-${versionId}`, name: `${asset.name} v${version.number}`, visible: true, opacity: 1, image: { href, x: 0, y: 0, width: size.width, height: size.height } },
        { id: "drawing", name: "Pen to Glass", visible: true, opacity: 1, children: [] },
      ] };
      const folder = folderArg ?? `${this.host.userDataDir}/work/${link.manifestId}`;
      await this.place(doc, folder, `${safe(asset.name)}_v${version.number}`);
    });
  }

  /** C-1-pakke (utpakket mappe med manifest.json og SVG), for ressurs eller storyboardpanel. */
  async openPackage(folderArg?: string | null) {
    await this.run(async () => {
      const folder = folderArg ?? await this.host.pickFolder(this.t("chooseFolder"));
      if (!folder) return;
      let manifest: ConnectorManifest, svgText: string;
      try {
        const v = validateManifest(JSON.parse(new TextDecoder().decode(await this.host.readFile(`${folder}/manifest.json`))));
        if (!v.ok) throw new Error("manifest");
        manifest = v.manifest;
        const file = manifest.items.flatMap(i => i.files ?? []).find(f => /\.svg$/i.test(f.path));
        if (!file || /[\\/]|\.\./.test(file.path)) throw new Error("svg");
        const bytes = await this.host.readFile(`${folder}/${file.path}`);
        if (sha256Hex(bytes) !== file.sha256) throw new Error("sha");
        svgText = new TextDecoder().decode(bytes);
      } catch { this.say("error", "badPackage"); return; }
      if (manifest.projectId !== this.state.projectId) { this.say("error", "wrongProject"); return; }
      const target = manifest.items.find(i => i.kind === "asset" || i.kind === "panel")!;
      let link: IllustratorLink;
      if (target.kind === "asset") {
        const baseVersion = target.base?.entity === "asset_version" ? target.base.id : null;
        const versions = (await this.sdk.versions(manifest.projectId, target.id)).versions;
        const v = versions.find(x => x.id === baseVersion) ?? versions[0];
        link = { projectId: manifest.projectId, manifestId: sha256Hex(svgText).slice(0, 32), assetId: target.id, variantId: v?.variantId ?? null, versionId: v?.id ?? null, panelId: null, revision: target.revision ?? 0 };
      } else link = { projectId: manifest.projectId, manifestId: sha256Hex(svgText).slice(0, 32), assetId: null, variantId: null, versionId: null, panelId: target.id, revision: target.revision ?? 0 };
      const read = readIllustratorSvg(svgText);
      await this.place({ ...read, link }, folder, safe(target.name ?? target.id));
    });
  }

  // ---------- Tilbake ----------
  async sendBack() {
    await this.run(async () => {
      const raw = await this.ai.readLink();
      const link = raw ? parseIllustratorLink(`<ptg:link>${raw.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</ptg:link>`) : null;
      const info = await this.ai.docInfo();
      if (!link || !info) { this.say("error", "noDoc"); return; }
      if (link.projectId !== this.state.projectId) { this.say("error", "wrongProject"); return; }
      const target = illustratorUploadTarget(link);
      // C-7: panelretur går nå gjennom C-0-mottaket (skjult kandidat i panelet), ikke bare retursiden.
      const panelTarget = !target && link.panelId ? { panelId: link.panelId, panelRevision: link.revision } : null;
      if (!target && !panelTarget) { this.say("info", "panelOnly"); return; }
      const width = this.state.opened?.link.manifestId === link.manifestId ? this.state.opened.width : info.width;
      const height = this.state.opened?.link.manifestId === link.manifestId ? this.state.opened.height : info.height;
      const out = `${this.host.userDataDir}/work/${link.manifestId}/return.png`;
      await this.host.makeDir(`${this.host.userDataDir}/work/${link.manifestId}`);
      if (!(await this.ai.exportPng(out, width, height))) { this.say("error", "exportFailed"); return; }
      const bytes = await this.host.readFile(out);
      const size = imagePixelSize(bytes);
      if (!size || size.mimeType !== "image/png") { this.say("error", "exportFailed"); return; }
      const key = PtgConnector.idempotencyKey(PtgConnector.checksum(bytes), target ?? { variantId: panelTarget!.panelId, baseVersionId: null });
      const r = await this.sdk.upload(link.projectId, { name: "illustrator.png", bytes }, target ?? panelTarget!, key);
      let conflict: PluginState["conflict"] = null;
      if (r.conflictId) {
        const c = (await this.sdk.conflicts(link.projectId)).conflicts.find(x => x.id === r.conflictId);
        conflict = { id: r.conflictId, revision: c?.revision ?? 1 };
      }
      this.set({ conflict, message: { kind: "info", text: conflict ? this.t("conflict") : panelTarget ? this.t("sentPanel", { width: size.width, height: size.height }) : this.t("sentFlat", { width: size.width, height: size.height }) } });
    });
  }
  async resolve(choice: "keep_both" | "choose_current" | "choose_incoming") {
    const c = this.state.conflict, pid = this.state.projectId;
    if (!c || !pid) return;
    if (choice === "choose_incoming") { this.host.openUrl(new URL("/konto#c0-conflicts", this.baseUrl).toString()); return; }
    await this.run(async () => {
      await this.sdk.resolveConflict(pid, c.id, choice, c.revision);
      this.set({ conflict: null });
      this.say("info", "resolved");
    });
  }
}
