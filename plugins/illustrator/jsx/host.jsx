/*
 * C-7: ExtendScript-siden av Illustrator-panelet (ES3). Panelet kaller bare funksjonene her via evalScript,
 * med argumenter som JSON-strenger. Ingen nettverk, ingen tokens. Ikke verifisert i Illustrator.
 * Kilder: Adobe Illustrator Scripting Reference (JavaScript): app.open, Document.saveAs/IllustratorSaveOptions,
 * Document.exportFile/ExportOptionsPNG24, Document.rasterEffectSettings, Document.XMPString og XMPScript (XMPMeta).
 */
var PTG_NS = "urn:ptg:ns:1.0/";

function ptgXmpLib() {
  if (typeof XMPMeta === "undefined") new ExternalObject("lib:AdobeXMPScript");
  XMPMeta.registerNamespace(PTG_NS, "ptg");
}
function ptgOpenSvg(path, dpi) {
  try {
    var f = new File(path);
    if (!f.exists) return "err:missing";
    var doc = app.open(f);
    try { doc.rasterEffectSettings.resolution = dpi; } catch (e1) {}
    return "ok";
  } catch (e) { return "err:" + String(e).substring(0, 120); }
}
function ptgSaveAi(path) {
  try {
    var o = new IllustratorSaveOptions();
    o.pdfCompatible = true;
    app.activeDocument.saveAs(new File(path), o);
    return "ok";
  } catch (e) { return "err:" + String(e).substring(0, 120); }
}
function ptgReadLink() {
  try {
    ptgXmpLib();
    var meta = new XMPMeta(app.activeDocument.XMPString);
    var p = meta.getProperty(PTG_NS, "link");
    return p ? "link:" + p.value : "none";
  } catch (e) { return "err:" + String(e).substring(0, 120); }
}
function ptgWriteLink(json) {
  try {
    ptgXmpLib();
    var doc = app.activeDocument;
    var meta = new XMPMeta(doc.XMPString);
    meta.setProperty(PTG_NS, "link", json);
    doc.XMPString = meta.serialize(XMPConst.SERIALIZE_USE_COMPACT_FORMAT);
    return "ok";
  } catch (e) { return "err:" + String(e).substring(0, 120); }
}
function ptgExportPng(path, w, h) {
  try {
    var doc = app.activeDocument;
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var abw = ab[2] - ab[0], abh = ab[1] - ab[3];
    var o = new ExportOptionsPNG24();
    o.artBoardClipping = true;
    o.transparency = true;
    o.antiAliasing = true;
    o.horizontalScale = 100 * w / abw;
    o.verticalScale = 100 * h / abh;
    doc.exportFile(new File(path), ExportType.PNG24, o);
    return "ok";
  } catch (e) { return "err:" + String(e).substring(0, 120); }
}
function ptgDocInfo() {
  try {
    var doc = app.activeDocument;
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    return "doc:" + doc.name + "|" + (ab[2] - ab[0]) + "|" + (ab[1] - ab[3]) + "|" + doc.layers.length;
  } catch (e) { return "none"; }
}
