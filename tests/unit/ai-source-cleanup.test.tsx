/** KI-207: opprydding av gamle AI-videokilder – størrelser vises, og brukeren velger filene selv. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSourceCleanup } from "@/app/ai/AiSourceCleanup";

const preview = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
vi.mock("@/adapters/ai/source-cleanup.functions", () => ({
  previewAiSourceCleanup: preview,
  confirmAiSourceCleanup: confirm,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

const FILES = [
  { path: "p/temp/ai-source/test-old.mp4", bytes: 100 },
  { path: "p/temp/ai-source/test-big.mp4", bytes: 3 * 1024 * 1024 },
];

beforeEach(() => {
  preview.mockResolvedValue(FILES);
  confirm.mockResolvedValue({ deleted: 1 });
});
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.clearAllMocks(); });

async function open() {
  render(<AiSourceCleanup projectId="p" />);
  fireEvent.click(screen.getByRole("button", { name: /Rydd/i }));
  await waitFor(() => screen.getByRole("alertdialog"));
}

describe("KI-207: størrelser og eget utvalg ved opprydding", () => {
  it("viser hver fil med størrelse og totalsummen", async () => {
    await open();
    expect(screen.getByText("test-old.mp4")).toBeTruthy();
    expect(screen.getByText("test-big.mp4")).toBeTruthy();
    expect(screen.getAllByText("3 MB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("ai-cleanup-total").textContent).toContain("3 MB");
    expect(screen.getAllByTestId("ai-cleanup-select")).toHaveLength(2);
  });

  it("sletter bare de valgte filene", async () => {
    await open();
    const small = document.querySelector<HTMLInputElement>('[data-testid="ai-cleanup-select"][data-path$="test-old.mp4"]')!;
    fireEvent.click(small);
    expect(screen.getByTestId("ai-cleanup-total").textContent).toContain("3 MB");
    fireEvent.click(screen.getByRole("button", { name: "Slett for godt" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]![0]).toEqual({ data: { projectId: "p", paths: ["p/temp/ai-source/test-big.mp4"] } });
  });

  it("kan ikke slettes når ingenting er valgt", async () => {
    await open();
    for (const box of screen.getAllByTestId("ai-cleanup-select")) fireEvent.click(box);
    expect((screen.getByRole("button", { name: "Slett for godt" }) as HTMLButtonElement).disabled).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("avbryt sletter ingenting", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(confirm).not.toHaveBeenCalled();
  });
});
