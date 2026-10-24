/**
 * Inngang i Adobe Illustrator (CEP-panel). Det eneste stedet som kjenner CSInterface og window.cep.fs.
 * Ved overgang til UXP erstattes denne filen og cep-ai.ts; controller.ts, ui.ts og kjernen beholdes.
 */
import { IllustratorPlugin } from "./controller";
import { render } from "./ui";
import { cepHost } from "../../audition/src/cep-host";
import { cepIllustrator } from "./cep-ai";
import type { CepFsLike, CSInterfaceLike } from "./host";

declare const CSInterface: new () => CSInterfaceLike;
declare const window: Window & { cep: { fs: CepFsLike } };

const host = cepHost(new CSInterface(), window.cep.fs, {
  fetch: (...a) => fetch(...a),
  random: n => crypto.getRandomValues(new Uint8Array(n)),
});
const plugin = new IllustratorPlugin(host, cepIllustrator(host.evalScript));
const root = document.getElementById("ptg-root")!;
plugin.subscribe(() => render(root, plugin));
render(root, plugin);
void plugin.start();
