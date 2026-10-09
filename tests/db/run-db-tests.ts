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
      mediaRef: "resources/x.mp4",
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
    const comp = "abcdef00-0000-7000-8000-0000000000d1";
    const layer = "abcdef00-0000-7000-8000-0000000000d2";
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
