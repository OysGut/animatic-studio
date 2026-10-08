/**
 * Databasetester mot en lokal Postgres med Supabase-emulering (KI-05: Claude når ikke Lovable Cloud direkte).
 * Kjør: DATABASE_URL=postgres://postgres@localhost:54329/postgres bun tests/db/run-db-tests.ts
 * Tester: RLS-rollematrise (INV-C2), revisjonskonflikt (INV-C1), takes kan ikke slettes (INV-07),
 * historikk kan ikke endres (INV-13), invitasjoner (REQ-0521), rundtur domenekjerne ↔ database (DEC-0022).
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
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
  await sql.unsafe(readFileSync(join(root, "db/migrations/0001_core.sql"), "utf8"));
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

  await test("schema_version er lesbar for alle og viser versjon 1", async () => {
    const v = await as("anon", null, (tx) => tx`select version from public.schema_version`);
    assert(v.length === 1 && v[0]!["version"] === 1, "skjemaversjon mangler");
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
