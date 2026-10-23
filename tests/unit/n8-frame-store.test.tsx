/** N8 (REQ-0210-rest): gjeldende bilde ligger i et lite lager; bare delene som abonnerer, tegnes per bilde. */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createFrameStore, FrameValue, useFrame, usePlayback, usePlaybackStore, type Playback } from "@/app/scene-editor/use-playback";

afterEach(cleanup);
const FPS = { num: 24, den: 1 };

function harness() {
  const count = { workspace: 0, playhead: 0, buttons: 0, timecode: 0 };
  let pb: Playback | null = null;
  function Buttons({ playback }: { playback: Playback }) {
    count.buttons++;
    // Knappene leser bildet bare i tilbakekall, ikke ved tegning
    return <button onClick={() => playback.setFrame(playback.frame + 1)}>+1</button>;
  }
  function Playhead({ playback }: { playback: Playback }) {
    const f = useFrame(playback);
    count.playhead++;
    return <i data-testid="playhead" data-frame={f} />;
  }
  function Workspace() {
    const playback = usePlaybackStore(240, FPS, false);
    pb = playback;
    count.workspace++;
    return (
      <div>
        <Buttons playback={playback} />
        <Playhead playback={playback} />
        <FrameValue playback={playback}>{(f) => { count.timecode++; return <b data-testid="tc">{f}</b>; }}</FrameValue>
      </div>
    );
  }
  const view = render(<Workspace />);
  return { view, count, pb: () => pb! };
}

describe("N8: bildelager", () => {
  it("60 bilder tegner bare avspillingshodet og tidskoden, ikke arbeidsflaten eller knappene", () => {
    const h = harness();
    const base = { ...h.count };
    for (let f = 1; f <= 60; f++) act(() => h.pb().setFrame(f));
    expect(h.count.workspace - base.workspace).toBe(0);
    expect(h.count.buttons - base.buttons).toBe(0);
    expect(h.count.playhead - base.playhead).toBe(60);
    expect(h.count.timecode - base.timecode).toBe(60);
    expect(h.view.getByTestId("playhead").getAttribute("data-frame")).toBe("60");
    expect(h.view.getByTestId("tc").textContent).toBe("60");
  });

  it("frame leses fra lageret i tilbakekall, så knappene ikke bruker et gammelt bilde", () => {
    const h = harness();
    act(() => h.pb().setFrame(10));
    act(() => h.view.getByText("+1").click());
    expect(h.pb().frame).toBe(11);
    expect(h.view.getByTestId("tc").textContent).toBe("11");
  });

  it("bildet holdes innenfor varigheten", () => {
    const h = harness();
    act(() => h.pb().setFrame(999));
    expect(h.pb().frame).toBe(239);
    act(() => h.pb().setFrame(-5));
    expect(h.pb().frame).toBe(0);
  });

  it("selector tegner bare når den avledede verdien endres", () => {
    const store = createFrameStore(0);
    let renders = 0;
    function AtStart() { const v = useFrame({ store }, (f) => f === 0); renders++; return <span>{String(v)}</span>; }
    render(<AtStart />);
    const base = renders;
    act(() => { for (let f = 1; f <= 30; f++) store.set(f); });
    expect(renders - base).toBe(1);
  });

  it("usePlayback (andre visninger) tegner fortsatt per bilde, som før N8", () => {
    let renders = 0;
    let p: Playback | null = null;
    function Other() { p = usePlayback(240, FPS, false); renders++; return <span>{p.frame}</span>; }
    render(<Other />);
    const base = renders;
    for (let f = 1; f <= 5; f++) act(() => p!.setFrame(f));
    expect(renders - base).toBe(5);
    expect(p!.frame).toBe(5);
  });
});
