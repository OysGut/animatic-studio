/**
 * G-2 skala: målinger mot lokal Postgres (ikke en del av CI). Bygger en egen database med migrasjonene til og med
 * G2_UPTO (standard: alle), legger inn et syntetisk stort prosjekt og måler innlasting og triggere.
 * Kjør: DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres G2_UPTO=0092 bun tests/db/g2-scale-bench.ts
 * Størrelse: G2_BLOCKS (50 000), G2_SCENES (2 000), G2_LAYERS (10 000). Revisjoner = én per blokk + G2_EXTRA_REVS.
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_URL = process.env["DATABASE_URL"] ?? "postgres://postgres@127.0.0.1:54329/postgres";
const UPTO = process.env["G2_UPTO"] ?? "9999";
const BLOCKS = Number(process.env["G2_BLOCKS"] ?? 50_000);
const SCENES = Number(process.env["G2_SCENES"] ?? 2_000);
const LAYERS = Number(process.env["G2_LAYERS"] ?? 10_000);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DB = `g2_bench_${Date.now()}`;
const ALICE = "11111111-1111-7111-8111-111111111111";
const BOB = "22222222-2222-7222-8222-222222222222";

const admin = postgres(ADMIN_URL, { onnotice: () => {} });
await admin.unsafe(`create database ${DB}`);
const sql = postgres(ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`), { onnotice: () => {}, max: 1 });
const out: Record<string, number | string> = { upto: UPTO, blocks: BLOCKS, scenes: SCENES, layers: LAYERS };
const ms = async (label: string, fn: () => Promise<unknown>) => {
  const t0 = performance.now();
  await fn();
  out[label] = Math.round(performance.now() - t0);
};

/** Tabellene klienten laster ved åpning (samme liste som project-rows.ts). */
export const TABLES = [
  "productions", "scenes", "scene_variants", "script_blocks", "script_block_revisions", "scene_occurrences",
  "production_segments", "takes", "assets", "asset_variants", "asset_versions", "script_annotations", "compositions",
  "composition_layers", "audio_clips", "clip_parts", "time_links", "generation_prompts", "continuity_events",
  "translations", "asset_relations", "posters", "style_profiles", "story_profiles", "story_profile_stages",
  "story_facts", "story_canvas_nodes", "story_canvas_edges", "template_instances", "credit_participants",
  "credit_sequences", "animation_rigs", "animation_rig_versions", "animation_uses", "lipsync_results",
  "animation_patterns", "dialogue_versions", "dialogue_reviews", "note_flags", "quality_profiles",
  "translation_line_links", "translation_lines", "style_harmonizations", "style_preferred_references",
  "language_versions", "rig_templates", "rig_setups", "measure_sets", "print_jobs", "print_job_elements",
  "mouth_sets", "mouth_tracks",
];

async function asAlice<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`);
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ALICE })}, true)`;
    return fn(tx);
  })) as T;
}

