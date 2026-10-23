/** N10: axe-core i jsdom for tidsnavigatoren (ingen nestede kontroller) og tastaturstyring med piltaster. */
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, expect, it, vi } from "vitest";
import { TimeNavigator } from "@/app/scene-editor/animation/TimeNavigator";

afterEach(cleanup);

it("tidsnavigatoren har ingen axe-avvik og ingen kontroller inni glideren", async () => {
  const { container } = render(createElement(TimeNavigator, { duration: 100, window: { from: 10, span: 20 }, onChange: () => {} }));
  const res = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(res.violations.map((v) => v.id)).toEqual([]);
  const slider = container.querySelector('[data-testid="anim-navigator"]')!;
  expect(slider.querySelector("button, [tabindex]")).toBeNull();
  expect(container.querySelectorAll('[role="slider"]').length).toBe(3);
});

it("piltaster flytter vinduet og kantene uten mus", () => {
  const onChange = vi.fn();
  const { getByTestId } = render(createElement(TimeNavigator, { duration: 100, window: { from: 10, span: 20 }, onChange }));
  fireEvent.keyDown(getByTestId("anim-navigator"), { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith({ from: 11, span: 20 });
  fireEvent.keyDown(getByTestId("anim-navigator-to"), { key: "ArrowRight" });
  expect(onChange.mock.calls.at(-1)![0].span).toBe(21);
});
