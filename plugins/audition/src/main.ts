/**
 * Inngang i Adobe Audition (CEP-panel). Det eneste stedet som henter CSInterface og window.cep.fs; resten får dem
 * via Host. CSInterface.js er Adobes egen fil (CEP-Resources) og legges ved i pakken av pack.ts når den finnes.
 */
import { AuditionPlugin } from "./controller";
import { render } from "./ui";
import { cepHost } from "./cep-host";
import type { CepFsLike, CSInterfaceLike } from "./host";

declare const CSInterface: new () => CSInterfaceLike;
declare const window: Window & { cep: { fs: CepFsLike } };

const host = cepHost(new CSInterface(), window.cep.fs, {
  fetch: (...a) => fetch(...a),
  random: n => crypto.getRandomValues(new Uint8Array(n)),
});
const plugin = new AuditionPlugin(host);
const root = document.getElementById("ptg-root")!;
plugin.subscribe(() => render(root, plugin));
render(root, plugin);
void plugin.start();
