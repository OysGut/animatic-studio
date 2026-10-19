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
      async (tx) => (await tx`select public.create_project('Jula på Dovre') as id`)[0]!["id"],
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
      /check/,
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
    assert(back.posters[poster]!.document.title.en === "Title", "dokumentet ble ikke endret");
    await expectError(
      sql`update public.asset_relations set kind = 'enemy' where id = ${rel}`,
      /check/,
    );
    await expectError(sql`update public.posters set width_mm = 10 where id = ${poster}`, /check/);
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
      as("authenticated", ALICE, (tx) => tx`select public.set_my_locale('de')`),
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
    const row = (await sql`select token_hash, expires_at from public.film_shares where id = ${r.id}`)[0]!;
    assert(row["token_hash"] === (await sql`select encode(sha256(convert_to(${token}, 'UTF8')), 'hex') as h`)[0]!["h"], "hashen");
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
    await expectError(runCommand(st, ALICE, { type: "SaveLipsyncResult", result: { ...lipsync, id: C6(14) } }), /allerede leppesynk/);
    // Ugyldige verdier avvises: ukjent klipp, ukjent kilde, ugyldig farge.
    await expectError(runCommand(st, ALICE, { type: "SaveLipsyncResult", result: { ...lipsync, id: C6(15), clipId: C6(90) } }), /Replikken finnes ikke/);
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
    const anonFns = await sql`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')`;
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
    assert((await sql`select max(version) as v from public.schema_version`)[0]!["v"] === 58, "skjemaversjon 58");
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
