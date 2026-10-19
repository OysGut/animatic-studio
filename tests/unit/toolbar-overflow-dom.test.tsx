import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Toolbar, ToolbarButton, ToolbarGroup } from "@/app/shell/workspace-chrome";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("Toolbar overflow=menu without overflow mounts no Radix menu", () => {
  const { container } = render(
    <Toolbar overflow="menu">
      <ToolbarGroup><ToolbarButton>A</ToolbarButton></ToolbarGroup>
      <ToolbarGroup><ToolbarButton>B</ToolbarButton></ToolbarGroup>
    </Toolbar>,
  );
  expect(document.querySelector("[data-radix-menu-content]")).toBeNull();
  expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[aria-haspopup]')).toBeNull();
  expect(container.textContent).toContain("A");
  expect(container.textContent).toContain("B");
});
