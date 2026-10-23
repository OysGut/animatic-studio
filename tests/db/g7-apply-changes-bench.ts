/**
 * G-7 robust lagring: måler gjennomstrømming i public.apply_changes (ikke en del av CI).
 * Bygger en egen database med migrasjonene til og med G7_UPTO (0098 = før, 0099 = etter),
 * og måler tiden for å legge inn 10 000 manusblokker via apply_changes i bolker.
 * Kjør: DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres G7_UPTO=0098 bun tests/db/g7-apply-changes-bench.ts
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_URL = process.env["DATABASE_URL"] ?? "postgres://postgres@127.0.0.1:54329/postgres";
const UPTO = process.env["G7_UPTO"] ?? "9999";
const BLOCKS = Number(process.env["G7_BLOCKS"] ?? 10_000);
const BATCH = Number(process.env["G7_BATCH"] ?? 200);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DB = `g7_bench_${Date.now()}`;
const ALICE = "11111111-1111-7111-8111-111111111111";

const admin = postgres(ADMIN_URL, { onnotice: () => {} });
await admin.unsafe(`create database ${DB}`);
const sql = postgres(ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`), { onnotice: () => {}, max: 1 });
const out: Record<string, number | string> = { upto: UPTO, blocks: BLOCKS, batch: BATCH };

try {
  await sql.unsafe(readFileSync(join(root, "tests/db/supabase-emulation.sql"), "utf8"));
  const files = readdirSync(join(root, "db/migrations")).filter((x) => x.endsWith(".sql") && x.slice(0, 4) <= UPTO).sort();
  for (const f of files) await sql.unsafe(readFileSync(join(root, "db/migrations", f), "utf8"));
  out["migrations"] = files.at(-1) ?? "";
  await sql`insert into auth.users (id, email) values (${ALICE}, 'alice@example.no')`;

  const project = String(
    (await sql.begin(async (tx) => {
      await tx.unsafe(`set local role authenticated`);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ALICE })}, true)`;
      return tx`select public.create_project('G7', 25, 1, 'nb') id`;
    }))[0]!["id"],
  );
  const prod = String((await sql`select id from public.productions where project_id = ${project} and kind = 'main'`)[0]!["id"]);
  const scene = crypto.randomUUID();
  const variant = crypto.randomUUID();
  await sql.begin(async (tx) => {
    await tx.unsafe(`set local role service_role`);
    await tx`insert into public.scenes (id, project_id, origin_production_id) values (${scene}, ${project}, ${prod})`;
    await tx`insert into public.scene_variants (id, project_id, scene_id) values (${variant}, ${project}, ${scene})`;
  });

  // 10 000 blokker i bolker via apply_changes (service_role, slik runCommand gjør)
  const t0 = performance.now();
  for (let b = 0; b < BLOCKS / BATCH; b++) {
    const rows = Array.from({ length: BATCH }, (_, i) => ({
      id: crypto.randomUUID(),
      project_id: project,
      variant_id: variant,
      kind: "dialogue",
      order_key: `k${String(b * BATCH + i).padStart(8, "0")}`,
      text: `Replikk nummer ${b * BATCH + i}`,
      revision: 1,
    }));
    const changes = { inserts: { script_blocks: rows } };
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local role service_role`);
      await tx`select public.apply_changes(${project}, ${ALICE}, gen_random_uuid(), ${tx.json({ type: "G7Bench" } as never)}, null, ${tx.json(changes as never)})`;
    });
  }
  out["insert_10k_blocks_ms"] = Math.round(performance.now() - t0);
  out["rows"] = Number((await sql`select count(*) n from public.script_blocks where project_id = ${project}`)[0]!["n"]);
  console.log(JSON.stringify(out, null, 2));
} finally {
  await sql.end();
  await admin.unsafe(`drop database ${DB}`);
  await admin.end();
}
