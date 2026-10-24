/**
 * Tokens lagres bare i UXP `secureStorage` (krypteres av operativsystemet), aldri i nettleserlageret eller
 * pluginfiler (skillen ptg-adobe-uxp, regel 2).
 */
import type { TokenSet, TokenStore } from "../../../packages/ptg-connector-sdk/src/index";
import type { UxpModule } from "./host";

export const TOKEN_KEY = "ptg.tokens.v1";

export function secureTokenStore(secure: UxpModule["storage"]["secureStorage"]): TokenStore {
  return {
    async load() {
      const raw = await secure.getItem(TOKEN_KEY);
      if (!raw || !raw.length) return null;
      try {
        const v = JSON.parse(new TextDecoder().decode(raw)) as TokenSet;
        return typeof v.accessToken === "string" && typeof v.refreshToken === "string" ? v : null;
      } catch { return null; }
    },
    async save(t) {
      if (!t) { await secure.removeItem(TOKEN_KEY); return; }
      await secure.setItem(TOKEN_KEY, new TextEncoder().encode(JSON.stringify(t)));
    },
  };
}
