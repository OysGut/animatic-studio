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
  diffStates,
  keysEvenly,
  stateFromRows,
  type Command,
  type ProjectRows,
  type ProjectState,
  type UserId,
  DEFAULT_COMPOSITION,
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
    assert(row!["description"] === "Hovedfilmen – 12 min\nTil festivalen", "description-kolonnen er feil");
    await expectError(
      sql`update public.productions set description = ${"x".repeat(2001)} where id = ${main.id}`,
      /check/,
    );
    st = await runCommand(st, ALICE, { type: "SetProductionNote", productionId: main.id, note: "" });
    loaded = await loadState(projectId);
    assert(!loaded.productions[main.id]?.note, "notatet ble ikke tømt");
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
