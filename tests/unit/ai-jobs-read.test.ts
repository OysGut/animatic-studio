/** B-095: telling av uleste AI-feil (ulest, lest enkeltvis, «alle», ny feil etter «alle»). */
import { describe, expect, it } from "vitest";
import {
  MAX_READ_IDS,
  isJobRead,
  markAllJobsRead,
  markJobsRead,
  unreadFailedJobs,
} from "@/core";

const job = (id: string, status: string, finishedAt: string | null) => ({
  id,
  status,
  createdAt: "2026-10-20T10:00:00.000Z",
  finishedAt,
});

const FAILED_1 = job("a", "failed", "2026-10-20T11:00:00.000Z");
const FAILED_2 = job("b", "lost", "2026-10-20T12:00:00.000Z");
const DONE = job("c", "done", "2026-10-20T13:00:00.000Z");
const RUNNING = job("d", "running", null);

describe("uleste AI-feil (B-095)", () => {
  it("teller bare mislykkede/tapte jobber som uleste", () => {
    const unread = unreadFailedJobs([FAILED_1, FAILED_2, DONE, RUNNING], {});
    expect(unread.map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("lest enkeltvis fjerner bare den jobben", () => {
    const prefs = markJobsRead({}, ["a"]);
    expect(isJobRead(FAILED_1, prefs)).toBe(true);
    expect(unreadFailedJobs([FAILED_1, FAILED_2], prefs).map((j) => j.id)).toEqual(["b"]);
  });

  it("«merk alle som lest» gjør alle eldre feil leste", () => {
    const prefs = markAllJobsRead("2026-10-20T14:00:00.000Z");
    expect(unreadFailedJobs([FAILED_1, FAILED_2], prefs)).toEqual([]);
  });

  it("ny feil etter «alle lest» er ulest igjen", () => {
    const prefs = markAllJobsRead("2026-10-20T14:00:00.000Z");
    const fresh = job("e", "failed", "2026-10-20T15:00:00.000Z");
    expect(unreadFailedJobs([FAILED_1, fresh], prefs).map((j) => j.id)).toEqual(["e"]);
  });

  it("tapt jobb uten finishedAt bruker createdAt", () => {
    const lostNoFinish = { id: "f", status: "lost", createdAt: "2026-10-20T09:00:00.000Z", finishedAt: null };
    const prefs = markAllJobsRead("2026-10-20T14:00:00.000Z");
    expect(isJobRead(lostNoFinish, prefs)).toBe(true);
  });

  it("enkeltlisten begrenses til de siste 500", () => {
    const ids = Array.from({ length: MAX_READ_IDS + 50 }, (_, i) => `j${i}`);
    const prefs = markJobsRead({}, ids);
    expect(prefs.readIds).toHaveLength(MAX_READ_IDS);
    expect(prefs.readIds?.[0]).toBe("j50");
    expect(isJobRead(job("j0", "failed", "2026-10-20T11:00:00.000Z"), prefs)).toBe(false);
    expect(isJobRead(job(`j${MAX_READ_IDS + 49}`, "failed", null), prefs)).toBe(true);
  });

  it("duplikater telles ikke to ganger", () => {
    const prefs = markJobsRead(markJobsRead({}, ["a"]), ["a", "b"]);
    expect(prefs.readIds).toEqual(["a", "b"]);
  });
});
