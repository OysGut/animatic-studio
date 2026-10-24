/* From Pen to Glass: send paneler, timing og tekstfelt tilbake som kandidater. Ingenting tas i bruk automatisk. */
include("PtG_lib.js");
function PtG_Export() {
  var host = PtG.defaultHost(this), api = PtG.sbpro(this);
  if (!host.loadSession()) { host.message(PtG.t(host, "notLoggedIn")); return; }
  var folder = FileDialog.getExistingDirectory("", PtG.t(host, "pickFolder"));
  if (!folder) return;
  try {
    new QDir(folder).mkpath("panels");
    var manifest = PtG.collectReturn(host, api, folder, new Date().toISOString());
    var r = PtG.upload(host, manifest, folder);
    var msg = PtG.t(host, "exportDone", { panels: manifest.items.length, candidates: r.candidates, conflicts: r.conflicts });
    if (r.conform) msg += "\n" + (r.conform.lossless ? PtG.t(host, "conformLossless") : PtG.t(host, "conformSuggest", { reasons: (r.conform.reasons || []).join(", ") }));
    host.message(msg);
  } catch (e) { host.message(PtG.t(host, "exportFail", { reason: e.message })); }
}
