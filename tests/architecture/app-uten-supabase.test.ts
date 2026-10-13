// @vitest-environment node
/**
 * KI-181, REQ-0008, DEC-0078 (ARCHITECTURE §6): UI-et i src/app er ikke bundet til Supabase. All bruk av
 * Supabase-klienten (tabeller, RPC, lagring, innlogging, sanntid) går via små funksjoner i
 * src/adapters/browser/. Statisk skanning av kildekoden.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const APP = join(ROOT, "src/app");

/** Navn appen tidligere brukte på Supabase-klienten. */
const CLIENT = String.raw`\b(?:db|supabase|client|browserClient)`;

const FORBIDDEN: readonly { readonly what: string; readonly re: RegExp }[] = [
  { what: "importerer @/integrations/supabase", re: /["']@\/integrations\/supabase/ },
  { what: "importerer @supabase/*", re: /from\s+["']@supabase\// },
  { what: "importerer klienten i @/app/db", re: /from\s+["']@\/app\/db["']/ },
  {
    what: "importerer klienten i adapters/browser/client",
    re: /["']@\/adapters\/browser\/client["']/,
  },
  { what: "kaller .from( på klienten", re: new RegExp(String.raw`${CLIENT}\s*\.\s*from\s*\(`) },
  { what: "kaller .rpc( på klienten", re: new RegExp(String.raw`${CLIENT}\s*\.\s*rpc\s*\(`) },
  { what: "bruker .storage på klienten", re: new RegExp(String.raw`${CLIENT}\s*\.\s*storage\b`) },
  { what: "bruker .auth. på klienten", re: new RegExp(String.raw`${CLIENT}\s*\.\s*auth\s*\.`) },
  {
    what: "bruker sanntidskanaler på klienten",
    re: new RegExp(String.raw`${CLIENT}\s*\.\s*(?:channel|getChannels|removeChannel)\s*\(`),
  },
];

/**
 * Filer som fortsatt får bruke klienten direkte. Skal være tom: legg aldri til en fil her – lag en funksjon i
 * src/adapters/browser/ i stedet. (src/app/db.ts er bare en bakoverkompatibel videreeksport av klienten.)
 */
const ALLOWED: readonly string[] = [];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p) ? [p] : [];
  });
}

function offenders(): string[] {
  const out: string[] = [];
  for (const f of files(APP)) {
    const rel = relative(ROOT, f).split("\\").join("/");
    // Den bakoverkompatible videreeksporten av klienten (ingen kall)
    if (rel === "src/app/db.ts") continue;
    if (ALLOWED.includes(rel)) continue;
    const src = readFileSync(f, "utf8");
    for (const { what, re } of FORBIDDEN) if (re.test(src)) out.push(`${rel}: ${what}`);
  }
  return out;
}

describe("UI-et i src/app er uavhengig av Supabase (KI-181)", () => {
  it("ingen fil i src/app importerer eller kaller Supabase-klienten direkte", () => {
    expect(offenders()).toEqual([]);
  });

  it("src/app/db.ts er bare en videreeksport fra adapteren", () => {
    const src = readFileSync(join(APP, "db.ts"), "utf8");
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).toMatch(/export\s*\{\s*db\s*\}\s*from\s*["']@\/adapters\/browser\/client["']/);
  });

  it("unntakslisten er tom", () => {
    expect(ALLOWED).toEqual([]);
  });

  it("skanningen fanger direkte bruk (kontroll av mønstrene)", () => {
    const samples = [
      'import { supabase } from "@/integrations/supabase/client";',
      'import { db } from "@/app/db";',
      'const { data } = await db\n  .from("projects")',
      'await db.rpc("create_project", {})',
      "supabase.storage.from(ASSET_BUCKET)",
      "void supabase.auth.signOut()",
      "supabase.channel(topic)",
    ];
    for (const s of samples)
      expect(
        FORBIDDEN.some(({ re }) => re.test(s)),
        s,
      ).toBe(true);
    // Vanlige .from( som ikke er klienten, er lov
    for (const s of ["Array.from(x)", "Uint8Array.from(bytes)", "Object.entries(state)"])
      expect(
        FORBIDDEN.some(({ re }) => re.test(s)),
        s,
      ).toBe(false);
  });
});
