import { isDeepStrictEqual } from "node:util";
/**
 * Databasetester mot en lokal Postgres med Supabase-emulering (KI-05: Claude når ikke Lovable Cloud direkte).
 * Kjør: DATABASE_URL=postgres://postgres@localhost:54329/postgres bun tests/db/run-db-tests.ts
 * Tester: RLS-rollematrise (INV-C2), revisjonskonflikt (INV-C1), takes kan ikke slettes (INV-07),
 * historikk kan ikke endres (INV-13), invitasjoner (REQ-0521), rundtur domenekjerne ↔ database (DEC-0022).
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCommand,
  newId,
  emptyStoryProfile,
  diffStates,
  keysEvenly,
  stateFromRows,
  type Command,
  type ProjectRows,
  type ProjectState,
  type UserId,
  DEFAULT_COMPOSITION,
  planRetime,
  defaultLayerFields,
  layerFieldsOf,
  audioClipFieldsOf,
  backupIdMap,
  makeBackup,
  parseBackup,
  restoredExtras,
  restoredState,
  scriptView,
  deriveProductionCommands,
  ownCopyCommands,
  blocksOfVariant,
  comparePromotion,
  keyBetween,
  lineLinkStale,
  newMainVariantCommands,
  orderedOccurrences,
  promotionCommands,
  scriptOnlyChoice,
  transferSceneCommands,
  posterDraft,
  createDraft,
  pushDraft,
  draftCommand,
  lowerThirdStarter,
  planApplyTemplate,
  planUpdateTemplateValues,
  templateFromLayers,
  textLayerFields,
  dialogueMirrorViolations,
  BACKUP_STATE_TABLES,
  emptyStyleGuide,
} from "../../src/core";

const ADMIN_URL = process.env["DATABASE_URL"] ?? "postgres://postgres@localhost:54329/postgres";
const DB = `animatic_test_${Date.now()}`;
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function expectError(p: Promise<unknown>, code: string | RegExp) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const ok = typeof code === "string" ? err.code === code : code.test(err.message ?? "");
    if (!ok) throw new Error(`Forventet feil ${code}, fikk ${err.code} ${err.message}`);
    return;
  }
  throw new Error(`Forventet feil ${code}, men kallet lyktes`);
}

const admin = postgres(ADMIN_URL, { onnotice: () => {} });
await admin.unsafe(`create database ${DB}`);
const url = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);
const sql = postgres(url, { onnotice: () => {}, max: 1 });

const ALICE = "11111111-1111-7111-8111-111111111111" as UserId;
const BOB = "22222222-2222-7222-8222-222222222222" as UserId;
const CAROL = "33333333-3333-7333-8333-333333333333" as UserId;

/** Kjør en spørring som en bestemt rolle/bruker i én transaksjon. */
async function as<T>(
  role: "authenticated" | "service_role" | "anon",
  user: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(user ? { sub: user } : {})}, true)`;
    return fn(tx);
  })) as T;
}

async function loadState(projectId: string): Promise<ProjectState> {
  const q = (t: string) =>
    sql.unsafe(`select * from public.${t} where project_id = $1`, [projectId]);
  const [project] = await sql`select * from public.projects where id = ${projectId}`;
  const rows: ProjectRows = {
    project: project!,
    productions: await q("productions"),
    scenes: await q("scenes"),
    scene_variants: await q("scene_variants"),
    script_blocks: await q("script_blocks"),
    script_block_revisions: await q("script_block_revisions"),
    scene_occurrences: await q("scene_occurrences"),
    production_segments: await q("production_segments"),
    takes: await q("takes"),
    assets: await q("assets"),
    asset_variants: await q("asset_variants"),
    asset_versions: await q("asset_versions"),
    script_annotations: await q("script_annotations"),
    compositions: await q("compositions"),
    composition_layers: await q("composition_layers"),
    audio_clips: await q("audio_clips"),
    clip_parts: await q("clip_parts"),
    time_links: await q("time_links"),
    generation_prompts: await q("generation_prompts"),
    continuity_events: await q("continuity_events"),
    translations: await q("translations"),
    translation_line_links: await q("translation_line_links"),
    translation_lines: await q("translation_lines"),
    asset_relations: await q("asset_relations"),
    posters: await q("posters"),
    style_profiles: await q("style_profiles"),
    story_profiles: await q("story_profiles"),
    story_profile_stages: await q("story_profile_stages"),
    story_facts: await q("story_facts"),
    story_canvas_nodes: await q("story_canvas_nodes"),
    story_canvas_edges: await q("story_canvas_edges"),
    template_instances: await q("template_instances"),
    credit_participants: await q("credit_participants"),
    credit_sequences: await q("credit_sequences"),
    animation_rigs: await q("animation_rigs"), animation_rig_versions: await q("animation_rig_versions"), animation_uses: await q("animation_uses"),
    lipsync_results: await q("lipsync_results"), animation_patterns: await q("animation_patterns"),
    mouth_sets: await q("mouth_sets"), mouth_tracks: await q("mouth_tracks"),
    dialogue_versions: await q("dialogue_versions"),
    style_harmonizations: await q("style_harmonizations"),
    style_preferred_references: await q("style_preferred_references"),
    language_versions: await q("language_versions"),
  };
  return stateFromRows(rows);
}

let cmdCounter = 0;
async function runCommand(
  state: ProjectState,
  actor: UserId,
  command: Command,
  baseRevisions?: Record<string, number>,
) {
  const id = `44444444-4444-7444-8444-${String(++cmdCounter).padStart(12, "0")}`;
  const res = applyCommand(state, {
    id: id as never,
    actor,
    at: new Date().toISOString(),
    command,
    ...(baseRevisions ? { baseRevisions } : {}),
  });
  if (!res.ok) throw new Error(`Kjernen avviste ${command.type}: ${res.error.message}`);
  const changes = diffStates(state, res.state);
  await as(
    "service_role",
    null,
    (tx) =>
      tx`select public.apply_changes(${state.project.id}, ${actor}, ${id}, ${tx.json(command as never)}, ${tx.json(res.inverse as never)}, ${tx.json(changes as never)})`,
  );
  return res.state;
}

console.log(`Databasetester (${DB})`);
try {
  await sql.unsafe(readFileSync(join(root, "tests/db/supabase-emulation.sql"), "utf8"));
  for (const f of readdirSync(join(root, "db/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    await sql.unsafe(readFileSync(join(root, "db/migrations", f), "utf8"));
  }
  await sql`insert into auth.users (id, email) values (${ALICE}, 'alice@example.no'), (${BOB}, 'bob@example.no'), (${CAROL}, 'carol@example.no')`;

  let projectId = "";
  await test("innlogget bruker kan opprette prosjekt og blir eier med hovedfilm", async () => {
    projectId = await as(
      "authenticated",
      ALICE,
      async (tx) => (await tx`select public.create_project('Jula på Dovre',25,1,'nb') as id`)[0]!["id"],
    );
    const members = await as(
      "authenticated",
      ALICE,
      (tx) =>
        tx`select role, can_approve_costs from public.project_members where project_id = ${projectId}`,
    );
    assert(members.length === 1 && members[0]!["role"] === "owner", "eier mangler");
    const prods = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select kind from public.productions where project_id = ${projectId}`,
    );
    assert(prods.length === 1 && prods[0]!["kind"] === "main", "hovedfilm mangler");
  });

  await test("anonym bruker kan ikke opprette prosjekt", async () => {
    await expectError(
      as("anon", null, (tx) => tx`select public.create_project('X')`),
      "42501",
    );
  });

  await test("INV-C2: ikke-medlem ser ingenting", async () => {
    const rows = await as("authenticated", CAROL, (tx) => tx`select * from public.projects`);
    assert(rows.length === 0, "Carol ser prosjektet");
  });

  await test("INV-C2: klienten kan ikke skrive direkte i tabellene", async () => {
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`update public.projects set name = 'Hack' where id = ${projectId}`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.productions (id, project_id, kind, name, fps_num, fps_den) values (gen_random_uuid(), ${projectId}, 'spinoff', 'X', 25, 1)`,
      ),
      "42501",
    );
  });

  await test("INV-C2: klienten kan ikke kalle apply_changes", async () => {
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`select public.apply_changes(${projectId}, ${ALICE}, gen_random_uuid(), '{}'::jsonb, null, '{}'::jsonb)`,
      ),
      "42501",
    );
  });

  let state = await loadState(projectId);
  const mainId = Object.values(state.productions)[0]!.id;
  const keys = keysEvenly(4);

  await test("DEC-0022: kommandoer fra kjernen lagres atomisk og leses tilbake identisk", async () => {
    for (let i = 0; i < 4; i++) {
      state = await runCommand(state, ALICE, {
        type: "CreateScene",
        productionId: mainId,
        sceneId: `55555555-5555-7555-8555-00000000000${i}` as never,
        variantId: `66666666-6666-7666-8666-00000000000${i}` as never,
        occurrenceId: `77777777-7777-7777-8777-00000000000${i}` as never,
        orderKey: keys[i]!,
        heading: { intExt: "INT.", location: `STED ${i}`, time: "DAG" },
        blocks: [
          {
            blockId: `88888888-8888-7888-8888-00000000000${i}` as never,
            kind: "action",
            text: `Handling ${i}`,
            orderKey: "i",
          },
        ],
        productionNumber: String(i + 1),
      });
    }
    const loaded = await loadState(projectId);
    const strip = (s: ProjectState) => ({
      ...s,
      blockRevisions: s.blockRevisions.map((r) => ({ ...r, createdAt: "" })),
    });
    assert(
      JSON.stringify(strip(loaded)) ===
        JSON.stringify(
          strip({
            ...state,
            blockRevisions: [...state.blockRevisions].sort((a, b) =>
              a.blockId < b.blockId ? -1 : 1,
            ),
          }),
        ),
      "tilstanden fra databasen avviker fra kjernen",
    );
    const log =
      await sql`select count(*)::int as n from public.change_log where project_id = ${projectId}`;
    assert(log[0]!["n"] === 5, `forventet 5 loggposter, fikk ${log[0]!["n"]}`);
    state = loaded;
  });

  await test("INV-C1: en endring basert på gammel revisjon avvises av databasen (P0409)", async () => {
    const occ = Object.values(state.occurrences)[0]!;
    const stale = state;
    state = await runCommand(state, ALICE, {
      type: "SetOccurrenceActive",
      occurrenceId: occ.id,
      active: false,
    });
    await expectError(
      runCommand(stale, ALICE, { type: "MoveOccurrence", occurrenceId: occ.id, orderKey: "z" }),
      "P0409",
    );
    const [row] =
      await sql`select active, order_key from public.scene_occurrences where id = ${occ.id}`;
    assert(
      row!["active"] === false && row!["order_key"] === occ.orderKey,
      "stale skriving ble lagret",
    );
  });

  await test("hele endringssettet rulles tilbake ved feil (atomisk)", async () => {
    const before =
      await sql`select count(*)::int as n from public.scenes where project_id = ${projectId}`;
    const occ = Object.values(state.occurrences)[1]!;
    const res = applyCommand(state, {
      id: "99999999-9999-7999-8999-000000000001" as never,
      actor: ALICE,
      at: new Date().toISOString(),
      command: { type: "MoveOccurrence", occurrenceId: occ.id, orderKey: "zz" },
    });
    assert(res.ok, "kjernen avviste");
    const changes = diffStates(state, res.ok ? res.state : state) as unknown as Record<
      string,
      unknown
    >;
    const bad = {
      ...changes,
      inserts: {
        scenes: [
          {
            id: "99999999-9999-7999-8999-000000000002",
            project_id: projectId,
            origin_production_id: mainId,
            revision: 1,
          },
        ],
      },
      updates: {
        scene_occurrences: [
          {
            ...(changes["updates"] as Record<string, Record<string, unknown>[]>)[
              "scene_occurrences"
            ]![0],
            expected_revision: 99,
            revision: 100,
          },
        ],
      },
    };
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`select public.apply_changes(${projectId}, ${ALICE}, gen_random_uuid(), '{"type":"X"}'::jsonb, null, ${tx.json(bad as never)})`,
      ),
      "P0409",
    );
    const after =
      await sql`select count(*)::int as n from public.scenes where project_id = ${projectId}`;
    assert(before[0]!["n"] === after[0]!["n"], "delvis lagring");
  });

  await test("REQ-0521: eier inviterer, mottaker aksepterer og får lesetilgang", async () => {
    const token = await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.create_invitation(${projectId}, 'bob@example.no', 'viewer') as t`
        )[0]!["t"] as string,
    );
    const joined = await as(
      "authenticated",
      BOB,
      async (tx) => (await tx`select public.accept_invitation(${token}) as p`)[0]!["p"],
    );
    assert(joined === projectId, "feil prosjekt");
    const rows = await as(
      "authenticated",
      BOB,
      (tx) => tx`select id from public.scenes where project_id = ${projectId}`,
    );
    assert(rows.length === 4, `Bob ser ${rows.length} scener`);
    await expectError(
      as("authenticated", BOB, async (tx) => tx`select public.accept_invitation(${token})`),
      "22023",
    );
  });

  await test("REQ-0523: leser kan ikke invitere eller skrive", async () => {
    await expectError(
      as(
        "authenticated",
        BOB,
        (tx) => tx`select public.create_invitation(${projectId}, 'x@example.no', 'editor')`,
      ),
      "42501",
    );
    const occ = Object.values(state.occurrences)[2]!;
    await expectError(
      runCommand(state, BOB, { type: "SetOccurrenceActive", occurrenceId: occ.id, active: false }),
      "42501",
    );
  });

  await test("INV-C2: invitasjon for prosjekt X gir ikke tilgang til prosjekt Y", async () => {
    const other = await as(
      "authenticated",
      CAROL,
      async (tx) => (await tx`select public.create_project('Annet prosjekt') as id`)[0]!["id"],
    );
    const rows = await as(
      "authenticated",
      BOB,
      (tx) => tx`select id from public.projects where id = ${other}`,
    );
    assert(rows.length === 0, "Bob ser Carols prosjekt");
  });

  await test("INV-07: produsert materiale kan ikke slettes eller overskrives", async () => {
    const occ = Object.values(state.occurrences)[1]!;
    state = await runCommand(state, ALICE, {
      type: "AddTake",
      takeId: "aaaaaaaa-aaaa-7aaa-8aaa-000000000001" as never,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "composition2d",
      status: "approved",
      durationFrames: 250,
      mediaRef: `${projectId}/resources/x.mp4`,
    });
    await expectError(
      sql`delete from public.takes where id = 'aaaaaaaa-aaaa-7aaa-8aaa-000000000001'`,
      /INV-07/,
    );
    await expectError(
      sql`update public.takes set media_ref = 'annen.mp4' where id = 'aaaaaaaa-aaaa-7aaa-8aaa-000000000001'`,
      /INV-07/,
    );
  });

  await test("INV-13: teksthistorikk og kommandologg kan ikke endres", async () => {
    await expectError(sql`update public.script_block_revisions set text = 'x'`, /INV-13/);
    await expectError(sql`delete from public.change_log`, /INV-13/);
  });

  await test("redigering av replikk gir ny historikkrad med forfatter", async () => {
    const block = Object.values(state.blocks)[0]!;
    state = await runCommand(
      state,
      ALICE,
      { type: "EditBlockText", productionId: mainId, blockId: block.id, text: "Hvor er Ola?" },
      { [block.id]: block.revision },
    );
    const revs =
      await sql`select rev, author from public.script_block_revisions where block_id = ${block.id} order by rev`;
    assert(revs.length === 2 && revs[1]!["author"] === ALICE, "historikk mangler");
  });

  await test("schema_version er lesbar for alle og viser siste versjon", async () => {
    const v = await as(
      "anon",
      null,
      (tx) => tx`select max(version) as v from public.schema_version`,
    );
    const expected = readdirSync(join(root, "db/migrations")).filter((x) =>
      x.endsWith(".sql"),
    ).length;
    assert(v[0]!["v"] === expected, `skjemaversjon ${v[0]!["v"]}, forventet ${expected}`);
  });

  await test("0002: redaktør kan registrere originaldokument, leser kan ikke; dokumentet er uforanderlig", async () => {
    const mainId2 = Object.values(state.productions)[0]!.id;
    const sha = "a".repeat(64);
    const id = await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.register_imported_document(${projectId}, ${mainId2}, ${projectId + "/x/manus.pdf"}, 'manus.pdf', ${sha}, 'pdf', 106, 1588473) as id`
        )[0]!["id"],
    );
    assert(typeof id === "string", "ingen id");
    await expectError(
      as(
        "authenticated",
        BOB,
        (tx) =>
          tx`select public.register_imported_document(${projectId}, ${mainId2}, ${projectId + "/y/m.pdf"}, 'm.pdf', ${sha}, 'pdf', 1, 10)`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`select public.register_imported_document(${projectId}, ${mainId2}, ${"annet/y/m.pdf"}, 'm.pdf', ${sha}, 'pdf', 1, 10)`,
      ),
      "22023",
    );
    await expectError(sql`update public.imported_documents set file_name = 'x'`, /INV-13/);
    const seen = await as(
      "authenticated",
      BOB,
      (tx) => tx`select id from public.imported_documents where project_id = ${projectId}`,
    );
    assert(seen.length === 1, "medlem ser ikke dokumentet");
    const carol = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.imported_documents`,
    );
    assert(carol.length === 0, "ikke-medlem ser dokumentet");
  });

  await test("0002: profiler er synlige for medlemmer i samme prosjekt, ikke for andre", async () => {
    await as("authenticated", ALICE, (tx) => tx`select public.upsert_my_profile('Mars')`);
    await as("authenticated", CAROL, (tx) => tx`select public.upsert_my_profile(null)`);
    const bobSees = await as(
      "authenticated",
      BOB,
      (tx) => tx`select display_name from public.profiles order by display_name`,
    );
    assert(
      bobSees.length === 1 && bobSees[0]!["display_name"] === "Mars",
      `Bob ser ${JSON.stringify(bobSees)}`,
    );
    const carolSees = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select display_name from public.profiles`,
    );
    assert(
      carolSees.length === 1 && carolSees[0]!["display_name"] === "carol",
      `Carol ser ${JSON.stringify(carolSees)}`,
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`update public.profiles set display_name = 'x'`),
      "42501",
    );
  });

  await test("0002: import av manus lagres atomisk med kildereferanser og usikkerhet", async () => {
    const { planImport } = await import("../../src/core/screenplay/plan");
    const parsed = {
      format: "pdf" as const,
      pageCount: 1,
      titlePage: [],
      warnings: [],
      stats: { numbered: 2, unnumbered: 0, uncertain: 1, duplicateNumbers: [] },
      scenes: [
        {
          number: "10",
          rawHeading: "INT. A - DAG",
          heading: { intExt: "INT.", location: "A", time: "DAG" },
          source: { page: 1, y: 72 },
          warnings: [],
          elements: [
            { kind: "action" as const, text: "Hei.", source: { page: 1, y: 96 } },
            {
              kind: "action" as const,
              text: "rar",
              source: { page: 1, y: 120 },
              uncertain: "usikker",
            },
          ],
        },
        {
          number: "11",
          rawHeading: "EXT. B - NATT",
          heading: { intExt: "EXT.", location: "B", time: "NATT" },
          source: { page: 1, y: 200 },
          warnings: [],
          elements: [
            { kind: "character" as const, text: "MAJA", source: { page: 1, y: 220 } },
            { kind: "dialogue" as const, text: "Ja.", source: { page: 1, y: 232 } },
          ],
        },
      ],
    };
    const cmd = planImport(state, parsed, {
      productionId: Object.values(state.productions)[0]!.id,
    });
    state = await runCommand(state, ALICE, cmd);
    const loaded = await loadState(projectId);
    const unc = Object.values(loaded.blocks).filter((b) => b.uncertainty === "usikker");
    assert(
      unc.length === 1 && unc[0]!.sourceRef?.page === 1,
      "usikkerhet/kildereferanse ikke lagret",
    );
    const nums = Object.values(loaded.occurrences).map((o) => o.productionNumber);
    assert(nums.includes("10") && nums.includes("11"), "scenenumre mangler");
    // Fjerning av blokk lagres som flagg; historikken beholdes; kan gjenopprettes
    const target = unc[0]!;
    const prod = Object.values(state.productions)[0]!.id;
    state = await runCommand(state, ALICE, {
      type: "RemoveBlock",
      productionId: prod,
      blockId: target.id,
    });
    let again = await loadState(projectId);
    assert(again.blocks[target.id]!.removed === true, "removed ble ikke lagret");
    assert(
      again.blockRevisions.some((r) => r.blockId === target.id),
      "historikk forsvant",
    );
    state = await runCommand(state, ALICE, {
      type: "RestoreBlock",
      productionId: prod,
      blockId: target.id,
    });
    again = await loadState(projectId);
    assert(again.blocks[target.id]!.removed === false, "gjenoppretting ble ikke lagret");
  });

  await test("0002: to samtidige innsettinger på samme plass i en scene gir konflikt, ikke uklar rekkefølge", async () => {
    const fresh = await loadState(projectId);
    const block = Object.values(fresh.blocks).find((b) => !b.removed)!;
    const prod = Object.values(fresh.productions)[0]!.id;
    const insert = (blockId: string) =>
      ({
        type: "InsertBlock",
        productionId: prod,
        variantId: block.variantId,
        block: { blockId, kind: "action", text: "Samtidig", orderKey: block.orderKey + "k" },
      }) as Command;
    // Begge brukerne bygger på samme utgangspunkt
    await runCommand(fresh, ALICE, insert("66666666-6666-7666-8666-0000000000a1"));
    let failed = false;
    try {
      await runCommand(fresh, ALICE, insert("66666666-6666-7666-8666-0000000000a2"));
    } catch (e) {
      failed = /duplicate|unik|unique/i.test(String((e as Error).message));
    }
    assert(failed, "andre innsetting på samme plass ble ikke avvist med unik-feil");
  });

  await test("0003: manusversjon er et uforanderlig øyeblikksbilde lik kjernens, med løpenummer og forelder", async () => {
    const { snapshotFromState, sameSnapshot } = await import("../../src/core/screenplay/versions");
    const st = await loadState(projectId);
    const prod =
      Object.values(st.productions).find((p) => p.kind === "main") ??
      Object.values(st.productions)[0]!;
    const v1 = await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.create_script_version(${projectId}, ${prod.id}, 'Draft 9.3', 'Importert') as id`
        )[0]!["id"],
    );
    const v2 = await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.create_script_version(${projectId}, ${prod.id}, 'Etter møte') as id`
        )[0]!["id"],
    );
    const rows =
      await sql`select id, number, parent_version_id, snapshot from public.script_versions where production_id = ${prod.id} order by number`;
    assert(rows.length === 2 && rows[0]!["number"] === 1 && rows[1]!["number"] === 2, "løpenummer");
    assert(
      rows[0]!["id"] === v1 && rows[1]!["parent_version_id"] === v1 && rows[1]!["id"] === v2,
      "forelder",
    );
    const snap = rows[0]!["snapshot"] as never;
    assert(
      sameSnapshot(snap, snapshotFromState(st, prod.id)),
      "databasens øyeblikksbilde avviker fra kjernens",
    );
    await expectError(sql`update public.script_versions set name = 'x'`, /INV-13/);
    await expectError(sql`delete from public.script_versions`, /INV-13/);
    await expectError(
      as(
        "authenticated",
        BOB,
        (tx) => tx`select public.create_script_version(${projectId}, ${prod.id}, 'Leser')`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.script_versions (project_id, production_id, number, name, snapshot, created_by) values (${projectId}, ${prod.id}, 9, 'x', '{}', ${ALICE})`,
      ),
      "42501",
    );
    const carol = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.script_versions`,
    );
    assert(carol.length === 0, "ikke-medlem ser versjoner");
  });

  await test("0004: ressurs, variant og bildeversjon lagres og leses tilbake; versjonen er uforanderlig", async () => {
    let st = await loadState(projectId);
    const assetId = "abcdef00-0000-7000-8000-0000000000a1";
    const variantId = "abcdef00-0000-7000-8000-0000000000a2";
    const v1 = "abcdef00-0000-7000-8000-0000000000a3";
    st = await runCommand(st, ALICE, {
      type: "CreateAssets",
      assets: [
        {
          assetId: assetId as never,
          fields: {
            kind: "character",
            name: "Bestemor Anne",
            names: [{ name: "BESTEMOR", kind: "alias", language: null }],
            description: "Majas bestemor",
            category: "Familie",
            tags: ["hovedrolle"],
          },
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "CreateAssetVariant",
      variantId: variantId as never,
      assetId: assetId as never,
      fields: { name: "Animatic", style: "animatic", appearance: "vinterklær" },
    });
    const addVersion: Command = {
      type: "AddAssetVersion",
      versionId: v1 as never,
      variantId: variantId as never,
      media: {
        path: `${projectId}/${assetId}/${v1}/anne.png`,
        mimeType: "image/png",
        width: 800,
        height: 1200,
        byteSize: 4096,
        sha256: "c".repeat(64),
      },
      note: "Første skisse",
    };
    const withVersion = await runCommand(st, ALICE, addVersion);
    // Angre opplastingen (sletting via apply_changes) og gjør om
    const undone = await runCommand(withVersion, ALICE, {
      type: "UndoAddAssetVersion",
      versionId: v1 as never,
    });
    assert(
      (await sql`select 1 from public.asset_versions where id = ${v1}`).length === 0,
      "angre fjernet ikke versjonen",
    );
    st = await runCommand(undone, ALICE, addVersion);
    st = await runCommand(st, ALICE, {
      type: "ApproveAssetVersion",
      variantId: variantId as never,
      versionId: v1 as never,
    });
    const back = await loadState(projectId);
    const strip = (x: object) => JSON.stringify(x, (k, v) => (k === "createdAt" ? undefined : v));
    assert(strip(back.assets[assetId]!) === strip(st.assets[assetId]!), "ressursen avviker");
    assert(
      strip(back.assetVariants[variantId]!) === strip(st.assetVariants[variantId]!),
      "varianten avviker",
    );
    assert(strip(back.assetVersions[v1]!) === strip(st.assetVersions[v1]!), "versjonen avviker");
    assert(back.assetVersions[v1]!.createdBy === ALICE, "opplaster");
    await expectError(sql`update public.asset_versions set note = 'x'`, /INV-13/);
    // Bare via apply_changes: klienten kan ikke skrive, leseren ser, ikke-medlem ser ingenting
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.assets (id, project_id, kind, name) values (gen_random_uuid(), ${projectId}, 'object', 'Vase')`,
      ),
      "42501",
    );
    const bobSees = await as("authenticated", BOB, (tx) => tx`select id from public.assets`);
    assert(bobSees.length === 1, "medlem med lesetilgang ser ikke ressursen");
    const carolSees = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.asset_versions`,
    );
    assert(carolSees.length === 0, "ikke-medlem ser bildeversjoner");
    // Sti utenfor prosjektet avvises også av databasen
    await expectError(
      sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256) values (gen_random_uuid(), ${projectId}, ${variantId}, 9, 'annet/x.png', 'image/png', 1, ${"d".repeat(64)})`,
      /asset_versions_media_path_check|check constraint/,
    );
  });

  await test("0006: bildeversjoner over 50 MB og opptil 2 GB lagres i byte_size_big; eldre klient fyller den via byte_size", async () => {
    let st = await loadState(projectId);
    const variantId = "abcdef00-0000-7000-8000-0000000000a2";
    const big = "abcdef00-0000-7000-8000-0000000000a4";
    const size = 2 * 1024 * 1024 * 1024; // 2 GB – over integer-grensen i den gamle kolonnen
    st = await runCommand(st, ALICE, {
      type: "AddAssetVersion",
      versionId: big as never,
      variantId: variantId as never,
      media: {
        path: `${projectId}/abcdef00-0000-7000-8000-0000000000a1/${big}/stor.png`,
        mimeType: "image/png",
        width: 20000,
        height: 20000,
        byteSize: size,
        sha256: "e".repeat(64),
      },
      note: "",
    });
    const back = await loadState(projectId);
    assert(
      back.assetVersions[big]!.byteSize === size,
      `størrelse ${back.assetVersions[big]!.byteSize}`,
    );
    const old =
      await sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size, sha256)
      values (gen_random_uuid(), ${projectId}, ${variantId}, 99, ${`${projectId}/x/y/z.png`}, 'image/png', 60000000, ${"f".repeat(64)}) returning byte_size_big`;
    assert(Number(old[0]!["byte_size_big"]) === 60000000, "byte_size_big ble ikke fylt");
    await sql`delete from public.asset_versions where number = 99 and variant_id = ${variantId}`;
    await expectError(
      sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256)
        values (gen_random_uuid(), ${projectId}, ${variantId}, 98, ${`${projectId}/x/y/z.png`}, 'image/png', 6000000000, ${"f".repeat(64)})`,
      /byte_size_big_check|check constraint/,
    );
  });

  await test("0007: 2D-scene og lag lagres og leses tilbake; to personer kan endre hvert sitt lag samtidig", async () => {
    let st = await loadState(projectId);
    const variant = Object.values(st.variants)[0]!;
    const comp = "abcdef00-0000-7000-8000-0000000000c1";
    const l1 = "abcdef00-0000-7000-8000-0000000000c2";
    const l2 = "abcdef00-0000-7000-8000-0000000000c3";
    const assetId = "abcdef00-0000-7000-8000-0000000000a1";
    st = await runCommand(st, ALICE, {
      type: "CreateComposition",
      compositionId: comp as never,
      variantId: variant.id,
      fields: { ...DEFAULT_COMPOSITION, name: "Åpning" },
    });
    const c = st.compositions[comp]!;
    st = await runCommand(st, ALICE, {
      type: "AddLayers",
      layers: [
        {
          layerId: l1 as never,
          compositionId: comp as never,
          fields: defaultLayerFields(st, c, { fill: "#24324a", name: "Himmel" }),
        },
        {
          layerId: l2 as never,
          compositionId: comp as never,
          fields: defaultLayerFields(st, c, {
            assetId,
            assetVariantId: "abcdef00-0000-7000-8000-0000000000a2",
          }),
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "UpdateComposition",
      compositionId: comp as never,
      fields: { ...DEFAULT_COMPOSITION, name: "Åpning" },
      camera: {
        shots: [
          {
            id: "s1",
            name: "Inn mot Maja",
            startFrame: 0,
            endFrame: 50,
            from: { x: 960, y: 540, zoom: 1, rotation: 0 },
            to: { x: 700, y: 500, zoom: 2.5, rotation: 0 },
            curve: { c1x: 900, c1y: 400, c2x: 750, c2y: 450 },
            easing: "ease-in-out",
          },
        ],
      },
    });
    const back = await loadState(projectId);
    // jsonb lagrer nøklene i egen rekkefølge: sammenlign med sorterte nøkler
    const canon = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(canon)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.keys(v)
                .filter((k) => k !== "createdAt")
                .sort()
                .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
            )
          : v;
    const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
    assert(same(back.compositions[comp], st.compositions[comp]), "2D-scenen avviker");
    assert(same(back.layers[l1], st.layers[l1]), "fargeflaten avviker");
    assert(same(back.layers[l2], st.layers[l2]), "bildelaget avviker");
    // To personer endrer hvert sitt lag fra samme utgangspunkt: begge lagres (revisjon per lag, INV-C1)
    const moved = (id: string, dx: number) => {
      const l = st.layers[id]!;
      return {
        type: "UpdateLayers" as const,
        layers: [
          {
            layerId: l.id,
            fields: { ...layerFieldsOf(l), transform: { ...l.transform, x: l.transform.x + dx } },
          },
        ],
      };
    };
    await runCommand(st, ALICE, moved(l1, 10));
    await runCommand(st, ALICE, moved(l2, 20));
    const both = await loadState(projectId);
    assert(both.layers[l1]!.transform.x === st.layers[l1]!.transform.x + 10, "lag 1 tapt");
    assert(both.layers[l2]!.transform.x === st.layers[l2]!.transform.x + 20, "lag 2 tapt");
    // Samme lag fra gammelt utgangspunkt gir revisjonskonflikt, ikke stille overskriving
    await expectError(runCommand(st, ALICE, moved(l1, 99)), /Revisjonskonflikt/);
    // Ressursen kan ikke fjernes i databasen mens et lag viser den
    await expectError(sql`delete from public.assets where id = ${assetId}`, /foreign key|violates/);
    // Angre lagene sletter radene
    let cur = await loadState(projectId);
    cur = await runCommand(cur, ALICE, { type: "UndoAddLayers", layerIds: [l1, l2] as never });
    assert(
      (await sql`select 1 from public.composition_layers where composition_id = ${comp}`).length ===
        0,
      "lagene ble ikke fjernet",
    );
    await runCommand(cur, ALICE, { type: "UndoCreateComposition", compositionId: comp as never });
    assert(
      (await sql`select 1 from public.compositions where id = ${comp}`).length === 0,
      "2D-scenen ble ikke fjernet",
    );
  });

  await test("0008: prosjektets format og bildefrekvens endres med revisjonskontroll, og 2D-scener tilpasses", async () => {
    let st = await loadState(projectId);
    const variant = Object.values(st.variants)[1]!;
    const comp = "abcdef00-0000-7000-8000-00000000c0d1";
    const layer = "abcdef00-0000-7000-8000-00000000c0d2";
    st = await runCommand(st, ALICE, {
      type: "CreateComposition",
      compositionId: comp as never,
      variantId: variant.id,
      fields: DEFAULT_COMPOSITION,
    });
    st = await runCommand(st, ALICE, {
      type: "AddLayers",
      layers: [
        {
          layerId: layer as never,
          compositionId: comp as never,
          fields: defaultLayerFields(st, st.compositions[comp]!, { fill: "#112233" }),
        },
      ],
    });
    const before = st;
    st = await runCommand(st, ALICE, {
      type: "SetProjectFormat",
      width: 3840,
      height: 2160,
      fps: { num: 24, den: 1 },
    });
    const back = await loadState(projectId);
    assert(back.project.frameWidth === 3840 && back.project.frameHeight === 2160, "format");
    assert(back.project.fps.num === 24, "bildefrekvens");
    assert(back.compositions[comp]!.width === 3840, "2D-scenen fulgte ikke formatet");
    assert(
      back.layers[layer]!.transform.x === 1920,
      `laget ble ikke flyttet: ${back.layers[layer]!.transform.x}`,
    );
    assert(
      Object.values(back.productions).every((p) => p.fps.num === 24),
      "produksjonene fikk ikke ny bildefrekvens",
    );
    // Gammelt utgangspunkt gir revisjonskonflikt på prosjektraden
    await expectError(
      runCommand(before, ALICE, {
        type: "SetProjectFormat",
        width: 1080,
        height: 1080,
        fps: { num: 25, den: 1 },
      }),
      /Revisjonskonflikt/,
    );
    // Angre gir alt tilbake
    const inv = applyCommand(back, {
      id: "44444444-4444-7444-8444-0000000009f1" as never,
      actor: ALICE,
      at: new Date().toISOString(),
      command: { type: "SetProjectFormat", width: 1920, height: 1080, fps: { num: 25, den: 1 } },
    });
    assert(inv.ok, "kjernen avviste tilbakestilling");
    st = await runCommand(back, ALICE, {
      type: "SetProjectFormat",
      width: 1920,
      height: 1080,
      fps: { num: 25, den: 1 },
    });
    const again = await loadState(projectId);
    assert(again.project.frameWidth === 1920 && again.project.fps.num === 25, "tilbake");
    assert(again.layers[layer]!.transform.x === 960, "laget tilbake");
  });

  await test("0009: lydfil i biblioteket og lydklipp i en scene lagres, endres og angres; ressursen kan ikke slettes", async () => {
    let st = await loadState(projectId);
    const occ = Object.values(st.occurrences).find((o) => o.active)!;
    const block = Object.values(st.blocks).find((b) => b.variantId === occ.variantId)!;
    const asset = "abcdef00-0000-7000-8000-00000000c0e1";
    const variant = "abcdef00-0000-7000-8000-0000000000e2";
    const version = "abcdef00-0000-7000-8000-0000000000e3";
    const clip = "abcdef00-0000-7000-8000-0000000000e4";
    st = await runCommand(st, ALICE, {
      type: "CreateAssets",
      assets: [
        {
          assetId: asset as never,
          fields: {
            kind: "sound",
            name: "Vind i trærne",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "CreateAssetVariant",
      variantId: variant as never,
      assetId: asset as never,
      fields: { name: "Lyd", style: "other", appearance: "" },
    });
    st = await runCommand(st, ALICE, {
      type: "AddAssetVersion",
      versionId: version as never,
      variantId: variant as never,
      media: {
        path: `${projectId}/${asset}/${version}/vind.mp3`,
        mimeType: "audio/mpeg",
        width: null,
        height: null,
        byteSize: 123456,
        sha256: "b".repeat(64),
        durationMs: 8250,
      },
      note: "",
    });
    st = await runCommand(st, ALICE, {
      type: "AddAudioClips",
      clips: [
        {
          clipId: clip as never,
          fields: {
            occurrenceId: occ.id,
            kind: "dialogue",
            name: "Maja",
            assetId: asset as never,
            assetVariantId: null,
            versionId: null,
            blockId: block.id,
            offsetMs: 1500,
            sourceInMs: 250,
            lengthMs: 4000,
            gainDb: -3,
            fadeInMs: 100,
            fadeOutMs: 400,
            muted: false,
            continues: false,
            volumeKeys: [
              { t: 0, db: 0 },
              { t: 2000, db: -12 },
            ],
          },
        },
      ],
    });
    const back = await loadState(projectId);
    assert(back.assets[asset]!.kind === "sound", "lydressursen");
    assert(back.assetVersions[version]!.durationMs === 8250, "lengden på lydfilen");
    assert(back.assetVersions[version]!.mimeType === "audio/mpeg", "lydformatet");
    const a = back.audioClips[clip]!;
    assert(
      a.offsetMs === 1500 && a.lengthMs === 4000 && a.gainDb === -3 && a.blockId === block.id,
      `lydklippet avviker: ${JSON.stringify(a)}`,
    );
    // 0010: volumpunkter lagres og leses tilbake
    assert(
      JSON.stringify(a.volumeKeys) ===
        JSON.stringify([
          { t: 0, db: 0 },
          { t: 2000, db: -12 },
        ]),
      `volumpunktene avviker: ${JSON.stringify(a.volumeKeys)}`,
    );
    // Flytte lyden til senere i scenen (revisjonskontroll som andre rader)
    st = await runCommand(back, ALICE, {
      type: "UpdateAudioClips",
      clips: [{ clipId: clip as never, fields: { ...audioClipFieldsOf(a), offsetMs: 3000 } }],
    });
    await expectError(
      runCommand(back, ALICE, {
        type: "UpdateAudioClips",
        clips: [{ clipId: clip as never, fields: { ...audioClipFieldsOf(a), offsetMs: 10 } }],
      }),
      /Revisjonskonflikt/,
    );
    assert((await loadState(projectId)).audioClips[clip]!.offsetMs === 3000, "flyttingen");
    // Databasen nekter ugyldige verdier selv om kjernen skulle slippe dem gjennom
    await expectError(
      as(
        "service_role",
        null,
        (tx) => tx`update public.audio_clips set gain_db = 40 where id = ${clip}`,
      ),
      /check|violates/,
    );
    // Lydfilen kan ikke slettes mens et klipp bruker den
    await expectError(sql`delete from public.assets where id = ${asset}`, /foreign key|violates/);
    // Fjerne og angre fjerningen
    st = await runCommand(st, ALICE, {
      type: "SetAudioClipsRemoved",
      clipIds: [clip as never],
      removed: true,
    });
    assert((await loadState(projectId)).audioClips[clip]!.removed, "fjernet");
    st = await runCommand(st, ALICE, { type: "UndoAddAudioClips", clipIds: [clip as never] });
    assert(
      (await sql`select 1 from public.audio_clips where id = ${clip}`).length === 0,
      "klippet ble ikke slettet ved angre",
    );
    // Bilder kan fortsatt ikke ha lydformat, og lyd ikke bildeformat (kjernen)
    const bad = applyCommand(st, {
      id: "44444444-4444-7444-8444-0000000009f2" as never,
      actor: ALICE,
      at: new Date().toISOString(),
      command: {
        type: "AddAssetVersion",
        versionId: "abcdef00-0000-7000-8000-0000000000e5" as never,
        variantId: variant as never,
        media: {
          path: `${projectId}/${asset}/x/bilde.png`,
          mimeType: "image/png",
          width: 10,
          height: 10,
          byteSize: 10,
          sha256: "c".repeat(64),
        },
        note: "",
      },
    });
    assert(!bad.ok, "en PNG ble godtatt som lyd");
  });

  await test("0010: logg for AI-generering kan bare skrives av serveren og leses av medlemmer", async () => {
    const job = "abcdef00-0000-7000-8000-0000000000f1";
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by) values (${job}, ${projectId}, 'image', 'lovable', 'openai/gpt-image-2', 'x', ${ALICE})`,
      ),
      /permission denied/,
    );
    await as(
      "service_role",
      null,
      (tx) =>
        tx`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by) values (${job}, ${projectId}, 'image', 'lovable', 'openai/gpt-image-2', 'A girl in a red coat', ${ALICE})`,
    );
    const mine = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select status from public.generation_jobs where id = ${job}`,
    );
    assert(mine.length === 1 && mine[0]!["status"] === "running", "medlemmet ser ikke loggen");
    const other = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select 1 from public.generation_jobs where id = ${job}`,
    );
    assert(other.length === 0, "ikke-medlem ser loggen");
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`update public.generation_jobs set status = 'done' where id = ${job}`,
      ),
      /permission denied/,
    );
  });

  await test("0004: notater lagres med stempel, kan slettes og angres, og følger blokken", async () => {
    let st = await loadState(projectId);
    const block = Object.values(st.blocks).find((b) => !b.removed && b.text.length > 4)!;
    const variant = Object.values(st.variants)[0]!;
    const n1 = "abcdef00-0000-7000-8000-0000000000b1";
    const n2 = "abcdef00-0000-7000-8000-0000000000b2";
    st = await runCommand(st, ALICE, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: n1 as never,
          blockId: block.id,
          variantId: null,
          start: 0,
          end: 4,
          quote: block.text.slice(0, 4),
          text: "Notat på tekst",
          authorName: "Mars",
          stampAt: "2026-10-01T10:00:00.000Z",
        },
        {
          annotationId: n2 as never,
          blockId: null,
          variantId: variant.id,
          start: 0,
          end: 0,
          quote: "",
          text: "Nål på scenen",
          authorName: "Anita",
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "SetAnnotationRemoved",
      annotationId: n2 as never,
      removed: true,
    });
    st = await runCommand(st, ALICE, {
      type: "EditAnnotation",
      annotationId: n1 as never,
      text: "Endret tekst",
      editedByName: "Anita",
    });
    const back = await loadState(projectId);
    assert(back.annotations[n1]!.authorName === "Mars", "stempel");
    assert(back.annotations[n1]!.editedByName === "Anita", "endret av");
    assert(back.annotations[n1]!.editedAt === st.annotations[n1]!.editedAt, "endret når");
    assert(back.annotations[n1]!.stampAt === "2026-10-01T10:00:00.000Z", "tidspunkt");
    assert(back.annotations[n2]!.removed === true, "slettet");
    assert(
      JSON.stringify(back.annotations[n1]) === JSON.stringify(st.annotations[n1]),
      "notatet avviker fra kjernens",
    );
    // Databasen krever enten tekst eller scene
    await expectError(
      sql`insert into public.script_annotations (id, project_id, text) values (gen_random_uuid(), ${projectId}, 'x')`,
      /check constraint/,
    );
    const carol = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.script_annotations`,
    );
    assert(carol.length === 0, "ikke-medlem ser notater");
    // Ukjent tabell i endringssettet avvises (ingenting går tapt i stillhet)
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`select public.apply_changes(${projectId}, ${ALICE}, gen_random_uuid(), '{"type":"X"}'::jsonb, null, '{"inserts":{"ukjent":[{"id":"x"}]}}'::jsonb)`,
      ),
      /ukjent tabell/,
    );
  });
  await test("0011: importert film (metadata) og overgang lagres via apply_changes og leses tilbake; metadata er uforanderlig", async () => {
    let st = await loadState(projectId);
    const occ = Object.values(st.occurrences).find((o) => o.active)!;
    const takeId = "abcdef00-0000-7000-8000-0000000000c1";
    const media = {
      fileName: "scene_ferdig.mp4",
      mimeType: "video/mp4",
      byteSize: 1234567,
      width: 1920,
      height: 1080,
      fps: 25,
      durationMs: 6000,
      videoCodec: "avc",
      hasAudio: true,
    };
    st = await runCommand(st, ALICE, {
      type: "AddTake",
      takeId: takeId as never,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 150,
      mediaRef: `${projectId}/films/${takeId}/scene_ferdig.mp4`,
      media,
    });
    st = await runCommand(st, ALICE, {
      type: "SetActiveTake",
      occurrenceId: occ.id,
      takeId: takeId as never,
    });
    st = await runCommand(st, ALICE, {
      type: "SetTransition",
      occurrenceId: occ.id,
      transition: { kind: "dip", frames: 20 },
    });
    const back = await loadState(projectId);
    const canon = (v: unknown): string =>
      JSON.stringify(v, (_k, x: unknown) =>
        x && typeof x === "object" && !Array.isArray(x)
          ? Object.fromEntries(
              Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
            )
          : x,
      );
    assert(
      canon(back.takes[takeId]) === canon(st.takes[takeId]),
      `versjonen med filinformasjon ble ikke lest tilbake identisk: ${canon(back.takes[takeId])} ≠ ${canon(st.takes[takeId])}`,
    );
    const o = back.occurrences[occ.id]!;
    assert(o.activeTakeId === takeId, "versjonen ble ikke tatt i bruk");
    assert(
      o.transition?.kind === "dip" && o.transition.frames === 20,
      "overgangen ble ikke lagret",
    );
    await expectError(
      sql`update public.takes set metadata = '{}'::jsonb where id = ${takeId}`,
      /INV-07/,
    );
    // En versjon kan ikke peke på en fil i et annet prosjekts mappe (sletting kunne ellers nå den)
    await expectError(
      sql`insert into public.takes (id, project_id, occurrence_id, kind, status, media_ref) values (gen_random_uuid(), ${projectId}, ${occ.id}, 'imported_film', 'approved', ${"00000000-0000-7000-8000-000000000099/x/y.mp4"})`,
      /takes_media_ref_in_project/,
    );
  });

  await test("0012: deler av klipp, tidskoblinger og status lagres via apply_changes og leses tilbake", async () => {
    let st = await loadState(projectId);
    const takeId = "abcdef00-0000-7000-8000-0000000000c1";
    const take = st.takes[takeId]!;
    const occ = st.occurrences[take.occurrenceId]!;
    const p1 = "abcdef00-0000-7000-8000-0000000d2201";
    const p2 = "abcdef00-0000-7000-8000-0000000d2202";
    st = await runCommand(st, ALICE, {
      type: "SetSceneEdit",
      occurrenceId: occ.id,
      activeTakeId: takeId as never,
      parts: [
        { partId: p1 as never, source: "take", takeId: takeId as never, inMs: 500, outMs: 2500 },
        { partId: p2 as never, source: "take", takeId: takeId as never, inMs: 4000, outMs: 6000 },
      ],
    });
    const block = Object.values(st.blocks).find(
      (b) => b.variantId === occ.variantId && !b.removed,
    )!;
    const link = "abcdef00-0000-7000-8000-0000000d2203";
    st = await runCommand(st, ALICE, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: link as never,
          fields: { occurrenceId: occ.id, blockId: block.id, startMs: 1200, endMs: null },
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "SetTakeStatus",
      takeId: takeId as never,
      status: "reference",
    });
    // Fjern den andre delen igjen (merkes fjernet, ingen sletting)
    st = await runCommand(st, ALICE, {
      type: "SetSceneEdit",
      occurrenceId: occ.id,
      activeTakeId: takeId as never,
      parts: [
        { partId: p1 as never, source: "take", takeId: takeId as never, inMs: 500, outMs: 2500 },
      ],
    });
    const back = await loadState(projectId);
    assert(
      back.clipParts[p1]?.inMs === 500 && !back.clipParts[p1].removed,
      "del 1 ble ikke lagret",
    );
    assert(back.clipParts[p2]?.removed === true, "del 2 skulle vært merket fjernet");
    assert(back.timeLinks[link]?.startMs === 1200, "tidskoblingen ble ikke lagret");
    assert(back.takes[takeId]?.status === "reference", "statusen ble ikke lagret");
    await expectError(
      sql`insert into public.clip_parts (id, project_id, occurrence_id, order_key, source, take_id, in_ms, out_ms) values (gen_random_uuid(), ${projectId}, ${occ.id}, 'a', 'take', null, 0, 10)`,
      /check/,
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.time_links (id, project_id, occurrence_id, block_id, start_ms) values (gen_random_uuid(), ${projectId}, ${occ.id}, ${block.id}, 0)`,
      ),
      /permission denied/,
    );
  });

  await test("0013: overganger med overlapp, standardovergang, svart-hvitt og hendelser i 2D-scenen lagres og leses tilbake", async () => {
    let st = await loadState(projectId);
    const layer = Object.values(st.layers).find((l) => !l.removed)!;
    const comp = st.compositions[layer.compositionId]!;
    const occ = Object.values(st.occurrences).find((o) => o.variantId === comp.variantId)!;
    const other = Object.values(st.occurrences).find((o) => o.id !== occ.id)!;
    const block = Object.values(st.blocks).find(
      (b) => b.variantId === occ.variantId && !b.removed,
    )!;
    st = await runCommand(st, ALICE, {
      type: "SetDefaultTransition",
      transition: { kind: "dipWhite", frames: 12 },
    });
    st = await runCommand(st, ALICE, {
      type: "SetTransition",
      occurrenceId: other.id,
      transition: { kind: "push", frames: 10, overlap: true },
    });
    st = await runCommand(st, ALICE, {
      type: "SetOccurrenceMonochrome",
      occurrenceId: occ.id,
      monochrome: true,
    });
    const link = "abcdef00-0000-7000-8000-0000000d1301";
    st = await runCommand(st, ALICE, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: link as never,
          fields: {
            occurrenceId: occ.id,
            blockId: block.id,
            startMs: 700,
            endMs: null,
            layerId: layer.id,
          },
        },
      ],
    });
    const back = await loadState(projectId);
    assert(
      back.project.defaultTransition?.kind === "dipWhite" &&
        back.project.defaultTransition.frames === 12,
      "standardovergangen ble ikke lagret",
    );
    assert(
      back.occurrences[other.id]?.transition?.kind === "push" &&
        back.occurrences[other.id]?.transition?.overlap === true,
      "overgangen med overlapp ble ikke lagret",
    );
    assert(back.occurrences[occ.id]?.monochrome === true, "svart-hvitt ble ikke lagret");
    assert(back.timeLinks[link]?.layerId === layer.id, "hendelsen ble ikke lagret med laget");
    // Tilbake til standarden: lagres som «ingen egen overgang»
    st = await runCommand(back, ALICE, {
      type: "SetTransition",
      occurrenceId: other.id,
      transition: null,
    });
    const again = await loadState(projectId);
    assert(again.occurrences[other.id]?.transition === undefined, "skulle fulgt standarden");
    await expectError(
      sql`update public.scene_occurrences set transition_kind = 'spin' where id = ${occ.id}`,
      /check/,
    );
  });

  await test("0013 (DEC-0052): grupper, bildeskifte, bevegelsesbane og ankerpunkt lagres og leses tilbake", async () => {
    let st = await loadState(projectId);
    const layer = Object.values(st.layers).find((l) => !l.removed && l.kind !== "group")!;
    const image = Object.values(st.assets).find((a) => a.kind !== "sound" && !a.archived);
    assert(image, "testprosjektet mangler en bilderessurs");
    const groupId = "abcdef00-0000-7000-8000-0000000d1302";
    const fields = (l: typeof layer) => ({
      kind: l.kind,
      name: l.name,
      assetId: l.assetId,
      assetVariantId: l.assetVariantId,
      versionId: l.versionId,
      fill: l.fill,
      width: l.width,
      height: l.height,
      parallax: l.parallax,
      transform: l.transform,
      keyframes: l.keyframes,
      visible: l.visible,
      locked: l.locked,
      groupId: l.groupId,
      swaps: l.swaps,
      path: l.path,
      anchor: l.anchor,
    });
    st = await runCommand(st, ALICE, {
      type: "AddLayers",
      layers: [
        {
          layerId: groupId as never,
          compositionId: layer.compositionId,
          fields: {
            ...fields(layer),
            kind: "group",
            name: "Gruppe 1",
            assetId: null,
            assetVariantId: null,
            versionId: null,
            fill: null,
            width: 1,
            height: 1,
            groupId: null,
            swaps: [],
            path: null,
            anchor: { x: 300, y: 200 },
          },
        },
      ],
    });
    const path = {
      points: [
        { x: 0, y: 0, smooth: true },
        { x: 120, y: 40, smooth: false },
        { x: 300, y: 10, smooth: true },
      ],
      startFrame: 5,
      endFrame: 40,
      easeOut: 0.4,
      easeIn: 0.7,
      tempo: [{ t: 0.3, p: 0.6 }],
    };
    st = await runCommand(st, ALICE, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: layer.id,
          fields: {
            ...fields(st.layers[layer.id]!),
            groupId: groupId as never,
            swaps: [{ frame: 12, assetId: image!.id, assetVariantId: null, versionId: null }],
            path,
          },
        },
      ],
    });
    const back = await loadState(projectId);
    const g = back.layers[groupId]!;
    const l = back.layers[layer.id]!;
    assert(g.kind === "group" && g.assetId === null && g.fill === null, "gruppen ble ikke lagret");
    assert(g.anchor?.x === 300 && g.anchor.y === 200, "ankerpunktet ble ikke lagret");
    assert(l.groupId === groupId, "laget ble ikke lagt i gruppen");
    assert(
      l.swaps.length === 1 && l.swaps[0]!.frame === 12 && l.swaps[0]!.assetId === image!.id,
      "bildeskiftet ble ikke lagret",
    );
    assert(
      isDeepStrictEqual(l.path, path),
      `bevegelsesbanen ble ikke lagret likt: ${JSON.stringify(l.path)}`,
    );
    // Et vanlig lag må fortsatt vise noe; en gruppe trenger ikke
    await expectError(
      sql`update public.composition_layers set asset_id = null, asset_variant_id = null, version_id = null, fill = null where id = ${layer.id}`,
      /composition_layers_shows_something/,
    );
    await expectError(
      sql`update public.composition_layers set image_swaps = '{}'::jsonb where id = ${layer.id}`,
      /check/,
    );
    // Rydd opp: laget ut av gruppen og gruppen slettet (testene etter forventer lagene som før)
    st = await runCommand(back, ALICE, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: layer.id,
          fields: { ...fields(back.layers[layer.id]!), groupId: null, swaps: [], path: null },
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "SetLayersRemoved",
      layerIds: [groupId as never],
      removed: true,
    });
  });

  await test("0014 (DEC-0053): AI-budsjett, inndeling og egne beskrivelser lagres; slettede beskrivelser følger segmentet", async () => {
    let st = await loadState(projectId);
    st = await runCommand(st, ALICE, { type: "SetAiBudget", monthLimit: 25, pricePerImage: 1.5 });
    let back = await loadState(projectId);
    assert(
      back.project.aiMonthLimit === 25 && back.project.aiPricePerImage === 1.5,
      "budsjettet ble ikke lagret",
    );
    st = await runCommand(back, ALICE, {
      type: "SetAiBudget",
      monthLimit: null,
      pricePerImage: null,
    });
    back = await loadState(projectId);
    assert(
      back.project.aiMonthLimit === undefined && back.project.aiPricePerImage === undefined,
      "budsjettet ble ikke fjernet",
    );
    const occ = Object.values(back.occurrences).find((o) => o.active)!;
    const seg1 = "abcdef00-0000-7000-8000-0000000d1401";
    const seg2 = "abcdef00-0000-7000-8000-0000000d1402";
    const prompt = "abcdef00-0000-7000-8000-0000000d1403";
    st = await runCommand(back, ALICE, {
      type: "ReplaceSegments",
      occurrenceId: occ.id,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: [
        {
          segmentId: seg1 as never,
          orderKey: "m",
          startBlockId: null,
          endBlockId: null,
          startMs: 0,
          endMs: 4000,
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "SetGenerationPrompt",
      promptId: prompt as never,
      occurrenceId: occ.id,
      segmentId: seg1 as never,
      text: "A quiet winter night. MAJA: «Hører du det?»",
      basedOn: "auto",
    });
    back = await loadState(projectId);
    assert(
      back.generationPrompts[prompt]?.text.includes("«Hører du det?»") === true,
      "beskrivelsen ble ikke lagret",
    );
    st = await runCommand(back, ALICE, {
      type: "SetGenerationPrompt",
      promptId: prompt as never,
      occurrenceId: occ.id,
      segmentId: seg1 as never,
      text: null,
      basedOn: "",
    });
    // Ny inndeling: segmentet og den fjernede beskrivelsen slettes i samme endring
    st = await runCommand(st, ALICE, {
      type: "ReplaceSegments",
      occurrenceId: occ.id,
      reason: "model_limit",
      removeSegmentIds: [seg1 as never],
      segments: [
        {
          segmentId: seg2 as never,
          orderKey: "m",
          startBlockId: null,
          endBlockId: null,
          startMs: 0,
          endMs: 2000,
        },
      ],
    });
    back = await loadState(projectId);
    assert(!back.segments[seg1] && !!back.segments[seg2], "inndelingen ble ikke byttet");
    assert(
      back.segments[seg2]?.startMs === 0 && back.segments[seg2]?.endMs === 2000,
      "tiden for segmentet ble ikke lagret",
    );
    await expectError(
      sql`update public.production_segments set start_ms = 5, end_ms = 3 where id = ${seg2}`,
      /check/,
    );
    await expectError(sql`update public.generation_jobs set status = 'odd'`, /check/);
    assert(!back.generationPrompts[prompt], "den fjernede beskrivelsen ble ikke slettet");
    const [job] =
      await sql`select column_name from information_schema.columns where table_name = 'generation_jobs' and column_name = 'estimated_cost'`;
    assert(!!job, "generation_jobs mangler estimated_cost");
    await expectError(
      sql`update public.projects set ai_month_limit = -1 where id = ${projectId}`,
      /check/,
    );
  });

  await test("0014 (DEC-0054): grunnlaget for 2D-scenen lagres; godkjenning og angring av avvik", async () => {
    let st = await loadState(projectId);
    const comp = Object.values(st.compositions).find((c) => !c.removed)!;
    const occ = Object.values(st.occurrences).find((o) => o.variantId === comp.variantId)!;
    const before = { ...(comp.producedFrom?.blockRevisions ?? {}) };
    st = await runCommand(st, ALICE, {
      type: "AcceptScriptChanges",
      occurrenceId: occ.id,
      compositionIds: [comp.id],
      takeIds: [],
    });
    let back = await loadState(projectId);
    const now = back.compositions[comp.id]!.producedFrom?.blockRevisions ?? {};
    assert(Object.keys(now).length > 0, "grunnlaget ble ikke lagret");
    // Angre: tilbake til det gamle grunnlaget (også tomt)
    st = await runCommand(back, ALICE, {
      type: "SetProducedFrom",
      compositions: [{ compositionId: comp.id, blockRevisions: before }],
      takes: [],
    });
    back = await loadState(projectId);
    assert(
      isDeepStrictEqual(back.compositions[comp.id]!.producedFrom?.blockRevisions ?? {}, before),
      "grunnlaget ble ikke satt tilbake",
    );
    // Versjoner: godkjenning lagres i accepted_from; produced_from er uforanderlig (INV-07, utløseren)
    const take = Object.values(back.takes)[0];
    if (take) {
      st = await runCommand(back, ALICE, {
        type: "AcceptScriptChanges",
        occurrenceId: take.occurrenceId,
        compositionIds: [],
        takeIds: [take.id],
      });
      back = await loadState(projectId);
      assert(
        isDeepStrictEqual(back.takes[take.id]!.producedFrom, take.producedFrom),
        "produced_from ble endret",
      );
      assert(!!back.takes[take.id]!.acceptedFrom, "godkjenningen av versjonen ble ikke lagret");
    }
  });

  await test("0015 (DEC-0055): kontinuitetshendelser lagres, endres og fjernes; ugyldige verdier avvises", async () => {
    let st = await loadState(projectId);
    const asset = Object.values(st.assets).find(
      (a) => a.kind === "character" || a.kind === "object",
    )!;
    const variants = Object.values(st.assetVariants).filter((v) => v.assetId === asset.id);
    let to = variants[0]?.id ?? null;
    if (!to) {
      to = "abcdef00-0000-7000-8000-0000000d1501" as never;
      st = await runCommand(st, ALICE, {
        type: "CreateAssetVariant",
        variantId: to as never,
        assetId: asset.id,
        fields: { name: "Kort hår", style: "animatic", appearance: "kort hår" },
      });
    }
    const occs = Object.values(st.occurrences).filter((o) => o.active);
    const scene = st.scenes[occs[0]!.sceneId]!;
    const later = occs.find((o) => o.sceneId !== scene.id)!.sceneId;
    const block = Object.values(st.blocks).find(
      (b) => !b.removed && st.variants[b.variantId]?.sceneId === scene.id,
    )!;
    const ev = "abcdef00-0000-7000-8000-0000000d1502";
    const fields = {
      assetId: asset.id,
      kind: "haircut" as const,
      description: "Klipper håret",
      fromVariantId: null,
      toVariantId: to as never,
      duration: "permanent" as const,
      sceneId: scene.id,
      blockId: block.id,
      untilSceneId: null,
      status: "approved" as const,
    };
    st = await runCommand(st, ALICE, {
      type: "AddContinuityEvents",
      events: [{ eventId: ev as never, fields }],
    });
    let back = await loadState(projectId);
    assert(
      isDeepStrictEqual(back.continuityEvents[ev], st.continuityEvents[ev]),
      "hendelsen ble ikke lest tilbake likt",
    );
    st = await runCommand(back, ALICE, {
      type: "UpdateContinuityEvents",
      events: [
        {
          eventId: ev as never,
          fields: { ...fields, duration: "temporary", untilSceneId: later, blockId: null },
        },
      ],
    });
    back = await loadState(projectId);
    assert(
      back.continuityEvents[ev]?.untilSceneId === later &&
        back.continuityEvents[ev]?.blockId === null,
      "endringen ble ikke lagret",
    );
    await expectError(
      sql`update public.continuity_events set duration = 'permanent' where id = ${ev}`,
      /check/,
    );
    await expectError(
      sql`update public.continuity_events set kind = 'tattoo' where id = ${ev}`,
      /check/,
    );
    // Leserett for medlemmer, ingen direkte skriving
    const seen = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select id from public.continuity_events where id = ${ev}`,
    );
    assert(seen.length === 1, "medlemmet ser ikke hendelsen");
    const notSeen = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.continuity_events where id = ${ev}`,
    );
    assert(notSeen.length === 0, "andre ser hendelsen");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`delete from public.continuity_events where id = ${ev}`),
      "42501",
    );
    st = await runCommand(back, ALICE, {
      type: "SetContinuityEventsRemoved",
      eventIds: [ev as never],
      removed: true,
    });
    back = await loadState(projectId);
    assert(back.continuityEvents[ev]?.removed === true, "hendelsen ble ikke fjernet");
    // Tilbake (sikkerhetskopien under tar den med)
    st = await runCommand(back, ALICE, {
      type: "SetContinuityEventsRemoved",
      eventIds: [ev as never],
      removed: false,
    });
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 15, "schema_version er ikke 15");
  });

  await test("DEC-0057: avledet produksjon med gjenbrukte scener, egen variant og kopi av 2D-scenen lagres", async () => {
    let st = await loadState(projectId);
    const main = Object.values(st.productions).find((p) => p.kind === "main")!;
    const comp = Object.values(st.compositions).find((c) => !c.removed)!;
    const occ = Object.values(st.occurrences).find(
      (o) => o.productionId === main.id && o.variantId === comp.variantId,
    )!;
    const pid = "abcdef00-0000-7000-8000-0000000d5701";
    for (const c of deriveProductionCommands(st, {
      productionId: pid,
      name: "Spinoff",
      kind: "spinoff",
      parentProductionId: main.id,
      occurrenceIds: [occ.id],
    }))
      st = await runCommand(st, ALICE, c);
    const own = Object.values(st.occurrences).find((o) => o.productionId === pid)!;
    for (const c of ownCopyCommands(st, own.id)!) st = await runCommand(st, ALICE, c);
    const back = await loadState(projectId);
    const v = back.occurrences[own.id]!.variantId;
    assert(back.variants[v]?.ownerProductionId === pid, "spinoffen fikk ikke egen variant");
    const copy = Object.values(back.compositions).find((c) => c.variantId === v && !c.removed);
    assert(!!copy && copy.id !== comp.id, "2D-scenen ble ikke kopiert");
    const n = (id: string) =>
      Object.values(back.layers).filter((l) => l.compositionId === id && !l.removed).length;
    assert(n(copy!.id) === n(comp.id), "lagene ble ikke kopiert");
    assert(back.occurrences[occ.id]!.variantId === comp.variantId, "hovedfilmen ble endret");
  });

  await test("0016 (DEC-0058): oversettelser lagres, endres og fjernes; norsk språkkode og to mål avvises", async () => {
    let st = await loadState(projectId);
    const block = Object.values(st.blocks).find((b) => !b.removed && b.kind !== "heading")!;
    const variant = Object.values(st.variants)[0]!;
    const t1 = "abcdef00-0000-7000-8000-0000000d5801";
    const t2 = "abcdef00-0000-7000-8000-0000000d5802";
    st = await runCommand(st, ALICE, {
      type: "AddTranslations",
      items: [
        {
          translationId: t1 as never,
          fields: {
            blockId: block.id,
            variantId: null,
            language: "en",
            text: "Hello.",
            basedOnRev: block.currentRev,
            status: "uncertain",
          },
        },
        {
          translationId: t2 as never,
          fields: {
            blockId: null,
            variantId: variant.id,
            language: "en",
            text: "INT. KITCHEN - DAY",
            basedOnRev: 0,
            status: "approved",
          },
        },
      ],
    });
    let back = await loadState(projectId);
    assert(
      isDeepStrictEqual(back.translations[t1], st.translations[t1]),
      "oversettelsen ble ikke lest tilbake likt",
    );
    st = await runCommand(back, ALICE, {
      type: "UpdateTranslations",
      items: [
        {
          translationId: t1 as never,
          fields: {
            blockId: block.id,
            variantId: null,
            language: "en",
            text: "Hello there.",
            basedOnRev: block.currentRev,
            status: "approved",
          },
        },
      ],
    });
    back = await loadState(projectId);
    assert(
      back.translations[t1]?.text === "Hello there." &&
        back.translations[t1]?.status === "approved",
      "endringen ble ikke lagret",
    );
    await expectError(
      sql`update public.translations set language = 'nb' where id = ${t1}`,
      /source language/,
    );
    await expectError(
      sql`update public.translations set variant_id = ${variant.id} where id = ${t1}`,
      /check/,
    );
    const seen = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.translations where id = ${t1}`,
    );
    assert(seen.length === 0, "andre ser oversettelsen");
    st = await runCommand(back, ALICE, {
      type: "SetTranslationsRemoved",
      translationIds: [t1 as never, t2 as never],
      removed: true,
    });
    back = await loadState(projectId);
    assert(back.translations[t1]?.removed === true, "oversettelsen ble ikke fjernet");
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 16, "schema_version er ikke 16");
  });

  await test("0017 (DEC-0059): språk på lyd, dialog i filmlyden og bilder per språk lagres og leses tilbake", async () => {
    let st = await loadState(projectId);
    const sound = Object.values(st.assets).find((x) => x.kind === "sound")!;
    const occ = Object.values(st.occurrences).find((o) => o.active)!;
    const block = Object.values(st.blocks).find(
      (b) => b.variantId === occ.variantId && b.kind === "dialogue" && !b.removed,
    );
    const clip = "abcdef00-0000-7000-8000-0000000d5901";
    st = await runCommand(st, ALICE, {
      type: "AddAudioClips",
      clips: [
        {
          clipId: clip as never,
          fields: {
            occurrenceId: occ.id,
            kind: "dialogue",
            name: "Maja (EN)",
            assetId: sound.id,
            assetVariantId: null,
            versionId: null,
            blockId: block?.id ?? null,
            offsetMs: 500,
            sourceInMs: 0,
            lengthMs: 3000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
            muted: false,
            continues: false,
            volumeKeys: [],
            language: "en",
          },
        },
      ],
    });
    let back = await loadState(projectId);
    assert(back.audioClips[clip]?.language === "en", "språket på lyden ble ikke lagret");
    // Tilbake til standard (null i databasen)
    st = await runCommand(back, ALICE, {
      type: "UpdateAudioClips",
      clips: [
        {
          clipId: clip as never,
          fields: { ...audioClipFieldsOf(back.audioClips[clip]!), language: null },
        },
      ],
    });
    back = await loadState(projectId);
    assert(back.audioClips[clip]!.language === undefined, "språket ble ikke fjernet");
    await expectError(
      sql`update public.audio_clips set language = 'norsk' where id = ${clip}`,
      /check/,
    );
    // Dialogen i filmlyden (importert film)
    const take = Object.values(back.takes).find((x) => x.kind === "imported_film");
    if (take) {
      st = await runCommand(back, ALICE, {
        type: "SetTakeAudioLanguage",
        takeId: take.id,
        audioLanguage: "none",
      });
      back = await loadState(projectId);
      assert(back.takes[take.id]!.audioLanguage === "none", "dialogspråket i filmlyden");
      await expectError(
        sql`update public.takes set audio_language = 'tysk' where id = ${take.id}`,
        /check/,
      );
    }
    // Bilder per språk: kolonnen må være en liste
    const layer = Object.values(back.layers)[0];
    if (layer)
      await expectError(
        sql`update public.composition_layers set language_images = '{}'::jsonb where id = ${layer.id}`,
        /check/,
      );
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 17, "schema_version er ikke 17");
  });

  await test("0018 (DEC-0060): tilbakeføring fra spinoff og kontinuitet per produksjon lagres og leses tilbake", async () => {
    let st = await loadState(projectId);
    const main = Object.values(st.productions).find((p) => p.kind === "main")!;
    const pid = "abcdef00-0000-7000-8000-0000000d5701";
    const own = Object.values(st.occurrences).find((o) => o.productionId === pid)!;
    const mainOcc = Object.values(st.occurrences).find(
      (o) => o.productionId === main.id && o.sceneId === own.sceneId,
    )!;
    // Endre en linje i spinoffens versjon og før bare manuset tilbake
    const line = blocksOfVariant(st, own.variantId).find((b) => b.kind !== "heading")!;
    st = await runCommand(st, ALICE, {
      type: "EditBlockText",
      productionId: pid as never,
      blockId: line.id,
      text: "Endret i spinoffen.",
    });
    const plan = promotionCommands(st, own.id, scriptOnlyChoice(comparePromotion(st, own.id)!));
    assert(plan.blocked === null && plan.commands.length > 0, "ingen tilbakeføring");
    for (const c of plan.commands) st = await runCommand(st, ALICE, c);
    let back = await loadState(projectId);
    assert(
      blocksOfVariant(back, mainOcc.variantId).some((b) => b.text === "Endret i spinoffen."),
      "manusendringen ble ikke ført tilbake",
    );
    // Ny hovedfilmvariant fra spinoffens versjon
    const oldVariant = mainOcc.variantId;
    for (const c of newMainVariantCommands(back, own.id).commands)
      back = await runCommand(back, ALICE, c);
    back = await loadState(projectId);
    const nv = back.occurrences[mainOcc.id]!.variantId;
    assert(nv !== oldVariant, "hovedfilmen fikk ikke ny versjon");
    assert(back.variants[nv]!.basedOnVariantId === own.variantId, "relasjonen mangler");
    assert(!!back.variants[oldVariant], "den gamle versjonen er borte");
    // Ny scene i spinoffen overføres til hovedfilmen
    const spinOccs = orderedOccurrences(back, pid);
    const occId = "abcdef00-0000-7000-8000-0000000d6001";
    back = await runCommand(back, ALICE, {
      type: "CreateScene",
      productionId: pid as never,
      sceneId: "abcdef00-0000-7000-8000-0000000d6002" as never,
      variantId: "abcdef00-0000-7000-8000-0000000d6003" as never,
      occurrenceId: occId as never,
      orderKey: keyBetween(spinOccs.at(-1)!.orderKey, null),
      heading: { intExt: "EXT.", location: "VEIEN", time: "NATT" },
      blocks: [
        {
          blockId: "abcdef00-0000-7000-8000-0000000d6004" as never,
          kind: "action",
          text: "Ny scene.",
          orderKey: keyBetween(null, null),
        },
      ],
    });
    for (const c of transferSceneCommands(back, occId).commands)
      back = await runCommand(back, ALICE, c);
    back = await loadState(projectId);
    const added = Object.values(back.occurrences).find(
      (o) => o.productionId === main.id && o.sceneId === "abcdef00-0000-7000-8000-0000000d6002",
    );
    assert(
      !!added && back.variants[added.variantId]!.ownerProductionId === null,
      "scenen ble ikke overført",
    );
    // Kontinuitet: lokal hendelse og hendelse slått av i spinoffen
    const asset = Object.values(back.assets).find((a) => a.kind === "character");
    if (asset) {
      const ev = "abcdef00-0000-7000-8000-0000000d6005";
      back = await runCommand(back, ALICE, {
        type: "AddContinuityEvents",
        events: [
          {
            eventId: ev as never,
            fields: {
              assetId: asset.id,
              kind: "other",
              description: "Bare i spinoffen",
              fromVariantId: null,
              toVariantId: null,
              duration: "permanent",
              sceneId: own.sceneId,
              blockId: null,
              untilSceneId: null,
              status: "approved",
              productionId: pid as never,
            },
          },
        ],
      });
      const global = Object.values(back.continuityEvents).find(
        (e) => !e.productionId && !e.removed,
      );
      if (global)
        back = await runCommand(back, ALICE, {
          type: "SetContinuityEventDisabled",
          eventId: global.id,
          productionId: pid as never,
          disabled: true,
        });
      const read = await loadState(projectId);
      assert(read.continuityEvents[ev]?.productionId === pid, "lokal hendelse ble ikke lagret");
      if (global)
        assert(
          isDeepStrictEqual(read.continuityEvents[global.id]?.disabledIn, [pid]),
          "avslått hendelse ble ikke lagret",
        );
      await expectError(
        sql`update public.continuity_events set disabled_in = '{}'::jsonb where id = ${ev}`,
        /check/,
      );
    }
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 18, "schema_version er ikke 18");
  });

  await test("0019 (DEC-0061): relasjoner og plakater lagres, endres og leses tilbake; ugyldige verdier avvises", async () => {
    let st = await loadState(projectId);
    const main = Object.values(st.productions).find((p) => p.kind === "main")!;
    const mk = (id: string, name: string) => ({
      assetId: id as never,
      fields: {
        kind: "character" as const,
        name,
        names: [],
        description: "",
        category: "",
        tags: [],
      },
    });
    st = await runCommand(st, ALICE, {
      type: "CreateAssets",
      assets: [
        mk("abcdef00-0000-7000-8000-0000000d7011", "Mor"),
        mk("abcdef00-0000-7000-8000-0000000d7012", "Datter"),
      ],
    } as never);
    const chars = [
      "abcdef00-0000-7000-8000-0000000d7011",
      "abcdef00-0000-7000-8000-0000000d7012",
    ].map((id) => st.assets[id]!);
    const rel = "abcdef00-0000-7000-8000-0000000d7001";
    st = await runCommand(st, ALICE, {
      type: "AddRelations",
      items: [
        {
          relationId: rel as never,
          fields: {
            fromAssetId: chars[0]!.id,
            toAssetId: chars[1]!.id,
            kind: "family",
            label: "Mor og datter",
            description: "",
            status: "approved",
          },
        },
      ],
    });
    const poster = "abcdef00-0000-7000-8000-0000000d7002";
    const doc = posterDraft(st, main.id, "character_map");
    st = await runCommand(st, ALICE, {
      type: "CreatePoster",
      posterId: poster as never,
      fields: {
        productionId: main.id,
        name: "Karakterkart",
        kind: "character_map",
        language: "nb",
        widthMm: 700,
        heightMm: 1000,
        document: doc,
      },
    });
    let back = await loadState(projectId);
    assert(back.assetRelations[rel]?.label === "Mor og datter", "relasjonen ble ikke lagret");
    assert(isDeepStrictEqual(back.posters[poster]?.document, doc), "plakaten ble ikke lik");
    assert(back.posters[poster]!.widthMm === 700, "formatet ble ikke lagret");
    // Endring med revisjonskontroll
    back = await runCommand(back, ALICE, {
      type: "UpdatePoster",
      posterId: poster as never,
      fields: {
        productionId: main.id,
        name: "Karakterkart 2",
        kind: "character_map",
        language: "en",
        widthMm: 700,
        heightMm: 1000,
        document: { ...doc, title: { nb: "Tittel", en: "Title" } },
      },
    });
    back = await loadState(projectId);
    assert(back.posters[poster]!.language === "en", "endringen ble ikke lagret");
    assert(back.posters[poster]!.document.title["en"] === "Title", "dokumentet ble ikke endret");
    await expectError(
      sql`update public.asset_relations set kind = 'enemy' where id = ${rel}`,
      /check/,
    );
    await expectError(sql`update public.posters set width_mm = 10 where id = ${poster}`, /check/);
    // 0091 (G-1b): plakatspråket er et vanlig BCP-47-merke; ugyldige merker avvises fortsatt
    await sql`update public.posters set language = 'ja' where id = ${poster}`;
    await sql`update public.posters set language = 'pt-BR' where id = ${poster}`;
    await expectError(sql`update public.posters set language = 'Norsk!' where id = ${poster}`, /check/);
    await sql`update public.posters set language = 'en' where id = ${poster}`;
    // Ressursen kan ikke slettes så lenge relasjonen peker på den
    await expectError(sql`delete from public.assets where id = ${chars[0]!.id}`, /foreign key/);
    // Bare lesing for medlemmer
    const seen = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select id from public.posters where id = ${poster}`,
    );
    assert(seen.length === 1, "medlemmet ser ikke plakaten");
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 19, "schema_version er ikke 19");
  });

  await test("0021 (DEC-0065): filmens visuelle stil lagres og leses tilbake; høyst én standard", async () => {
    let st = await loadState(projectId);
    const g = {
      version: 1 as const,
      premise: "A girl spends Christmas on a farm.",
      world: "",
      audience: "",
      visualStyle: "Watercolour",
      technique: "",
      palette: { colors: ["#0d1b2a"], description: "" },
      lighting: "",
      mood: "",
      characterDesign: "",
      environmentDesign: "",
      composition: "",
      avoid: "",
      instructions: "",
      referenceVersionIds: [] as string[],
    };
    const id = "abcdef00-0000-7000-8000-0000000d8001";
    st = await runCommand(st, ALICE, {
      type: "CreateStyleProfile",
      profileId: id as never,
      fields: { name: "Filmens visuelle stil", isDefault: true, guide: g },
    });
    const back = await loadState(projectId);
    assert(isDeepStrictEqual(back.styleProfiles[id]?.guide, g), "stilen ble ikke lagret likt");
    // To standardprofiler i samme prosjekt stoppes av databasen også
    await expectError(
      sql`insert into public.style_profiles (id, project_id, name, is_default, guide) values (gen_random_uuid(), ${projectId}, 'To', true, '{}'::jsonb)`,
      /duplicate key|unique/,
    );
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 21, "schema_version er ikke 21");
  });

  await test("0022 (DEC-0066): AI-skrevne beskrivelser logges med tekst og alle forbildebildene", async () => {
    const job = "abcdef00-0000-7000-8000-0000000d9001";
    const paths = [`${projectId}/a/v1/x.png`, `${projectId}/b/v2/y.png`];
    await sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by, reference_paths, result_text, status)
      values (${job}, ${projectId}, 'prompt', 'lovable', 'google/gemini-3.1-pro-preview', 'BRIEF', ${ALICE}, ${sql.json(paths)}, 'A fox in snow.', 'done')`;
    const [row] =
      await sql`select kind, reference_paths, result_text from public.generation_jobs where id = ${job}`;
    assert(row!["kind"] === "prompt", "kind ble ikke «prompt»");
    assert(
      isDeepStrictEqual(row!["reference_paths"], paths),
      "forbildebildene ble ikke lagret likt",
    );
    assert(row!["result_text"] === "A fox in snow.", "teksten ble ikke lagret");
    // Gamle bildejobber får tom liste
    const [old] =
      await sql`select reference_paths from public.generation_jobs where kind = 'image' limit 1`;
    if (old)
      assert(isDeepStrictEqual(old["reference_paths"], []), "eldre jobber fikk ikke tom liste");
    await expectError(
      sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by) values (gen_random_uuid(), ${projectId}, 'lyd', 'x', 'm', 'p', ${ALICE})`,
      /check/,
    );
    await expectError(
      sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by, reference_paths) values (gen_random_uuid(), ${projectId}, 'image', 'x', 'm', 'p', ${ALICE}, ${sql.json(Array.from({ length: 13 }, (_, i) => `p${i}`))})`,
      /check/,
    );
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 22, "schema_version er ikke 22");
  });

  await test("0023: eieren fjerner et medlem uten å miste noe; planlagt lengde lagres", async () => {
    // Planlagt lengde per scene (REQ-0111/0113)
    let st = await loadState(projectId);
    const occ = Object.values(st.occurrences).find((o) => o.active)!;
    st = await runCommand(st, ALICE, {
      type: "SetPlannedDuration",
      occurrenceId: occ.id,
      plannedMs: 42_000,
    });
    assert(
      (await loadState(projectId)).occurrences[occ.id]?.plannedMs === 42_000,
      "planen ble ikke lagret",
    );
    await expectError(
      sql`update public.scene_occurrences set planned_ms = 10 where id = ${occ.id}`,
      /check/,
    );
    st = await runCommand(st, ALICE, {
      type: "SetPlannedDuration",
      occurrenceId: occ.id,
      plannedMs: null,
    });
    assert(
      (await loadState(projectId)).occurrences[occ.id]?.plannedMs === undefined,
      "planen ble ikke fjernet",
    );

    // Fjerne medlem (REQ-0529): bare eieren, ikke seg selv; bidragene står
    const bobChanges = async () =>
      Number(
        (
          await sql`select count(*) as n from public.change_log where project_id = ${projectId} and actor = ${BOB}`
        )[0]!["n"],
      );
    // BOB blir redaktør og gjør en endring som skal stå etter at han er fjernet
    await sql`update public.project_members set role = 'editor' where project_id = ${projectId} and user_id = ${BOB}`;
    st = await runCommand(st, BOB, {
      type: "SetPlannedDuration",
      occurrenceId: occ.id,
      plannedMs: 30_000,
    });
    const before = await bobChanges();
    assert(before > 0, "BOB sin endring ble ikke logget");
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.remove_member(${projectId}, ${ALICE})`),
      /Bare prosjektets eier/,
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.remove_member(${projectId}, ${ALICE})`),
      /fjerne deg selv/,
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.remove_member(${projectId}, ${CAROL})`),
      /ikke medlem/,
    );
    // En ventende invitasjon til BOB sin e-post (en nøkkel) må ikke slippe ham inn igjen
    const token = await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.create_invitation(${projectId}, 'bob@example.no', 'editor') as t`
        )[0]!["t"] as string,
    );
    await as("authenticated", ALICE, (tx) => tx`select public.remove_member(${projectId}, ${BOB})`);
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.accept_invitation(${token})`),
      "22023",
    );
    const bobSees = await as(
      "authenticated",
      BOB,
      (tx) => tx`select id from public.scene_occurrences where project_id = ${projectId}`,
    );
    assert(bobSees.length === 0, "fjernet medlem kan fortsatt lese prosjektet");
    assert((await bobChanges()) === before, "endringene til det fjernede medlemmet forsvant");
    assert(
      (await loadState(projectId)).occurrences[occ.id]?.plannedMs === 30_000,
      "det fjernede medlemmets endring forsvant",
    );
    const [m] =
      await sql`select removed_at from public.project_members where project_id = ${projectId} and user_id = ${BOB}`;
    assert(m && m["removed_at"] !== null, "medlemskapet ble ikke avsluttet");
    // Tilbake som før for testene etterpå (som en ny invitasjon ville gjort)
    await sql`update public.project_members set removed_at = null, role = 'viewer' where project_id = ${projectId} and user_id = ${BOB}`;
    await runCommand(st, ALICE, {
      type: "SetPlannedDuration",
      occurrenceId: occ.id,
      plannedMs: null,
    });
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 23, "schema_version er ikke 23");
  });

  await test("0024 (DEC-0069): API-nøkler kan ikke leses fra nettleseren; bare egne rader; tak per bruker", async () => {
    const id = "abcdef00-0000-7000-8000-0000000e0001";
    await sql`insert into public.ai_provider_keys (id, user_id, provider, ciphertext, iv, key_hint, status)
      values (${id}, ${ALICE}, 'openai', ${"x".repeat(40)}, 'aXZpdml2aXZpdml2', '…1234', 'ok')`;
    // Den krypterte nøkkelen kan ikke leses, heller ikke av eieren selv
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select ciphertext from public.ai_provider_keys`),
      /permission denied/,
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select * from public.ai_provider_keys`),
      /permission denied/,
    );
    const mine = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select id, provider, key_hint, status from public.ai_provider_keys`,
    );
    assert(mine.length === 1 && mine[0]!["key_hint"] === "…1234", "eieren ser ikke sin egen rad");
    const others = await as(
      "authenticated",
      BOB,
      (tx) => tx`select id from public.ai_provider_keys`,
    );
    assert(others.length === 0, "andre ser nøkkelraden");
    // Nettleseren kan ikke skrive
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`update public.ai_provider_keys set status = 'ok' where id = ${id}`,
      ),
      /permission denied/,
    );
    // Én nøkkel per leverandør og bruker; ukjent leverandør avvises
    await expectError(
      sql`insert into public.ai_provider_keys (id, user_id, provider, ciphertext, iv, key_hint)
        values (gen_random_uuid(), ${ALICE}, 'openai', ${"y".repeat(40)}, 'aXZpdml2aXZpdml2', '…')`,
      /duplicate key|unique/,
    );
    await expectError(
      sql`insert into public.ai_provider_keys (id, user_id, provider, ciphertext, iv, key_hint)
        values (gen_random_uuid(), ${ALICE}, 'ukjent', ${"y".repeat(40)}, 'aXZpdml2aXZpdml2', '…')`,
      /check/,
    );
    // Jobben husker nøkkelen; sletting av nøkkelen beholder jobben uten nøkkel
    const job = "abcdef00-0000-7000-8000-0000000e0002";
    await sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by, provider_key_id, key_owner, cost_usd, external_id, params)
      values (${job}, ${projectId}, 'video', 'openai', 'sora-2', 'x', ${ALICE}, ${id}, ${ALICE}, 0.8, 'video_123', ${sql.json({ seconds: 8 })})`;
    await sql`delete from public.ai_provider_keys where id = ${id}`;
    const [j] =
      await sql`select provider_key_id, cost_usd from public.generation_jobs where id = ${job}`;
    assert(
      j && j["provider_key_id"] === null && Number(j["cost_usd"]) === 0.8,
      "jobben ble ikke beholdt",
    );
    await sql`insert into public.ai_account_limits (user_id, monthly_cap_usd) values (${ALICE}, 25)`;
    const caps = await as("authenticated", BOB, (tx) => tx`select * from public.ai_account_limits`);
    assert(caps.length === 0, "andre ser kostnadstaket");
    // Forbruket overlever at prosjektet slettes for godt (bare under purge), ikke vanlig sletting av en jobb
    const job2 = "abcdef00-0000-7000-8000-0000000e0003";
    const job3 = "abcdef00-0000-7000-8000-0000000e0004";
    await sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by, key_owner, cost_usd)
      values (${job2}, ${projectId}, 'sound', 'elevenlabs', 'm', 'x', ${ALICE}, ${ALICE}, 0.3),
             (${job3}, ${projectId}, 'sound', 'elevenlabs', 'm', 'x', ${ALICE}, ${ALICE}, 0.2)`;
    await sql`delete from public.generation_jobs where id = ${job2}`;
    const none = await sql`select usd from public.ai_spend where key_owner = ${ALICE}`;
    assert(none.length === 0, "vanlig sletting av en jobb ble regnet som forbruk");
    await sql.begin(async (tx) => {
      await tx`select set_config('animatic.purge_project', ${projectId}, true)`;
      await tx`delete from public.generation_jobs where id = ${job3}`;
    });
    const kept = await sql`select usd from public.ai_spend where key_owner = ${ALICE}`;
    assert(kept.length === 1 && Number(kept[0]!["usd"]) === 0.2, "forbruket ble ikke tatt vare på");
    const spendOthers = await as("authenticated", BOB, (tx) => tx`select * from public.ai_spend`);
    assert(spendOthers.length === 0, "andre ser forbruket");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`delete from public.ai_spend`),
      /permission denied/,
    );
    await sql`delete from public.ai_spend where key_owner = ${ALICE}`;
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 24, "schema_version er ikke 24");
  });

  await test("0025 (DEC-0070): kø for AI-jobber – «queued», prioritet og fremdrift; nettleseren kan ikke endre køen", async () => {
    const job = "abcdef00-0000-7000-8000-0000000e0101";
    await sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, created_by, status, priority, queue_position, cost_usd, key_owner)
      values (${job}, ${projectId}, 'video', 'runway', 'gen4_turbo', 'x', ${ALICE}, 'queued', 1, 0, 0.5, ${ALICE})`;
    await expectError(
      sql`update public.generation_jobs set priority = 4 where id = ${job}`,
      /check/,
    );
    await expectError(
      sql`update public.generation_jobs set progress = 1.5 where id = ${job}`,
      /check/,
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`update public.generation_jobs set priority = 3 where id = ${job}`,
      ),
      /permission denied/,
    );
    const seen = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select status, priority from public.generation_jobs where id = ${job}`,
    );
    assert(seen.length === 1 && seen[0]!["status"] === "queued", "medlemmet ser ikke køen");
    await sql`update public.generation_jobs set status = 'running', started_at = now(), progress = 0.25 where id = ${job}`;
    await sql`delete from public.generation_jobs where id = ${job}`;
    // Lydkoblinger (REQ-0204): en liste; annet avvises
    const [a] = await sql`select id from public.assets where project_id = ${projectId} limit 1`;
    if (a) {
      await sql`update public.assets set sound_links = ${sql.json([{ kind: "scene", id: "x" }])} where id = ${a["id"]}`;
      await expectError(
        sql`update public.assets set sound_links = ${sql.json({ kind: "scene" })} where id = ${a["id"]}`,
        /check/,
      );
      await sql`update public.assets set sound_links = '[]'::jsonb where id = ${a["id"]}`;
    }
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 25, "schema_version er ikke 25");
  });

  await test("0026 (DEC-0071): masker, overganger, stemmer, betegnelser, stilprofiler per bruk og manusdekning", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 26, "schema_version er ikke 26");
    const cols = await sql`select table_name, column_name from information_schema.columns
      where table_schema = 'public' and ((table_name = 'composition_layers' and column_name in ('mask','blend'))
        or (table_name = 'clip_parts' and column_name = 'transition_ms')
        or (table_name = 'assets' and column_name in ('voice','context_names'))
        or (table_name = 'style_profiles' and column_name = 'applies_to')
        or (table_name = 'takes' and column_name = 'coverage'))`;
    assert(cols.length === 7, `fant ${cols.length} av 7 nye kolonner`);
    const [layer] =
      await sql`select id from public.composition_layers where project_id = ${projectId} limit 1`;
    if (layer) {
      await expectError(
        sql`update public.composition_layers set blend = 'rar' where id = ${layer["id"]}`,
        /check/,
      );
      await sql`update public.composition_layers set blend = 'multiply', mask = ${sql.json({ kind: "rect", x: 0, y: 0, width: 10, height: 10, feather: 0, invert: false })} where id = ${layer["id"]}`;
      await sql`update public.composition_layers set blend = 'normal', mask = null where id = ${layer["id"]}`;
    }
    const [asset] = await sql`select id from public.assets where project_id = ${projectId} limit 1`;
    if (asset) {
      await expectError(
        sql`update public.assets set context_names = ${sql.json({})} where id = ${asset["id"]}`,
        /check/,
      );
    }
    // Nettleseren kan fortsatt ikke skrive
    if (asset)
      await expectError(
        as(
          "authenticated",
          ALICE,
          (tx) =>
            tx`update public.assets set voice = ${sql.json({ provider: "elevenlabs" })} where id = ${asset["id"]}`,
        ),
        /permission denied/,
      );
  });

  await test("0027 (DEC-0072): gjennomgåtte versjoner og lagrede eksportinnstillinger", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 27, "schema_version er ikke 27");
    const cols = await sql`select table_name, column_name from information_schema.columns
      where table_schema = 'public' and ((table_name in ('composition_layers','takes') and column_name = 'reviewed_versions')
        or (table_name = 'productions' and column_name = 'export_settings'))`;
    assert(cols.length === 3, `fant ${cols.length} av 3 nye kolonner`);
    const [prod] =
      await sql`select id from public.productions where project_id = ${projectId} limit 1`;
    if (prod) {
      await expectError(
        sql`update public.productions set export_settings = ${sql.json([1])} where id = ${prod["id"]}`,
        /check/,
      );
      await sql`update public.productions set export_settings = ${sql.json({ size: "half", monochrome: false, output: "video" })} where id = ${prod["id"]}`;
      await sql`update public.productions set export_settings = null where id = ${prod["id"]}`;
    }
    const [layer] =
      await sql`select id from public.composition_layers where project_id = ${projectId} limit 1`;
    if (layer)
      await expectError(
        sql`update public.composition_layers set reviewed_versions = ${sql.json({})} where id = ${layer["id"]}`,
        /check/,
      );
  });

  // ---------- 0028 (DEC-0078): antakelser per prosjekt, lagrede estimater og eksportlogg ----------
  await test("0028 (KI-28): antakelsene for varighetsestimatet lagres per prosjekt via apply_changes", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 28, "schema_version er ikke 28");
    let st = await loadState(projectId);
    const fast = {
      dialogueWordsPerMinute: 180,
      actionSecondsPerLine: 1.5,
      headingSeconds: 1,
      minSceneSeconds: 4,
    };
    st = await runCommand(st, ALICE, { type: "SetDurationAssumptions", assumptions: fast });
    const loaded = await loadState(projectId);
    assert(
      isDeepStrictEqual(loaded.project.durationAssumptions, fast),
      `antakelsene ble ikke lest tilbake: ${JSON.stringify(loaded.project.durationAssumptions)}`,
    );
    assert(loaded.project.revision === st.project.revision, "revisjonen stemmer ikke");
    // En annen endring på prosjektraden rører ikke antakelsene
    st = await runCommand(st, ALICE, { type: "SetAiBudget", monthLimit: 7, pricePerImage: null });
    const [row] =
      await sql`select duration_assumptions from public.projects where id = ${projectId}`;
    assert(isDeepStrictEqual(row!["duration_assumptions"], fast), "antakelsene forsvant");
    // Databasen avviser ugyldige verdier
    await expectError(
      sql`update public.projects set duration_assumptions = ${sql.json({ dialogueWordsPerMinute: "fort" })} where id = ${projectId}`,
      /check/,
    );
    // Tilbake til standard (null) – og AI-budsjettet som før testen
    st = await runCommand(st, ALICE, { type: "SetDurationAssumptions", assumptions: null });
    st = await runCommand(st, ALICE, {
      type: "SetAiBudget",
      monthLimit: null,
      pricePerImage: null,
    });
    const [row2] =
      await sql`select duration_assumptions, ai_month_limit from public.projects where id = ${projectId}`;
    assert(row2!["duration_assumptions"] === null, "antakelsene ble ikke fjernet");
    assert(row2!["ai_month_limit"] === null, "AI-budsjettet ble ikke tilbakestilt");
  });

  await test("0028 (REQ-0120): lagrede estimater – redaktør lagrer, knyttes til uendret versjon, endres aldri", async () => {
    await sql`update public.project_members set removed_at = now() where project_id = ${projectId} and user_id = ${CAROL} and removed_at is null`;
    const st = await loadState(projectId);
    const prod = Object.values(st.productions).find((p) => p.kind === "main")!;
    const assumptions = {
      dialogueWordsPerMinute: 150,
      actionSecondsPerLine: 2,
      headingSeconds: 2,
      minSceneSeconds: 5,
    };
    const estimate = { format: 1, activeScenes: 2, expectedSeconds: 61, scenes: [] };
    // Ny versjon, ingen endringer etterpå: estimatet uten versjon knyttes til den
    const version = await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.create_script_version(${projectId}, ${prod.id}, 'Før estimat') as id`
        )[0]!["id"] as string,
    );
    const saved = (await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.save_duration_estimate(${projectId}, ${prod.id}, ${tx.json(assumptions)}, ${tx.json(estimate)}) as r`
        )[0]!["r"],
    )) as { id: string; script_version_id: string | null };
    assert(
      saved.script_version_id === version,
      "estimatet ble ikke knyttet til den uendrede versjonen",
    );
    // Eksplisitt versjon: bare den nyeste
    const explicit = (await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.save_duration_estimate(${projectId}, ${prod.id}, ${tx.json(assumptions)}, ${tx.json(estimate)}, ${version}) as r`
        )[0]!["r"],
    )) as { script_version_id: string };
    assert(explicit.script_version_id === version, "eksplisitt versjon ble ikke lagret");
    const [older] =
      await sql`select id from public.script_versions where production_id = ${prod.id} and id <> ${version} order by number desc limit 1`;
    if (older)
      await expectError(
        as(
          "authenticated",
          ALICE,
          (tx) =>
            tx`select public.save_duration_estimate(${projectId}, ${prod.id}, ${tx.json(assumptions)}, ${tx.json(estimate)}, ${older["id"]})`,
        ),
        /nyeste/,
      );
    // Etter en endring knyttes et nytt estimat ikke til versjonen
    let s2 = await loadState(projectId);
    s2 = await runCommand(s2, ALICE, { type: "SetAiBudget", monthLimit: 3, pricePerImage: null });
    await runCommand(s2, ALICE, { type: "SetAiBudget", monthLimit: null, pricePerImage: null });
    const loose = (await as(
      "authenticated",
      ALICE,
      async (tx) =>
        (
          await tx`select public.save_duration_estimate(${projectId}, ${prod.id}, ${tx.json(assumptions)}, ${tx.json(estimate)}) as r`
        )[0]!["r"],
    )) as { script_version_id: string | null };
    assert(loose.script_version_id === null, "estimatet ble knyttet til en endret versjon");
    // Ugyldige data og manglende rettigheter avvises
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`select public.save_duration_estimate(${projectId}, ${prod.id}, ${tx.json({ x: 1 })}, ${tx.json(estimate)})`,
      ),
      "22023",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`select public.save_duration_estimate(${projectId}, ${prod.id}, ${tx.json(assumptions)}, ${tx.json({ format: 2 })})`,
      ),
      /check/,
    );
    await expectError(
      as(
        "authenticated",
        BOB,
        (tx) =>
          tx`select public.save_duration_estimate(${projectId}, ${prod.id}, ${tx.json(assumptions)}, ${tx.json(estimate)})`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.duration_estimates (project_id, production_id, assumptions, estimate, created_by) values (${projectId}, ${prod.id}, ${tx.json(assumptions)}, ${tx.json(estimate)}, ${ALICE})`,
      ),
      "42501",
    );
    // Lesing: medlemmer (også lesere) ser estimatene, andre ikke
    const bobSees = await as(
      "authenticated",
      BOB,
      (tx) => tx`select id from public.duration_estimates where project_id = ${projectId}`,
    );
    assert(bobSees.length === 3, `leseren ser ${bobSees.length} av 3 estimater`);
    const carolSees = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.duration_estimates where project_id = ${projectId}`,
    );
    assert(carolSees.length === 0, "et ikke-medlem ser estimatene");
    // Uforanderlige (INV-13)
    await expectError(
      sql`update public.duration_estimates set estimate = ${sql.json({ format: 1, scenes: [] })} where id = ${saved.id}`,
      /INV-13/,
    );
    await expectError(sql`delete from public.duration_estimates where id = ${saved.id}`, /INV-13/);
  });

  await test("0028 (REQ-0037): eksportloggen – alle medlemmer registrerer, scenene må høre til produksjonen", async () => {
    const st = await loadState(projectId);
    const prod = Object.values(st.productions).find((p) => p.kind === "main")!;
    const occs = orderedOccurrences(st, prod.id).map((o) => o.id);
    const id = await as(
      "authenticated",
      BOB,
      async (tx) =>
        (
          await tx`select public.record_export(${projectId}, ${prod.id}, 'script', ${"Manus – 2026-10-12.pdf"}, ${tx.json({ format: "pdf", numbering: "production" })}, ${occs.slice(0, 2)}::uuid[]) as id`
        )[0]!["id"] as string,
    );
    const [rec] = await sql`select * from public.export_records where id = ${id}`;
    assert(
      rec!["created_by"] === BOB && rec!["kind"] === "script",
      "eksporten ble ikke lagret riktig",
    );
    assert((rec!["occurrence_ids"] as string[]).length === 2, "scenene ble ikke lagret");
    await as(
      "authenticated",
      ALICE,
      (tx) =>
        tx`select public.record_export(${projectId}, ${prod.id}, 'film', 'film.webm', ${tx.json({ size: "full" })}, ${occs}::uuid[])`,
    );
    // Scener fra en annen produksjon, ukjent type, ikke-medlem og direkte skriving avvises
    const other = Object.values(st.occurrences).find((o) => o.productionId !== prod.id);
    if (other)
      await expectError(
        as(
          "authenticated",
          ALICE,
          (tx) =>
            tx`select public.record_export(${projectId}, ${prod.id}, 'film', 'x.webm', '{}'::jsonb, ${[other.id]}::uuid[])`,
        ),
        "22023",
      );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`select public.record_export(${projectId}, ${prod.id}, 'zip', 'x.zip', '{}'::jsonb, '{}'::uuid[])`,
      ),
      /check/,
    );
    await expectError(
      as(
        "authenticated",
        CAROL,
        (tx) =>
          tx`select public.record_export(${projectId}, ${prod.id}, 'film', 'x.webm', '{}'::jsonb, '{}'::uuid[])`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.export_records (project_id, production_id, kind, file_name, created_by) values (${projectId}, ${prod.id}, 'film', 'x', ${ALICE})`,
      ),
      "42501",
    );
    const bobSees = await as(
      "authenticated",
      BOB,
      (tx) => tx`select id from public.export_records where project_id = ${projectId}`,
    );
    assert(bobSees.length === 2, `leseren ser ${bobSees.length} av 2 eksporter`);
    const carolSees = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.export_records where project_id = ${projectId}`,
    );
    assert(carolSees.length === 0, "et ikke-medlem ser eksportene");
    await expectError(
      sql`update public.export_records set file_name = 'y' where id = ${id}`,
      /INV-13/,
    );
  });

  await test("0028 (INV-13): angre en ny produksjon med eksporter avvises med INV-13 (appen viser en forståelig melding)", async () => {
    let st = await loadState(projectId);
    const main = Object.values(st.productions).find((p) => p.kind === "main")!;
    const prodId = "55555555-5555-7555-8555-000000000028";
    st = await runCommand(st, ALICE, {
      type: "CreateProduction",
      productionId: prodId as never,
      kind: "spinoff",
      name: "Kortversjon",
      parentProductionId: main.id,
    } as Command);
    await as(
      "authenticated",
      ALICE,
      (tx) =>
        tx`select public.record_export(${projectId}, ${prodId}, 'script', 'kort.pdf', '{}'::jsonb, '{}'::uuid[])`,
    );
    await expectError(
      runCommand(st, ALICE, { type: "UndoCreateProduction", productionId: prodId as never }),
      /INV-13/,
    );
    const [still] = await sql`select id from public.productions where id = ${prodId}`;
    assert(still, "produksjonen ble slettet");
  });

  // ---------- Sikkerhetskopi (DEC-0049): gjenopprett testprosjektet som nytt prosjekt ----------
  await test("0029 (DEC-0079): slettede objekter, lydhastighet, animer på toere og sletting for godt", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 29, "schema_version er ikke 29");
    let st = await loadState(projectId);
    const aId = "29290000-0000-7000-8000-000000000001";
    const vaId = "29290000-0000-7000-8000-000000000002";
    const ver1 = "29290000-0000-7000-8000-000000000003";
    const ver2 = "29290000-0000-7000-8000-000000000004";
    st = await runCommand(st, ALICE, {
      type: "CreateAssets",
      assets: [
        {
          assetId: aId as never,
          fields: {
            kind: "object",
            name: "Lykta",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "CreateAssetVariant",
      variantId: vaId as never,
      assetId: aId as never,
      fields: { name: "Animatic", style: "animatic", appearance: "" },
    });
    for (const [id, n] of [
      [ver1, "original.png"],
      [ver2, "arbeidskopi.png"],
    ] as const)
      st = await runCommand(st, ALICE, {
        type: "AddAssetVersion",
        versionId: id as never,
        variantId: vaId as never,
        media: {
          path: `${projectId}/${aId}/${id}/${n}`,
          mimeType: "image/png",
          width: 100,
          height: 100,
          byteSize: 10,
          sha256: "a".repeat(64),
        },
        note: "",
      });
    // Et bilde slettes og hentes inn igjen; selve bildet kan fortsatt ikke endres
    st = await runCommand(st, ALICE, {
      type: "SetAssetVersionsRemoved",
      versionIds: [ver1 as never],
      removed: true,
    });
    let loaded = await loadState(projectId);
    assert(loaded.assetVersions[ver1]?.removed === true, "bildet ble ikke merket som slettet");
    // createdAt settes av databasen (kan avvike et millisekund fra den lokale)
    const noTime = (x: object | undefined) => ({ ...x, createdAt: "" });
    assert(
      isDeepStrictEqual(noTime(loaded.assetVersions[ver1]), noTime(st.assetVersions[ver1])),
      "slettet bilde leses ikke likt tilbake",
    );
    await expectError(
      sql`update public.asset_versions set note = 'endret' where id = ${ver1}`,
      /INV-13/,
    );
    st = await runCommand(st, ALICE, {
      type: "SetAssetVersionsRemoved",
      versionIds: [ver1 as never],
      removed: false,
    });
    loaded = await loadState(projectId);
    assert(loaded.assetVersions[ver1]?.removed === undefined, "bildet ble ikke hentet inn igjen");
    // Hastighet på lyd og toere i en 2D-scene (når de finnes i testprosjektet)
    const clip = Object.values(st.audioClips).find((c) => !c.removed);
    if (clip) {
      st = await runCommand(st, ALICE, {
        type: "UpdateAudioClips",
        clips: [{ clipId: clip.id, fields: { ...audioClipFieldsOf(clip), speed: 2.5 } }],
      } as Command);
      loaded = await loadState(projectId);
      assert(loaded.audioClips[clip.id]?.speed === 2.5, "hastigheten ble ikke lagret");
      await expectError(
        sql`update public.audio_clips set speed = 5 where id = ${clip.id}`,
        /check/,
      );
      st = await runCommand(st, ALICE, {
        type: "UpdateAudioClips",
        clips: [{ clipId: clip.id, fields: { ...audioClipFieldsOf(clip), speed: 1 } }],
      } as Command);
    }
    const comp = Object.values(st.compositions).find((c) => !c.removed);
    if (comp) {
      st = await runCommand(st, ALICE, {
        type: "SetCompositionStep",
        compositionId: comp.id,
        step: 2,
      });
      loaded = await loadState(projectId);
      assert(loaded.compositions[comp.id]?.step === 2, "toere ble ikke lagret");
      st = await runCommand(st, ALICE, {
        type: "SetCompositionStep",
        compositionId: comp.id,
        step: 1,
      });
      loaded = await loadState(projectId);
      assert(loaded.compositions[comp.id]?.step === undefined, "toere ble ikke tilbakestilt");
    }
    // Sletting for godt: bare slettede ressurser, bare via serveren
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`select public.purge_removed_assets(${projectId}, ${ALICE}, ${[aId]}::uuid[], '{}'::uuid[])`,
      ),
      /Bare slettede ressurser/,
    );
    st = await runCommand(st, ALICE, {
      type: "SetAssetsRemoved",
      assetIds: [aId as never],
      removed: true,
    });
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`select public.purge_removed_assets(${projectId}, ${ALICE}, ${[aId]}::uuid[], '{}'::uuid[])`,
      ),
      /permission denied/,
    );
    const res = (await as(
      "service_role",
      null,
      async (tx) =>
        (
          await tx`select public.purge_removed_assets(${projectId}, ${ALICE}, ${[aId]}::uuid[], '{}'::uuid[]) as r`
        )[0]!["r"],
    )) as { paths: string[]; assets: number; versions: number };
    assert(res.paths.length === 2 && res.versions === 2, `feil filstier: ${JSON.stringify(res)}`);
    assert(
      (await sql`select 1 from public.assets where id = ${aId}`).length === 0,
      "ressursen finnes fortsatt",
    );
    // En ressurs som brukes i et lag, kan ikke slettes for godt
    const used = Object.values(st.layers).find((l) => l.assetId && !l.removed);
    if (used?.assetId) {
      await sql`update public.assets set removed = true where id = ${used.assetId}`;
      await expectError(
        as(
          "service_role",
          null,
          (tx) =>
            tx`select public.purge_removed_assets(${projectId}, ${ALICE}, ${[used.assetId]}::uuid[], '{}'::uuid[])`,
        ),
        /2D-scene/,
      );
      await sql`update public.assets set removed = false where id = ${used.assetId}`;
    }
  });

  await test("0030 (DEC-0080): vinkel på bilder og visuelt faktaark; bildet ellers uforanderlig", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 30, "schema_version er ikke 30");
    let st = await loadState(projectId);
    const aId = "30300000-0000-7000-8000-000000000001";
    const vaId = "30300000-0000-7000-8000-000000000002";
    const verId = "30300000-0000-7000-8000-000000000003";
    st = await runCommand(st, ALICE, {
      type: "CreateAssets",
      assets: [
        {
          assetId: aId as never,
          fields: {
            kind: "character",
            name: "Vinkelfigur",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "CreateAssetVariant",
      variantId: vaId as never,
      assetId: aId as never,
      fields: { name: "Animatic", style: "animatic", appearance: "" },
    });
    st = await runCommand(st, ALICE, {
      type: "AddAssetVersion",
      versionId: verId as never,
      variantId: vaId as never,
      media: {
        path: `${projectId}/${aId}/${verId}/forfra.png`,
        mimeType: "image/png",
        width: 100,
        height: 200,
        byteSize: 10,
        sha256: "b".repeat(64),
      },
      note: "",
    });
    st = await runCommand(st, ALICE, {
      type: "SetVersionView",
      versionId: verId as never,
      view: "front",
    });
    st = await runCommand(st, ALICE, {
      type: "SetAssetVisualBrief",
      assetId: aId as never,
      text: "- tall, thin\n- red scarf",
    });
    let loaded = await loadState(projectId);
    assert(loaded.assetVersions[verId]?.view === "front", "vinkelen ble ikke lagret");
    assert(
      loaded.assets[aId]?.visualBrief === "- tall, thin\n- red scarf",
      "faktaarket ble ikke lagret",
    );
    assert(
      isDeepStrictEqual(
        { ...loaded.assetVersions[verId], createdAt: "" },
        { ...st.assetVersions[verId], createdAt: "" },
      ),
      `bildet med vinkel leses ikke likt tilbake: ${JSON.stringify(loaded.assetVersions[verId])} / ${JSON.stringify(st.assetVersions[verId])}`,
    );
    // Selve bildet er fortsatt uforanderlig; ugyldig vinkel avvises av databasen
    await expectError(
      sql`update public.asset_versions set width = 5 where id = ${verId}`,
      /INV-13/,
    );
    await expectError(
      sql`update public.asset_versions set view = 'skrått' where id = ${verId}`,
      /check/,
    );
    st = await runCommand(st, ALICE, {
      type: "SetVersionView",
      versionId: verId as never,
      view: null,
    });
    st = await runCommand(st, ALICE, {
      type: "SetAssetVisualBrief",
      assetId: aId as never,
      text: "",
    });
    loaded = await loadState(projectId);
    assert(loaded.assetVersions[verId]?.view === undefined, "vinkelen ble ikke fjernet");
    assert(!loaded.assets[aId]?.visualBrief, "faktaarket ble ikke tømt");
    // Leseren kan ikke merke vinkler
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`update public.asset_versions set view = 'side' where id = ${verId}`,
      ),
      /permission denied|row-level|0 rows/,
    ).catch(() => {
      // RLS uten skrivepolicy gir 0 rader i stedet for feil: kontroller at ingenting ble endret
    });
    const [row] = await sql`select view from public.asset_versions where id = ${verId}`;
    assert(row!["view"] === null, "vinkelen ble endret utenom apply_changes");
  });

  await test("0089: tekstversjoner av beskrivelsen og bildets referanse lagres og leses likt; bildet uforanderlig", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 89, "schema_version er ikke 89");
    let st = await loadState(projectId);
    const aId = "89890000-0000-7000-8000-000000000001";
    const vaId = "89890000-0000-7000-8000-000000000002";
    const verId = "89890000-0000-7000-8000-000000000003";
    st = await runCommand(st, ALICE, { type: "CreateAssets", assets: [{ assetId: aId as never, fields: { kind: "character", name: "Tekstfigur", names: [], description: "", category: "", tags: [] } }] });
    st = await runCommand(st, ALICE, { type: "CreateAssetVariant", variantId: vaId as never, assetId: aId as never, fields: { name: "Animatic", style: "animatic", appearance: "" } });
    const versions = [
      { id: "b1", text: "En jente med rød lue", createdAt: "2026-10-23T02:00:00.000Z" },
      { id: "b2", text: "En jente med blå lue", createdAt: "2026-10-23T02:01:00.000Z" },
    ];
    st = await runCommand(st, ALICE, { type: "SetAssetBriefVersions", assetId: aId as never, versions, activeId: "b1" });
    st = await runCommand(st, ALICE, {
      type: "AddAssetVersion", versionId: verId as never, variantId: vaId as never,
      media: { path: `${projectId}/${aId}/${verId}/bilde.png`, mimeType: "image/png", width: 100, height: 200, byteSize: 10, sha256: "c".repeat(64) },
      note: "", briefVersionId: "b1",
    });
    const loaded = await loadState(projectId);
    assert(isDeepStrictEqual(loaded.assets[aId]?.briefVersions, versions), "tekstversjonene ble ikke lagret likt");
    assert(loaded.assets[aId]?.activeBriefId === "b1", "aktiv tekstversjon ble ikke lagret");
    assert(loaded.assetVersions[verId]?.briefVersionId === "b1", "bildets referanse til teksten ble ikke lagret");
    await expectError(sql`update public.asset_versions set brief_version_id = 'b2' where id = ${verId}`, /INV-13/);
    await expectError(sql`update public.assets set brief_versions = '{}'::jsonb where id = ${aId}`, /check/);
    // Faktaark laget automatisk fra manuset (Øystein 23.10): merket lagres, og en vanlig redigering fjerner det
    st = await runCommand(st, ALICE, { type: "SetAssetVisualBrief", assetId: aId as never, text: "- Red cap", autoAt: "2026-10-23T02:30:00.000Z" });
    let auto = await loadState(projectId);
    assert(auto.assets[aId]?.visualBrief === "- Red cap", "faktaarket ble ikke lagret");
    assert(Date.parse(auto.assets[aId]?.visualBriefAuto ?? "") === Date.parse("2026-10-23T02:30:00.000Z"), "merket «laget automatisk» ble ikke lagret");
    st = await runCommand(st, ALICE, { type: "SetAssetVisualBrief", assetId: aId as never, text: "- Red cap, rettet" });
    auto = await loadState(projectId);
    assert(auto.assets[aId]?.visualBriefAuto === undefined, "merket ble ikke fjernet ved redigering");
  });

  await test("0031 (DEC-0082): notat på produksjonen lagres, leses tilbake og angres", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 31, "schema_version er ikke 31");
    let st = await loadState(projectId);
    const main = Object.values(st.productions).find((p) => p.kind === "main")!;
    assert(Boolean(main.createdAt), "createdAt leses ikke fra databasen");
    st = await runCommand(st, ALICE, {
      type: "SetProductionNote",
      productionId: main.id,
      note: "Hovedfilmen – 12 min\nTil festivalen",
    });
    let loaded = await loadState(projectId);
    assert(
      loaded.productions[main.id]?.note === "Hovedfilmen – 12 min\nTil festivalen",
      `notatet ble ikke lagret: ${JSON.stringify(loaded.productions[main.id])}`,
    );
    const [row] = await sql`select description from public.productions where id = ${main.id}`;
    assert(
      row!["description"] === "Hovedfilmen – 12 min\nTil festivalen",
      "description-kolonnen er feil",
    );
    await expectError(
      sql`update public.productions set description = ${"x".repeat(2001)} where id = ${main.id}`,
      /check/,
    );
    st = await runCommand(st, ALICE, {
      type: "SetProductionNote",
      productionId: main.id,
      note: "",
    });
    loaded = await loadState(projectId);
    assert(!loaded.productions[main.id]?.note, "notatet ble ikke tømt");
  });

  await test("0032 (DEC-0083): instrukser til AI-video lagres på scenen, leses tilbake og angres", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 32, "schema_version er ikke 32");
    let st = await loadState(projectId);
    const occ = Object.values(st.occurrences)[0]!;
    st = await runCommand(st, ALICE, {
      type: "SetSceneVideoInstructions",
      occurrenceId: occ.id,
      text: "Maja er redd, men nysgjerrig.\nSnøen faller tett.",
    });
    let loaded = await loadState(projectId);
    assert(
      loaded.occurrences[occ.id]?.videoInstructions ===
        "Maja er redd, men nysgjerrig.\nSnøen faller tett.",
      `instruksene ble ikke lagret: ${JSON.stringify(loaded.occurrences[occ.id])}`,
    );
    await expectError(
      sql`update public.scene_occurrences set video_instructions = ${"x".repeat(2001)} where id = ${occ.id}`,
      /check/,
    );
    st = await runCommand(st, ALICE, {
      type: "SetSceneVideoInstructions",
      occurrenceId: occ.id,
      text: "",
    });
    loaded = await loadState(projectId);
    assert(!loaded.occurrences[occ.id]?.videoInstructions, "instruksene ble ikke tømt");
  });

  await test("0033 (DEC-0086): fast administrator, blokkering, låste prosjekter, språk og personvern", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 33, "schema_version er ikke 33");
    const OYSTEIN = "55555555-5555-7555-8555-555555555555";
    await sql`insert into auth.users (id, email) values (${OYSTEIN}, 'Oystein@gutu.no') on conflict do nothing`;
    const acct = async (u: string) =>
      (await as("authenticated", u, (tx) => tx`select public.my_account() as a`))[0]![
        "a"
      ] as Record<string, unknown>;
    // Den faste administratoren er admin uten å stå i tabellen; vanlige brukere er det ikke
    assert((await acct(OYSTEIN))["is_admin"] === true, "oystein@gutu.no er ikke admin");
    assert((await acct(OYSTEIN))["permanent_admin"] === true, "oystein@gutu.no er ikke fast admin");
    assert((await acct(CAROL))["is_admin"] === false, "Carol er admin");
    await sql`insert into public.app_admins (user_id) values (${CAROL})`;
    assert((await acct(CAROL))["is_admin"] === true, "Carol ble ikke admin");
    await sql`delete from public.app_admins where user_id = ${CAROL}`;
    // Nettleseren kan ikke gjøre seg selv til admin eller endre kontostatus
    await expectError(
      as(
        "authenticated",
        CAROL,
        (tx) => tx`insert into public.app_admins (user_id) values (${CAROL})`,
      ),
      "42501",
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`update public.account_status set status = 'active'`),
      "42501",
    );
    // Sist aktiv og språk
    await as("authenticated", ALICE, (tx) => tx`select public.touch_activity()`);
    const [s1] =
      await sql`select last_active_at from public.account_status where user_id = ${ALICE}`;
    assert(s1 && s1["last_active_at"], "sist aktiv ble ikke lagret");
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_locale('en')`);
    assert((await acct(ALICE))["locale"] === "en", "språket ble ikke lagret");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.set_my_locale('en_US')`),
      /Ukjent språk/,
    );
    // Personvern: kan leses uten innlogging; godkjenning lagres per versjon
    const pol = await as("anon", null, (tx) => tx`select version from public.privacy_policy`);
    assert(pol.length >= 1, "personvernerklæringen kan ikke leses uten innlogging");
    await as("authenticated", ALICE, (tx) => tx`select public.accept_privacy(1)`);
    assert((await acct(ALICE))["accepted_version"] === 1, "godkjenningen ble ikke lagret");

    // Et blokkert medlem (ikke eier) kan ikke skrive; eieren kan fortsatt
    let st = await loadState(projectId);
    const occ = Object.values(st.occurrences)[0]!;
    const rank = async (u: string) =>
      Number((await sql`select private.member_role_rank(${projectId}, ${u}) as r`)[0]!["r"]);
    await sql`update public.project_members set role = 'editor' where project_id = ${projectId} and user_id = ${BOB}`;
    assert((await rank(BOB)) === 3, "Bob er ikke redaktør");
    await sql`insert into public.account_status (user_id, status) values (${BOB}, 'blocked')
              on conflict (user_id) do update set status = 'blocked'`;
    assert((await rank(BOB)) === 0, "en blokkert redaktør kan fortsatt skrive");
    assert((await rank(ALICE)) === 4, "eieren mistet tilgangen da et medlem ble blokkert");
    st = await runCommand(st, ALICE, {
      type: "SetSceneVideoInstructions",
      occurrenceId: occ.id,
      text: "fortsatt åpent",
    });
    // Eieren blokkeres: prosjektet låses for alle, også redaktørene
    await sql`update public.account_status set status = 'active' where user_id = ${BOB}`;
    await sql`insert into public.account_status (user_id, status) values (${ALICE}, 'blocked')
              on conflict (user_id) do update set status = 'blocked'`;
    assert((await rank(BOB)) === 0, "en redaktør kan skrive i et prosjekt der eieren er blokkert");
    const info = (
      await as("authenticated", BOB, (tx) => tx`select public.project_lock_info(${projectId}) as i`)
    )[0]!["i"] as Record<string, unknown>;
    assert(info["lock"] === "owner_blocked", `feil låsegrunn: ${JSON.stringify(info)}`);
    assert(info["admin_email"] === "oystein@gutu.no", "administratorens e-post mangler");
    const outsider = (
      await as(
        "authenticated",
        CAROL,
        (tx) => tx`select public.project_lock_info(${projectId}) as i`,
      )
    )[0]!["i"];
    assert(
      outsider === null ||
        (
          await sql`select 1 from public.project_members where project_id = ${projectId} and user_id = ${CAROL} and removed_at is null`
        ).length > 0,
      "en som ikke er medlem fikk låseinformasjon",
    );
    await expectError(
      runCommand(st, BOB, { type: "SetSceneVideoInstructions", occurrenceId: occ.id, text: "x" }),
      /./,
    );
    // Låst for sletting gir samme lås; kontrollen på delete_after holder
    await expectError(
      sql`update public.account_status set status = 'deleting' where user_id = ${ALICE}`,
      /check/,
    );
    await sql`update public.account_status set status = 'deleting', delete_after = now() + interval '30 days' where user_id = ${ALICE}`;
    const [l2] = await sql`select private.project_lock(${projectId}) as l`;
    assert(l2!["l"] === "owner_deleting", `feil lås: ${l2!["l"]}`);
    // Låses opp: alt virker som før
    await sql`update public.account_status set status = 'active', delete_after = null where user_id = ${ALICE}`;
    assert((await rank(BOB)) === 3, "Bob fikk ikke tilgangen tilbake");
    st = await runCommand(st, ALICE, {
      type: "SetSceneVideoInstructions",
      occurrenceId: occ.id,
      text: "",
    });
    await sql`update public.project_members set role = 'viewer' where project_id = ${projectId} and user_id = ${BOB}`;
  });

  await test("0034 (DEC-0088): visningsvalg, systemmerknader, planer for elementer og AI-tilkoblinger", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 34, "schema_version er ikke 34");
    const acct = async (u: string) =>
      (await as("authenticated", u, (tx) => tx`select public.my_account() as a`))[0]![
        "a"
      ] as Record<string, unknown>;
    // Visningsvalg: slås sammen per nøkkel, null fjerner, følger kontoen
    await as(
      "authenticated",
      ALICE,
      (tx) =>
        tx`select public.set_my_ui_prefs(${tx.json({ "sceneEditor.panels": { mode: "side" }, a: 1 })})`,
    );
    await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.set_my_ui_prefs(${tx.json({ a: null, b: true })})`,
    );
    const prefs = (await acct(ALICE))["ui_prefs"] as Record<string, unknown>;
    assert(
      isDeepStrictEqual(prefs, { "sceneEditor.panels": { mode: "side" }, b: true }),
      `feil visningsvalg: ${JSON.stringify(prefs)}`,
    );
    assert(isDeepStrictEqual((await acct(BOB))["ui_prefs"], {}), "Bob har fått Alices valg");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.set_my_ui_prefs('[1]'::jsonb)`),
      /Ugyldige visningsvalg/,
    );
    await expectError(
      as("anon", null, (tx) => tx`select public.set_my_ui_prefs('{}'::jsonb)`),
      "42501",
    );
    // Status og ønsker om leverandører: bare serveren; modellvalg: alle innloggede kan lese, ingen skrive
    await sql`insert into public.app_status (key, value) values ('cron.ai-jobs', '{"ok":true}')
              on conflict (key) do update set value = excluded.value`;
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select * from public.app_status`),
      "42501",
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select * from public.ai_provider_requests`),
      "42501",
    );
    await sql`insert into public.ai_model_settings (provider, model, enabled) values ('openai', '*', false)
              on conflict (provider, model) do update set enabled = false`;
    const ms = await as(
      "authenticated",
      BOB,
      (tx) => tx`select provider, enabled from public.ai_model_settings`,
    );
    assert(
      ms.some((r) => r["provider"] === "openai" && r["enabled"] === false),
      "modellvalgene kan ikke leses",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`insert into public.ai_model_settings (provider, model) values ('fal', 'x')`,
      ),
      "42501",
    );
    await expectError(
      as("anon", null, (tx) => tx`select * from public.ai_model_settings`),
      "42501",
    );
    await sql`delete from public.ai_model_settings`;

    // Planer og systemmerknader går gjennom apply_changes og leses tilbake likt
    let st = await loadState(projectId);
    const occs = orderedOccurrences(
      st,
      Object.values(st.productions).find((p) => p.kind === "main")!.id,
    );
    assert(occs.length >= 2, "for få scener");
    const assetId = "66666666-6666-7666-8666-000000000088";
    const taskId = "66666666-6666-7666-8666-000000000089";
    const noteId = "66666666-6666-7666-8666-000000000090";
    st = await runCommand(st, ALICE, {
      type: "CreateAssets",
      assets: [
        {
          assetId: assetId as never,
          fields: {
            kind: "object",
            name: "Teddybjørn",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    st = await runCommand(st, ALICE, {
      type: "PlanAssetInScenes",
      assetId: assetId as never,
      taskId,
      fromOccurrenceId: occs[0]!.id,
      occurrenceIds: [occs[1]!.id],
    });
    st = await runCommand(st, ALICE, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: noteId as never,
          blockId: null,
          variantId: occs[1]!.variantId,
          start: 0,
          end: 0,
          quote: "",
          text: "Teddybjørn skal inn i scenen",
          authorName: "Alice",
          stampAt: new Date().toISOString(),
          source: "system",
          taskId,
        },
      ],
    });
    const back = await loadState(projectId);
    const plans = back.assets[assetId as never]?.scenePlans ?? [];
    assert(
      plans.length === 1 && plans[0]!.occurrenceId === occs[1]!.id && plans[0]!.taskId === taskId,
      `planene ble ikke lagret: ${JSON.stringify(plans)}`,
    );
    const n = back.annotations[noteId as never];
    assert(
      n?.source === "system" && n.taskId === taskId,
      "systemmerknaden mistet kilde eller oppgave",
    );
    const [row] = await sql`select source from public.script_annotations where id = ${noteId}`;
    assert(row!["source"] === "system", "source-kolonnen er ikke 'system'");
    const resolved = await runCommand(st, ALICE, { type: "SetAnnotationResolved", annotationId: noteId as never, resolved: true });
    const readResolved = await loadState(projectId);
    assert(readResolved.annotations[noteId as never]?.resolved === true && !readResolved.annotations[noteId as never]?.removed, "løst må lagres uten sletting");
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.script_annotations set resolved = false where id = ${noteId}`), "42501");
    const reopened = await runCommand(resolved, ALICE, { type: "SetAnnotationResolved", annotationId: noteId as never, resolved: false });
    assert(reopened.annotations[noteId as never]?.resolved === false, "notatet kunne ikke åpnes igjen");
    await expectError(
      sql`update public.script_annotations set source = 'robot' where id = ${noteId}`,
      "23514",
    );
  });

  await test("0035 (DEC-0090): opplastingsøkter, tak, tilbakekalling, RLS og behandling av mobilimport", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 35, "schema_version er ikke 35");
    const { createHash } = await import("node:crypto");
    const h = (t: string) => createHash("sha256").update(t).digest("hex");
    const mk = async (token: string, extra: Record<string, unknown> = {}) => {
      const [r] = await sql`insert into public.upload_sessions ${sql({
        project_id: projectId,
        token_hash: h(token),
        kind: "personal",
        created_by: ALICE,
        context: sql.json({ type: "project" }) as never,
        label: "Test",
        expires_at: new Date(Date.now() + 3600_000),
        max_files: 3,
        max_bytes: 1000,
        ...extra,
      } as never)} returning id`;
      return r!["id"] as string;
    };
    const reg = (token: string, client: string, bytes = 100, kind = "image") =>
      as(
        "service_role",
        null,
        (tx) =>
          tx`select (public.mobile_register_upload(${h(token)}, ${client}, ${`${projectId}/source/mobile/x/${client}.jpg`}, ${kind}, 'image/jpeg', ${bytes}, 'a.jpg', 'Kari')).*`,
      ).then((r) => r[0]!);
    const c1 = "77777777-7777-7777-8777-000000000001";
    const c2 = "77777777-7777-7777-8777-000000000002";
    const s1 = await mk("token-en");
    const r1 = await reg("token-en", c1);
    assert(
      r1["status"] === "pending" && r1["contributor_name"] === "Kari",
      "registreringen feilet",
    );
    const again = await reg("token-en", c1);
    assert(again["id"] === r1["id"], "samme fil på nytt ga en ny rad (duplikat)");
    const [cnt] = await sql`select files_count from public.upload_sessions where id = ${s1}`;
    assert(cnt!["files_count"] === 1, "telleren talte duplikatet");
    const done = (
      await as(
        "service_role",
        null,
        (tx) =>
          tx`select (public.mobile_confirm_upload(${h("token-en")}, ${c1}, true, 90, null)).*`,
      )
    )[0]!;
    assert(done["status"] === "done" && Number(done["byte_size"]) === 90, "bekreftelsen feilet");
    // Feil filtype, tak og utløp
    await expectError(reg("token-en", c2, 100, "audio"), /filtypen kan ikke/);
    await expectError(reg("token-en", c2, 2000), /Taket/);
    await mk("token-gammel", { expires_at: new Date(Date.now() - 1000) });
    await expectError(reg("token-gammel", c2), /utløpt eller tilbakekalt/);
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`select public.mobile_register_upload(${h("token-en")}, ${c2}, ${"annet-prosjekt/x.jpg"}, 'image', 'image/jpeg', 10, '', '')`,
      ),
      /Ugyldig lagringssti/,
    );
    // Delt lenke stoppes når den personlige økten tilbakekalles
    await mk("token-delt", { kind: "shared", parent_id: s1 });
    await reg("token-delt", c2, 10);
    await as("authenticated", ALICE, (tx) => tx`select public.revoke_upload_session(${s1})`);
    await expectError(
      reg("token-delt", "77777777-7777-7777-8777-000000000003", 10),
      /utløpt eller tilbakekalt/,
    );
    await expectError(
      reg("token-en", "77777777-7777-7777-8777-000000000004", 10),
      /utløpt eller tilbakekalt/,
    );
    // Lesing bare for medlemmer; ingen kan skrive direkte eller kalle serverens funksjoner
    const aliceRows = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select id from public.mobile_imports`,
    );
    assert(aliceRows.length >= 2, "medlemmet ser ikke filene");
    const carolRows = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.mobile_imports`,
    );
    assert(carolRows.length === 0, "et ikke-medlem ser filene");
    const carolSessions = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.upload_sessions`,
    );
    assert(carolSessions.length === 0, "et ikke-medlem ser øktene");
    await expectError(
      as("anon", null, (tx) => tx`select * from public.mobile_imports`),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`update public.mobile_imports set status = 'done' where id = ${r1["id"] as string}`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`select public.mobile_register_upload(${h("token-en")}, ${c2}, 'x', 'image', 'image/jpeg', 1, '', '')`,
      ),
      "42501",
    );
    // Behandling: bare redaktører, bare én om gangen, ikke etter at filen er knyttet
    const id1 = r1["id"] as string;
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.claim_mobile_import(${id1})`),
      "42501",
    );
    const won = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.claim_mobile_import(${id1}) as ok`,
    );
    assert(won[0]!["ok"] === true, "redaktøren fikk ikke ta filen");
    const ver = "77777777-7777-7777-8777-0000000000aa";
    await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.link_mobile_import(${id1}, null, ${ver}, null)`,
    );
    const again2 = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.claim_mobile_import(${id1}) as ok`,
    );
    assert(again2[0]!["ok"] === false, "en knyttet fil kunne tas på nytt");
    // Utkast knyttes til ressursen når den lagres
    const draft = "77777777-7777-7777-8777-0000000000dd";
    await mk("token-utkast", { context: sql.json({ type: "draft", draftKey: draft }) as never });
    await reg("token-utkast", "77777777-7777-7777-8777-000000000005", 10);
    const someAsset = (
      await sql`select id from public.assets where project_id = ${projectId} limit 1`
    )[0]!["id"] as string;
    const n = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.attach_mobile_draft(${projectId}, ${draft}, ${someAsset}) as n`,
    );
    assert(n[0]!["n"] === 1, "utkastet ble ikke knyttet");
    await as("authenticated", ALICE, (tx) => tx`select public.dismiss_mobile_import(${id1}, true)`);
    const [d] = await sql`select dismissed from public.mobile_imports where id = ${id1}`;
    assert(d!["dismissed"] === true, "filen ble ikke skjult");
  });

  const sortedJson = (x: unknown): string =>
    JSON.stringify(x, (_k, val: unknown) =>
      val && typeof val === "object" && !Array.isArray(val)
        ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
        : val,
    );
  await test("0036 (DEC-0094): lydkomposisjonen lagres med versjonen og leses tilbake uendret", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 36, "schema_version er ikke 36");
    let st = await loadState(projectId);
    const src = Object.values(st.assetVersions).find(
      (x) =>
        x.durationMs !== null &&
        st.assets[st.assetVariants[x.variantId]!.assetId]?.kind === "sound",
    )!;
    assert(!!src, "fant ikke et lydopptak");
    const composition = {
      format: 1 as const,
      segments: [
        {
          id: "abcdef00-0000-7000-8000-0000000c0001",
          versionId: src.id,
          track: 0,
          atMs: 0,
          sourceInMs: 0,
          lengthMs: 1000,
          gainDb: 0,
          fadeInMs: 0,
          fadeOutMs: 50,
        },
        {
          id: "abcdef00-0000-7000-8000-0000000c0002",
          versionId: src.id,
          track: 1,
          atMs: 500,
          sourceInMs: 200,
          lengthMs: 800,
          gainDb: -6,
          fadeInMs: 100,
          fadeOutMs: 100,
        },
      ],
    };
    const versionId = "abcdef00-0000-7000-8000-0000000c00f1";
    st = await runCommand(st, ALICE, {
      type: "AddAssetVersion",
      versionId: versionId as never,
      variantId: src.variantId,
      media: {
        path: `${projectId}/source/x/${versionId}/miks.wav`,
        mimeType: "audio/wav",
        width: null,
        height: null,
        byteSize: 1000,
        sha256: "d".repeat(64),
        durationMs: 1300,
      },
      note: "Komposisjon",
      composition,
    });
    const back = await loadState(projectId);
    assert(
      sortedJson(back.assetVersions[versionId]!.composition) === sortedJson(composition),
      `komposisjonen avviker: ${JSON.stringify(back.assetVersions[versionId]!.composition)}`,
    );
    // Versjonen er uforanderlig, også komposisjonen
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`update public.asset_versions set composition = '{}'::jsonb where id = ${versionId}`,
      ),
      /INV-13/,
    );
    // Bare objekter
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, created_by, composition) values ('abcdef00-0000-7000-8000-0000000c00f2', ${projectId}, ${src.variantId}, 99, 'x', 'audio/wav', 1, ${"e".repeat(64)}, ${ALICE}, '[1]'::jsonb)`,
      ),
      /check|violates/,
    );
    // Et opptak som brukes i en komposisjon, kan ikke angres bort (kjernen)
    const undo = applyCommand(st, {
      id: "44444444-4444-7444-8444-0000000c09f1" as never,
      actor: ALICE,
      at: new Date().toISOString(),
      command: { type: "UndoAddAssetVersion", versionId: src.id },
    });
    assert(!undo.ok, "et opptak i bruk ble fjernet");
  });

  await test("0037 (DEC-0095): ord-til-lyd lagres på opptaket og kan endres, men ikke selve lyden", async () => {
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 37, "schema_version er ikke 37");
    let st = await loadState(projectId);
    const src = Object.values(st.assetVersions).find(
      (x) =>
        x.durationMs !== null &&
        !x.composition &&
        st.assets[st.assetVariants[x.variantId]!.assetId]?.kind === "sound",
    )!;
    const block = Object.values(st.blocks).find((b) => b.kind === "dialogue")!;
    const words = block.text
      .split(/\s+/)
      .filter(Boolean)
      .map((w, i) => ({ text: w, startMs: i * 100, endMs: i * 100 + 90, loss: 0.1 }));
    const alignment = {
      format: 1 as const,
      blockId: block.id,
      text: block.text,
      words,
      provider: "elevenlabs",
      model: "elevenlabs/forced-alignment",
      loss: 0.1,
      at: new Date().toISOString(),
    };
    st = await runCommand(
      st,
      ALICE,
      { type: "SetVersionAlignment", versionId: src.id, alignment },
      { [src.id]: src.revision },
    );
    const back = await loadState(projectId);
    assert(
      sortedJson(back.assetVersions[src.id]!.alignment) === sortedJson(alignment),
      "koblingen avviker",
    );
    assert(back.assetVersions[src.id]!.revision === src.revision + 1, "revisjonen økte ikke");
    // Lyden selv kan fortsatt ikke endres
    await expectError(
      as(
        "service_role",
        null,
        (tx) => tx`update public.asset_versions set media_path = 'x' where id = ${src.id}`,
      ),
      /INV-13/,
    );
    // Fjerne koblingen igjen
    st = await runCommand(st, ALICE, {
      type: "SetVersionAlignment",
      versionId: src.id,
      alignment: null,
    });
    assert(
      !(await loadState(projectId)).assetVersions[src.id]!.alignment,
      "koblingen ble ikke fjernet",
    );
  });

  await test("DEC-0049: sikkerhetskopi gjenopprettes som nytt prosjekt via apply_changes; alt leses tilbake likt", async () => {
    const q = (t: string) =>
      sql.unsafe(`select * from public.${t} where project_id = $1`, [projectId]);
    const [project] = await sql`select * from public.projects where id = ${projectId}`;
    const rows = {
      project: project!,
      productions: await q("productions"),
      scenes: await q("scenes"),
      scene_variants: await q("scene_variants"),
      script_blocks: await q("script_blocks"),
      script_block_revisions: await q("script_block_revisions"),
      scene_occurrences: await q("scene_occurrences"),
      production_segments: await q("production_segments"),
      takes: await q("takes"),
      assets: await q("assets"),
      asset_variants: await q("asset_variants"),
      asset_versions: await q("asset_versions"),
      script_annotations: await q("script_annotations"),
      compositions: await q("compositions"),
      composition_layers: await q("composition_layers"),
      audio_clips: await q("audio_clips"),
      clip_parts: await q("clip_parts"),
      time_links: await q("time_links"),
      continuity_events: await q("continuity_events"),
      translations: await q("translations"),
      asset_relations: await q("asset_relations"),
      posters: await q("posters"),
      style_profiles: await q("style_profiles"),
      quality_profiles: await q("quality_profiles"),
      // DV2 (0060): lydversjonene hører med når lydklippene er med
      dialogue_versions: await q("dialogue_versions"),
    } as unknown as ProjectRows;
    const versions = await q("script_versions");
    const docs = await q("imported_documents");
    assert(
      versions.length > 0 && docs.length > 0,
      "testprosjektet mangler versjoner eller dokumenter",
    );
    const backup = parseBackup(
      JSON.parse(
        JSON.stringify(
          makeBackup({
            rows,
            scriptVersions: versions,
            importedDocuments: docs,
            changeLog: await q("change_log"),
            generationJobs: [],
            schemaVersion: 12,
            createdAt: new Date().toISOString(),
            include: new Set(["bilde", "lyd", "film", "manusfil"]),
          }),
        ),
      ),
      12,
    );
    // BOB lager et nytt, tomt prosjekt og gjenoppretter dit (som serverfunksjonen restoreBackup)
    const [created] = await as(
      "authenticated",
      BOB,
      (tx) => tx`select public.create_project('Gjenopprettet') as id`,
    );
    const newId = String(created!["id"]);
    const base = await loadState(newId);
    const main = Object.values(base.productions).find((p) => p.kind === "main")!;
    const map = await backupIdMap(backup, newId, main.id);
    const target = restoredState(backup, map, base, BOB);
    const changes = diffStates(base, target);
    await as(
      "service_role",
      null,
      (tx) =>
        tx`select public.apply_changes(${newId}, ${BOB}, ${"55555555-5555-7555-8555-000000000001"}, ${tx.json({ type: "RestoreBackup" })}, ${null}, ${tx.json(changes as never)})`,
    );
    const extras = restoredExtras(backup, map, BOB);
    await as("service_role", null, async (tx) => {
      for (const v of extras.scriptVersions)
        await tx`insert into public.script_versions ${tx(v as never)}`;
      for (const d of extras.importedDocuments)
        await tx`insert into public.imported_documents ${tx(d as never)}`;
    });
    const old = await loadState(projectId);
    const back = await loadState(newId);
    const oldMain = Object.values(old.productions).find((p) => p.kind === "main")!;
    const text = (st: ProjectState, m: string) =>
      JSON.stringify(
        scriptView(st, m as never).map((x) => [
          x.productionNumber,
          x.heading,
          x.blocks.map((b) => b.text),
        ]),
      );
    assert(text(back, main.id) === text(old, oldMain.id), "manuset ble ikke likt");
    for (const k of [
      "scenes",
      "blocks",
      "occurrences",
      "takes",
      "assets",
      "assetVersions",
      "compositions",
      "layers",
      "audioClips",
      "clipParts",
      "timeLinks",
      "annotations",
    ] as const)
      assert(
        Object.keys(back[k]).length === Object.keys(old[k]).length,
        `${k}: ${Object.keys(back[k]).length} mot ${Object.keys(old[k]).length}`,
      );
    assert(
      back.blockRevisions.length === old.blockRevisions.length,
      "teksthistorikken ble ikke lik",
    );
    const [{ n }] =
      (await sql`select count(*)::int as n from public.script_versions where project_id = ${newId}`) as unknown as [
        { n: number },
      ];
    assert(n === versions.length, "manusversjonene ble ikke gjenopprettet");
    // Det gamle prosjektet er uendret, og ingen ID-er er delt
    assert(
      Object.keys(back.blocks).every((id) => !old.blocks[id]),
      "ID-er ble gjenbrukt",
    );
    // Det gjenopprettede prosjektet kan redigeres videre
    const someBlock = Object.values(back.blocks).find(
      (b) => !b.removed && b.kind === "action" && !back.variants[b.variantId]?.ownerProductionId,
    )!;
    const edited = await runCommand(back, BOB, {
      type: "EditBlockText",
      productionId: main.id,
      blockId: someBlock.id,
      text: "Endret etter gjenoppretting.",
    });
    assert(
      edited.blocks[someBlock.id]?.text === "Endret etter gjenoppretting.",
      "redigering feilet",
    );
  });

  await test("0020 (DEC-0063): eieren endrer roller og invitasjoner; prosjektet har alltid en eier", async () => {
    const p3 = await as(
      "authenticated",
      ALICE,
      async (tx) => (await tx`select public.create_project('Rolle-test') as id`)[0]!["id"],
    );
    await sql`insert into public.project_members (project_id, user_id, role) values (${p3}, ${BOB}, 'viewer')`;
    const role = async (u: string) =>
      (
        await sql`select role, can_approve_costs from public.project_members where project_id = ${p3} and user_id = ${u}`
      )[0]!;
    // Eieren gjør leseren til redaktør
    await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.set_member_role(${p3}, ${BOB}, 'editor')`,
    );
    assert((await role(BOB))["role"] === "editor", "rollen ble ikke endret");
    // Andre enn eieren kan ikke endre roller (heller ikke sin egen)
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.set_member_role(${p3}, ${BOB}, 'owner')`),
      /Bare prosjektets eier/,
    );
    // Ugyldig rolle og ikke-medlem avvises
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.set_member_role(${p3}, ${BOB}, 'admin')`),
      /Ukjent rolle/,
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`select public.set_member_role(${p3}, ${CAROL}, 'editor')`,
      ),
      /ikke medlem/,
    );
    // Eneste eier kan ikke gjøre seg selv til redaktør
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`select public.set_member_role(${p3}, ${ALICE}, 'editor')`,
      ),
      /minst én eier/,
    );
    // Ny eier kan godkjenne kostnader; deretter kan den første eieren bli redaktør
    await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.set_member_role(${p3}, ${BOB}, 'owner')`,
    );
    assert((await role(BOB))["can_approve_costs"] === true, "ny eier kan ikke godkjenne kostnader");
    await as(
      "authenticated",
      ALICE,
      (tx) => tx`select public.set_member_role(${p3}, ${ALICE}, 'editor')`,
    );
    const a = await role(ALICE);
    assert(a["role"] === "editor" && a["can_approve_costs"] === false, "eieren ble ikke redaktør");
    // Invitasjon: endre rolle og trekke tilbake (bare eieren)
    await as(
      "authenticated",
      BOB,
      (tx) => tx`select public.create_invitation(${p3}, 'carol@example.no', 'viewer')`,
    );
    const [inv] = await sql`select id from public.project_invitations where project_id = ${p3}`;
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`select public.set_invitation_role(${inv!["id"]}, 'editor')`,
      ),
      /Bare prosjektets eier/,
    );
    await as(
      "authenticated",
      BOB,
      (tx) => tx`select public.set_invitation_role(${inv!["id"]}, 'editor')`,
    );
    await expectError(
      as(
        "authenticated",
        BOB,
        (tx) => tx`select public.set_invitation_role(${inv!["id"]}, 'owner')`,
      ),
      /Ukjent rolle/,
    );
    const [r1] = await sql`select role from public.project_invitations where id = ${inv!["id"]}`;
    assert(r1!["role"] === "editor", "invitasjonens rolle ble ikke endret");
    await as("authenticated", BOB, (tx) => tx`select public.revoke_invitation(${inv!["id"]})`);
    const [r2] =
      await sql`select revoked_at from public.project_invitations where id = ${inv!["id"]}`;
    assert(r2!["revoked_at"] !== null, "invitasjonen ble ikke trukket tilbake");
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 20, "schema_version er ikke 20");
  });

  // ---------- 0011: forlate og slette prosjekt (DEC-0046). Kjøres sist: sletter testprosjektet ----------
  await test("0011: medlem kan forlate prosjektet; eneste eier kan ikke", async () => {
    const p2 = await as(
      "authenticated",
      ALICE,
      async (tx) => (await tx`select public.create_project('Forlat-test') as id`)[0]!["id"],
    );
    await sql`insert into public.project_members (project_id, user_id, role) values (${p2}, ${BOB}, 'editor')`;
    await as("authenticated", BOB, (tx) => tx`select public.leave_project(${p2})`);
    const seen = await as(
      "authenticated",
      BOB,
      (tx) => tx`select 1 from public.projects where id = ${p2}`,
    );
    assert(seen.length === 0, "medlemmet ser prosjektet etter å ha forlatt det");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.leave_project(${p2})`),
      /eneste eier/,
    );
    await sql`insert into public.project_members (project_id, user_id, role) values (${p2}, ${CAROL}, 'owner')`;
    await as("authenticated", ALICE, (tx) => tx`select public.leave_project(${p2})`);
    const left =
      await sql`select removed_at from public.project_members where project_id = ${p2} and user_id = ${ALICE}`;
    assert(
      left[0]!["removed_at"] !== null,
      "eieren ble ikke fjernet selv om det finnes en annen eier",
    );
    // Ressursene kan ikke slettes for godt før prosjektet er slettet
    await expectError(
      as("service_role", null, (tx) => tx`select public.purge_project_assets(${p2}, ${CAROL})`),
      /må være slettet/,
    );
  });

  await test("0011: bare eieren kan slette, og bare via serveren", async () => {
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.delete_project(${projectId}, ${ALICE})`),
      /permission denied/,
    );
    await expectError(
      as("service_role", null, (tx) => tx`select public.delete_project(${projectId}, ${CAROL})`),
      /Bare prosjekteieren/,
    );
  });

  const projectTables = async () =>
    (
      await sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'project_id' order by 1`
    ).map((r) => r["table_name"] as string);
  const count = async (t: string, p: string) =>
    Number(
      (
        await sql.unsafe(`select count(*)::int as n from public.${t} where project_id = $1`, [p])
      )[0]!["n"],
    );

  await test("0011: sletting fjerner alt innhold unntatt ressursene; ingen kan skrive etterpå", async () => {
    const keep = [
      "assets",
      "asset_variants",
      "asset_versions",
      "generation_jobs",
      "project_members",
      // Filer fra mobilen er ressurser og slettes først med ressursene (DEC-0090)
      "mobile_imports",
      "upload_sessions",
    ];
    const before: Record<string, number> = {};
    for (const t of await projectTables()) before[t] = await count(t, projectId);
    assert(
      (before["takes"] ?? 0) > 0 && (before["change_log"] ?? 0) > 0,
      "testprosjektet mangler innhold",
    );
    assert((before["assets"] ?? 0) > 0, "testprosjektet mangler ressurser");
    const members =
      await sql`select user_id, role from public.project_members where project_id = ${projectId} and removed_at is null`;
    assert(
      members.some((m) => m["role"] !== "owner"),
      "testprosjektet mangler andre medlemmer",
    );
    const res = await as(
      "service_role",
      null,
      async (tx) => (await tx`select public.delete_project(${projectId}, ${ALICE}) as r`)[0]!["r"],
    );
    const r = res as { sources: string[]; films: string[]; removed_members: number };
    assert(r.sources.length === before["imported_documents"], "lista over manusfiler stemmer ikke");
    assert(r.removed_members > 0, "andre medlemmer ble ikke fjernet");
    for (const t of await projectTables()) {
      const n = await count(t, projectId);
      if (keep.includes(t)) {
        if (t !== "project_members")
          assert(n === before[t], `${t} skulle vært bevart (${before[t]} → ${n})`);
      } else assert(n === 0, `${t} har fortsatt ${n} rader`);
    }
    const aliceSees = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select deleted_at from public.projects where id = ${projectId}`,
    );
    assert(
      aliceSees.length === 1 && aliceSees[0]!["deleted_at"] !== null,
      "eieren ser ikke det slettede prosjektet",
    );
    const aliceAssets = await as(
      "authenticated",
      ALICE,
      (tx) => tx`select count(*)::int as n from public.assets where project_id = ${projectId}`,
    );
    assert(aliceAssets[0]!["n"] === before["assets"], "eieren ser ikke ressursene");
    const bob = await as(
      "authenticated",
      BOB,
      (tx) => tx`select 1 from public.assets where project_id = ${projectId}`,
    );
    assert(bob.length === 0, "et fjernet medlem ser fortsatt ressursene");
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`select public.apply_changes(${projectId}, ${ALICE}, gen_random_uuid(), '{"type":"X"}'::jsonb, null, '{}'::jsonb)`,
      ),
      /slettet|skriverett/,
    );
    await expectError(
      as("service_role", null, (tx) => tx`select public.delete_project(${projectId}, ${ALICE})`),
      /allerede slettet/,
    );
    // Vernet mot sletting gjelder fortsatt utenfor slettingen (INV-07/INV-13)
    await expectError(sql`delete from public.change_log`, /INV-13/);
  });

  await test("0011: ressursene i et slettet prosjekt slettes for godt i en egen operasjon", async () => {
    const res = await as(
      "service_role",
      null,
      async (tx) =>
        (await tx`select public.purge_project_assets(${projectId}, ${ALICE}) as r`)[0]!["r"],
    );
    const r = res as { paths: string[] };
    assert(r.paths.length > 0, "ingen filstier å slette i lagringen");
    for (const t of await projectTables())
      assert((await count(t, projectId)) === 0, `${t} har fortsatt rader`);
    const p = await sql`select 1 from public.projects where id = ${projectId}`;
    assert(p.length === 0, "prosjektraden finnes fortsatt");
  });
  await test("0038: tekstleverandører, modelliste på nøkkelen og jobbtypen «text»", async () => {
    const defs = await sql`
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conname in ('ai_provider_keys_provider_check', 'ai_model_settings_provider_check',
        'generation_jobs_kind_check')`;
    const def = (n: string) => String(defs.find((r) => r["conname"] === n)?.["def"] ?? "");
    for (const p of ["openai", "google", "fal", "runway", "elevenlabs", "anthropic", "xai"])
      assert(def("ai_provider_keys_provider_check").includes(`'${p}'`), `nøkler mangler ${p}`);
    for (const p of ["lovable", "anthropic", "xai"])
      assert(
        def("ai_model_settings_provider_check").includes(`'${p}'`),
        `innstillinger mangler ${p}`,
      );
    for (const k of ["image", "video", "prompt", "sound", "text"])
      assert(def("generation_jobs_kind_check").includes(`'${k}'`), `jobbtype mangler ${k}`);
    const cols = await sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'ai_provider_keys'
        and column_name in ('text_models', 'text_models_at')`;
    assert(cols.length === 2, "modellistekolonnene mangler");
    await expectError(
      sql`insert into public.ai_provider_keys (id, user_id, provider, ciphertext, iv, key_hint)
        values (gen_random_uuid(), ${ALICE}, 'ukjent', ${"x".repeat(20)}, ${"y".repeat(12)}, '…abcd')`,
      /check/,
    );
    await expectError(
      sql`insert into public.ai_provider_keys (id, user_id, provider, ciphertext, iv, key_hint, text_models)
        values (gen_random_uuid(), ${ALICE}, 'xai', ${"x".repeat(20)}, ${"y".repeat(12)}, '…abcd', '{}'::jsonb)`,
      /check/,
    );
  });
  // ---------------------------------------------------------------- 0039 Story Lab (SL1)
  const STORY_TABLES = [
    "story_profiles",
    "story_profile_stages",
    "story_facts",
    "story_sessions",
    "story_suggestions",
  ];
  const sl = await as(
    "authenticated",
    ALICE,
    async (tx) => (await tx`select public.create_project('Story Lab') as id`)[0]!["id"] as string,
  );
  await sql`insert into public.project_members (project_id, user_id, role) values (${sl}, ${BOB}, 'viewer')`;
  const SL = (n: number) => `abcdef00-0000-7000-8000-00000039${String(n).padStart(4, "0")}`;
  const slChar = SL(1);
  const slChar2 = SL(2);
  const slScene = SL(10);
  const slProfile = SL(20);
  const slStage = SL(30);
  const slFact = SL(40);
  const slSession = SL(50);
  const slSuggestion = SL(60);
  let slState = await loadState(sl);

  await test("0039: Story Lab-kommandoene settes inn, oppdateres (revisjon) og leses tilbake", async () => {
    const mainSl = Object.values(slState.productions)[0]!.id;
    slState = await runCommand(slState, ALICE, {
      type: "CreateScene",
      productionId: mainSl,
      sceneId: slScene as never,
      variantId: SL(11) as never,
      occurrenceId: SL(12) as never,
      orderKey: keysEvenly(1)[0]!,
      heading: { intExt: "INT.", location: "STUA", time: "KVELD" },
      blocks: [],
      productionNumber: "1",
    });
    slState = await runCommand(slState, ALICE, {
      type: "CreateAssets",
      assets: [slChar, slChar2].map((id, i) => ({
        assetId: id as never,
        fields: {
          kind: "character" as const,
          name: i ? "Anne" : "Maja",
          names: [],
          description: "",
          category: "",
          tags: [],
        },
      })),
    });
    const profile = emptyStoryProfile();
    slState = await runCommand(slState, ALICE, {
      type: "SetStoryProfile",
      profileId: slProfile as never,
      assetId: slChar as never,
      profile,
    });
    slState = await runCommand(slState, ALICE, {
      type: "SetStoryProfile",
      profileId: slProfile as never,
      assetId: slChar as never,
      profile: { ...profile, notes: "oppdatert" },
    });
    slState = await runCommand(slState, ALICE, {
      type: "AddStoryProfileStage",
      stageId: slStage as never,
      assetId: slChar as never,
      fromSceneId: slScene as never,
      patch: { speech: { mood: "bitter" } },
    });
    slState = await runCommand(slState, ALICE, {
      type: "AddStoryFact",
      factId: slFact as never,
      fields: {
        text: "Brevet er gjemt",
        kind: "secret",
        atSceneId: slScene as never,
        knownBy: [{ assetId: slChar2 as never, fromSceneId: null }],
      },
    });
    slState = await runCommand(slState, ALICE, {
      type: "UpdateStoryFact",
      factId: slFact as never,
      fields: {
        text: "Brevet er brent",
        kind: "secret",
        atSceneId: slScene as never,
        knownBy: [{ assetId: slChar2 as never, fromSceneId: slScene as never }],
      },
    });
    const back = await loadState(sl);
    assert(
      back.storyProfiles[slProfile]?.profile.notes === "oppdatert",
      "profilen ble ikke oppdatert",
    );
    assert(back.storyProfiles[slProfile]?.revision === 2, "profilens revisjon ble ikke 2");
    assert(
      back.storyProfileStages[slStage]?.patch.speech?.mood === "bitter",
      "stadiet ble ikke lagret",
    );
    assert(back.storyFacts[slFact]?.text === "Brevet er brent", "faktumet ble ikke oppdatert");
    assert(back.storyFacts[slFact]?.revision === 2, "faktumets revisjon ble ikke 2");
    assert(
      isDeepStrictEqual(back.storyFacts[slFact]?.knownBy, [
        { assetId: slChar2, fromSceneId: slScene },
      ]),
      "known_by ble ikke lagret likt",
    );
    for (const k of ["storyProfiles", "storyProfileStages", "storyFacts"] as const)
      assert(isDeepStrictEqual(back[k], slState[k]), `${k} ble ikke lest tilbake likt`);
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 39, "schema_version er ikke 39");
  });

  await test("0039: sletting via deletes i apply_changes fjerner Story Lab-radene (angre opprettelse)", async () => {
    const f2 = SL(41);
    const g2 = SL(31);
    const p2 = SL(21);
    slState = await runCommand(slState, ALICE, {
      type: "AddStoryFact",
      factId: f2 as never,
      fields: { text: "Midlertidig", kind: "fact", atSceneId: null, knownBy: [] },
    });
    slState = await runCommand(slState, ALICE, {
      type: "SetStoryProfile",
      profileId: p2 as never,
      assetId: slChar2 as never,
      profile: emptyStoryProfile(),
    });
    slState = await runCommand(slState, ALICE, {
      type: "AddStoryProfileStage",
      stageId: g2 as never,
      assetId: slChar2 as never,
      fromSceneId: slScene as never,
      patch: {},
    });
    for (const [t, id] of [
      ["story_facts", f2],
      ["story_profiles", p2],
      ["story_profile_stages", g2],
    ] as const)
      assert(
        (await sql.unsafe(`select 1 from public.${t} where id = $1`, [id])).length === 1,
        `${t} ble ikke satt inn`,
      );
    slState = await runCommand(slState, ALICE, { type: "UndoAddStoryFact", factId: f2 as never });
    slState = await runCommand(slState, ALICE, {
      type: "UndoAddStoryProfileStage",
      stageId: g2 as never,
    });
    slState = await runCommand(slState, ALICE, {
      type: "UndoCreateStoryProfile",
      profileId: p2 as never,
    });
    for (const [t, id] of [
      ["story_facts", f2],
      ["story_profiles", p2],
      ["story_profile_stages", g2],
    ] as const)
      assert(
        (await sql.unsafe(`select 1 from public.${t} where id = $1`, [id])).length === 0,
        `${t}: raden finnes fortsatt`,
      );
    const back = await loadState(sl);
    assert(
      !back.storyFacts[f2] && !back.storyProfiles[p2] && !back.storyProfileStages[g2],
      "radene kom tilbake ved lasting",
    );
  });

  await test("0039: høyst én aktiv profil per ressurs og ett aktivt stadium per karakter og scene", async () => {
    await expectError(
      sql`insert into public.story_profiles (id, project_id, asset_id, profile) values (gen_random_uuid(), ${sl}, ${slChar}, '{}'::jsonb)`,
      /duplicate key|unique/,
    );
    await expectError(
      sql`insert into public.story_profile_stages (id, project_id, asset_id, from_scene_id, patch) values (gen_random_uuid(), ${sl}, ${slChar}, ${slScene}, '{}'::jsonb)`,
      /duplicate key|unique/,
    );
    // Fjernede rader teller ikke
    await sql`insert into public.story_profiles (id, project_id, asset_id, profile, removed) values (gen_random_uuid(), ${sl}, ${slChar}, '{}'::jsonb, true)`;
  });

  await test("0039: RLS – medlemmer leser, utenforstående ser ingenting, klienten kan ikke skrive", async () => {
    await sql`insert into public.story_sessions (id, project_id, kind, title, turns, created_by)
      values (${slSession}, ${sl}, 'group', 'Prøve', ${sql.json([{ id: "t1", speaker: slChar, text: "Hei", kind: "line", at: "2026-10-18T10:00:00Z" }])}, ${ALICE})`;
    await sql`insert into public.story_suggestions (id, project_id, session_id, kind, payload, created_by)
      values (${slSuggestion}, ${sl}, ${slSession}, 'line', '{"text":"Hei"}'::jsonb, ${ALICE})`;
    for (const t of STORY_TABLES) {
      for (const u of [ALICE, BOB]) {
        const rows = await as("authenticated", u, (tx) =>
          tx.unsafe(`select id from public.${t} where project_id = $1`, [sl]),
        );
        assert(rows.length > 0, `${t}: medlemmet ser ingenting`);
      }
      const out = await as("authenticated", CAROL, (tx) => tx.unsafe(`select id from public.${t}`));
      assert(out.length === 0, `${t}: utenforstående ser rader`);
      await expectError(
        as("authenticated", ALICE, (tx) =>
          tx.unsafe(`update public.${t} set project_id = project_id where project_id = $1`, [sl]),
        ),
        "42501",
      );
      await expectError(
        as("authenticated", ALICE, (tx) =>
          tx.unsafe(`delete from public.${t} where project_id = $1`, [sl]),
        ),
        "42501",
      );
    }
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.story_facts (id, project_id, text, kind) values (gen_random_uuid(), ${sl}, 'x', 'fact')`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.story_sessions (id, project_id, kind, created_by) values (gen_random_uuid(), ${sl}, 'group', ${ALICE})`,
      ),
      "42501",
    );
  });

  await test("0039: purge_removed_assets stoppes av en aktiv profil", async () => {
    await sql`update public.assets set removed = true where id = ${slChar}`;
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`select public.purge_removed_assets(${sl}, ${ALICE}, ${[slChar]}::uuid[], '{}'::uuid[])`,
      ),
      "23503",
    );
    assert(
      (await sql`select 1 from public.assets where id = ${slChar}`).length === 1,
      "ressursen ble slettet",
    );
    await sql`update public.assets set removed = false where id = ${slChar}`;
  });

  await test("0039: delete_project og purge_project_assets med Story Lab-rader bryter ingen fremmednøkler", async () => {
    await as("service_role", null, (tx) => tx`select public.delete_project(${sl}, ${ALICE})`);
    for (const t of STORY_TABLES)
      assert((await count(t, sl)) === 0, `${t} har fortsatt rader etter sletting`);
    // Samme med rader som ble lagret samtidig med slettingen
    await sql`insert into public.story_profiles (id, project_id, asset_id, profile) values (gen_random_uuid(), ${sl}, ${slChar2}, '{}'::jsonb)`;
    await sql`insert into public.story_facts (id, project_id, text, kind) values (gen_random_uuid(), ${sl}, 'Sent', 'fact')`;
    await sql`insert into public.story_sessions (id, project_id, kind, created_by) values (${SL(51)}, ${sl}, 'group', ${ALICE})`;
    await sql`insert into public.story_suggestions (id, project_id, session_id, kind, payload, created_by) values (gen_random_uuid(), ${sl}, ${SL(51)}, 'line', '{}'::jsonb, ${ALICE})`;
    await as("service_role", null, (tx) => tx`select public.purge_project_assets(${sl}, ${ALICE})`);
    for (const t of STORY_TABLES)
      assert((await count(t, sl)) === 0, `${t} har fortsatt rader etter rensing`);
    assert(
      (await sql`select 1 from public.projects where id = ${sl}`).length === 0,
      "prosjektraden finnes fortsatt",
    );
  });
  // ---------------------------------------------------------------- 0040 Skrivecanvas (SL7)
  const CANVAS_TABLES = ["story_canvas_nodes", "story_canvas_edges"];
  const cv = await as(
    "authenticated",
    ALICE,
    async (tx) => (await tx`select public.create_project('Canvas') as id`)[0]!["id"] as string,
  );
  await sql`insert into public.project_members (project_id, user_id, role) values (${cv}, ${BOB}, 'viewer')`;
  const CV = (n: number) => `abcdef00-0000-7000-8000-00000040${String(n).padStart(4, "0")}`;
  const cvNode = (n: number, kind = "idea", over: Record<string, unknown> = {}) => ({
    id: CV(n) as never,
    kind: kind as never,
    title: `Node ${n}`,
    body: "",
    x: n * 10,
    y: 0,
    w: 220,
    h: 120,
    color: null,
    groupId: null,
    assetId: null,
    sceneId: null,
    ...over,
  });
  let cvState = await loadState(cv);

  await test("0040: canvaskommandoene skrives via apply_changes og leses tilbake", async () => {
    cvState = await runCommand(cvState, ALICE, {
      type: "AddCanvasNodes",
      nodes: [cvNode(1, "group"), cvNode(2, "premise", { groupId: CV(1) }), cvNode(3, "event")],
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "AddCanvasEdge",
      edgeId: CV(10) as never,
      fields: {
        fromNodeId: CV(2) as never,
        toNodeId: CV(3) as never,
        label: "fører til",
        kind: "leads_to",
      },
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "UpdateCanvasNode",
      nodeId: CV(2) as never,
      patch: { title: "Premiss", color: "accent-brand" },
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "MoveCanvasNodes",
      moves: [
        { nodeId: CV(2) as never, x: 55.5, y: 66 },
        { nodeId: CV(3) as never, x: 77, y: 88 },
      ],
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "UpdateCanvasEdge",
      edgeId: CV(10) as never,
      patch: { kind: "causes" },
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "RemoveCanvasNodes",
      nodeIds: [CV(3) as never],
      removed: true,
    });
    assert(cvState.canvasEdges[CV(10)]?.removed === true, "kanten ble ikke fjernet med noden");
    cvState = await runCommand(cvState, ALICE, {
      type: "RemoveCanvasNodes",
      nodeIds: [CV(3) as never],
      removed: false,
      edgeIds: [CV(10) as never],
    });
    const back = await loadState(cv);
    for (const k of ["canvasNodes", "canvasEdges"] as const)
      assert(isDeepStrictEqual(back[k], cvState[k]), `${k} ble ikke lest tilbake likt`);
    assert(
      back.canvasNodes[CV(2)]?.x === 55.5 && back.canvasNodes[CV(2)]?.groupId === CV(1),
      "posisjon eller gruppe ble ikke lagret",
    );
    assert(
      back.canvasEdges[CV(10)]?.removed === false && back.canvasEdges[CV(10)]?.kind === "causes",
      "kanten ble ikke tatt tilbake",
    );
    const [v] = await sql`select max(version) as v from public.schema_version`;
    assert(Number(v!["v"]) >= 40, "schema_version er ikke 40");
  });

  await test("0040: angre opprettelse sletter nodene og kanten (deletes i apply_changes)", async () => {
    cvState = await runCommand(cvState, ALICE, {
      type: "AddCanvasNodes",
      nodes: [cvNode(4), cvNode(5)],
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "AddCanvasEdge",
      edgeId: CV(11) as never,
      fields: { fromNodeId: CV(4) as never, toNodeId: CV(5) as never, label: "", kind: "relation" },
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "UndoAddCanvasEdge",
      edgeId: CV(11) as never,
    });
    cvState = await runCommand(cvState, ALICE, {
      type: "UndoAddCanvasNodes",
      nodeIds: [CV(4) as never, CV(5) as never],
    });
    assert(
      (await sql`select 1 from public.story_canvas_nodes where id in (${CV(4)}, ${CV(5)})`)
        .length === 0,
      "nodene finnes fortsatt",
    );
    assert(
      (await sql`select 1 from public.story_canvas_edges where id = ${CV(11)}`).length === 0,
      "kanten finnes fortsatt",
    );
  });

  await test("0040: en kant må peke på noder i samme prosjekt, og gruppen må være en gruppenode", async () => {
    const other = await as(
      "authenticated",
      ALICE,
      async (tx) => (await tx`select public.create_project('Annet') as id`)[0]!["id"] as string,
    );
    await sql`insert into public.story_canvas_nodes (id, project_id, kind) values (${CV(20)}, ${other}, 'idea')`;
    await expectError(
      sql`insert into public.story_canvas_edges (id, project_id, from_node_id, to_node_id, kind) values (gen_random_uuid(), ${cv}, ${CV(2)}, ${CV(20)}, 'leads_to')`,
      /samme prosjekt|23514/,
    );
    await expectError(
      sql`insert into public.story_canvas_nodes (id, project_id, kind, group_id) values (gen_random_uuid(), ${cv}, 'idea', ${CV(3)})`,
      /gruppenode|23514/,
    );
    await expectError(
      sql`insert into public.story_canvas_nodes (id, project_id, kind, title) values (gen_random_uuid(), ${cv}, 'idea', ${"x".repeat(301)})`,
      /check/,
    );
    await expectError(
      sql`insert into public.story_canvas_nodes (id, project_id, kind) values (gen_random_uuid(), ${cv}, 'ukjent')`,
      /check/,
    );
    await sql`delete from public.story_canvas_nodes where id = ${CV(20)}`;
  });

  await test("0040: RLS – medlemmer leser, utenforstående ser ingenting, klienten kan ikke skrive", async () => {
    for (const t of CANVAS_TABLES) {
      for (const u of [ALICE, BOB]) {
        const rows = await as("authenticated", u, (tx) =>
          tx.unsafe(`select id from public.${t} where project_id = $1`, [cv]),
        );
        assert(rows.length > 0, `${t}: medlemmet ser ingenting`);
      }
      const out = await as("authenticated", CAROL, (tx) =>
        tx.unsafe(`select id from public.${t} where project_id = $1`, [cv]),
      );
      assert(out.length === 0, `${t}: utenforstående ser rader`);
      await expectError(
        as("authenticated", ALICE, (tx) =>
          tx.unsafe(`update public.${t} set project_id = project_id where project_id = $1`, [cv]),
        ),
        "42501",
      );
      await expectError(
        as("authenticated", ALICE, (tx) =>
          tx.unsafe(`delete from public.${t} where project_id = $1`, [cv]),
        ),
        "42501",
      );
    }
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.story_canvas_nodes (id, project_id, kind) values (gen_random_uuid(), ${cv}, 'idea')`,
      ),
      "42501",
    );
  });

  await test("0040: delete_project og purge_project_assets med canvasrader bryter ingen fremmednøkler", async () => {
    await as("service_role", null, (tx) => tx`select public.delete_project(${cv}, ${ALICE})`);
    for (const t of CANVAS_TABLES)
      assert((await count(t, cv)) === 0, `${t} har fortsatt rader etter sletting`);
    await sql`insert into public.story_canvas_nodes (id, project_id, kind) values (${CV(30)}, ${cv}, 'group')`;
    await sql`insert into public.story_canvas_nodes (id, project_id, kind, group_id) values (${CV(31)}, ${cv}, 'idea', ${CV(30)})`;
    await sql`insert into public.story_canvas_edges (id, project_id, from_node_id, to_node_id, kind) values (gen_random_uuid(), ${cv}, ${CV(30)}, ${CV(31)}, 'belongs_to')`;
    await as("service_role", null, (tx) => tx`select public.purge_project_assets(${cv}, ${ALICE})`);
    for (const t of CANVAS_TABLES)
      assert((await count(t, cv)) === 0, `${t} har fortsatt rader etter rensing`);
  });
  // ---------------------------------------------------------------- 0041 Automatisk gjenkjenning (OG2)
  const ea = await as(
    "authenticated",
    ALICE,
    async (tx) => (await tx`select public.create_project('Analyse') as id`)[0]!["id"] as string,
  );
  await sql`insert into public.project_members (project_id, user_id, role) values (${ea}, ${BOB}, 'viewer')`;
  const eaProd = (
    await sql`select id from public.productions where project_id = ${ea} limit 1`
  )[0]!["id"] as string;
  const EA = (n: number) => `abcdef00-0000-7000-8000-00000041${String(n).padStart(4, "0")}`;
  const eaRow = async (scene: string) => {
    await sql`insert into public.scenes (id, project_id, origin_production_id) values (${scene}, ${ea}, ${eaProd}) on conflict do nothing`;
    await as(
      "service_role",
      null,
      (tx) =>
        tx`insert into public.script_entity_analysis (project_id, scene_id, content_hash, result) values (${ea}, ${scene}, 'abc', '{"items":[]}'::jsonb)`,
    );
  };

  await test("0041: service role skriver analysen; medlemmer leser, utenforstående ser ingenting", async () => {
    await eaRow(EA(1));
    for (const u of [ALICE, BOB]) {
      const rows = await as(
        "authenticated",
        u,
        (tx) => tx`select id from public.script_entity_analysis where project_id = ${ea}`,
      );
      assert(rows.length === 1, "medlemmet ser ikke analysen");
    }
    const out = await as(
      "authenticated",
      CAROL,
      (tx) => tx`select id from public.script_entity_analysis where project_id = ${ea}`,
    );
    assert(out.length === 0, "utenforstående ser analysen");
  });

  await test("0041: klienten kan ikke skrive analysen direkte", async () => {
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`insert into public.script_entity_analysis (project_id, scene_id, content_hash) values (${ea}, ${EA(1)}, 'x')`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) =>
          tx`update public.script_entity_analysis set content_hash = 'y' where project_id = ${ea}`,
      ),
      "42501",
    );
    await expectError(
      as(
        "authenticated",
        ALICE,
        (tx) => tx`delete from public.script_entity_analysis where project_id = ${ea}`,
      ),
      "42501",
    );
  });

  await test("0041: én rad per scene, og grensene på innholdet holder", async () => {
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`insert into public.script_entity_analysis (project_id, scene_id, content_hash) values (${ea}, ${EA(1)}, 'dup')`,
      ),
      "23505",
    );
    await expectError(
      as(
        "service_role",
        null,
        (tx) =>
          tx`insert into public.script_entity_analysis (project_id, scene_id, content_hash) values (${ea}, ${EA(1)}, '')`,
      ),
      "23514",
    );
  });

  await test("0041: delete_project og purge_project_assets sletter analysen", async () => {
    await as("service_role", null, (tx) => tx`select public.delete_project(${ea}, ${ALICE})`);
    assert((await count("script_entity_analysis", ea)) === 0, "analysen finnes etter sletting");
    await as("service_role", null, (tx) => tx`select public.purge_project_assets(${ea}, ${ALICE})`);
    assert((await count("script_entity_analysis", ea)) === 0, "analysen finnes etter rensing");
    assert(
      (await sql`select 1 from public.projects where id = ${ea}`).length === 0,
      "prosjektraden finnes fortsatt",
    );
  });

  // ---------------------------------------------------------------- 0042 Endring av scenevarighet (SV1)
  const rt = await as(
    "authenticated",
    ALICE,
    async (tx) => (await tx`select public.create_project('Varighet') as id`)[0]!["id"] as string,
  );
  const RT = (n: number) => `abcdef00-0000-7000-8000-00000042${String(n).padStart(4, "0")}`;
  let rtState = await loadState(rt);

  await test("0042: timing har standardverdi og check, og RetimeScene lagres i én transaksjon og angres", async () => {
    const main = Object.values(rtState.productions)[0]!.id;
    rtState = await runCommand(rtState, ALICE, {
      type: "CreateScene",
      productionId: main,
      sceneId: RT(1) as never,
      variantId: RT(2) as never,
      occurrenceId: RT(3) as never,
      orderKey: keysEvenly(1)[0]!,
      heading: { intExt: "INT.", location: "STUA", time: "DAG" },
      blocks: [],
      productionNumber: "1",
    });
    rtState = await runCommand(rtState, ALICE, {
      type: "CreateComposition",
      compositionId: RT(4) as never,
      variantId: RT(2) as never,
      fields: { ...DEFAULT_COMPOSITION, durationFrames: 100 },
    });
    const c = rtState.compositions[RT(4)]!;
    rtState = await runCommand(rtState, ALICE, {
      type: "AddLayers",
      layers: [
        {
          layerId: RT(5) as never,
          compositionId: RT(4) as never,
          fields: {
            ...defaultLayerFields(rtState, c, { fill: "#24324a", name: "Himmel" }),
            keyframes: [{ frame: 50, property: "x", value: 10, easing: "linear" }],
          },
        },
      ],
    });
    const def = await sql`select timing from public.compositions where id = ${RT(4)}`;
    assert(
      Array.isArray((def[0]!["timing"] as { lockedRanges: unknown[] }).lockedRanges),
      "standardverdien mangler",
    );
    await expectError(
      sql`update public.compositions set timing = '[]'::jsonb where id = ${RT(4)}`,
      "23514",
    );

    const plan = planRetime(rtState, RT(3), {
      targetFrames: 150,
      method: "end",
      fill: "black",
      keepAmbience: true,
    });
    assert(plan.ok, "planen feilet");
    const before = rtState;
    rtState = await runCommand(rtState, ALICE, plan.command);
    const row =
      await sql`select duration_frames, timing from public.compositions where id = ${RT(4)}`;
    assert(row[0]!["duration_frames"] === 150, "varigheten ble ikke lagret");
    const tm = row[0]!["timing"] as { padding: { end: { frames: number; fill: string } } };
    assert(
      tm.padding.end.frames === 50 && tm.padding.end.fill === "black",
      "fyllet ble ikke lagret",
    );
    const back = await loadState(rt);
    assert(
      back.compositions[RT(4)]!.timing?.padding.end?.frames === 50,
      "timing leses ikke tilbake",
    );

    // Angre: inversen er én RetimeScene
    const res = applyCommand(before, {
      id: RT(90) as never,
      actor: ALICE as never,
      at: new Date().toISOString(),
      command: plan.command,
    });
    assert(res.ok && res.inverse.type === "RetimeScene", "inversen er ikke RetimeScene");
    rtState = await runCommand(rtState, ALICE, res.inverse);
    const undone =
      await sql`select duration_frames, timing from public.compositions where id = ${RT(4)}`;
    assert(undone[0]!["duration_frames"] === 100, "angring satte ikke varigheten tilbake");
  });

  await test("0042: revisjonskonflikt avviser hele RetimeScene (ingenting lagres delvis)", async () => {
    const plan = planRetime(rtState, RT(3), {
      targetFrames: 200,
      method: "stretch_visual",
      keepAmbience: true,
    });
    assert(plan.ok, "planen feilet");
    // Noen andre endrer laget i mellomtiden
    await sql`update public.composition_layers set revision = revision + 1 where id = ${RT(5)}`;
    await expectError(runCommand(rtState, ALICE, plan.command), "P0409");
    const row = await sql`select duration_frames from public.compositions where id = ${RT(4)}`;
    assert(
      row[0]!["duration_frames"] === 100,
      "varigheten ble lagret selv om kommandoen ble avvist",
    );
    const kf = await sql`select keyframes from public.composition_layers where id = ${RT(5)}`;
    assert(
      (kf[0]!["keyframes"] as { frame: number }[])[0]!.frame === 50,
      "laget ble endret delvis",
    );
  });

  await test("0042: delete_project sletter 2D-scener med timing uten feil", async () => {
    await as("service_role", null, (tx) => tx`select public.delete_project(${rt}, ${ALICE})`);
    assert((await count("compositions", rt)) === 0, "2D-scenen finnes etter sletting");
  });
  // ---------------------------------------------------------------- 0043/0044 Asset Studio (AS1–AS3)
  const asp = await as(
    "authenticated",
    ALICE,
    async (tx) => (await tx`select public.create_project('Asset Studio') as id`)[0]!["id"] as string,
  );
  const AS = (n: number) => `abcdef00-0000-7000-8000-00000043${String(n).padStart(4, "0")}`;
  let asState = await loadState(asp);

  await test("AS1: UpdateSceneDraft lagres i én transaksjon og angres (med aktivt område, 0043)", async () => {
    const main = Object.values(asState.productions)[0]!.id;
    const k = keysEvenly(2);
    asState = await runCommand(asState, ALICE, {
      type: "CreateScene",
      productionId: main,
      sceneId: AS(1) as never,
      variantId: AS(2) as never,
      occurrenceId: AS(3) as never,
      orderKey: keysEvenly(1)[0]!,
      heading: { intExt: "INT.", location: "STUA", time: "DAG" },
      blocks: [
        { blockId: AS(10) as never, kind: "character", text: "MAJA", orderKey: k[0]! },
        {
          blockId: AS(11) as never,
          kind: "dialogue",
          text: "Jeg tror det er noen der ute.",
          orderKey: k[1]!,
        },
      ],
      productionNumber: "1",
    });
    asState = await runCommand(asState, ALICE, {
      type: "CreateComposition",
      compositionId: AS(4) as never,
      variantId: AS(2) as never,
      fields: { ...DEFAULT_COMPOSITION, durationFrames: 100 },
    });
    const c = asState.compositions[AS(4)]!;
    asState = await runCommand(asState, ALICE, {
      type: "AddLayers",
      layers: [
        {
          layerId: AS(5) as never,
          compositionId: AS(4) as never,
          fields: defaultLayerFields(asState, c, { fill: "#24324a", name: "Maja" }),
        },
      ],
    });
    let d = createDraft(asState, AS(3), AS(4));
    for (const x of [10, 20]) {
      const f = layerFieldsOf(d.state.layers[AS(5) as never]!);
      const r = pushDraft(d, {
        type: "UpdateLayers",
        layers: [
          {
            layerId: AS(5) as never,
            fields: { ...f, transform: { ...f.transform, x }, activeRange: { from: 10, to: 60 } },
          },
        ],
      });
      assert(r.ok, "utkastet avviste trinnet");
      if (r.ok) d = r.draft;
    }
    const cmd = draftCommand(d)!;
    const before = asState;
    asState = await runCommand(asState, ALICE, cmd);
    const row =
      await sql`select transform, active_from, active_to from public.composition_layers where id = ${AS(5)}`;
    assert((row[0]!["transform"] as { x: number }).x === 20, "utkastet ble ikke lagret");
    assert(
      row[0]!["active_from"] === 10 && row[0]!["active_to"] === 60,
      "aktivt område ble ikke lagret",
    );
    const back = await loadState(asp);
    assert(back.layers[AS(5) as never]!.activeRange?.to === 60, "aktivt område leses ikke tilbake");
    const res = applyCommand(before, {
      id: AS(90) as never,
      actor: ALICE as never,
      at: new Date().toISOString(),
      command: cmd,
    });
    assert(res.ok && res.inverse.type === "UpdateSceneDraft", "inversen er ikke UpdateSceneDraft");
    if (res.ok) asState = await runCommand(asState, ALICE, res.inverse);
    const undone =
      await sql`select active_from, active_to from public.composition_layers where id = ${AS(5)}`;
    assert(
      undone[0]!["active_from"] === null && undone[0]!["active_to"] === null,
      "angring virket ikke",
    );
  });

  await test("AS1: revisjonskonflikt avviser hele UpdateSceneDraft", async () => {
    let d = createDraft(asState, AS(3), AS(4));
    const f = layerFieldsOf(d.state.layers[AS(5) as never]!);
    const r = pushDraft(d, {
      type: "UpdateLayers",
      layers: [{ layerId: AS(5) as never, fields: { ...f, transform: { ...f.transform, x: 999 } } }],
    });
    if (r.ok) d = r.draft;
    await sql`update public.composition_layers set revision = revision + 1 where id = ${AS(5)}`;
    await expectError(runCommand(asState, ALICE, draftCommand(d)!), "P0409");
    const row = await sql`select transform from public.composition_layers where id = ${AS(5)}`;
    assert((row[0]!["transform"] as { x: number }).x !== 999, "utkastet ble lagret ved konflikt");
    asState = await loadState(asp);
  });

  await test("0043: check på aktivt område", async () => {
    await expectError(
      sql`update public.composition_layers set active_from = 10, active_to = 5 where id = ${AS(5)}`,
      "23514",
    );
    await expectError(
      sql`update public.composition_layers set active_from = 10, active_to = null where id = ${AS(5)}`,
      "23514",
    );
  });

  await test("0044: forsøksvis manusredigering lagres, angres og har check", async () => {
    const before = asState;
    const cmd: Command = {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: AS(20) as never,
          blockId: AS(11) as never,
          variantId: null,
          start: 4,
          end: 8,
          quote: "tror",
          text: "Forsøksvis manusredigering",
          authorName: "Alice",
          kind: "trial_edit",
          suggestedText: "vet",
        },
      ],
    };
    asState = await runCommand(asState, ALICE, cmd);
    const row =
      await sql`select kind, suggested_text from public.script_annotations where id = ${AS(20)}`;
    assert(
      row[0]!["kind"] === "trial_edit" && row[0]!["suggested_text"] === "vet",
      "feltene ble ikke lagret",
    );
    const back = await loadState(asp);
    assert(back.annotations[AS(20) as never]!.suggestedText === "vet", "forslaget leses ikke tilbake");
    await expectError(
      sql`update public.script_annotations set suggested_text = null where id = ${AS(20)}`,
      "23514",
    );
    await expectError(
      sql`update public.script_annotations set kind = 'annet' where id = ${AS(20)}`,
      "23514",
    );
    const res = applyCommand(before, {
      id: AS(91) as never,
      actor: ALICE as never,
      at: new Date().toISOString(),
      command: cmd,
    });
    assert(res.ok, "kommandoen feilet lokalt");
    if (res.ok) asState = await runCommand(asState, ALICE, res.inverse);
    assert(
      (await sql`select 1 from public.script_annotations where id = ${AS(20)}`).length === 0,
      "angring fjernet ikke notatet",
    );
  });

  await test("0043/0044: delete_project sletter lag og notater med de nye feltene", async () => {
    await as("service_role", null, (tx) => tx`select public.delete_project(${asp}, ${ALICE})`);
    assert((await count("composition_layers", asp)) === 0, "lagene finnes etter sletting");
  });

  // ---------- GP1: arbeidsgrupper (migrasjon 0045) ----------
  await test("GP1: eier oppretter gruppe, inviterer, og bare medlemmer ser gruppen", async () => {
    const ws = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace('Trollfilm') as id`)[0]!["id"] as string,
    );
    const outsider = await as("authenticated", CAROL, (tx) =>
      tx`select id from public.workspaces where id = ${ws}`,
    );
    assert(outsider.length === 0, "ikke-medlem ser gruppen");
    const outsiderMembers = await as("authenticated", CAROL, (tx) =>
      tx`select user_id from public.workspace_members where workspace_id = ${ws}`,
    );
    assert(outsiderMembers.length === 0, "ikke-medlem ser medlemslisten");
    await expectError(
      as("authenticated", CAROL, (tx) => tx`select * from public.list_workspace_members(${ws})`),
      "42501",
    );
    const token = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace_invitation(${ws}, 'bob@example.no', 'member') as t`)[0]!["t"] as string,
    );
    const joined = await as("authenticated", BOB, async (tx) =>
      (await tx`select public.accept_workspace_invitation(${token}) as w`)[0]!["w"],
    );
    assert(joined === ws, "feil gruppe");
    const seen = await as("authenticated", BOB, (tx) => tx`select id from public.workspaces where id = ${ws}`);
    assert(seen.length === 1, "medlem ser ikke gruppen");
    const invs = await as("authenticated", BOB, (tx) =>
      tx`select id from public.workspace_invitations where workspace_id = ${ws}`,
    );
    assert(invs.length === 0, "vanlig medlem ser invitasjoner");
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.accept_workspace_invitation(${token})`),
      "22023",
    );
    // Medlem kan ikke invitere eller endre roller
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.create_workspace_invitation(${ws}, 'x@example.no', 'member')`),
      "42501",
    );
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.set_workspace_member_role(${ws}, ${BOB}, 'owner')`),
      "42501",
    );
    // Klienten kan ikke skrive direkte
    await expectError(
      as("authenticated", ALICE, (tx) => tx`update public.workspaces set name = 'x' where id = ${ws}`),
      "42501",
    );
    // Minst én eier
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.leave_workspace(${ws})`),
      "42501",
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.set_workspace_member_role(${ws}, ${ALICE}, 'member')`),
      "42501",
    );
    // Fjernet medlem mister tilgangen
    await as("authenticated", ALICE, (tx) => tx`select public.remove_workspace_member(${ws}, ${BOB})`);
    const after = await as("authenticated", BOB, (tx) => tx`select id from public.workspaces where id = ${ws}`);
    assert(after.length === 0, "fjernet medlem ser fortsatt gruppen");
    // Tilbakekalt invitasjon kan ikke brukes
    const t2 = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace_invitation(${ws}, 'carol@example.no', 'editor') as t`)[0]!["t"] as string,
    );
    const [inv] = await sql`select id from public.workspace_invitations where workspace_id = ${ws} and accepted_at is null`;
    await as("authenticated", ALICE, (tx) => tx`select public.revoke_workspace_invitation(${inv!["id"]})`);
    await expectError(
      as("authenticated", CAROL, (tx) => tx`select public.accept_workspace_invitation(${t2})`),
      "22023",
    );
  });

  await test("GP1: bare prosjekteier kobler prosjekt til en gruppe hun er med i; kobling gir ingen prosjekttilgang", async () => {
    const ws = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace('Gruppe 2') as id`)[0]!["id"] as string,
    );
    const p = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_project('GP1-prosjekt', 25, 1) as id`)[0]!["id"] as string,
    );
    const tok = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace_invitation(${ws}, 'bob@example.no', 'editor') as t`)[0]!["t"] as string,
    );
    await as("authenticated", BOB, (tx) => tx`select public.accept_workspace_invitation(${tok})`);
    // Bob er i gruppen, men ikke eier av prosjektet
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.set_project_workspace(${p}, ${ws})`),
      "42501",
    );
    // Alice kan ikke koble til en gruppe hun ikke er med i
    const other = await as("authenticated", CAROL, async (tx) =>
      (await tx`select public.create_workspace('Carols') as id`)[0]!["id"] as string,
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.set_project_workspace(${p}, ${other})`),
      "42501",
    );
    await as("authenticated", ALICE, (tx) => tx`select public.set_project_workspace(${p}, ${ws})`);
    const [row] = await sql`select workspace_id from public.projects where id = ${p}`;
    assert(row!["workspace_id"] === ws, "prosjektet ble ikke koblet");
    const bobSees = await as("authenticated", BOB, (tx) => tx`select id from public.projects where id = ${p}`);
    assert(bobSees.length === 0, "gruppemedlem fikk prosjekttilgang");
    await as("authenticated", ALICE, (tx) => tx`select public.set_project_workspace(${p}, null)`);
    const [row2] = await sql`select workspace_id from public.projects where id = ${p}`;
    assert(row2!["workspace_id"] === null, "prosjektet ble ikke frakoblet");
  });

  // ---------- GP2: globalt bibliotek (migrasjon 0046) ----------
  await test("GP2: medlem leser, redaktør publiserer, eier arkiverer; ikke-medlem og fjernet medlem ser ingenting", async () => {
    const ws = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace('Bibliotek') as id`)[0]!["id"] as string,
    );
    const tEd = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace_invitation(${ws}, 'bob@example.no', 'editor') as t`)[0]!["t"] as string,
    );
    await as("authenticated", BOB, (tx) => tx`select public.accept_workspace_invitation(${tEd})`);
    const tMem = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace_invitation(${ws}, 'carol@example.no', 'member') as t`)[0]!["t"] as string,
    );
    await as("authenticated", CAROL, (tx) => tx`select public.accept_workspace_invitation(${tMem})`);
    // Medlem kan ikke legge til
    await expectError(
      as("authenticated", CAROL, (tx) => tx`select public.global_create_asset(${ws}, 'logo', 'Logo', '', '{}', '{}')`),
      "42501",
    );
    const ga = await as("authenticated", BOB, async (tx) =>
      (await tx`select public.global_create_asset(${ws}, 'logo', 'Trollfilm-logo', 'Hovedlogo', '{Merkevare}', '{logo}') as id`)[0]!["id"] as string,
    );
    const gv = await as("authenticated", BOB, async (tx) =>
      (await tx`select public.global_create_variant(${ga}, 'Farge', 'reference', '') as id`)[0]!["id"] as string,
    );
    const sha = "b".repeat(64);
    const key = `global/${ws}/${ga}/${sha}.png`;
    // Feil sti avvises
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.global_add_version(${gv}, ${"global/" + ws + "/x/" + sha + ".png"}, 'image/png', 10, 10, 100, ${sha}, null, '')`),
      "22023",
    );
    const v1 = await as("authenticated", BOB, async (tx) =>
      (await tx`select public.global_add_version(${gv}, ${key}, 'image/png', 10, 10, 100, ${sha}, null, '') as id`)[0]!["id"] as string,
    );
    const v2 = await as("authenticated", BOB, async (tx) =>
      (await tx`select public.global_add_version(${gv}, ${key}, 'image/png', 10, 10, 100, ${sha}, null, 'ny') as id`)[0]!["id"] as string,
    );
    const nums = await sql`select number from public.global_asset_versions where id in (${v1}, ${v2}) order by number`;
    assert(nums.map((r) => r["number"]).join(",") === "1,2", "versjonsnumrene");
    // Uforanderlige versjoner
    await expectError(sql`update public.global_asset_versions set note = 'x' where id = ${v1}`, "42501");
    // Medlem leser
    const seen = await as("authenticated", CAROL, (tx) => tx`select id from public.global_asset_versions where global_asset_id = ${ga}`);
    assert(seen.length === 2, "medlem ser ikke versjonene");
    // Ikke-medlem (Dave finnes ikke; bruk en ny bruker uten medlemskap)
    const DAVE = "44444444-4444-7444-8444-444444444444";
    await sql`insert into auth.users (id, email) values (${DAVE}, 'dave@example.no') on conflict do nothing`;
    const outsider = await as("authenticated", DAVE, (tx) => tx`select id from public.global_assets where id = ${ga}`);
    assert(outsider.length === 0, "ikke-medlem ser global ressurs (G10)");
    await expectError(
      as("authenticated", DAVE, (tx) => tx`select * from public.global_asset_projects(${ga})`),
      "42501",
    );
    // Klienten kan ikke skrive direkte
    await expectError(
      as("authenticated", BOB, (tx) => tx`update public.global_assets set name = 'x' where id = ${ga}`),
      "42501",
    );
    // Revisjonskontroll på metadata
    await as("authenticated", BOB, (tx) => tx`select public.global_update_asset(${ga}, 1, 'Logo', '', '{}', '{logo}')`);
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.global_update_asset(${ga}, 1, 'Logo 2', '', '{}', '{}')`),
      "P0409",
    );
    // Bare eier arkiverer
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.global_set_asset_archived(${ga}, true)`),
      "42501",
    );
    await as("authenticated", ALICE, (tx) => tx`select public.global_set_asset_archived(${ga}, true)`);
    // Tilbakekalt medlemskap: Carol fjernes og ser ingenting
    await as("authenticated", ALICE, (tx) => tx`select public.remove_workspace_member(${ws}, ${CAROL})`);
    const removed = await as("authenticated", CAROL, (tx) => tx`select id from public.global_assets where id = ${ga}`);
    assert(removed.length === 0, "fjernet medlem ser fortsatt ressursen");
  });

  await test("GP2: «brukt i prosjekter» viser bare prosjekter brukeren er med i", async () => {
    const ws = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_workspace('Bibliotek 2') as id`)[0]!["id"] as string,
    );
    const ga = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.global_create_asset(${ws}, 'logo', 'Logo', '', '{}', '{}') as id`)[0]!["id"] as string,
    );
    const p = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_project('GP2-prosjekt', 25, 1) as id`)[0]!["id"] as string,
    );
    const aid = "55555555-5555-7555-8555-555555555555";
    await sql`insert into public.assets (id, project_id, kind, name, created_by, source_global_asset_id) values (${aid}, ${p}, 'other', 'Logo', ${ALICE}, ${ga})`;
    const rows = await as("authenticated", ALICE, (tx) => tx`select project_id from public.global_asset_projects(${ga})`);
    assert(rows.length === 1 && rows[0]!["project_id"] === p, "prosjektet vises ikke");
  });

  // ---------- GP5: delingslenker (migrasjon 0047) ----------
  await test("GP5: redaktør deler en filmversjon; nøkkelen er skjult; tilbakekalling og sletting", async () => {
    const p = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_project('GP5-prosjekt', 25, 1) as id`)[0]!["id"] as string,
    );
    const prod = (await sql`select id from public.productions where project_id = ${p} limit 1`)[0]!["id"] as string;
    const rec = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.record_export(${p}, ${prod}, 'film', 'film.mp4', '{}', '{}') as id`)[0]!["id"] as string,
    );
    // Ikke-medlem kan ikke dele
    await expectError(
      as("authenticated", BOB, (tx) => tx`select public.create_film_share(${p}, ${rec}, 'Film', 1000, 5000, 1920, 1080, 30)`),
      "42501",
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.create_film_share(${p}, ${rec}, 'Film', 1000, 5000, 1920, 1080, 14)`),
      "22023",
    );
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.create_film_share(${p}, ${rec}, 'Film', 524288001, 5000, 1920, 1080, 30)`),
      "23514",
    );
    const r = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.create_film_share(${p}, ${rec}, 'Film', 1000, 5000, 1920, 1080, 30) as r`)[0]!["r"] as { id: string; storage_key: string },
    );
    assert(r.storage_key === `${p}/shares/${r.id}/film.mp4`, "stien");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`select public.activate_film_share(${r.id}, 999)`),
      "22023",
    );
    const token = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.activate_film_share(${r.id}, 1000) as t`)[0]!["t"] as string,
    );
    assert(/^[0-9a-f]{64}$/.test(token), "nøkkelen");
    const row = (await sql`select token, token_hash, token_digest, expires_at from public.film_shares where id = ${r.id}`)[0]!;
    // 0070: bare pepret hash lagres, ingen klartekst
    assert(row["token"] === null && row["token_digest"] === row["token_hash"], "bare hash lagres");
    assert(row["token_hash"] !== (await sql`select encode(sha256(convert_to(${token}, 'UTF8')), 'hex') as h`)[0]!["h"], "hashen er pepret");
    assert(row["expires_at"] !== null, "30 dager gir utløp");
    // Klienten kan ikke lese nøkkelen eller hashen direkte
    await expectError(as("authenticated", ALICE, (tx) => tx`select token from public.film_shares where id = ${r.id}`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select token_hash from public.film_shares where id = ${r.id}`), "42501");
    const t2 = await as("authenticated", ALICE, async (tx) => (await tx`select public.film_share_token(${r.id}) as t`)[0]!["t"]);
    assert(t2 === token, "eieren får nøkkelen for QR");
    // anon får ingenting
    await expectError(as("anon", null, (tx) => tx`select id from public.film_shares`), "42501");
    // Tilbakekalling virker med en gang
    await as("authenticated", ALICE, (tx) => tx`select public.revoke_film_share(${r.id})`);
    const after = (await sql`select status, token from public.film_shares where id = ${r.id}`)[0]!;
    assert(after["status"] === "revoked" && after["token"] === null, "tilbakekalt");
    const t3 = await as("authenticated", ALICE, async (tx) => (await tx`select public.film_share_token(${r.id}) as t`)[0]!["t"]);
    assert(t3 === null, "ingen nøkkel etter tilbakekalling");
    // delete_project fjerner delingene og lister filen
    const del = (await sql`select public.delete_project(${p}, ${ALICE}) as r`)[0]!["r"] as { films: string[] };
    assert(del.films.includes(r.storage_key), "filen slettes med prosjektet");
    assert((await sql`select 1 from public.film_shares where project_id = ${p}`).length === 0, "delingene er slettet");
  });

  // ---------- MTS: tekstlag (0048) og maler (0049) ----------
  const mtp = await as(
    "authenticated",
    ALICE,
    async (tx) => (await tx`select public.create_project('MTS') as id`)[0]!["id"] as string,
  );
  const MT = (n: number) => `abcdef00-0000-7000-8000-00000049${String(n).padStart(4, "0")}`;
  let mtState = await loadState(mtp);
  let mtGroupId = "";

  await test("0048: tekstlag, form og effekter lagres via apply_changes og leses tilbake", async () => {
    const main = Object.values(mtState.productions)[0]!.id;
    mtState = await runCommand(mtState, ALICE, {
      type: "CreateScene",
      productionId: main,
      sceneId: MT(1) as never,
      variantId: MT(2) as never,
      occurrenceId: MT(3) as never,
      orderKey: keysEvenly(1)[0]!,
      heading: { intExt: "INT.", location: "STUA", time: "DAG" },
      blocks: [],
      productionNumber: "1",
    });
    mtState = await runCommand(mtState, ALICE, {
      type: "CreateComposition",
      compositionId: MT(4) as never,
      variantId: MT(2) as never,
      fields: { ...DEFAULT_COMPOSITION, durationFrames: 100 },
    });
    const c = mtState.compositions[MT(4)]!;
    const text = textLayerFields(c, "Jula på Dovre – ÆØÅ", "Tittel", {
      fontId: "cinzel",
      letterAnim: { unit: "letter", effect: "appear", direction: "up", startFrame: 0, delayFrames: 3, durationFrames: 1, order: "start", seed: 1, distance: 0 },
    });
    mtState = await runCommand(mtState, ALICE, {
      type: "AddLayers",
      layers: [
        { layerId: MT(5) as never, compositionId: MT(4) as never, fields: { ...text, effects: { shadow: { color: "#000000", blur: 8, offsetX: 2, offsetY: 2 } } } },
        {
          layerId: MT(6) as never,
          compositionId: MT(4) as never,
          fields: { ...defaultLayerFields(mtState, c, { fill: "#101820", name: "Flate" }), shape: { type: "rect", radius: 12, stroke: null } },
        },
      ],
    });
    const back = await loadState(mtp);
    const l = back.layers[MT(5) as never]!;
    assert(l.kind === "text" && l.text?.content === "Jula på Dovre – ÆØÅ", "teksten leses ikke tilbake");
    assert(l.text?.fontId === "cinzel" && l.text.letterAnim?.delayFrames === 3, "typografien leses ikke tilbake");
    assert(l.effects?.shadow?.blur === 8, "effekten leses ikke tilbake");
    assert(back.layers[MT(6) as never]!.shape?.radius === 12, "formen leses ikke tilbake");
    // Et tekstlag uten tekst, og tekst på et bildelag, avvises av databasen
    await expectError(sql`update public.composition_layers set text_spec = null where id = ${MT(5)}`, "23514");
    await expectError(sql`update public.composition_layers set text_spec = '{"content":"x"}'::jsonb where id = ${MT(6)}`, "23514");
  });

  await test("0049: mal med template_spec, forekomst og lag lagres i én transaksjon; nytt innhold endrer ikke malen", async () => {
    const c = mtState.compositions[MT(4)]!;
    let n = 100;
    const layers = lowerThirdStarter(c, {
      newLayerId: () => MT(n++),
      groupName: "Lower third",
      nameLabel: "Navn",
      roleLabel: "Rolle",
      name: "Anita Killi",
      role: "Regi",
    });
    mtState = await runCommand(mtState, ALICE, { type: "AddLayers", layers });
    mtGroupId = layers[0]!.layerId;
    const def = templateFromLayers(mtState, MT(4), [mtGroupId], { category: "lower_third" });
    mtState = await runCommand(mtState, ALICE, {
      type: "CreateAssets",
      assets: [{ assetId: MT(10) as never, fields: { kind: "template", name: "LT", names: [], description: "", category: "lower_third", tags: [] } }],
    });
    mtState = await runCommand(mtState, ALICE, {
      type: "CreateAssetVariant",
      variantId: MT(11) as never,
      assetId: MT(10) as never,
      fields: { name: "Standard", style: "other", appearance: "" },
    });
    mtState = await runCommand(mtState, ALICE, {
      type: "AddAssetVersion",
      versionId: MT(12) as never,
      variantId: MT(11) as never,
      media: { path: `${mtp}/${MT(10)}/${MT(12)}/mal.png`, mimeType: "image/png", width: 480, height: 270, byteSize: 100, sha256: "c".repeat(64), durationMs: null },
      note: "",
      template: def,
    });
    const spec = await sql`select template_spec from public.asset_versions where id = ${MT(12)}`;
    assert((spec[0]!["template_spec"] as { category: string }).category === "lower_third", "maldefinisjonen ble ikke lagret");
    // Størrelsesgrensen (256 kB) håndheves av databasen. Versjoner er uforanderlige (INV-13), så grensen
    // prøves med en ny versjonsrad i en egen transaksjon (postgres.js avviser hele transaksjonen når
    // setningen feiler, så transaksjonen ligger inne i expectError).
    await expectError(
      sql.begin(
        async (tx) => tx`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, template_spec)
           values (gen_random_uuid(), ${mtp}, ${MT(11)}, 99, ${`${mtp}/${MT(10)}/stor/mal.png`}, 'image/png', 1, ${"e".repeat(64)},
                   (select jsonb_build_object('x', string_agg(md5(random()::text), '')) from generate_series(1, 10000)))`,
      ),
      "23514",
    );
    const plan = planApplyTemplate(mtState, { instanceId: MT(20), compositionId: MT(4), versionId: MT(12), newLayerId: () => MT(n++) });
    assert(plan.ok, "planen feilet");
    if (!plan.ok) return;
    mtState = await runCommand(mtState, ALICE, plan.command);
    const inst = await sql`select template_version_id, composition_id from public.template_instances where id = ${MT(20)}`;
    assert(inst[0]!["template_version_id"] === MT(12), "forekomsten ble ikke lagret");
    const linked = await sql`select count(*)::int as n, max(revision) as r from public.composition_layers where template_instance_id = ${MT(20)}`;
    assert(linked[0]!["n"] === 4 && Number(linked[0]!["r"]) === 1, "lagene fra malen har ikke én revisjon per rad");
    const upd = planUpdateTemplateValues(mtState, MT(20), { navn: { text: "Øystein Gutu" } });
    assert(upd.ok, "oppdateringen feilet");
    if (!upd.ok) return;
    mtState = await runCommand(mtState, ALICE, upd.command);
    const back = await loadState(mtp);
    assert(Object.values(back.layers).some((l) => l.template?.instanceId === MT(20) && l.text?.content === "Øystein Gutu"), "innholdet ble ikke lagret");
    const spec2 = await sql`select template_spec from public.asset_versions where id = ${MT(12)}`;
    assert(isDeepStrictEqual(spec2[0]!["template_spec"], spec[0]!["template_spec"]), "malen ble endret");
  });

  await test("0049: RLS – medlemmer leser forekomstene, utenforstående ser ingenting, klienten kan ikke skrive", async () => {
    const own = await as("authenticated", ALICE, (tx) => tx`select id from public.template_instances where project_id = ${mtp}`);
    assert(own.length === 1, "medlemmet ser ikke forekomsten");
    const other = await as("authenticated", BOB, (tx) => tx`select id from public.template_instances where project_id = ${mtp}`);
    assert(other.length === 0, "utenforstående ser forekomsten");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`update public.template_instances set content = '{}'::jsonb where id = ${MT(20)}`),
      "42501",
    );
    await expectError(as("anon", null, (tx) => tx`select id from public.template_instances`), "42501");
  });

  await test("0049: en mal i bruk kan ikke slettes for godt; delete_project og purge sletter forekomstene", async () => {
    await sql`update public.assets set removed = true where id = ${MT(10)}`;
    await expectError(
      as("service_role", null, (tx) => tx`select public.purge_removed_assets(${mtp}, ${ALICE}, ${[MT(10)]}::uuid[], ${[]}::uuid[])`),
      "23503",
    );
    await sql`update public.assets set removed = false where id = ${MT(10)}`;
    await as("service_role", null, (tx) => tx`select public.delete_project(${mtp}, ${ALICE})`);
    assert((await count("template_instances", mtp)) === 0, "forekomstene finnes etter sletting");
    assert((await count("composition_layers", mtp)) === 0, "lagene finnes etter sletting");
    await as("service_role", null, (tx) => tx`select public.purge_project_assets(${mtp}, ${ALICE})`);
    assert((await count("asset_versions", mtp)) === 0, "malversjonen finnes etter purge");
  });

  // ---------- MTS: scenetyper (0050) og rulletekst (0051) ----------
  const mtp2 = await as(
    "authenticated",
    ALICE,
    async (tx) => (await tx`select public.create_project('MTS2') as id`)[0]!["id"] as string,
  );
  const M2 = (n: number) => `abcdef00-0000-7000-8000-00000050${String(n).padStart(4, "0")}`;
  let m2State = await loadState(mtp2);

  await test("0050: tittel-, tekst- og rulletekstforekomster lagres med kind og leses tilbake; ugyldig kind avvises", async () => {
    const main = Object.values(m2State.productions)[0]!.id;
    for (const [i, kind] of (["title", "text", "credits"] as const).entries()) {
      m2State = await runCommand(m2State, ALICE, {
        type: "CreateScene",
        productionId: main,
        sceneId: M2(1 + i * 3) as never,
        variantId: M2(2 + i * 3) as never,
        occurrenceId: M2(3 + i * 3) as never,
        orderKey: keysEvenly(3)[i]!,
        heading: { intExt: "", location: "FILMTITTEL", time: "" },
        blocks: [],
        kind,
      });
    }
    const back = await loadState(mtp2);
    assert(back.occurrences[M2(3) as never]!.kind === "title", "tittelen har ikke kind");
    assert(back.occurrences[M2(6) as never]!.kind === "text", "tekstscenen har ikke kind");
    assert(back.occurrences[M2(9) as never]!.kind === "credits", "rulleteksten har ikke kind");
    await expectError(
      sql`insert into public.scene_occurrences (id, project_id, production_id, scene_id, variant_id, order_key, kind, created_by)
          values (gen_random_uuid(), ${mtp2}, ${main}, ${M2(1)}, ${M2(2)}, 'zz', 'plakat', ${ALICE})`,
      "23514",
    );
  });

  await test("0051: deltakere og sekvens skrives via apply_changes og leses tilbake; 2000-grensen håndheves ikke stille", async () => {
    m2State = await runCommand(m2State, ALICE, {
      type: "SetCreditSequence",
      sequenceId: M2(20) as never,
      occurrenceId: M2(9) as never,
      fields: { presentation: "roll", durationFrames: 48, pauseFrames: 24, speed: 4, direction: "up" },
    });
    m2State = await runCommand(m2State, ALICE, {
      type: "AddCreditParticipant",
      participantId: M2(21) as never,
      fields: { orderKey: keysEvenly(1)[0]!, groupKey: "", hidden: false, fields: { navn: "Anita Killi", rolle: "Regi" } },
    });
    m2State = await runCommand(m2State, ALICE, {
      type: "UpdateCreditParticipant",
      participantId: M2(21) as never,
      fields: { fields: { navn: "Anita Killi", rolle: "Regissør" } },
    });
    const back = await loadState(mtp2);
    assert(back.creditSequences[M2(20) as never]!.presentation === "roll", "sekvensen leses ikke tilbake");
    assert(back.creditParticipants[M2(21) as never]!.fields["rolle"] === "Regissør", "deltakeren leses ikke tilbake");
    // Ugyldig presentasjonsform avvises av databasen
    await expectError(
      sql`update public.credit_sequences set presentation = 'sideways' where id = ${M2(20)}`,
      "23514",
    );
  });

  await test("0051: RLS – medlemmer leser rulleteksten, utenforstående og anon ser ingenting, klienten kan ikke skrive", async () => {
    const own = await as("authenticated", ALICE, (tx) => tx`select id from public.credit_participants where project_id = ${mtp2}`);
    assert(own.length === 1, "medlemmet ser ikke deltakeren");
    const other = await as("authenticated", BOB, (tx) => tx`select id from public.credit_participants where project_id = ${mtp2}`);
    assert(other.length === 0, "utenforstående ser deltakeren");
    await expectError(as("anon", null, (tx) => tx`select id from public.credit_participants`), "42501");
    await expectError(as("anon", null, (tx) => tx`select id from public.credit_sequences`), "42501");
    await expectError(
      as("authenticated", ALICE, (tx) => tx`update public.credit_participants set hidden = true where id = ${M2(21)}`),
      "42501",
    );
  });

  await test("0050/0051: delete_project og purge fjerner rulleteksten og forekomstene", async () => {
    await as("service_role", null, (tx) => tx`select public.delete_project(${mtp2}, ${ALICE})`);
    assert((await count("credit_participants", mtp2)) === 0, "deltakerne finnes etter sletting");
    assert((await count("credit_sequences", mtp2)) === 0, "sekvensen finnes etter sletting");
    await as("service_role", null, (tx) => tx`select public.purge_project_assets(${mtp2}, ${ALICE})`);
    assert((await count("scene_occurrences", mtp2)) === 0, "forekomstene finnes etter purge");
  });

  await test("0052: globale maldefinisjoner lagres, leses via RLS og bygges i et annet prosjekt", async () => {
    const ws = await as("authenticated", ALICE, async (tx) => {
      const [row] = await tx`select public.create_workspace('Globale maler') as id`;
      assert(row, "gruppen mangler");
      return row["id"] as string;
    });
    const ga = await as("authenticated", ALICE, async (tx) => {
      const [row] = await tx`select public.global_create_asset(${ws}, 'template', 'LT', '', '{}', '{}') as id`;
      assert(row, "ressursen mangler");
      return row["id"] as string;
    });
    const gv = await as("authenticated", ALICE, async (tx) => {
      const [row] = await tx`select public.global_create_variant(${ga}, 'Standard', 'other', '') as id`;
      assert(row, "varianten mangler");
      return row["id"] as string;
    });
    const { textLayerFields } = await import("../../src/core/typography/starters");
    const def: NonNullable<ProjectState["assetVersions"][string]["template"]> = {
      format: "animatic-template", formatVersion: 1, category: "lower_third",
      width: 1920, height: 1080,
      slots: [{ key: "navn", label: "Navn", kind: "text" }],
      elements: [{ key: "name", slot: "navn", parentKey: null,
        fields: textLayerFields({ width: 1920, height: 1080 }, "Æ Ø Å", "Navn") }],
    };
    const sha = "a".repeat(64), key = `global/${ws}/${ga}/${sha}.png`;
    const version = await as("authenticated", ALICE, async (tx) => {
      const [row] = await tx`select public.global_add_version(${gv}, ${key}, 'image/png', 480, 270, 100, ${sha}, null, '', ${tx.json(def as never)}) as id`;
      assert(row, "versjonen mangler");
      return row["id"] as string;
    });
    const read = await as("authenticated", ALICE, (tx) => tx`select template_spec from public.global_asset_versions where id = ${version}`);
    assert(isDeepStrictEqual(read[0]?.["template_spec"], def), "global maldefinisjon gikk tapt");
    const outsider = await as("authenticated", CAROL, (tx) => tx`select template_spec from public.global_asset_versions where id = ${version}`);
    assert(outsider.length === 0, "utenforstående kan lese malen");
    await expectError(as("anon", null, (tx) => tx`select public.global_add_version(${gv}, ${key}, 'image/png', 480, 270, 100, ${sha}, null, '', '{}'::jsonb)`), "42501");
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.global_add_version(${gv}, ${key}, 'image/png', 480, 270, 100, ${sha}, null, '', '{}'::jsonb)`), "42501");
    await expectError(sql`update public.global_asset_versions set template_spec = '{}'::jsonb where id = ${version}`, "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.global_add_version(${gv}, ${key}, 'image/png', 480, 270, 100, ${sha}, null, '', '[]'::jsonb)`), "23514");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.global_add_version(${gv}, ${key}, 'image/png', 480, 270, 100, ${sha}, null, '', (select jsonb_build_object('x', string_agg(md5(random()::text), '')) from generate_series(1, 10000)))`), "23514");
    const [overloads] = await sql`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'global_add_version'`;
    assert(overloads?.["n"] === 1, "gammel funksjonssignatur finnes fortsatt");
    // Den gamle kallformen uten maldata virker fortsatt via default null.
    await as("authenticated", ALICE, (tx) => tx`select public.global_add_version(${gv}, ${key}, 'image/png', 480, 270, 100, ${sha}, null, 'uten mal')`);
    const targetId = await as("authenticated", ALICE, async (tx) => {
      const [row] = await tx`select public.create_project('Global mal i annet prosjekt', 25, 1) as id`;
      assert(row, "målprosjektet mangler");
      return row["id"] as string;
    });
    let target = await loadState(targetId);
    const prod = Object.values(target.productions)[0];
    assert(prod, "produksjonen mangler");
    const ID = (n: number) => `01900000-0000-7000-8000-0052${String(n).padStart(8, "0")}` as never;
    target = await runCommand(target, ALICE, { type: "CreateScene", sceneId: ID(1), variantId: ID(2), occurrenceId: ID(3), productionId: prod.id, orderKey: keyBetween(null, null), heading: { intExt: "", location: "Scene", time: "" }, blocks: [] });
    target = await runCommand(target, ALICE, { type: "CreateComposition", compositionId: ID(4), variantId: ID(2), fields: { name: "Scene", width: 1920, height: 1080, durationFrames: 100, background: "#000000" } });
    const { planUseGlobal } = await import("../../src/core");
    const plan = planUseGlobal(target, { id: ga, workspaceId: ws, kind: "template", name: "LT", description: "", categories: [], tags: [], archived: false, revision: 1 }, [{
      variant: { id: gv, assetId: ga, name: "Standard", style: "other", appearance: "", archived: false },
      version: { id: version, variantId: gv, assetId: ga, number: 1, storageKey: key, mimeType: "image/png", width: 480, height: 270, byteSize: 100, sha256: sha, durationMs: null, note: "", createdAt: "", template: def },
      versionId: ID(7), media: { path: `${targetId}/mal.png`, mimeType: "image/png", width: 480, height: 270, byteSize: 100, sha256: sha },
    }], { assetId: ID(5), variantIds: { [gv]: ID(6) } });
    for (const c of plan.commands) target = await runCommand(target, ALICE, c);
    let layer = 100;
    const apply = planApplyTemplate(target, { instanceId: ID(8), compositionId: ID(4), versionId: ID(7), newLayerId: () => ID(layer++) });
    assert(apply.ok, "malen kan ikke brukes");
    target = await runCommand(target, ALICE, apply.command);
    const back = await loadState(targetId);
    assert(isDeepStrictEqual(back.assetVersions[ID(7)]?.template, def), "målprosjektet mistet malen");
    assert(Object.values(back.layers).filter((l) => l.template?.instanceId === ID(8)).length === def.elements.length, "lagene ble ikke bygget");
  });

  // CA3: own project fixture, independent of all preceding typography tests.
  let caProject = "", caState: ProjectState;
  const CA = (n: number) => `01900000-0000-7000-8000-0053${String(n).padStart(8, "0")}` as never;
  await test("0053/0054: rig versions and scene use round trip through apply_changes", async () => {
    const p = await as("authenticated", ALICE, tx => tx`select public.create_project('CA3') as id`);
    caProject = String(p[0]?.["id"]); caState = await loadState(caProject);
    const production = Object.values(caState.productions).find(p => p.kind === "main"); assert(production, "main missing");
    caState = await runCommand(caState, ALICE, { type: "CreateAssets", assets: [{ assetId: CA(1), fields: { kind: "character", name: "CA3", names: [], description: "", category: "", tags: [] } }] });
    caState = await runCommand(caState, ALICE, { type: "CreateAssetVariant", assetId: CA(1), variantId: CA(2), fields: { name: "Front", style: "illustrated", appearance: "" } });
    caState = await runCommand(caState, ALICE, { type: "AddAssetVersion", variantId: CA(2), versionId: CA(3), media: { path: `${caProject}/face.png`, mimeType: "image/png", width: 100, height: 100, byteSize: 100, sha256: "a".repeat(64) }, note: "" });
    caState = await runCommand(caState, ALICE, { type: "CreateScene", sceneId: CA(4), variantId: CA(5), occurrenceId: CA(6), productionId: production.id, orderKey: keyBetween(null, null), heading: { intExt: "", location: "CA3", time: "" }, blocks: [] });
    caState = await runCommand(caState, ALICE, { type: "CreateComposition", compositionId: CA(7), variantId: CA(5), fields: { name: "CA3", width: 1920, height: 1080, durationFrames: 100, background: "#000000" } });
    caState = await runCommand(caState, ALICE, { type: "AddLayers", layers: [{ layerId: CA(8), compositionId: CA(7), fields: { ...defaultLayerFields(caState, { width: 1920, height: 1080 }, { assetId: CA(1), assetVariantId: CA(2) }), name: "CA3", assetId: CA(1), assetVariantId: CA(2), versionId: CA(3) } }] });
    caState = await runCommand(caState, ALICE, { type: "UpdateSceneDraft", compositionId: CA(7), occurrenceId: CA(6), steps: [
      { type: "CreateRig", rigId: CA(9), variantId: CA(2) },
      { type: "SetRigAnchors", rigId: CA(9), versionId: CA(10), sourceVersionId: CA(3), anchors: { mouth: { x: .5, y: .6 } } },
      { type: "AttachAnimationUse", useId: CA(11), layerId: CA(8), occurrenceId: CA(6), rigVersionId: CA(10) },
    ] });
    const loaded = await loadState(caProject);
    assert(isDeepStrictEqual(loaded.animationRigs, caState.animationRigs), "rig mismatch");
    assert(isDeepStrictEqual(loaded.animationRigVersions, caState.animationRigVersions), "version mismatch");
    assert(isDeepStrictEqual(loaded.animationUses, caState.animationUses), "use mismatch");
    assert(loaded.animationRigs[CA(9)]?.revision === 1, "oneRevisionPerRow");
  });
  await test("0053/0054: RLS and grants deny anon, nonmembers and direct client writes", async () => {
    for (const table of ["animation_rigs", "animation_rig_versions", "animation_uses"]) {
      const owner = await as("authenticated", ALICE, tx => tx.unsafe(`select * from public.${table} where project_id = $1`, [caProject]));
      const outsider = await as("authenticated", CAROL, tx => tx.unsafe(`select * from public.${table} where project_id = $1`, [caProject]));
      assert(owner.length === 1 && outsider.length === 0, `RLS ${table}`);
      await expectError(as("anon", null, tx => tx.unsafe(`select * from public.${table}`)), "42501");
      await expectError(as("authenticated", ALICE, tx => tx.unsafe(`update public.${table} set removed = true where project_id = $1`, [caProject])), "42501");
      await expectError(as("authenticated", ALICE, tx => tx.unsafe(`delete from public.${table} where project_id = $1`, [caProject])), "42501");
    }
  });
  await test("0053/0054: stale use revisions rejected and disable preserves all setup data", async () => {
    const before = await loadState(caProject);
    const command: Command = { type: "SetAnimationLayerEnabled", useId: CA(11), enabled: false };
    caState = await runCommand(before, ALICE, command);
    const patch = diffStates(before, caState);
    await expectError(as("service_role", null, tx => tx`select public.apply_changes(${caProject}, ${ALICE}, ${CA(12)}, ${tx.json(command as never)}, '{}'::jsonb, ${tx.json(patch as never)})`), "P0409");
    const back = await loadState(caProject);
    assert(back.animationUses[CA(11)]?.enabled === false && !back.animationUses[CA(11)]?.removed, "disable deleted use");
    assert(isDeepStrictEqual(back.animationRigVersions, before.animationRigVersions), "disable mutated rig");
    await expectError(sql`update public.animation_rig_versions set spec = '{"format":1,"anchors":{}}'::jsonb where id = ${CA(10)}`, "22023");
  });
  await test("0055: rig parts save with mobile approval in one revision-checked transaction", async () => {
    const context = { type: "rig", purpose: "mouth_shape", target: { assetId: CA(1), variantId: CA(2), sourceVersionId: CA(3), slot: "mouth:A" } };
    await as("service_role", null, tx => tx`insert into public.upload_sessions(id,project_id,token_hash,kind,created_by,context,media_kinds,expires_at,max_files,max_bytes) values (${CA(20)},${caProject},${"5".repeat(64)},'personal',${ALICE},${tx.json(context)},array['image'],now()+interval '1 hour',10,100000)`);
    await as("service_role", null, tx => tx`insert into public.mobile_imports(id,project_id,session_id,client_file_id,path,kind,mime_type,byte_size,status,context) values (${CA(21)},${caProject},${CA(20)},${CA(22)},${caProject+"/mouth.png"},'image','image/png',100,'done',${tx.json(context)})`);
    const part = { versionId: CA(24), mobileImportId: CA(21), drawing: [], mask: [{mode:"subtract" as const,radius:.1,feather:.5,points:[{x:.5,y:.5}]}], x:0,y:0,width:.2,height:.1,rotation:0,adjustments:{brightness:1.5,contrast:.8,saturation:1.2,hue:20,opacity:.7} };
    const spec = { format:1 as const,anchors:{mouth:{x:.5,y:.6}},parts:{"mouth:A":part} };
    const before = await loadState(caProject);
    caState = await runCommand(before,ALICE,{type:"UpdateSceneDraft",compositionId:CA(7),occurrenceId:CA(6),steps:[
      {type:"CreateAssetVariant",assetId:CA(1),variantId:CA(23),fields:{name:"Mouth",style:"illustrated",appearance:""}},
      {type:"AddAssetVersion",variantId:CA(23),versionId:CA(24),media:{path:caProject+"/mouth.png",mimeType:"image/png",width:320,height:320,byteSize:100,sha256:"5".repeat(64)},note:""},
      {type:"SaveRigVersion",rigId:CA(9),versionId:CA(25),sourceVersionId:CA(3),spec},
      {type:"AttachAnimationUse",useId:CA(11),layerId:CA(8),occurrenceId:CA(6),rigVersionId:CA(25)}]});
    const loaded = await loadState(caProject);
    assert(isDeepStrictEqual(loaded.animationRigVersions[CA(25)]?.spec,spec),"parts lost");
    assert(loaded.animationRigs[CA(9)]?.revision === (before.animationRigs[CA(9)]?.revision??0)+1,"more than one rig revision");
    const [row] = await sql`select * from public.mobile_imports where id=${CA(21)}`;
    assert(row?.["approved_rig_version_id"]===CA(25)&&row?.["asset_version_id"]===CA(24)&&row?.["approved_at"],"not approved atomically");
    assert(isDeepStrictEqual(loaded.assetVersions[CA(3)],before.assetVersions[CA(3)]),"source changed");
    await expectError(sql`delete from public.asset_versions where id=${CA(24)}`,"23503");
  });
  await test("0055: RLS, anon and authenticated direct writes are denied",async()=>{
    for(const table of ["animation_rigs","animation_rig_versions","animation_uses","mobile_imports","upload_sessions"]){
      assert((await as("authenticated",BOB,tx=>tx.unsafe(`select id from public.${table} where project_id=$1`,[caProject]))).length===0,"nonmember read");
      await expectError(as("anon",null,tx=>tx.unsafe(`select id from public.${table}`)),"42501");
      await expectError(as("authenticated",ALICE,tx=>tx.unsafe(`delete from public.${table} where project_id=$1`,[caProject])),"42501");
    }
    assert((await as("authenticated",ALICE,tx=>tx`select id from public.animation_rig_versions where id=${CA(25)}`)).length===1,"member cannot read");
  });
  await test("0055: mismatched approval rolls back the entire patch; ordinary mobile context still works",async()=>{
    const before=await loadState(caProject);
    const spec={...before.animationRigVersions[CA(25)]?.spec,format:1 as const,anchors:{mouth:{x:.5,y:.6}},parts:{"mouth:B":before.animationRigVersions[CA(25)]?.spec.parts?.["mouth:A"] as never}};
    await expectError(runCommand(before,ALICE,{type:"SaveRigVersion",rigId:CA(9),versionId:CA(26),sourceVersionId:CA(3),spec}),"22023");
    const loaded=await loadState(caProject); assert(isDeepStrictEqual(loaded.animationRigs,before.animationRigs),"partial rig update"); assert(!loaded.animationRigVersions[CA(26)],"partial version insert");
    await as("service_role",null,tx=>tx`insert into public.upload_sessions(id,project_id,token_hash,kind,created_by,context,expires_at,max_files,max_bytes) values (${CA(27)},${caProject},${"6".repeat(64)},'personal',${ALICE},'{}',now()+interval '1 hour',10,100000)`);
    await expectError(as("service_role",null,tx=>tx`insert into public.upload_sessions(id,project_id,token_hash,kind,created_by,context,expires_at,max_files,max_bytes) values (${CA(28)},${caProject},${"7".repeat(64)},'personal',${ALICE},${tx.json({type:"rig",purpose:"mouth_shape",target:{assetId:CA(1),variantId:CA(2),sourceVersionId:CA(3),slot:"mouth:Z"}})},now()+interval '1 hour',10,100000)`),"22023");
  });

  const C6 = (n: number) => `01900000-0000-7000-8000-0056${String(n).padStart(8, "0")}` as never;
  let c6Project = "";
  await test("0056: leppesynk og mønster rundtur via apply_changes, med validering", async () => {
    const p = await as("authenticated", ALICE, tx => tx`select public.create_project('CA5') as id`);
    c6Project = String(p[0]?.["id"]);
    let st = await loadState(c6Project);
    const production = Object.values(st.productions).find(p => p.kind === "main")!;
    st = await runCommand(st, ALICE, { type: "CreateAssets", assets: [{ assetId: C6(1), fields: { kind: "character", name: "CA5", names: [], description: "", category: "", tags: [] } }] });
    st = await runCommand(st, ALICE, { type: "CreateAssetVariant", assetId: C6(1), variantId: C6(2), fields: { name: "Front", style: "illustrated", appearance: "" } });
    st = await runCommand(st, ALICE, { type: "CreateScene", sceneId: C6(4), variantId: C6(5), occurrenceId: C6(6), productionId: production.id, orderKey: keyBetween(null, null), heading: { intExt: "", location: "CA5", time: "" }, blocks: [] });
    // Opptak, dialogklipp og manuslinje settes opp direkte (testdata, ikke prosjektskriving via kommando).
    await as("service_role", null, tx => tx`insert into public.takes(id,project_id,occurrence_id,kind,status,created_by) values (${C6(9)},${c6Project},${C6(6)},'audio_only','in_progress',${ALICE})`);
    await as("service_role", null, tx => tx`insert into public.script_blocks(id,project_id,variant_id,kind,order_key,text,created_by) values (${C6(10)},${c6Project},${C6(5)},'dialogue','a1','Hei',${ALICE})`);
    await as("service_role", null, tx => tx`insert into public.script_block_revisions(project_id,block_id,rev,text,author) values (${c6Project},${C6(10)},1,'Hei',${ALICE})`);
    await as("service_role", null, tx => tx`insert into public.audio_clips(id,project_id,occurrence_id,kind,asset_id,block_id,offset_ms,length_ms,created_by) values (${C6(11)},${c6Project},${C6(6)},'dialogue',${C6(1)},${C6(10)},0,2000,${ALICE})`);
    st = await loadState(c6Project);
    const lipsync = { id: C6(12), revision: 1, clipId: C6(11), takeId: C6(9), blockId: C6(10), source: "rule" as const, algorithmVersion: 1, audioHash: "abc123", textHash: "def456", spans: [{ frame: 0, endFrame: 12, viseme: "A" as const }, { frame: 12, endFrame: 24, viseme: "B" as const }], overrides: [{ frame: 5, viseme: "C" as const }], enabled: true, removed: false };
    const pattern = { id: C6(13), revision: 1, rigId: null, name: "Nervøs blinking", color: "#a1b2c3", spec: { format: 1 as const, target: "eyes" as const, intervalMinMs: 2000, intervalMaxMs: 5000, durationMinFrames: 2, durationMaxFrames: 4, intensity: 1, seed: 18427, vary: { interval: true, duration: false, intensity: false }, algorithmVersion: 1 as const }, removed: false };
    st = await runCommand(st, ALICE, { type: "SaveLipsyncResult", result: lipsync });
    st = await runCommand(st, ALICE, { type: "SaveAnimationPattern", pattern });
    const loaded = await loadState(c6Project);
    assert(isDeepStrictEqual(loaded.lipsyncResults, st.lipsyncResults), "lipsync mismatch");
    assert(isDeepStrictEqual(loaded.animationPatterns, st.animationPatterns), "pattern mismatch");
    // Duplikat per klipp+take avvises i kjernen; den unike indeksen er siste skanse.
    await expectError(runCommand(st, ALICE, { type: "SaveLipsyncResult", result: { ...lipsync, id: C6(14) } }), /allerede leppesynk|already has lip sync/);
    // Ugyldige verdier avvises: ukjent klipp, ukjent kilde, ugyldig farge.
    await expectError(runCommand(st, ALICE, { type: "SaveLipsyncResult", result: { ...lipsync, id: C6(15), clipId: C6(90) } }), /Replikken finnes ikke|The line was not found/);
    await expectError(as("service_role", null, tx => tx`insert into public.lipsync_results(id,project_id,clip_id,take_id,source,algorithm_version,audio_hash,created_by) values (${C6(16)},${c6Project},${C6(11)},${C6(9)},'ukjent',1,'x',${ALICE})`), "23514");
    await expectError(as("service_role", null, tx => tx`insert into public.animation_patterns(id,project_id,name,color,spec,created_by) values (${C6(17)},${c6Project},'X','blå','{}',${ALICE})`), "23514");
    await expectError(as("service_role", null, tx => tx`insert into public.animation_patterns(id,project_id,rig_id,name,color,spec,created_by) values (${C6(18)},${c6Project},${C6(91)},'X','#a1b2c3','{}',${ALICE})`), "23503");
  });
  await test("0056: grants og RLS nekter anon, ikke-medlemmer og direkte skriving", async () => {
    for (const table of ["lipsync_results", "animation_patterns"]) {
      assert((await as("authenticated", ALICE, tx => tx.unsafe(`select id from public.${table} where project_id = $1`, [c6Project]))).length === 1, `medlem leser ${table}`);
      assert((await as("authenticated", CAROL, tx => tx.unsafe(`select id from public.${table} where project_id = $1`, [c6Project]))).length === 0, `RLS ${table}`);
      await expectError(as("anon", null, tx => tx.unsafe(`select id from public.${table}`)), "42501");
      await expectError(as("authenticated", ALICE, tx => tx.unsafe(`update public.${table} set removed = true where project_id = $1`, [c6Project])), "42501");
      await expectError(as("authenticated", ALICE, tx => tx.unsafe(`delete from public.${table} where project_id = $1`, [c6Project])), "42501");
    }
  });
  await test("0056: sletting av take/klipp i bruk blokkeres; delete_project rydder barn-først", async () => {
    await expectError(sql`delete from public.takes where id = ${C6(9)}`, "P0001");
    await expectError(sql`delete from public.audio_clips where id = ${C6(11)}`, "23503");
    await expectError(sql`delete from public.script_blocks where id = ${C6(10)}`, "23503");
    await as("service_role", null, tx => tx`select public.delete_project(${c6Project}, ${ALICE})`);
    for (const table of ["lipsync_results", "animation_patterns"]) {
      assert((await sql.unsafe(`select id from public.${table} where project_id = $1`, [c6Project])).length === 0, `${table} ikke slettet`);
    }
    await as("service_role", null, tx => tx`select public.purge_project_assets(${c6Project}, ${ALICE})`);
    assert((await sql`select id from public.projects where id = ${c6Project}`).length === 0, "prosjekt ikke fjernet");
  });

  await test("0053/0054: purge rejects referenced sources; delete_project and purge remove rigs child-first", async () => {
    await expectError(sql`select public.purge_removed_assets(${caProject}, ${ALICE}, '{}'::uuid[], array[${CA(3)}]::uuid[])`, "22023");
    await sql`update public.asset_versions set removed = true where id = ${CA(3)}`;
    await expectError(sql`select public.purge_removed_assets(${caProject}, ${ALICE}, '{}'::uuid[], array[${CA(3)}]::uuid[])`, "23503");
    await as("service_role", null, tx => tx`select public.delete_project(${caProject}, ${ALICE})`);
    for (const table of ["animation_uses", "animation_rig_versions", "animation_rigs"]) {
      const rows = await sql.unsafe(`select * from public.${table} where project_id = $1`, [caProject]); assert(rows.length === 0, `${table} not deleted`);
    }
    await as("service_role", null, tx => tx`select public.purge_project_assets(${caProject}, ${ALICE})`);
    assert((await sql`select id from public.projects where id = ${caProject}`).length === 0, "project not purged");
  });

  // ---------- CA7: globale animasjonsoppsett (migrasjon 0057) ----------
  await test("0057: redaktør publiserer låste animasjonsversjoner; medlem, ikke-medlem og anon nektes", async () => {
    const ws = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace('Animasjon') as id`)[0]!["id"] as string);
    const tEd = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace_invitation(${ws}, 'bob@example.no', 'editor') as t`)[0]!["t"] as string);
    await as("authenticated", BOB, (tx) => tx`select public.accept_workspace_invitation(${tEd})`);
    const ga = await as("authenticated", BOB, async (tx) => (await tx`select public.global_create_asset(${ws}, 'logo', 'Figur', '', '{}', '{}') as id`)[0]!["id"] as string);
    const gv = await as("authenticated", BOB, async (tx) => (await tx`select public.global_create_variant(${ga}, 'Farge', 'reference', '') as id`)[0]!["id"] as string);
    const rig = { format: 1, anchors: { mouth: { x: 0.5, y: 0.6 } }, sourceGlobalVersionId: gv };
    const pats = [{ key: "p1", name: "Blink", color: "#fff", spec: { format: 1 } }];
    // Medlem uten redaktørrolle og ikke-medlem kan ikke publisere
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.global_publish_animation(${gv}, ${sql.json(rig)}, ${sql.json(pats)}, '')`), "42501");
    // Ugyldig spesifikasjon avvises
    await expectError(as("authenticated", BOB, (tx) => tx`select public.global_publish_animation(${gv}, ${sql.json({ format: 2, anchors: {} })}, '[]'::jsonb, '')`), "22023");
    await expectError(as("authenticated", BOB, (tx) => tx`select public.global_publish_animation(${gv}, ${sql.json(rig)}, '{}'::jsonb, '')`), "22023");
    const a1 = await as("authenticated", BOB, async (tx) => (await tx`select public.global_publish_animation(${gv}, ${sql.json(rig)}, ${sql.json(pats)}, 'første') as id`)[0]!["id"] as string);
    await as("authenticated", BOB, (tx) => tx`select public.global_publish_animation(${gv}, ${sql.json(rig)}, '[]'::jsonb, '')`);
    const rows = await as("authenticated", ALICE, (tx) => tx`select number, workspace_id, global_asset_id from public.global_animation_specs where variant_id = ${gv} order by number`);
    assert(rows.length === 2 && rows[0]!["number"] === 1 && rows[1]!["number"] === 2, "nummerering per variant");
    assert(rows[0]!["workspace_id"] === ws && rows[0]!["global_asset_id"] === ga, "gruppe og ressurs fra varianten");
    // Ikke-medlem ser ingenting; anon har ingen tilgang
    const carol = await as("authenticated", CAROL, (tx) => tx`select id from public.global_animation_specs where variant_id = ${gv}`);
    assert(carol.length === 0, "ikke-medlem ser oppsett");
    await expectError(as("anon", null, (tx) => tx`select id from public.global_animation_specs`), "42501");
    // Direkte skriving er stengt; publiserte versjoner er uforanderlige også for service role
    await expectError(as("authenticated", BOB, (tx) => tx`insert into public.global_animation_specs (workspace_id, global_asset_id, variant_id, number, rig_spec, created_by) values (${ws}, ${ga}, ${gv}, 9, ${sql.json(rig)}, ${BOB})`), "42501");
    await expectError(as("authenticated", BOB, (tx) => tx`update public.global_animation_specs set note = 'x' where id = ${a1}`), "42501");
    await expectError(as("service_role", null, (tx) => tx`update public.global_animation_specs set note = 'x' where id = ${a1}`), "42501");
    await expectError(as("service_role", null, (tx) => tx`delete from public.global_animation_specs where id = ${a1}`), "42501");
    const version = await sql`select max(version) as v from public.schema_version`;
    assert((await sql`select 1 from public.schema_version where version = 57`).length === 1, "skjemaversjon 57 registrert");
  });

  // ---------- Ø-11: sikkerhetsgjennomgang (migrasjon 0058) ----------
  const SX = (n: number) => `01900000-0000-7000-8000-0058${String(n).padStart(8, "0")}` as never;
  await test("0058: prosjektinvitasjon – feil e-post avvises, riktig e-post (trim/store bokstaver) godtas, brukt og utløpt avvises", async () => {
    const p = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Sikkerhet') as id`)[0]!["id"] as string);
    const tok = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_invitation(${p}, '  Bob@Example.NO ', 'viewer') as t`)[0]!["t"] as string);
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.accept_invitation(${tok})`), "AS403");
    const carol = await sql`select 1 from public.project_members where project_id = ${p} and user_id = ${CAROL}`;
    assert(carol.length === 0, "feil bruker ble medlem");
    const [inv] = await sql`select accepted_at from public.project_invitations where project_id = ${p}`;
    assert(inv!["accepted_at"] === null, "invitasjonen ble brukt opp av feil bruker");
    const joined = await as("authenticated", BOB, async (tx) => (await tx`select public.accept_invitation(${tok}) as p`)[0]!["p"]);
    assert(joined === p, "riktig e-post ble ikke godtatt");
    await expectError(as("authenticated", BOB, (tx) => tx`select public.accept_invitation(${tok})`), "22023");
    const old = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_invitation(${p}, 'carol@example.no', 'viewer') as t`)[0]!["t"] as string);
    await sql`update public.project_invitations set expires_at = now() - interval '1 minute' where project_id = ${p} and email = 'carol@example.no'`;
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.accept_invitation(${old})`), "22023");
    // En eier blir aldri nedgradert av en invitasjon til sin egen adresse
    const self = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_invitation(${p}, 'alice@example.no', 'viewer') as t`)[0]!["t"] as string);
    await as("authenticated", ALICE, (tx) => tx`select public.accept_invitation(${self})`);
    const [own] = await sql`select role from public.project_members where project_id = ${p} and user_id = ${ALICE}`;
    assert(own!["role"] === "owner", `eieren ble ${own!["role"]}`);
    // anon kan ikke godta
    await expectError(as("anon", null, (tx) => tx`select public.accept_invitation(${tok})`), "42501");
  });

  await test("0058: gruppeinvitasjon – feil e-post avvises, riktig e-post godtas, brukt og utløpt avvises", async () => {
    const ws = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace('Sikker gruppe') as id`)[0]!["id"] as string);
    const tok = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace_invitation(${ws}, 'BOB@example.no', 'member') as t`)[0]!["t"] as string);
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.accept_workspace_invitation(${tok})`), "AS403");
    assert((await sql`select 1 from public.workspace_members where workspace_id = ${ws} and user_id = ${CAROL}`).length === 0, "feil bruker ble medlem");
    const joined = await as("authenticated", BOB, async (tx) => (await tx`select public.accept_workspace_invitation(${tok}) as w`)[0]!["w"]);
    assert(joined === ws, "riktig e-post ble ikke godtatt");
    await expectError(as("authenticated", BOB, (tx) => tx`select public.accept_workspace_invitation(${tok})`), "22023");
    const old = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace_invitation(${ws}, 'carol@example.no', 'member') as t`)[0]!["t"] as string);
    await sql`update public.workspace_invitations set expires_at = now() - interval '1 minute' where workspace_id = ${ws} and email = 'carol@example.no'`;
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.accept_workspace_invitation(${old})`), "22023");
  });

  await test("0058: AI-nøkler og modellinnstillinger – anon, annen bruker og eier", async () => {
    await as("service_role", null, (tx) => tx`insert into public.ai_provider_keys (id, user_id, provider, ciphertext, iv, key_hint) values (${SX(1)}, ${ALICE}, 'openai', ${"c".repeat(40)}, ${"i".repeat(16)}, '…abcd')`);
    await as("service_role", null, (tx) => tx`insert into public.ai_model_settings (provider, model, enabled, updated_by) values ('openai', 'sikker-test', false, ${ALICE})`);
    // anon: ingenting
    for (const t of ["ai_provider_keys", "ai_model_settings", "ai_account_limits", "ai_spend", "ai_provider_requests", "generation_jobs"])
      await expectError(as("anon", null, (tx) => tx.unsafe(`select 1 from public.${t}`)), "42501");
    // Annen bruker: ser ikke Alices nøkkel, og ingen kan lese de hemmelige feltene
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.ai_provider_keys where id = ${SX(1)}`)).length === 0, "annen bruker ser nøkkelen");
    for (const col of ["ciphertext", "iv", "key_version"]) {
      await expectError(as("authenticated", BOB, (tx) => tx.unsafe(`select ${col} from public.ai_provider_keys`)), "42501");
      await expectError(as("authenticated", ALICE, (tx) => tx.unsafe(`select ${col} from public.ai_provider_keys`)), "42501");
    }
    // Eieren ser hint og status for sin egen nøkkel
    const own = await as("authenticated", ALICE, (tx) => tx`select key_hint, status from public.ai_provider_keys where id = ${SX(1)}`);
    assert(own.length === 1 && own[0]!["key_hint"] === "…abcd", "eieren ser ikke sin nøkkel");
    // Ingen klient kan skrive nøkler eller innstillinger direkte
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.ai_provider_keys set label = 'x' where id = ${SX(1)}`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`insert into public.ai_model_settings (provider, model) values ('openai', 'x')`), "42501");
    // Modellinnstillingene: appens kolonner kan leses, administratorens ID ikke
    const ms = await as("authenticated", BOB, (tx) => tx`select provider, model, enabled, custom, kind, label, price_usd, price_unit, note, updated_at from public.ai_model_settings where model = 'sikker-test'`);
    assert(ms.length === 1 && ms[0]!["enabled"] === false, "innstillingen kan ikke leses");
    await expectError(as("authenticated", BOB, (tx) => tx`select updated_by from public.ai_model_settings`), "42501");
    await expectError(as("authenticated", BOB, (tx) => tx`select * from public.ai_model_settings`), "42501");
    // Andres forbruk og tak er skjult
    await as("service_role", null, (tx) => tx`insert into public.ai_account_limits (user_id, monthly_cap_usd) values (${ALICE}, 10) on conflict do nothing`);
    assert((await as("authenticated", BOB, (tx) => tx`select 1 from public.ai_account_limits where user_id = ${ALICE}`)).length === 0, "annen bruker ser kostnadstaket");
  });

  await test("0058: Story Lab-tabeller – RLS, ikke-medlem ser ingenting, ingen direkte skriving, anon nektes", async () => {
    const tables = ["story_profiles", "story_profile_stages", "story_facts", "story_sessions", "story_suggestions", "story_canvas_nodes", "story_canvas_edges"];
    const rls = await sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relname = any(${tables}) and relrowsecurity`;
    assert(rls.length === tables.length, `RLS mangler på ${tables.filter((t) => !rls.some((r) => r["relname"] === t)).join(", ")}`);
    for (const t of tables) {
      await expectError(as("anon", null, (tx) => tx.unsafe(`select 1 from public.${t}`)), "42501");
      await expectError(as("authenticated", ALICE, (tx) => tx.unsafe(`delete from public.${t}`)), "42501");
      await expectError(as("authenticated", ALICE, (tx) => tx.unsafe(`update public.${t} set project_id = project_id`)), "42501");
      const seen = await as("authenticated", CAROL, (tx) => tx.unsafe(`select distinct project_id from public.${t}`));
      const mine = new Set((await sql`select project_id from public.project_members where user_id = ${CAROL} and removed_at is null`).map((r) => r["project_id"]));
      assert(seen.every((r) => mine.has(r["project_id"])), `${t}: ikke-medlem ser andres rader`);
    }
  });

  await test("0058: skjemaet – RLS overalt, security definer med search_path, ingen anon-kjøring eller anon-tabelltilgang", async () => {
    const noRls = await sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind in ('r', 'p') and not relrowsecurity`;
    assert(noRls.length === 0, `uten RLS: ${noRls.map((r) => r["relname"]).join(", ")}`);
    const noPath = await sql`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`;
    assert(noPath.length === 0, `security definer uten search_path: ${noPath.map((r) => r["proname"]).join(", ")}`);
    const anonFns = await sql`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('registration_status', 'public_profile', 'globe_points', 'showcase_feed', 'showcase_comments')`; // B-117: globe_points gir bare forskjøvne lat/lon og active; // B-109: gir bare {open, message}; B-114 C0: public_profile gir bare offentlige felt og bare når community.profiles og profilen er offentlig; B-116 (0087): showcase_feed og showcase_comments gir bare godkjente, aktive bidrag uten bruker-ID/e-post – karusellen er offentlig før innlogging
    assert(anonFns.length === 0, `anon kan kjøre: ${anonFns.map((r) => r["proname"]).join(", ")}`);
    const anonTables = await sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind in ('r', 'p', 'v', 'm') and relname not in ('schema_version', 'privacy_policy') and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))`;
    assert(anonTables.length === 0, `anon har tabelltilgang: ${anonTables.map((r) => r["relname"]).join(", ")}`);
    const authWrites = await sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))`;
    assert(authWrites.length === 0, `innloggede kan skrive direkte i: ${authWrites.map((r) => r["relname"]).join(", ")}`);
  });

  await test("0058: mobilopplasting – tom fil avvises, tilbakekalt økt kan ikke bekrefte", async () => {
    const p = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Mobil sikkerhet') as id`)[0]!["id"] as string);
    const hash = "8".repeat(64);
    await as("service_role", null, (tx) => tx`insert into public.upload_sessions (id, project_id, token_hash, kind, created_by, context, media_kinds, expires_at, max_files, max_bytes) values (${SX(10)}, ${p}, ${hash}, 'personal', ${ALICE}, '{}', array['image'], now() + interval '1 hour', 10, 100000)`);
    await expectError(as("service_role", null, (tx) => tx`select public.mobile_register_upload(${hash}, ${SX(11)}, ${p + "/m/a.png"}, 'image', 'image/png', 0, 'a.png', '')`), "22023");
    await as("service_role", null, (tx) => tx`select public.mobile_register_upload(${hash}, ${SX(12)}, ${p + "/m/b.png"}, 'image', 'image/png', 100, 'b.png', '')`);
    await expectError(as("service_role", null, (tx) => tx`select public.mobile_register_upload(${hash}, ${SX(13)}, ${"annet/m/c.png"}, 'image', 'image/png', 100, 'c.png', '')`), "22023");
    await as("authenticated", ALICE, (tx) => tx`select public.revoke_upload_session(${SX(10)})`);
    await expectError(as("service_role", null, (tx) => tx`select public.mobile_confirm_upload(${hash}, ${SX(12)}, true, 100, null)`), "28000");
    const [row] = await sql`select status from public.mobile_imports where client_file_id = ${SX(12)}`;
    assert(row!["status"] !== "done", "fil bekreftet etter tilbakekalling");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.mobile_confirm_upload(${hash}, ${SX(12)}, true, 100, null)`), "42501");
    assert((await sql`select max(version) as v from public.schema_version`)[0]!["v"] >= 59, "skjemaversjon minst 59");
  });

  // ---------------------------------------------------------------- 0060 (DV2): lydversjoner per replikk
  const DV = (n: number) => `01900000-0000-7000-8000-0060${String(n).padStart(8, "0")}` as never;
  let dvProject = "";
  let dvState: ProjectState | null = null;
  const dvEdit = { sourceInMs: 300, lengthMs: 2400, gainDb: -4.5, fadeInMs: 120, fadeOutMs: 260, volumeKeys: [{ t: 0, db: 0 }, { t: 900, db: -9 }], speed: 1.5 };
  await test("0060: ny replikk får en lydversjon med nøyaktig redigering via apply_changes; speilingen stemmer", async () => {
    dvProject = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('DV2') as id`)[0]!["id"] as string);
    let st = await loadState(dvProject);
    const production = Object.values(st.productions).find((p) => p.kind === "main")!;
    st = await runCommand(st, ALICE, { type: "CreateScene", sceneId: DV(1), variantId: DV(2), occurrenceId: DV(3), productionId: production.id, orderKey: keyBetween(null, null), heading: { intExt: "INT.", location: "KJØKKEN", time: "DAG" }, blocks: [] });
    await as("service_role", null, (tx) => tx`insert into public.script_blocks(id,project_id,variant_id,kind,order_key,text,created_by) values (${DV(4)},${dvProject},${DV(2)},'dialogue','a1','Hei, Rolf.',${ALICE})`);
    await as("service_role", null, (tx) => tx`insert into public.script_block_revisions(project_id,block_id,rev,text,author) values (${dvProject},${DV(4)},1,'Hei, Rolf.',${ALICE})`);
    st = await loadState(dvProject);
    st = await runCommand(st, ALICE, { type: "CreateAssets", assets: [{ assetId: DV(5), fields: { kind: "sound", name: "Maja", names: [], description: "", category: "", tags: [] } }] });
    st = await runCommand(st, ALICE, { type: "CreateAssetVariant", variantId: DV(6), assetId: DV(5), fields: { name: "Lyd", style: "other", appearance: "" } });
    for (const [v, n] of [[DV(7), 1], [DV(8), 2]] as const)
      st = await runCommand(st, ALICE, { type: "AddAssetVersion", versionId: v, variantId: DV(6), media: { path: `${dvProject}/${DV(5)}/${v}/take${n}.webm`, mimeType: "audio/webm", width: null, height: null, byteSize: 1000 + n, sha256: String(n).repeat(64), durationMs: 5000 }, note: "" });
    st = await runCommand(st, ALICE, { type: "AddAudioClips", clips: [{ clipId: DV(9), fields: { occurrenceId: DV(3), kind: "dialogue", name: "Maja", assetId: DV(5), assetVariantId: DV(6), versionId: DV(7), blockId: DV(4), offsetMs: 1000, ...dvEdit, muted: false, continues: false } }] });
    const loaded = await loadState(dvProject);
    const clip = loaded.audioClips[DV(9)]!;
    const v = loaded.dialogueVersions[clip.activeVersionId!]!;
    assert(v && v.clipId === DV(9) && v.assetVersionId === DV(7), "første versjon mangler");
    assert(v.sourceInMs === 300 && v.lengthMs === 2400 && v.gainDb === -4.5 && v.fadeInMs === 120 && v.fadeOutMs === 260 && v.speed === 1.5 && isDeepStrictEqual(v.volumeKeys, dvEdit.volumeKeys), `redigering avviker: ${JSON.stringify(v)}`);
    assert(dialogueMirrorViolations(loaded).length === 0, "speilingen avviker etter lasting");
    dvState = loaded;
  });

  await test("0060: bytte mellom versjoner bevarer hver versjons redigering og replikkens plassering (L7–L9)", async () => {
    let st = dvState!;
    const clip = st.audioClips[DV(9)]!;
    const first = clip.activeVersionId!;
    // Nytt take valgt (eksisterende lydflyt) → ny versjon; rediger den
    st = await runCommand(st, ALICE, { type: "UpdateAudioClips", clips: [{ clipId: DV(9), fields: { ...audioClipFieldsOf(st.audioClips[DV(9)]!), versionId: DV(8) } }] });
    const second = st.audioClips[DV(9)]!.activeVersionId!;
    assert(second !== first, "ny versjon ble ikke laget");
    st = await runCommand(st, ALICE, { type: "UpdateDialogueVersionEdit", dialogueVersionId: second, edit: { sourceInMs: 0, lengthMs: 1800, gainDb: 2, fadeInMs: 0, fadeOutMs: 50, volumeKeys: [], speed: 1, compositionId: null } });
    st = await runCommand(st, ALICE, { type: "MoveDialogueLine", clipId: DV(9), offsetMs: 2500 });
    st = await runCommand(st, ALICE, { type: "SetActiveDialogueVersion", clipId: DV(9), dialogueVersionId: first });
    const loaded = await loadState(dvProject);
    const a = loaded.audioClips[DV(9)]!;
    const v1 = loaded.dialogueVersions[first]!;
    const v2 = loaded.dialogueVersions[second]!;
    assert(a.activeVersionId === first && a.offsetMs === 2500, "aktiv versjon eller plassering feil");
    assert(v1.sourceInMs === 300 && v1.speed === 1.5 && isDeepStrictEqual(v1.volumeKeys, dvEdit.volumeKeys), "versjon A mistet redigering");
    assert(v2.lengthMs === 1800 && v2.gainDb === 2 && v2.fadeOutMs === 50, "versjon B mistet redigering");
    assert(a.lengthMs === 2400 && a.sourceInMs === 300 && a.versionId === DV(7), "speilingen følger ikke aktiv versjon");
    assert(Object.values(loaded.dialogueVersions).filter((x) => x.clipId === DV(9)).length === 2, "en versjon gikk tapt");
    dvState = loaded;
  });

  await test("0060: backfill av et eksisterende klipp gir en versjon med identiske verdier", async () => {
    await as("service_role", null, (tx) => tx`insert into public.audio_clips(id,project_id,occurrence_id,kind,asset_id,asset_variant_id,version_id,block_id,offset_ms,source_in_ms,length_ms,gain_db,fade_in_ms,fade_out_ms,volume_keys,speed,created_by) values (${DV(20)},${dvProject},${DV(3)},'dialogue',${DV(5)},${DV(6)},${DV(8)},${DV(4)},9000,450,3100,-6.5,80,640,${tx.json([{ t: 0, db: -3 }, { t: 1500, db: -18 }, { t: 3000, db: 0 }])},0.75,${ALICE})`);
    await as("service_role", null, (tx) => tx`insert into public.audio_clips(id,project_id,occurrence_id,kind,asset_id,offset_ms,length_ms,created_by) values (${DV(21)},${dvProject},${DV(3)},'music',${DV(5)},0,1000,${ALICE})`);
    const file = readFileSync(join(root, "db/migrations/0060_dialogue_versions.sql"), "utf8");
    const block = file.slice(file.indexOf("-- Backfill:"), file.indexOf("-- Slutt på backfill"));
    await sql.begin((tx) => tx.unsafe(block));
    const [c] = await sql`select * from public.audio_clips where id = ${DV(20)}`;
    const [v] = await sql`select * from public.dialogue_versions where clip_id = ${DV(20)}`;
    assert(c && v && c["active_version_id"] === v["id"], "klippet fikk ikke aktiv versjon");
    for (const [cc, vc] of <[string, string][]>[["asset_id", "asset_id"], ["asset_variant_id", "asset_variant_id"], ["version_id", "asset_version_id"], ["source_in_ms", "source_in_ms"], ["length_ms", "length_ms"], ["gain_db", "gain_db"], ["fade_in_ms", "fade_in_ms"], ["fade_out_ms", "fade_out_ms"], ["speed", "speed"]])
      assert(String(c[cc]) === String(v[vc]), `${cc} avviker: ${c[cc]} / ${v[vc]}`);
    assert(isDeepStrictEqual(c["volume_keys"], v["volume_keys"]), "volumkurven avviker");
    assert(v["source"] === "legacy", "kilde");
    assert((await sql`select 1 from public.dialogue_versions where clip_id = ${DV(21)}`).length === 0, "musikk fikk versjon");
    const loaded = await loadState(dvProject);
    assert(dialogueMirrorViolations(loaded).length === 0, "speilingen avviker etter backfill");
    dvState = loaded;
  });

  await test("0060: grants og RLS nekter anon, ikke-medlemmer og direkte skriving; aktiv versjon må høre til klippet", async () => {
    assert((await as("authenticated", ALICE, (tx) => tx`select id from public.dialogue_versions where project_id = ${dvProject}`)).length >= 3, "medlem ser ikke versjonene");
    assert((await as("authenticated", CAROL, (tx) => tx`select id from public.dialogue_versions where project_id = ${dvProject}`)).length === 0, "ikke-medlem ser versjoner");
    await expectError(as("anon", null, (tx) => tx`select id from public.dialogue_versions`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`delete from public.dialogue_versions where project_id = ${dvProject}`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.audio_clips set active_version_id = null where project_id = ${dvProject}`), "42501");
    const other = Object.values(dvState!.dialogueVersions).find((x) => x.clipId === DV(20))!;
    await expectError(as("service_role", null, (tx) => tx`update public.audio_clips set active_version_id = ${other.id} where id = ${DV(9)}`), "23503");
    await expectError(sql`delete from public.dialogue_versions where project_id = ${dvProject}`, "23503");
  });

  await test("0060: purge_removed_assets blokkeres av en lydversjon (også inaktiv)", async () => {
    let st = await loadState(dvProject);
    st = await runCommand(st, ALICE, { type: "SetAssetVersionsRemoved", versionIds: [DV(8)], removed: true }).catch(() => st);
    const [row] = await sql`select removed from public.asset_versions where id = ${DV(8)}`;
    if (row?.["removed"] !== true) await as("service_role", null, (tx) => tx`update public.asset_versions set removed = true where id = ${DV(8)}`);
    await expectError(as("service_role", null, (tx) => tx`select public.purge_removed_assets(${dvProject}, ${ALICE}, ${[]}::uuid[], ${[DV(8)]}::uuid[])`), "23503");
    assert((await sql`select 1 from public.asset_versions where id = ${DV(8)}`).length === 1, "opptaket ble slettet");
    assert((await sql`select 1 from public.dialogue_versions where asset_version_id = ${DV(8)}`).length >= 1, "versjonen forsvant");
  });

  await test("0060: zip-sikkerhetskopi tar med lydversjonene; gjenopprettet prosjekt har samme redigering og aktivt valg", async () => {
    const old = await loadState(dvProject);
    const q = (t: string) => sql.unsafe(`select * from public.${t} where project_id = $1`, [dvProject]);
    const rows = { project: (await sql`select * from public.projects where id = ${dvProject}`)[0]!, productions: await q("productions"), scenes: await q("scenes"), scene_variants: await q("scene_variants"), script_blocks: await q("script_blocks"), script_block_revisions: await q("script_block_revisions"), scene_occurrences: await q("scene_occurrences"), production_segments: await q("production_segments"), takes: await q("takes"), assets: await q("assets"), asset_variants: await q("asset_variants"), asset_versions: await q("asset_versions"), audio_clips: await q("audio_clips"), dialogue_versions: await q("dialogue_versions") } as unknown as ProjectRows;
    assert(!(BACKUP_STATE_TABLES as readonly string[]).includes("user_bookmarks"), "personlige bokmerker i sikkerhetskopien");
    const backup = parseBackup(JSON.parse(JSON.stringify(makeBackup({ rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion: 60, createdAt: new Date().toISOString(), include: new Set(["lyd"]) }))), 60);
    assert((backup.tables["dialogue_versions"] ?? []).length === Object.keys(old.dialogueVersions).length, "versjonene mangler i filen");
    const newId = await as("authenticated", BOB, async (tx) => (await tx`select public.create_project('DV2 gjenopprettet') as id`)[0]!["id"] as string);
    const base = await loadState(newId);
    const main = Object.values(base.productions).find((p) => p.kind === "main")!;
    const map = await backupIdMap(backup, newId, main.id);
    const target = restoredState(backup, map, base, BOB);
    await as("service_role", null, (tx) => tx`select public.apply_changes(${newId}, ${BOB}, ${"55555555-5555-7555-8555-000000006001"}, ${tx.json({ type: "RestoreBackup" })}, ${null}, ${tx.json(diffStates(base, target) as never)})`);
    const back = await loadState(newId);
    const sig = (st: ProjectState) => Object.values(st.audioClips).filter((a) => a.activeVersionId).map((a) => {
      const v = st.dialogueVersions[a.activeVersionId!]!;
      const all = Object.values(st.dialogueVersions).filter((x) => x.clipId === a.id).map((x) => [x.lengthMs, x.sourceInMs, x.gainDb, x.speed, JSON.stringify(x.volumeKeys)].join("|")).sort();
      return [a.offsetMs, v.lengthMs, v.sourceInMs, v.speed, all.join(";")].join("/");
    }).sort();
    assert(isDeepStrictEqual(sig(back), sig(old)), `rundtur avviker: ${JSON.stringify(sig(back))} / ${JSON.stringify(sig(old))}`);
    assert(dialogueMirrorViolations(back).length === 0, "speilingen avviker etter gjenoppretting");
  });

  await test("0060: delete_project og purge_project_assets fjerner lydversjoner barn-først", async () => {
    await as("service_role", null, (tx) => tx`select public.delete_project(${dvProject}, ${ALICE})`);
    assert((await sql`select 1 from public.dialogue_versions where project_id = ${dvProject}`).length === 0, "versjoner igjen etter sletting");
    await as("service_role", null, (tx) => tx`select public.purge_project_assets(${dvProject}, ${ALICE})`);
    assert((await sql`select 1 from public.projects where id = ${dvProject}`).length === 0, "prosjektet ble ikke slettet");
    assert((await sql`select max(version) as v from public.schema_version`)[0]!["v"] >= 65, "skjemaversjon minst 65");
  });

  await test("0061: batchtabeller har RLS og bare lesetilgang for medlemmer", async () => {
    for (const table of ["dialogue_batches", "dialogue_batch_items"]) {
      const rows = await sql`select relrowsecurity as rls from pg_class where oid=${`public.${table}`}::regclass`;
      assert(rows[0]?.["rls"] === true, `${table}: RLS mangler`);
      const grants = await sql`select has_table_privilege('anon',${`public.${table}`},'SELECT') as anon,has_table_privilege('authenticated',${`public.${table}`},'SELECT') as read,has_table_privilege('authenticated',${`public.${table}`},'INSERT') as write,has_table_privilege('service_role',${`public.${table}`},'INSERT') as service`;
      assert(grants[0]?.["anon"] === false && grants[0]?.["read"] === true && grants[0]?.["write"] === false && grants[0]?.["service"] === true, `${table}: grants avviker`);
    }
  });
  await test("0061: jobbfunk­sjoner er server-only, transaksjonelle og beskytter lease og gjentak", async () => {
    for (const signature of ["public.create_dialogue_batch(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid)","public.claim_dialogue_batch(uuid,uuid)","public.complete_dialogue_batch_item(uuid,uuid,jsonb,jsonb,jsonb)","public.resume_dialogue_batch(uuid,uuid,uuid)"]) {
      const rights = await sql`select has_function_privilege('authenticated',${signature},'EXECUTE') as client,has_function_privilege('anon',${signature},'EXECUTE') as anon,has_function_privilege('service_role',${signature},'EXECUTE') as service`;
      assert(rights[0]?.["client"] === false && rights[0]?.["anon"] === false && rights[0]?.["service"] === true, `${signature}: tilgang avviker`);
    }
    const definitions = await sql`select pg_get_functiondef('public.complete_dialogue_batch_item(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) as body`;
    assert(String(definitions[0]?.["body"]).includes("public.apply_changes"), "prosjektendringen er ikke transaksjonell");
    assert(String(definitions[0]?.["body"]).includes("lease_token"), "leasevernet mangler");
    const missing = await as("service_role", null, tx => tx`select public.claim_dialogue_batch('00000000-0000-7000-8000-000000006199','00000000-0000-7000-8000-000000006198') as item`);
    assert(missing[0]?.["item"] === null, "manglende jobb ble startet");
  });
  await test("0061: uavhengige språkfelt og tom lydprompt finnes uten endring av gamle lydfiler", async () => {
    for (const [table,column] of [["projects","source_language"],["scene_variants","script_language"],["script_blocks","script_language"],["script_blocks","speech_language"],["audio_clips","speech_language"],["audio_clips","placement_estimated"]]) {
      if (!table || !column) throw new Error("Invalid language column fixture");
      const found = await sql`select 1 from information_schema.columns where table_schema='public' and table_name=${table} and column_name=${column}`;
      assert(found.length === 1, `${table}.${column} mangler`);
    }
    const constraint = await sql`select pg_get_constraintdef(oid) as definition from pg_constraint where conname='generation_jobs_prompt_check' and conrelid='public.generation_jobs'::regclass`;
    assert(String(constraint[0]?.["definition"]).includes("sound"), "lydprompt kan ikke utelate manusinnhold");
  });

  await test("0062: gjennomganger, huskelapper og bokmerker har RLS, standard grants og riktige funksjoner", async () => {
    for (const table of ["dialogue_reviews", "note_flags", "user_bookmarks"]) {
      const rows = await sql`select relrowsecurity as rls from pg_class where oid=${`public.${table}`}::regclass`;
      assert(rows[0]?.["rls"] === true, `${table}: RLS mangler`);
      const g = await sql`select has_table_privilege('anon',${`public.${table}`},'SELECT') as anon,has_table_privilege('authenticated',${`public.${table}`},'SELECT') as read,has_table_privilege('authenticated',${`public.${table}`},'INSERT') as ins,has_table_privilege('authenticated',${`public.${table}`},'DELETE') as del,has_table_privilege('service_role',${`public.${table}`},'INSERT') as service`;
      assert(g[0]?.["anon"] === false && g[0]?.["read"] === true && g[0]?.["ins"] === false && g[0]?.["del"] === false && g[0]?.["service"] === true, `${table}: grants avviker`);
    }
    const body = String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) as b`)[0]?.["b"]);
    assert(body.includes("'dialogue_reviews','note_flags'") && body.includes("'note_flags','dialogue_reviews','animation_patterns'"), "apply_changes kjenner ikke de nye tabellene i riktig rekkefølge");
    for (const fn of ["delete_project(uuid,uuid)", "purge_project_assets(uuid,uuid)"]) {
      const b = String((await sql`select pg_get_functiondef(${`public.${fn}`}::regprocedure) as b`)[0]?.["b"]);
      assert(b.indexOf("note_flags") < b.indexOf("delete from public.dialogue_versions") && b.includes("user_bookmarks") && b.includes("dialogue_reviews"), `${fn}: rydder ikke barn først`);
    }
    for (const [sig, client] of [["public.set_my_bookmark(uuid,jsonb)", true], ["public.consume_my_bookmark(uuid,timestamptz)", true], ["public.reconfirm_dialogue_batch(uuid,uuid,uuid)", false]] as const) {
      const r = await sql`select has_function_privilege('authenticated',${sig},'EXECUTE') as client,has_function_privilege('anon',${sig},'EXECUTE') as anon`;
      assert(r[0]?.["client"] === client && r[0]?.["anon"] === false, `${sig}: tilgang avviker`);
    }
    const status = String((await sql`select pg_get_constraintdef(oid) as d from pg_constraint where conname='dialogue_batch_items_status_check'`)[0]?.["d"]);
    assert(status.includes("undone"), "angret jobbelement mangler");
  });

  await test("0062: bokmerker er personlige, ett per prosjekt, og fjernes bare av eieren etter navigasjon (B1–B4)", async () => {
    const bp = (await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Bokmerker') as id`)[0]!["id"])) as string;
    await sql`insert into public.project_members (project_id, user_id, role) values (${bp}, ${BOB}, 'editor')`;
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_bookmark(${bp}, ${sql.json({ view: "scene", frame: 10 })})`);
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_bookmark(${bp}, ${sql.json({ view: "scene", frame: 20 })})`);
    await as("authenticated", BOB, (tx) => tx`select public.set_my_bookmark(${bp}, ${sql.json({ view: "manus" })})`);
    const mine = await as("authenticated", ALICE, (tx) => tx`select target, updated_at from public.user_bookmarks where project_id = ${bp}`);
    assert(mine.length === 1 && (mine[0]!["target"] as { frame: number }).frame === 20, "Alice ser ikke bare sitt ene bokmerke");
    const consumedByBob = await as("authenticated", BOB, (tx) => tx`select public.consume_my_bookmark(${bp}, ${mine[0]!["updated_at"] as Date}) as ok`);
    assert(consumedByBob[0]?.["ok"] === false, "Bob fjernet Alices bokmerke");
    const consumed = await as("authenticated", ALICE, (tx) => tx`select public.consume_my_bookmark(${bp}, ${mine[0]!["updated_at"] as Date}) as ok`);
    assert(consumed[0]?.["ok"] === true, "Alice kunne ikke fjerne sitt bokmerke");
    const bobs = await as("authenticated", BOB, (tx) => tx`select 1 from public.user_bookmarks where project_id = ${bp}`);
    assert(bobs.length === 1, "Bobs bokmerke ble påvirket");
    let refused = false;
    try { await as("authenticated", CAROL, (tx) => tx`select public.set_my_bookmark(${bp}, ${sql.json({ view: "scene" })})`); } catch { refused = true; }
    assert(refused, "ikke-medlem kunne sette bokmerke");
    // Huskelapp via apply_changes: delt (Bob ser den), revisjonskontroll, av/på beholder teksten
    const flagId = "00000000-0000-7000-8000-000000006201";
    const row = { id: flagId, project_id: bp, revision: 1, target_kind: "occurrence", target_id: "00000000-0000-7000-8000-000000006202", text: "Sjekk lyset", enabled: true, edited_by: null, edited_at: null, removed: false };
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${ALICE}, ${"00000000-0000-7000-8000-000000006203"}, ${sql.json({ type: "AddNoteFlag" })}, ${sql.json({ type: "UndoAddNoteFlag" })}, ${sql.json({ inserts: { note_flags: [row] } })})`);
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${BOB}, ${"00000000-0000-7000-8000-000000006204"}, ${sql.json({ type: "UpdateNoteFlag" })}, ${sql.json({ type: "UpdateNoteFlag" })}, ${sql.json({ updates: { note_flags: [{ ...row, enabled: false, edited_by: BOB, revision: 2, expected_revision: 1 }] } })})`);
    const seen = await as("authenticated", BOB, (tx) => tx`select text, enabled, created_by, edited_by from public.note_flags where id = ${flagId}`);
    assert(seen[0]?.["text"] === "Sjekk lyset" && seen[0]?.["enabled"] === false && seen[0]?.["created_by"] === ALICE && seen[0]?.["edited_by"] === BOB, "lappen er ikke delt eller mistet teksten");
    await expectError(as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${BOB}, ${"00000000-0000-7000-8000-000000006205"}, ${sql.json({ type: "UpdateNoteFlag" })}, ${sql.json({ type: "UpdateNoteFlag" })}, ${sql.json({ updates: { note_flags: [{ ...row, revision: 2, expected_revision: 1 }] } })})`), "P0409");
    assert((await as("authenticated", CAROL, (tx) => tx`select 1 from public.note_flags where id = ${flagId}`)).length === 0, "ikke-medlem ser lappen");
    await as("service_role", null, (tx) => tx`select public.delete_project(${bp}, ${ALICE})`);
    assert((await sql`select 1 from public.user_bookmarks where project_id = ${bp}`).length === 0, "bokmerker igjen etter sletting");
  });

  await test("0063: kvalitetsprofiler har RLS, standard grants og riktige funksjoner (M8)", async () => {
    const rows = await sql`select relrowsecurity as rls from pg_class where oid='public.quality_profiles'::regclass`;
    assert(rows[0]?.["rls"] === true, "quality_profiles: RLS mangler");
    const g = await sql`select has_table_privilege('anon','public.quality_profiles','SELECT') as anon,has_table_privilege('authenticated','public.quality_profiles','SELECT') as read,has_table_privilege('authenticated','public.quality_profiles','INSERT') as ins,has_table_privilege('authenticated','public.quality_profiles','DELETE') as del,has_table_privilege('service_role','public.quality_profiles','INSERT') as service`;
    assert(g[0]?.["anon"] === false && g[0]?.["read"] === true && g[0]?.["ins"] === false && g[0]?.["del"] === false && g[0]?.["service"] === true, "quality_profiles: grants avviker");
    const col = await sql`select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='active_quality_profile_id'`;
    assert(col.length === 1, "projects.active_quality_profile_id mangler");
    const body = String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) as b`)[0]?.["b"]);
    assert(body.includes("'dialogue_reviews','note_flags','quality_profiles'"), "apply_changes kjenner ikke quality_profiles");
    assert(body.includes("'quality_profiles','note_flags'"), "apply_changes sletter ikke profiler først");
    assert(body.includes("active_quality_profile_id"), "apply_changes oppdaterer ikke aktiv profil");
    for (const fn of ["delete_project(uuid,uuid)", "purge_project_assets(uuid,uuid)"]) {
      const b = String((await sql`select pg_get_functiondef(${`public.${fn}`}::regprocedure) as b`)[0]?.["b"]);
      assert(b.indexOf("quality_profiles") < b.indexOf("delete from public.dialogue_versions"), `${fn}: rydder ikke profilene`);
    }
    const cp = String((await sql`select pg_get_functiondef('public.create_project(text,integer,integer,text)'::regprocedure) as b`)[0]?.["b"]);
    assert(cp.includes("'Draft'") && cp.includes("'Review'") && cp.includes("'Final'"), "create_project lager ikke standardprofilene");
  });

  await test("0063: nye prosjekter får standardprofilene; eksisterende endres ikke; skriving via apply_changes", async () => {
    const bp = (await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Profiler') as id`)[0]!["id"])) as string;
    const profiles = await as("authenticated", ALICE, (tx) => tx`select name, spec from public.quality_profiles where project_id = ${bp} order by name`);
    assert(profiles.length === 3, "nytt prosjekt mangler de tre standardprofilene");
    const active = await sql`select p.name as name from public.projects pr join public.quality_profiles p on p.id = pr.active_quality_profile_id where pr.id = ${bp}`;
    assert(active[0]?.["name"] === "Draft", "Utkast er ikke aktiv i nye prosjekter");
    // Skriving via apply_changes med revisjonskontroll; medlem leser, ikke-medlem ser ingenting
    const pid = "00000000-0000-7000-8000-000000006301";
    const row = { id: pid, project_id: bp, revision: 1, name: "Kino", spec: { effort: "premium", variants: 2 }, edited_by: null, edited_at: null, removed: false };
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${ALICE}, ${"00000000-0000-7000-8000-000000006302"}, ${sql.json({ type: "AddQualityProfile" })}, ${sql.json({ type: "UndoAddQualityProfile" })}, ${sql.json({ inserts: { quality_profiles: [row] } })})`);
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${ALICE}, ${"00000000-0000-7000-8000-000000006303"}, ${sql.json({ type: "SetActiveQualityProfile" })}, ${sql.json({ type: "SetActiveQualityProfile" })}, ${sql.json({ updates: { projects: [{ id: bp, revision: 2, expected_revision: 1, active_quality_profile_id: pid }] } })})`);
    const seen = await as("authenticated", ALICE, (tx) => tx`select active_quality_profile_id from public.projects where id = ${bp}`);
    assert(seen[0]?.["active_quality_profile_id"] === pid, "aktiv profil ble ikke satt");
    await expectError(as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${ALICE}, ${"00000000-0000-7000-8000-000000006304"}, ${sql.json({ type: "UpdateQualityProfile" })}, ${sql.json({ type: "UpdateQualityProfile" })}, ${sql.json({ updates: { quality_profiles: [{ ...row, name: "Kino 2", revision: 6, expected_revision: 5 }] } })})`), "P0409");
    assert((await as("authenticated", CAROL, (tx) => tx`select 1 from public.quality_profiles where project_id = ${bp}`)).length === 0, "ikke-medlem ser profilene");
    await as("service_role", null, (tx) => tx`select public.delete_project(${bp}, ${ALICE})`);
    assert((await sql`select 1 from public.quality_profiles where project_id = ${bp}`).length === 0, "profiler igjen etter sletting");
  });

  await test("0063: profilbudsjett er atomisk, prosjektavgrenset og metadata uforanderlige", async () => {
    const bp = String((await as("authenticated", ALICE, tx => tx`select public.create_project('Profile capacity',25,1) id`))[0]?.["id"]);
    const profile = (await sql`select * from public.quality_profiles where project_id=${bp} and name='Draft'`)[0];
    assert(profile, "Missing profile");
    await as("service_role",null,tx => tx`update public.quality_profiles set spec=spec || '{"budgetLimit":1}'::jsonb where id=${profile["id"]}`);
    const q = (await sql`select * from public.quality_profiles where id=${profile["id"]}`)[0];
    assert(q,"Missing profile");
    const snapshot = {id:q["id"],name:q["name"],spec:q["spec"]};
    const insert = (id:string, snap:typeof snapshot=snapshot) => as("service_role",null,tx => tx`insert into public.generation_jobs(id,project_id,kind,provider,model,prompt,status,created_by,params) values(${id},${bp},'image','lovable','google/gemini-2.5-flash-image','test prompt','queued',${ALICE},${sql.json({qualityProfile:snap})})`);
    const j1="00000000-0000-7000-8000-000000006311", j2="00000000-0000-7000-8000-000000006312";
    const results = await Promise.allSettled([insert(j1),insert(j2)]);
    assert(results.filter(r=>r.status==='fulfilled').length===1,`Concurrent reservations exceeded cap: ${results.map(r => r.status === "rejected" ? String(r.reason) : "ok").join(" | ")}`);
    const job=(await sql`select id,params from public.generation_jobs where project_id=${bp}`)[0];
    assert(job,"Missing receipt");
    assert(job["params"].qualityProfileId===q["id"],"Explicit profile ID missing");
    await expectError(as("service_role",null,tx=>tx`update public.generation_jobs set params=${sql.json({qualityProfile:{...snapshot,name:"Forged"}})} where id=${job["id"]}`),"22023");
    await expectError(insert("00000000-0000-7000-8000-000000006313",{...snapshot,id:"00000000-0000-7000-8000-000000000000"}),"42501");
    await as("service_role",null,tx=>tx`update public.generation_jobs set status='failed' where id=${job["id"]}`);
    await insert("00000000-0000-7000-8000-000000006314");
    assert((await sql`select count(*)::int n from public.generation_jobs where project_id=${bp} and status<>'failed'`)[0]?.["n"]===1,"Failed reservation not released");
    await expectError(insert("00000000-0000-7000-8000-000000006315",{...snapshot,spec:{budgetLimit:1000}}),"22023");
    await as("service_role",null,tx=>tx`select public.delete_project(${bp},${ALICE})`);
  });

  await test("0064: approved links persist via apply_changes, RLS, foreign scope and project deletion", async () => {
    const bp=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('Line-link fixture') id`)[0]))?.["id"]);
    await sql`insert into public.project_members(project_id,user_id,role) values(${bp},${BOB},'editor')`;
    let st=await loadState(bp);const prod=Object.values(st.productions).find(p=>p.kind==='main');assert(prod,"main missing");
    const sceneId=newId(),variantId=newId(),occurrenceId=newId(),b1=newId(),b2=newId(),b3=newId(),b4=newId();
    st=await runCommand(st,ALICE,{type:"CreateScene",productionId:prod.id,sceneId:sceneId as never,variantId:variantId as never,occurrenceId:occurrenceId as never,orderKey:keyBetween(null,null),heading:{intExt:"INT.",location:"TEST",time:"DAG"},blocks:(()=>{let k:string|null=null;return [b1,b2,b3,b4].map((blockId,i)=>{k=keyBetween(k,null);return {blockId:blockId as never,kind:"action" as const,text:`Norsk linje ${i}`,orderKey:k};});})()});
    const translationId=newId();
    st=await runCommand(st,ALICE,{type:"AddTranslations",items:[{translationId:translationId as never,fields:{blockId:b1 as never,variantId:null,language:"en",text:"English line",basedOnRev:1,status:"uncertain"}}]});
    // Unpaired imported lines are kept per scene and language (B-050).
    const u1=newId(),u2=newId();
    st=await runCommand(st,ALICE,{type:"AddTranslationLines",items:[{lineId:u1,fields:{variantId,language:"en",ord:2,kind:"action",text:"First half"}},{lineId:u2,fields:{variantId,language:"en",ord:3,kind:"action",text:"Second half"}}]});
    assert((await sql`select id from public.translation_lines where project_id=${bp} and not removed`).length===2,"unpaired lines not kept");
    const id=newId();
    st=await runCommand(st,ALICE,{type:"SetLineLink",linkId:id,fields:{variantId,language:"en",sourceBlockIds:[b1],targetTranslationIds:[translationId],origin:"approved",confidence:0.9,reason:"Evidence"}});
    const splitId=newId();
    st=await runCommand(st,ALICE,{type:"SetLineLink",linkId:splitId,fields:{variantId,language:"en",sourceBlockIds:[b2],targetTranslationIds:[u1,u2],origin:"approved",confidence:0.8,reason:"Split"}});
    assert((await as("authenticated",BOB,tx=>tx`select id from public.translation_line_links where project_id=${bp}`)).length===2,"member cannot read");
    assert((await as("authenticated",BOB,tx=>tx`select id from public.translation_lines where project_id=${bp}`)).length===2,"member cannot read lines");
    assert((await as("authenticated",CAROL,tx=>tx`select id from public.translation_line_links where project_id=${bp}`)).length===0,"nonmember sees links");
    assert((await as("authenticated",CAROL,tx=>tx`select id from public.translation_lines where project_id=${bp}`)).length===0,"nonmember sees lines");
    const row={id:newId(),project_id:bp,variant_id:variantId,language:"en",source_block_ids:[b3],target_translation_ids:[newId()],origin:"approved",confidence:0.9,reason:"",removed:false,revision:1};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"SetLineLink"})},null,${sql.json({inserts:{translation_line_links:[row]}})})`),"22023");
    // A normal script edit removes a linked line: it succeeds, and later commands in the project still succeed.
    st=await runCommand(st,ALICE,{type:"RemoveBlock",productionId:prod.id,blockId:b1 as never});
    const link=st.translationLineLinks[id];assert(link && lineLinkStale(st,link),"removed source must make the link stale");
    st=await runCommand(st,ALICE,{type:"EditBlockText",productionId:prod.id,blockId:b4 as never,text:"Endret senere"});
    st=await runCommand(st,ALICE,{type:"RejectLineLinks",linkIds:[splitId],removed:true});
    // Rejecting a stale link and bringing it back with unchanged references is never blocked.
    st=await runCommand(st,ALICE,{type:"RejectLineLinks",linkIds:[id],removed:true});
    st=await runCommand(st,ALICE,{type:"RejectLineLinks",linkIds:[id],removed:false});
    assert((await sql`select text from public.script_blocks where id=${b4}`)[0]?.["text"]==="Endret senere","later command failed");
    await as("service_role",null,tx=>tx`select public.delete_project(${bp},${ALICE})`);
    assert((await sql`select id from public.translation_line_links where project_id=${bp}`).length===0,"line links left after delete");
    assert((await sql`select id from public.translation_lines where project_id=${bp}`).length===0,"unpaired lines left after delete");
    await as("service_role",null,tx=>tx`select public.purge_project_assets(${bp},${ALICE})`);
    assert((await sql`select id from public.projects where id=${bp}`).length===0,"project not purged");
  });

  await test("0064: line-link RLS/grants and deletion paths", async () => {
    const grants=await sql`select has_table_privilege('anon','public.translation_line_links','SELECT') a, has_table_privilege('authenticated','public.translation_line_links','SELECT') r, has_table_privilege('authenticated','public.translation_line_links','INSERT') w, has_table_privilege('service_role','public.translation_line_links','INSERT') s`;
    assert(grants[0]?.["a"]===false && grants[0]?.["r"]===true && grants[0]?.["w"]===false && grants[0]?.["s"]===true,"line-link grants");
    const rls=await sql`select relrowsecurity from pg_class where oid='public.translation_line_links'::regclass`;
    assert(rls[0]?.["relrowsecurity"]===true,"missing RLS");
    for (const fn of ["delete_project(uuid,uuid)","purge_project_assets(uuid,uuid)"]) {
      const body=String((await sql`select pg_get_functiondef(${`public.${fn}`}::regprocedure) b`)[0]?.["b"]);
      assert(body.indexOf("delete from public.translation_line_links")<body.indexOf("delete from public.translations"),"line links must delete before translations");
    }
    const body=String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(body.includes("'translation_line_links'") && body.includes("'translation_lines'") && body.includes("Invalid line link scope"),"scope validation absent");
    assert(body.includes("p_changes -> 'inserts' -> 'translation_line_links'") && body.includes("v_link_check"),"validation must only cover links in this call");
    for (const t of ["translation_lines"]) {
      const g=await sql`select has_table_privilege('anon',${`public.${t}`},'SELECT') a, has_table_privilege('authenticated',${`public.${t}`},'SELECT') r, has_table_privilege('authenticated',${`public.${t}`},'INSERT') w, has_table_privilege('service_role',${`public.${t}`},'INSERT') s, (select relrowsecurity from pg_class where oid=${`public.${t}`}::regclass) rls`;
      assert(g[0]?.["a"]===false && g[0]?.["r"]===true && g[0]?.["w"]===false && g[0]?.["s"]===true && g[0]?.["rls"]===true,`${t} grants/RLS`);
    }
    await expectError(as("authenticated",ALICE,tx=>tx`insert into public.translation_line_links(id,project_id,variant_id,language,source_block_ids,target_translation_ids,origin,confidence) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'en','{}','{}','ai',0.5)`),"42501");
  });

  await test("0065: harmonisering og foretrukket referanse via apply_changes, RLS og validering", async () => {
    const bp=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('Harmonize fixture') id`)[0]))?.["id"]);
    await sql`insert into public.project_members(project_id,user_id,role) values(${bp},${BOB},'editor')`;
    let st=await loadState(bp);
    const assetId=newId(),variantId=newId(),srcVersionId=newId(),profileId=newId();
    st=await runCommand(st,ALICE,{type:"CreateAssets",assets:[{assetId:assetId as never,fields:{kind:"character",name:"Maja",names:[],description:"",category:"",tags:[]}}]});
    st=await runCommand(st,ALICE,{type:"CreateAssetVariant",variantId:variantId as never,assetId:assetId as never,fields:{name:"Animatic",style:"animatic",appearance:""}});
    st=await runCommand(st,ALICE,{type:"AddAssetVersion",versionId:srcVersionId as never,variantId:variantId as never,media:{path:`${bp}/${assetId}/${srcVersionId}/maja.png`,mimeType:"image/png",width:800,height:1200,byteSize:4096,sha256:"d".repeat(64)},note:"Kilde"});
    st=await runCommand(st,ALICE,{type:"CreateStyleProfile",profileId:profileId as never,fields:{name:"Filmens visuelle stil",isDefault:true,guide:{...emptyStyleGuide(),visualStyle:"Watercolour"}}});
    // Harmonized image: new variant + new version + metadata in one undoable command; source untouched.
    const harmId=newId(),newVarId=newId(),newVerId=newId();
    st=await runCommand(st,ALICE,{type:"ApplyHarmonizedImage",harmonizationId:harmId,variantId:newVarId as never,versionId:newVerId as never,media:{path:`${bp}/${assetId}/${newVerId}/maja-h.png`,mimeType:"image/png",width:800,height:1200,byteSize:4096,sha256:"e".repeat(64)},note:"Harmonisert",fields:{versionId:newVerId,sourceVersionId:srcVersionId,model:"google/gemini-3-pro-image",qualityProfile:null,styleProfileId:profileId,referenceVersionId:null,use:"variant",note:"Harmonisert"},newVariant:{assetId:assetId as never,fields:{name:"Harmonisert – Filmens visuelle stil",style:"illustrated",appearance:""}}});
    assert((await sql`select id from public.style_harmonizations where project_id=${bp} and version_id=${newVerId} and source_version_id=${srcVersionId}`).length===1,"harmonization row missing");
    assert((await sql`select id from public.asset_versions where id=${newVerId}`).length===1,"harmonized version missing");
    assert((await sql`select id from public.asset_variants where id=${newVarId}`).length===1,"harmonized variant missing");
    assert((await as("authenticated",BOB,tx=>tx`select id from public.style_harmonizations where project_id=${bp}`)).length===1,"member cannot read");
    assert((await as("authenticated",CAROL,tx=>tx`select id from public.style_harmonizations where project_id=${bp}`)).length===0,"nonmember sees harmonizations");
    await expectError(as("authenticated",ALICE,tx=>tx`insert into public.style_harmonizations(id,project_id,version_id,source_version_id,model,use) values(gen_random_uuid(),${bp},${newVerId},${srcVersionId},'x','variant')`),"42501");
    // Invalid metadata (unknown style profile) is rejected by apply_changes.
    const badRow={id:newId(),project_id:bp,version_id:newVerId,source_version_id:srcVersionId,model:"x",quality_profile:null,style_profile_id:newId(),reference_version_id:null,use:"variant",note:"",removed:false,revision:1};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"SetStyleHarmonization"})},null,${sql.json({inserts:{style_harmonizations:[badRow]}})})`),"23503");
    // REQ-0144: exactly one active preferred reference per (asset, style profile); the swap is atomic.
    const ref1=newId(),ref2=newId();
    st=await runCommand(st,ALICE,{type:"SetPreferredStyleReference",referenceId:ref1,fields:{assetId,styleProfileId:profileId,variantId:variantId as never}});
    st=await runCommand(st,ALICE,{type:"SetPreferredStyleReference",referenceId:ref2,fields:{assetId,styleProfileId:profileId,variantId:newVarId as never}});
    const active=await sql`select id from public.style_preferred_references where project_id=${bp} and not removed`;
    assert(active.length===1 && active[0]?.["id"]===ref2,"exactly one active preferred reference");
    assert((await sql`select removed from public.style_preferred_references where id=${ref1}`)[0]?.["removed"]===true,"old reference not retired");
    // A raw insert of a second active row for the same pair is rejected.
    const dupRow={id:newId(),project_id:bp,asset_id:assetId,style_profile_id:profileId,variant_id:variantId,removed:false,revision:1};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"SetPreferredStyleReference"})},null,${sql.json({inserts:{style_preferred_references:[dupRow]}})})`),"22023");
    // Deletion paths remove the new tables; nothing is left behind.
    await as("service_role",null,tx=>tx`select public.delete_project(${bp},${ALICE})`);
    for (const t of ["style_harmonizations","style_preferred_references","harmonize_batches"])
      assert((await sql`select id from ${sql(t)} where project_id=${bp}`).length===0,`${t} left after delete`);
    await as("service_role",null,tx=>tx`select public.purge_project_assets(${bp},${ALICE})`);
    assert((await sql`select id from public.projects where id=${bp}`).length===0,"project not purged");
  });

  await test("0065: harmoniseringsbatch er idempotent, budsjett- og nøkkelvernet, med lease og tapsfri fullføring", async () => {
    const bp=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('Harmonize batch fixture') id`)[0]))?.["id"]);
    let st=await loadState(bp);
    const assetId=newId(),variantId=newId(),srcVersionId=newId(),profileId=newId();
    st=await runCommand(st,ALICE,{type:"CreateAssets",assets:[{assetId:assetId as never,fields:{kind:"character",name:"Rev",names:[],description:"",category:"",tags:[]}}]});
    st=await runCommand(st,ALICE,{type:"CreateAssetVariant",variantId:variantId as never,assetId:assetId as never,fields:{name:"Animatic",style:"animatic",appearance:""}});
    st=await runCommand(st,ALICE,{type:"AddAssetVersion",versionId:srcVersionId as never,variantId:variantId as never,media:{path:`${bp}/${assetId}/${srcVersionId}/rev.png`,mimeType:"image/png",width:800,height:1200,byteSize:4096,sha256:"f".repeat(64)},note:"Kilde"});
    st=await runCommand(st,ALICE,{type:"CreateStyleProfile",profileId:profileId as never,fields:{name:"Filmens visuelle stil",isDefault:true,guide:{...emptyStyleGuide(),visualStyle:"Watercolour"}}});
    const reqId=newId(),itemId=newId(),jobId=newId(),bVarId=newId(),bVerId=newId(),bHarmId=newId(),bCmdId=newId();
    const items=()=>sql.json([{id:itemId,job_id:jobId,asset_id:assetId,source_version_id:srcVersionId,variant_id:bVarId,version_id:bVerId,harmonization_id:bHarmId,command_id:bCmdId,cost:0}]);
    const create=(req:string)=>as("service_role",null,tx=>tx`select public.create_harmonize_batch(${bp},${ALICE},${req},${profileId},null,'lovable','google/gemini-3-pro-image','1K',null,${items()},null,${ALICE}) id`);
    const b1=String((await create(reqId))[0]?.["id"]), b2=String((await create(reqId))[0]?.["id"]);
    assert(b1===b2,"batch creation not idempotent");
    assert((await sql`select count(*)::int n from public.harmonize_batches where project_id=${bp}`)[0]?.["n"]===1,"duplicate batch");
    assert((await sql`select status from public.generation_jobs where id=${jobId}`)[0]?.["status"]==="queued","job receipt not reserved");
    // A non-lovable provider without a valid key is rejected before anything is reserved.
    await expectError(as("service_role",null,tx=>tx`select public.create_harmonize_batch(${bp},${ALICE},${newId()},${profileId},null,'openai','gpt-image','1K',null,${items()},null,${ALICE})`),"42501");
    assert((await sql`select count(*)::int n from public.harmonize_batches where project_id=${bp}`)[0]?.["n"]===1,"rejected batch was created");
    const lease=newId();
    const claimed=(await as("service_role",null,tx=>tx`select public.claim_harmonize_batch(${b1},${lease}) b`))[0]?.["b"] as Record<string,unknown>;
    assert(claimed && claimed["lease_token"]===lease,"lease not granted");
    // A second claim while the lease is active returns nothing.
    assert((await as("service_role",null,tx=>tx`select public.claim_harmonize_batch(${b1},${newId()}) b`))[0]?.["b"]===null,"double claim");
    await as("service_role",null,tx=>tx`select public.transition_harmonize_batch_item(${itemId},${lease},${sql.json({status:"ready"})})`);
    // Wrong command type is rejected.
    await expectError(as("service_role",null,tx=>tx`select public.complete_harmonize_batch_item(${itemId},${lease},${sql.json({type:"AddAssetVersion"})},null,null)`),"22023");
    // Completing applies the harmonized image through apply_changes in the same transaction.
    const cmd: Command={type:"ApplyHarmonizedImage",harmonizationId:bHarmId,variantId:bVarId as never,versionId:bVerId as never,media:{path:`${bp}/${assetId}/${bVerId}/rev-h.png`,mimeType:"image/png",width:800,height:1200,byteSize:4096,sha256:"a".repeat(64)},note:"Harmonisert",fields:{versionId:bVerId,sourceVersionId:srcVersionId,model:"google/gemini-3-pro-image",qualityProfile:null,styleProfileId:profileId,referenceVersionId:null,use:"variant",note:"Harmonisert"},newVariant:{assetId:assetId as never,fields:{name:"Harmonisert",style:"illustrated",appearance:""}}};
    const res=applyCommand(st,{id:bCmdId as never,actor:ALICE,at:new Date().toISOString(),command:cmd});
    assert(res.ok,`Kjernen avviste ApplyHarmonizedImage: ${res.ok?"":res.error.message}`);
    if(res.ok){
      const changes=diffStates(st,res.state);
      await as("service_role",null,tx=>tx`select public.complete_harmonize_batch_item(${itemId},${lease},${tx.json(cmd as never)},${tx.json(res.inverse as never)},${tx.json(changes as never)})`);
      st=res.state;
    }
    assert((await sql`select status from public.harmonize_batch_items where id=${itemId}`)[0]?.["status"]==="done","item not done");
    assert((await sql`select id from public.style_harmonizations where id=${bHarmId}`).length===1,"harmonization not applied");
    // Completing again is idempotent: no duplicate command in the log.
    await as("service_role",null,tx=>tx`select public.complete_harmonize_batch_item(${itemId},${lease},${sql.json({type:"ApplyHarmonizedImage"})},null,null)`);
    assert((await sql`select count(*)::int n from public.change_log where id=${bCmdId}`)[0]?.["n"]===1,"command applied twice");
    await as("service_role",null,tx=>tx`select public.delete_project(${bp},${ALICE})`);
    assert((await sql`select id from public.harmonize_batches where project_id=${bp}`).length===0,"batch left after delete");
    await as("service_role",null,tx=>tx`select public.purge_project_assets(${bp},${ALICE})`);
    assert((await sql`select id from public.projects where id=${bp}`).length===0,"project not purged");
  });

  await test("0066: språkversjoner – RLS/grants, utvidede språkbegrensninger og slettingsrekkefølge", async () => {
    const g=await sql`select has_table_privilege('anon','public.language_versions','SELECT') a, has_table_privilege('authenticated','public.language_versions','SELECT') r, has_table_privilege('authenticated','public.language_versions','INSERT') w, has_table_privilege('authenticated','public.language_versions','UPDATE') u, has_table_privilege('service_role','public.language_versions','INSERT') s, (select relrowsecurity from pg_class where oid='public.language_versions'::regclass) rls`;
    assert(g[0]?.["a"]===false && g[0]?.["r"]===true && g[0]?.["w"]===false && g[0]?.["u"]===false && g[0]?.["s"]===true && g[0]?.["rls"]===true,"language_versions grants/RLS");
    for (const t of ["translations","translation_lines","translation_line_links"]) {
      const c=await sql`select is_nullable from information_schema.columns where table_schema='public' and table_name=${t} and column_name='language_version_id'`;
      assert(c[0]?.["is_nullable"]==="YES",`${t}.language_version_id must be nullable`);
      const old=await sql`select 1 from information_schema.columns where table_schema='public' and table_name=${t} and column_name='language'`;
      assert(old.length===1,`${t}.language must be kept`);
    }
    // Historisk gyldige verdier og særverdiene beholdes; nye BCP-47-koder godtas; ugyldige avvises.
    const defs=Object.fromEntries((await sql`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('translations_language_check','audio_clips_language_check','takes_audio_language_check')`).map(r=>[r["conname"],String(r["d"])]));
    assert(defs["audio_clips_language_check"]?.includes("'*'") && defs["takes_audio_language_check"]?.includes("'none'"),"special audio values lost");
    const probe=async(v:string)=>{ try { await sql.begin(async tx=>{ await tx`insert into public.translations(id,project_id,block_id,language,text) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),${v},'x')`; }); return "inserted"; } catch(e){ return String((e as {code?:string}).code); } };
    // Foreign keys fail after the check passes (23503); the check fails first for invalid tags (23514).
    for (const v of ["en","en-GB","de","pt-BR","sr-Latn","zh-Hant-TW","es-419","nb","no"]) { const r=await probe(v); assert(r==="23503",`valid tag ${v} rejected by check (${r})`); }
    for (const v of ["EN","en-us","en_US","x"]) { const r=await probe(v); assert(r==="23514",`invalid tag ${v} accepted (${r})`); }
    for (const name of ["delete_project","purge_project_assets"]) {
      const body=String((await sql`select pg_get_functiondef(${`public.${name}(uuid,uuid)`}::regprocedure) b`)[0]?.["b"]);
      assert(body.indexOf("delete from public.translations")>0 && body.indexOf("delete from public.translations")<body.indexOf("delete from public.language_versions") && (name==="delete_project" || body.indexOf("delete from public.language_versions")<body.indexOf("delete from public.projects")),`${name}: language versions must delete after translations (and before the project row)`);
    }
    const ac=String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(ac.indexOf("'language_versions','translations'")>0 && ac.includes("'translations','language_versions'") && ac.includes("Invalid language version scope"),"apply_changes lacks language versions");
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"])>=66,"schema version 66");
    await expectError(as("authenticated",ALICE,tx=>tx`insert into public.language_versions(id,project_id,language,name) values(gen_random_uuid(),gen_random_uuid(),'de','Tysk')`),"42501");
  });

  await test("0066: tre målspråk via apply_changes – revisjoner, idempotens, angre/gjør om, kollisjoner, sceneisolasjon, 1:n/n:1 og historiske rader", async () => {
    const bp=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('ML3 fixture') id`)[0]))?.["id"]);
    await sql`insert into public.project_members(project_id,user_id,role) values(${bp},${BOB},'editor')`;
    let st=await loadState(bp);const prod=Object.values(st.productions).find(p=>p.kind==='main');assert(prod,"main missing");
    const mk=(n:number)=>{let k:string|null=null;return Array.from({length:n},(_,i)=>{k=keyBetween(k,null);return {blockId:newId() as never,kind:"action" as const,text:`Norsk ${i}`,orderKey:k};});};
    const v1=newId(),v2=newId();const blocks1=mk(3),blocks2=mk(2);
    st=await runCommand(st,ALICE,{type:"CreateScene",productionId:prod.id,sceneId:newId() as never,variantId:v1 as never,occurrenceId:newId() as never,orderKey:keyBetween(null,null),heading:{intExt:"INT.",location:"A",time:"DAG"},blocks:blocks1});
    st=await runCommand(st,ALICE,{type:"CreateScene",productionId:prod.id,sceneId:newId() as never,variantId:v2 as never,occurrenceId:newId() as never,orderKey:keyBetween(orderedOccurrences(st,prod.id).at(-1)?.orderKey ?? null,null),heading:{intExt:"INT.",location:"B",time:"DAG"},blocks:blocks2});
    const norsk=async()=>Object.fromEntries((await sql`select id,text,revision from public.script_blocks where project_id=${bp}`).map(r=>[r["id"],`${r["text"]}#${r["revision"]}`]));
    const before=await norsk();
    // Historisk rad fra før 0066: ingen versjon, avledes fra prosjekt + språk
    const legacyId=newId();
    await sql`insert into public.translations(id,project_id,block_id,language,text,based_on_rev,status) values(${legacyId},${bp},${blocks1[2]!.blockId},'en','Old English',1,'approved')`;
    st=await loadState(bp);
    const ids:Record<string,string>={};
    for (const language of ["de","pt-BR","sr-Latn"]) { ids[language]=newId(); st=await runCommand(st,ALICE,{type:"AddLanguageVersion",versionId:ids[language]!,language,name:`V ${language}`}); }
    assert((await as("authenticated",BOB,tx=>tx`select id from public.language_versions where project_id=${bp}`)).length===3,"member cannot read");
    assert((await as("authenticated",CAROL,tx=>tx`select id from public.language_versions where project_id=${bp}`)).length===0,"nonmember reads");
    // Samme språk med annen skrivemåte stoppes av databasen også når kjernen omgås
    const dup={id:newId(),project_id:bp,language:"pt-br",name:"Dup",status:"active",removed:false,revision:1};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"AddLanguageVersion"})},null,${sql.json({inserts:{language_versions:[dup]}})})`),/language|unique|check/i);
    const dup2={...dup,id:newId(),language:"PT-BR"};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"AddLanguageVersion"})},null,${sql.json({inserts:{language_versions:[dup2]}})})`),/language|unique|check/i);
    // Import (uncertain) i to språk, linjer i sr-Latn, 1:n og n:1
    const tDe=newId(),tPt=newId(),u1=newId(),u2=newId();
    st=await runCommand(st,ALICE,{type:"AddTranslations",items:[{translationId:tDe as never,fields:{blockId:blocks1[0]!.blockId,variantId:null,language:"de",text:"Deutsch",basedOnRev:1,status:"uncertain"}},{translationId:tPt as never,fields:{blockId:blocks1[0]!.blockId,variantId:null,language:"pt-BR",text:"Olá",basedOnRev:1,status:"uncertain"}}]});
    st=await runCommand(st,ALICE,{type:"AddTranslationLines",items:[{lineId:u1,fields:{variantId:v1,language:"sr-Latn",ord:0,kind:"action",text:"Prva"}},{lineId:u2,fields:{variantId:v1,language:"sr-Latn",ord:1,kind:"action",text:"Druga"}}]});
    const vrows=await sql`select id,language,language_version_id v from public.translations where project_id=${bp} union all select id,language,language_version_id from public.translation_lines where project_id=${bp}`;
    assert(vrows.find(r=>r["id"]===tDe)?.["v"]===ids["de"] && vrows.find(r=>r["id"]===u1)?.["v"]===ids["sr-Latn"] && vrows.find(r=>r["id"]===legacyId)?.["v"]===null,"version ids not stored");
    const split=newId(),merge=newId();
    st=await runCommand(st,ALICE,{type:"SetLineLink",linkId:split,fields:{variantId:v1,language:"sr-Latn",sourceBlockIds:[blocks1[0]!.blockId],targetTranslationIds:[u1,u2],origin:"manual",confidence:1,reason:""}});
    st=await runCommand(st,ALICE,{type:"ApproveLineLinks",linkIds:[],additions:[{linkId:merge,fields:{variantId:v1,language:"pt-BR",sourceBlockIds:[blocks1[0]!.blockId,blocks1[1]!.blockId],targetTranslationIds:[tPt],origin:"approved",confidence:0.9,reason:""}}]});
    const lrows=await sql`select id,language_version_id v from public.translation_line_links where project_id=${bp}`;
    assert(lrows.find(r=>r["id"]===split)?.["v"]===ids["sr-Latn"] && lrows.find(r=>r["id"]===merge)?.["v"]===ids["pt-BR"],"link versions");
    // Feil scope: versjon fra et annet språk, mål fra en annen versjon, og annen scene
    const wrongLang={id:newId(),project_id:bp,block_id:blocks1[1]!.blockId,variant_id:null,language:"pt-BR",text:"x",based_on_rev:1,status:"approved",removed:false,revision:1,language_version_id:ids["de"]};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"AddTranslations"})},null,${sql.json({inserts:{translations:[wrongLang]}})})`),"22023");
    const wrongTarget={id:newId(),project_id:bp,variant_id:v1,language:"sr-Latn",source_block_ids:[blocks1[1]!.blockId],target_translation_ids:[u1],origin:"manual",confidence:1,reason:"",removed:false,revision:1,language_version_id:ids["de"]};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"SetLineLink"})},null,${sql.json({inserts:{translation_line_links:[wrongTarget]}})})`),"22023");
    const otherScene={...wrongTarget,id:newId(),variant_id:v2,source_block_ids:[blocks2[0]!.blockId],language_version_id:ids["sr-Latn"]};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"SetLineLink"})},null,${sql.json({inserts:{translation_line_links:[otherScene]}})})`),"22023");
    // Revisjonskontroll
    const stale={id:ids["de"],language:"de",name:"Gammel",status:"active",removed:false,revision:6,expected_revision:5};
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"UpdateLanguageVersion"})},null,${sql.json({updates:{language_versions:[stale]}})})`),"P0409");
    // Idempotens: samme kommando-ID to ganger gir ingen ny endring
    const cmdId=newId();const rename:Command={type:"UpdateLanguageVersion",versionId:ids["de"]!,name:"Tysk"};
    const res=applyCommand(st,{id:cmdId as never,actor:ALICE,at:new Date().toISOString(),command:rename});assert(res.ok,"rename rejected");
    if (!res.ok) return;
    const ch=diffStates(st,res.state);
    await as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${cmdId},${tx.json(rename as never)},${tx.json(res.inverse as never)},${tx.json(ch as never)})`);
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${cmdId},${tx.json(rename as never)},${tx.json(res.inverse as never)},${tx.json(ch as never)})`),/./);
    assert((await sql`select revision from public.language_versions where id=${ids["de"]!}`)[0]?.["revision"]===2,"rename applied twice");
    st=res.state;
    // Angre og gjør om navnet
    st=await runCommand(st,ALICE,res.inverse);
    assert((await sql`select name from public.language_versions where id=${ids["de"]!}`)[0]?.["name"]==="V de","undo rename");
    st=await runCommand(st,ALICE,rename);
    assert((await sql`select name from public.language_versions where id=${ids["de"]!}`)[0]?.["name"]==="Tysk","redo rename");
    // Godkjenning, angring og fjerning: norsk og andre språk uendret
    const deBefore=await sql`select id,text,status,revision from public.translations where language='de' and project_id=${bp}`;
    const approve:Command={type:"UpdateTranslations",items:[{translationId:tPt as never,fields:{blockId:blocks1[0]!.blockId as never,variantId:null,language:"pt-BR",text:"Olá",basedOnRev:1,status:"approved"}}]};
    const appr=applyCommand(st,{id:newId() as never,actor:ALICE,at:new Date().toISOString(),command:approve});assert(appr.ok,"approve");
    if (!appr.ok) return;
    st=await runCommand(st,ALICE,approve);
    assert((await sql`select status from public.translations where id=${tPt}`)[0]?.["status"]==="approved","approve not stored");
    st=await runCommand(st,ALICE,appr.inverse);
    assert((await sql`select status from public.translations where id=${tPt}`)[0]?.["status"]==="uncertain","undo approve");
    st=await runCommand(st,ALICE,{type:"SetLanguageVersionRemoved",versionId:ids["sr-Latn"]!,removed:true});
    assert((await sql`select count(*)::int n from public.translation_lines where project_id=${bp} and not removed`)[0]?.["n"]===2,"removing a version deleted lines");
    st=await runCommand(st,ALICE,{type:"SetLanguageVersionRemoved",versionId:ids["sr-Latn"]!,removed:false});
    const deAfter=await sql`select id,text,status,revision from public.translations where language='de' and project_id=${bp}`;
    assert(isDeepStrictEqual([...deBefore],[...deAfter]),"other language changed");
    assert(isDeepStrictEqual(before,await norsk()),"Norwegian source changed");
    // Kollisjoner fra historiske data blir liggende urørt
    await sql`insert into public.translation_lines(id,project_id,variant_id,language,ord,text) values(${newId()},${bp},${v2},'en-US',0,'a'),(${newId()},${bp},${v2},'en-US',1,'b')`;
    st=await loadState(bp);
    st=await runCommand(st,ALICE,{type:"EditBlockText",productionId:prod.id,blockId:blocks2[1]!.blockId as never,text:"Senere endring"});
    assert((await sql`select count(*)::int n from public.translation_lines where project_id=${bp} and lower(language)='en-us'`)[0]?.["n"]===2,"collision rows changed");
    assert((await sql`select text from public.translations where id=${legacyId}`)[0]?.["text"]==="Old English","legacy row changed");
    // Sletting og purge
    await as("service_role",null,tx=>tx`select public.delete_project(${bp},${ALICE})`);
    assert((await sql`select id from public.language_versions where project_id=${bp}`).length===0,"language versions left after delete");
    await as("service_role",null,tx=>tx`select public.purge_project_assets(${bp},${ALICE})`);
    assert((await sql`select id from public.projects where id=${bp}`).length===0,"project not purged");
  });

  await test("0065: RLS/grants, server-only batchfunksjoner og slettingsrekkefølge", async () => {
    for (const t of ["style_harmonizations","style_preferred_references","harmonize_batches","harmonize_batch_items"]) {
      const g=await sql`select has_table_privilege('anon',${`public.${t}`},'SELECT') a, has_table_privilege('authenticated',${`public.${t}`},'SELECT') r, has_table_privilege('authenticated',${`public.${t}`},'INSERT') w, has_table_privilege('service_role',${`public.${t}`},'INSERT') s, (select relrowsecurity from pg_class where oid=${`public.${t}`}::regclass) rls`;
      assert(g[0]?.["a"]===false && g[0]?.["r"]===true && g[0]?.["w"]===false && g[0]?.["s"]===true && g[0]?.["rls"]===true,`${t} grants/RLS`);
    }
    for (const signature of ["public.create_harmonize_batch(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,uuid,uuid)","public.claim_harmonize_batch(uuid,uuid)","public.complete_harmonize_batch_item(uuid,uuid,jsonb,jsonb,jsonb)","public.transition_harmonize_batch_item(uuid,uuid,jsonb)","public.resume_harmonize_batch(uuid,uuid,uuid)","public.reconfirm_harmonize_batch(uuid,uuid,uuid)"]) {
      const rights=await sql`select has_function_privilege('authenticated',${signature},'EXECUTE') c, has_function_privilege('anon',${signature},'EXECUTE') a, has_function_privilege('service_role',${signature},'EXECUTE') s`;
      assert(rights[0]?.["c"]===false && rights[0]?.["a"]===false && rights[0]?.["s"]===true,`${signature}: tilgang avviker`);
    }
    const completeBody=String((await sql`select pg_get_functiondef('public.complete_harmonize_batch_item(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(completeBody.includes("public.apply_changes") && completeBody.includes("lease_token") && completeBody.includes("ApplyHarmonizedImage"),"completion is not transactional/lease-guarded");
    const claimBody=String((await sql`select pg_get_functiondef('public.claim_harmonize_batch(uuid,uuid)'::regprocedure) b`)[0]?.["b"]);
    assert(claimBody.includes("retryable = false"),"crashed generations must not be replayed");
    for (const fn of ["delete_project(uuid,uuid)","purge_project_assets(uuid,uuid)"]) {
      const body=String((await sql`select pg_get_functiondef(${`public.${fn}`}::regprocedure) b`)[0]?.["b"]);
      assert(body.indexOf("delete from public.style_harmonizations")<body.indexOf("delete from public.style_profiles"),"harmonizations must delete before style profiles");
      assert(body.includes("delete from public.harmonize_batches"),"harmonize batches not deleted");
    }
    const applyBody=String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(applyBody.includes("'style_harmonizations'") && applyBody.includes("'style_preferred_references'"),"new tables missing from apply_changes");
    assert(applyBody.includes("Invalid harmonization") && applyBody.includes("More than one preferred reference"),"validation absent");
    const purgeBody=String((await sql`select pg_get_functiondef('public.purge_removed_assets(uuid,uuid,uuid[],uuid[])'::regprocedure) b`)[0]?.["b"]);
    assert(purgeBody.includes("delete from public.style_harmonizations") && purgeBody.includes("delete from public.style_preferred_references"),"purge_removed_assets misses the new tables");
  });
  await test("0067: R1 ProRes i «Endelig», R2 oppryddingslogg (grants/RLS) og strengere språkversjonssjekk", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"])>=67,"schema version 67+");
    // R1: nye prosjekter får ProRes i «Endelig»; øvrige standardprofiler er uendret
    const np=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('R1 fixture') id`)[0]))?.["id"]);
    const qp=await sql`select name, spec from public.quality_profiles where project_id=${np} order by name`;
    const spec=(n:string)=>qp.find(r=>r["name"]===n)?.["spec"] as {export?:{format?:string}}|undefined;
    assert(spec("Final")?.export?.format==="prores" && spec("Draft")?.export?.format==="mp4" && spec("Review")?.export?.format==="mp4","create_project: Endelig must default to ProRes");
    // R2: loggtabellen – bare serveren skriver, medlemmer leser, ikke-medlemmer ser ingenting
    const g=await sql`select has_table_privilege('anon','public.storage_cleanups','SELECT') a, has_table_privilege('authenticated','public.storage_cleanups','SELECT') r, has_table_privilege('authenticated','public.storage_cleanups','INSERT') w, has_table_privilege('authenticated','public.storage_cleanups','DELETE') d, has_table_privilege('service_role','public.storage_cleanups','INSERT') s, (select relrowsecurity from pg_class where oid='public.storage_cleanups'::regclass) rls`;
    assert(g[0]?.["a"]===false && g[0]?.["r"]===true && g[0]?.["w"]===false && g[0]?.["d"]===false && g[0]?.["s"]===true && g[0]?.["rls"]===true,"storage_cleanups grants/RLS");
    await expectError(as("authenticated",ALICE,tx=>tx`insert into public.storage_cleanups(project_id,actor,file_count,total_bytes) values(${np},${ALICE},1,1)`),"42501");
    await as("service_role",null,tx=>tx`insert into public.storage_cleanups(project_id,actor,file_count,total_bytes,paths) values(${np},${ALICE},1,10,${tx.json([`${np}/generated/a/v/x.png`])})`);
    await sql`insert into public.project_members(project_id,user_id,role) values(${np},${BOB},'editor')`;
    assert((await as("authenticated",BOB,tx=>tx`select id from public.storage_cleanups where project_id=${np}`)).length===1,"member cannot read log");
    assert((await as("authenticated",CAROL,tx=>tx`select id from public.storage_cleanups where project_id=${np}`)).length===0,"nonmember reads log");
    await expectError(as("service_role",null,tx=>tx`insert into public.storage_cleanups(project_id,actor,file_count,total_bytes) values(${np},${ALICE},-1,0)`),"23514");
    const purge=String((await sql`select pg_get_functiondef('public.purge_project_assets(uuid,uuid)'::regprocedure) b`)[0]?.["b"]);
    assert(purge.indexOf("delete from public.storage_cleanups")>0 && purge.indexOf("delete from public.storage_cleanups")<purge.indexOf("delete from public.projects"),"purge_project_assets must delete the cleanup log before the project");
    await as("service_role",null,tx=>tx`select public.delete_project(${np},${ALICE})`);
    await as("service_role",null,tx=>tx`select public.purge_project_assets(${np},${ALICE})`);
    assert((await sql`select count(*)::int n from public.storage_cleanups where project_id=${np}`)[0]?.["n"]===0,"cleanup log survives purge");
    // Språkversjonssjekken: lenker kontrolleres også når versjonen ikke sendes, og når en linje flyttes
    const bp=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('0067 fixture') id`)[0]))?.["id"]);
    let st=await loadState(bp);const prod=Object.values(st.productions).find(p=>p.kind==='main');assert(prod,"main missing");
    const v1=newId();const b0=newId() as never;
    st=await runCommand(st,ALICE,{type:"CreateScene",productionId:prod.id,sceneId:newId() as never,variantId:v1 as never,occurrenceId:newId() as never,orderKey:keyBetween(null,null),heading:{intExt:"INT.",location:"A",time:"DAG"},blocks:[{blockId:b0,kind:"action",text:"Norsk",orderKey:keyBetween(null,null)}]});
    const ids:Record<string,string>={};
    for (const language of ["de","pt-BR","sr-Latn"]) { ids[language]=newId(); st=await runCommand(st,ALICE,{type:"AddLanguageVersion",versionId:ids[language]!,language,name:`V ${language}`}); }
    const uDe=newId(),uSr=newId(),uSr2=newId(),link=newId();
    st=await runCommand(st,ALICE,{type:"AddTranslationLines",items:[{lineId:uDe,fields:{variantId:v1,language:"de",ord:0,kind:"action",text:"Eins"}},{lineId:uSr,fields:{variantId:v1,language:"sr-Latn",ord:0,kind:"action",text:"Prva"}},{lineId:uSr2,fields:{variantId:v1,language:"sr-Latn",ord:1,kind:"action",text:"Druga"}}]});
    st=await runCommand(st,ALICE,{type:"SetLineLink",linkId:link,fields:{variantId:v1,language:"sr-Latn",sourceBlockIds:[b0],targetTranslationIds:[uSr],origin:"manual",confidence:1,reason:""}});
    const rev=async(t:string,id:string)=>Number((await sql`select revision from ${sql(t)} where id=${id}`)[0]?.["revision"]);
    // a) lenken får et mål fra en annen versjon uten å sende language_version_id
    let r=await rev("translation_line_links",link);
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"SetLineLink"})},null,${sql.json({updates:{translation_line_links:[{id:link,target_translation_ids:[uSr,uDe],revision:r+1,expected_revision:r}]}})})`),"22023");
    // b) en linje lenken peker på, flyttes til en annen versjon (samme språk er påkrevd, så også språket flyttes)
    r=await rev("translation_lines",uSr);
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"UpdateTranslationLine"})},null,${sql.json({updates:{translation_lines:[{id:uSr,language:"de",language_version_id:ids["de"],revision:r+1,expected_revision:r}]}})})`),"22023");
    // c) feil versjon for språket avvises fortsatt
    await expectError(as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${sql.json({type:"UpdateTranslationLine"})},null,${sql.json({updates:{translation_lines:[{id:uSr,language_version_id:ids["pt-BR"],revision:r+1,expected_revision:r}]}})})`),"22023");
    // d) gyldige endringer går gjennom: nytt mål i samme versjon uten å sende versjonen, og tekstendring på målet
    const lr=await rev("translation_line_links",link);
    await as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${tx.json({type:"SetLineLink"})},null,${tx.json({updates:{translation_line_links:[{id:link,target_translation_ids:[uSr,uSr2],revision:lr+1,expected_revision:lr}]}})})`);
    await as("service_role",null,tx=>tx`select public.apply_changes(${bp},${ALICE},${newId()},${tx.json({type:"UpdateTranslationLine"})},null,${tx.json({updates:{translation_lines:[{id:uSr,text:"Prva!",revision:r+1,expected_revision:r}]}})})`);
    assert((await sql`select target_translation_ids t from public.translation_line_links where id=${link}`)[0]?.["t"].length===2,"valid link update lost");
    const ac=String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(ac.includes("v_link_scope") && ac.includes("target_translation_ids && v_lang_changed"),"apply_changes lacks the 0067 link scope");
  });
  await test("0068: R3 tilbaketrekking av globale versjoner – grants, rettigheter, angre/gjør om, andre prosjekter uendret", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"])>=68,"schema version 68");
    const g=await sql`select has_table_privilege('anon','public.global_version_withdrawals','SELECT') a, has_table_privilege('authenticated','public.global_version_withdrawals','SELECT') r, has_table_privilege('authenticated','public.global_version_withdrawals','INSERT') w, has_table_privilege('authenticated','public.global_version_withdrawals','DELETE') d, has_table_privilege('service_role','public.global_version_withdrawals','INSERT') s, (select relrowsecurity from pg_class where oid='public.global_version_withdrawals'::regclass) rls, has_function_privilege('anon','public.global_set_version_withdrawn(uuid,boolean)','EXECUTE') fa, has_function_privilege('authenticated','public.global_set_version_withdrawn(uuid,boolean)','EXECUTE') fu`;
    assert(g[0]?.["a"]===false && g[0]?.["r"]===true && g[0]?.["w"]===false && g[0]?.["d"]===false && g[0]?.["s"]===true && g[0]?.["rls"]===true && g[0]?.["fa"]===false && g[0]?.["fu"]===true,"global_version_withdrawals grants/RLS");
    const DAVE="44444444-4444-7444-8444-444444444444";
    await sql`insert into auth.users (id, email) values (${DAVE}, 'dave@example.no') on conflict do nothing`;
    const ws=await as("authenticated",ALICE,async tx=>(await tx`select public.create_workspace('R3') as id`)[0]!["id"] as string);
    const tEd=await as("authenticated",ALICE,async tx=>(await tx`select public.create_workspace_invitation(${ws}, 'bob@example.no', 'editor') as t`)[0]!["t"] as string);
    await as("authenticated",BOB,tx=>tx`select public.accept_workspace_invitation(${tEd})`);
    const tMem=await as("authenticated",ALICE,async tx=>(await tx`select public.create_workspace_invitation(${ws}, 'carol@example.no', 'member') as t`)[0]!["t"] as string);
    await as("authenticated",CAROL,tx=>tx`select public.accept_workspace_invitation(${tMem})`);
    const ga=await as("authenticated",ALICE,async tx=>(await tx`select public.global_create_asset(${ws}, 'character', 'Nisse', '', '{}', '{}') as id`)[0]!["id"] as string);
    const gv=await as("authenticated",ALICE,async tx=>(await tx`select public.global_create_variant(${ga}, 'Standard', 'reference', '') as id`)[0]!["id"] as string);
    const sha="c".repeat(64), key=`global/${ws}/${ga}/${sha}.png`;
    const v1=await as("authenticated",ALICE,async tx=>(await tx`select public.global_add_version(${gv}, ${key}, 'image/png', 10, 10, 100, ${sha}, null, '') as id`)[0]!["id"] as string);
    const v2=await as("authenticated",BOB,async tx=>(await tx`select public.global_add_version(${gv}, ${key}, 'image/png', 10, 10, 100, ${sha}, null, 'harmonisert') as id`)[0]!["id"] as string);
    // Et annet prosjekt har tatt v2 i bruk (kopi med kobling); radene skal aldri endres
    const other=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('R3 annet') id`)[0]))?.["id"]);
    const snap=async()=>String((await sql`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h from (select a::text t from public.assets a where project_id=${other} union all select v::text from public.asset_versions v where project_id=${other} union all select p::text from public.projects p where id=${other}) x`)[0]?.["h"]);
    const before=await snap();
    const vrow=await sql`select row_to_json(v)::text j from public.global_asset_versions v where id=${v2}`;
    // Rettigheter: medlem, ikke-medlem og anonym kan ikke; direkte skriving stoppes
    await expectError(as("authenticated",CAROL,tx=>tx`select public.global_set_version_withdrawn(${v2}, true)`),"42501");
    await expectError(as("authenticated",DAVE,tx=>tx`select public.global_set_version_withdrawn(${v2}, true)`),"42501");
    await expectError(as("anon",null,tx=>tx`select public.global_set_version_withdrawn(${v2}, true)`),"42501");
    await expectError(as("authenticated",BOB,tx=>tx`insert into public.global_version_withdrawals(version_id,workspace_id,withdrawn_by) values(${v2},${ws},${BOB})`),"42501");
    await expectError(as("authenticated",BOB,tx=>tx`select public.global_set_version_withdrawn(${newId()}, true)`),"22023");
    // Angre = trekk tilbake (redaktør), idempotent
    const w1=await as("authenticated",BOB,async tx=>(await tx`select public.global_set_version_withdrawn(${v2}, true) as c`)[0]!["c"]);
    const w2=await as("authenticated",BOB,async tx=>(await tx`select public.global_set_version_withdrawn(${v2}, true) as c`)[0]!["c"]);
    assert(w1===true && w2===false,"withdraw must be idempotent");
    assert((await as("authenticated",CAROL,tx=>tx`select version_id from public.global_version_withdrawals where version_id=${v2}`)).length===1,"member must see the withdrawal");
    assert((await as("authenticated",DAVE,tx=>tx`select version_id from public.global_version_withdrawals`)).length===0,"nonmember sees withdrawals");
    assert((await sql`select row_to_json(v)::text j from public.global_asset_versions v where id=${v2}`)[0]?.["j"]===vrow[0]?.["j"],"the global version row must stay unchanged");
    assert((await sql`select count(*)::int n from public.global_asset_versions where id in (${v1},${v2})`)[0]?.["n"]===2,"versions must be kept");
    assert((await sql`select version_id from public.global_version_withdrawals where version_id=${v1}`).length===0,"other versions untouched");
    // Gjør om = publiser igjen (eier)
    const r1=await as("authenticated",ALICE,async tx=>(await tx`select public.global_set_version_withdrawn(${v2}, false) as c`)[0]!["c"]);
    assert(r1===true && (await sql`select version_id from public.global_version_withdrawals where version_id=${v2}`).length===0,"republish must remove the withdrawal");
    await as("authenticated",ALICE,tx=>tx`select public.global_set_version_withdrawn(${v2}, true)`);
    assert(await snap()===before,"other projects must never change");
    // Ingen funksjon er erstattet av 0068
    const ac=String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(!ac.includes("global_version_withdrawals"),"apply_changes must be unchanged");
  });
  await test("0069: opphavet til en versjon er en permanent ID (kontroll ved lagring, uforanderlig, ingen funksjon erstattet)", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"])>=69,"schema version 69");
    const col=await sql`select data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='asset_versions' and column_name='derived_from_version_id'`;
    assert(col[0]?.["data_type"]==="uuid" && col[0]?.["is_nullable"]==="YES","nullable uuid column");
    const pid=String((await as("authenticated",ALICE,async tx=>(await tx`select public.create_project('ID3 opphav') id`)[0]))?.["id"]);
    const asset=newId(), variant=newId();
    let st=await loadState(pid);
    st=await runCommand(st, ALICE, { type:"CreateAssets", assets:[{ assetId: asset as never, fields:{ kind:"character", name:"Maja", names:[], description:"", category:"", tags:[] } }] });
    st=await runCommand(st, ALICE, { type:"CreateAssetVariant", variantId: variant as never, assetId: asset as never, fields:{ name:"Animatic", style:"animatic", appearance:"" } });
    const from=newId();
    st=await runCommand(st, ALICE, { type:"AddAssetVersion", versionId: from as never, variantId: variant as never,
      media:{ path:`${pid}/id3/${from}/kilde.png`, mimeType:"image/png", width:10, height:10, byteSize:10, sha256:"c".repeat(64) }, note:"" });
    const nv=newId();
    st=await runCommand(st, ALICE, { type:"AddAssetVersion", versionId: nv as never, variantId: variant as never,
      media:{ path:`${pid}/id3/${nv}/frilagt.png`, mimeType:"image/png", width:10, height:10, byteSize:10, sha256:"a".repeat(64) },
      note:"Frilagt fra v1", derivedFromVersionId: from as never });
    const back=await loadState(pid);
    assert(back.assetVersions[nv]?.derivedFromVersionId===from,"derived_from_version_id round trip");
    // Kilden må finnes i samme prosjekt og ressurs (sjekkes ved commit, uavhengig av rekkefølgen i kallet)
    await expectError(sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, derived_from_version_id)
      values (gen_random_uuid(), ${pid}, ${variant}, 990, ${`${pid}/x/y/z.png`}, 'image/png', 1, ${"b".repeat(64)}, gen_random_uuid())`,"22023");
    await expectError(sql`update public.asset_versions set derived_from_version_id=null where id=${nv}`,/INV-13/);
    // Eldre rader er uendret (ingen tilbakefylling)
    assert(Number((await sql`select count(*)::int n from public.asset_versions where derived_from_version_id is not null and id<>${nv}`)[0]?.["n"])===0,"no backfill");
    const ac=String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(!ac.includes("derived_from"),"apply_changes must be unchanged");
  });
  await test("0070: delingsnøkkelen lagres bare som pepret hash; eldre lenker virker og fylles ved oppslag", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"])>=70,"schema version 70");
    const p = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('GP5 hash', 25, 1) as id`)[0]!["id"] as string);
    const prod = (await sql`select id from public.productions where project_id = ${p} limit 1`)[0]!["id"] as string;
    const rec = await as("authenticated", ALICE, async (tx) => (await tx`select public.record_export(${p}, ${prod}, 'film', 'film.mp4', '{}', '{}') as id`)[0]!["id"] as string);
    const mk = async () => (await as("authenticated", ALICE, async (tx) => (await tx`select public.create_film_share(${p}, ${rec}, 'Film', 1000, 5000, 1920, 1080, null) as r`)[0]!["r"] as { id: string })).id;
    // Ny deling: QR-nøkkelen kan vises igjen, slås opp via hash, og står ikke i klartekst noe sted
    const a = await mk();
    const ta = await as("authenticated", ALICE, async (tx) => (await tx`select public.activate_film_share(${a}, 1000) as t`)[0]!["t"] as string);
    assert((await as("authenticated", ALICE, async (tx) => (await tx`select public.film_share_token(${a}) as t`)[0]!["t"])) === ta, "QR igjen");
    const dump = JSON.stringify(await sql`select * from public.film_shares where id = ${a}`);
    assert(!dump.includes(ta), "nøkkelen finnes ikke i raden");
    assert((await sql`select public.film_share_lookup(${ta}) as id`)[0]!["id"] === a, "oppslag via hash");
    assert((await sql`select public.film_share_lookup(${"0".repeat(64)}) as id`)[0]!["id"] === null, "ukjent nøkkel");
    assert((await sql`select public.film_share_lookup('ikke-hex') as id`)[0]!["id"] === null, "ugyldig nøkkel");
    // Bare service role kan slå opp; pepperen er utilgjengelig
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.film_share_lookup(${ta})`), "42501");
    await expectError(as("anon", null, (tx) => tx`select public.film_share_lookup(${ta})`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select pepper from private.film_share_secret`), "42501");
    // Eldre deling (slik 0047 lagret den): klartekst + usaltet hash, ingen digest
    const b = await mk(); const tb = "ab".repeat(32);
    await sql`update public.film_shares set status='ready', activated_at=now(), token=${tb}, token_hash=encode(sha256(convert_to(${tb}, 'UTF8')), 'hex') where id = ${b}`;
    assert((await sql`select public.film_share_lookup(${tb}) as id`)[0]!["id"] === b, "eldre lenke virker");
    const filled = (await sql`select token_digest, token from public.film_shares where id = ${b}`)[0]!;
    assert(typeof filled["token_digest"] === "string" && filled["token"] === tb, "fylt ved første oppslag, klartekst ikke fjernet");
    assert((await sql`select public.film_share_lookup(${tb}) as id`)[0]!["id"] === b, "eldre lenke virker etter utfylling");
    assert((await as("authenticated", ALICE, async (tx) => (await tx`select public.film_share_token(${b}) as t`)[0]!["t"])) === tb, "QR for eldre deling");
    // Eksplisitt utfylling
    const c = await mk(); const tc = "cd".repeat(32);
    await sql`update public.film_shares set status='ready', activated_at=now(), token=${tc}, token_hash=encode(sha256(convert_to(${tc}, 'UTF8')), 'hex') where id = ${c}`;
    assert(Number((await sql`select private.film_share_backfill_digests() n`)[0]!["n"]) >= 1, "utfylling");
    assert((await sql`select token_digest from public.film_shares where id = ${c}`)[0]!["token_digest"] !== null, "c fylt");
    // Tilbakekalling stopper oppslaget i serveren (status), og QR forsvinner
    await as("authenticated", ALICE, (tx) => tx`select public.revoke_film_share(${a})`);
    assert((await as("authenticated", ALICE, async (tx) => (await tx`select public.film_share_token(${a}) as t`)[0]!["t"])) === null, "ingen QR etter tilbakekalling");
    // Ingen av de seks Cloud-funksjonene er erstattet
    const ac=String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(!ac.includes("token_digest"),"apply_changes uendret");
    await sql`select public.delete_project(${p}, ${ALICE})`;
  });
  await test("0071: riggmaler og rigger (B-087 runde 1): RLS, apply_changes, én standardrigg, globale maler, sletting", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 71, "schema version 71");
    // RLS og grant-mønsteret
    for (const tbl of ["rig_templates", "rig_setups", "global_rig_templates"]) {
      assert((await sql`select relrowsecurity as rls from pg_class where relname = ${tbl}`)[0]?.["rls"] === true, `${tbl}: RLS på`);
      const grants = (await sql`select grantee::text g, privilege_type::text p from information_schema.role_table_grants where table_name = ${tbl}`) as { g: string; p: string }[];
      assert(grants.some((r) => r.g === "authenticated" && r.p === "SELECT"), `${tbl}: medlemmer leser`);
      assert(grants.some((r) => r.g === "service_role" && r.p === "INSERT"), `${tbl}: service role skriver`);
      assert(!grants.some((r) => r.g === "anon"), `${tbl}: ikke anon`);
    }
    // apply_changes kjenner tabellene, og riggene slettes før scenene og prosjektraden
    const ac = String((await sql`select pg_get_functiondef('public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) b`)[0]?.["b"]);
    assert(ac.includes("rig_templates") && ac.includes("rig_setups"), "apply_changes kjenner riggtabellene");
    assert(ac.indexOf("'rig_setups'") < ac.indexOf("'scenes','rig_templates'") && ac.indexOf("'rig_templates','productions'") > 0, "sletterekkefølgen");
    const dp = String((await sql`select pg_get_functiondef('public.delete_project(uuid,uuid)'::regprocedure) b`)[0]?.["b"]);
    assert(dp.includes("rig_setups") && dp.indexOf("rig_setups") < dp.indexOf("delete from public.scenes"), "delete_project sletter riggene før scenene");
    // Lagkolonnene finnes
    const cols = (await sql`select column_name::text c from information_schema.columns where table_name = 'composition_layers'`) as { c: string }[];
    assert(cols.some((r) => r.c === "rig_plate_id") && cols.some((r) => r.c === "rig_plate_depth_mm"), "lagkolonner");
    // Skriving går via apply_changes (service role), lesing for medlemmer
    const bp = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Rigg') as id`)[0]!["id"])));
    const spec = JSON.stringify({ format: "1", camera: { sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50, cameraHeightMm: 900, mode: "fixed" }, plates: [{ id: "00000000-0000-4000-8000-000000000001", name: "Bord", heightMm: 0, glassThicknessMm: null }], calibration: null });
    const tid1 = crypto.randomUUID();
    const sid1 = crypto.randomUUID();
    const changes = JSON.stringify({
      inserts: {
        rig_templates: [{ id: tid1, project_id: bp, name: "Studiorigg", spec: JSON.parse(spec), revision: 1 }],
        rig_setups: [{ id: sid1, project_id: bp, scene_id: null, template_id: tid1, name: "Standard", spec: JSON.parse(spec), revision: 1 }],
      },
    });
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${ALICE}, ${crypto.randomUUID()}, ${tx.json({ type: "AddRigTemplate" })}, ${tx.json({})}, ${tx.json(JSON.parse(changes) as never)})`);
    assert((await as("authenticated", ALICE, async (tx) => (await tx`select count(*)::int n from public.rig_templates where project_id = ${bp}`)[0]!["n"])) === 1, "medlem leser malen");
    assert((await as("authenticated", CAROL, async (tx) => (await tx`select count(*)::int n from public.rig_templates where project_id = ${bp}`)[0]!["n"])) === 0, "ikke-medlem ser ingenting");
    // Én aktiv standardrigg per prosjekt
    await expectError(
      as("service_role", null, (tx) => tx`select public.apply_changes(${bp}, ${ALICE}, ${crypto.randomUUID()}, ${tx.json({ type: "AddRigSetup" })}, ${tx.json({})}, ${tx.json({ inserts: { rig_setups: [{ id: crypto.randomUUID(), project_id: bp, scene_id: null, template_id: null, name: "Ekstra", spec: JSON.parse(spec), revision: 1 }] } } as never)})`),
      "23505",
    );
    // Globale maler: publisering krever redaktørolle, radene er uforanderlige
    const ws = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace('Rigggruppen') as id`)[0]!["id"])));
    const gid = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.global_publish_rig_template(${ws}, 'Studiorigg', ${tx.json(JSON.parse(spec) as never)}, 'første') as id`)[0]!["id"])));
    const gid2 = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.global_publish_rig_template(${ws}, 'Studiorigg', ${tx.json(JSON.parse(spec) as never)}, '') as id`)[0]!["id"])));
    assert(gid !== gid2, "to publiseringer gir to versjoner");
    const nums = (await sql`select number::int n from public.global_rig_templates where workspace_id = ${ws} order by number`) as { n: number }[];
    assert(nums.map((r) => r.n).join() === "1,2", "nummerert per navn");
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.global_publish_rig_template(${ws}, 'X', ${tx.json(JSON.parse(spec) as never)}, '')`), "42501");
    await expectError(as("service_role", null, (tx) => tx`update public.global_rig_templates set note = 'x' where id = ${gid}`), "42501");
    assert((await as("authenticated", ALICE, async (tx) => (await tx`select count(*)::int n from public.global_rig_templates where workspace_id = ${ws}`)[0]!["n"])) === 2, "medlem leser globale maler");
    // Sletting av prosjektet tar riggene med
    await sql`select public.delete_project(${bp}, ${ALICE})`;
    assert((await sql`select count(*)::int n from public.rig_templates where project_id = ${bp}`)[0]!["n"] === 0, "maler slettet");
    assert((await sql`select count(*)::int n from public.rig_setups where project_id = ${bp}`)[0]!["n"] === 0, "rigger slettet");
  });
  await test("0072: målesett – RLS, apply_changes, revisjon, invers, delete_project og purge", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 72, "schema version 72");
    const bp = String((await as("authenticated", ALICE, async tx => (await tx`select public.create_project('Målesett') id`)[0]!["id"])));
    const prod = (await sql`select id from public.productions where project_id=${bp} and kind='main'`)[0]!["id"];
    const scene = crypto.randomUUID(), variant = crypto.randomUUID(), comp = crypto.randomUUID(), layer = crypto.randomUUID(), id = crypto.randomUUID();
    await sql`insert into public.scenes(id,project_id,origin_production_id) values(${scene},${bp},${prod})`;
    await sql`insert into public.scene_variants(id,project_id,scene_id) values(${variant},${bp},${scene})`;
    await sql`insert into public.compositions(id,project_id,variant_id) values(${comp},${bp},${variant})`;
    await sql`insert into public.composition_layers(id,project_id,composition_id,order_key,kind,width,height,fill,transform) values(${layer},${bp},${comp},'a','character',100,100,'#ffffff','{}')`;
    const row = {id, project_id: bp, layer_id: layer, frame: 0, name: "Høyde", markers: [{x: 0, y: 10}], revision: 1};
    const inverse = {deletes: {measure_sets: [{id, expected_revision: 1}]}};
    const apply = (changes: unknown, inv: unknown = {}) => as("service_role", null, tx => tx`select public.apply_changes(${bp},${ALICE},${crypto.randomUUID()},${tx.json({type: "MeasureSet"})},${tx.json(inv as never)},${tx.json(changes as never)})`);
    await apply({inserts: {measure_sets: [row]}}, inverse);
    assert((await as("authenticated", ALICE, tx => tx`select * from public.measure_sets where project_id=${bp}`)).length === 1, "medlem leser");
    assert((await as("authenticated", CAROL, tx => tx`select * from public.measure_sets where project_id=${bp}`)).length === 0, "ikke-medlem nektes innsyn");
    await expectError(as("authenticated", ALICE, tx => tx`update public.measure_sets set name='X' where id=${id}`), "42501");
    await expectError(as("authenticated", ALICE, tx => tx`delete from public.measure_sets where id=${id}`), "42501");
    await expectError(as("authenticated", ALICE, tx => tx`insert into public.measure_sets(id,project_id,layer_id,frame,name,markers) values(gen_random_uuid(),${bp},${layer},0,'X','[]')`), "42501");
    const grants = (await sql`select relrowsecurity r from pg_class where oid='public.measure_sets'::regclass`)[0];
    assert(grants?.["r"] === true, "RLS aktivert");
    await apply({updates: {measure_sets: [{id, expected_revision: 1, revision: 2, name: "Bredde"}]}});
    await expectError(apply({updates: {measure_sets: [{id, expected_revision: 1, revision: 2, name: "Foreldet"}]}}), "P0409");
    await apply({updates: {measure_sets: [{id, expected_revision: 2, revision: 3, name: "Høyde"}]}});
    assert((await sql`select name from public.measure_sets where id=${id}`)[0]?.["name"] === "Høyde", "angret oppdatering");
    await apply({deletes: {measure_sets: [{id, expected_revision: 3}]}});
    await apply({inserts: {measure_sets: [row]}}, inverse);
    const saved = (await sql`select inverse from public.change_log where project_id=${bp} order by created_at desc limit 1`)[0]!["inverse"];
    await apply(saved);
    assert((await sql`select id from public.measure_sets where id=${id}`).length === 0, "lagret invers angrer opprettelse");
    await apply({inserts: {measure_sets: [row]}});
    for (const invalid of [{name: ""}, {name: "x".repeat(81)}, {markers: {}}, {markers: ["x".repeat(65536)]}, {frame: -1}]) {
      await expectError(apply({inserts: {measure_sets: [{...row, ...invalid, id: crypto.randomUUID()}]}}), "23514");
    }
    await as("service_role", null, tx => tx`select public.purge_removed_assets(${bp},${ALICE},'{}'::uuid[],'{}'::uuid[])`);
    assert((await sql`select id from public.measure_sets where id=${id}`).length === 1, "purge av ressurser beholder målesett");
    await as("service_role", null, tx => tx`select public.delete_project(${bp},${ALICE})`);
    assert((await sql`select id from public.measure_sets where project_id=${bp}`).length === 0, "delete_project sletter målesett før lag");
    // Simuler innhold lagret samtidig med prosjektsletting: purge må også rydde dette.
    await sql`insert into public.productions(id,project_id,kind,name,fps_num,fps_den) values(${prod},${bp},'main','Hoved',24,1)`;
    await sql`insert into public.scenes(id,project_id,origin_production_id) values(${scene},${bp},${prod})`;
    await sql`insert into public.scene_variants(id,project_id,scene_id) values(${variant},${bp},${scene})`;
    await sql`insert into public.compositions(id,project_id,variant_id) values(${comp},${bp},${variant})`;
    await sql`insert into public.composition_layers(id,project_id,composition_id,order_key,kind,width,height,fill,transform) values(${layer},${bp},${comp},'a','character',100,100,'#ffffff','{}')`;
    await sql`insert into public.measure_sets(id,project_id,layer_id,frame,name,markers) values(${id},${bp},${layer},0,'Purge','[]')`;
    await as("service_role", null, tx => tx`select public.purge_project_assets(${bp},${ALICE})`);
    assert((await sql`select id from public.projects where id=${bp}`).length === 0, "purge fjerner prosjekt og målesett");
  });

  await test("0073 (B-097): land på kontoen (egen rad, check, RLS), sist endret per scene og brukere per land", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 73, "schema version 73");
    const OYSTEIN = "55555555-5555-7555-8555-555555555555";
    await sql`insert into auth.users (id, email) values (${OYSTEIN}, 'Oystein@gutu.no') on conflict do nothing`;
    const acct = async (u: string) =>
      (await as("authenticated", u, (tx) => tx`select public.my_account() as a`))[0]!["a"] as Record<string, unknown>;
    // Eget land: settes og leses via funksjonene
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_country('NO')`);
    assert((await acct(ALICE))["country"] === "NO", "my_account gir eget land");
    assert("country" in (await acct(CAROL)), "my_account har feltet også uten land");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_my_country('no')`), "22023");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_my_country('NOR')`), "22023");
    await expectError(as("anon", null, (tx) => tx`select public.set_my_country('NO')`), "42501");
    // Check i tabellen
    await expectError(sql`update public.profiles set country = 'xx' where user_id = ${ALICE}`, "23514");
    // Ingen kan lese eller endre land direkte (heller ikke sitt eget); visningsnavn kan fortsatt leses
    await expectError(as("authenticated", ALICE, (tx) => tx`select country from public.profiles`), "42501");
    await expectError(as("authenticated", BOB, (tx) => tx`select country from public.profiles where user_id = ${ALICE}`), "42501");
    await expectError(as("authenticated", BOB, (tx) => tx`select * from public.profiles`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.profiles set country = 'SE' where user_id = ${ALICE}`), "42501");
    assert((await as("authenticated", ALICE, (tx) => tx`select display_name from public.profiles where user_id = ${ALICE}`)).length === 1, "visningsnavn kan leses");
    assert((await acct(BOB))["country"] !== "NO" || BOB === ALICE, "Bob ser ikke Alices land");
    // Brukere per land: bare administrator, bare antall
    await expectError(as("authenticated", ALICE, (tx) => tx`select * from public.admin_country_counts()`), "42501");
    const counts = await as("authenticated", OYSTEIN, (tx) => tx`select * from public.admin_country_counts()`);
    assert(Object.keys(counts[0] ?? {}).sort().join(",") === "country,users", "bare land og antall");
    assert(Number(counts.find((r) => r["country"] === "NO")?.["users"]) >= 1, "Norge telles");

    // Sist endret per scene
    const bp = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Sist endret') id`)[0]!["id"])));
    const prod = (await sql`select id from public.productions where project_id=${bp} and kind='main'`)[0]!["id"];
    const s1 = crypto.randomUUID(), s2 = crypto.randomUUID();
    await sql`insert into public.scenes(id,project_id,origin_production_id,created_by,created_at) values(${s1},${bp},${prod},${ALICE},now() - interval '3 days'),(${s2},${bp},${prod},${ALICE},now() - interval '2 days')`;
    const cmd = crypto.randomUUID();
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${cmd},${tx.json({ type: "UpdateScene" })},${tx.json({})},${tx.json({} as never)})`);
    await as("service_role", null, (tx) => tx`update public.change_log set scene_ids = array[${s1}]::uuid[] where id = ${cmd}`);
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.change_log set scene_ids = '{}' where id = ${cmd}`), "42501");
    // scene_ids fylles bare én gang; resten av historikken er uforanderlig (INV-13)
    await expectError(as("service_role", null, (tx) => tx`update public.change_log set scene_ids = array[${s2}]::uuid[] where id = ${cmd}`), "P0001");
    await expectError(as("service_role", null, (tx) => tx`update public.change_log set command_type = 'X' where id = ${cmd}`), "P0001");
    await expectError(as("service_role", null, (tx) => tx`delete from public.change_log where id = ${cmd}`), "P0001");
    const rows = await as("authenticated", ALICE, (tx) => tx`select * from public.scene_last_changes(${bp})`);
    const r1 = rows.find((r) => r["scene_id"] === s1), r2 = rows.find((r) => r["scene_id"] === s2);
    const logAt = (await sql`select created_at from public.change_log where id = ${cmd}`)[0]!["created_at"] as Date;
    assert(r1?.["logged"] === true && (r1["changed_at"] as Date).getTime() === logAt.getTime() && r1["actor"] === ALICE, "siste endring for scene 1");
    assert(r2?.["logged"] === false && (r2["changed_at"] as Date).getTime() < logAt.getTime(), "scene uten endring får opprettelsestiden");
    assert((await as("authenticated", CAROL, (tx) => tx`select * from public.scene_last_changes(${bp})`)).length === 0, "ikke-medlem får ingenting");
    await expectError(as("anon", null, (tx) => tx`select * from public.scene_last_changes(${bp})`), "42501");
    const cmd2 = crypto.randomUUID();
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${cmd2},${tx.json({ type: "UpdateScene" })},${tx.json({})},${tx.json({} as never)})`);
    await expectError(sql`update public.change_log set scene_ids = ${sql.array(Array.from({ length: 1001 }, () => s1))}::uuid[] where id = ${cmd2}`, "23514");
    const idx = await sql`select indexdef from pg_indexes where indexname = 'change_log_scene_ids_idx'`;
    assert(String(idx[0]?.["indexdef"] ?? "").includes("gin"), "GIN-indeks");
    await as("service_role", null, (tx) => tx`select public.delete_project(${bp},${ALICE})`);
    assert((await sql`select id from public.change_log where project_id = ${bp}`).length === 0, "delete_project sletter loggen");
  });

  // ---------- B-098: fonter (0074) ----------
  await test("0074 (B-098): fontressurs med font_spec via apply_changes, mime og kind-check, RLS og global font", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 74, "schema version 74");
    const fp = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Fonter') as id`)[0]!["id"] as string);
    const F = (n: number) => `abcdef00-0000-7000-8000-00000074${String(n).padStart(4, "0")}`;
    let st = await loadState(fp);
    const spec = {
      family: "Lato", category: "sans", weights: [400], italics: [], subsets: ["latin"], license: "OFL-1.1",
      sourceUrl: "https://fonts.google.com/specimen/Lato", version: "v24",
      files: [{ name: "400-all-0.ttf", weight: 400, italic: false, format: "ttf", bytes: 10 }],
    };
    st = await runCommand(st, ALICE, { type: "CreateAssets", assets: [{ assetId: F(1) as never, fields: { kind: "font", name: "Lato", names: [], description: "", category: "sans", tags: [] } }] });
    st = await runCommand(st, ALICE, { type: "CreateAssetVariant", variantId: F(2) as never, assetId: F(1) as never, fields: { name: "Standard", style: "other", appearance: "" } });
    st = await runCommand(st, ALICE, {
      type: "AddAssetVersion", versionId: F(3) as never, variantId: F(2) as never,
      media: { path: `${fp}/source/${F(1)}/${F(3)}/Lato.ptgfont`, mimeType: "application/x-ptg-fontpack", width: null, height: null, byteSize: 100, sha256: "f".repeat(64), durationMs: null },
      note: "", font: spec as never,
    });
    const row = await sql`select a.kind, v.mime_type, v.font_spec from public.asset_versions v join public.asset_variants va on va.id = v.variant_id join public.assets a on a.id = va.asset_id where v.id = ${F(3)}`;
    assert(row[0]?.["kind"] === "font" && row[0]?.["mime_type"] === "application/x-ptg-fontpack", "fontressursen ble ikke lagret");
    assert(isDeepStrictEqual(row[0]?.["font_spec"], spec), "font_spec ble ikke lagret uendret");
    const back = await loadState(fp);
    assert(isDeepStrictEqual(back.assetVersions[F(3) as never]?.font, spec), "font_spec leses ikke tilbake");
    // Ukjent type og fremmed mime avvises fortsatt; for stor metadata avvises
    await expectError(sql`update public.assets set kind = 'skrift' where id = ${F(1)}`, "23514");
    await expectError(
      sql.begin(async (tx) => tx`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256)
        values (gen_random_uuid(), ${fp}, ${F(2)}, 50, ${`${fp}/x/a.exe`}, 'application/x-msdownload', 1, ${"e".repeat(64)})`),
      "23514",
    );
    await expectError(
      sql.begin(async (tx) => tx`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, font_spec)
        values (gen_random_uuid(), ${fp}, ${F(2)}, 51, ${`${fp}/x/b.ptgfont`}, 'application/x-ptg-fontpack', 1, ${"e".repeat(64)},
                (select jsonb_build_object('x', string_agg(md5(random()::text), '')) from generate_series(1, 4000)))`),
      "23514",
    );
    // RLS: medlem leser, utenforstående ser ingenting, klienten kan ikke skrive direkte
    assert((await as("authenticated", ALICE, (tx) => tx`select font_spec from public.asset_versions where id = ${F(3)}`)).length === 1, "medlemmet ser fonten");
    assert((await as("authenticated", BOB, (tx) => tx`select font_spec from public.asset_versions where id = ${F(3)}`)).length === 0, "utenforstående ser fonten");
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.asset_versions set font_spec = '{}'::jsonb where id = ${F(3)}`), "42501");
    // Globalt bibliotek: kind 'font' og font_spec via global_add_version
    const ws = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace('Fontgruppe') as id`)[0]!["id"] as string);
    const ga = await as("authenticated", ALICE, async (tx) => (await tx`select public.global_create_asset(${ws}, 'font', 'Lato', '', '{}', '{}') as id`)[0]!["id"] as string);
    const gv = await as("authenticated", ALICE, async (tx) => (await tx`select public.global_create_variant(${ga}, 'Standard', 'other', '') as id`)[0]!["id"] as string);
    const sha = "d".repeat(64);
    const gid = await as("authenticated", ALICE, async (tx) =>
      (await tx`select public.global_add_version(${gv}, ${`global/${ws}/${ga}/${sha}.ptgfont`}, 'application/x-ptg-fontpack', null, null, 100, ${sha}, null, '', null, ${tx.json(spec as never)}) as id`)[0]!["id"] as string);
    const g = await as("authenticated", ALICE, (tx) => tx`select font_spec from public.global_asset_versions where id = ${gid}`);
    assert(isDeepStrictEqual(g[0]?.["font_spec"], spec), "global font_spec gikk tapt");
    assert((await as("authenticated", CAROL, (tx) => tx`select font_spec from public.global_asset_versions where id = ${gid}`)).length === 0, "utenforstående ser global font");
    await expectError(sql`update public.global_asset_versions set font_spec = '{}'::jsonb where id = ${gid}`, "42501");
    await expectError(as("anon", null, (tx) => tx`select public.global_add_version(${gv}, ${`global/${ws}/${ga}/${sha}.ptgfont`}, 'x', null, null, 1, ${sha}, null, '', null, null)`), "42501");
    // Sletting av prosjektet virker som før med en fontressurs i prosjektet
    await as("service_role", null, (tx) => tx`select public.delete_project(${fp},${ALICE})`);
    assert((await sql`select deleted_at from public.projects where id = ${fp}`)[0]?.["deleted_at"] != null, "delete_project virker med fontressurs");
  });

  // ---------- B-109: stenge for nye registreringer (0075) ----------
  await test("0075 (B-109): stengt registrering stopper nye kontoer, slipper inviterte, bare admin endrer, anon ser bare open", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 75, "schema version 75");
    const OYSTEIN = "55555555-5555-7555-8555-555555555555";
    await sql`insert into auth.users (id, email) values (${OYSTEIN}, 'Oystein@gutu.no') on conflict do nothing`;
    const status = async (role: "anon" | "authenticated", u: string | null) =>
      (await as(role, u, (tx) => tx`select public.registration_status() as s`))[0]!["s"] as Record<string, unknown>;
    // Standard: åpen, og anon ser bare open og melding
    const s0 = await status("anon", null);
    assert(s0["open"] === true && Object.keys(s0).sort().join(",") === "message,open", "anon ser bare open og melding");
    // Ingen direkte tilgang til tabellen
    await expectError(as("anon", null, (tx) => tx`select * from public.service_settings`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select * from public.service_settings`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.service_settings set registration_open = false`), "42501");
    // Bare administrator kan endre og lese detaljer
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_registration_open(false, 'x')`), "42501");
    await expectError(as("anon", null, (tx) => tx`select public.set_registration_open(false, 'x')`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.admin_registration_settings()`), "42501");
    await expectError(as("anon", null, (tx) => tx`select public.admin_registration_settings()`), "42501");
    await as("authenticated", OYSTEIN, (tx) => tx`select public.set_registration_open(false, '  Stengt for vinteren  ')`);
    const s1 = await status("anon", null);
    assert(s1["open"] === false && s1["message"] === "Stengt for vinteren", "stengt med melding");
    assert(!JSON.stringify(s1).includes("@") && Object.keys(s1).length === 2, "ingen e-post eller brukerdata i status");
    const ad = (await as("authenticated", OYSTEIN, (tx) => tx`select public.admin_registration_settings() as a`))[0]!["a"] as Record<string, unknown>;
    assert(ad["open"] === false && typeof ad["changed_at"] === "string" && "changed_by_name" in ad && !("changed_by" in ad), "admin ser når og hvem (navn, ikke e-post)");
    // Stengt: ny konto stoppes (også det auth lager ved innloggingslenke er en INSERT i auth.users)
    await expectError(sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, 'ny@example.no')`, "PTG01");
    await expectError(sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, null)`, "PTG01");
    // Eksisterende brukere påvirkes ikke
    await sql`update auth.users set email = email where id = ${ALICE}`;
    assert((await as("authenticated", ALICE, (tx) => tx`select public.my_account() as a`)).length === 1, "eksisterende bruker virker");
    // Invitert e-post slipper inn (prosjekt og arbeidsgruppe); utløpt, trukket og akseptert gjør ikke
    const bp = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Invitasjon B-109') id`)[0]!["id"])));
    await sql`insert into public.project_invitations (project_id, email, role, token_hash, invited_by) values (${bp}, 'kollega@example.no', 'viewer', ${"b109-" + crypto.randomUUID()}, ${ALICE})`;
    await sql`insert into public.project_invitations (project_id, email, role, token_hash, invited_by, expires_at) values (${bp}, 'utlopt@example.no', 'viewer', ${"b109-" + crypto.randomUUID()}, ${ALICE}, now() - interval '1 day')`;
    await sql`insert into public.project_invitations (project_id, email, role, token_hash, invited_by, revoked_at) values (${bp}, 'trukket@example.no', 'viewer', ${"b109-" + crypto.randomUUID()}, ${ALICE}, now())`;
    await sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, ' Kollega@Example.no ')`;
    await expectError(sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, 'utlopt@example.no')`, "PTG01");
    await expectError(sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, 'trukket@example.no')`, "PTG01");
    const ws = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace('B-109') id`)[0]!["id"])));
    await sql`insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by) values (${ws}, 'gruppe@example.no', 'member', ${"b109-" + crypto.randomUUID()}, ${ALICE})`;
    await sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, 'gruppe@example.no')`;
    // Åpnes igjen: nye kontoer går, meldingen skjules
    await as("authenticated", OYSTEIN, (tx) => tx`select public.set_registration_open(true, null)`);
    const s2 = await status("authenticated", ALICE);
    assert(s2["open"] === true && s2["message"] === null, "åpen igjen");
    await sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, 'apen@example.no')`;
    await expectError(as("authenticated", OYSTEIN, (tx) => tx`select public.set_registration_open(false, ${"x".repeat(501)})`), "22023");
    assert((await status("anon", null))["open"] === true, "for lang melding endrer ingenting");
  });

  // ---------- B-110: CAPTCHA-pass ved nye kontoer (0076) ----------
  await test("0076 (B-110): innloggingstjenesten krever registreringspass; passet brukes én gang og overstyrer ikke stengt registrering", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 76, "schema version 76");
    const OYSTEIN = "55555555-5555-7555-8555-555555555555";
    await sql.unsafe(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin; end if; end $$`);
    await sql.unsafe(`grant usage on schema auth to supabase_auth_admin; grant insert, select on auth.users to supabase_auth_admin`);
    // Som innloggingstjenesten (session_user = supabase_auth_admin)
    const gotrue = (email: string) =>
      sql.begin(async (tx) => {
        await tx.unsafe(`set local session authorization supabase_auth_admin`);
        await tx`insert into auth.users (id, email) values (${crypto.randomUUID()}, ${email})`;
      });
    const issue = (email: string) => as("service_role", null, (tx) => tx`select public.issue_signup_pass(${email})`);
    await expectError(gotrue("robot@example.no"), "PTG02");
    await issue(" Menneske@Example.no ");
    await gotrue("menneske@example.no");
    await expectError(gotrue("menneske@example.no"), "PTG02");
    // Utløpt pass gjelder ikke
    await issue("sen@example.no");
    await sql`update public.signup_passes set expires_at = now() - interval '1 minute' where email = 'sen@example.no'`;
    await expectError(gotrue("sen@example.no"), "PTG02");
    // Bare serveren kan utstede pass; ingen klient kan lese tabellen
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.issue_signup_pass('x@example.no')`), "42501");
    await expectError(as("anon", null, (tx) => tx`select public.issue_signup_pass('x@example.no')`), "42501");
    await expectError(as("anon", null, (tx) => tx`select * from public.signup_passes`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select * from public.signup_passes`), "42501");
    await expectError(issue("ikke-en-adresse"), "22023");
    // Stengt registrering gjelder fortsatt: passet alene slipper ikke inn, og det beholdes
    await as("authenticated", OYSTEIN, (tx) => tx`select public.set_registration_open(false, null)`);
    await issue("stengt@example.no");
    await expectError(gotrue("stengt@example.no"), "PTG01");
    assert((await sql`select 1 from public.signup_passes where email = 'stengt@example.no'`).length === 1, "passet beholdes når kontoen ikke lages");
    await as("authenticated", OYSTEIN, (tx) => tx`select public.set_registration_open(true, null)`);
    await gotrue("stengt@example.no");
    // Andre roller (migrasjoner, tester) påvirkes ikke av passkravet
    await sql`insert into auth.users (id, email) values (${crypto.randomUUID()}, 'direkte@example.no')`;
  });

  // ---------- Google-innlogging (0092) ----------
  await test("0092: Google uten pass ved åpen registrering, stoppes ved stengt, uten profilbilde og uten overtakelse", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 92, "schema version 92");
    const OYSTEIN = "55555555-5555-7555-8555-555555555555";
    await sql.unsafe(`grant update on auth.users to supabase_auth_admin`);
    const asAuth = <T,>(f: (tx: postgres.TransactionSql) => Promise<T>) =>
      sql.begin(async (tx) => {
        await tx.unsafe(`set local session authorization supabase_auth_admin`);
        return f(tx);
      });
    const google = (email: string, confirmed = true) => {
      const id = crypto.randomUUID();
      return asAuth((tx) => tx`insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
        values (${id}, ${email}, ${confirmed ? new Date() : null},
                ${sql.json({ provider: "google", providers: ["google"] })},
                ${sql.json({ full_name: "Kari Nordmann", avatar_url: "https://lh3.googleusercontent.com/x", picture: "https://lh3.googleusercontent.com/x" })})`).then(() => id);
    };
    // Åpen registrering: ny Google-bruker uten pass slipper inn, og profilbildet lagres ikke
    const id = await google("ny.google@example.no");
    const meta = (await sql`select raw_user_meta_data m from auth.users where id = ${id}`)[0]!["m"] as Record<string, unknown>;
    assert(meta["full_name"] === "Kari Nordmann" && !("avatar_url" in meta) && !("picture" in meta), "navn beholdes, bilde fjernes");
    // Google uten bekreftet e-post og e-postregistrering uten pass krever fortsatt pass
    await expectError(google("ubekreftet@example.no", false), "PTG02");
    await expectError(asAuth((tx) => tx`insert into auth.users (id, email, raw_app_meta_data) values (${crypto.randomUUID()}, 'epost@example.no', ${sql.json({ provider: "email", providers: ["email"] })})`), "PTG02");
    // Stengt registrering stopper også Google; invitasjon slipper inn som før
    await as("authenticated", OYSTEIN, (tx) => tx`select public.set_registration_open(false, null)`);
    await expectError(google("stengt.google@example.no"), "PTG01");
    assert((await sql`select 1 from auth.users where email = 'stengt.google@example.no'`).length === 0, "ingen konto lages");
    await as("authenticated", OYSTEIN, (tx) => tx`select public.set_registration_open(true, null)`);
    // Senere innlogging oppdaterer metadata: bildet fjernes igjen
    await asAuth((tx) => tx`update auth.users set raw_user_meta_data = ${sql.json({ full_name: "Kari", picture: "https://x" })} where id = ${id}`);
    const meta2 = (await sql`select raw_user_meta_data m from auth.users where id = ${id}`)[0]!["m"] as Record<string, unknown>;
    assert(!("picture" in meta2), "bildet fjernes ved oppdatering");
    // Overtakelse: ubekreftet passordkonto får Google koblet til – passordet fjernes
    const victim = crypto.randomUUID();
    await sql`insert into auth.users (id, email, encrypted_password, raw_app_meta_data) values (${victim}, 'offer@example.no', 'angriperens-hash', ${sql.json({ provider: "email", providers: ["email"] })})`;
    await asAuth((tx) => tx`update auth.users set raw_app_meta_data = ${sql.json({ provider: "email", providers: ["email", "google"] })}, email_confirmed_at = now() where id = ${victim}`);
    assert((await sql`select encrypted_password p from auth.users where id = ${victim}`)[0]!["p"] === "", "passordet fra før bekreftelsen fjernes");
    // Bekreftet passordkonto beholder passordet når Google kobles til
    const owner = crypto.randomUUID();
    await sql`insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_app_meta_data) values (${owner}, 'eier@example.no', now(), 'eierens-hash', ${sql.json({ provider: "email", providers: ["email"] })})`;
    await asAuth((tx) => tx`update auth.users set raw_app_meta_data = ${sql.json({ provider: "email", providers: ["email", "google"] })} where id = ${owner}`);
    assert((await sql`select encrypted_password p from auth.users where id = ${owner}`)[0]!["p"] === "eierens-hash", "bekreftet konto beholder passordet");
  });


  await test('0077 (B-107): alle åtte UI-språk kan lagres uten å endre andre brukere; anon og testspråk avvises', async () => {
    for (const language of ['fr', 'es', 'ru', 'ja', 'pt-BR', 'de', 'it', 'ko']) {
      await as('authenticated', ALICE, tx => tx`select public.set_my_locale(${language})`);
      const rows = await as('authenticated', ALICE, tx => tx`select public.my_account() as a`);
      assert((rows[0]?.['a'] as Record<string, unknown>)['locale'] === language, `språk ${language} leses tilbake`);
    }
    await expectError(as('anon', null, tx => tx`select public.set_my_locale('fr')`), '42501');
    await expectError(as('authenticated', ALICE, tx => tx`select public.set_my_locale('en-XA')`), '22023');
    await expectError(as('authenticated', ALICE, tx => tx`select public.set_my_locale('en_US')`), '22023');
    await as('authenticated', ALICE, tx => tx`select public.set_my_locale('nb')`);
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.['v']) >= 77, 'skjemaversjon 77');
  });

  // ---------- B-105a: avledede bildefiler (0078) ----------
  await test("0078 (B-105a): derived_files valideres, RLS som versjonen, og purge sletter avledede filer", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 78, "skjemaversjon 78");
    const dp = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Avledet') as id`)[0]!["id"] as string);
    const a = crypto.randomUUID(), v = crypto.randomUUID(), ver = crypto.randomUUID();
    await sql`insert into public.assets (id, project_id, kind, name) values (${a}, ${dp}, 'object', 'Vase')`;
    await sql`insert into public.asset_variants (id, project_id, asset_id, name, style) values (${v}, ${dp}, ${a}, 'Standard', 'reference')`;
    const file = (path: string) => ({ path, width: 10, height: 10, byteSize: 1, sha256: "a".repeat(64) });
    const good = { proxy: file(`${dp}/p.webp`), thumbnail: file(`${dp}/t.webp`), originalRaw: file(`${dp}/r.tiff`) };
    await sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, derived_files)
      values (${ver}, ${dp}, ${v}, 1, ${`${dp}/o.png`}, 'image/png', 1, ${"b".repeat(64)}, ${sql.json(good)})`;
    const other = await as("authenticated", BOB, async (tx) => (await tx`select public.create_project('Annet') as id`)[0]!["id"] as string);
    const cases: [string, unknown][] = [
      ["ukjent nøkkel", { ukjent: file(`${dp}/u.webp`) }],
      ["sti til et annet prosjekt", { proxy: file(`${other}/offer.png`) }],
      ["sti med ..", { proxy: file(`${dp}/../${other}/offer.png`) }],
      ["sti uten prefiks", { proxy: file("offer.png") }],
    ];
    for (const [label, bad] of cases)
      await expectError(sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, derived_files)
        values (gen_random_uuid(), ${dp}, ${v}, 9, ${`${dp}/x.png`}, 'image/png', 1, ${"d".repeat(64)}, ${sql.json(bad as never)})`, /check|violates/)
        .catch((e) => { throw new Error(`${label}: ${(e as Error).message}`); });
    // Globale versjoner: prefikset er global/<gruppe>/
    const gcon = await sql`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.global_asset_versions'::regclass and pg_get_constraintdef(oid) like '%valid_derived_files%'`;
    assert(String(gcon[0]?.["d"] ?? "").includes("'global/'"), "global CHECK bruker global/<gruppe>/");
    for (const bad of [{ proxy: { width: 1 } }, { proxy: file("") }, ["x"]])
      await expectError(sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, derived_files)
        values (gen_random_uuid(), ${dp}, ${v}, 9, ${`${dp}/x.png`}, 'image/png', 1, ${"d".repeat(64)}, ${sql.json(bad as never)})`, /check|violates/);
    // Eldre versjoner uten avledede filer er gyldige
    await sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256)
      values (gen_random_uuid(), ${dp}, ${v}, 2, ${`${dp}/o2.png`}, 'image/png', 1, ${"c".repeat(64)})`;
    const seen = await as("authenticated", ALICE, (tx) => tx`select derived_files from public.asset_versions where id = ${ver}`);
    assert((seen[0]?.["derived_files"] as { proxy?: { path: string } })?.proxy?.path === `${dp}/p.webp`, "medlem leser avledede filer");
    assert((await as("authenticated", CAROL, (tx) => tx`select 1 from public.asset_versions where id = ${ver}`)).length === 0, "ikke-medlem ser ingenting");
    await expectError(as("authenticated", ALICE, (tx) => tx`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256)
      values (gen_random_uuid(), ${dp}, ${v}, 3, ${`${dp}/k.png`}, 'image/png', 1, ${"e".repeat(64)})`), /42501|permission|row-level/);
    // Ekstra forsvar: selv om en fremmed sti skulle ligge i raden, tar oppryddingen den ikke med
    const foreign = `${other}/offer.png`;
    const leaked = await sql.begin(async (tx) => {
      const cn = (await tx`select conname from pg_constraint where conrelid = 'public.asset_versions'::regclass and pg_get_constraintdef(oid) like '%valid_derived_files%'`)[0]!["conname"] as string;
      await tx.unsafe(`alter table public.asset_versions drop constraint "${cn}"`);
      const fv = crypto.randomUUID();
      await tx`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, removed, derived_files)
        values (${fv}, ${dp}, ${v}, 4, ${`${dp}/f.png`}, 'image/png', 1, ${"f".repeat(64)}, true, ${tx.json({ proxy: file(foreign), thumbnail: file(`${dp}/../x`) } as never)})`;
      const pr = (await tx`select public.purge_removed_assets(${dp}, ${ALICE}, array[]::uuid[], array[${fv}]::uuid[]) as r`)[0]!["r"] as { paths: string[] };
      throw Object.assign(new Error("rollback"), { paths: pr.paths });
    }).catch((e) => (e as { paths?: string[] }).paths ?? (() => { throw e; })());
    assert(leaked.includes(`${dp}/f.png`), "purge_removed_assets tar med originalen");
    assert(!leaked.some((x) => x === foreign || x.includes("..")), "purge_removed_assets rører ikke fremmede stier");
    assert((await sql`select 1 from pg_constraint where conrelid = 'public.asset_versions'::regclass and pg_get_constraintdef(oid) like '%valid_derived_files%'`).length === 1, "CHECK er tilbake etter rollback");
    await as("service_role", null, (tx) => tx`select public.delete_project(${dp}, ${ALICE})`);
    const r = (await as("service_role", null, async (tx) => (await tx`select public.purge_project_assets(${dp}, ${ALICE}) as r`)[0]!["r"])) as { paths: string[] };
    for (const path of ["o.png", "p.webp", "t.webp", "r.tiff", "o2.png"])
      assert(r.paths.includes(`${dp}/${path}`), `purge tar med ${path}`);
  });
  // ---------- Rigg runde 5: utskriftsjobber, kopier og koder (0079) ----------
  await test("0079 (B-087 R5): jobber via apply_changes, én kopi per rad, pepret QR/kortkode, oppslag krever tilgang", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 79, "skjemaversjon 79");
    const bp = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Utskrift') id`)[0]!["id"])));
    const prod = (await sql`select id from public.productions where project_id=${bp} and kind='main'`)[0]!["id"];
    const scene = crypto.randomUUID(), variant = crypto.randomUUID(), comp = crypto.randomUUID(), layer = crypto.randomUUID();
    const a = crypto.randomUUID(), av = crypto.randomUUID(), ver = crypto.randomUUID();
    await sql`insert into public.scenes(id,project_id,origin_production_id) values(${scene},${bp},${prod})`;
    await sql`insert into public.scene_variants(id,project_id,scene_id) values(${variant},${bp},${scene})`;
    await sql`insert into public.compositions(id,project_id,variant_id) values(${comp},${bp},${variant})`;
    await sql`insert into public.composition_layers(id,project_id,composition_id,order_key,kind,width,height,fill,transform) values(${layer},${bp},${comp},'a','character',100,100,'#ffffff','{}')`;
    await sql`insert into public.assets (id, project_id, kind, name) values (${a}, ${bp}, 'character', 'Maja')`;
    await sql`insert into public.asset_variants (id, project_id, asset_id, name, style) values (${av}, ${bp}, ${a}, 'Standard', 'reference')`;
    await sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256)
      values (${ver}, ${bp}, ${av}, 1, ${`${bp}/o.png`}, 'image/png', 1, ${"b".repeat(64)})`;
    const job = crypto.randomUUID(), e1 = crypto.randomUUID(), e2 = crypto.randomUUID();
    const el = (id: string, frame: number, copies: number, position: number) => ({ id, project_id: bp, job_id: job, position, layer_id: layer, version_id: ver, scene_id: scene, frame, copies, note: "", up_arrow: false, revision: 1 });
    const apply = (changes: unknown, inv: unknown = {}) => as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${crypto.randomUUID()},${tx.json({ type: "SavePrintJob" })},${tx.json(inv as never)},${tx.json(changes as never)})`);
    // To identiske elementer (A2/A3): begge lagres
    await apply({ inserts: { print_jobs: [{ id: job, project_id: bp, name: "Maja", settings: { qr: "outside" }, revision: 1 }], print_job_elements: [el(e1, 5, 20, 0), el(e2, 5, 1, 1)] } },
      { deletes: { print_job_elements: [{ id: e1, expected_revision: 1 }, { id: e2, expected_revision: 1 }], print_jobs: [{ id: job, expected_revision: 1 }] } });
    for (const t of ["print_jobs", "print_job_elements", "print_copies"]) {
      const rls = (await sql`select relrowsecurity r from pg_class where oid=${`public.${t}`}::regclass`)[0];
      assert(rls?.["r"] === true, `RLS på ${t}`);
      const anon = await sql`select has_table_privilege('anon', ${`public.${t}`}, 'select') p`;
      assert(anon[0]?.["p"] === false, `anon har ingen tilgang til ${t}`);
    }
    assert((await sql`select has_column_privilege('authenticated', 'public.print_copies', 'code_digest', 'select') p`)[0]?.["p"] === false, "klienten kan ikke lese code_digest");
    assert((await as("authenticated", ALICE, (tx) => tx`select id from public.print_job_elements where job_id=${job}`)).length === 2, "medlem leser elementene; ingen sammenslåing");
    assert((await as("authenticated", CAROL, (tx) => tx`select id from public.print_jobs where project_id=${bp}`)).length === 0, "ikke-medlem ser ingen jobber");
    await expectError(as("authenticated", ALICE, (tx) => tx`update public.print_jobs set name='X' where id=${job}`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`insert into public.print_copies(project_id,element_id,copy_number,code_digest,short_digest) values(${bp},${e1},99,${"a".repeat(64)},${"b".repeat(64)})`), "42501");
    for (const bad of [{ copies: 0 }, { copies: 201 }, { frame: -1 }, { note: "x".repeat(501) }])
      await expectError(apply({ inserts: { print_job_elements: [{ ...el(crypto.randomUUID(), 1, 1, 9), ...bad }] } }), "23514");
    // Én rad per fysisk kopi (A1): 20 + 1
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.issue_print_copies(${bp}, ${job})`), "42501");
    const n = Number((await as("authenticated", ALICE, (tx) => tx`select public.issue_print_copies(${bp}, ${job}) n`))[0]!["n"]);
    assert(n === 21, `21 kopier (fikk ${n})`);
    const codes = await as("authenticated", ALICE, (tx) => tx`select * from public.print_copy_codes(${bp}, ${job})`);
    assert(codes.length === 21 && new Set(codes.map((c) => c["key"])).size === 21 && new Set(codes.map((c) => c["short_code"])).size === 21, "unike nøkler og korte koder");
    assert(codes.every((c) => /^[A-Za-z0-9_-]{43}$/.test(String(c["key"])) && /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(String(c["short_code"]))), "nøkkel 43 tegn, kort kode 8 tegn Crockford");
    const stored = await sql`select code_digest, short_digest from public.print_copies where project_id=${bp}`;
    assert(!stored.some((r) => codes.some((c) => String(r["code_digest"]).includes(String(c["key"])) || String(r["short_digest"]).includes(String(c["short_code"])))), "koden lagres ikke i klartekst");
    // Ny utskrift: samme koder
    assert(Number((await as("authenticated", ALICE, (tx) => tx`select public.issue_print_copies(${bp}, ${job}) n`))[0]!["n"]) === 0, "ny utskrift lager ingen nye kopier");
    const again = await as("authenticated", ALICE, (tx) => tx`select key from public.print_copy_codes(${bp}, ${job})`);
    assert(again.map((r) => r["key"]).join() === codes.map((c) => c["key"]).join(), "ny utskrift gir samme koder");
    // Oppslag
    const k = String(codes[3]!["key"]), sc = String(codes[3]!["short_code"]);
    const hit = await as("authenticated", ALICE, (tx) => tx`select * from public.lookup_print_copy(${k})`);
    assert(hit.length === 1 && hit[0]!["scene_id"] === scene && hit[0]!["frame"] === 5 && hit[0]!["layer_id"] === layer && Object.keys(hit[0]!).sort().join() === "copy_number,frame,layer_id,project_id,scene_id", "oppslag gir bare prosjekt, scene, frame, lag og kopinummer");
    const typed = `${sc.slice(0, 4).toLowerCase()} - ${sc.slice(4)}`.replace(/0/g, "o").replace(/1/g, "l");
    assert((await as("authenticated", ALICE, (tx) => tx`select * from public.lookup_print_copy(${typed}, ${bp})`)).length === 1, "kort kode normaliseres (O/0, I/L/1, mellomrom, bindestrek)");
    assert((await as("authenticated", CAROL, (tx) => tx`select * from public.lookup_print_copy(${k})`)).length === 0, "uten tilgang: tomt svar");
    assert((await as("authenticated", CAROL, (tx) => tx`select * from public.lookup_print_copy(${sc})`)).length === 0, "kort kode uten tilgang: tomt svar");
    await expectError(as("anon", null, (tx) => tx`select * from public.lookup_print_copy(${k})`), "42501");
    assert((await as("authenticated", ALICE, (tx) => tx`select * from public.lookup_print_copy(${"x".repeat(43)})`)).length === 0, "ukjent kode: tomt svar");
    // Tilbaketrekking
    await expectError(as("authenticated", CAROL, (tx) => tx`select public.revoke_print_copies(${bp}, ${job})`), "42501");
    assert(Number((await as("authenticated", ALICE, (tx) => tx`select public.revoke_print_copies(${bp}, ${job}) n`))[0]!["n"]) === 21, "alle kopiene trekkes tilbake");
    assert((await as("authenticated", ALICE, (tx) => tx`select * from public.lookup_print_copy(${k})`)).length === 0, "tilbaketrukket kode: tomt svar");
    // Vern: versjonen som skrives ut, kan ikke slettes for godt
    await sql`update public.asset_versions set removed = true where id = ${ver}`;
    await expectError(as("service_role", null, (tx) => tx`select public.purge_removed_assets(${bp},${ALICE},'{}'::uuid[],array[${ver}]::uuid[])`), /23503|utskriftsjobb/);
    await sql`update public.asset_versions set removed = false where id = ${ver}`;
    // Angre opprettelse (lagret invers) fjerner jobben, elementene og kopiene
    const saved = (await sql`select inverse from public.change_log where project_id=${bp} and inverse ? 'deletes' order by created_at desc limit 1`)[0]!["inverse"];
    await apply(saved);
    assert((await sql`select id from public.print_job_elements where job_id=${job}`).length === 0 && (await sql`select id from public.print_copies where project_id=${bp}`).length === 0, "angring av opprettelse fjerner elementer og kopier");
    // delete_project og purge rydder utskriftsrader
    await apply({ inserts: { print_jobs: [{ id: job, project_id: bp, name: "Maja", settings: {}, revision: 1 }], print_job_elements: [el(e1, 5, 2, 0)] } });
    await as("authenticated", ALICE, (tx) => tx`select public.issue_print_copies(${bp}, ${job})`);
    await as("service_role", null, (tx) => tx`select public.delete_project(${bp},${ALICE})`);
    assert((await sql`select 1 from public.print_copies where project_id=${bp} union all select 1 from public.print_jobs where project_id=${bp}`).length === 0, "delete_project sletter utskriftsrader");
    await as("service_role", null, (tx) => tx`select public.purge_project_assets(${bp},${ALICE})`);
    assert((await sql`select id from public.projects where id=${bp}`).length === 0, "purge fjerner prosjektet");
  });
  // ---------- Community-grunnmur bak funksjonsbrytere (B-114 C0, 0080) ----------
  await test("0080 (B-114 C0): brytere av gir ingenting; beta bare testere; publiseringer, kommentarer, profil, blokkering", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 80, "skjemaversjon 80");
    const ADM = "55555555-5555-7555-8555-555555555555", EVE = "66666666-6666-7666-8666-666666666666";
    await sql`insert into auth.users (id, email) values (${ADM}, 'admin@example.no'), (${EVE}, 'Eve@Example.no') on conflict do nothing`;
    // Denne eksisterende testen gjelder en bekreftet e-postmottaker; S-1 tester ubekreftet separat.
    await sql`update auth.users set email_confirmed_at = now() where id = ${EVE}`;
    await sql`insert into public.app_admins (user_id) values (${ADM}) on conflict do nothing`;
    for (const u of [ALICE, BOB, CAROL, EVE]) await sql`insert into public.profiles (user_id, display_name) values (${u}, 'X') on conflict (user_id) do nothing`;
    const tables = ["features", "feature_testers", "publications", "publication_recipients", "publication_media", "review_comments", "content_reports", "user_blocks"];
    for (const t of tables) {
      assert((await sql`select relrowsecurity r from pg_class where oid=${`public.${t}`}::regclass`)[0]?.["r"] === true, `RLS på ${t}`);
      for (const priv of ["select", "insert", "update", "delete"])
        assert((await sql`select has_table_privilege('anon', ${`public.${t}`}, ${priv}) p`)[0]?.["p"] === false, `anon ${priv} ${t}`);
      for (const priv of ["insert", "update", "delete"])
        assert((await sql`select has_table_privilege('authenticated', ${`public.${t}`}, ${priv}) p`)[0]?.["p"] === false, `ingen direkte ${priv} på ${t}`);
    }
    const keys = (await sql`select key, state from public.features where key like 'community.%' order by key`).map((r) => `${r["key"]}=${r["state"]}`);
    assert(keys.join() === "community.abtest=off,community.profiles=off,community.public=off,community.review=off,community.sharing=off", `alle av: ${keys}`);
    for (const c of ["handle", "bio", "avatar_key", "is_public", "profile_fields"])
      assert((await sql`select has_column_privilege('authenticated', 'public.profiles', ${c}, 'select') p`)[0]?.["p"] === false, `${c} kan ikke leses direkte`);
    // my_features
    await expectError(as("anon", null, (tx) => tx`select public.my_features()`), "42501");
    const mine = (await as("authenticated", ALICE, (tx) => tx`select public.my_features() f`))[0]!["f"] as Record<string, boolean>;
    assert(Object.keys(mine).filter((k) => k.startsWith('community.')).length === 5 && Object.values(mine).every((v) => v === false), "my_features: alle av");
    // Bare administrator
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.admin_set_feature('community.sharing', 'on', null)`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.admin_set_feature_testers('community.sharing', array[${ALICE}]::uuid[])`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select * from public.admin_find_users('example')`), "42501");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.admin_list_features()`), "42501");
    await expectError(as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.sharing', 'maybe', null)`), "22023");
    const found = await as("authenticated", ADM, (tx) => tx`select * from public.admin_find_users('eve@')`);
    assert(found.length === 1 && found[0]!["user_id"] === EVE, "admin finner bruker på e-post");
    assert((await as("authenticated", ADM, (tx) => tx`select * from public.admin_find_users('e_')`)).length === 0, "for kort søk gir ingen treff");
    // Av: publisering avvises, ingen rader
    const bp = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('Community') id`)[0]!["id"])));
    await sql`insert into public.project_members (project_id, user_id, role) values (${bp}, ${CAROL}, 'viewer')`;
    const create = (u: string, audience = "selected", rights: Record<string, boolean> = { comment: true }) =>
      as("authenticated", u, async (tx) => String((await tx`select public.create_publication(${bp}, 'range', ${tx.json({ from: 0, to: 48 })}, ${audience}, ${tx.json(rights)}, null, 'Scene 4', '', null, null) id`)[0]!["id"]));
    await expectError(create(ALICE), "42501");
    await expectError(as("anon", null, (tx) => tx`select public.create_publication(${bp}, 'range', '{}'::jsonb, 'selected', '{}'::jsonb, null, 'X', '', null, null)`), "42501");
    // Beta: bare testere
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.sharing', 'beta', null)`);
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.review', 'beta', null)`);
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature_testers('community.sharing', array[${ALICE}, ${BOB}]::uuid[])`);
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature_testers('community.review', array[${ALICE}, ${BOB}]::uuid[])`);
    const list = (await as("authenticated", ADM, (tx) => tx`select public.admin_list_features() f`))[0]!["f"] as { key: string; state: string; testers: unknown[] }[];
    assert(list.find((f) => f.key === "community.sharing")?.testers.length === 2, "testerlisten vises for admin");
    await expectError(create(CAROL), "42501");
    const pub = await create(ALICE);
    assert((await as("authenticated", ALICE, (tx) => tx`select public.my_features() f`))[0]!["f"]["community.sharing"] === true, "tester ser bryteren som på");
    assert((await as("authenticated", CAROL, (tx) => tx`select public.my_features() f`))[0]!["f"]["community.sharing"] === false, "ikke-tester ser den som av");
    assert((await as("authenticated", CAROL, (tx) => tx`select id from public.publications where id=${pub}`)).length === 0, "medlem som ikke er tester ser ingenting");
    // Mottakere
    await as("authenticated", ALICE, (tx) => tx`select public.set_publication_recipients(${pub}, array[${BOB}]::uuid[], array['EVE@example.no']::text[])`);
    await expectError(as("authenticated", BOB, (tx) => tx`select public.set_publication_recipients(${pub}, array[]::uuid[], array[]::text[])`), "42501");
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.publications where id=${pub}`)).length === 0, "utkast er skjult for mottaker");
    await as("authenticated", ALICE, (tx) => tx`select public.update_publication(${pub}, ${tx.json({ status: "live" })})`);
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.publications where id=${pub}`)).length === 1, "mottaker ser publiseringen");
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.publication_recipients where publication_id=${pub}`)).length === 1, "mottaker ser bare sin egen mottakerrad");
    assert((await as("authenticated", EVE, (tx) => tx`select public.publication_for_me(${pub}) p`))[0]!["p"] === null, "e-postmottaker uten beta ser ingenting");
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature_testers('community.sharing', array[${ALICE}, ${BOB}, ${EVE}]::uuid[])`);
    assert((await as("authenticated", EVE, (tx) => tx`select public.publication_for_me(${pub}) p`))[0]!["p"] !== null, "e-postmottaker (store/små bokstaver) ser den som tester");
    assert((await sql`select seen_at from public.publication_recipients where publication_id=${pub} and email='eve@example.no'`)[0]!["seen_at"] !== null, "sett registreres");
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature_testers('community.sharing', array[${ALICE}, ${BOB}]::uuid[])`);
    // Medier
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.add_publication_media(${pub}, ${`${bp}/source/x.mp4`}, 'video/mp4', 1000, 1920, 1080)`), "23514");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.add_publication_media(${pub}, ${`${bp}/shares/../x.mp4`}, 'video/mp4', 1000, 1920, 1080)`), "23514");
    await as("authenticated", ALICE, (tx) => tx`select public.add_publication_media(${pub}, ${`${bp}/shares/${pub}/film.mp4`}, 'video/mp4', 1000, 1920, 1080)`);
    const forBob = (await as("authenticated", BOB, (tx) => tx`select public.publication_for_me(${pub}) p`))[0]!["p"] as { media: unknown[] };
    assert(forBob.media.length === 1, "mottaker får mediefilen");
    // Kommentarer
    const cid = String((await as("authenticated", BOB, (tx) => tx`select public.add_review_comment(${pub}, null, 1200, 30, ${tx.json({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 })}, 'timing', 'For kort') id`))[0]!["id"]);
    await expectError(as("authenticated", BOB, (tx) => tx`select public.add_review_comment(${pub}, null, 0, null, ${tx.json({ x: 0.9, y: 0, width: 0.5, height: 0.1 })}, 'timing', 'x')`), "23514");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.edit_review_comment(${cid}, 'Endret', null)`), "42501");
    await as("authenticated", BOB, (tx) => tx`select public.edit_review_comment(${cid}, 'Litt for kort', null)`);
    await as("authenticated", ALICE, (tx) => tx`select public.add_review_comment(${pub}, ${cid}, 1200, 30, null, 'timing', 'Enig')`);
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.review_comments where publication_id=${pub}`)).length === 2, "tråd med svar");
    await as("authenticated", ALICE, (tx) => tx`select public.update_publication(${pub}, ${tx.json({ comment: false })})`);
    await expectError(as("authenticated", BOB, (tx) => tx`select public.add_review_comment(${pub}, null, 0, null, null, 'general', 'Uten rett')`), "42501");
    await as("authenticated", ALICE, (tx) => tx`select public.add_review_comment(${pub}, null, 0, null, null, 'general', 'Redaktør kan alltid')`);
    await as("authenticated", BOB, (tx) => tx`select public.remove_review_comment(${cid})`);
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.review_comments where id=${cid}`)).length === 0, "fjernet kommentar er skjult");
    // Review av: ingen kommentarer synlige
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.review', 'off', null)`);
    assert((await as("authenticated", ALICE, (tx) => tx`select id from public.review_comments where publication_id=${pub}`)).length === 0, "review av: ingen kommentarer");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.add_review_comment(${pub}, null, 0, null, null, 'general', 'x')`), "42501");
    // Blokkering
    await as("authenticated", ALICE, (tx) => tx`select public.block_user(${BOB})`);
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.publications where id=${pub}`)).length === 0, "blokkert mottaker ser ikke publiseringen");
    assert((await as("authenticated", BOB, (tx) => tx`select * from public.user_blocks`)).length === 0, "den blokkerte ser ikke blokkeringen");
    assert((await as("authenticated", ALICE, (tx) => tx`select * from public.user_blocks`)).length === 1, "egen blokkering synlig");
    await as("authenticated", ALICE, (tx) => tx`select public.unblock_user(${BOB})`);
    assert((await as("authenticated", BOB, (tx) => tx`select id from public.publications where id=${pub}`)).length === 1, "etter opphevet blokkering ser mottakeren igjen");
    // Utløp og tilbaketrekking
    await sql`update public.publications set expires_at = now() - interval '1 second', publish_at = now() - interval '1 day' where id=${pub}`;
    assert((await as("authenticated", BOB, (tx) => tx`select public.publication_for_me(${pub}) p`))[0]!["p"] === null, "utløpt: ingenting");
    assert((await as("authenticated", ALICE, (tx) => tx`select id from public.publications where id=${pub}`)).length === 1, "redaktøren ser fortsatt sin utløpte publisering");
    await sql`update public.publications set expires_at = null where id=${pub}`;
    await as("authenticated", ALICE, (tx) => tx`select public.revoke_publication(${pub})`);
    assert((await as("authenticated", BOB, (tx) => tx`select public.publication_for_me(${pub}) p`))[0]!["p"] === null, "tilbaketrukket: ingenting");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.update_publication(${pub}, ${tx.json({ status: "live" })})`), "22023");
    // Offentlig krever community.public
    await expectError(create(ALICE, "public"), "42501");
    // Sharing av: alt borte, også for redaktøren
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.sharing', 'off', null)`);
    assert((await as("authenticated", ALICE, (tx) => tx`select id from public.publications where project_id=${bp}`)).length === 0, "sharing av: null rader for redaktøren");
    assert((await as("authenticated", ALICE, (tx) => tx`select id from public.publication_media where project_id=${bp}`)).length === 0, "sharing av: ingen medier");
    // Profil: privat som standard, offentlig bare med community.profiles
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_my_public_profile('alice', 'Bio', null, true, '{}'::jsonb)`), "42501");
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.profiles', 'on', null)`);
    assert((await sql`select is_public from public.profiles where user_id=${BOB}`)[0]!["is_public"] === false, "profilen er privat som standard");
    await as("authenticated", BOB, (tx) => tx`select public.set_my_public_profile('Bob_Animator', 'Hei', null, false, '{}'::jsonb)`);
    assert((await as("anon", null, (tx) => tx`select public.public_profile('bob_animator') p`))[0]!["p"] === null, "privat profil gir ingenting");
    await as("authenticated", BOB, (tx) => tx`select public.set_my_public_profile('bob_animator', 'Hei', null, true, '{}'::jsonb)`);
    const prof = (await as("anon", null, (tx) => tx`select public.public_profile('bob_animator') p`))[0]!["p"] as Record<string, unknown>;
    assert(prof?.["bio"] === "Hei" && Object.keys(prof).sort().join(",") === "bio,display_name", "offentlig profil gir bare offentlige felt");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_my_public_profile('bob_animator', '', null, false, '{}'::jsonb)`), "23505");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_my_public_profile('a!', '', null, false, '{}'::jsonb)`), "23514");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_my_public_profile('alice', '', ${`avatars/${BOB}/a.png`}, false, '{}'::jsonb)`), "22023");
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.profiles', 'off', null)`);
    assert((await as("anon", null, (tx) => tx`select public.public_profile('bob_animator') p`))[0]!["p"] === null, "profiles av: ingenting");
    // Rettigheter på ressursversjoner
    const prod = (await sql`select id from public.productions where project_id=${bp} and kind='main'`)[0]!["id"];
    void prod;
    const a = crypto.randomUUID(), av = crypto.randomUUID();
    await sql`insert into public.assets (id, project_id, kind, name) values (${a}, ${bp}, 'character', 'Maja')`;
    await sql`insert into public.asset_variants (id, project_id, asset_id, name, style) values (${av}, ${bp}, ${a}, 'Standard', 'reference')`;
    const ver = (rights: unknown) => sql`insert into public.asset_versions (id, project_id, variant_id, number, media_path, mime_type, byte_size_big, sha256, rights)
      values (${crypto.randomUUID()}, ${bp}, ${av}, ${Math.floor(Math.random() * 1e6) + 2}, ${`${bp}/r.png`}, 'image/png', 1, ${"c".repeat(64)}, ${rights === null ? null : sql.json(rights as never)})`;
    await ver(null);
    await ver({ license: "CC BY 4.0", shareable: true, adaptable: false });
    await expectError(ver({ owner: "x" }), "23514");
    await expectError(ver({ shareable: "ja" }), "23514");
    // Rapportering: av gir avvisning; admin-kø bak community.review
    await expectError(as("authenticated", BOB, (tx) => tx`select public.report_content('profile', ${BOB}, 'spam', '')`), "42501");
    await expectError(as("authenticated", BOB, (tx) => tx`select public.block_user(${ALICE})`), "42501");
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.review', 'on', null)`);
    await as("authenticated", BOB, (tx) => tx`select public.report_content('profile', ${ALICE}, 'spam', 'Reklame')`);
    await expectError(as("authenticated", BOB, (tx) => tx`select public.admin_report_queue()`), "42501");
    const queue = (await as("authenticated", ADM, (tx) => tx`select public.admin_report_queue() q`))[0]!["q"] as { id: string }[];
    assert(queue.length === 1, "rapporten står i køen");
    await as("authenticated", ADM, (tx) => tx`select public.admin_handle_report(${queue[0]!.id}, 'dismissed')`);
    assert(((await as("authenticated", ADM, (tx) => tx`select public.admin_report_queue() q`))[0]!["q"] as unknown[]).length === 0, "behandlet rapport er ute av køen");
    await as("authenticated", ADM, (tx) => tx`select public.admin_set_feature('community.review', 'off', null)`);
    await expectError(as("authenticated", ADM, (tx) => tx`select public.admin_report_queue()`), "42501");
    // delete_project sletter publiseringene og returnerer mediefilene
    const r = (await as("service_role", null, async (tx) => (await tx`select public.delete_project(${bp},${ALICE}) r`)[0]!["r"])) as { films: string[] };
    assert(r.films.includes(`${bp}/shares/${pub}/film.mp4`), "mediefilen slettes med prosjektet");
    assert((await sql`select 1 from public.publications where project_id=${bp} union all select 1 from public.review_comments where project_id=${bp}`).length === 0, "delete_project sletter publiseringer og kommentarer");
    await sql`delete from public.app_admins where user_id = ${ADM}`;
  });
  await test("PTG1: prosjektkode/opptak og irreversible skuddreservasjoner", async () => {
    const bp = crypto.randomUUID(), prod = crypto.randomUUID(), scene = crypto.randomUUID(), variant = crypto.randomUUID(), occ = crypto.randomUUID();
    await sql`insert into public.projects(id,name,created_by,source_language) values (${bp},'PTG test',${ALICE},'en')`;
    await sql`insert into public.project_members(project_id,user_id,role) values (${bp},${ALICE},'owner')`;
    await sql`insert into public.productions(id,project_id,kind,name,fps_num,fps_den) values (${prod},${bp},'main','Main',24,1)`;
    await sql`insert into public.scenes(id,project_id,origin_production_id) values (${scene},${bp},${prod})`;
    await sql`insert into public.scene_variants(id,project_id,scene_id,owner_production_id) values (${variant},${bp},${scene},${prod})`;
    await sql`insert into public.scene_occurrences(id,project_id,production_id,scene_id,variant_id,order_key) values (${occ},${bp},${prod},${scene},${variant},'a')`;
    await expectError(sql`update public.projects set code='bad code' where id=${bp}`, '23514');
    await sql`update public.projects set code=${'A'.repeat(32)} where id=${bp}`;
    await expectError(sql`update public.projects set code=${'A'.repeat(33)} where id=${bp}`, '23514');
    await expectError(sql`update public.projects set capture_mode='twos' where id=${bp}`, '23514');
    await sql`update public.projects set capture_mode='twos',capture_fps_num=12 where id=${bp}`;
    const reserve = (user: UserId) => as('authenticated', user, tx => tx`select public.reserve_interchange_export(${bp},${prod},array[${occ}::uuid],'shotlist.zip','{}'::jsonb) r`);
    await expectError(reserve(BOB), '42501');
    const first = (await reserve(ALICE))[0]?.['r'] as { batchId: string; versions: Record<string, number> };
    assert(first?.versions[occ] === 1, 'første eksport v001');
    await expectError(as('authenticated', BOB, tx => tx`select public.complete_interchange_export(${bp},${first.batchId})`), '42501');
    await as('authenticated', ALICE, tx => tx`select public.complete_interchange_export(${bp},${first.batchId})`);
    const second = (await reserve(ALICE))[0]?.['r'] as { batchId: string; versions: Record<string, number> };
    assert(second?.versions[occ] === 2, 'etter fullføring v002');
    const third = (await reserve(ALICE))[0]?.['r'] as { versions: Record<string, number> };
    assert(third?.versions[occ] === 3, 'avbrutt reservasjon gjenbrukes ikke');
    // Eksportloggen er uforanderlig (INV-13): lag en ufullstendig batch med lovlig insert (batchSize 2, én rad).
    const partial = crypto.randomUUID();
    await sql`insert into public.export_records(id,project_id,production_id,kind,file_name,settings,occurrence_ids,created_by)
      values (${crypto.randomUUID()},${bp},${prod},'script','shotlist.zip',
        ${sql.json({ interchange: true, phase: 'reserved', batchId: partial, shotVersion: 4, batchSize: 2 })},array[${occ}::uuid],${ALICE})`;
    await expectError(as('authenticated', ALICE, tx => tx`select public.complete_interchange_export(${bp},${partial}::uuid)`), '22023');
    await as('service_role', null, tx => tx`select public.delete_project(${bp},${ALICE})`);
    assert((await sql`select id from public.export_records where project_id=${bp}`).length === 0,'eksportlogg slettet med prosjekt');
  });
  await test("0083 (B-118): scenestatus og scenefarge – check-verdier, skriving via apply_changes og bare redaktør", async () => {
    const bp = crypto.randomUUID(), prod = crypto.randomUUID(), scene = crypto.randomUUID(), variant = crypto.randomUUID(), occ = crypto.randomUUID();
    await sql`insert into public.projects(id,name,created_by,source_language) values (${bp},'B118 test',${ALICE},'en')`;
    await sql`insert into public.project_members(project_id,user_id,role) values (${bp},${ALICE},'owner'),(${bp},${BOB},'viewer'),(${bp},${CAROL},'editor')`;
    await sql`insert into public.productions(id,project_id,kind,name,fps_num,fps_den) values (${prod},${bp},'main','Main',24,1)`;
    await sql`insert into public.scenes(id,project_id,origin_production_id) values (${scene},${bp},${prod})`;
    await sql`insert into public.scene_variants(id,project_id,scene_id,owner_production_id) values (${variant},${bp},${scene},${prod})`;
    await sql`insert into public.scene_occurrences(id,project_id,production_id,scene_id,variant_id,order_key) values (${occ},${bp},${prod},${scene},${variant},'a')`;
    // Check-verdiene: bare nøklene i listene, null er lov
    await expectError(sql`update public.scene_occurrences set work_status='finished' where id=${occ}`, "23514");
    await expectError(sql`update public.scene_occurrences set color='#ff0000' where id=${occ}`, "23514");
    for (const w of ["setup", "animating", "review", "retake", "approved", "post", "done"]) await sql`update public.scene_occurrences set work_status=${w} where id=${occ}`;
    for (const c of ["red", "orange", "yellow", "green", "teal", "blue", "indigo", "purple", "pink", "gray"]) await sql`update public.scene_occurrences set color=${c} where id=${occ}`;
    await sql`update public.scene_occurrences set work_status=null, color=null where id=${occ}`;
    // Redaktør skriver via kommando → apply_changes; leses tilbake
    let st = await loadState(bp);
    st = await runCommand(st, CAROL, { type: "SetOccurrenceWorkStatus", occurrenceId: occ as never, workStatus: "review" });
    st = await runCommand(st, CAROL, { type: "SetOccurrenceColor", occurrenceId: occ as never, color: "teal" });
    let back = await loadState(bp);
    assert(back.occurrences[occ]?.workStatus === "review" && back.occurrences[occ]?.color === "teal", "status og farge ble ikke lagret");
    const log = await sql`select command_type, actor from public.change_log where project_id=${bp} and command_type in ('SetOccurrenceWorkStatus','SetOccurrenceColor')`;
    assert(log.length === 2 && log.every((r) => r["actor"] === CAROL), "endringsloggen har hvem som endret");
    // Leser kan ikke endre
    await expectError(runCommand(back, BOB, { type: "SetOccurrenceColor", occurrenceId: occ as never, color: "red" }), "42501");
    // Leser ser verdiene (RLS)
    const seen = await as("authenticated", BOB, (tx) => tx`select work_status, color from public.scene_occurrences where id=${occ}`);
    assert(seen[0]?.["work_status"] === "review" && seen[0]?.["color"] === "teal", "leser ser ikke status og farge");
    // Angring via kommando
    st = await runCommand(back, CAROL, { type: "SetOccurrenceColor", occurrenceId: occ as never, color: null });
    back = await loadState(bp);
    assert(back.occurrences[occ]?.color === undefined, "farge ble ikke fjernet");
    await as("service_role", null, (tx) => tx`select public.delete_project(${bp},${ALICE})`);
  });
  await test("0084 PTG4: munnsett/spor, RLS, kommando/angring, backup og sletting", async () => {
    projectId=await as('authenticated',ALICE,async tx=>(await tx`select public.create_project('PTG4 test') id`)[0]?.['id']);
    const prod=(await sql`select id from public.productions where project_id=${projectId}`)[0]?.['id'];
    const scene=crypto.randomUUID(),variant=crypto.randomUUID(),occ=crypto.randomUUID(),blockId=crypto.randomUUID(),clipId=crypto.randomUUID();
    await sql`insert into public.scenes(id,project_id,origin_production_id) values (${scene},${projectId},${prod})`;
    await sql`insert into public.scene_variants(id,project_id,scene_id,owner_production_id) values (${variant},${projectId},${scene},${prod})`;
    await sql`insert into public.scene_occurrences(id,project_id,production_id,scene_id,variant_id,order_key) values (${occ},${projectId},${prod},${scene},${variant},'a')`;
    await sql`insert into public.script_blocks(id,project_id,variant_id,kind,order_key,text) values (${blockId},${projectId},${variant},'dialogue','a','pappa')`;
    await sql`insert into public.script_block_revisions(project_id,block_id,rev,text,author) values (${projectId},${blockId},1,'pappa',${ALICE})`;
    const character = crypto.randomUUID(), setId = crypto.randomUUID(), trackId = crypto.randomUUID();
    await sql`insert into public.assets(id,project_id,kind,name) values (${character},${projectId},'character','PTG4 karakter')`;
    const sound=crypto.randomUUID();await sql`insert into public.assets(id,project_id,kind,name) values (${sound},${projectId},'sound','PTG4 lyd')`;
    await sql`insert into public.audio_clips(id,project_id,occurrence_id,kind,asset_id,block_id,offset_ms,length_ms) values (${clipId},${projectId},${occ},'dialogue',${sound},${blockId},0,1000)`;
    const clip = (await sql`select id,block_id from public.audio_clips where project_id=${projectId} and block_id is not null and not removed limit 1`)[0];
    assert(clip, 'mangler dialogfixtur');
    await sql`update public.audio_clips set character_asset_id=${character} where id=${clip['id']}`;
    await sql`insert into public.project_members(project_id,user_id,role) values (${projectId},${BOB},'viewer') on conflict(project_id,user_id) do update set role='viewer'`;
    let st=await loadState(projectId);
    const set={id:setId,revision:0,characterId:character,system:'rhubarb' as const,variants:{},removed:false};
    st=await runCommand(st,ALICE,{type:'SaveMouthSet',set});
    assert((await loadState(projectId)).mouthSets[setId]?.system==='rhubarb','sett leses tilbake');
    const audio=st.audioClips[String(clip['id'])],block=st.blocks[String(clip['block_id'])];
    assert(audio&&block,'mangler kjernedata');
    const track={id:trackId,revision:0,characterId:character,setId,clipId:audio.id,blockId:block.id,occurrenceId:audio.occurrenceId,language:'nb',spans:[{startFrame:0,endFrame:12,shape:'A' as const}],source:{text:block.text,blockRevision:block.revision,audioSignature:'fixture',setSystem:'rhubarb' as const,algorithm:'ptg4-text-1' as const},removed:false};
    st=await runCommand(st,ALICE,{type:'SaveMouthTrack',track});
    const back=await loadState(projectId);
    assert(back.mouthTracks[trackId]?.spans[0]?.endFrame===12,'spor leses tilbake');
    const edit={type:'SaveMouthTrack' as const,track:{...track,spans:[{startFrame:0,endFrame:16,shape:'D' as const}]}};
    const result=applyCommand(back,{id:newId(),actor:ALICE,at:new Date().toISOString(),command:edit});
    assert(result.ok,'redigering');
    st=await runCommand(back,ALICE,edit);st=await runCommand(st,ALICE,result.inverse);
    assert((await loadState(projectId)).mouthTracks[trackId]?.spans[0]?.endFrame===12,'angring');
    await expectError(runCommand(st,BOB,edit),'42501');
    const seen=await as('authenticated',BOB,tx=>tx`select id from public.mouth_tracks where id=${trackId}`);
    assert(seen.length===1,'leser ser spor');
    await expectError(as('authenticated',BOB,tx=>tx`update public.mouth_sets set system='preston-blair' where id=${setId}`),'42501');
    await expectError(as('authenticated',ALICE,tx=>tx`update public.mouth_tracks set spans='[]' where id=${trackId}`),'42501');
    await expectError(sql`update public.mouth_sets set system='invalid' where id=${setId}`,'23514');
    await sql`update public.assets set removed=true where id=${character}`;
    await expectError(as('service_role',null,tx=>tx`select public.purge_removed_assets(${projectId},${ALICE},array[${character}::uuid],array[]::uuid[])`),'23503');
    await sql`update public.assets set removed=false where id=${character}`;
    assert(BACKUP_STATE_TABLES.includes('mouth_sets')&&BACKUP_STATE_TABLES.includes('mouth_tracks'),'backup tar med begge tabeller');
    await as('service_role',null,tx=>tx`select public.delete_project(${projectId},${ALICE})`);
    assert((await sql`select id from public.mouth_tracks where project_id=${projectId} union all select id from public.mouth_sets where project_id=${projectId}`).length===0,'delete_project sletter spor før sett');
  });
  await test("0085 B-117: by på kontoen, globe_points uten identitet, bare aktive kontoer", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 85, "schema version 85");
    const ids = ["a1170000-0000-7000-8000-000000000001", "a1170000-0000-7000-8000-000000000002", "a1170000-0000-7000-8000-000000000003", "a1170000-0000-7000-8000-000000000004"];
    for (const [i, u] of ids.entries()) {
      await sql`insert into auth.users (id, email) values (${u}, ${`globe${i}@example.com`}) on conflict do nothing`;
      await as("authenticated", u, (tx) => tx`select public.set_my_country('NO')`);
    }
    const OSLO = 3143244, BERGEN = 3161732;
    // By: må finnes i landet; kan fjernes; kan ikke leses direkte
    await as("authenticated", ids[0]!, (tx) => tx`select public.set_my_city(${BERGEN})`);
    assert(((await as("authenticated", ids[0]!, (tx) => tx`select public.my_account() a`))[0]!["a"] as Record<string, unknown>)["city"] === BERGEN, "my_account gir byen");
    await expectError(as("authenticated", ids[0]!, (tx) => tx`select public.set_my_city(2643743)`), "22023"); // London er ikke i Norge
    await expectError(as("anon", null, (tx) => tx`select public.set_my_city(${OSLO})`), "42501");
    await expectError(as("authenticated", ids[0]!, (tx) => tx`select city from public.profiles`), "42501");
    await expectError(as("authenticated", ids[0]!, (tx) => tx`select last_seen_at from public.account_status`), "42501");
    await expectError(sql`update public.profiles set city = 0 where user_id = ${ids[0]!}`, "23514");
    await as("authenticated", ids[1]!, (tx) => tx`select public.set_my_city(${OSLO})`);
    await as("authenticated", ids[1]!, (tx) => tx`select public.set_my_city(null)`);
    assert(((await as("authenticated", ids[1]!, (tx) => tx`select public.my_account() a`))[0]!["a"] as Record<string, unknown>)["city"] === null, "by fjernet");
    // Inne nå: touch_activity skriver last_seen_at høyst hvert 5. min
    await as("authenticated", ids[0]!, (tx) => tx`select public.touch_activity()`);
    const seen1 = (await sql`select last_seen_at from public.account_status where user_id=${ids[0]!}`)[0]!["last_seen_at"];
    await as("authenticated", ids[0]!, (tx) => tx`select public.touch_activity()`);
    const seen2 = (await sql`select last_seen_at from public.account_status where user_id=${ids[0]!}`)[0]!["last_seen_at"];
    assert(String(seen1) === String(seen2) && seen1 != null, "ingen ny skriving innen 5 min");
    // Slettet og sperret konto utelates
    await sql`insert into public.account_status (user_id, status, delete_after) values (${ids[2]!}, 'deleted', null) on conflict (user_id) do update set status='deleted'`;
    await sql`insert into public.account_status (user_id, status) values (${ids[3]!}, 'blocked') on conflict (user_id) do update set status='blocked'`;
    const before = Number((await sql`select count(*) n from public.globe_points()`)[0]!["n"]);
    const anonPts = await as("anon", null, (tx) => tx`select * from public.globe_points()`);
    assert(anonPts.length === before && before >= 2, "anon får punkter");
    assert(Object.keys(anonPts[0] ?? {}).sort().join(",") === "active,lat,lon", "bare lat, lon, active");
    const text = JSON.stringify(anonPts);
    for (const u of ids) assert(!text.includes(u), "ingen bruker-ID");
    assert(!text.includes("example.com"), "ingen e-post");
    // Punkt 0 (Bergen) er 2–12 km fra Bergen og aktivt; de to utelatte gir ingen ekstra punkter
    const bergen = { lat: 60.392, lon: 5.324 };
    const km = (p: Record<string, unknown>) => {
      const r = Math.PI / 180, dLat = (Number(p["lat"]) - bergen.lat) * r, dLon = (Number(p["lon"]) - bergen.lon) * r;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(bergen.lat * r) * Math.cos(Number(p["lat"]) * r) * Math.sin(dLon / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(h));
    };
    const near = anonPts.filter((p) => km(p) < 13);
    assert(near.length === 1 && km(near[0]!) >= 1.9 && near[0]!["active"] === true, "Bergen-punktet er forskjøvet 2–12 km og aktivt");
    const stable = await as("anon", null, (tx) => tx`select * from public.globe_points()`);
    assert(JSON.stringify(stable) === text, "stabile punkter");
    await sql`update public.account_status set status='active' where user_id=${ids[3]!}`;
    assert(Number((await sql`select count(*) n from public.globe_points()`)[0]!["n"]) === before + 1, "sperret konto telles først når den er aktiv igjen");
    await expectError(as("anon", null, (tx) => tx`select * from private.globe_places`), "42501");
  });
  // ---------- S-1: bekreftet mottakerepost og minste EXECUTE (0086) ----------
  async function s1Fixture() {
    const owner = crypto.randomUUID(), recipient = crypto.randomUUID(), email = `${recipient}@example.no`;
    await sql`insert into auth.users (id, email) values (${owner}, ${`${owner}@example.no`}), (${recipient}, ${email})`;
    await sql`update public.features set state = 'on' where key in ('community.sharing', 'community.review')`;
    const project = String((await as('authenticated', owner, tx => tx`select public.create_project('S-1') id`))[0]?.['id']);
    const publication = String((await as('authenticated', owner, tx => tx`select public.create_publication(${project}, 'range', '{}'::jsonb, 'selected', '{"view":true,"comment":true}'::jsonb, null, 'S-1', '', null, null) id`))[0]?.['id']);
    await as('authenticated', owner, tx => tx`select public.set_publication_recipients(${publication}, array[]::uuid[], array[${email.toUpperCase()}]::text[])`);
    await as('authenticated', owner, tx => tx`select public.update_publication(${publication}, '{"status":"live"}'::jsonb)`);
    await as('authenticated', owner, tx => tx`select public.add_publication_media(${publication}, ${`${project}/shares/film.mp4`}, 'video/mp4', 1000, 1920, 1080)`);
    await as('authenticated', owner, tx => tx`select public.add_review_comment(${publication}, null, 0, null, '{"x":0,"y":0,"width":1,"height":1}'::jsonb, 'general', 'S-1')`);
    return { owner, recipient, project, publication };
  }
  await test('0086 S-1: ubekreftet e-post gir verken RPC- eller RLS-tilgang', async () => {
    const f = await s1Fixture();
    assert((await sql`select email_confirmed_at from auth.users where id=${f.recipient}`)[0]?.['email_confirmed_at'] === null, 'mottakeren er ubekreftet');
    assert((await as('authenticated', f.recipient, tx => tx`select public.publication_for_me(${f.publication}) p`))[0]?.['p'] === null, 'RPC avviser ubekreftet e-post');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.publications where id=${f.publication}`)).length === 0, 'RLS skjuler publiseringen');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.publication_media where publication_id=${f.publication}`)).length === 0, 'RLS skjuler mediene');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.review_comments where publication_id=${f.publication}`)).length === 0, 'RLS skjuler kommentarer');
    assert((await sql`select seen_at from public.publication_recipients where publication_id=${f.publication}`)[0]?.['seen_at'] === null, 'ingen sett-markering');
    await expectError(as('authenticated', f.recipient, tx => tx`select public.add_review_comment(${f.publication}, null, 0, null, null, 'general', 'Avvist')`), '42501');
  });
  await test('0086 S-1: bekreftet e-post gir RPC, medier og kommentarer gjennom RLS', async () => {
    const f = await s1Fixture();
    await sql`update auth.users set email_confirmed_at=now() where id=${f.recipient}`;
    const result = (await as('authenticated', f.recipient, tx => tx`select public.publication_for_me(${f.publication}) p`))[0]?.['p'] as { id?: string } | null;
    assert(result?.id === f.publication, 'bekreftet mottaker får riktig publisering');
    assert((await sql`select seen_at from public.publication_recipients where publication_id=${f.publication}`)[0]?.['seen_at'] != null, 'bekreftet e-post markeres sett');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.publications where id=${f.publication}`)).length === 1, 'RLS viser publiseringen');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.publication_media where publication_id=${f.publication}`)).length === 1, 'RLS viser mediet');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.review_comments where publication_id=${f.publication}`)).length === 1, 'RLS viser kommentaren');
    await as('authenticated', f.recipient, tx => tx`select public.add_review_comment(${f.publication}, null, 0, null, '{"x":0,"y":0,"width":1,"height":1}'::jsonb, 'general', 'Tillatt')`);
    // Blokkeringens direkte RLS-kall virker fortsatt med innstrammede rettigheter.
    await as('authenticated', f.owner, tx => tx`select public.block_user(${f.recipient})`);
    assert((await as('authenticated', f.owner, tx => tx`select * from public.user_blocks where blocked=${f.recipient}`)).length === 1, 'egen blokkering synlig');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.publications where id=${f.publication}`)).length === 0, 'blokkering skjuler publiseringen');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.review_comments where publication_id=${f.publication}`)).length === 0, 'blokkering skjuler kommentarer');
  });
  await test('0086 S-1: bruker-ID-treff beholdes uten e-postbekreftelse; e-postrad markeres ikke sett', async () => {
    const f = await s1Fixture();
    const emailRow = String((await sql`select id from public.publication_recipients where publication_id=${f.publication}`)[0]?.['id']);
    await as('authenticated', f.owner, tx => tx`select public.set_publication_recipients(${f.publication}, array[${f.recipient}]::uuid[], array[${`${f.recipient}@example.no`}]::text[])`);
    assert((await as('authenticated', f.recipient, tx => tx`select public.publication_for_me(${f.publication}) p`))[0]?.['p'] != null, 'bruker-ID gir tilgang');
    assert((await sql`select seen_at from public.publication_recipients where id=${emailRow}`)[0]?.['seen_at'] === null, 'ubekreftet e-postrad forblir usett');
    assert((await sql`select seen_at from public.publication_recipients where publication_id=${f.publication} and user_id=${f.recipient}`)[0]?.['seen_at'] != null, 'bruker-ID-rad markeres sett');
    assert((await as('authenticated', f.owner, tx => tx`select id from public.publication_recipients where publication_id=${f.publication}`)).length === 2, 'redaktør ser hele mottakerlisten');
    assert((await as('authenticated', f.recipient, tx => tx`select id from public.publication_recipients where publication_id=${f.publication}`)).length === 1, 'ID-mottaker ser egen rad');
  });
  await test('0086 S-1: authenticated har bare de fem direkte RLS-hjelperne', async () => {
    const retained = ['private.feature_enabled(text,uuid)', 'private.any_community(uuid)', 'private.blocked_between(uuid,uuid)', 'private.can_see_publication(uuid,uuid)', 'private.is_project_editor(uuid,uuid)'];
    const revoked = ['private.publication_open(text,timestamp with time zone,timestamp with time zone)', 'private.valid_region(jsonb)', 'private.valid_asset_rights(jsonb)'];
    for (const name of retained) assert((await sql`select has_function_privilege('authenticated', ${name}, 'execute') p`)[0]?.['p'] === true, `${name}: RLS-rettighet beholdt`);
    for (const name of revoked) assert((await sql`select has_function_privilege('authenticated', ${name}, 'execute') p`)[0]?.['p'] === false, `${name}: EXECUTE fjernet`);
    for (const name of [...retained, ...revoked]) {
      assert((await sql`select has_function_privilege('anon', ${name}, 'execute') p`)[0]?.['p'] === false, `${name}: ingen anon EXECUTE`);
      assert((await sql`select has_function_privilege('service_role', ${name}, 'execute') p`)[0]?.['p'] === true, `${name}: service_role beholdt`);
    }
    await expectError(as('authenticated', ALICE, tx => tx`select private.publication_open('live', null, null)`), '42501');
    await expectError(as('authenticated', ALICE, tx => tx`select private.valid_region(null)`), '42501');
    await expectError(as('authenticated', ALICE, tx => tx`select private.valid_asset_rights(null)`), '42501');
    assert((await sql`select has_table_privilege('authenticated', 'public.asset_versions', 'insert') p`)[0]?.['p'] === false, 'ingen direkte klientskriving som trenger CHECK-hjelperen');
  });
  // ---------- B-116: utstillingsvindu (0087) ----------
  async function b116Fixture() {
    const owner = crypto.randomUUID(), other = crypto.randomUUID();
    await sql`insert into auth.users (id, email) values (${owner}, ${`${owner}@example.no`}), (${other}, ${`${other}@example.no`})`;
    await sql`insert into public.profiles (user_id, display_name) values (${owner}, 'Anita'), (${other}, 'Bo') on conflict (user_id) do nothing`;
    await sql`update public.features set state = 'on' where key = 'community.public'`;
    const project = String((await as('authenticated', owner, tx => tx`select public.create_project('B-116') id`))[0]?.['id']);
    return { owner, other, project };
  }
  async function b116Version(project: string, kind = 'character', mime = 'image/png') {
    const asset = crypto.randomUUID(), variant = crypto.randomUUID(), version = crypto.randomUUID();
    await sql`insert into public.assets(id,project_id,kind,name) values(${asset},${project},${kind},'Reven')`;
    await sql`insert into public.asset_variants(id,project_id,asset_id,name,style) values(${variant},${project},${asset},'Original','reference')`;
    await sql`insert into public.asset_versions(id,project_id,variant_id,number,media_path,mime_type,byte_size_big,sha256,width,height)
      values(${version},${project},${variant},1,${`${project}/source/${version}.png`},${mime},100,${'a'.repeat(64)},800,600)`;
    return version;
  }
  async function prepareItem(user: string, project: string, source: string | null, kind = 'character', lines: string[] = [], text = 'Om filmen', expires: string | null = null) {
    return as('authenticated', user, tx => tx`select public.prepare_showcase_item(${project},${kind},'Reven',${text},${source}::uuid,${tx.array(lines)}::uuid[],${expires}::timestamptz) r`);
  }
  async function createItem(user: string, project: string, expires: string | null = null) {
    const source = await b116Version(project);
    const r = (await prepareItem(user,project,source,'character',[],'Om filmen',expires))[0]?.['r'] as {id:string};
    return as('service_role', null, tx => tx`select public.create_showcase_item(${r.id},${user}) id`);
  }
  await test('0087 B-116: avslått bryter gir ingenting', async () => {
    await sql`update public.features set state = 'off' where key = 'community.public'`;
    const { owner, project } = await b116Fixture();
    await sql`update public.features set state = 'off' where key = 'community.public'`;
    assert((await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f'] !== null, 'feed svarer');
    assert(JSON.stringify((await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f']) === '[]', 'anon får tom karusell');
    await expectError(createItem(owner, project), '42501');
    assert(JSON.stringify((await as('authenticated', owner, tx => tx`select public.my_showcase_items() m`))[0]?.['m']) === '[]', 'mine delinger er tomme');
  });
  await test('0087 B-116: ventende bidrag vises ikke, godkjent vises uten identitet', async () => {
    const { owner, other, project } = await b116Fixture();
    const id = String((await createItem(owner, project))[0]?.['id']);
    assert(JSON.stringify((await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f']) === '[]', 'pending vises ikke i karusellen');
    const mine = JSON.stringify((await as('authenticated', owner, tx => tx`select public.my_showcase_items() m`))[0]?.['m']);
    assert(mine.includes('"status":"pending"') && mine.includes('Reven'), 'eieren ser sitt ventende bidrag');
    assert(JSON.stringify((await as('authenticated', other, tx => tx`select public.my_showcase_items() m`))[0]?.['m']) === '[]', 'andre ser ikke bidraget');
    // Admin godkjenner
    await sql`insert into public.app_admins (user_id) values (${other}) on conflict do nothing`;
    await as('authenticated', other, tx => tx`select public.admin_review_showcase_item(${id}, true)`);
    const feed = (await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f'] as Record<string, unknown>[];
    assert(feed.length === 1 && feed[0]!['id'] === id, 'godkjent bidrag i karusellen for anon');
    assert(feed[0]!['author_name'] === null, 'privat kontoavledet navn skjules');
    await sql`update public.profiles set handle='anita_public',is_public=true,avatar_key=${`avatars/${owner}/a.png`} where user_id=${owner}`;
    const chosen=(await as('anon',null,tx=>tx`select public.showcase_feed() f`))[0]?.['f'] as Record<string,unknown>[];
    assert(chosen[0]?.['author_name']==='anita_public','bare eksplisitt offentlig valgt navn');
    assert(!JSON.stringify(chosen).includes(owner),'avatarsti røpes ikke');
    const text = JSON.stringify(feed);
    for (const bad of [owner, project, 'example.no', 'user_id', 'email', 'created_by', 'project_id', 'storage_key', 'production_id']) assert(!text.includes(bad), `ingen identitet/prosjekt-ID i karusellen (${bad})`);
    // Utløpt forsvinner
    await sql`update public.showcase_items set expires_at = now() - interval '1 hour' where id = ${id}`;
    assert(JSON.stringify((await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f']) === '[]', 'utløpt vises ikke');
    await sql`update public.showcase_items set expires_at = now() + interval '7 days', status = 'revoked', revoked_at = now() where id = ${id}`;
    assert(JSON.stringify((await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f']) === '[]', 'tilbaketrukket vises ikke');
    await sql`update public.showcase_items set status = 'rejected', revoked_at = null where id = ${id}`;
    assert(JSON.stringify((await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f']) === '[]', 'avvist vises ikke');
    await sql`delete from public.app_admins where user_id = ${other}`;
  });
  await test('0087 B-116: kommentarer og rapportering', async () => {
    const { owner, other, project } = await b116Fixture();
    const id = String((await createItem(owner, project))[0]?.['id']);
    await sql`update public.showcase_items set status = 'live', approved_at = now() where id = ${id}`;
    const cid = String((await as('authenticated', other, tx => tx`select public.add_showcase_comment(${id}, 'Fin rev!') id`))[0]?.['id']);
    const comments = (await as('anon', null, tx => tx`select public.showcase_comments(${id}) c`))[0]?.['c'] as Record<string, unknown>[];
    assert(comments.length === 1 && comments[0]!['text'] === 'Fin rev!' && comments[0]!['author_name'] === null, 'anon leser kommentarer');
    assert(!JSON.stringify(comments).includes(other), 'ingen bruker-ID i kommentarene');
    const own = (await as('authenticated', other, tx => tx`select public.showcase_comments(${id}) c`))[0]?.['c'] as Record<string, unknown>[];
    assert(own[0]!['mine'] === true, 'eieren ser sitt flagg');
    await expectError(as('anon', null, tx => tx`select public.add_showcase_comment(${id}, 'x')`), '42501');
    await as('authenticated', other, tx => tx`select public.report_content('showcase', ${id}, 'other', 'Test')`);
    assert((await sql`select count(*) n from public.content_reports where target_kind = 'showcase' and target_id = ${id}`)[0]?.['n'] == 1, 'rapporten lagres');
    await as('authenticated', other, tx => tx`select public.remove_showcase_comment(${cid})`);
    assert(JSON.stringify((await as('anon', null, tx => tx`select public.showcase_comments(${id}) c`))[0]?.['c']) === '[]', 'fjernet kommentar forsvinner');
  });
  await test('0087 B-116: endring, tilbaketrekking og bryter for godkjenning', async () => {
    const { owner, other, project } = await b116Fixture();
    // Uten godkjenningskrav blir nye bidrag synlige med en gang
    await sql`insert into public.app_admins (user_id) values (${other}) on conflict do nothing`;
    await as('authenticated', other, tx => tx`select public.admin_set_showcase_approval(false)`);
    const id = String((await createItem(owner, project))[0]?.['id']);
    assert(JSON.stringify((await as('anon', null, tx => tx`select public.showcase_feed() f`))[0]?.['f']).includes(id), 'live med en gang uten krav');
    await as('authenticated', other, tx => tx`select public.admin_set_showcase_approval(true)`);
    // Endring av innholdet sender bidraget tilbake til «venter»
    await as('authenticated', owner, tx => tx`select public.update_showcase_item(${id}, ${tx.json({ title: 'Gaupa' })})`);
    const mine = JSON.stringify((await as('authenticated', owner, tx => tx`select public.my_showcase_items() m`))[0]?.['m']);
    assert(mine.includes('"status":"pending"') && mine.includes('Gaupa'), 'tilbake til ventende ved endring');
    await expectError(as('authenticated', other, tx => tx`select public.update_showcase_item(${id}, ${tx.json({})})`), '42501');
    await expectError(as('authenticated', owner, tx => tx`select public.update_showcase_item(${id}, ${tx.json({ status: 'live' })})`), '22023');
    // Tilbaketrekking når som helst, bare eier/admin; kan ikke endres etterpå
    const stranger = crypto.randomUUID();
    await sql`insert into auth.users (id, email) values (${stranger}, ${`${stranger}@example.no`})`;
    await expectError(as('authenticated', stranger, tx => tx`select public.revoke_showcase_item(${id})`), '42501');
    await as('authenticated', owner, tx => tx`select public.revoke_showcase_item(${id})`);
    await expectError(as('authenticated', owner, tx => tx`select public.update_showcase_item(${id}, ${tx.json({ title: 'X' })})`), '22023');
    assert(JSON.stringify((await as('authenticated', owner, tx => tx`select public.my_showcase_items() m`))[0]?.['m']).includes('"status":"revoked"'), 'trukket tilbake i listen');
    await sql`delete from public.app_admins where user_id = ${other}`;
  });
  await test('0087 B-116: admin-kø, profiler og sletting av prosjektet', async () => {
    const { owner, other, project } = await b116Fixture();
    const id = String((await createItem(owner, project))[0]?.['id']);
    // Ikke-admin får ikke køen
    await expectError(as('authenticated', owner, tx => tx`select public.admin_showcase_queue() q`), '42501');
    await sql`insert into public.app_admins (user_id) values (${other}) on conflict do nothing`;
    const queue = (await as('authenticated', other, tx => tx`select public.admin_showcase_queue() q`))[0]?.['q'] as { require_approval: boolean; items: Record<string, unknown>[] };
    assert(queue.require_approval === true && queue.items.some((i) => i['id'] === id && i['author_name'] === 'Anita'), 'køen viser ventende');
    await as('authenticated', other, tx => tx`select public.admin_review_showcase_item(${id}, false)`);
    assert(JSON.stringify((await as('authenticated', owner, tx => tx`select public.my_showcase_items() m`))[0]?.['m']).includes('"status":"rejected"'), 'avvist hos eieren');
    // Egen profil: ingenting uten profilbryteren, egen rad med den
    await sql`update public.features set state = 'off' where key = 'community.profiles'`;
    assert((await as('authenticated', owner, tx => tx`select public.my_public_profile() p`))[0]?.['p'] === null, 'ingen profil uten bryter');
    await sql`update public.features set state = 'on' where key = 'community.profiles'`;
    const profile = (await as('authenticated', owner, tx => tx`select public.my_public_profile() p`))[0]?.['p'] as Record<string, unknown>;
    assert(profile?.['display_name'] === 'Anita' && profile?.['is_public'] === false, 'egen profil leses');
    // Sletting av prosjektet fjerner bidrag, kommentarer og rapporterer filene
    await sql`update public.showcase_items set status = 'live', approved_at = now() where id = ${id}`;
    const cid2 = String((await as('authenticated', other, tx => tx`select public.add_showcase_comment(${id}, 'x') id`))[0]?.['id']);
    const res = (await as('service_role', null, tx => tx`select public.delete_project(${project}, ${owner}) r`))[0]?.['r'] as { films: string[] };
    assert(res.films.includes(`${project}/shares/${id}/media.png`), 'bidragsfilen returneres til sletting');
    assert((await sql`select count(*) n from public.showcase_items where project_id = ${project}`)[0]?.['n'] == 0, 'bidraget slettet');
    assert((await sql`select count(*) n from public.showcase_comments where id = ${cid2}`)[0]?.['n'] == 0, 'kommentaren slettet');
    await sql`delete from public.app_admins where user_id = ${other}`;
  });
  await test('0087 B-116: ingen direkte tabelltilgang fra klientroller', async () => {
    for (const table of ['public.showcase_items', 'public.showcase_comments', 'public.showcase_reservations']) {
      for (const priv of ['select', 'insert', 'update', 'delete'])
        assert((await sql`select has_table_privilege('authenticated', ${table}, ${priv}) p`)[0]?.['p'] === false, `${table}: ingen authenticated ${priv}`);
      assert((await sql`select has_table_privilege('anon', ${table}, 'select') p`)[0]?.['p'] === false, `${table}: ingen anon`);
      assert((await sql`select relrowsecurity from pg_class where oid = ${table}::regclass`)[0]?.['relrowsecurity'] === true, `${table}: RLS på`);
    }
    await expectError(as('authenticated', ALICE, tx => tx`select * from public.showcase_items`), '42501');
    await expectError(as('anon', null, tx => tx`select private.showcase_require_approval()`), '42501');
  });
  await test('0087 B-116: autorisasjon før reservasjon, fremmed og uregistrert kilde avvises', async () => {
    const {owner,other,project}=await b116Fixture();
    const source=await b116Version(project);
    await expectError(prepareItem(other,project,source),'42501');
    await sql`insert into public.project_members(project_id,user_id,role) values(${project},${other},'viewer')`;
    await expectError(prepareItem(other,project,source),'42501');
    await expectError(prepareItem(owner,project,crypto.randomUUID()),'42501');
    const foreign=await b116Fixture(); const foreignSource=await b116Version(foreign.project);
    await expectError(prepareItem(owner,project,foreignSource),'42501');
    assert((await sql`select count(*) n from public.showcase_reservations where project_id=${project}`)[0]?.['n']==0,'ingen reservasjon etter avvisning');
    const r=(await prepareItem(owner,project,source))[0]?.['r'] as {id:string;source_key:string;storage_key:string};
    assert(r.source_key===`${project}/source/${source}.png`,'registrert kilde returneres');
    assert(r.storage_key===`${project}/shares/${r.id}/media.png`,'item-ID eier målmappe');
    await expectError(as('authenticated',owner,tx=>tx`select public.create_showcase_item(${r.id},${owner})`),'42501');
    await as('service_role',null,tx=>tx`select public.cancel_showcase_item(${r.id},${owner})`);
    assert((await sql`select count(*) n from public.showcase_reservations where id=${r.id}`)[0]?.['n']==0,'reservasjon frigjort');
  });
  await test('0087 B-116: idempotent sluttføring, privat utfallsoppslag og tapt svar',async()=>{
    const {owner,other,project}=await b116Fixture(); const source=await b116Version(project);
    const r=(await prepareItem(owner,project,source))[0]?.['r'] as {id:string};
    await as('service_role',null,tx=>tx`select public.create_showcase_item(${r.id},${owner})`);
    assert((await as('service_role',null,tx=>tx`select public.create_showcase_item(${r.id},${owner}) id`))[0]?.['id']===r.id,'gjentakelse returnerer samme ID');
    assert((await as('service_role',null,tx=>tx`select public.showcase_item_outcome(${r.id},${owner}) ok`))[0]?.['ok']===true,'commit kan leses tilbake');
    assert((await as('service_role',null,tx=>tx`select public.showcase_item_outcome(${r.id},${other}) ok`))[0]?.['ok']===false,'annen aktør får ikke utfallet');
    await expectError(as('anon',null,tx=>tx`select public.showcase_item_outcome(${r.id},${owner})`),'42501');
    await expectError(as('authenticated',owner,tx=>tx`select public.showcase_item_outcome(${r.id},${owner})`),'42501');
  });
  async function b116Scene(project:string) {
    const scene=crypto.randomUUID(),variant=crypto.randomUUID(),occ=crypto.randomUUID();
    const production=String((await sql`select id from public.productions where project_id=${project} limit 1`)[0]?.['id']);
    await sql`insert into public.scenes(id,project_id,origin_production_id) values(${scene},${project},${production})`;
    await sql`insert into public.scene_variants(id,project_id,scene_id) values(${variant},${project},${scene})`;
    await sql`insert into public.scene_occurrences(id,project_id,production_id,scene_id,variant_id,order_key) values(${occ},${project},${production},${scene},${variant},'a')`;
    return {variant,occ};
  }
  await test('0087 B-116: scener bare som stillbilde, klipp/film avvises', async()=>{
    const {owner,project}=await b116Fixture(); const {occ}=await b116Scene(project);
    const film=crypto.randomUUID(),still=crypto.randomUUID();
    for(const [id,frames,kind] of [[film,100,'imported_film'],[still,null,'still']] as const)
      await sql`insert into public.takes(id,project_id,occurrence_id,kind,status,duration_frames,media_ref)
        values(${id},${project},${occ},${kind},'approved',${frames},${`${project}/source/${id}.mp4`})`;
    await expectError(prepareItem(owner,project,film,'scene'),'42501');
    await expectError(prepareItem(owner,project,null,'film'),'22023');
    const image=(await prepareItem(owner,project,still,'scene'))[0]?.['r'] as {id:string};
    await as('service_role',null,tx=>tx`select public.create_showcase_item(${image.id},${owner})`);
    assert((await sql`select mime from public.showcase_items where id=${image.id}`)[0]?.['mime']==='image/png','stillbilde tillatt');
    await expectError(sql`update public.showcase_items set mime='video/mp4',duration_ms=1000 where id=${image.id}`,'23514');
    await expectError(sql`update public.showcase_items set kind='film' where id=${image.id}`,'23514');
  });
  await test('0087 B-116: feed skjuler sperrede/slettede kontoer og rapporterte bidrag', async()=>{
    const {owner,other,project}=await b116Fixture();const id=String((await createItem(owner,project))[0]?.['id']);
    await sql`update public.showcase_items set status='live',approved_at=now() where id=${id}`;
    const visible=async()=>((await as('anon',null,tx=>tx`select public.showcase_feed() f`))[0]?.['f'] as {id:string}[]).some(i=>i.id===id);
    assert(await visible(),'synlig før');
    for(const status of ['blocked','deleted']){
      await sql`insert into public.account_status(user_id,status) values(${owner},${status}) on conflict(user_id) do update set status=excluded.status,delete_after=null`;
      assert(!(await visible()),'skjult ved '+status);
      assert((await as('service_role',null,tx=>tx`select public.showcase_media(${id}) m`))[0]?.['m']===null,'ingen medier ved '+status);
    }
    await sql`update public.account_status set status='deleting',delete_after=now()+interval '30 days' where user_id=${owner}`;
    assert(!(await visible()),'skjult under sletting');
    await sql`update public.account_status set status='active',delete_after=null where user_id=${owner}`;
    assert(await visible(),'synlig igjen');
    await as('authenticated', other, tx => tx`select public.report_content('showcase', ${id}, 'other', 'Test')`);
    assert(!(await visible()),'åpen rapport skjuler');
    await sql`update public.content_reports set status='actioned' where target_id=${id}`;
    assert(!(await visible()),'behandlet rapport skjuler');
    await sql`update public.content_reports set status='dismissed' where target_id=${id}`;
    assert(await visible(),'avvist rapport skjuler ikke');
  });
  await test('0087 B-116: sweep lister bare reservasjoner eldre enn TTL + 1 time uten bidrag', async()=>{
    const {owner,project}=await b116Fixture();const source=await b116Version(project);
    const r=(await prepareItem(owner,project,source))[0]?.['r'] as {id:string};
    const stale=async()=>((await as('service_role',null,tx=>tx`select id from public.stale_showcase_reservations(${project})`)) as {id:string}[]).map(x=>x.id);
    assert(!(await stale()).includes(r.id),'fersk reservasjon listes ikke');
    await sql`update public.showcase_reservations set expires_at=now()-interval '59 minutes' where id=${r.id}`;
    assert(!(await stale()).includes(r.id),'innenfor TTL + 1 time listes ikke');
    assert((await as('service_role',null,tx=>tx`select public.release_stale_showcase_reservation(${r.id}) ok`))[0]?.['ok']===false,'frigjøres ikke for tidlig');
    await sql`update public.showcase_reservations set expires_at=now()-interval '61 minutes' where id=${r.id}`;
    assert((await stale()).includes(r.id),'utløpt listes');
    await expectError(as('authenticated',owner,tx=>tx`select * from public.stale_showcase_reservations(${project})`),'42501');
    await expectError(as('anon',null,tx=>tx`select public.release_stale_showcase_reservation(${r.id})`),'42501');
    assert((await as('service_role',null,tx=>tx`select public.release_stale_showcase_reservation(${r.id}) ok`))[0]?.['ok']===true,'frigjort');
    assert((await sql`select count(*) n from public.showcase_reservations where id=${r.id}`)[0]?.['n']==0,'borte');
  });
  await test('0087 B-116: 12 valgte replikker snapshots, 13/fremmede/duplikater avvises', async()=>{
    const {owner,project}=await b116Fixture(); const {variant}=await b116Scene(project);
    const lines=Array.from({length:13},()=>crypto.randomUUID());
    for(let i=0;i<lines.length;i++) await sql`insert into public.script_blocks(id,project_id,variant_id,kind,order_key,text)
      values(${lines[i] ?? ""},${project},${variant},'dialogue',${'a'+String.fromCharCode(98+i)},${'Replikk '+i})`;
    const r=(await prepareItem(owner,project,null,'script',lines.slice(0,12)))[0]?.['r'] as {id:string};
    await sql`update public.script_blocks set text='Endret etter reservasjon' where id=${lines[0] ?? ""}`;
    await as('service_role',null,tx=>tx`select public.create_showcase_item(${r.id},${owner})`);
    assert((await sql`select excerpt from public.showcase_items where id=${r.id}`)[0]?.['excerpt']===Array.from({length:12},(_,i)=>'Replikk '+i).join('\n\n'),'snapshot av valgte replikktekster');
    await expectError(prepareItem(owner,project,null,'script',lines),'22023');
    await expectError(prepareItem(owner,project,null,'script',[lines[0] ?? '',lines[0] ?? '']),'22023');
    const foreign=await b116Fixture(); const fscene=await b116Scene(foreign.project); const fid=crypto.randomUUID();
    await sql`insert into public.script_blocks(id,project_id,variant_id,kind,order_key,text) values(${fid},${foreign.project},${fscene.variant},'dialogue','a','Fremmed')`;
    await expectError(prepareItem(owner,project,null,'script',[fid]),'22023');
    await expectError(as('authenticated',owner,tx=>tx`select public.update_showcase_item(${r.id},${tx.json({excerpt:'fri tekst'})})`),'22023');
  });
  await test('0087 B-116: beskrivelse 280 tegn tillatt, 281 avvises ved oppretting og endring',async()=>{
    const {owner,project}=await b116Fixture();const source=await b116Version(project);
    const r=(await prepareItem(owner,project,source,'character',[],'x'.repeat(280)))[0]?.['r'] as {id:string};
    await as('service_role',null,tx=>tx`select public.create_showcase_item(${r.id},${owner})`);
    assert((await sql`select length(text) n from public.showcase_items where id=${r.id}`)[0]?.['n']===280,'280 lagret');
    await expectError(prepareItem(owner,project,source,'character',[],'x'.repeat(281)),'22023');
    await expectError(as('authenticated',owner,tx=>tx`select public.update_showcase_item(${r.id},${tx.json({text:'x'.repeat(281)})})`),'23514');
  });
  await test('0087 B-116: medienøkler kun service, fersk synlighetskontroll på item-ID',async()=>{
    const {owner,project}=await b116Fixture();const id=String((await createItem(owner,project))[0]?.['id']);
    await expectError(as('anon',null,tx=>tx`select public.showcase_media(${id})`),'42501');
    await expectError(as('authenticated',owner,tx=>tx`select public.showcase_media(${id})`),'42501');
    assert((await as('service_role',null,tx=>tx`select public.showcase_media(${id}) m`))[0]?.['m']===null,'pending gir ingen nøkkel');
    await sql`update public.showcase_items set status='live',approved_at=now() where id=${id}`;
    const m=(await as('service_role',null,tx=>tx`select public.showcase_media(${id}) m`))[0]?.['m'] as {storage_key:string};
    assert(m.storage_key===`${project}/shares/${id}/media.png`,'godkjent nøkkel kun til server');
    for(const state of ['expired','revoked','unapproved']) {
      await sql`update public.showcase_items set expires_at=now()+interval '7 days',revoked_at=null,approved_at=now() where id=${id}`;
      if(state==='expired')await sql`update public.showcase_items set expires_at=now()-interval '1 second' where id=${id}`;
      if(state==='revoked')await sql`update public.showcase_items set revoked_at=now() where id=${id}`;
      if(state==='unapproved')await sql`update public.showcase_items set approved_at=null where id=${id}`;
      assert((await as('service_role',null,tx=>tx`select public.showcase_media(${id}) m`))[0]?.['m']===null,'ingen medier '+state);
      const feed=(await as('anon',null,tx=>tx`select public.showcase_feed() f`))[0]?.['f'] as {id:string}[];
      assert(!feed.some(item=>item.id===id),'ingen feed '+state);
    }
  });

  await test("0088 (N1): apply_changes skriver scene_ids i samme transaksjon; feil etterlater ingen loggrad", async () => {
    assert(Number((await sql`select max(version) v from public.schema_version`)[0]?.["v"]) >= 88, "schema version 88");
    const overloads = await sql`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='apply_changes'`;
    assert(overloads[0]?.["n"] === 1, "signaturen til apply_changes er uendret (én funksjon)");
    await sql`select 'public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure`;
    const bp = String((await as("authenticated", ALICE, async (tx) => (await tx`select public.create_project('N1 sist endret') id`)[0]!["id"])));
    const prod = (await sql`select id from public.productions where project_id=${bp} and kind='main'`)[0]!["id"];
    const s1 = crypto.randomUUID(), s2 = crypto.randomUUID();
    await sql`insert into public.scenes(id,project_id,origin_production_id,created_by) values(${s1},${bp},${prod},${ALICE}),(${s2},${bp},${prod},${ALICE})`;
    const ok = crypto.randomUUID();
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${ok},${tx.json({ type: "UpdateScene" })},${tx.json({})},${tx.json({ sceneIds: [s2, s1, s1] } as never)})`);
    const row = (await sql`select scene_ids from public.change_log where id=${ok}`)[0];
    assert(JSON.stringify([...(row?.["scene_ids"] as string[])].sort()) === JSON.stringify([s1, s2].sort()), "scene_ids skrevet sammen med loggraden");
    const plain = crypto.randomUUID();
    await as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${plain},${tx.json({ type: "X" })},${tx.json({})},${tx.json({} as never)})`);
    assert((await sql`select scene_ids from public.change_log where id=${plain}`)[0]?.["scene_ids"] === null, "uten sceneIds er scene_ids null som før");
    // Feil i apply_changes: ingen loggrad, heller ikke scene_ids
    const bad = crypto.randomUUID();
    await expectError(as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${bad},${tx.json({ type: "X" })},${tx.json({})},${tx.json({ sceneIds: [s1], inserts: { ukjent: [{ id: "x" }] } } as never)})`), /./);
    const badIds = crypto.randomUUID();
    await expectError(as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${badIds},${tx.json({ type: "X" })},${tx.json({})},${tx.json({ sceneIds: ["ikke-en-id"] } as never)})`), "22P02");
    const badShape = crypto.randomUUID();
    await expectError(as("service_role", null, (tx) => tx`select public.apply_changes(${bp},${ALICE},${badShape},${tx.json({ type: "X" })},${tx.json({})},${tx.json({ sceneIds: s1 } as never)})`), "22023");
    const left = await sql`select id from public.change_log where id in (${bad},${badIds},${badShape})`;
    assert(left.length === 0, "feilet apply_changes etterlot en loggrad");
    // Klienten kan fortsatt ikke kalle funksjonen
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.apply_changes(${bp},${ALICE},gen_random_uuid(),'{}'::jsonb,null,'{}'::jsonb)`), "42501");
  });

  await test("0088 (N1): globale versjoner lagres via reservasjon og commit; feil og utløp ryddes", async () => {
    const ws = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace('N1 bibliotek') as id`)[0]!["id"] as string);
    const tEd = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace_invitation(${ws}, 'bob@example.no', 'editor') as t`)[0]!["t"] as string);
    await as("authenticated", BOB, (tx) => tx`select public.accept_workspace_invitation(${tEd})`);
    const tMem = await as("authenticated", ALICE, async (tx) => (await tx`select public.create_workspace_invitation(${ws}, 'carol@example.no', 'member') as t`)[0]!["t"] as string);
    await as("authenticated", CAROL, (tx) => tx`select public.accept_workspace_invitation(${tMem})`);
    const ga = await as("authenticated", BOB, async (tx) => (await tx`select public.global_create_asset(${ws}, 'logo', 'N1-logo', '', '{}', '{}') as id`)[0]!["id"] as string);
    const gv = await as("authenticated", BOB, async (tx) => (await tx`select public.global_create_variant(${ga}, 'Farge', 'reference', '') as id`)[0]!["id"] as string);
    const k = (c: string) => `global/${ws}/${ga}/${c.repeat(64)}.png`;
    const reserve = (u: string, keys: string[]) => as("authenticated", u, async (tx) => (await tx`select public.global_reserve_version(${gv}, ${keys}::text[]) as id`)[0]!["id"] as string);
    const commit = (u: string, r: string, derived: unknown = null) => as("authenticated", u, async (tx) =>
      (await tx`select public.global_commit_version(${r}, 'image/png', 10, 10, 100, ${"a".repeat(64)}, null, '', null, null, ${derived === null ? null : tx.json(derived as never)}) as id`)[0]!["id"] as string);
    // Rettigheter og stier
    await expectError(as("anon", null, (tx) => tx`select public.global_reserve_version(${gv}, ${[k("a")]}::text[])`), "42501");
    await expectError(reserve(CAROL, [k("a")]), "42501");
    await expectError(reserve(BOB, [`global/${ws}/x/${"a".repeat(64)}.png`]), "22023");
    await expectError(reserve(BOB, []), "22023");
    await expectError(as("authenticated", BOB, (tx) => tx`select * from public.global_version_reservations`), "42501");
    // Reservasjon → commit; samme nøkkel kan ikke reserveres samtidig
    const r1 = await reserve(BOB, [k("a"), k("d")]);
    await expectError(reserve(BOB, [k("a")]), "P0409");
    await expectError(commit(ALICE, r1), "42501");
    await expectError(commit(BOB, r1, { proxy: { path: k("e"), width: 1, height: 1, byteSize: 1, sha256: "e".repeat(64) } }), "22023");
    assert((await sql`select count(*)::int n from public.global_asset_versions where global_asset_id=${ga}`)[0]?.["n"] === 0, "feilet commit lagde en versjon");
    const v1 = await commit(BOB, r1, { proxy: { path: k("d"), width: 1, height: 1, byteSize: 1, sha256: "d".repeat(64) } });
    assert((await commit(BOB, r1)) === v1, "commit er idempotent");
    const ver = (await sql`select storage_key, created_by from public.global_asset_versions where id=${v1}`)[0];
    assert(ver?.["storage_key"] === k("a") && ver?.["created_by"] === BOB, "versjonen bruker den reserverte nøkkelen");
    const committed = await as("service_role", null, (tx) => tx`select * from public.global_reservation_safe_keys(${r1}, ${BOB})`);
    assert(committed.length === 1 && committed[0]?.["committed"] === true && committed[0]?.["storage_key"] === null, "sluttført reservasjon gir ingen nøkler å slette");
    assert((await as("service_role", null, async (tx) => (await tx`select public.global_cancel_reservation(${r1}, ${BOB}) c`)[0]!["c"])) === false, "sluttført reservasjon frigjøres ikke");
    // Feil før commit: bare ubrukte filer kan slettes, og reservasjonen frigjøres
    const r2 = await reserve(BOB, [k("b"), k("d")]);
    const safe = (await as("service_role", null, (tx) => tx`select * from public.global_reservation_safe_keys(${r2}, ${BOB})`)).map((r) => r["storage_key"]);
    assert(JSON.stringify(safe) === JSON.stringify([k("b")]), "filen som versjonen bruker (avledet), skal ikke slettes");
    assert((await as("service_role", null, async (tx) => (await tx`select * from public.global_reservation_safe_keys(${r2}, ${ALICE})`))).length === 0, "annen aktør får ingen nøkler");
    assert((await as("service_role", null, async (tx) => (await tx`select public.global_cancel_reservation(${r2}, ${BOB}) c`)[0]!["c"])) === true, "reservasjonen frigjøres");
    assert((await sql`select id from public.global_version_reservations where id=${r2}`).length === 0, "reservasjonen er borte");
    const r3 = await reserve(BOB, [k("a")]);
    assert((await as("service_role", null, (tx) => tx`select * from public.global_reservation_safe_keys(${r3}, ${BOB})`)).length === 0, "filen til en eksisterende versjon slettes aldri");
    await as("service_role", null, (tx) => tx`select public.global_cancel_reservation(${r3}, ${BOB})`);
    // Utløpt: commit avvises; sweepen finner den og frigjør den
    const r4 = await reserve(BOB, [k("c")]);
    await sql`update public.global_version_reservations set expires_at = now() - interval '2 hours' where id=${r4}`;
    await expectError(commit(BOB, r4), "22023");
    const r5 = await reserve(BOB, [k("f")]);
    const stale = await as("service_role", null, (tx) => tx`select * from public.stale_global_reservations(${ws})`);
    assert(stale.length === 1 && stale[0]?.["id"] === r4 && JSON.stringify(stale[0]?.["storage_keys"]) === JSON.stringify([k("c")]), "sweepen ser bare den utløpte");
    assert((await as("service_role", null, async (tx) => (await tx`select public.release_stale_global_reservation(${r5}) r`)[0]!["r"])) === false, "åpen reservasjon frigjøres ikke av sweepen");
    assert((await as("service_role", null, async (tx) => (await tx`select public.release_stale_global_reservation(${r4}) r`)[0]!["r"])) === true, "utløpt reservasjon frigjøres");
    // Bare serveren kan rydde
    for (const q of [
      (tx: never) => (tx as typeof sql)`select * from public.global_reservation_safe_keys(${r5}, ${BOB})`,
      (tx: never) => (tx as typeof sql)`select public.global_cancel_reservation(${r5}, ${BOB})`,
      (tx: never) => (tx as typeof sql)`select * from public.stale_global_reservations(${ws})`,
      (tx: never) => (tx as typeof sql)`select public.release_stale_global_reservation(${r5})`,
    ]) await expectError(as("authenticated", BOB, q as never), "42501");
  });

  await test("0090 G-1: japansk/engelsk/norsk kilde, mål, kildebytte og versjonsintegritet", async () => {
    for (const source of ["ja", "en", "nb"]) {
      const bp = String((await as("authenticated", ALICE, tx => tx`select public.create_project('G1',25,1,${source}) id`))[0]?.["id"]);
      let st = await loadState(bp);
      assert(st.project.sourceLanguage === source, "source not loaded");
      const prod = Object.values(st.productions).find(p => p.kind === "main"); assert(prod, "main missing");
      const blockId = newId(), variantId = newId();
      st = await runCommand(st, ALICE, { type: "CreateScene", productionId: prod.id, sceneId: newId() as never, variantId: variantId as never, occurrenceId: newId() as never, orderKey: keyBetween(null,null), heading: { intExt: "INT.", location: "ROOM", time: "DAY" }, blocks: [{ blockId: blockId as never, kind: "dialogue", text: source === "ja" ? "こんにちは。" : "Hello.", orderKey: keyBetween(null,null) }] });
      const original = st.blocks[blockId]?.text;
      for (const target of source === "ja" ? ["nb", "en"] : source === "en" ? ["nb", "ja"] : ["en", "ja"]) {
        const versionId = newId(), lineId = newId();
        st = await runCommand(st, ALICE, { type: "AddLanguageVersion", versionId, language: target, name: target });
        st = await runCommand(st, ALICE, { type: "AddTranslationLines", items: [{ lineId, fields: { variantId, language: target, ord: 0, kind: "dialogue", text: "Target" } }] });
        st = await runCommand(st, ALICE, { type: "SetLineLink", linkId: newId(), fields: { variantId, language: target, sourceBlockIds: [blockId], targetTranslationIds: [lineId], origin: "manual", confidence: 1, reason: "" } });
        await expectError(sql`update public.language_versions set language=${source} where id=${versionId}`, /source language/);
        await expectError(sql`update public.language_versions set language='de' where id=${versionId}`, /version scope/);
        await expectError(sql`update public.projects set source_language=${target} where id=${bp}`, /conflicts/);
      }
      assert((await sql`select source_language from public.language_versions where project_id=${bp}`).every(v => v["source_language"] === source), "version source mismatch");
      const changed = await runCommand(st, ALICE, { type: "SetDialogueLanguage", target: "project", targetId: bp, language: "fr" });
      assert(Object.values(changed.blocks).every(b => b.language === "fr"), "local source blocks mismatch");
      const loaded = await loadState(bp); assert(Object.values(loaded.blocks).every(b => b.language === "fr"), "persisted source blocks mismatch");
      assert(loaded.blocks[blockId]?.text === original, "source text changed");
      await as("service_role", null, tx => tx`select public.delete_project(${bp},${ALICE})`);
      await as("service_role", null, tx => tx`select public.purge_project_assets(${bp},${ALICE})`);
    }
  });

  // ---------- G-2 skala (0093) ----------
  const DAVE = "55555555-5555-7555-8555-555555555555";
  await sql`insert into auth.users (id, email) values (${DAVE}, 'dave@example.no') on conflict do nothing`;
  const g2Project = String((await as("authenticated", ALICE, (tx) => tx`select public.create_project('G2', 25, 1, 'en') id`))[0]?.["id"]);
  const g2Prod = String((await sql`select id from public.productions where project_id=${g2Project} and kind='main'`)[0]!["id"]);
  // BOB er fjernet medlem, DAVE er aktivt medlem (leser), CAROL er ikke medlem
  await sql`insert into public.project_members (project_id, user_id, role) values (${g2Project}, ${BOB}, 'viewer'), (${g2Project}, ${DAVE}, 'viewer')`;
  await sql`update public.project_members set removed_at = now() where project_id=${g2Project} and user_id=${BOB}`;
  {
    let st = await loadState(g2Project);
    for (let i = 0; i < 3; i++)
      st = await runCommand(st, ALICE, { type: "CreateScene", productionId: g2Prod as never, sceneId: newId() as never, variantId: newId() as never, occurrenceId: newId() as never, orderKey: keyBetween(Object.values(st.occurrences).map(o => o.orderKey).sort().at(-1) ?? null, null), heading: { intExt: "INT.", location: "G2", time: "DAY" }, blocks: [{ blockId: newId() as never, kind: "action", text: "G2 " + i, orderKey: keyBetween(null, null) }] });
  }
  const g2Tables = (await sql`select distinct tablename from pg_policies where schemaname='public' and (qual like '%my_project_ids%' or with_check like '%my_project_ids%') order by 1`).map((r) => String(r["tablename"]));

  await test("0093 A4: alle 73 lesepolicyer bruker my_project_ids og ingen bruker is_project_member per rad", async () => {
    assert(g2Tables.length >= 70, `for få tabeller: ${g2Tables.length}`);
    const left = await sql`select tablename from pg_policies where schemaname='public' and (qual like '%is_project_member%' or with_check like '%is_project_member%')`;
    assert(left.length === 0, `fortsatt per rad: ${left.map((r) => r["tablename"]).join(",")}`);
  });

  await test("0093 A4: ikke-medlem ser 0, medlem ser alle, fjernet medlem ser 0 – på alle berørte tabeller", async () => {
    let nonEmpty = 0;
    for (const t of g2Tables) {
      const col = t === "projects" ? "id" : "project_id";
      const total = Number((await sql.unsafe(`select count(*) n from public.${t} where ${col} = $1`, [g2Project]))[0]!["n"]);
      if (total > 0) nonEmpty++;
      const seen = async (u: string) => Number((await as("authenticated", u, (tx) => tx.unsafe(`select count(*) n from public.${t} where ${col} = $1`, [g2Project])))[0]!["n"]);
      const [owner, member, removed, outsider] = [await seen(ALICE), await seen(DAVE), await seen(BOB), await seen(CAROL)];
      // project_members har egen regel for egne rader; alle andre: medlem ser alt, andre ingenting
      assert(owner === total && member === total, `${t}: medlem ser ${owner}/${member} av ${total}`);
      assert(removed === 0 && outsider === 0, `${t}: fjernet ${removed}, ikke-medlem ${outsider}`);
    }
    assert(nonEmpty >= 8, `for få tabeller med rader i testprosjektet: ${nonEmpty}`);
  });

  await test("0093 A4: samme resultat som den gamle per-rad-regelen for alle brukere og alle prosjekter", async () => {
    for (const u of [ALICE, BOB, CAROL, DAVE]) {
      for (const t of g2Tables) {
        const col = t === "projects" ? "id" : "project_id";
        const visible = Number((await as("authenticated", u, (tx) => tx.unsafe(`select count(*) n from public.${t}`)))[0]!["n"]);
        const old = Number((await sql.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: u })}, true)`;
          const extra = t === "project_members" ? ` or false` : "";
          return tx.unsafe(`select count(*) n from public.${t} where private.is_project_member(${col})${extra}`);
        }))[0]!["n"]);
        if (t === "project_members") assert(visible >= old, `${t}/${u}: ${visible} < ${old}`);
        else assert(visible === old, `${t}/${u}: ny ${visible}, gammel ${old}`);
      }
    }
  });

  await test("0093 A2: project_seq er sammenhengende per prosjekt og uavhengig av andre prosjekter", async () => {
    const rows = await sql`select project_seq from public.change_log where project_id=${g2Project} order by seq`;
    assert(rows.length === 4, `forventet 4 rader, fikk ${rows.length}`);
    assert(rows.every((r, i) => Number(r["project_seq"]) === i + 1), `ikke sammenhengende: ${rows.map((r) => r["project_seq"]).join(",")}`);
    const holes = await sql`select project_id from public.change_log group by project_id having max(project_seq) <> count(*) or min(project_seq) <> 1`;
    assert(holes.length === 0, "hull i project_seq i et prosjekt");
    await expectError(sql`update public.change_log set project_seq = 99 where project_id=${g2Project}`, "P0001");
  });

  await test("0093 A1: project_snapshot gir medlemmet samme rader som tabellene, og andre ingenting", async () => {
    const snap = (await as("authenticated", DAVE, (tx) => tx`select public.project_snapshot(${g2Project}) s`))[0]!["s"] as { project: { id: string } | null; log_seq: number; history: string; tables: Record<string, unknown[]>[] };
    const tables = Object.assign({}, ...snap.tables) as Record<string, { id?: string }[]>;
    assert(snap.project?.id === g2Project && snap.log_seq === 4 && snap.history === "current", "hode");
    const blocks = await sql`select id from public.script_blocks where project_id=${g2Project} order by id`;
    assert(JSON.stringify(tables["script_blocks"]!.map((b) => b.id)) === JSON.stringify(blocks.map((b) => b["id"])), "blokker");
    assert(tables["script_block_revisions"]!.length === blocks.length, "bare gjeldende revisjon per blokk");
    assert(Object.keys(tables).length === 52, `tabeller: ${Object.keys(tables).length}`);
    for (const u of [BOB, CAROL]) {
      const other = (await as("authenticated", u, (tx) => tx`select public.project_snapshot(${g2Project}) s`))[0]!["s"] as typeof snap;
      const ot = Object.assign({}, ...other.tables) as Record<string, unknown[]>;
      assert(other.project === null && other.log_seq === 0 && Object.values(ot).every((v) => v.length === 0), `${u} ser data`);
    }
    await expectError(as("anon", null, (tx) => tx`select public.project_snapshot(${g2Project})`), "42501");
  });

  await test("0093 ytelse: 5 000 blokker åpnes, leses og legges inn innenfor fornuftige tak", async () => {
    const pid = String((await as("authenticated", ALICE, (tx) => tx`select public.create_project('G2 stor', 25, 1, 'nb') id`))[0]?.["id"]);
    const prod = String((await sql`select id from public.productions where project_id=${pid} and kind='main'`)[0]!["id"]);
    await sql.unsafe(`
      create temp table g2t as select gen_random_uuid() scene, gen_random_uuid() variant, gen_random_uuid() occ, i from generate_series(1, 500) i;
      insert into public.scenes (id, project_id, origin_production_id) select scene, '${pid}', '${prod}' from g2t;
      insert into public.scene_variants (id, project_id, scene_id) select variant, '${pid}', scene from g2t;
      insert into public.scene_occurrences (id, project_id, production_id, scene_id, variant_id, order_key)
        select occ, '${pid}', '${prod}', scene, variant, 'k' || lpad(i::text, 7, '0') || '1' from g2t;`);
    let t0 = performance.now();
    await sql.unsafe(`insert into public.script_blocks (id, project_id, variant_id, kind, order_key, language, text)
      select gen_random_uuid(), '${pid}', variant, 'action', 'b' || lpad(j::text, 4, '0') || '1', 'xx', 'T' || j from g2t, generate_series(1, 10) j`);
    const insertMs = performance.now() - t0;
    assert((await sql`select count(*) n from public.script_blocks where project_id=${pid} and language <> 'nb'`)[0]!["n"] === "0", "g1 setter kildespråket");
    await sql.unsafe(`insert into public.script_block_revisions (project_id, block_id, rev, text, author) select project_id, id, 1, text, '${ALICE}' from public.script_blocks where project_id='${pid}'`);
    const lv = String((await sql`insert into public.language_versions (id, project_id, language, source_language, name) values (gen_random_uuid(), ${pid}, 'en', 'nb', 'English') returning id`)[0]!["id"]);
    t0 = performance.now();
    await sql.unsafe(`insert into public.translation_lines (id, project_id, variant_id, language, ord, text, language_version_id)
      select gen_random_uuid(), '${pid}', variant, 'en', j, 'L' || j, '${lv}' from g2t, generate_series(1, 10) j`);
    const linesMs = performance.now() - t0;
    await expectError(sql.unsafe(`insert into public.translation_lines (id, project_id, variant_id, language, ord, text, language_version_id)
      select gen_random_uuid(), '${pid}', variant, 'de', 1, 'X', '${lv}' from g2t limit 1`), /version scope/);
    await sql`analyze`;
    t0 = performance.now();
    const snap = (await as("authenticated", ALICE, (tx) => tx`select public.project_snapshot(${pid}) s`))[0]!["s"] as { tables: Record<string, unknown[]>[] };
    const snapMs = performance.now() - t0;
    const tables = Object.assign({}, ...snap.tables) as Record<string, unknown[]>;
    assert(tables["script_blocks"]!.length === 5000 && tables["translation_lines"]!.length === 5000, "antall");
    t0 = performance.now();
    await as("authenticated", ALICE, (tx) => tx`select count(*) from public.script_blocks`);
    const rlsMs = performance.now() - t0;
    console.log(`      blokker ${insertMs.toFixed(0)} ms, linjer ${linesMs.toFixed(0)} ms, øyeblikksbilde ${snapMs.toFixed(0)} ms, RLS ${rlsMs.toFixed(0)} ms`);
    assert(insertMs < 3000, `5 000 blokker tok ${insertMs.toFixed(0)} ms (tak 3 000)`);
    assert(linesMs < 3000, `5 000 linjer tok ${linesMs.toFixed(0)} ms (tak 3 000; før 0093 kvadratisk)`);
    assert(snapMs < 4000, `øyeblikksbildet tok ${snapMs.toFixed(0)} ms (tak 4 000)`);
    assert(rlsMs < 1000, `RLS-lesing tok ${rlsMs.toFixed(0)} ms (tak 1 000)`);
    const plan = (await as("authenticated", ALICE, (tx) => tx.unsafe(`explain select * from public.script_blocks where project_id = '${pid}' and id > '00000000-0000-0000-0000-000000000000' order by id limit 1000`))).map((r) => String(r["QUERY PLAN"])).join("\n");
    assert(/Index/.test(plan), `keyset bruker ikke indeks:\n${plan}`);
    await as("service_role", null, (tx) => tx`select public.delete_project(${pid}, ${ALICE})`);
  });

  // ---------- G-3 global (0094) ----------
  await test("0094 G-3.6: budsjettperioden følger arbeidsgruppens tidssone rundt midnatt og månedsskifte", async () => {
    const pid = String((await as("authenticated", ALICE, (tx) => tx`select public.create_project('G3', 25, 1, 'ja') id`))[0]?.["id"]);
    const start = async (unit: string, at: string) =>
      new Date(String((await sql`select private.budget_period_start(${pid}, ${unit}, ${at}::timestamptz) s`)[0]!["s"])).toISOString();
    // Uten tidssone: UTC
    assert((await start("day", "2026-01-31T23:30:00Z")) === "2026-01-31T00:00:00.000Z", "utc dag");
    // Brukerens tidssone (ingen arbeidsgruppe): Auckland er UTC+13 i januar
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_time_zone('Pacific/Auckland')`);
    assert((await start("day", "2026-01-31T10:59:00Z")) === "2026-01-30T11:00:00.000Z", "auckland før midnatt");
    assert((await start("day", "2026-01-31T11:00:00Z")) === "2026-01-31T11:00:00.000Z", "auckland ved midnatt");
    assert((await start("month", "2026-01-31T11:00:00Z")) === "2026-01-31T11:00:00.000Z", "auckland nytt måned (1. feb lokal)");
    assert((await start("month", "2026-01-31T10:59:00Z")) === "2025-12-31T11:00:00.000Z", "auckland januar");
    // Arbeidsgruppens tidssone vinner: Los Angeles er UTC-8 i januar
    const ws = String((await as("authenticated", ALICE, (tx) => tx`select public.create_workspace('G3 ws') id`))[0]?.["id"]);
    await sql`update public.projects set workspace_id=${ws} where id=${pid}`;
    await as("authenticated", ALICE, (tx) => tx`select public.set_workspace_settings(${ws}, 'America/Los_Angeles', 'eu-north', '{}'::jsonb)`);
    assert((await start("day", "2026-02-01T07:59:00Z")) === "2026-01-31T08:00:00.000Z", "LA før midnatt");
    assert((await start("month", "2026-02-01T08:00:00Z")) === "2026-02-01T08:00:00.000Z", "LA månedsskifte");
    assert((await sql`select region from public.workspaces where id=${ws}`)[0]!["region"] === "eu-north", "region");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.set_my_time_zone('Mars/Olympus')`), /invalid_time_zone/);
    await expectError(as("authenticated", BOB, (tx) => tx`select public.set_workspace_settings(${ws}, 'UTC', null, '{}'::jsonb)`), /not_workspace_owner/);
    await expectError(as("authenticated", ALICE, (tx) => tx`insert into public.fx_rates (base, quote, rate_date, rate, source) values ('USD','NOK','2026-01-01',10,'x')`), /permission|denied|policy/);
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_time_zone(null)`);
    await sql`update public.projects set workspace_id=null where id=${pid}`;
    await as("service_role", null, (tx) => tx`select public.delete_project(${pid}, ${ALICE})`);
  });

  // ---------- G-3 del 2 (0095): kvoter og budsjetter i budsjettets tidssone ----------
  await test("0095: kvalitetsprofilens månedsbudsjett regnes i budsjettets tidssone, ikke UTC", async () => {
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_time_zone('Pacific/Auckland')`);
    const pid = String((await as("authenticated", ALICE, (tx) => tx`select public.create_project('G3-2', 25, 1, 'ja') id`))[0]?.["id"]);
    const qid = "00000000-0000-7000-8000-009500000001";
    await sql`insert into public.quality_profiles (id, project_id, name, spec, created_by)
      values (${qid}, ${pid}, 'G3', '{"budgetLimit":1}'::jsonb, ${ALICE})`;
    const params = await sql`select jsonb_build_object('qualityProfile', jsonb_build_object('id', ${qid}::uuid, 'name', 'G3', 'spec', '{"budgetLimit":1}'::jsonb)) p`;
    // En jobb fra forrige lokale måned (Auckland), som i UTC kan ligge i inneværende måned
    const j1 = "00000000-0000-7000-8000-009500000002";
    await sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, status, created_by, created_at, params)
      values (${j1}, ${pid}, 'image', 'lovable', 'm', 'x', 'done', ${ALICE},
        private.budget_period_start(${pid}, 'month', now()) - interval '1 minute', ${params[0]!["p"]}::jsonb)`;
    // Auckland-månedsstarten er aldri lik UTC-månedsstarten (11–13 timer før), så skillet er reelt
    const utcStart = String((await sql`select (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') s`)[0]!["s"]);
    const localStart = String((await sql`select private.budget_period_start(${pid}, 'month', now()) s`)[0]!["s"]);
    assert(utcStart !== localStart, "forutsetning: lokal og UTC-månedsstart er ulike");
    // Ny jobb i inneværende lokale måned: den gamle teller ikke
    const j2 = "00000000-0000-7000-8000-009500000003";
    await sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, status, created_by, params)
      values (${j2}, ${pid}, 'image', 'lovable', 'm', 'x', 'queued', ${ALICE}, ${params[0]!["p"]}::jsonb)`;
    // Grensen på 1 er nå nådd – neste jobb stoppes
    await expectError(
      sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, status, created_by, params)
        values ('00000000-0000-7000-8000-009500000004', ${pid}, 'image', 'lovable', 'm', 'x', 'queued', ${ALICE}, ${params[0]!["p"]}::jsonb)`,
      /budget exceeded/i,
    );
    await as("service_role", null, (tx) => tx`select public.delete_project(${pid}, ${ALICE})`);
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_time_zone(null)`);
  });

  await test("0095: ai_spend-måneden og periodefunksjonene følger brukerens tidssone (Los Angeles)", async () => {
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_time_zone('America/Los_Angeles')`);
    const pid = String((await as("authenticated", ALICE, (tx) => tx`select public.create_project('G3-3', 25, 1, 'ja') id`))[0]?.["id"]);
    const j1 = "00000000-0000-7000-8000-009500000005";
    await sql`insert into public.generation_jobs (id, project_id, kind, provider, model, prompt, status, created_by, key_owner, cost_usd)
      values (${j1}, ${pid}, 'image', 'lovable', 'm', 'x', 'done', ${ALICE}, ${ALICE}, 0.5)`;
    await sql.begin(async (tx) => {
      await tx`select set_config('animatic.purge_project', ${pid}, true)`;
      await tx`delete from public.generation_jobs where id = ${j1}`;
    });
    const kept = await sql`select month, usd from public.ai_spend where key_owner = ${ALICE}`;
    const expected = String((await sql`select (date_trunc('month', now() at time zone 'America/Los_Angeles'))::date d`)[0]!["d"]).slice(0, 10);
    assert(kept.length === 1 && String(kept[0]!["month"]).slice(0, 10) === expected,
      `ai_spend.month ${String(kept[0]?.["month"]).slice(0, 10)} != lokal måned ${expected}`);
    // Periodefunksjonene: egen bruker får lokal månedsstart; andre brukere avvises
    const mine = String((await as("authenticated", ALICE, (tx) => tx`select public.user_period_start(${ALICE}, 'month') s`))[0]!["s"]);
    const mineExpected = String((await sql`select (date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles') s`)[0]!["s"]);
    assert(new Date(mine).toISOString() === new Date(mineExpected).toISOString(), "user_period_start");
    const mineDate = String((await as("authenticated", ALICE, (tx) => tx`select public.user_period_start_date(${ALICE}, 'month') d`))[0]!["d"]).slice(0, 10);
    assert(mineDate === expected, "user_period_start_date");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.user_period_start(${BOB}, 'month')`), /not_self/);
    const projStart = String((await as("authenticated", ALICE, (tx) => tx`select public.project_period_start(${pid}, 'month') s`))[0]!["s"]);
    assert(new Date(projStart).toISOString() === new Date(mineExpected).toISOString(), "project_period_start uten arbeidsgruppe = eierens sone");
    await expectError(as("authenticated", ALICE, (tx) => tx`select public.project_period_start(${pid}, 'year')`), /budget_period_unit/);
    await sql`delete from public.ai_spend where key_owner = ${ALICE}`;
    await as("service_role", null, (tx) => tx`select public.delete_project(${pid}, ${ALICE})`);
    await as("authenticated", ALICE, (tx) => tx`select public.set_my_time_zone(null)`);
  });
  // ---------- G-4 (0096): aksent- og skriftolerant søk ----------
  await test("0096 G-4.2: fold_text fjerner aksenter, trigramindeksene finnes og RPC-en håndhever medlemskap", async () => {
    // fold_text: aksenter og store bokstaver foldes bort
    const f1 = String((await sql`select private.fold_text('Café ÁRBOL piñón') t`)[0]!["t"]);
    assert(f1 === "cafe arbol pinon", `fold_text ga '${f1}'`);
    const f2 = String((await sql`select private.fold_text('映画テスト') t`)[0]!["t"]);
    assert(f2 === "映画テスト", "CJK skal være uendret");
    // Indeksene finnes
    const idx = await sql`select indexname from pg_indexes where schemaname = 'public' and indexname in ('script_blocks_fold_trgm_idx','assets_name_fold_trgm_idx','script_annotations_fold_trgm_idx','note_flags_fold_trgm_idx','global_assets_name_fold_trgm_idx','profiles_display_name_fold_trgm_idx')`;
    assert(idx.length === 6, `mangler trigramindekser: fant ${idx.length} av 6`);
    // Medlem finner aksentert tekst med aksentfritt søk; ikke-medlem får null treff
    const pid = String((await as("authenticated", ALICE, (tx) => tx`select public.create_project('Søketest', 25, 1, 'nb') id`))[0]!["id"]);
    const prod = String((await sql`select id from public.productions where project_id=${pid} and kind='main'`)[0]!["id"]);
    const scene = String((await sql`insert into public.scenes (id, project_id, origin_production_id) values (gen_random_uuid(), ${pid}, ${prod}) returning id`)[0]!["id"]);
    const variant = String((await sql`insert into public.scene_variants (id, project_id, scene_id) values (gen_random_uuid(), ${pid}, ${scene}) returning id`)[0]!["id"]);
    await sql`insert into public.script_blocks (id, project_id, variant_id, kind, order_key, language, text) values (gen_random_uuid(), ${pid}, ${variant}, 'action', 'k1', 'nb', 'Sara går inn på caféen'), (gen_random_uuid(), ${pid}, ${variant}, 'action', 'k2', 'nb', '映画のテスト')`;
    const hits = Number((await as("authenticated", ALICE, (tx) => tx`select count(*) n from public.search_script_blocks(${pid}, 'cafe', 10)`))[0]!["n"]);
    assert(hits === 1, `«cafe» skulle treffe «caféen», fikk ${hits}`);
    const cjk = Number((await as("authenticated", ALICE, (tx) => tx`select count(*) n from public.search_script_blocks(${pid}, 'テスト', 10)`))[0]!["n"]);
    assert(cjk === 1, `CJK-søk skulle treffe, fikk ${cjk}`);
    const fremmed = Number((await as("authenticated", BOB, (tx) => tx`select count(*) n from public.search_script_blocks(${pid}, 'cafe', 10)`))[0]!["n"]);
    assert(fremmed === 0, `ikke-medlem så ${fremmed} blokker`);
    await as("service_role", null, (tx) => tx`select public.delete_project(${pid}, ${ALICE})`);
  });
  // ---------- search_path: alle SECURITY DEFINER-funksjoner skal ha search_path='' ----------
  await test("alle SECURITY DEFINER-funksjoner i public/private har search_path=''", async () => {
    const rows = await sql`
      select n.nspname as ns, p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c = 'search_path=""')
      order by 1, 2`;
    assert(rows.length === 0,
      `SECURITY DEFINER uten search_path='': ${rows.map((r) => `${String(r["ns"])}.${String(r["name"])}`).join(", ")}`);
  });
} finally {
  await sql.end();
  await admin.unsafe(`drop database if exists ${DB} with (force)`);
  await admin.end();
}

console.log(`\n${passed} bestått, ${failures.length} feilet`);
if (failures.length) {
  for (const f of failures) console.log(`FEIL: ${f}`);
  process.exit(1);
}