try {
  await sql.unsafe(readFileSync(join(root, "tests/db/supabase-emulation.sql"), "utf8"));
  const files = readdirSync(join(root, "db/migrations")).filter((x) => x.endsWith(".sql") && x.slice(0, 4) <= UPTO).sort();
  for (const f of files) await sql.unsafe(readFileSync(join(root, "db/migrations", f), "utf8"));
  out["migrations"] = files.at(-1) ?? "";
  await sql`insert into auth.users (id, email) values (${ALICE}, 'alice@example.no'), (${BOB}, 'bob@example.no')`;

  // Noen andre prosjekter, så RLS må skille (ALICE er medlem av 20, BOB av 20 andre)
  const project = String((await asAlice((tx) => tx`select public.create_project('Stor', 25, 1, 'nb') id`))[0]!["id"]);
  for (let i = 0; i < 19; i++) await asAlice((tx) => tx`select public.create_project(${"A" + i}, 25, 1, 'nb')`);
  await sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`);
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: BOB })}, true)`;
    for (let i = 0; i < 20; i++) await tx`select public.create_project(${"B" + i}, 25, 1, 'en')`;
  });
  const prod = String((await sql`select id from public.productions where project_id=${project} and kind='main'`)[0]!["id"]);
  const per = Math.max(1, Math.floor(BLOCKS / SCENES));

  await ms("seed_scenes_ms", () => sql.unsafe(`
    create temp table g2s as select gen_random_uuid() scene, gen_random_uuid() variant, gen_random_uuid() occ, gen_random_uuid() comp, i
      from generate_series(1, ${SCENES}) i;
    insert into public.scenes (id, project_id, origin_production_id) select scene, '${project}', '${prod}' from g2s;
    insert into public.scene_variants (id, project_id, scene_id) select variant, '${project}', scene from g2s;
    insert into public.scene_occurrences (id, project_id, production_id, scene_id, variant_id, order_key)
      select occ, '${project}', '${prod}', scene, variant, 'k' || lpad(i::text, 7, '0') || '1' from g2s;
    insert into public.compositions (id, project_id, variant_id) select comp, '${project}', variant from g2s;
  `));
  // Måling av g1-triggeren: 10 000 blokker i én setning med og uten triggeren
  await ms("g1_blocks_10k_with_trigger_ms", () => sql.unsafe(`
    insert into public.script_blocks (id, project_id, variant_id, kind, order_key, language, text)
      select gen_random_uuid(), '${project}', s.variant, 'action', 'b' || lpad(j::text, 7, '0') || '1', 'nb', 'Tekst ' || j
      from g2s s cross join generate_series(1, 5) j where s.i <= 2000`));
  await sql.unsafe(`alter table public.script_blocks disable trigger g1_blocks_language`);
  await ms("g1_blocks_10k_without_trigger_ms", () => sql.unsafe(`
    insert into public.script_blocks (id, project_id, variant_id, kind, order_key, language, text)
      select gen_random_uuid(), '${project}', s.variant, 'action', 'c' || lpad(j::text, 7, '0') || '1', 'nb', 'Tekst ' || j
      from g2s s cross join generate_series(1, 5) j where s.i <= 2000`));
  await sql.unsafe(`alter table public.script_blocks enable trigger g1_blocks_language`);
  const rest = Math.max(0, BLOCKS - 20_000);
  await ms("seed_blocks_rest_ms", () => sql.unsafe(`
    insert into public.script_blocks (id, project_id, variant_id, kind, order_key, language, text)
      select gen_random_uuid(), '${project}', s.variant, 'dialogue', 'd' || lpad(j::text, 7, '0') || '1', 'nb', 'Replikk ' || j
      from g2s s cross join generate_series(1, ${Math.ceil(rest / SCENES)}) j limit ${rest}`));
  await ms("seed_revisions_ms", () => sql.unsafe(`
    insert into public.script_block_revisions (project_id, block_id, rev, text, author)
      select project_id, id, 1, text, '${ALICE}' from public.script_blocks where project_id='${project}'`));
  const extra = Number(process.env["G2_EXTRA_REVS"] ?? 0);
  if (extra > 0) await sql.unsafe(`
    insert into public.script_block_revisions (project_id, block_id, rev, text, author)
      select project_id, id, 1 + g, text, '${ALICE}' from public.script_blocks, generate_series(1, ${extra}) g
      where project_id='${project}'`);
  await ms("seed_layers_ms", () => sql.unsafe(`
    insert into public.composition_layers (id, project_id, composition_id, order_key, kind, width, height, transform, fill)
      select gen_random_uuid(), '${project}', s.comp, 'l' || lpad(j::text, 4, '0') || '1', 'background', 1920, 1080, '{}'::jsonb, '#000000'
      from g2s s cross join generate_series(1, ${Math.ceil(LAYERS / SCENES)}) j limit ${LAYERS}`));
  // Måling av de utsatte språkversjonstriggerne: 10 000 linjer i én transaksjon
  const lv = String((await sql`insert into public.language_versions (id, project_id, language, source_language, name) values (gen_random_uuid(), ${project}, 'en', 'nb', 'English') returning id`)[0]!["id"]);
  await ms("g1_lines_10k_ms", () => sql.unsafe(`
    insert into public.translation_lines (id, project_id, variant_id, language, ord, text, language_version_id)
      select gen_random_uuid(), '${project}', s.variant, 'en', j, 'Line ' || j, '${lv}'
      from g2s s cross join generate_series(1, 5) j where s.i <= 2000`));
  await sql`analyze`;
  out["rows_blocks"] = Number((await sql`select count(*) n from public.script_blocks where project_id=${project}`)[0]!["n"]);
  out["rows_revisions"] = Number((await sql`select count(*) n from public.script_block_revisions where project_id=${project}`)[0]!["n"]);

  // Gammel innlasting: hver tabell sidevis med OFFSET (1000 per side), som RLS-bruker, JSON som PostgREST
  await ms("open_offset_ms", () => asAlice(async (tx) => {
    for (const t of TABLES) {
      const order = t === "script_block_revisions" ? "block_id, rev" : "id";
      for (let from = 0; ; from += 1000) {
        const r = await tx.unsafe(`select coalesce(json_agg(x), '[]') j, count(*) n from (select * from public.${t} where project_id = $1 order by ${order} limit 1000 offset ${from}) x`, [project]);
        if (Number(r[0]!["n"]) < 1000) break;
      }
    }
  }));
  // Keyset: id > siste id (historikk utelatt, den lastes når den trengs)
  await ms("open_keyset_ms", () => asAlice(async (tx) => {
    for (const t of TABLES) {
      if (t === "script_block_revisions") continue;
      let last = "00000000-0000-0000-0000-000000000000";
      for (;;) {
        const r = await tx.unsafe(`select coalesce(json_agg(x), '[]') j, count(*) n, max(x.id::text) last from (select * from public.${t} where project_id = $1 and id > $2 order by id limit 1000) x`, [project, last]);
        if (Number(r[0]!["n"]) < 1000) break;
        last = String(r[0]!["last"]);
      }
    }
  }));
  const hasSnapshot = (await sql`select 1 from pg_proc where proname='project_snapshot'`).length > 0;
  if (hasSnapshot) {
    await ms("open_snapshot_ms", () => asAlice((tx) => tx`select public.project_snapshot(${project})::text`));
    await ms("open_snapshot_full_history_ms", () => asAlice((tx) => tx`select public.project_snapshot(${project}, true)::text`));
    out["snapshot_bytes"] = Number((await asAlice((tx) => tx`select length(public.project_snapshot(${project})::text) n`))[0]!["n"]);
  }
  // Én RLS-lesing av alle blokkene (måler policyen alene)
  await ms("rls_blocks_count_ms", () => asAlice((tx) => tx`select count(*) from public.script_blocks`));
  console.log(JSON.stringify(out, null, 2));
} finally {
  await sql.end();
  await admin.unsafe(`drop database if exists ${DB} with (force)`);
  await admin.end();
}
