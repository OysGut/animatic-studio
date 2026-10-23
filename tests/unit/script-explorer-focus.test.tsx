import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScriptExplorerPanel } from "@/app/script-explorer/ScriptExplorerPanel";

// Visningsvalg (nettleser + konto) erstattes med et minnelager i testene
const uiStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/app/account/ui-prefs", async () => {
  const React = await import("react");
  return { useUiPref: <T,>(key: string, fallback: T) => { const [v, setV] = React.useState<T>(uiStore.has(key) ? (uiStore.get(key) as T) : fallback); return [v, (n: T) => { uiStore.set(key, n); setV(n); }]; } };
});
vi.mock("@/app/auth/use-session", () => ({ useSession: () => ({ status: "signed-in", session: { user: { id: "user", email: "" } } }) }));
vi.mock("@/app/shell/pane-size", () => ({ useStoredNumber: () => [null, vi.fn()] }));
vi.mock("@/app/shell/current-scene", () => ({ sourceWindowId: () => "source" }));
vi.mock("@/app/shell/workspace-chrome", () => ({ ToolbarButton: (props: React.ComponentProps<"button">) => <button {...props} /> }));
vi.mock("@/app/script-explorer/ScriptExplorer", () => ({ ScriptExplorer: () => <input data-testid="script-explorer-search" /> }));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.useRealTimers(); });

function setup() {
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  const onClose = vi.fn();
  const view = render(<StrictMode><ScriptExplorerPanel projectId="project" onClose={onClose} /></StrictMode>);
  return { ...view, button, onClose };
}

describe("script explorer focus and Escape", () => {
  it("focuses search after mounting in StrictMode and restores the original focus on close", () => {
    const { button, unmount } = setup();
    expect(document.activeElement).toBe(button);
    act(() => { vi.advanceTimersByTime(32); });
    expect(document.activeElement).toBe(screen.getByTestId("script-explorer-search"));
    unmount();
    expect(document.activeElement).toBe(button);
    act(() => { vi.runAllTimers(); });
    expect(document.activeElement).toBe(button);
  });
  it("closes on Escape even when focus remains on the opening button", () => {
    const { onClose, button } = setup();
    fireEvent.keyDown(button, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("does not close for a prevented Escape", () => {
    const { onClose } = setup();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });
  it.each(["modal", "popper"])("does not close while a %s is open, including Escape inside the popup", (kind) => {
    const { onClose } = setup();
    const overlay = document.createElement("div");
    if (kind === "modal") { overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); }
    else overlay.setAttribute("data-radix-popper-content-wrapper", "");
    document.body.append(overlay);
    fireEvent.keyDown(screen.getByTestId("script-explorer-search"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
  it.each(["input", "textarea", "contenteditable"])("does not close when another %s has focus", (kind) => {
    const { onClose } = setup();
    const field = document.createElement(kind === "contenteditable" ? "div" : kind);
    if (kind === "contenteditable") { field.setAttribute("contenteditable", "true"); field.tabIndex = 0; }
    document.body.append(field);
    field.focus();
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
  it("closes on Escape in its own search field", () => {
    const { onClose } = setup();
    act(() => { vi.advanceTimersByTime(32); });
    fireEvent.keyDown(screen.getByTestId("script-explorer-search"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});