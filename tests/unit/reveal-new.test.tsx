// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { readFileSync } from "node:fs";
import { useRevealNew } from "@/app/shared/reveal";

function Strip({ ids, focus = null }: { ids: string[]; focus?: string | null }) {
  const ref = useRef<HTMLUListElement | null>(null);
  const flash = useRevealNew(ref, ids, focus);
  return <ul ref={ref}>{ids.map((id) => <li key={id} data-reveal-id={id} data-revealed={flash === id ? "true" : undefined}>{id}</li>)}</ul>;
}

describe("nye resultater rulles inn i synet og markeres", () => {
  it("en ny versjon rulles inn i synet og markeres kort", () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const { rerender, container } = render(<Strip ids={["a", "b"]} />);
    expect(spy).not.toHaveBeenCalled();
    rerender(<Strip ids={["a", "b", "c"]} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.contexts[0]).toBe(container.querySelector('[data-reveal-id="c"]'));
    expect(container.querySelector('[data-revealed="true"]')?.textContent).toBe("c");
  });
  it("versjonen fra lenken (?version=) rulles inn i synet ved åpning", () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const { container } = render(<Strip ids={["a", "b", "c"]} focus="a" />);
    expect(spy.mock.contexts[0]).toBe(container.querySelector('[data-reveal-id="a"]'));
  });
  it("versjonsstripen i biblioteket bryter linjen i stedet for å gjemme resultater utenfor kanten", () => {
    const src = readFileSync("src/app/library/AssetDetail.tsx", "utf8");
    const strip = src.slice(src.indexOf('data-testid="version-strip"'), src.indexOf('data-testid="version-strip"') + 120);
    expect(strip).toContain("flex-wrap");
    expect(strip).not.toContain("overflow-x-auto");
  });
});
