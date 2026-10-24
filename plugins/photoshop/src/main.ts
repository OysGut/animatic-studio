/**
 * Inngang i Photoshop. Det eneste stedet som henter Adobe-modulene; resten får dem via Host.
 * `entrypoints.setup` følger UXP-dokumentasjonen for paneler (manifest v5).
 */
import { PhotoshopPlugin } from "./controller";
import { render } from "./ui";
import type { Host, PhotoshopModule, UxpModule } from "./host";

declare const require: (m: string) => unknown;

const ps = require("photoshop") as PhotoshopModule & { app: { currentLocale?: string } };
const uxp = require("uxp") as UxpModule & { entrypoints: { setup(o: object): void }; host?: { uiLocale?: string } };

const host: Host = {
  ps, uxp,
  fetch: (...a) => fetch(...a),
  random: n => crypto.getRandomValues(new Uint8Array(n)),
  language: uxp.host?.uiLocale ?? ps.app.currentLocale ?? "en",
};
const plugin = new PhotoshopPlugin(host);

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
      show() { plugin.refreshActiveDocument(); },
    },
  },
});
