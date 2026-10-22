/** N5 (REQ-0210-rest): deler som ikke avhenger av bildet, tegnes ikke på nytt for hvert bilde under avspilling. */
import { Profiler, useState } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FrameFrozen, sameFrozenProps } from "@/app/scene-editor/frame-frozen";

afterEach(cleanup);

function Heavy({ label }: { label: string }) {
  return <span>{label}</span>;
}

function harness() {
  let renders = 0;
  let api: { tick: () => void; setPlaying: (p: boolean) => void; setLabel: (l: string) => void } | null = null;
  function Workspace() {
    const [frame, setFrame] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [label, setLabel] = useState("a");
    api = { tick: () => setFrame((f) => f + 1), setPlaying, setLabel };
    return (
      <div data-frame={frame}>
        <FrameFrozen frozen={playing} deps={[label]}>
          <Profiler id="heavy" onRender={() => { renders++; }}>
            <Heavy label={label} />
          </Profiler>
        </FrameFrozen>
      </div>
    );
  }
  const view = render(<Workspace />);
  return { view, api: () => api!, renders: () => renders };
}

describe("FrameFrozen", () => {
  it("60 bilder under avspilling gir høyst én rendring av tunge deler (tak per bilde)", () => {
    const h = harness();
    const before = h.renders();
    for (let i = 0; i < 60; i++) act(() => h.api().tick());
    expect(h.renders() - before).toBeLessThanOrEqual(1);
  });

  it("endret avhengighet rendres straks, også under avspilling (uendret oppførsel)", () => {
    const h = harness();
    act(() => h.api().setLabel("b"));
    expect(h.view.container.textContent).toBe("b");
  });

  it("uten avspilling rendres alt som før", () => {
    const h = harness();
    act(() => h.api().setPlaying(false));
    const before = h.renders();
    for (let i = 0; i < 5; i++) act(() => h.api().tick());
    expect(h.renders() - before).toBe(5);
  });

  it("sammenligningen fryser bare når begge rendringer er under avspilling", () => {
    expect(sameFrozenProps({ children: null, frozen: false, deps: [1] }, { children: null, frozen: true, deps: [1] })).toBe(false);
    expect(sameFrozenProps({ children: null, frozen: true, deps: [1] }, { children: null, frozen: true, deps: [1] })).toBe(true);
    expect(sameFrozenProps({ children: null, frozen: true, deps: [1] }, { children: null, frozen: true, deps: [2] })).toBe(false);
  });
});
