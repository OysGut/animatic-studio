/**
 * C-6: CEP har ingen sikker nøkkelring som UXP. Tokenene lagres derfor bare i panelets egen brukerdatamappe
 * (utenfor prosjektet og lydfilene), aldri i lydfiler, økter, manifest eller logg. Tilgangen er kortlivet og
 * kan trekkes tilbake i Pen to Glass; filen slettes ved utlogging. Kryptering med OS-nøkkelring står i TODO.
 */
import type { TokenSet, TokenStore } from "../../../packages/ptg-connector-sdk/src/index";
import type { Host } from "./host";

export const TOKEN_FILE = "audition-session.json";

export function fileTokenStore(host: Host, file = TOKEN_FILE): TokenStore {
  const path = `${host.userDataDir}/${file}`;
  return {
    async load() {
      try {
        const v = JSON.parse(new TextDecoder().decode(await host.readFile(path))) as TokenSet;
        return typeof v.accessToken === "string" && typeof v.refreshToken === "string" ? v : null;
      } catch { return null; }
    },
    async save(t) {
      if (!t) { await host.removeFile(path).catch(() => undefined); return; }
      await host.makeDir(host.userDataDir);
      await host.writeFile(path, new TextEncoder().encode(JSON.stringify(t)));
    },
  };
}
