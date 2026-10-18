import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AssetStudio } from "@/app/asset-studio/AssetStudio";
import type { Commands } from "@/app/project/use-commands";
import { fixture } from "../visual/fixture-state";
import { createDraft, pushDraft, layerFieldsOf } from "@/core";

vi.mock("@/app/library/asset-images", () => ({ useImageUrls: () => ({ data: {} }) }));
vi.mock("@/app/audio/use-audio-playback", () => ({ useAudioPlayback: vi.fn() }));
vi.mock("@/app/scene-editor/use-playback", () => ({ usePlayback: () => ({ frame: 0, playing: false, toggle: vi.fn(), seek: vi.fn() }) }));
vi.mock("@/app/mobile/MobileImportDialog", () => ({ MobileCameraButton: () => null }));
vi.mock("@/app/asset-studio/StudioPreview", () => ({ StudioPreview: () => null }));
vi.mock("@/app/asset-studio/VariantStrip", () => ({ VariantStrip: () => null }));
vi.mock("@/app/asset-studio/ObjectTimeline", () => ({ ObjectTimeline: () => null }));
vi.mock("@/app/asset-studio/StudioAudioTracks", () => ({ StudioAudioTracks: () => null, muteDraftCommand: vi.fn() }));
vi.mock("@/app/asset-studio/StudioScript", () => ({ StudioScript: () => null }));
vi.mock("@/app/scene-editor/LayerImageDialog", async () => {
  const { Dialog, DialogContent, DialogTitle, DialogDescription } = await import("@/components/ui/dialog");
  return { LayerImageDialog: ({ open, onOpenChange, onCloseAutoFocus }: {
    open: boolean; onOpenChange: (open: boolean) => void; onCloseAutoFocus?: (event: Event) => void;
  }) => <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="image-tools-dialog" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogTitle>Image tools</DialogTitle><DialogDescription>Fixture</DialogDescription>
    </DialogContent>
  </Dialog> };
});

afterEach(() => { cleanup(); document.body.replaceChildren(); });

function setup() {
  const state = fixture.state;
  const layer = Object.values(state.layers).find((l) => !l.removed);
  const composition = layer ? state.compositions[layer.compositionId] : undefined;
  const occurrence = Object.values(state.occurrences).find((o) => o.variantId === composition?.variantId);
  if (!layer || !composition || !occurrence) throw new Error("Missing studio fixture");
  const draft = pushDraft(createDraft(state, occurrence.id, composition.id), {
    type: "UpdateLayers", layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), opacity: 0.5 } }],
  });
  if (!draft.ok) throw new Error(draft.message);
  const onClose = vi.fn();
  // Start with a real, nonempty draft; only the media dialog's costly contents are replaced.
  vi.spyOn(draftHook, "useAssetStudioDraft").mockReturnValue({
    draft: draft.draft, view: draft.draft.state, empty: false, canUndo: true, canRedo: false,
    conflicts: [], push: vi.fn(), undo: vi.fn(), redo: vi.fn(), replace: vi.fn(), markOwnWrite: vi.fn(),
  });
  render(<StrictMode><AssetStudio projectId={state.project.id} state={state}
    cmds={{ current: () => state } as Commands} composition={composition}
    occurrenceId={occurrence.id} productionId={occurrence.productionId} layerId={layer.id}
    editable audioEditable authorName="" audioOf={() => []} onClose={onClose} /></StrictMode>);
  return { onClose };
}

import * as draftHook from "@/app/asset-studio/use-asset-studio-draft";
afterEach(() => vi.restoreAllMocks());

it("restores the image tools opener after Escape and confirms cancellation on the next Escape", async () => {
  const { onClose } = setup();
  const opener = screen.getByTestId("asset-studio-images");
  opener.focus();
  fireEvent.click(opener);
  await screen.findByTestId("image-tools-dialog");
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryByTestId("image-tools-dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(opener));
  expect(screen.queryByTestId("asset-studio-cancel-confirm")).toBeNull();
  // Reproduce a lost focus even after the dialog's restoration has finished.
  opener.blur();
  expect(document.activeElement).toBe(document.body);
  fireEvent.keyDown(document.body, { key: "Escape" });
  await screen.findByTestId("asset-studio-cancel-confirm");
  expect(onClose).not.toHaveBeenCalled();
});

it("does not cancel the studio while a subdialog is topmost, even with focus on body", async () => {
  setup();
  fireEvent.click(screen.getByTestId("asset-studio-images"));
  await screen.findByTestId("image-tools-dialog");
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(screen.queryByTestId("asset-studio-cancel-confirm")).toBeNull();
});