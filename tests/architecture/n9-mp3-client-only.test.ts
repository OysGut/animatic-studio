// @vitest-environment node
/**
 * N9 (KI-243): MP3-koderen (LAME som WASM, @mediabunny/mp3-encoder) skal bare ligge i klientbundlen.
 * 1) Kildekoden: bare engine/audio/composition.ts laster pakken, med dynamisk import inne i createClientOnlyFn.
 * 2) Produksjonsbygget: finnes dist/server, skal ingen fil der inneholde koderens kjennetegn.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const PKG = "@mediabunny/mp3-encoder";
// Kode fra koderen. Filnavnet «mediabunny-mp3-encoder-*.js» står i serverens liste over statiske
// klientfiler og regnes ikke som kode på serveren.
// I tillegg starten av den innebygde WASM-modulen (base64) fra pakken selv.
const lame = readFileSync("node_modules/@mediabunny/mp3-encoder/dist/modules/build/lame.js", "utf8");
const WASM = /AGFzbQ[A-Za-z0-9+/]{40}/.exec(lame)?.[0];
const FINGERPRINTS = ["registerMp3Encoder", ...(WASM ? [WASM] : [])];

function files(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(n) ? [p] : [];
  });
}

it("bare composition.ts laster MP3-koderen, dynamisk og inne i createClientOnlyFn", () => {
  const users = files("src", /\.(ts|tsx|js|mjs)$/).filter((f) => readFileSync(f, "utf8").includes(PKG));
  expect(users.map((f) => f.replaceAll("\\", "/"))).toEqual(["src/engine/audio/composition.ts"]);
  const src = readFileSync("src/engine/audio/composition.ts", "utf8");
  expect(src).not.toMatch(new RegExp(`^\\s*import[^(]*["']${PKG}["']`, "m"));
  const fn = src.indexOf("createClientOnlyFn(");
  const dyn = src.indexOf(`import("${PKG}")`);
  expect(fn).toBeGreaterThan(-1);
  expect(dyn).toBeGreaterThan(fn);
});

it("produksjonsbyggets serverdel inneholder ikke MP3-koderen", () => {
  const server = files("dist/server", /\.(js|mjs|cjs|wasm)$/);
  if (server.length === 0) return; // ingen bygg i denne kjøringen; kildekontrollen over gjelder
  const hits = server.filter((f) => FINGERPRINTS.some((s) => readFileSync(f, "utf8").includes(s)));
  expect(hits).toEqual([]);
  // Og den finnes i klientdelen (kjennetegnet er riktig)
  const client = files("dist/client", /\.js$/);
  if (client.length) expect(client.some((f) => FINGERPRINTS.some((s) => readFileSync(f, "utf8").includes(s)))).toBe(true);
});
