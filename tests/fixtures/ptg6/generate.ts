/** Synthetic, reproducible examples for Claude's OpenTimelineIO adapter checks. */
import { writeFileSync } from "node:fs";
import { seedProject } from "../../helpers/fixtures";
import { orderedOccurrences } from "../../../src/core/views";
import { buildInterchange } from "../../../src/core/interchange";
import { editorialFiles } from "../../../src/core/interchange/editorial";
import type { ProjectState } from "../../../src/core/model";

export function example(rate = 24, twos = false) {
  const { state, mainId } = seedProject(2);
  const occurrences = orderedOccurrences(state, mainId);
  const s: ProjectState = { ...state, takes: {}, clipParts: {},
    project: { ...state.project, code: "PTG6-TEST", name: "PTG6 & test", fps: { num: 24, den: 1 } },
    occurrences: Object.fromEntries(occurrences.map((o, i) => [o.id, { ...o, plannedMs: 1000, activeTakeId: null,
      transition: { kind: i ? "dissolve" : "cut", frames: i ? 5 : 0, overlap: i > 0 } }])) };
  const doc = buildInterchange(s, { productionId: mainId, language: "nb", capture: { mode: twos ? "twos" : "custom", fps: { num: twos ? 12 : rate, den: 1 } } });
  return { state: s, doc, mainId };
}
if (import.meta.main) {
  for (const [label, rate, twos] of [["24", 24, false], ["25", 25, false], ["30", 30, false], ["twos", 24, true]] as const) {
    const { doc } = example(rate, twos);
    for (const file of editorialFiles(doc)) writeFileSync(new URL(`./${label}.${file.path.split(".").pop()}`, import.meta.url), file.data);
    writeFileSync(new URL(`./${label}.timing.json`, import.meta.url), JSON.stringify({ length: doc.lengthFrames, fps: doc.fps,
      shots: doc.shots.map(s => ({ start: s.startFrame, length: s.lengthFrames, in: s.handleIn, out: s.handleOut, tcIn: s.timecodeIn, tcOut: s.timecodeOut })) }, null, 2) + "\n");
  }
}