/* From Pen to Glass: koble til et prosjekt (enhetsflyt, ingen hemmeligheter i skriptet). */
include("PtG_lib.js");
function PtG_Login() {
  var host = PtG.defaultHost(this);
  try { PtG.login(host, PtG.DEFAULT_BASE_URL); host.message(PtG.t(host, "loginOk")); }
  catch (e) { host.message(PtG.t(host, "loginFail", { reason: e.message })); }
}
