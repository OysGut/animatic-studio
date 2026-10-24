/**
 * Inngang i Premiere Pro (UXP, 25.6+). Det eneste stedet som henter Adobe-modulene; resten får dem via Host.
 * `entrypoints.setup` følger UXP-dokumentasjonen for paneler (manifest v5).
 */
import { PremierePlugin } from "./controller";
import { render } from "./ui";
import type { Host, PremiereProModule, UxpModule } from "./host";

declare const require: (m: string) => unknown;

const ppro = require("premierepro") as PremiereProModule;
const uxp = require("uxp") as UxpModule & { entrypoints: { setup(o: object): void }; host?: { uiLocale?: string; version?: string } };

const host: Host = {
  ppro, uxp,
  fetch: (...a) => fetch(...a),
  random: n => crypto.getRandomValues(new Uint8Array(n)),
  language: uxp.host?.uiLocale ?? "en",
  hostVersion: uxp.host?.version ?? "unknown",
};
const plugin = new PremierePlugin(host);

uxp.entrypoints.setup({
  panels: {
    ptgPanel: {
      create(node: HTMLElement) {
        const root = document.createElement("main");
        node.append(root);
        plugin.subscribe(() => render(root, plugin));
        render(root, plugin);
        void plugin.start();
      },
    },
  },
});
