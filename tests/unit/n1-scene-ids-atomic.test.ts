// @vitest-environment node
/** N1 (0088): scene_ids skrives av apply_changes i samme transaksjon, ikke i et etterkall. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "../../src/adapters/storage/commands.functions.ts"), "utf8");
const sql = readFileSync(path.resolve(__dirname, "../../db/migrations/0088_n1_atomic_scene_ids_global_versions.sql"), "utf8");

it("runCommand sender sceneIds i p_changes og oppdaterer ikke change_log etterpå", () => {
  expect(src).toMatch(/p_changes: sceneIds\.length \? \{ \.\.\.changes, sceneIds \} : changes/);
  expect(src).not.toMatch(/from\("change_log"\)\s*\.update/);
});

it("0088 skriver scene_ids i samme insert som loggraden", () => {
  expect(sql).toMatch(/insert into public\.change_log \(id, project_id, actor, command_type, command, inverse, affected_ids, scene_ids\)/);
});
