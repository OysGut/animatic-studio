/**
 * G-4: måling av søk mot lokal Postgres (ikke en del av CI). Bygger en egen database med migrasjonene,
 * legger inn et syntetisk prosjekt med 50 000 blokker (aksentert og CJK-tekst) og måler søk før/etter
 * trigramindeksen fra 0096, samt at spørringsplanen bruker indeksen.
 * Kjør: DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres bun tests/db/g4-search-bench.ts
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_URL = process.env["DATABASE_URL"] ?? "postgres://postgres@127.0.0.1:54329/postgres";
const BLOCKS = Number(process.env["G4_BLOCKS"] ?? 50_000);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DB = `g4_bench_${Date.now()}`;
const ALICE = "11111111-1111-7111-8111-111111111111";

const admin = postgres(ADMIN_URL, { onnotice: () => {} });
await admin.unsafe(`create database ${DB}`);
const sql = postgres(ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`), { onnotice: () => {}, max: 1 });
const out: Record<string, number | string> = { blocks: BLOCKS };
const ms = async (label: string, fn: () => Promise<unknown>) => {
  const t0 = performance.now();
  await fn();
  out[label] = Math.round(performance.now() - t0);
};

async function asAlice<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`);
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ALICE })}, true)`;
    return fn(tx);
  })) as T;
}

try {
  await sql.unsafe(readFileSync(join(root, "tests/db/supabase-emulation.sql"), "utf8"));
  const files = readdirSync(join(root, "db/migrations")).filter((x) => x.endsWith(".sql")).sort();
  for (const f of files) await sql.unsafe(readFileSync(join(root, "db/migrations", f), "utf8"));
  out["migrations"] = files.at(-1) ?? "";
  await sql`insert into auth.users (id, email) values (${ALICE}, 'alice@example.no')`;
  const project = String((await asAlice((tx) => tx`select public.create_project('Søk', 25, 1, 'nb') id`))[0]!["id"]);
  const prod = String((await sql`select id from public.productions where project_id=${project} and kind='main'`)[0]!["id"]);

  await sql.unsafe(`
    create temp table g4s as select gen_random_uuid() scene, gen_random_uuid() variant, gen_random_uuid() occ, i from generate_series(1, 2000) i;
    insert into public.scenes (id, project_id, origin_production_id) select scene, '${project}', '${prod}' from g4s;
    insert into public.scene_variants (id, project_id, scene_id) select variant, '${project}', scene from g4s;
    insert into public.script_blocks (id, project_id, variant_id, kind, order_key, language, text)
      select gen_random_uuid(), '${project}', g.variant, 'action', 'b' || lpad((g.i * 100 + j)::text, 9, '0') || '1', 'nb',
        case (g.i + j) % 5
          when 0 then 'Café ÁRBOL piñón número ' || j
          when 1 then '映画のテストシーン ' || j
          when 2 then '中文字幕テキスト ' || j
          when 3 then 'Sara går inn på caféen ved trærne ' || j
          else 'Vanlig handling uten aksenter ' || j
        end
      from g4s g cross join generate_series(1, ${Math.ceil(BLOCKS / 2000)}) j limit ${BLOCKS}`);
  await sql`analyze`;
  out["rows"] = Number((await sql`select count(*) n from public.script_blocks where project_id=${project}`)[0]!["n"]);

  // FØR: slik det gamle ilike-søket ville gått (uten indeks)
  await sql`drop index if exists public.script_blocks_fold_trgm_idx`;
  await ms("ilike_uten_indeks_ms", () =>
    asAlice((tx) => tx`select count(*) n from public.script_blocks b where b.project_id=${project} and b.text ilike '%café%'`));
  // ETTER: foldet søk med trigramindeks
  await sql.unsafe(`create index script_blocks_fold_trgm_idx on public.script_blocks using gin (private.fold_text(text) extensions.gin_trgm_ops)`);
  await sql`analyze`;
  await ms("fold_med_indeks_ms", () =>
    asAlice((tx) => tx`select count(*) n from public.script_blocks b where b.project_id=${project} and private.fold_text(b.text) like '%' || private.fold_text('café') || '%'`));
  await ms("fold_cjk_ms", () =>
    asAlice((tx) => tx`select count(*) n from public.script_blocks b where b.project_id=${project} and private.fold_text(b.text) like '%' || private.fold_text('字幕') || '%'`));
  await ms("rpc_search_ms", () =>
    asAlice((tx) => tx`select count(*) n from public.search_script_blocks(${project}, 'cafe', 50)`));

  // Planen må bruke trigramindeksen
  const plan = await asAlice((tx) => tx.unsafe(`
    explain (format json)
    select count(*) from public.script_blocks b
    where b.project_id = '${project}' and private.fold_text(b.text) like '%cafe%'`));
  out["plan_bruker_trgm"] = JSON.stringify(plan).includes("script_blocks_fold_trgm_idx") ? "ja" : "NEI";

  // Riktighet: foldet søk finner aksentert tekst, og RPC-en ser samme rader
  const direkte = Number((await asAlice((tx) => tx`select count(*) n from public.script_blocks b where b.project_id=${project} and private.fold_text(b.text) like '%cafe%'`))[0]!["n"]);
  const rpc = Number((await asAlice((tx) => tx`select count(*) n from (select 1 from public.search_script_blocks(${project}, 'café', 200)) x`))[0]!["n"]);
  out["treff_fold"] = direkte;
  out["treff_rpc"] = rpc;
  out["treff_lik"] = direkte === rpc ? "ja" : "NEI";

  console.log(JSON.stringify(out, null, 2));
} finally {
  await sql.end();
  await admin.unsafe(`drop database if exists ${DB} with (force)`);
  await admin.end();
}
