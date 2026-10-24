/* From Pen to Glass: logg ut og trekk tilbake tilgangen. */
include("PtG_lib.js");
function PtG_Logout() {
  var host = PtG.defaultHost(this);
  PtG.logout(host);
  host.message(PtG.t(host, "logoutDone"));
}
