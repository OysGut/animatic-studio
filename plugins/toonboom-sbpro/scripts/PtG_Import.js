/* From Pen to Glass: importer en pakke («Send til Storyboard Pro» i appen, pakket ut i en mappe). */
include("PtG_lib.js");
function PtG_Import() {
  var host = PtG.defaultHost(this), api = PtG.sbpro(this);
  var folder = FileDialog.getExistingDirectory("", PtG.t(host, "pickPackage"));
  if (!folder) return;
  try {
    var r = PtG.runImport(host, api, folder);
    host.message(PtG.t(host, "importDone", { panels: r.panels, scenes: r.scenes }));
  } catch (e) { host.message(PtG.t(host, "importFail", { reason: e.message })); }
}
