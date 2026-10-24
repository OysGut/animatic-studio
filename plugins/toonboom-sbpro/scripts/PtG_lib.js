/*
 * From Pen to Glass – skriptpakke for Toon Boom Storyboard Pro 22+ (C-5).
 * Felles bibliotek for menyknappene PtG_Login, PtG_Import, PtG_Export og PtG_Logout.
 *
 * Skrevet i ES5 (QtScript/JavaScript i Storyboard Pro): ingen let/const, piler eller malstrenger.
 * Alle kall mot Storyboard Pro går gjennom PtG.sbpro (én liste over API-navn), og alt mot filer,
 * nettverk og dialoger gjennom PtG.host, så pakken kan testes uten Storyboard Pro.
 *
 * Ingen hemmeligheter i skriptene. Innloggingen er enhetsflyten fra C-0 (Storyboard Pro har ingen
 * nettleser): skriptet viser en kode, brukeren godkjenner i Pen to Glass, og tilgangen lagres i en fil
 * i brukerens hjemmemappe (~/.pentoglass/sbpro-session.json), aldri i skriptmappen.
 *
 * Retur blir kandidater i Pen to Glass. Ingenting tas i bruk automatisk.
 */
var PtG = (function () {
  "use strict";
  var P = {};
  P.VERSION = "0.1.0";
  P.CLIENT_ID = "ptg.toonboom-sbpro";
  P.ADAPTER = { id: "toonboom-sbpro", version: "1" };
  P.SCOPES = "project:read manifest:read panels:read transfers:write conflicts:read";
  P.CAPTIONS = { dialogue: "Dialogue", action: "Action Notes", notes: "Notes" };
  P.FIELDS = ["dialogue", "action", "notes"];
  P.REF_CAPTION = "PtG Ref";
  P.CAMERA_CAPTION = "Camera";
  P.MAX_PANELS = 5000;
  P.DEFAULT_BASE_URL = "https://pentoglass.com";

  // ---------- Tekster (nb/en; engelsk er reserve) ----------
  var STR = {
    en: {
      title: "From Pen to Glass",
      loginCode: "Open {url} in a browser, sign in and enter this code:\n\n{code}\n\nClick OK when you have approved.",
      loginOk: "Connected to the project.",
      loginFail: "Could not connect: {reason}",
      notLoggedIn: "Connect first (PtG Login).",
      pickPackage: "Choose the folder with manifest.json from Pen to Glass",
      pickFolder: "Choose a folder for the export",
      importDone: "Imported {panels} panels in {scenes} scenes.",
      importFail: "Import stopped: {reason}",
      exportDone: "Sent {panels} panels. {candidates} candidates ({conflicts} conflicts) wait in Pen to Glass. Nothing is applied automatically.",
      conformLossless: "The new order and timing can be applied in one step in Pen to Glass.",
      conformSuggest: "The new order and timing are only a suggestion ({reasons}).",
      exportFail: "Export stopped: {reason}",
      logoutDone: "Signed out. Access was revoked."
    },
    nb: {
      title: "From Pen to Glass",
      loginCode: "Åpne {url} i en nettleser, logg inn og skriv inn denne koden:\n\n{code}\n\nTrykk OK når du har godkjent.",
      loginOk: "Koblet til prosjektet.",
      loginFail: "Kunne ikke koble til: {reason}",
      notLoggedIn: "Koble til først (PtG Login).",
      pickPackage: "Velg mappen med manifest.json fra Pen to Glass",
      pickFolder: "Velg en mappe for eksporten",
      importDone: "Importerte {panels} paneler i {scenes} scener.",
      importFail: "Importen stoppet: {reason}",
      exportDone: "Sendte {panels} paneler. {candidates} kandidater ({conflicts} konflikter) venter i Pen to Glass. Ingenting tas i bruk automatisk.",
      conformLossless: "Ny rekkefølge og timing kan brukes i ett steg i Pen to Glass.",
      conformSuggest: "Ny rekkefølge og timing er bare et forslag ({reasons}).",
      exportFail: "Eksporten stoppet: {reason}",
      logoutDone: "Logget ut. Tilgangen er trukket tilbake."
    }
  };
  P.STRINGS = STR;
  P.t = function (host, key, vars) {
    var lang = host && host.language ? String(host.language()).slice(0, 2) : "en";
    var table = STR[lang === "no" || lang === "nn" ? "nb" : lang] || STR.en;
    var s = table[key] || STR.en[key] || key;
    for (var k in (vars || {})) if (vars.hasOwnProperty(k)) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  };

  // ---------- SHA-256 (ren ES5 over en bytetabell) ----------
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  P.sha256 = function (bytes) {
    var n = bytes.length, words = [], i, j;
    var total = ((n + 9 + 63) >> 6) << 4;
    for (i = 0; i < total; i++) words[i] = 0;
    for (i = 0; i < n; i++) words[i >> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
    words[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
    words[total - 1] = (n * 8) >>> 0;
    words[total - 2] = Math.floor(n / 0x20000000);
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], W = [];
    function r(x, c) { return (x >>> c) | (x << (32 - c)); }
    for (i = 0; i < total; i += 16) {
      for (j = 0; j < 64; j++) {
        if (j < 16) W[j] = words[i + j] | 0;
        else W[j] = (r(W[j - 2], 17) ^ r(W[j - 2], 19) ^ (W[j - 2] >>> 10)) + W[j - 7] + (r(W[j - 15], 7) ^ r(W[j - 15], 18) ^ (W[j - 15] >>> 3)) + W[j - 16] | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var t1 = h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + W[j] | 0;
        var t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c)) | 0;
        h = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
      }
      H[0] = H[0] + a | 0; H[1] = H[1] + b | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0;
      H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
    }
    var out = "";
    for (i = 0; i < 8; i++) out += ("00000000" + (H[i] >>> 0).toString(16)).slice(-8);
    return out;
  };

  // ---------- Storyboard Pro-API (ett sted; navnene står i sjekklisten i rapporten) ----------
  P.sbpro = function (g) {
    return {
      captionNames: function () { return g.CaptionManager.getCaptionNames(); },
      addCaption: function (name) { return g.CaptionManager.addCaption(name); },
      setCaption: function (panelId, name, text) { return g.CaptionManager.setPanelCaptionText(panelId, name, text); },
      getCaption: function (panelId, name) { return g.CaptionManager.getPanelCaptionText(panelId, name) || ""; },
      createScene: function (name) { return g.StoryboardManager.createScene(name); },
      appendPanel: function (sceneId) { return g.StoryboardManager.appendPanel(sceneId); },
      panelCount: function () { return g.StoryboardManager.numberOfPanelsInProject(); },
      panelAt: function (i) { return g.StoryboardManager.panelInProject(i); },
      sceneOfPanel: function (panelId) { return g.StoryboardManager.sceneIdOfPanel(panelId); },
      setDuration: function (panelId, frames) { return g.StoryboardManager.setPanelDuration(panelId, frames); },
      getDuration: function (panelId) { return g.StoryboardManager.getPanelDuration(panelId); },
      projectFps: function () { return g.StoryboardManager.frameRate(); },
      importImage: function (panelId, path) { return g.ImportManager.importImageToPanel(panelId, path, "PtG"); },
      exportPanelImage: function (panelId, path) { return g.ExportManager.exportPanelToPNG(panelId, path); },
      addSoundTrack: function (name) { return g.SoundTrackManager.addSoundTrack(name); },
      importSound: function (trackId, path, startFrame) { return g.SoundTrackManager.importSound(trackId, path, startFrame); },
      selectedPanels: function () { return g.SelectionManager.getPanelSelection() || []; }
    };
  };

  // ---------- Referanse i den skjulte captionen ----------
  P.formatRef = function (r) {
    return "ptg:" + r.panelId + "@" + r.revision + "|occ:" + r.occurrenceId + "|proj:" + r.projectId + "|prod:" + r.productionId;
  };
  P.parseRef = function (text) {
    var m = /^ptg:([A-Za-z0-9-]{1,64})@([0-9]{1,9})\|occ:([A-Za-z0-9-]{1,64})\|proj:([A-Za-z0-9-]{1,64})\|prod:([A-Za-z0-9-]{1,64})$/.exec(String(text || "").replace(/^\s+|\s+$/g, ""));
    if (!m) return null;
    return { panelId: m[1], revision: parseInt(m[2], 10), occurrenceId: m[3], projectId: m[4], productionId: m[5] };
  };

  // ---------- Importplan (ren) ----------
  P.importPlan = function (manifest) {
    if (!manifest || manifest.manifestVersion !== 1) throw new Error("manifest-version");
    if (!manifest.adapter || manifest.adapter.id !== P.ADAPTER.id) throw new Error("adapter");
    var top = manifest.sbpro || {};
    if (!top.productionId) throw new Error("production");
    var scenes = [], byOcc = {}, panels = [], i;
    for (i = 0; i < manifest.items.length; i++) {
      var it = manifest.items[i];
      if (it.kind === "panel" && it.sbpro) panels.push(it);
    }
    if (panels.length > P.MAX_PANELS) throw new Error("too-many");
    panels.sort(function (a, b) { return a.sbpro.order - b.sbpro.order; });
    for (i = 0; i < panels.length; i++) {
      var p = panels[i], occ = p.parentId;
      if (!byOcc[occ]) { byOcc[occ] = { occurrenceId: occ, name: p.sbpro.sceneNumber || String(scenes.length + 1), panels: [] }; scenes.push(byOcc[occ]); }
      byOcc[occ].panels.push({
        panelId: p.id, revision: p.revision || 0, durationFrames: p.durationFrames || 0,
        captions: p.sbpro.captions || {}, camera: p.sbpro.camera || null,
        image: p.sbpro.image || null, sound: p.sbpro.sound || null, startFrame: 0
      });
    }
    var frame = 0;
    for (i = 0; i < scenes.length; i++) for (var j = 0; j < scenes[i].panels.length; j++) { scenes[i].panels[j].startFrame = frame; frame += scenes[i].panels[j].durationFrames; }
    return { projectId: manifest.projectId, productionId: top.productionId, fps: manifest.frameRate, scenes: scenes, totalFrames: frame };
  };

  P.cameraText = function (c) {
    if (!c) return "";
    var parts = [];
    if (c.shot) parts.push(c.shot);
    if (c.angle) parts.push(c.angle);
    if (c.focalMm) parts.push(c.focalMm + " mm");
    if (c.movement) parts.push(c.movement);
    return parts.join(" · ");
  };

  function ensureCaptions(api) {
    var have = api.captionNames() || [], need = [P.CAPTIONS.dialogue, P.CAPTIONS.action, P.CAPTIONS.notes, P.CAMERA_CAPTION, P.REF_CAPTION];
    for (var i = 0; i < need.length; i++) if (have.indexOf(need[i]) < 0) api.addCaption(need[i]);
  }

  /** Import fra en utpakket pakke (mappe med manifest.json, panels/ og sound/). */
  P.runImport = function (host, api, folder) {
    var manifest = JSON.parse(host.readText(folder + "/manifest.json"));
    var plan = P.importPlan(manifest);
    var fps = api.projectFps();
    if (fps && plan.fps && Math.abs(fps - plan.fps.num / plan.fps.den) > 0.001) throw new Error("fps");
    ensureCaptions(api);
    var soundTrack = null, count = 0;
    for (var i = 0; i < plan.scenes.length; i++) {
      var sc = plan.scenes[i], sceneId = api.createScene(sc.name);
      for (var j = 0; j < sc.panels.length; j++) {
        var p = sc.panels[j], pid = api.appendPanel(sceneId);
        if (p.durationFrames > 0) api.setDuration(pid, p.durationFrames);
        for (var f = 0; f < P.FIELDS.length; f++) api.setCaption(pid, P.CAPTIONS[P.FIELDS[f]], p.captions[P.FIELDS[f]] || "");
        api.setCaption(pid, P.CAMERA_CAPTION, P.cameraText(p.camera));
        api.setCaption(pid, P.REF_CAPTION, P.formatRef({ panelId: p.panelId, revision: p.revision, occurrenceId: sc.occurrenceId, projectId: plan.projectId, productionId: plan.productionId }));
        if (p.image) api.importImage(pid, folder + "/" + p.image);
        if (p.sound) {
          if (soundTrack === null) soundTrack = api.addSoundTrack("PtG");
          api.importSound(soundTrack, folder + "/" + p.sound.path, p.startFrame);
        }
        count++;
      }
    }
    return { panels: count, scenes: plan.scenes.length, projectId: plan.projectId, productionId: plan.productionId };
  };

  /** Leser Storyboard Pro-prosjektet og lager returmanifestet (manifest v1). Bilder skrives til mappen. */
  P.collectReturn = function (host, api, folder, nowIso) {
    var n = api.panelCount();
    if (n > P.MAX_PANELS) throw new Error("too-many");
    var selected = api.selectedPanels(), onlySel = selected.length > 0;
    var items = [], projectId = null, productionId = null, sceneOcc = {}, rows = [], i, f;
    for (i = 0; i < n; i++) {
      var pid = api.panelAt(i), ref = P.parseRef(api.getCaption(pid, P.REF_CAPTION)), sid = api.sceneOfPanel(pid);
      if (ref) {
        if (projectId === null) { projectId = ref.projectId; productionId = ref.productionId; }
        else if (projectId !== ref.projectId || productionId !== ref.productionId) throw new Error("mixed-projects");
        if (!sceneOcc[sid]) sceneOcc[sid] = ref.occurrenceId;
      }
      rows.push({ pid: String(pid), sid: sid, ref: ref });
    }
    if (projectId === null) throw new Error("no-reference");
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], captions = {};
      for (f = 0; f < P.FIELDS.length; f++) captions[P.FIELDS[f]] = String(api.getCaption(r.pid, P.CAPTIONS[P.FIELDS[f]]) || "");
      var files = [];
      if (!onlySel || selected.indexOf(r.pid) >= 0) {
        var rel = "panels/" + r.pid.replace(/[^A-Za-z0-9_.-]/g, "_") + ".png", abs = folder + "/" + rel;
        api.exportPanelImage(r.pid, abs);
        var bytes = host.readBytes(abs);
        files.push({ path: rel, sha256: P.sha256(bytes), byteSize: bytes.length, mimeType: "image/png" });
      }
      var item = {
        kind: "panel", id: r.ref ? r.ref.panelId : "sbpro-" + r.pid.replace(/[^A-Za-z0-9-]/g, "").slice(0, 50),
        parentId: (r.ref && r.ref.occurrenceId) || sceneOcc[r.sid] || undefined,
        durationFrames: api.getDuration(r.pid),
        files: files,
        sbpro: { sbproId: r.pid.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 128), order: i, captions: captions, "new": !r.ref }
      };
      if (r.ref) item.base = { entity: "panel", id: r.ref.panelId, revision: r.ref.revision };
      items.push(item);
    }
    var fps = api.projectFps() || 25, den = Math.abs(fps - Math.round(fps)) > 0.001 ? 1001 : 1;
    return {
      manifestVersion: 1, createdAt: nowIso, projectId: projectId,
      frameRate: { num: den === 1001 ? Math.round(fps * 1001) : Math.round(fps), den: den }, sampleRate: 48000,
      sourceApp: { name: "Toon Boom Storyboard Pro", version: host.appVersion ? String(host.appVersion()) : "22" },
      adapter: { id: P.ADAPTER.id, version: P.ADAPTER.version },
      items: items,
      sbpro: { productionId: productionId, selectionOnly: onlySel }
    };
  };

  // ---------- Nettverk og innlogging (C-0) ----------
  function form(o) { var a = []; for (var k in o) if (o.hasOwnProperty(k)) a.push(encodeURIComponent(k) + "=" + encodeURIComponent(o[k])); return a.join("&"); }
  function parse(res) { try { return JSON.parse(res.body || "{}"); } catch (e) { return {}; } }

  P.login = function (host, baseUrl) {
    var res = host.http("POST", baseUrl + "/api/v1/oauth/device", { "Content-Type": "application/x-www-form-urlencoded" }, form({ client_id: P.CLIENT_ID, scope: P.SCOPES }));
    var d = parse(res);
    if (res.status !== 200 || !d.device_code) throw new Error(d.error || "device");
    var deadline = host.now() + (d.expires_in || 600) * 1000, interval = (d.interval || 5) * 1000;
    host.message(P.t(host, "loginCode", { url: d.verification_uri, code: d.user_code }));
    while (host.now() < deadline) {
      var tr = host.http("POST", baseUrl + "/api/v1/oauth/token", { "Content-Type": "application/x-www-form-urlencoded" }, form({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: d.device_code, client_id: P.CLIENT_ID }));
      var t = parse(tr);
      if (tr.status === 200 && t.access_token) {
        var session = { baseUrl: baseUrl, accessToken: t.access_token, refreshToken: t.refresh_token, projectId: t.project_id, expiresAt: host.now() + t.expires_in * 1000 };
        host.saveSession(session);
        return session;
      }
      if (t.error === "slow_down") interval += 5000;
      else if (t.error !== "authorization_pending") throw new Error(t.error || "token");
      host.sleep(interval);
    }
    throw new Error("expired_token");
  };

  function refresh(host, s) {
    var tr = host.http("POST", s.baseUrl + "/api/v1/oauth/token", { "Content-Type": "application/x-www-form-urlencoded" }, form({ grant_type: "refresh_token", refresh_token: s.refreshToken, client_id: P.CLIENT_ID }));
    var t = parse(tr);
    if (tr.status !== 200 || !t.access_token) { host.clearSession(); throw new Error("signed_out"); }
    s.accessToken = t.access_token; s.refreshToken = t.refresh_token; s.expiresAt = host.now() + t.expires_in * 1000;
    host.saveSession(s);
    return s;
  }
  P.authed = function (host, method, path, headers, body, bodyFile) {
    var s = host.loadSession();
    if (!s) throw new Error("not_logged_in");
    if (host.now() > s.expiresAt - 30000) s = refresh(host, s);
    var h = {}; for (var k in (headers || {})) if (headers.hasOwnProperty(k)) h[k] = headers[k];
    h.Authorization = "Bearer " + s.accessToken;
    var res = host.http(method, s.baseUrl + path, h, body, bodyFile);
    if (res.status === 401) { s = refresh(host, s); h.Authorization = "Bearer " + s.accessToken; res = host.http(method, s.baseUrl + path, h, body, bodyFile); }
    return res;
  };

  /** Sender returmanifestet og panelbildene. Svar: antall kandidater/konflikter og om sammenstillingen er tapsfri. */
  P.upload = function (host, manifest, folder) {
    var s = host.loadSession();
    if (!s) throw new Error("not_logged_in");
    if (s.projectId !== manifest.projectId) throw new Error("wrong_project");
    var res = P.authed(host, "POST", "/api/v1/projects/" + manifest.projectId + "/sbpro/returns", { "Content-Type": "application/json" }, JSON.stringify(manifest));
    var r = parse(res);
    if (res.status !== 200 && res.status !== 201) throw new Error(r.reason || r.error || ("http_" + res.status));
    var byKey = {}, i;
    for (i = 0; i < manifest.items.length; i++) { var it = manifest.items[i]; if (it.files && it.files.length) byKey[it.id] = it.files[0]; }
    for (i = 0; i < (r.uploads || []).length; i++) {
      var u = r.uploads[i], file = byKey[u.key];
      if (!file || file.sha256 !== u.sha256) continue;
      var put = P.authed(host, "PUT", "/api/v1/projects/" + manifest.projectId + "/sbpro/returns/" + r.returnId + "/images/" + u.candidateId, { "Content-Type": "image/png" }, null, folder + "/" + file.path);
      if (put.status !== 200) throw new Error(parse(put).error || ("http_" + put.status));
    }
    return r;
  };

  P.logout = function (host) {
    var s = host.loadSession();
    if (s) host.http("POST", s.baseUrl + "/api/v1/oauth/revoke", { "Content-Type": "application/x-www-form-urlencoded" }, form({ token: s.refreshToken, client_id: P.CLIENT_ID }));
    host.clearSession();
  };

  // ---------- Standardvert i Storyboard Pro (Qt-klasser og curl) ----------
  P.defaultHost = function (g) {
    var home = g.QDir ? g.QDir.homePath() : ".";
    var sessionPath = home + "/.pentoglass/sbpro-session.json";
    function readFile(path) { var f = new g.QFile(path); if (!f.open(g.QIODevice.ReadOnly)) throw new Error("read:" + path); var d = f.readAll(); f.close(); return d; }
    function writeText(path, text) { var f = new g.QFile(path); if (!f.open(g.QIODevice.WriteOnly)) throw new Error("write:" + path); var ts = new g.QTextStream(f); ts.setCodec("UTF-8"); ts.writeString(text); ts.flush(); f.close(); }
    return {
      language: function () { return g.QLocale ? new g.QLocale().name() : "en"; },
      appVersion: function () { return g.about && g.about.getVersionInfoStr ? g.about.getVersionInfoStr() : "22"; },
      now: function () { return new Date().getTime(); },
      sleep: function (ms) { var p = new g.QProcess(); p.start("sleep", [String(Math.ceil(ms / 1000))]); p.waitForFinished(ms + 5000); },
      message: function (text) { g.MessageBox.information(text); },
      readText: function (path) { return String(new g.QTextStream(readFile(path)).readAll()); },
      readBytes: function (path) { var d = readFile(path), out = []; for (var i = 0; i < d.size(); i++) out.push(d.at(i) & 0xff); return out; },
      http: function (method, url, headers, body, bodyFile) {
        var args = ["-sS", "-X", method, "-w", "\n%{http_code}", "--max-time", "120"];
        for (var k in headers) if (headers.hasOwnProperty(k)) args.push("-H", k + ": " + headers[k]);
        if (bodyFile) args.push("--data-binary", "@" + bodyFile);
        else if (body !== null && body !== undefined) { var tmp = g.QDir.tempPath() + "/ptg-body.txt"; writeText(tmp, body); args.push("--data-binary", "@" + tmp); }
        args.push(url);
        var p = new g.QProcess(); p.start("curl", args); p.waitForFinished(130000);
        var out = String(p.readAllStandardOutput()), cut = out.lastIndexOf("\n");
        return { status: parseInt(out.slice(cut + 1), 10) || 0, body: out.slice(0, cut) };
      },
      loadSession: function () { try { return JSON.parse(String(new g.QTextStream(readFile(sessionPath)).readAll())); } catch (e) { return null; } },
      saveSession: function (s) { new g.QDir(home).mkpath(".pentoglass"); writeText(sessionPath, JSON.stringify(s)); },
      clearSession: function () { g.QFile.remove(sessionPath); }
    };
  };
  return P;
})();
if (typeof module !== "undefined" && module.exports) module.exports = PtG;
