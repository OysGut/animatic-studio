import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IconButton } from "@/app/shell/workspace-chrome";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("does not open on programmatic focus even when focus-visible matches", () => {
  render(<IconButton label="Images" />);
  const button = screen.getByRole("button");
  vi.spyOn(button, "matches").mockReturnValue(true);
  act(() => button.focus());
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it.each([false, true])("opens only on Tab focus (shift=%s) and leaves Escape untouched", (shiftKey) => {
  const handler = vi.fn();
  render(<div onKeyDown={handler}><IconButton label="Images" /></div>);
  fireEvent.keyDown(document.body, { key: "Tab", shiftKey });
  act(() => screen.getByRole("button").focus());
  expect(screen.getByRole("tooltip")).toBeTruthy();
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => screen.getByRole("button").dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("closes on any key without preventing or stopping it", () => {
  const handler = vi.fn();
  render(<div onKeyDown={handler}><IconButton label="Images" /></div>);
  fireEvent.keyDown(document.body, { key: "Tab" });
  act(() => screen.getByRole("button").focus());
  expect(screen.getByRole("tooltip")).toBeTruthy();
  const event = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
  act(() => screen.getByRole("button").dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("tooltip")).toBeNull();
});