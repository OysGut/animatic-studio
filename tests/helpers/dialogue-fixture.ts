/** DV2: fixtur med én replikk som har tre opptak (takes) i en lydvariant. Delt av enhets- og egenskapstester. */
import { applyCommand, audioClipFieldsOf, type Command, type ProjectState } from "@/core";
import { envelope } from "./fixtures";
import { fixture } from "../visual/fixture-state";

export const dvId = (n: number) => `01900000-0000-7000-8000-0060${String(n).padStart(8, "0")}`;
const id = dvId;
function apply(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r;
}

/** Fixturen med en replikk som har lydfil i en variant og tre opptak (takes) av samme replikk. */
export function dvBase(): { s: ProjectState; clipId: string; takes: string[] } {
  let s = fixture.state;
  const clip = Object.values(s.audioClips).find((c) => !c.removed && c.kind === "dialogue" && c.blockId)!;
  const variantId = id(1);
  s = apply(s, { type: "CreateAssetVariant", variantId: variantId as never, assetId: clip.assetId, fields: { name: "Takes", style: "other", appearance: "" } }).state;
  const takes = [id(2), id(3), id(4)];
  takes.forEach((v, i) => {
    s = apply(s, { type: "AddAssetVersion", versionId: v as never, variantId: variantId as never, media: { path: `${s.project.id}/${clip.assetId}/${v}/t${i}.webm`, mimeType: "audio/webm", width: null, height: null, byteSize: 100 + i, sha256: String(i + 1).repeat(64), durationMs: 6000 }, note: "" }).state;
  });
  // Første take blir replikkens lyd (eksisterende lydflyt: UpdateAudioClips med ny fil)
  s = apply(s, { type: "UpdateAudioClips", clips: [{ clipId: clip.id, fields: { ...audioClipFieldsOf(s.audioClips[clip.id]!), assetVariantId: variantId as never, versionId: takes[0] as never } }] }).state;
  return { s, clipId: clip.id, takes };
}

