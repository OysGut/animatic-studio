/** ID-merket (Øystein 23.10): kort kode, skjult for skjermleser, ikke markerbart, Alt + klikk kopierer. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiId, uiIdLabel, useUiIdCopy } from "@/app/shared/UiId";
import { UI_IDS } from "@/app/ui-ids";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const known = UI_IDS.find((e) => e.status === "aktiv")!.id;

function Copier() { useUiIdCopy(); return <UiId id={known} />; }

describe("UiId", () => {
  it("viser «V-nnn · commit» fra registeret, med «dev» uten byggets commit", () => {
    render(<UiId id={known} />);
    const el = screen.getByTestId("ui-id");
    expect(el.textContent).toBe(`${known} · dev`);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toContain("select-none");
    expect(el.className).toContain("pointer-events-none");
    expect(el.className).toContain("text-[10px]");
  });
  it("et ukjent nummer merkes med spørsmålstegn", () => {
    expect(uiIdLabel("V-999")).toBe("V-999? · dev");
  });
  it("Alt + klikk kopierer koden; vanlig klikk gjør ingenting", () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<Copier />);
    const el = screen.getByTestId("ui-id");
    document.elementsFromPoint = () => [el];
    fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(document.body, { clientX: 5, clientY: 5, altKey: true });
    expect(writeText).toHaveBeenCalledWith(`${known} · dev`);
  });
  it("felles DialogContent viser merket når uiId er satt", () => {
    render(<Dialog open><DialogContent uiId={known}><DialogTitle>x</DialogTitle><DialogDescription>y</DialogDescription></DialogContent></Dialog>);
    expect(screen.getByTestId("ui-id").dataset["uiId"]).toBe(known);
  });
});
