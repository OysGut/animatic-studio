import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useAssetStudioDraft } from "@/app/asset-studio/use-asset-studio-draft";
import { audioClipFieldsOf, type ProjectState } from "@/core";
import { fixture } from "../visual/fixture-state";
import { mustApply } from "../helpers/fixtures";

afterEach(cleanup);
function setup() {
  const s = fixture.state;
  const clip = Object.values(s.audioClips).find((c) => !c.removed && !c.muted);
  const occ = clip ? s.occurrences[clip.occurrenceId] : undefined;
  const comp = Object.values(s.compositions).find((c) => c.variantId === occ?.variantId);
  if (!clip || !occ || !comp) throw new Error("Missing scene fixture");
  const hook = renderHook(({ live }: { live: ProjectState }) => useAssetStudioDraft(live, occ.id, comp.id), { initialProps: { live: s } });
  act(() => {
    expect(hook.result.current.push({ type: "UpdateAudioClips", clips: [{ clipId: clip.id, fields: { ...audioClipFieldsOf(clip), muted: true } }] })).toBeNull();
  });
  return { ...hook, s, clip };
}
it("own take changes rebase a nonempty draft automatically without losing redo", async () => {
  const h = setup();
  const own = mustApply(h.s, { type: "UpdateAudioClips", clips: [{ clipId: h.clip.id, fields: { ...audioClipFieldsOf(h.clip), name: "New take" } }] });
  act(() => {
    h.result.current.markOwnWrite({ before: h.s, after: own, affected: [h.clip.id] });
    h.rerender({ live: own });
  });
  await waitFor(() => expect(h.result.current.view.audioClips[h.clip.id]).toMatchObject({ muted: true, name: "New take" }));
  expect(h.result.current.conflicts).toEqual([]);
  act(() => h.result.current.undo());
  expect(h.result.current.view.audioClips[h.clip.id]).toMatchObject({ muted: false, name: "New take" });
  const later = { ...own, project: { ...own.project, revision: own.project.revision + 1 } };
  act(() => h.rerender({ live: later }));
  await waitFor(() => expect(h.result.current.canRedo).toBe(true));
  act(() => h.result.current.redo());
  expect(h.result.current.view.audioClips[h.clip.id]).toMatchObject({ muted: true, name: "New take" });
});
it("an own write plus a coalesced foreign change to the draft field stays conflicted", async () => {
  const h = setup();
  const own = mustApply(h.s, { type: "UpdateAudioClips", clips: [{ clipId: h.clip.id, fields: { ...audioClipFieldsOf(h.clip), name: "New take" } }] });
  const ownClip = own.audioClips[h.clip.id];
  if (!ownClip) throw new Error("Missing own clip");
  const foreign = mustApply(own, { type: "UpdateAudioClips", clips: [{ clipId: h.clip.id, fields: { ...audioClipFieldsOf(ownClip), muted: true } }] });
  act(() => {
    h.result.current.markOwnWrite({ before: h.s, after: own, affected: [h.clip.id] });
    h.rerender({ live: foreign });
  });
  await waitFor(() => expect(h.result.current.conflicts).toEqual([h.clip.id]));
  expect(h.result.current.draft.base).toBe(h.s);
});