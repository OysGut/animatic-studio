// @vitest-environment node
import { it } from "vitest";
import { applyCommand, diffStates, emptyProjectState } from "@/core";
import { envelope, seedProject, tid } from "../dev-server/tests/helpers/fixtures";
it("probe", () => {
  const seed = seedProject(2);
  let s = seed.state;
  const occ = Object.values(s.occurrences)[0]!;
  const panelId = tid();
  s = applyCommand(s, envelope({ type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: "a" })).state!;
  s = applyCommand(s, envelope({ type: "SetProductionStatus", statusId: tid(), eventId: tid(), area: "storyboard", compositionId: panelId, status: "done" })).state!;
  const patch = diffStates(emptyProjectState(s.project), s);
  console.log("INSERT KEYS:", Object.keys(patch.inserts));
});
