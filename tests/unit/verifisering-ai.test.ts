// @vitest-environment node
/**
 * Verifisering av krav (DEC-0073) om AI-generering: ingen automatisk betalt generering (REQ-0029, REQ-0133,
 * REQ-0592) og ingen nøkler i logglinjer (REQ-0414).
 *
 * REQ-0029/0133: en statisk gjennomgang av importgrafen (samme metode som tests/architecture/eksport-uten-ai)
 * viser at endringer i manus, ressurser, nummerering og stil – som alle er kommandoer gjennom kjernen,
 * runCommand og angrelisten – ikke kan nå noen AI-adapter. I tillegg krever hver serverfunksjon som starter
 * en betalt jobb en eksplisitt bekreftelse, og bakgrunnskøen når ikke funksjonene som lager nye jobber.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptKey } from "@/adapters/ai/key-vault.server";
import { followUpRunningVideoJobs } from "@/adapters/ai/video-followup.server";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { fakeDb } from "../helpers/fake-supabase";

const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");
const AI_DIR = join(SRC, "adapters", "ai") + "/";

/** Serverfunksjonene som oppretter (og sender) nye genereringsjobber hos en leverandør. */
const STARTERS = [
  "src/adapters/ai/generate-image.functions.ts",
  "src/adapters/ai/video.functions.ts",
  "src/adapters/ai/sound.functions.ts",
  "src/adapters/ai/speech.functions.ts",
  "src/adapters/ai/write-prompt.functions.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p) ? [p] : [];
  });
}

const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  base = base.replace(/\?.*$/, "");
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  throw new Error(`Kunne ikke løse «${spec}» i ${relative(ROOT, from)}`);
}

function runtimeImports(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  const re =
    /\b(import|export)\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of code.matchAll(re)) {
    if (m[2]) continue;
    const spec = m[3] ?? m[4];
    if (spec) out.push(spec);
  }
  return out;
}

function reachable(entries: readonly string[]): Map<string, string | null> {
  const seen = new Map<string, string | null>();
  const stack: [string, string | null][] = entries.map((e) => [e, null]);
  while (stack.length) {
    const [file, parent] = stack.pop()!;
    if (seen.has(file)) continue;
    seen.set(file, parent);
    for (const spec of runtimeImports(readFileSync(file, "utf8"))) {
      const dep = resolveImport(file, spec);
      if (dep && !seen.has(dep)) stack.push([dep, file]);
    }
  }
  return seen;
}

function chains(graph: Map<string, string | null>, hit: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const [file] of graph) {
    if (!hit(file)) continue;
    const chain: string[] = [];
    for (let f: string | null = file; f; f = graph.get(f) ?? null) chain.push(relative(ROOT, f));
    out.push(chain.join(" ← "));
  }
  return out;
}

describe("REQ-0029 / REQ-0133 – ingen automatisk betalt AI-generering", () => {
  it("REQ-0029 REQ-0133: kommandoveien (kjernen, runCommand, angrelisten) når ingen AI-adapter", () => {
    // Manusendring, ressursendring, omnummerering og stilendring er alle kommandoer gjennom disse filene
    const entries = [
      ...walk(join(SRC, "core")),
      join(SRC, "adapters/storage/commands.functions.ts"),
      join(SRC, "app/project/use-commands.ts"),
    ];
    for (const f of entries) expect(existsSync(f), f).toBe(true);
    const graph = reachable(entries);
    expect(graph.size).toBeGreaterThan(entries.length);
    expect(chains(graph, (f) => f.startsWith(AI_DIR))).toEqual([]);
  });

  it("REQ-0029: hver serverfunksjon som starter en betalt jobb, avviser kall uten eksplisitt bekreftelse", () => {
    for (const f of STARTERS) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, f).toMatch(/createServerFn\(/);
      expect(src, f).toMatch(/x\["approved"\]\s*!==\s*true\)\s*throw new Error\(/);
    }
  });

  it("REQ-0029 REQ-0592: bakgrunnskøen når ingen funksjon som lager nye jobber – den følger bare opp og sender det brukeren la i kø", () => {
    const graph = reachable([join(SRC, "routes/api/public/cron/ai-jobs.ts")]);
    const starters = new Set(STARTERS.map((f) => join(ROOT, f)));
    expect(chains(graph, (f) => starters.has(f))).toEqual([]);
    // Kontrollprøve: oppfølgingen nås, så gjennomgangen virker
    expect(graph.has(join(SRC, "adapters/ai/video-followup.server.ts"))).toBe(true);
    // Køen sender bare jobber med status «queued» (lagt i kø av brukeren med bekreftelse)
    const followup = readFileSync(join(SRC, "adapters/ai/video-followup.server.ts"), "utf8");
    expect(followup).not.toMatch(/\.insert\(/);
  });

  it("REQ-0133: kontrollprøve – bildepanelet i biblioteket når bildegenereringen (via egen knapp)", () => {
    const graph = reachable([join(SRC, "app/library/GenerateImagePanel.tsx")]);
    expect(graph.has(join(SRC, "adapters/ai/generate-image.functions.ts"))).toBe(true);
  });
});

describe("REQ-0414 – logging avslører ikke tilgangsopplysninger", () => {
  const P = "00000000-0000-7000-8000-0000000000a1";
  const KEY_ID = "00000000-0000-7000-8000-00000000c001";
  const OWNER = "00000000-0000-7000-8000-00000000b001";
  const JOB = "00000000-0000-7000-8000-00000000d001";
  // En nøkkel som ikke ligner de kjente mønstrene (sk-, AIza, key_…), så bare nøkkelen selv kan fjernes
  const SECRET = "rw-hemmelig-nokkel-0123456789";

  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret");
    vi.stubEnv("ANIMATIC_KEY_ENCRYPTION_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function runWithProviderError(status: number) {
    const sealed = await encryptKey(SECRET, { userId: OWNER, provider: "runway", rowId: KEY_ID });
    const db = fakeDb({
      generation_jobs: [
        {
          id: JOB,
          project_id: P,
          kind: "video",
          provider: "runway",
          model: "gen4_turbo",
          status: "running",
          external_id: "task-1",
          provider_key_id: KEY_ID,
          result_path: null,
          created_at: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
      ai_provider_keys: [
        {
          id: KEY_ID,
          user_id: OWNER,
          provider: "runway",
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          key_version: sealed.version,
        },
      ],
    });
    // Leverandøren gjentar nøkkelen i feilteksten
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: `Bad key ${SECRET} for task` } }), {
            status,
          }),
      ),
    );
    const lines: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    await followUpRunningVideoJobs(db as unknown as AnyClient);
    const rows = (await db.from("generation_jobs").select("*")) as unknown as {
      data: { status: string; error?: string | null }[];
    };
    return { lines, row: rows.data[0]! };
  }

  it("REQ-0414: varig avslag (401) – feilen som lagres på jobben, inneholder ikke nøkkelen", async () => {
    const { lines, row } = await runWithProviderError(401);
    expect(row.status).toBe("failed");
    expect(row.error ?? "").toContain("Bad key");
    expect(row.error ?? "").not.toContain(SECRET);
    for (const l of lines) expect(l).not.toContain(SECRET);
  });

  // Rettet i DEC-0073: video-followup.server.ts fjerner nøkkelen også fra logglinjen ved 5xx/429.
  it("REQ-0414: midlertidig feil (500) – ingen logglinje inneholder nøkkelen", async () => {
    const { lines, row } = await runWithProviderError(500);
    expect(row.status).toBe("running");
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toContain(SECRET);
  });
});
