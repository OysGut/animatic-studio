/*
 * C-6: ExtendScript-siden av Audition-panelet (ES3). Panelet kaller bare funksjonene her via evalScript,
 * med argumenter som JSON-strenger. Ingen nettverk, ingen tokens. Ikke verifisert i Audition.
 * Auditions skript-DOM er lite dokumentert; app.openDocument brukes slik Adobe-eksemplene gjør.
 */
function ptgOpenSession(path) {
  try {
    var f = new File(path);
    if (!f.exists) return "err:missing";
    app.openDocument(f.fsName);
    return "ok";
  } catch (e) {
    return "err:" + String(e).substring(0, 120);
  }
}
function ptgVersion() {
  try { return String(app.version); } catch (e) { return "unknown"; }
}
